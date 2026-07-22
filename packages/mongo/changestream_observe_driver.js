import { Meteor } from 'meteor/meteor';
import { LocalCollection } from 'meteor/minimongo';
import { Random } from 'meteor/random';
import { MongoID } from 'meteor/mongo-id';
import { DDPServer } from 'meteor/ddp-server';
import { DiffSequence } from 'meteor/diff-sequence';
import { listenAll } from './mongo_driver';
import { replaceTypes, replaceMongoAtomWithMeteor, replaceMeteorAtomWithMongo } from './mongo_common';
import { compareOperationTimes } from './mongo_common';

const SUPPORTED_OPERATIONS = ['insert', 'update', 'replace', 'delete'];

/**
 * ChangeStreamObserveDriver - MongoDB Change Streams based observe driver
 *
 * Uses MongoDB Change Streams to watch for real-time changes to a collection.
 * Implements a stop callback system similar to PollingObserveDriver for proper
 * resource cleanup when the driver is stopped.
 */
export class ChangeStreamObserveDriver {
  constructor(options) {
    this._usesChangeStreams = true;
    this._cursorDescription = options.cursorDescription;
    this._mongoHandle = options.mongoHandle;
    this._multiplexer = options.multiplexer;
    this._sharedStream = null;
    this._stopped = false;
    this._stopCallbacks = [];
    this._pendingWrites = [];
    this._writesToCommitWhenReady = [];
    this._isReady = false;
    this._lastProcessedOperationTime = null;
    this._catchingUpResolvers = [];
    this._resolveTimeout = null;
    this._matcher = options.matcher;
    this._id = options.id || Random.id();

    // Projection function similar to oplog driver.
    //
    // `doc` is expected to already be Meteor-typed: native BSON is translated
    // to Meteor types once at each path boundary (_sendInitialAdds for the
    // snapshot, _handleChange for live change events) before any doc reaches
    // the projection, the matcher or the multiplexer. Translating here as well
    // would just re-walk an already-converted document.
    const projection = this._cursorDescription.options.projection || this._cursorDescription.options.fields;
    if (projection) {
      const baseProjectionFn = LocalCollection._compileProjection(projection);
      this._projectionFn = (doc) => {
        const projected = baseProjectionFn(doc);
        if (projected && typeof projected === 'object') {
          const { _id, ...fields } = projected;
          return fields;
        }
        return projected;
      };
    } else {
      this._projectionFn = (doc) => {
        const { _id, ...fields } = doc;
        return fields;
      };
    }

    this._startListening();
    this._startWatching();
  }

  _sendMultiplexerAdded(id, projectedDoc) {
    // projectedDoc is already Meteor-typed — its caller translated the source
    // document at the path boundary (see the _projectionFn comment above).
    try {
      this._multiplexer.added(id, projectedDoc);
    } catch (error) {
      console.error('[ChangeStreams] Error sending added document:', error);
    }
  }

