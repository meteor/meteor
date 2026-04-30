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
    this._changeStream = null;
    this._stopped = false;
    this._stopCallbacks = [];
    this._pendingWrites = [];
    this._writesToCommitWhenReady = [];
    this._isReady = false;
    this._lastProcessedOperationTime = null;
    this._catchingUpResolvers = [];
    this._resolveTimeout = null;
    // Tracked across restarts so we can resume the stream from where it left
    // off instead of "now" — without this, events that arrived between an
    // error/close and the restart are silently dropped, leaving fences waiting
    // for clusterTimes that will never appear in the new stream.
    this._resumeToken = null;
    this._matcher = options.matcher;
    this._id = options.id || Random.id();

    // Projection function similar to oplog driver
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

    this._startListening();
    this._startWatching();
  }

  _sendMultiplexerAdded(id, projectedDoc) {
    // Apply EJSON transformation before sending to client
    projectedDoc = replaceTypes(projectedDoc, replaceMongoAtomWithMeteor);
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

      // Capture the cluster time BEFORE opening the stream so we can pass
      // startAtOperationTime to watch(). Without this, the change stream
      // begins at whatever time mongo processes the aggregate $changeStream
      // command — which under contention can be MILLISECONDS later than the
      // call site, and any write that lands in that window is silently
      // dropped from the stream. With startAtOperationTime set to a known
      // earlier ts, mongo replays every event from that ts forward, closing
      // the race. Skipped on resume (the prior token already pins the start).
      let startAtOperationTime;
      if (!this._resumeToken) {
        try {
          const pingRes = await this._mongoHandle.db.command({ ping: 1 });
          startAtOperationTime = pingRes?.operationTime;
        } catch (e) {
          // Best-effort. If the ping fails the stream falls back to
          // mongo's default of "now" — same as the pre-fix behaviour.
        }
      }

      // Open the change stream BEFORE the snapshot read. Events emitted while
      // _sendInitialAdds is running are queued by the driver (in
      // _pendingWrites) and replayed once the multiplexer is ready, with
      // _handleInsert deduping against the cache for any doc the snapshot
      // already covered.
      const pipeline = this._buildPipeline();
      const changeStreamOptions = {
        fullDocument: 'updateLookup',
        fullDocumentBeforeChange: 'whenAvailable',
      };
      if (this._resumeToken) {
        // Resuming after an error/close restart: startAfter replays every
        // event since the last token we saw, so events emitted while the
        // stream was reconnecting are not silently dropped.
        changeStreamOptions.startAfter = this._resumeToken;
      } else if (startAtOperationTime) {
        changeStreamOptions.startAtOperationTime = startAtOperationTime;
      }

      this._changeStream = collection.watch(pipeline, changeStreamOptions);

      // Register stop callback for the change stream
      this._stopCallbacks.push(async () => {
        if (this._changeStream) {
          try {
            await this._changeStream.close();
          } catch (error) {
            // Ignore errors when closing
          }
          this._changeStream = null;
        }
      });

      // Handle change events. While _sendInitialAdds is still running these
      // events get queued via _handleChange and only processed once the
      // multiplexer is ready (see _flushPendingWrites guard below).
      this._changeStream.on('change', Meteor.bindEnvironment((change) => {
        if (this._stopped) return;
        // Capture the resume token so a future restart picks up where this
        // event left off (see startAfter in changeStreamOptions above).
        if (change && change._id) {
          this._resumeToken = change._id;
        }
        // Update last processed op time early so fences can unblock promptly
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
      }));

      // Handle errors and reconnection
      this._changeStream.on('error', Meteor.bindEnvironment((error) => {
        if (this._stopped) return;
        console.error('ChangeStream error:', {
          driverId: this._id,
          collectionName: this._cursorDescription.collectionName,
          resumeTokenPresent: !!this._resumeToken,
          lastProcessedOperationTime: this._lastProcessedOperationTime,
          catchingUpResolversCount: this._catchingUpResolvers.length,
          error,
        });
        // Attempt to restart after a delay
        const timeoutId = setTimeout(() => {
          if (!this._stopped) {
            this._restartChangeStream();
          }
        }, Meteor?.settings?.packages?.mongo?.changeStream?.delay?.error || 100);

        // Register timeout cleanup
        this._addStopCallback(() => {
          clearTimeout(timeoutId);
        });
      }));

      this._changeStream.on('close', Meteor.bindEnvironment(() => {
        if (!this._stopped) {
          console.error('ChangeStream closed unexpectedly, scheduling restart:', {
            driverId: this._id,
            collectionName: this._cursorDescription.collectionName,
            resumeTokenPresent: !!this._resumeToken,
            lastProcessedOperationTime: this._lastProcessedOperationTime,
            catchingUpResolversCount: this._catchingUpResolvers.length,
          });
          // Unexpected close, attempt restart
          const timeoutId = setTimeout(() => {
            if (!this._stopped) {
              this._restartChangeStream();
            }
          }, Meteor?.settings?.packages?.mongo?.changeStream?.delay?.close || 100);

          // Register timeout cleanup
          this._addStopCallback(() => {
            clearTimeout(timeoutId);
          });
        }
      }));

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
      const selector = this._cursorDescription.selector || {};
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
      for await (const doc of cursor) {
        if (this._stopped) return;
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

  async _restartChangeStream() {
    const collectionName = this._cursorDescription.collectionName;
    console.error('ChangeStream restart begin:', {
      driverId: this._id,
      collectionName,
      resumeTokenPresent: !!this._resumeToken,
      catchingUpResolversCount: this._catchingUpResolvers.length,
    });
    try {
      // Close current stream using stop callbacks if they exist
      if (this._changeStream) {
        // Find and execute the change stream stop callback
        const changeStreamCallback = this._stopCallbacks.find(cb =>
          typeof cb._changeStream === 'function'
        );
        if (changeStreamCallback) {
          await changeStreamCallback();
          // Remove the old callback since we'll add a new one
          this._stopCallbacks = this._stopCallbacks.filter(cb => cb !== changeStreamCallback);
        }
      }
      await this._startWatching();
      console.error('ChangeStream restart done:', {
        driverId: this._id,
        collectionName,
        catchingUpResolversCount: this._catchingUpResolvers.length,
      });
    } catch (error) {
      console.error('Failed to restart ChangeStream:', {
        driverId: this._id,
        collectionName,
        error,
      });
    }
  }

  _buildPipeline() {
    // For now, use a simple pipeline that watches all operations
    // We'll filter using our matcher in _handleChange
    const selector = this._cursorDescription.selector;

    if (!selector || Object.keys(selector).length === 0) {
      // No selector, watch all changes
      return [];
    }

    // Simple pipeline that just filters by operation type
    // More complex selector filtering will be done in _handleChange
    return [
      {
        $match: {
          operationType: { $in: ['insert', 'update', 'replace', 'delete'] }
        }
      }
    ];
  }

  async _handleChange(change) {
    if (this._stopped) return;

    const { operationType, documentKey, fullDocument, fullDocumentBeforeChange, clusterTime } = change;

    if (!SUPPORTED_OPERATIONS.includes(operationType)) {
      return; // Ignore unsupported operations
    }

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
            const transformedDoc = replaceTypes(changedFields, replaceMongoAtomWithMeteor);
            this._multiplexer.changed(id, transformedDoc);
          }
          return;
        }

        // Without a pre-image we can't diff reliably; fall back to sending full doc
        const projectedDoc = this._projectionFn ? this._projectionFn(newDoc) : newDoc;
        const transformedDoc = replaceTypes(projectedDoc, replaceMongoAtomWithMeteor);
        this._multiplexer.changed(id, transformedDoc);
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
    //   1. The change stream resuming from this._resumeToken on error/close,
    //      so events emitted while the stream was reconnecting are replayed.
    //   2. The watchdog below logging if the wait stalls past warnMs, which
    //      makes a genuinely-broken stream visible without masking it.
    const warnMs = Meteor?.settings?.packages?.mongo?.changeStream?.waitUntilCaughtUpWarnMs ?? 10000;
    const waitStartedAt = Date.now();
    let warnCount = 0;
    const dumpDiagnostics = () => {
      warnCount++;
      console.error(
        `Meteor: change stream catching up took too long`,
        {
          driverId: this._id,
          collectionName,
          targetTs,
          lastProcessedOperationTime: this._lastProcessedOperationTime,
          stopped: this._stopped,
          isReady: this._isReady,
          changeStreamOpen: !!this._changeStream,
          resumeTokenPresent: !!this._resumeToken,
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
            `Meteor: change stream caught up after warn`,
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

    // Execute all stop callbacks
    for (const callback of this._stopCallbacks) {
      try {
        await callback();
      } catch (error) {
        console.error('Error in stop callback:', error);
      }
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
