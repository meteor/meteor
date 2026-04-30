import { Meteor } from 'meteor/meteor';
import { LocalCollection } from 'meteor/minimongo';
import { Random } from 'meteor/random';
import { MongoID } from 'meteor/mongo-id';
import { DDPServer } from 'meteor/ddp-server';
import { DiffSequence } from 'meteor/diff-sequence';
import { listenAll } from './mongo_driver';
import { replaceTypes, replaceMongoAtomWithMeteor } from './mongo_common';
import { compareOperationTimes } from './mongo_common';

const SUPPORTED_OPERATIONS = ['insert', 'update', 'replace', 'delete'];

// Restart backoff: 100ms, 200ms, 400ms, 800ms, 1.6s, 3.2s, 5s (capped).
// Resets on a successful re-open.
const RESTART_DELAY_BASE_MS = 100;
const RESTART_DELAY_MAX_MS = 5000;

/**
 * ChangeStreamObserveDriver - MongoDB Change Streams based observe driver.
 *
 * Lifecycle is split into three explicit operations:
 *   _start()        — runs once. Registers the fence listener, sends initial
 *                     adds, opens the first cursor.
 *   _openCursor()   — opens (or re-opens) the change stream cursor. May be
 *                     called with a resume token to pick up where a previous
 *                     cursor left off.
 *   _closeCursor()  — detaches listeners and closes the cursor. Idempotent.
 *   _restartCursor()— close + backoff + open(resumeToken). No-op when stopped
 *                     or invalidated.
 *
 * Critical invariants:
 *   - Listeners are bound once in the constructor so they have stable
 *     references usable by both .on() and .removeListener().
 *   - _sendInitialAdds() runs exactly once per driver lifetime; restarts
 *     resume from the last seen resume token rather than refetching state.
 *   - An 'invalidate' change event is terminal: the driver flips
 *     _invalidated and stops, so a dropped collection cannot drive a
 *     restart loop.
 */
