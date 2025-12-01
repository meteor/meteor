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
    this._matcher = options.matcher;
    this._id = options.id || Random.id();
    
    // Projection function similar to oplog driver
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
            
            // Wait for the change stream to catch up with any pending operations
            await driver._waitUntilCaughtUp();
            
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

    // const collectionName = this._cursorDescription.collectionName;

    // const collections = await this._mongoHandle.db.listCollections({ name: collectionName }).toArray();
    // const exists = collections.length > 0;
    // const preAndPostImagesEnabled = exists &&
    //   collections[0]?.options?.changeStreamPreAndPostImages?.enabled === true;

    // if (!exists) {
    //   await this._mongoHandle.db.createCollection(collectionName);
    // }

    // if (!preAndPostImagesEnabled) {
    //   await this._mongoHandle.db.command({
    //     collMod: collectionName,
    //     changeStreamPreAndPostImages: { enabled: true }
    //   });
    // }


      const collection = this._mongoHandle.rawCollection(this._cursorDescription.collectionName);

      // First, get all existing documents that match our selector
      await this._sendInitialAdds(collection);

      // Signal initial adds are complete (but delay being 'ready' for commits
      // until the change stream is attached to avoid fence ordering gaps)
      this._multiplexer.ready();

      // Then start watching for changes
      const pipeline = this._buildPipeline();

      // Create change stream with appropriate options
      const changeStreamOptions = {
        fullDocument: 'updateLookup',
        fullDocumentBeforeChange: 'whenAvailable'
      };

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

      // Handle change events
      this._changeStream.on('change', Meteor.bindEnvironment((change) => {
        if (this._stopped) return;
        // Update last processed op time early so fences can unblock promptly
        if (change && change.clusterTime) {
          this._setLastProcessedOperationTime(change.clusterTime);
        }
        this._handleChange(change);
        
        // Check if we're in a fence
        const fence = DDPServer._getCurrentFence();
        if (fence && !fence.fired) {
          // Process immediately if we're in a fence
          this._flushPendingWrites();
        } else {
          // Otherwise defer processing (similar to polling cycle)
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
        console.error('ChangeStream error:', error);
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
      
      // Now we can allow queued fence writes to commit safely
      this._isReady = true;
      await this._flushWritesToCommit();
      
      // Remove the defer that was calling _flushPendingWrites
      
    } catch (error) {
      console.error('Failed to start ChangeStream:', error);
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
      throw error;
    }
  }

  async _restartChangeStream() {
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
    } catch (error) {
      console.error('Failed to restart ChangeStream:', error);
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

  async _getServerOperationTime() {
    const db = this._mongoHandle.db;
    const admin = db.admin();

    const commands = [
      () => db.command({ ping: 1 }),
      () => admin.command({ hello: 1 }),
      () => admin.command({ ismaster: 1 })
    ];

    const runCommandRecursive = async (index = 0) => {
      if (index >= commands.length) {
        return null;
      }

      try {
        const res = await commands[index]();
        return res?.operationTime || res?.$clusterTime?.clusterTime || null;
      } catch (error) {
          if (!error) {
          return false;
        }

        // CommandNotFound https://www.mongodb.com/pt-br/docs/manual/reference/error-codes/
        const isUnsupportedCommandError = error.code === 59;
        if (isUnsupportedCommandError) {
          return runCommandRecursive(index + 1);
        }
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
    // Apply projection and check if document matches our criteria
    const matches = this._matcher.documentMatches(doc).result;
    if (matches) {
      const projectedDoc = this._projectionFn ? this._projectionFn(doc) : doc;
      this._sendMultiplexerAdded(id, projectedDoc);
    }
  }

  _handleUpdate(id, newDoc, oldDoc) {
    // Determine which state (before/after) matches the cursor selector
    const matchesAfter = this._matcher.documentMatches(newDoc || {}).result;

    // If MongoDB delivers the pre-image we can rely on it. Otherwise fall back to
    // the multiplexer cache to infer whether we were previously tracking the doc.
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
            this._multiplexer?._cache?.docs.set(id, newDoc);
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

  async _waitUntilCaughtUp() {
    // Wait until our change stream has processed events up to the
    // server's current operation time. Mirrors oplog's wait logic.
    if (this._stopped) return;

    const targetTs = await this._getServerOperationTime();
    if (!targetTs) {
      // Best-effort fallback: yield to I/O but don't artificially delay
      await new Promise((r) => setImmediate(r));
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

    // Wait with an upper bound: release if it takes too long
    let timeoutId = null;
    const entry = { ts: targetTs, resolver: null };

    const timeoutMs = Meteor?.settings?.packages?.mongo?.changeStream?.waitUntilCaughtUpTimeoutMs ?? 1000;

    await new Promise((resolve) => {
      entry.resolver = () => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve();
      };

      // Insert our entry to be resolved when we process >= targetTs
      this._catchingUpResolvers.splice(insertIdx, 0, entry);

      // Safety valve: if it takes more than timeoutMs, just release
      timeoutId = setTimeout(() => {
        // Remove our entry if still pending
        const idx = this._catchingUpResolvers.indexOf(entry);
        if (idx !== -1) this._catchingUpResolvers.splice(idx, 1);
        resolve();
      }, timeoutMs);
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
      if(!write || typeof write.committed !== 'function') continue;
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