  async _startListening() {

    // Register a listener to be notified when writes happen
    // This follows the same pattern as OplogObserveDriver
    const stopHandle = await listenAll(
      this._cursorDescription,
      () => {
        // If we're not in a pre-fire write fence, we don't have to do anything.
        const fence = DDPServer._getCurrentFence();
        if (!fence || fence.fired)
          return;

        if (fence._changeStreamObserveDrivers) {
          fence._changeStreamObserveDrivers[this._id] = this;
          return;
        }

        fence._changeStreamObserveDrivers = {};
        fence._changeStreamObserveDrivers[this._id] = this;

        fence.onBeforeFire(async () => {
          const drivers = fence._changeStreamObserveDrivers;
          delete fence._changeStreamObserveDrivers;

          // Process each driver that needs to be synchronized with the fence
          for (const driver of Object.values(drivers)) {
            if (driver._stopped) continue;

            const write = await fence.beginWrite();

            // Wait for the change stream to catch up with any pending operations.
            // Pass the fence explicitly: fence.fire() runs outside the
            // AsyncLocalStorage context, so DDPServer._getCurrentFence() would
            // return undefined here and miss the fence._csTargetTs annotation.
            await driver._waitUntilCaughtUp(fence);

            // The driver may have been stopped while we were parked in
            // _waitUntilCaughtUp (stop() drains the waiter so we don't hang —
            // meteor/meteor#14452). Once stopped, neither branch below can be
            // trusted to release this write: the multiplexer is being torn
            // down, and a push to _writesToCommitWhenReady can race stop()'s
            // own drain of that array and be lost. Commit directly so the
            // fence still fires.
            if (driver._stopped) {
              await write.committed();
              continue;
            }

            // Process any pending writes immediately
            driver._flushPendingWrites();

            // If the driver is ready (initial adds complete), ensure all writes are committed
            if (driver._isReady) {
              await driver._multiplexer.onFlush(async () => {
                await write.committed();
              });
            } else {
              // If not ready yet, queue the write for later
              driver._writesToCommitWhenReady.push(write);
            }
          }
          // Release the per-collection write-timestamp map now that every
          // driver on this fence has caught up. The fence object is about
          // to be discarded, but clearing explicitly prevents any stray
          // read of a now-stale target.
          delete fence._csTargetTsByCollection;
        });
      }
    );

    // Register the stop handle
    this._addStopCallback(() => stopHandle.stop());
  }



  _addStopCallback(callback) {
    if (typeof callback !== 'function') {
      throw new Error('Stop callback must be a function');
    }
    this._stopCallbacks.push(callback);
  }

  async _startWatching() {

    if (this._stopped) return;

    try {

      const collection = this._mongoHandle.rawCollection(this._cursorDescription.collectionName);

      // Subscribe to the shared per-collection stream. addDriver() resolves once
      // it's open; from then events dispatch here via _onChange and queue in
      // _pendingWrites until ready, so writes during the snapshot below are
      // captured and replayed (_handleInsert dedupes overlaps with the snapshot).
      this._sharedStream = this._mongoHandle._acquireSharedChangeStream(
        this._cursorDescription.collectionName
      );
      await this._sharedStream.addDriver(this);

      if (this._stopped) return;

      // Now read the snapshot. Events that arrived while we were getting
      // here are sitting in _pendingWrites and will be flushed below.
      await this._sendInitialAdds(collection);

      // Mark ready so _flushPendingWrites lets the queued change events
      // through (it short-circuits when !_isReady to avoid calling
      // multiplexer.changed/removed before ready()).
      this._multiplexer.ready();
      this._isReady = true;

      // Replay change events that arrived during _sendInitialAdds BEFORE
      // committing fence writes. _handleInsert dedups against the multiplexer
      // cache so events that overlap with the snapshot don't double-emit.
      // Commit order matters: ObserveMultiplexer.onFlush below waits for the
      // queue to drain, so client `added`/`changed` reach handles before the
      // fence's `updated` message — without this, clients see `updated`
      // without the corresponding data and stub-reverts wipe the local view.
      this._flushPendingWrites();
      await this._flushWritesToCommit();

    } catch (error) {
      console.error('Failed to start ChangeStream:', error);
      // Make sure the multiplexer is ready'd even on failure — without this
      // the publication's _readyPromise never resolves, the subscription
      // never sends `ready` to the client, and any test that polls
      // sub.ready() (e.g. `livedata - methods with nested stubs`) hangs
      // its setup block to the testAsyncMulti timeout.
      try {
        if (!this._multiplexer._ready()) {
          await this._multiplexer.ready();
        }
      } catch (_) { /* ready() throws if already ready; ignore */ }
      // Drain any writes that were queued by onBeforeFire while
      // _startWatching was in flight. Without this, the fences holding those
      // writes never fire and any DDP method that triggered them hangs.
      this._isReady = true;
      try { await this._flushWritesToCommit(); } catch (_) { /* ignore */ }
      throw error;
    }
  }

