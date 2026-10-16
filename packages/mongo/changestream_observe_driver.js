import { Meteor } from 'meteor/meteor';
import { LocalCollection } from 'meteor/minimongo';
import { Random } from 'meteor/random';
import { MongoID } from 'meteor/mongo-id';
import { DDPServer } from 'meteor/ddp-server';
import { DiffSequence } from 'meteor/diff-sequence';
import { listenAll } from './mongo_driver';
import { replaceTypes, replaceMongoAtomWithMeteor, replaceMeteorAtomWithMongo } from './mongo_common';
import { compareOperationTimes, fenceWriteTsKey } from './mongo_common';
import { ObserveWindow } from './observe_window';

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
    this._snapshotCutoffOperationTime = null;
    this._catchingUpResolvers = [];
    this._resolveTimeout = null;
    this._matcher = options.matcher;
    this._id = options.id || Random.id();
    // While a history-lost resync runs, this holds the set of ids that live
    // events touched concurrently so the resync can let those events win instead
    // of racing them (see _resyncAfterHistoryLost / _flushPendingWrites).
    this._resyncLiveTouched = null;

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

    // A sorted, limited cursor keeps its first `limit` documents plus a buffer
    // of the next ones in an ObserveWindow, as the oplog driver does. Live
    // events feed the window; when it runs out of buffered documents it asks
    // for the query to be re-run (_requestRequery).
    this._window = null;
    this._requerying = false;
    this._requeryAgain = false;
    this._requeryPromise = null;
    const limit = this._cursorDescription.options.limit;
    if (limit) {
      const sorter = options.sorter;
      const windowProjection = projection || {};
      // Kept in memory: the published fields plus what the selector and sort read.
      this._sharedProjection = sorter.combineIntoProjection(
        this._matcher.combineIntoProjection(windowProjection)
      );
      this._window = new ObserveWindow({
        multiplexer: this._multiplexer,
        matcher: this._matcher,
        sorter,
        limit,
        cursorDescription: this._cursorDescription,
        projectionFn: LocalCollection._compileProjection(windowProjection),
        sharedProjectionFn: LocalCollection._compileProjection(this._sharedProjection),
        onNeedRequery: () => this._requestRequery(),
        // Before ready the initial query is still running.
        isQuerying: () => this._requerying || !this._isReady,
      });
    }

    this._startListening();
    this._startWatching();
  }

  // A limited cursor's window state, as OplogObserveDriver exposes it (tests).
  get _unpublishedBuffer() { return this._window && this._window._unpublishedBuffer; }
  get _safeAppendToBuffer() { return this._window && this._window._safeAppendToBuffer; }

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

            // A limited cursor may be re-running its query, possibly because
            // of this very write. Like the oplog driver, which commits only
            // once it is back in its steady phase, wait for the result to
            // reach the multiplexer before committing.
            while (driver._requeryPromise) {
              await driver._requeryPromise;
            }
            if (driver._stopped) {
              await write.committed();
              continue;
            }

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

      await this._runInitialSnapshot(collection);

      // Mark ready so _flushPendingWrites lets the queued change events
      // through (it short-circuits when !_isReady to avoid calling
      // multiplexer.changed/removed before ready()).
      this._multiplexer.ready();
      this._isReady = true;
      if (this._requeryAgain) {
        this._requestRequery();
      }

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

  async _runInitialSnapshot(collection) {
    const snapshot = await this._prepareSnapshotContext(collection);

    try {
      this._applySnapshotBoundary(snapshot);
      if (this._stopped) return;

      // Events that arrive during this read stay queued until the driver is
      // ready (or, for a re-query, until it finishes), then replay against
      // the completed snapshot.
      if (this._window) {
        await this._queryWindow(collection, snapshot);
      } else {
        await this._sendInitialAdds(collection, snapshot);
      }
    } finally {
      await this._closeSnapshotSession(snapshot.session);
    }
  }

  async _prepareSnapshotContext(collection) {
    const readPreference = this._cursorDescription.options.readPreference;
    const readPreferenceMode =
      (typeof readPreference === 'string' ? readPreference : readPreference?.mode)
      || collection.readPreference?.mode
      || 'primary';
    const readConcern = this._cursorDescription.options.readConcern;
    const readConcernLevel =
      (typeof readConcern === 'string' ? readConcern : readConcern?.level)
      || collection.readConcern?.level;

    if (
      readPreferenceMode !== 'primary' ||
      (readConcernLevel && !['local', 'majority'].includes(readConcernLevel))
    ) {
      return this._captureSnapshotBoundary();
    }

    const session = this._startSnapshotSession();
    if (!session) {
      return this._captureSnapshotBoundary();
    }

    if (readConcernLevel) {
      return this._captureSnapshotBoundary(session);
    }

    return this._resolveDefaultReadConcern(session);
  }

  _startSnapshotSession() {
    try {
      return this._mongoHandle.client.startSession({
        causalConsistency: true,
      });
    } catch (error) {
      Meteor._debug('Failed to create ChangeStream snapshot session:', error.message);
      return null;
    }
  }

  async _resolveDefaultReadConcern(session) {
    try {
      const response = await this._mongoHandle.client.db('admin').command(
        { getDefaultRWConcern: 1, inMemory: true },
        { session }
      );
      const readConcern = response.defaultReadConcern;

      if (!['local', 'majority'].includes(readConcern?.level)) {
        await this._closeSnapshotSession(session);
        if (response.operationTime) {
          return {
            session: null,
            operationTime: response.operationTime,
            readConcern,
          };
        }
        return this._captureSnapshotBoundary(null, readConcern);
      }

      if (!response.operationTime) {
        return this._captureSnapshotBoundary(session, readConcern);
      }

      return {
        session,
        operationTime: response.operationTime,
        readConcern,
      };
    } catch (error) {
      Meteor._debug('Failed to resolve ChangeStream snapshot read concern:', error.message);
      await this._closeSnapshotSession(session);
      return this._captureSnapshotBoundary();
    }
  }

  async _captureSnapshotBoundary(session = null, readConcern = null) {
    // The stream subscription is already active, so writes at or before this
    // operationTime were either dispatched before this driver joined or will
    // be represented by the initial snapshot.
    try {
      const pingRes = await this._mongoHandle.db.command(
        { ping: 1 },
        session ? { session } : undefined
      );
      return { session, operationTime: pingRes?.operationTime, readConcern };
    } catch (error) {
      Meteor._debug('Failed to establish ChangeStream caught-up floor:', error.message);
      // Best-effort: without the floor we only lose the fast-path release.
      return { session, operationTime: null, readConcern };
    }
  }

  _applySnapshotBoundary({ session, operationTime }) {
    if (!operationTime) return;

    // Only a snapshot causally tied to the boundary command can safely discard
    // events at or before its operationTime. Other snapshots replay them to
    // reconcile potentially stale data.
    if (session) {
      this._snapshotCutoffOperationTime = operationTime;
    }
    this._setLastProcessedOperationTime(operationTime);
  }

  async _closeSnapshotSession(snapshotSession) {
    if (!snapshotSession) return;

    try {
      await snapshotSession.endSession();
    } catch (error) {
      Meteor._debug('Failed to close ChangeStream snapshot session:', error.message);
    }
  }

  async _sendInitialAdds(collection, snapshot) {
    if (this._stopped) return;

    try {
      // Build the same selector and options that the cursor would use
      const selector = replaceTypes(
        this._cursorDescription.selector || {},
        replaceMeteorAtomWithMongo
      );
      const options = { ...this._cursorDescription.options };
      if (snapshot.session) {
        options.session = snapshot.session;
      }
      if (snapshot.readConcern) {
        options.readConcern = snapshot.readConcern;
      }

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
        const id = this._deriveMeteorId(doc);
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

  // Reads the first 2 * limit matching documents, publishes the first `limit`
  // and buffers the rest, as OplogObserveDriver._runQuery does.
  async _queryWindow(collection, snapshot) {
    if (this._stopped) return;

    const selector = replaceTypes(
      this._cursorDescription.selector || {},
      replaceMeteorAtomWithMongo
    );
    const { fields, ...cursorOptions } = this._cursorDescription.options;
    const limit = this._window._limit;
    const options = {
      ...cursorOptions,
      projection: this._sharedProjection,
      limit: limit * 2,
    };
    if (snapshot.session) {
      options.session = snapshot.session;
    }
    if (snapshot.readConcern) {
      options.readConcern = snapshot.readConcern;
    }

    // The initial query holds the fence's write until ready, like
    // _sendInitialAdds. Re-queries are awaited by onBeforeFire instead.
    if (!this._isReady) {
      const fence = DDPServer._getCurrentFence();
      if (fence) {
        this._writesToCommitWhenReady.push(fence.beginWrite());
      }
    }

    const newResults = new LocalCollection._IdMap;
    const newBuffer = new LocalCollection._IdMap;
    for await (const rawDoc of collection.find(selector, options)) {
      if (this._stopped) return;
      const doc = replaceTypes(rawDoc, replaceMongoAtomWithMeteor);
      doc._id = this._deriveMeteorId(doc);
      if (newResults.size() < limit) {
        newResults.set(doc._id, doc);
      } else {
        newBuffer.set(doc._id, doc);
      }
    }
    if (this._stopped) return;

    this._window._publishNewResults(newResults, newBuffer);
  }

  // Called by the window when it can no longer tell which documents come next.
  // Runs synchronously inside the window's update, so it only flags the
  // re-query (holding further events, see _flushPendingWrites) and starts it.
  _requestRequery() {
    if (this._stopped) return;
    this._requeryAgain = true;
    // The initial query is still being published; _startWatching runs the
    // re-query once the driver is ready.
    if (!this._isReady) return;
    this._requerying = true;
    if (!this._requeryPromise) {
      this._requeryPromise = this._runRequeries().finally(() => {
        this._requeryPromise = null;
      });
    }
  }

  async _runRequeries() {
    while (this._requeryAgain && !this._stopped) {
      this._requeryAgain = false;
      try {
        const collection = this._mongoHandle.rawCollection(
          this._cursorDescription.collectionName
        );
        // Same snapshot boundary as the initial query: events at or before
        // its operationTime are already in the result and are skipped.
        await this._runInitialSnapshot(collection);
      } catch (error) {
        console.error(`[ChangeStream ${this._id}] Re-running limited query failed:`, error);
      }
      if (this._stopped) return;
      this._requerying = false;
      // Replay the events held during the query. One of them may ask for
      // another re-query, which sets _requeryAgain and loops.
      this._flushPendingWrites();
    }
  }

  // Applies a change to a limited cursor's window. doc is null when the
  // document is gone (deleted, or deleted again before updateLookup read it).
  _handleWindowChange(operationType, id, fullDocument) {
    const doc = operationType === 'delete' || !fullDocument
      ? null
      : { ...fullDocument, _id: id };
    this._window._handleDoc(id, doc);
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
    // Resolve any waiters whose target is <= current processed time.
    //
    // A write that MongoDB applies as one batch (a multi-document delete, a
    // transaction) emits several events with the same clusterTime. Reaching a
    // waiter's ts exactly is only caught up once every event of that batch is
    // delivered, so wait while the stream still holds undelivered events: the
    // next one re-runs this check.
    const batchPending = () => this._sharedStream?.hasUndeliveredChanges?.() === true;
    while (this._catchingUpResolvers.length > 0) {
      const first = this._catchingUpResolvers[0];
      const cmp = compareOperationTimes(ts, first.ts);
      if (cmp > 0 || (cmp === 0 && !batchPending())) {
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
    // A limited cursor also holds events while it re-runs its query; they
    // replay against the new result (_runRequeries).
    if (!this._isReady || this._requerying) return;

    const callbacksToFlush = this._pendingWrites;
    this._pendingWrites = [];

    if (callbacksToFlush.length > 0) {
      for (let i = 0; i < callbacksToFlush.length; i++) {
        const callbackData = callbacksToFlush[i];
        // An event below made the window re-run its query: hold the rest.
        if (this._requerying) {
          this._pendingWrites = callbacksToFlush.slice(i).concat(this._pendingWrites);
          break;
        }
        try {
          const { operationType, id, fullDocument, fullDocumentBeforeChange, change } = callbackData;

          if (
            change?.clusterTime &&
            this._snapshotCutoffOperationTime &&
            compareOperationTimes(change.clusterTime, this._snapshotCutoffOperationTime) <= 0
          ) {
            continue;
          }

          if (this._window) {
            this._handleWindowChange(operationType, id, fullDocument);
            continue;
          }

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

          // While a history-lost resync is running, a live event is authoritative
          // for any id it SUCCESSFULLY applied — record it AFTER the handler so
          // the resync leaves that id alone (it must not re-add a live-deleted doc
          // nor remove a live-inserted one). Recording only on success means a
          // handler that threw still lets the resync perform the corrective pass.
          if (this._resyncLiveTouched) {
            this._resyncLiveTouched.add(MongoID.idStringify(id));
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
      await this._multiplexer.onFlush(() => {
        // Commit in a microtask instead of awaiting inside this queue task.
        // committed() on the fence's last outstanding write fires the fence,
        // and the fence's onBeforeFire handler re-enters this same multiplexer
        // queue via onFlush (see _startListening). Awaiting that chain from
        // inside the current queue task deadlocks the queue: the fire waits on
        // a task queued behind this one, which can never run. Deferring keeps
        // the ordering guarantee — commits still start only after the flush
        // point — without holding the queue while the fence fires.
        for (const write of writes) {
          Promise.resolve()
            .then(() => write.committed())
            .catch((error) => {
              console.error('ChangeStream deferred write commit failed:', error);
            });
        }
      });
    }
  }

  // A raw doc translated by replaceMongoAtomWithMeteor carries either a string
  // _id or a MongoID.ObjectID; normalize it to the id type the multiplexer keys
  // on. Mirrors how the live change path (_handleChange) derives ids: only wrap
  // when the id actually exposes toHexString, so a string (or any other id type)
  // passes through untouched instead of throwing.
  _deriveMeteorId(doc) {
    return typeof doc._id?.toHexString === 'function'
      ? new MongoID.ObjectID(doc._id.toHexString())
      : doc._id;
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
  //
  // The reopened cursor is already live by the time we run, so live events flow
  // into this same driver concurrently. Two rules keep that safe:
  //   1. Live events win. Any id a live event touches while we run is recorded in
  //      _resyncLiveTouched (see _flushPendingWrites) and left untouched here, so
  //      a doc inserted live after our query snapshot is never spuriously removed,
  //      and a doc deleted live is never re-added as a phantom.
  //   2. For everything else the live-event handlers are cache-guarded, so a doc
  //      the reopened cursor happens to redeliver is reconciled once, not twice.
  async _resyncAfterHistoryLost() {
    if (this._stopped || !this._isReady) return;

    // A limited cursor re-runs its query, which reconciles the whole window.
    if (this._window) {
      this._requestRequery();
      await this._requeryPromise;
      return;
    }

    const collection = this._mongoHandle.rawCollection(
      this._cursorDescription.collectionName
    );
    const selector = replaceTypes(
      this._cursorDescription.selector || {},
      replaceMeteorAtomWithMongo
    );
    // Fetch FULL documents: _handleInsert re-runs the matcher, which needs every
    // selector field, so a server-side projection that stripped one would wrongly
    // reject a genuinely matching doc (the live path never has this problem — it
    // matches the full fullDocument). Field filtering still happens locally via
    // _projectionFn. sort/skip/limit are irrelevant to this unordered, whole-
    // result reconciliation (skip/limit never reach a change-stream cursor).
    const {
      projection, fields, sort, limit, skip,
      ...options
    } = this._cursorDescription.options || {};

    // Publish the live-touched set for the duration of the resync so concurrent
    // live events (applied via _flushPendingWrites) win over our snapshot.
    const liveTouched = new Set();
    this._resyncLiveTouched = liveTouched;
    try {
      // Re-add or update every currently-matching document, tracking which ids
      // are still present so the rest can be removed below.
      const present = new Set();
      const cursor = collection.find(selector, options);
      for await (const rawDoc of cursor) {
        if (this._stopped) return;
        // Whole body guarded: a single malformed doc (bad id / translation) must
        // skip itself, not abort the reconciliation and leave removals unrun.
        try {
          const doc = replaceTypes(rawDoc, replaceMongoAtomWithMeteor);
          const id = this._deriveMeteorId(doc);
          const idStr = MongoID.idStringify(id);
          present.add(idStr);
          if (liveTouched.has(idStr)) continue;
          this._handleInsert(id, doc);
        } catch (error) {
          console.error(`[ChangeStream ${this._id}] resync add failed:`, error);
        }
      }

      if (this._stopped) return;

      // Anything still cached but no longer returned by the query left the result
      // set while the stream was disconnected — emit the removals. Skip ids a
      // live event already reconciled during the resync.
      const removedIds = [];
      this._multiplexer?._cache?.docs?.forEach?.((cachedDoc, cachedId) => {
        const idStr = MongoID.idStringify(cachedId);
        if (!present.has(idStr) && !liveTouched.has(idStr)) {
          removedIds.push(cachedId);
        }
      });
      for (const id of removedIds) {
        if (this._stopped) return;
        try {
          this._handleDelete(id);
        } catch (error) {
          console.error(`[ChangeStream ${this._id}] resync remove failed:`, error);
        }
      }
    } finally {
      // Only clear if still ours: a re-entrant resync should not happen (drivers
      // are resynced serially), but guard anyway so we never null a newer set.
      if (this._resyncLiveTouched === liveTouched) {
        this._resyncLiveTouched = null;
      }
    }
  }

  async _waitUntilCaughtUp(fenceOverride) {
    // Wait until our change stream has processed events up to the
    // server's current operation time. Mirrors oplog's wait logic.
    if (this._stopped) return;

    // The fence's write path stamps the exact clusterTime of each write on
    // fence._csTargetTsByCollection[fenceWriteTsKey(connectionId, collectionName)]
    // (see mongo_connection._annotateFenceWithWriteTs). Wait specifically for
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
    //
    // The lookup is scoped to our own connection as well as our collection.
    // The crossbar notifies every driver listening on a collection *name*, so
    // an app with a second MongoConnection (e.g. a RemoteCollectionDriver onto
    // another cluster) that happens to use the same name lands us here on a
    // fence carrying only that other connection's write. Its clusterTime comes
    // from a different cluster and our stream will never emit an event at or
    // past it, so matching on name alone parks this wait forever and hangs the
    // method that issued the write (meteor/meteor#14600).
    const fence = fenceOverride || DDPServer._getCurrentFence();
    const { collectionName } = this._cursorDescription;
    const { _csTargetTsByCollection } = fence || {};
    const connectionId = this._mongoHandle?._csConnectionId;
    const targetTs = _csTargetTsByCollection && collectionName && connectionId
      ? _csTargetTsByCollection[fenceWriteTsKey(connectionId, collectionName)]
      : undefined;

    if (!targetTs) {
      return;
    }

    if (this._lastProcessedOperationTime) {
      const cmp = compareOperationTimes(this._lastProcessedOperationTime, targetTs);
      // Equal is only caught up once the rest of a batched write is delivered
      // (see _setLastProcessedOperationTime).
      if (cmp > 0 || (cmp === 0 && !this._sharedStream?.hasUndeliveredChanges?.())) {
        return;
      }
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