export class ChangeStreamObserveDriver {
  constructor(options) {
    this._usesChangeStreams = true;
    this._cursorDescription = options.cursorDescription;
    this._mongoHandle = options.mongoHandle;
    this._multiplexer = options.multiplexer;
    this._matcher = options.matcher;
    this._id = options.id || Random.id();

    this._stopped = false;
    this._invalidated = false;
    this._isReady = false;
    this._changeStream = null;
    this._lastResumeToken = null;
    this._lastProcessedOperationTime = null;
    this._listenStopHandle = null;
    this._restartAttempt = 0;
    this._restartTimer = null;

    this._pendingWrites = [];
    this._writesToCommitWhenReady = [];
    this._catchingUpResolvers = [];

    const projection = this._cursorDescription.options.projection || this._cursorDescription.options.fields;
    if (projection) {
      const baseProjectionFn = LocalCollection._compileProjection(projection);
      this._projectionFn = (doc) => {
        const projected = baseProjectionFn(replaceTypes(doc, replaceMongoAtomWithMeteor));
        if (projected && typeof projected === 'object') {
          const { _id, ...fields } = projected;
          return fields;
        }
        return projected;
      };
    } else {
      this._projectionFn = (doc) => {
        const { _id, ...fields } = replaceTypes(doc, replaceMongoAtomWithMeteor);
        return fields;
      };
    }

    // Stable references — required for removeListener() during cursor swap.
    // bindEnvironment wraps once; .bind(this) ensures `this` resolves
    // through the closure rather than the EventEmitter receiver.
    this._onChange = Meteor.bindEnvironment(this._onChangeImpl.bind(this));
    this._onError = Meteor.bindEnvironment(this._onErrorImpl.bind(this));
    this._onClose = Meteor.bindEnvironment(this._onCloseImpl.bind(this));
    this._onWrite = this._onWriteImpl.bind(this);

    // Mirror previous behavior of kicking off start without awaiting; the
    // multiplexer.ready() call inside _start() is the readiness signal.
    this._start().catch((error) => {
      console.error(`[ChangeStream ${this._id}] failed to start:`, error);
    });
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async _start() {
    if (this._stopped) return;

    try {
      const collection = this._mongoHandle.rawCollection(this._cursorDescription.collectionName);

      // Capture the cluster time BEFORE the snapshot read so the first
      // cursor can be opened with startAtOperationTime. Without this there
      // is a race window between _sendInitialAdds finishing and watch()
      // establishing the cursor during which any write on this collection
      // emits a change event the stream never sees — leaving fence waiters
      // blocked on a clusterTime that will never arrive. Best-effort: if
      // the ping fails we fall back to mongo's default of "now".
      let startAtOperationTime;
      try {
        const pingRes = await this._mongoHandle.db.command({ ping: 1 });
        startAtOperationTime = pingRes?.operationTime;
      } catch (_) { /* best-effort */ }

      // Register the fence listener and send initial adds in parallel: neither
      // depends on the other and both must complete before the multiplexer is
      // marked ready.
      const [stopHandle] = await Promise.all([
        listenAll(this._cursorDescription, this._onWrite),
        this._sendInitialAdds(collection),
      ]);

      if (this._stopped) {
        try { await stopHandle.stop(); } catch { /* ignore */ }
        return;
      }
      this._listenStopHandle = stopHandle;

      // Signal initial adds are complete. _isReady stays false until the
      // cursor is actually attached so fence writes don't commit through a
      // gap where events would be lost.
      this._multiplexer.ready();

      await this._openCursor(null, startAtOperationTime);
      this._isReady = true;
      await this._flushWritesToCommit();
    } catch (error) {
      // If init fails we still need to release any fence writes that were
      // queued in _writesToCommitWhenReady — otherwise the publication's
      // _readyPromise never resolves, the subscription never sends `ready`
      // to the client, and any test that polls sub.ready() hangs to its
      // testAsyncMulti timeout.
      try {
        if (!this._multiplexer._ready()) {
          await this._multiplexer.ready();
        }
      } catch (_) { /* ready() throws if already ready; ignore */ }
      this._isReady = true;
      try { await this._flushWritesToCommit(); } catch (_) { /* ignore */ }
      throw error;
    }
  }

  async _openCursor(resumeToken, startAtOperationTime) {
    if (this._stopped || this._invalidated) return;

    const collection = this._mongoHandle.rawCollection(this._cursorDescription.collectionName);
    const opts = {
      fullDocument: 'updateLookup',
      fullDocumentBeforeChange: 'whenAvailable',
    };
    if (resumeToken) {
      opts.resumeAfter = resumeToken;
    } else if (startAtOperationTime) {
      // Replay events from the captured ts forward so writes that landed
      // between the ping and the cursor establishment are not silently
      // dropped. Skipped on resume — the prior token already pins the start.
      opts.startAtOperationTime = startAtOperationTime;
    }

    const stream = collection.watch(this._buildPipeline(), opts);
    stream.on('change', this._onChange);
    stream.on('error', this._onError);
    stream.on('close', this._onClose);

    this._changeStream = stream;
    this._restartAttempt = 0;
  }

  async _closeCursor() {
    const stream = this._changeStream;
    this._changeStream = null;
    if (!stream) return;
    stream.removeListener('change', this._onChange);
    stream.removeListener('error', this._onError);
    stream.removeListener('close', this._onClose);
    try { await stream.close(); } catch { /* idempotent */ }
  }

  async _restartCursor() {
    if (this._stopped || this._invalidated) return;
    if (this._restartTimer) return;

    await this._closeCursor();
    if (this._stopped || this._invalidated) return;

    this._restartAttempt += 1;
    const delay = Math.min(
      RESTART_DELAY_BASE_MS * 2 ** (this._restartAttempt - 1),
      RESTART_DELAY_MAX_MS
    );

    await new Promise((resolve) => {
      this._restartTimer = setTimeout(resolve, delay);
    });
    this._restartTimer = null;

    if (this._stopped || this._invalidated) return;

    try {
      await this._openCursor(this._lastResumeToken);
    } catch (error) {
      // Resume token expired or stream cannot be re-opened. Treat as
      // terminal rather than spinning: a fresh observer with a fresh
      // initial fetch is the user-recoverable path.
      this._invalidated = true;
      console.error(`[ChangeStream ${this._id}] resume failed:`, error);
    }
  }

  // -------------------------------------------------------------------------
  // Event handlers (bound in constructor)
  // -------------------------------------------------------------------------

  _onChangeImpl(change) {
    if (this._stopped) return;

    if (change?._id) this._lastResumeToken = change._id;

    if (change?.operationType === 'invalidate') {
      // Collection dropped/renamed — the cursor is terminally dead. Stop
      // ourselves so the close event that follows doesn't schedule a
      // restart against a non-existent collection.
      this._invalidated = true;
      this.stop().catch((error) => {
        console.error(`[ChangeStream ${this._id}] stop() during invalidate failed:`, error);
      });
      return;
    }

    if (change?.clusterTime) this._setLastProcessedOperationTime(change.clusterTime);
    this._handleChange(change);

    const fence = DDPServer._getCurrentFence();
    if (fence && !fence.fired) {
      this._flushPendingWrites();
    } else {
      Meteor.defer(() => {
        if (!this._stopped) this._flushPendingWrites();
      });
    }
  }

  _onErrorImpl(error) {
    if (this._stopped || this._invalidated) return;
    console.error(`[ChangeStream ${this._id}] error:`, error);
    this._restartCursor().catch((restartError) => {
      console.error(`[ChangeStream ${this._id}] restart failed:`, restartError);
    });
  }

  _onCloseImpl() {
    if (this._stopped || this._invalidated) return;
    this._restartCursor().catch((error) => {
      console.error(`[ChangeStream ${this._id}] restart failed:`, error);
    });
  }

  _onWriteImpl() {
    const fence = DDPServer._getCurrentFence();
    if (!fence || fence.fired) return;

    if (fence._changeStreamObserveDrivers) {
      fence._changeStreamObserveDrivers[this._id] = this;
      return;
    }

    fence._changeStreamObserveDrivers = {};
    fence._changeStreamObserveDrivers[this._id] = this;

    fence.onBeforeFire(async () => {
      const drivers = fence._changeStreamObserveDrivers;
      delete fence._changeStreamObserveDrivers;

      for (const driver of Object.values(drivers)) {
        if (driver._stopped) continue;

        const write = await fence.beginWrite();

        // Pass the fence explicitly: fence.fire() runs outside the
        // AsyncLocalStorage context, so DDPServer._getCurrentFence()
        // would return undefined here and miss the per-collection
        // target timestamp annotation.
        await driver._waitUntilCaughtUp(fence);
        driver._flushPendingWrites();

        if (driver._isReady) {
          await driver._multiplexer.onFlush(async () => {
            await write.committed();
          });
        } else {
          driver._writesToCommitWhenReady.push(write);
        }
      }
      delete fence._csTargetTsByCollection;
    });
  }

  // -------------------------------------------------------------------------
  // Initial fetch + change processing
  // -------------------------------------------------------------------------

  async _sendInitialAdds(collection) {
    if (this._stopped) return;

    try {
      const selector = this._cursorDescription.selector || {};
      const options = { ...this._cursorDescription.options };

      const cursor = collection.find(selector, options);

      const fence = DDPServer._getCurrentFence();
      if (fence) {
        this._writesToCommitWhenReady.push(fence.beginWrite());
      }

      for await (const doc of cursor) {
        if (this._stopped) return;
        const id = typeof doc._id !== 'string' ? new MongoID.ObjectID(doc._id.toHexString()) : doc._id;
        const projectedDoc = this._projectionFn ? this._projectionFn(doc) : doc;
        this._sendMultiplexerAdded(id, projectedDoc);
      }
    } catch (error) {
      console.error('Error sending initial adds for ChangeStream:', error);
      throw error;
    }
  }

  _sendMultiplexerAdded(id, projectedDoc) {
    projectedDoc = replaceTypes(projectedDoc, replaceMongoAtomWithMeteor);
    try {
      this._multiplexer.added(id, projectedDoc);
    } catch (error) {
      console.error('[ChangeStreams] Error sending added document:', error);
    }
  }

  _buildPipeline() {
    // Always return an empty pipeline so mongo delivers EVERY change event
    // (including drop, invalidate, create, modify, rename, ...). Per-event
    // type filtering happens in _handleChange via SUPPORTED_OPERATIONS.
    //
    // Why not filter server-side: events filtered out by the pipeline never
    // reach our on('change') handler, so _setLastProcessedOperationTime
    // does not advance for their clusterTime. Meanwhile the fence write
    // path annotates _csTargetTsByCollection with session.operationTime,
    // which advances on every cluster operation — so the wait could pin
    // to a clusterTime that this stream's _lastProcessedOperationTime can
    // never reach. Observed in CI as a `users` driver stuck on
    // {t:T, i:25} while seeing only up to {t:T, i:15}, blocking
    // removeUserByUsername forever.
    //
    // Per-document selector filtering still happens in _handleChange via
    // the matcher; promoting that into the pipeline is a separate
    // optimization that would have to coexist with always-deliver
    // semantics.
    return [];
  }

  async _handleChange(change) {
    if (this._stopped) return;

    const { operationType, documentKey, fullDocument, fullDocumentBeforeChange, clusterTime } = change;

    if (!SUPPORTED_OPERATIONS.includes(operationType)) {
      return;
    }

    let id = documentKey._id;
    if (typeof documentKey._id?.toHexString === 'function') {
      id = new MongoID.ObjectID(documentKey._id.toHexString());
    }

    if (clusterTime) {
      this._setLastProcessedOperationTime(clusterTime);
    }

    this._pendingWrites.push({
      operationType,
      id,
      fullDocument,
      fullDocumentBeforeChange,
      change,
    });
  }

  _setLastProcessedOperationTime(ts) {
    this._lastProcessedOperationTime = ts;
    while (this._catchingUpResolvers.length > 0) {
      const first = this._catchingUpResolvers[0];
      if (compareOperationTimes(ts, first.ts) >= 0) {
        this._catchingUpResolvers.shift();
        try { first.resolver(); } catch (e) { /* ignore resolver errors */ }
      } else {
        break;
      }
    }
  }

  async _getServerOperationTime() {
    const db = this._mongoHandle.db;
    const admin = db.admin();

    const commands = [
      () => db.command({ ping: 1 }),
      () => admin.command({ hello: 1 }),
      () => admin.command({ ismaster: 1 }),
    ];

    const runCommandRecursive = async (index = 0) => {
      if (index >= commands.length) return null;

      try {
        const res = await commands[index]();
        return res?.operationTime || res?.$clusterTime?.clusterTime || null;
      } catch (error) {
        if (!error) return false;
        const isUnsupportedCommandError = error.code === 59;
        if (isUnsupportedCommandError) return runCommandRecursive(index + 1);
        throw error;
      }
    };

    try {
      return await runCommandRecursive();
    } catch (error) {
      console.error(`[ChangeStream ${this._id}] Failed to fetch server operation time:`, error);
      return null;
    }
  }

  async _flushPendingWrites() {
    const callbacksToFlush = this._pendingWrites;
    this._pendingWrites = [];

    if (callbacksToFlush.length === 0) return;

    for (const callbackData of callbacksToFlush) {
      try {
        const { operationType, id, fullDocument, fullDocumentBeforeChange, change } = callbackData;

        switch (operationType) {
          case 'insert':
            this._handleInsert(id, fullDocument);
            break;
          case 'update':
          case 'replace':
            this._handleUpdate(id, fullDocument, fullDocumentBeforeChange);
            break;
          case 'delete':
            this._handleDelete(id, change);
            break;
        }
      } catch (error) {
        console.error(`[ChangeStream ${this._id}] Error processing callback:`, error);
      }
    }
  }

  async _flushWritesToCommit() {
    const writes = this._writesToCommitWhenReady;
    this._writesToCommitWhenReady = [];

    if (writes.length > 0) {
      await this._multiplexer.onFlush(async () => {
        for (const write of writes) {
          await write.committed();
        }
      });
    }
  }

  _handleInsert(id, doc) {
    const matches = this._matcher.documentMatches(doc).result;
    if (!matches) return;

    // Dedup against the snapshot. The cursor is opened with
    // startAtOperationTime set to a ping timestamp captured BEFORE
    // _sendInitialAdds, so any insert that lands during the snapshot is
    // replayed through the stream. Without this guard the multiplexer
    // would receive a second `added` for a doc the snapshot already
    // delivered, breaking observer state.
    if (this._multiplexer?._cache?.docs.has(id)) return;

    const projectedDoc = this._projectionFn ? this._projectionFn(doc) : doc;
    this._sendMultiplexerAdded(id, projectedDoc);
  }

  _handleUpdate(id, newDoc, oldDoc) {
    const matchesAfter = this._matcher.documentMatches(newDoc || {}).result;

    const cachedDoc = this._multiplexer?._cache?.docs.get(id);
    const matchesBefore = oldDoc
      ? (this._matcher.documentMatches(oldDoc).result)
      : !!cachedDoc;

    if (matchesAfter) {
      if (!matchesBefore) {
        const projectedDoc = this._projectionFn ? this._projectionFn(newDoc) : newDoc;
        this._sendMultiplexerAdded(id, projectedDoc);
        return;
      }

      if (newDoc) {
        const oldDocForDiff = oldDoc || (cachedDoc ? { ...cachedDoc } : null);
        if (oldDocForDiff) {
          const projectedNew = this._projectionFn ? this._projectionFn(newDoc) : newDoc;
          const projectedOld = this._projectionFn ? this._projectionFn(oldDocForDiff) : oldDocForDiff;
          const changedFields = DiffSequence.makeChangedFields(projectedNew, projectedOld);

          if (Object.keys(changedFields).length > 0) {
            const transformedDoc = replaceTypes(changedFields, replaceMongoAtomWithMeteor);
            this._multiplexer.changed(id, transformedDoc);
          }
          return;
        }

        const projectedDoc = this._projectionFn ? this._projectionFn(newDoc) : newDoc;
        const transformedDoc = replaceTypes(projectedDoc, replaceMongoAtomWithMeteor);
        this._multiplexer.changed(id, transformedDoc);
      }
      return;
    }

    if (matchesBefore) {
      this._multiplexer.removed(id);
    }
  }

  _handleDelete(id) {
    if (this._multiplexer._cache?.docs.has(id)) {
      this._multiplexer.removed(id);
    }
  }

  async _waitUntilCaughtUp(fenceOverride) {
    if (this._stopped) return;

    // Prefer the exact clusterTime of the write(s) that triggered this fence,
    // when the write path annotated it on the fence (see
    // mongo_connection._annotateFenceWithWriteTs). Falls back to asking the
    // server for its current operationTime, which races ahead of the write's
    // ts and historically caused every fence to wait the full timeout.
    // Target is looked up per-collection: this driver only observes events
    // from its own collection, so waiting on a ts from a different
    // collection's write would always time out.
    const fence = fenceOverride || DDPServer._getCurrentFence();
    const { collectionName } = this._cursorDescription;
    const { _csTargetTsByCollection } = fence || {};
    let targetTs = _csTargetTsByCollection && collectionName ? _csTargetTsByCollection[collectionName] : undefined;
    if (!targetTs) {
      targetTs = await this._getServerOperationTime();
    }

    if (!targetTs) {
      await new Promise((r) => setImmediate(r));
      return;
    }

    if (this._lastProcessedOperationTime && compareOperationTimes(this._lastProcessedOperationTime, targetTs) >= 0) {
      return;
    }

    let insertIdx = this._catchingUpResolvers.length;
    while (insertIdx - 1 >= 0 && compareOperationTimes(this._catchingUpResolvers[insertIdx - 1]?.ts, targetTs) > 0) {
      insertIdx--;
    }

    let timeoutId = null;
    const entry = { ts: targetTs, resolver: null };

    // Safety valve only — under steady-state load the change event arrives
    // in single-digit ms. The timeout exists so a missed/lost event can't
    // hang the fence forever. 1000ms gives tight-loop method tests
    // (250-iter insert/update/remove) headroom over the per-event
    // dispatch latency without making real failures unbearable.
    // Override via Meteor.settings.packages.mongo.changeStream.waitUntilCaughtUpTimeoutMs.
    const timeoutMs = Meteor?.settings?.packages?.mongo?.changeStream?.waitUntilCaughtUpTimeoutMs ?? 1000;

    await new Promise((resolve) => {
      entry.resolver = () => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve();
      };

      this._catchingUpResolvers.splice(insertIdx, 0, entry);

      timeoutId = setTimeout(() => {
        const idx = this._catchingUpResolvers.indexOf(entry);
        if (idx !== -1) this._catchingUpResolvers.splice(idx, 1);
        resolve();
      }, timeoutMs);
    });
  }

  async stop() {
    if (this._stopped) return;
    this._stopped = true;

    if (this._restartTimer) {
      clearTimeout(this._restartTimer);
      this._restartTimer = null;
    }

    if (this._listenStopHandle) {
      try { await this._listenStopHandle.stop(); } catch { /* ignore */ }
      this._listenStopHandle = null;
    }

    await this._closeCursor();

    for (const write of this._pendingWrites) {
      if (!write || typeof write.committed !== 'function') continue;
      await write.committed();
    }
    this._pendingWrites = [];

    for (const write of this._writesToCommitWhenReady) {
      await write.committed();
    }
    this._writesToCommitWhenReady = [];
  }
}