  async _sendInitialAdds(collection) {
    if (this._stopped) return;

    try {
      // Build the same selector and options that the cursor would use
      const selector = replaceTypes(
        this._cursorDescription.selector || {},
        replaceMeteorAtomWithMongo
      );
      const options = { ...this._cursorDescription.options };

      // Find all existing documents
      const cursor = collection.find(selector, options);

      // Follow oplog driver pattern: get current fence and store write for later commit
      const fence = DDPServer._getCurrentFence();
      if (fence) {
        this._writesToCommitWhenReady.push(fence.beginWrite());
      }

      // Send 'added' for each existing document that matches our matcher
      let docCount = 0;
      for await (const rawDoc of cursor) {
        if (this._stopped) return;
        // The native driver yields BSON-typed docs. Translate once here so the
        // projection and the multiplexer only ever see Meteor types — the same
        // boundary _handleChange establishes for live change events.
        const doc = replaceTypes(rawDoc, replaceMongoAtomWithMeteor);
        const id = typeof doc._id !== 'string' ? new MongoID.ObjectID(doc._id.toHexString()) : doc._id;
        const projectedDoc = this._projectionFn ? this._projectionFn(doc) : doc;
        this._sendMultiplexerAdded(id, projectedDoc);
        docCount++;
      }

      // DON'T call ready() or flush here - let _startWatching handle it

    } catch (error) {
      console.error('Error sending initial adds for ChangeStream:', error);
      // We may have already pushed a fence write above; commit it so the
      // fence isn't deadlocked. _startWatching's catch will run too, but
      // _flushWritesToCommit drains the array, so the second call is a no-op.
      // Multiplexer.ready() is handled in _startWatching's catch.
      this._isReady = true;
      try { await this._flushWritesToCommit(); } catch (_) { /* ignore */ }
      throw error;
    }
  }

  // Called by the shared stream for every raw change. The shared stream owns the
  // resume token, so this just advances our processed time, runs the matcher,
  // and flushes pending writes.
  _onChange(change) {
    if (this._stopped) return;

    // Update last processed op time early so fences can unblock promptly.
    if (change && change.clusterTime) {
      this._setLastProcessedOperationTime(change.clusterTime);
    }
    this._handleChange(change);

    const fence = DDPServer._getCurrentFence();
    if (fence && !fence.fired) {
      this._flushPendingWrites();
    } else {
      Meteor.defer(() => {
        if (!this._stopped) {
          this._flushPendingWrites();
        }
      });
    }
  }

  async _handleChange(change) {
    if (this._stopped) return;

    const { operationType, documentKey, clusterTime } = change;

    if (!SUPPORTED_OPERATIONS.includes(operationType)) {
      return; // Ignore unsupported operations
    }

    const fullDocument = replaceTypes(change.fullDocument, replaceMongoAtomWithMeteor);
    const fullDocumentBeforeChange = replaceTypes(
      change.fullDocumentBeforeChange,
      replaceMongoAtomWithMeteor
    );

    let id = documentKey._id;
    if (typeof documentKey._id?.toHexString === 'function') {
      id = new MongoID.ObjectID(documentKey._id.toHexString());
    }

    // Update last processed operation time (redundant with early update, but safe)
    if (clusterTime) {
      this._setLastProcessedOperationTime(clusterTime);
    }

    // Store callback to be executed later when fence processes writes
    // Don't try to capture fence here - it will be handled in onBeforeFire
    const callbackData = {
      operationType,
      id,
      fullDocument,
      fullDocumentBeforeChange,
      change
    };

    this._pendingWrites.push(callbackData);
  }

  _setLastProcessedOperationTime(ts) {
    this._lastProcessedOperationTime = ts;
    // Resolve any waiters whose target is <= current processed time
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

  async _flushPendingWrites() {
    // Hold off processing until the multiplexer has had its `ready()` call.
    // We open the change stream before _sendInitialAdds so events emitted
    // during the snapshot are not lost — those events sit here until the
    // driver is ready, and _startWatching's tail flush replays them.
    // ObserveMultiplexer.changed / removed throw if called before ready.
    if (!this._isReady) return;

    const callbacksToFlush = this._pendingWrites;
    this._pendingWrites = [];

    if (callbacksToFlush.length > 0) {
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
  }

  async _flushWritesToCommit() {
    // Similar to oplog driver's _beSteady method
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

    // Dedup against the cache: opening the change stream before
    // _sendInitialAdds means a doc inserted between watch() and the snapshot
    // read is reported by both. Without this guard we would emit `added`
    // twice for the same id, and ObserveMultiplexer / publication views
    // assume each id is added exactly once.
    if (this._multiplexer?._cache?.docs?.has?.(id)) {
      this._handleUpdate(id, doc, null);
      return;
    }

    const projectedDoc = this._projectionFn ? this._projectionFn(doc) : doc;
    this._sendMultiplexerAdded(id, projectedDoc);
  }

  _handleUpdate(id, newDoc, oldDoc) {
    // Determine which state (before/after) matches the cursor selector
    const matchesAfter = this._matcher.documentMatches(newDoc || {}).result;

    // Use the multiplexer cache (now updated synchronously) to check if we've seen this doc
    const cachedDoc = this._multiplexer?._cache?.docs.get(id);
    const matchesBefore = oldDoc
      ? (this._matcher.documentMatches(oldDoc).result)
      : !!cachedDoc;

    if (matchesAfter) {
      if (!matchesBefore) {
        // Document wasn't previously in the result set and now matches – emit added
        const projectedDoc = this._projectionFn ? this._projectionFn(newDoc) : newDoc;
        this._sendMultiplexerAdded(id, projectedDoc);
        return;
      }

      if (newDoc) {
        // Compute the changed fields using the available pre-image or the cached doc
        const oldDocForDiff = oldDoc || (cachedDoc ? { ...cachedDoc } : null);
        if (oldDocForDiff) {
          const projectedNew = this._projectionFn ? this._projectionFn(newDoc) : newDoc;
          const projectedOld = this._projectionFn ? this._projectionFn(oldDocForDiff) : oldDocForDiff;
          const changedFields = DiffSequence.makeChangedFields(projectedNew, projectedOld);

          if (Object.keys(changedFields).length > 0) {
            // changedFields is derived from already-translated docs via the
            // projection, so it is already Meteor-typed.
            this._multiplexer.changed(id, changedFields);
          }
          return;
        }

        // Without a pre-image we can't diff reliably; fall back to sending full doc
        const projectedDoc = this._projectionFn ? this._projectionFn(newDoc) : newDoc;
        this._multiplexer.changed(id, projectedDoc);
      }
      return;
    }

    if (matchesBefore) {
      // Document left the result set
      this._multiplexer.removed(id);
    }
    // Otherwise the document didn't match before or after, so no-op
  }

  _handleDelete(id) {
    if (this._multiplexer._cache?.docs.has(id)) {
      this._multiplexer.removed(id);
    }
  }

  // Reconcile our result set with the current collection contents after the
  // shared change stream lost its resume history: events during the lost window
  // were never delivered, so the multiplexer cache may hold stale documents.
  // The live-event handlers are all cache-guarded, so reusing them here means a
  // document concurrently redelivered by the reopened cursor is reconciled once
  // rather than double-emitted.
  async _resyncAfterHistoryLost() {
    if (this._stopped || !this._isReady) return;

    const collection = this._mongoHandle.rawCollection(
      this._cursorDescription.collectionName
    );
    const selector = replaceTypes(
      this._cursorDescription.selector || {},
      replaceMeteorAtomWithMongo
    );
    const options = { ...this._cursorDescription.options };

    // Re-add or update every currently-matching document, tracking which ids
    // are still present so the rest can be removed below.
    const present = new Set();
    const cursor = collection.find(selector, options);
    for await (const rawDoc of cursor) {
      if (this._stopped) return;
      const doc = replaceTypes(rawDoc, replaceMongoAtomWithMeteor);
      const id = typeof doc._id !== 'string'
        ? new MongoID.ObjectID(doc._id.toHexString())
        : doc._id;
      present.add(MongoID.idStringify(id));
      this._handleInsert(id, doc);
    }

    if (this._stopped) return;

    // Anything still cached but no longer returned by the query left the result
    // set while the stream was disconnected — emit the removals.
    const removedIds = [];
    this._multiplexer._cache?.docs.forEach((cachedDoc, cachedId) => {
      if (!present.has(MongoID.idStringify(cachedId))) {
        removedIds.push(cachedId);
      }
    });
    for (const id of removedIds) {
      if (this._stopped) return;
      this._handleDelete(id);
    }
  }

  async _waitUntilCaughtUp(fenceOverride) {
    // Wait until our change stream has processed events up to the
    // server's current operation time. Mirrors oplog's wait logic.
    if (this._stopped) return;

    // The fence's write path stamps the exact clusterTime of each write on
    // fence._csTargetTsByCollection[collectionName] (see
    // mongo_connection._annotateFenceWithWriteTs). Wait specifically for
    // that ts. The fence must be passed explicitly because fence.fire()
    // runs outside the AsyncLocalStorage context where _getCurrentFence()
    // would find it.
    //
    // If there is no annotation for our collection, there is no specific
    // write to wait for and we return immediately. Asking the server for
    // its current operationTime here would chase a moving target — the
    // server's clock advances with replication heartbeats, but our stream
    // only sees events emitted on this collection, so the wait would never
    // resolve under the previous (no-timeout) regime.
    const fence = fenceOverride || DDPServer._getCurrentFence();
    const { collectionName } = this._cursorDescription;
    const { _csTargetTsByCollection } = fence || {};
    const targetTs = _csTargetTsByCollection && collectionName ? _csTargetTsByCollection[collectionName] : undefined;

    if (!targetTs) {
      return;
    }

    if (this._lastProcessedOperationTime && compareOperationTimes(this._lastProcessedOperationTime, targetTs) >= 0) {
      return;
    }

    // Insert in order so we can resolve from the front efficiently
    let insertIdx = this._catchingUpResolvers.length;
    while (insertIdx - 1 >= 0 && compareOperationTimes(this._catchingUpResolvers[insertIdx - 1]?.ts, targetTs) > 0) {
      insertIdx--;
    }

    const entry = { ts: targetTs, resolver: null };

    // Wait until our change stream has actually delivered an event with
    // clusterTime >= targetTs. Mirrors OplogHandle._waitUntilCaughtUp: the
    // wait has no upper bound — releasing early causes the fence to fire
    // before the change has been applied to the multiplexer, which surfaces
    // as the client receiving `updated` without the corresponding
    // `added`/`changed`/`removed` (e.g. `livedata - method updated message
    // with subscriptions` failing with "Should receive CHANGED message").
    //
    // Liveness is guaranteed by:
    //   1. The shared change stream resuming from its resume token on
    //      error/close, so events missed while reconnecting are replayed and
    //      our lastProcessedOperationTime still advances to target.
    //   2. The watchdog below logging if the wait stalls past warnMs, which
    //      makes a genuinely-broken stream visible without masking it.
    const warnMs = Meteor?.settings?.packages?.mongo?.changeStream?.waitUntilCaughtUpWarnMs ?? 10000;

    const waitStartedAt = Date.now();
    let warnCount = 0;

    // Periodic watchdog: re-fires every warnMs so we can see whether a wait
    // is making progress (lastProcessedOperationTime advancing) or genuinely
    // stuck.
    const dumpDiagnostics = () => {
      warnCount += 1;
      console.error(
        `Meteor: change stream catching up took too long`,
        {
          driverId: this._id,
          collectionName,
          targetTs,
          lastProcessedOperationTime: this._lastProcessedOperationTime,
          stopped: this._stopped,
          isReady: this._isReady,
          changeStreamOpen: !!(this._sharedStream && this._sharedStream._changeStream),
          resumeTokenPresent: !!(this._sharedStream && this._sharedStream._resumeToken),
          pendingWritesCount: this._pendingWrites.length,
          writesToCommitWhenReadyCount: this._writesToCommitWhenReady.length,
          catchingUpResolversCount: this._catchingUpResolvers.length,
          waitedMs: Date.now() - waitStartedAt,
          warnCount,
        }
      );
    };

    let warnTimeoutId = setTimeout(function tick() {
      dumpDiagnostics();
      // Re-arm so we keep dumping state every warnMs while the wait is stuck.
      // Without this we only ever see the first snapshot and can't tell whether
      // the stream made any progress before the test gave up.
      warnTimeoutId = setTimeout(tick, warnMs);
    }, warnMs);

    await new Promise((resolve) => {
      entry.resolver = () => {
        clearTimeout(warnTimeoutId);
        if (warnCount > 0) {
          console.error(
            // When stop() drains this resolver the stream never reached
            // targetTs — say so rather than claiming we caught up, so the logs
            // reflect that the wait was released by teardown (#14452).
            this._stopped
              ? `Meteor: change stream wait released because observer stopped`
              : `Meteor: change stream caught up after warn`,
            {
              driverId: this._id,
              collectionName,
              targetTs,
              waitedMs: Date.now() - waitStartedAt,
              warnCount,
            }
          );
        }
        resolve();
      };
      this._catchingUpResolvers.splice(insertIdx, 0, entry);
    });
  }

  async stop() {
    if (this._stopped) return;

    this._stopped = true;

    // Release any fence waiters still parked in _waitUntilCaughtUp before we
    // close the change stream below. Those resolvers are waiting for an event
    // with clusterTime >= targetTs, but once the stream is closed that event
    // will never arrive, so leaving them parked hangs the fence's
    // onBeforeFire (which awaits _waitUntilCaughtUp) forever — the DDP method
    // that issued the write never gets its `updated` message and the client
    // call hangs until timeout (meteor/meteor#14452). Resolve (don't reject):
    // the fence may carry writes from other, still-healthy drivers, and the
    // continuation just commits this driver's already-begun write so the fence
    // can fire. The driver is being torn down, so not reaching targetTs on it
    // is harmless — its handles are gone.
    const pendingCatchUp = this._catchingUpResolvers;
    this._catchingUpResolvers = [];
    for (const entry of pendingCatchUp) {
      try {
        entry.resolver();
      } catch (e) {
        // ignore resolver errors
      }
    }

    // Execute all stop callbacks
    for (const callback of this._stopCallbacks) {
      try {
        await callback();
      } catch (error) {
        console.error('Error in stop callback:', error);
      }
    }

    // Detach from the shared stream. It closes the underlying cursor (and drops
    // itself from the connection registry) once its last driver leaves.
    if (this._sharedStream) {
      try {
        await this._sharedStream.removeDriver(this);
      } catch (error) {
        console.error('Error detaching from shared change stream:', error);
      }
      this._sharedStream = null;
    }

    // Handle any remaining pending writes (following oplog driver pattern)
    for (const write of this._pendingWrites) {
      if (!write || typeof write.committed !== 'function') continue;
      await write.committed();
    }
    this._pendingWrites = [];

    // Handle any remaining writes to commit
    for (const write of this._writesToCommitWhenReady) {
      await write.committed();
    }
    this._writesToCommitWhenReady = [];

    // Clear callbacks array
    this._stopCallbacks = [];
  }
}
