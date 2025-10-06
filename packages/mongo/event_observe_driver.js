import { Meteor } from 'meteor/meteor';
import { LocalCollection } from 'meteor/minimongo';
import { EJSON } from 'meteor/ejson';
import { Random } from 'meteor/random';
import { MongoID } from 'meteor/mongo-id';
import { DDPServer } from 'meteor/ddp-server';
import { DiffSequence } from 'meteor/diff-sequence';
import { listenAll } from './mongo_driver';
import { replaceTypes, replaceMongoAtomWithMeteor } from './mongo_common';

const SUPPORTED_OPERATIONS = ['insert', 'update', 'replace', 'delete'];
const DEFAULT_WAIT_TIMEOUT_MS = 1000;

export class EventObserveDriver {
  constructor(options) {
    if (!options?.eventEmitter) {
      throw new Error('EventObserveDriver requires an eventEmitter option');
    }

    this._usesEventEmitter = true;
    this._cursorDescription = options.cursorDescription;
    this._mongoHandle = options.mongoHandle;
    this._multiplexer = options.multiplexer;
    this._ordered = options.ordered;
    this._eventEmitter = options.eventEmitter;
    this._eventDriverSettings = options.eventDriverSettings || {};
    this._stopped = false;
    this._stopCallbacks = [];
    this._pendingWrites = [];
    this._writesToCommitWhenReady = [];
    this._isReady = false;
    this._catchingUpResolvers = [];
    this._id = options.id || Random.id();
    this._boundEventListener = null;
    this._eventObserverRegistered = false;
    this._sorter = options.sorter || null;
    this._comparator = null;
    this._cachedResults = [];

    const initialSequence = this._mongoHandle?._getCurrentEventSequence?.();
    this._lastProcessedSequence = typeof initialSequence === 'number' ? initialSequence : 0;

    this._matcher = options.matcher;
    if (!this._matcher) {
      const { Minimongo } = require('meteor/minimongo');
      this._matcher = new Minimongo.Matcher(this._cursorDescription.selector);
    }

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
    this._registerObserver();
    this._startWatching();
  }

  _registerObserver() {
    if (this._eventObserverRegistered) {
      return;
    }
    if (this._mongoHandle && typeof this._mongoHandle._registerEventObserver === 'function') {
      this._mongoHandle._registerEventObserver();
      this._eventObserverRegistered = true;
    }
  }

  _unregisterObserver() {
    if (!this._eventObserverRegistered) {
      return;
    }
    if (this._mongoHandle && typeof this._mongoHandle._unregisterEventObserver === 'function') {
      this._mongoHandle._unregisterEventObserver();
    }
    this._eventObserverRegistered = false;
  }

  _addStopCallback(callback) {
    if (typeof callback !== 'function') {
      throw new Error('Stop callback must be a function');
    }
    this._stopCallbacks.push(callback);
  }

  async _startListening() {
    const stopHandle = await listenAll(
      this._cursorDescription,
      () => {
        const fence = DDPServer._getCurrentFence();
        if (!fence || fence.fired) {
          return;
        }

        if (fence._eventObserveDrivers) {
          fence._eventObserveDrivers[this._id] = this;
          return;
        }

        fence._eventObserveDrivers = {};
        fence._eventObserveDrivers[this._id] = this;

        fence.onBeforeFire(async () => {
          const drivers = fence._eventObserveDrivers;
          delete fence._eventObserveDrivers;

          for (const driver of Object.values(drivers)) {
            if (driver._stopped) continue;

            const write = await fence.beginWrite();

            await driver._waitUntilCaughtUp();

            driver._flushPendingWrites();

            if (driver._isReady) {
              await driver._multiplexer.onFlush(async () => {
                await write.committed();
              });
            } else {
              driver._writesToCommitWhenReady.push(write);
            }
          }
        });
      }
    );

    this._addStopCallback(() => stopHandle.stop());
  }

  async _startWatching() {
    if (this._stopped) return;

    try {
      const collection = this._mongoHandle.rawCollection(this._cursorDescription.collectionName);

      if (this._ordered) {
        this._cachedResults = [];
      }

      await this._sendInitialAdds(collection);

      this._boundEventListener = Meteor.bindEnvironment((change) => {
        if (!change || this._stopped) {
          return;
        }

        if (typeof change.sequence === 'number') {
          this._setLastProcessedSequence(change.sequence);
        }

        if (change.collectionName !== this._cursorDescription.collectionName) {
          return;
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
      });

      this._eventEmitter.on('change', this._boundEventListener);

      this._addStopCallback(() => {
        if (!this._boundEventListener) return;
        if (typeof this._eventEmitter.off === 'function') {
          this._eventEmitter.off('change', this._boundEventListener);
        } else {
          this._eventEmitter.removeListener('change', this._boundEventListener);
        }
        this._boundEventListener = null;
      });

      const startSequence = this._mongoHandle?._getCurrentEventSequence?.();
      if (typeof startSequence === 'number') {
        this._setLastProcessedSequence(startSequence);
      }

      this._multiplexer.ready();

      this._isReady = true;
      await this._flushWritesToCommit();
    } catch (error) {
      this._unregisterObserver();
      console.error('Failed to start EventObserveDriver:', error);
      throw error;
    }
  }

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
        this._trackInitialDoc(doc);
        await this._sendMultiplexerAdded(id, projectedDoc);
      }
    } catch (error) {
      console.error('Error sending initial adds for EventObserveDriver:', error);
      throw error;
    }
  }

  async _sendMultiplexerAdded(id, projectedDoc, beforeId = null) {
    const transformed = replaceTypes(projectedDoc, replaceMongoAtomWithMeteor);
    if (this._ordered && typeof this._multiplexer.addedBefore === 'function') {
      this._multiplexer.addedBefore(id, transformed, beforeId);
    } else if (typeof this._multiplexer.added === 'function') {
      this._multiplexer.added(id, transformed);
    } else {
      throw new Error('ObserveMultiplexer missing added callback for EventObserveDriver');
    }
  }

  _handleChange(change) {
    if (this._stopped) return;

    const { operationType, documentKey, fullDocument, fullDocumentBeforeChange } = change;
    if (!SUPPORTED_OPERATIONS.includes(operationType)) {
      return;
    }

    const rawId = documentKey?._id;
    const id = typeof rawId !== 'string' && rawId && typeof rawId.toHexString === 'function'
      ? new MongoID.ObjectID(rawId.toHexString())
      : rawId;

    this._pendingWrites.push({
      operationType,
      id,
      fullDocument,
      fullDocumentBeforeChange,
      change
    });
  }

  _prepareDocForCache(doc) {
    if (!this._ordered || !doc) {
      return null;
    }

    const meteorDoc = replaceTypes(doc, replaceMongoAtomWithMeteor);
    if (meteorDoc && typeof meteorDoc === 'object') {
      if (!meteorDoc._id && doc._id !== undefined) {
        meteorDoc._id = doc._id;
      }
      return EJSON.clone(meteorDoc);
    }

    return meteorDoc;
  }

  _idsEqual(a, b) {
    if (a === b) return true;
    return EJSON.equals(a, b);
  }

  _findCachedIndex(id) {
    if (!this._ordered) return -1;
    return this._cachedResults.findIndex(doc => this._idsEqual(doc?._id, id));
  }

  _insertCachedDoc(doc, beforeId) {
    if (!this._ordered || !doc) return;

    if (beforeId !== null && beforeId !== undefined) {
      const beforeIndex = this._findCachedIndex(beforeId);
      if (beforeIndex !== -1) {
        this._cachedResults.splice(beforeIndex, 0, doc);
        return;
      }
    }

    this._cachedResults.push(doc);
  }

  _removeCachedDoc(id) {
    if (!this._ordered) return;
    const index = this._findCachedIndex(id);
    if (index !== -1) {
      this._cachedResults.splice(index, 1);
    }
  }

  _getComparator() {
    if (!this._ordered || !this._sorter || typeof this._sorter.getComparator !== 'function') {
      return null;
    }

    if (!this._comparator) {
      try {
        this._comparator = this._sorter.getComparator();
      } catch (e) {
        this._comparator = null;
      }
    }

    return this._comparator;
  }

  _computeBeforeId(doc, id) {
    if (!this._ordered || !doc) return null;

    const comparator = this._getComparator();
    if (!comparator) {
      return null;
    }

    const working = [];
    for (const existing of this._cachedResults) {
      if (this._idsEqual(existing?._id, id)) {
        continue;
      }
      working.push(existing);
    }

    LocalCollection._insertInSortedList(comparator, working, doc);

    for (let i = 0; i < working.length; i++) {
      const candidate = working[i];
      if (this._idsEqual(candidate?._id, id)) {
        const nextDoc = working[i + 1];
        return nextDoc ? nextDoc._id : null;
      }
    }

    return null;
  }

  _trackInitialDoc(doc) {
    if (!this._ordered) return;
    const prepared = this._prepareDocForCache(doc);
    if (!prepared) return;
    this._cachedResults.push(prepared);
  }

  _flushPendingWrites() {
    const callbacksToFlush = this._pendingWrites;
    this._pendingWrites = [];

    if (callbacksToFlush.length === 0) {
      return;
    }

    for (const callbackData of callbacksToFlush) {
      try {
        const { operationType, id, fullDocument, fullDocumentBeforeChange, change } = callbackData;
        switch (operationType) {
          case 'insert':
            this._handleInsert(id, fullDocument);
            break;
          case 'update':
            this._handleUpdate(id, fullDocument, fullDocumentBeforeChange);
            break;
          case 'replace':
            this._handleReplace(id, fullDocument, fullDocumentBeforeChange);
            break;
          case 'delete':
            this._handleDelete(id, change);
            break;
        }
      } catch (error) {
        console.error(`[EventObserveDriver ${this._id}] Error processing callback:`, error);
      }
    }
  }

  async _flushWritesToCommit() {
    const writes = this._writesToCommitWhenReady;
    this._writesToCommitWhenReady = [];

    if (writes.length === 0) {
      return;
    }

    await this._multiplexer.onFlush(async () => {
      for (const write of writes) {
        await write.committed();
      }
    });
  }

  _handleInsert(id, doc) {
    const matches = this._matcher ? this._matcher.documentMatches(doc).result : true;
    if (!matches) return;

    const projectedDoc = this._projectionFn ? this._projectionFn(doc) : doc;
    const prepared = this._prepareDocForCache(doc);
    const beforeId = this._ordered ? this._computeBeforeId(prepared, id) : null;
    if (this._ordered) {
      this._insertCachedDoc(prepared, beforeId);
    }

    this._sendMultiplexerAdded(id, projectedDoc, beforeId);
  }

  _handleUpdate(id, newDoc, oldDoc) {
    const matchesAfter = this._matcher
      ? this._matcher.documentMatches(newDoc || {}).result
      : true;

    const cachedDoc = this._multiplexer?._cache?.docs?.get?.(id);
    const matchesBefore = oldDoc
      ? (this._matcher ? this._matcher.documentMatches(oldDoc).result : true)
      : !!cachedDoc;

    const preparedNewDoc = newDoc ? this._prepareDocForCache(newDoc) : null;

    if (matchesAfter) {
      if (!matchesBefore) {
        const projectedDoc = this._projectionFn ? this._projectionFn(newDoc) : newDoc;
        const beforeId = this._ordered ? this._computeBeforeId(preparedNewDoc, id) : null;
        if (this._ordered) {
          this._insertCachedDoc(preparedNewDoc, beforeId);
        }
        this._sendMultiplexerAdded(id, projectedDoc, beforeId);
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
        } else {
          const projectedDoc = this._projectionFn ? this._projectionFn(newDoc) : newDoc;
          const transformedDoc = replaceTypes(projectedDoc, replaceMongoAtomWithMeteor);
          this._multiplexer.changed(id, transformedDoc);
        }
      }

      if (this._ordered) {
        const comparator = this._getComparator();

        if (!comparator) {
          if (preparedNewDoc) {
            const idx = this._findCachedIndex(id);
            if (idx !== -1) {
              this._cachedResults[idx] = preparedNewDoc;
            }
          }
        } else {
          const currentIndex = this._findCachedIndex(id);
          let previousNextId = null;

          if (currentIndex !== -1) {
            previousNextId = this._cachedResults[currentIndex + 1]?._id ?? null;
            this._cachedResults.splice(currentIndex, 1);
          }

          if (preparedNewDoc) {
            const beforeId = this._computeBeforeId(preparedNewDoc, id);
            this._insertCachedDoc(preparedNewDoc, beforeId);

            if (!this._idsEqual(beforeId, previousNextId)) {
              this._multiplexer.movedBefore(id, beforeId);
            }
          } else if (currentIndex !== -1 && cachedDoc) {
            const fallbackDoc = EJSON.clone(cachedDoc);
            this._insertCachedDoc(fallbackDoc, previousNextId);
          }
        }
      }

      return;
    }

    if (matchesBefore) {
      if (this._ordered) {
        this._removeCachedDoc(id);
      }
      this._multiplexer.removed(id);
    }
  }

  _handleReplace(id, newDoc, oldDoc) {
    this._handleUpdate(id, newDoc, oldDoc);
  }

  _handleDelete(id) {
    const docs = this._multiplexer?._cache?.docs;
    const hasDoc = typeof docs?.has === 'function'
      ? docs.has(id)
      : typeof docs?.get === 'function' && docs.get(id) !== undefined;

    if (this._ordered) {
      this._removeCachedDoc(id);
    }

    if (hasDoc) {
      this._multiplexer.removed(id);
    }
  }

  async _waitUntilCaughtUp() {
    if (this._stopped) return;

    const targetSeq = this._mongoHandle?._getCurrentEventSequence?.();
    if (typeof targetSeq !== 'number') {
      await new Promise((resolve) => setImmediate(resolve));
      return;
    }

    if (this._lastProcessedSequence >= targetSeq) {
      return;
    }

    const entry = { seq: targetSeq, resolver: null };
    let timeoutId = null;
    const timeoutMs = this._getWaitTimeoutMs();

    await new Promise((resolve) => {
      entry.resolver = () => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve();
      };

      let insertIdx = this._catchingUpResolvers.length;
      while (insertIdx - 1 >= 0 && this._catchingUpResolvers[insertIdx - 1]?.seq > targetSeq) {
        insertIdx--;
      }
      this._catchingUpResolvers.splice(insertIdx, 0, entry);

      timeoutId = setTimeout(() => {
        const idx = this._catchingUpResolvers.indexOf(entry);
        if (idx !== -1) this._catchingUpResolvers.splice(idx, 1);
        resolve();
      }, timeoutMs);
    });
  }

  _getWaitTimeoutMs() {
    if (typeof this._eventDriverSettings.waitUntilCaughtUpTimeoutMs === 'number') {
      return this._eventDriverSettings.waitUntilCaughtUpTimeoutMs;
    }
    return Meteor?.settings?.packages?.mongo?.eventObserveDriver?.waitUntilCaughtUpTimeoutMs
      ?? Meteor?.settings?.packages?.mongo?.changeStream?.waitUntilCaughtUpTimeoutMs
      ?? DEFAULT_WAIT_TIMEOUT_MS;
  }

  _setLastProcessedSequence(seq) {
    if (typeof seq === 'number' && seq > this._lastProcessedSequence) {
      this._lastProcessedSequence = seq;
    }

    while (this._catchingUpResolvers.length > 0) {
      const first = this._catchingUpResolvers[0];
      if (seq >= first.seq) {
        this._catchingUpResolvers.shift();
        try {
          first.resolver();
        } catch (e) {
          // ignore resolver errors
        }
      } else {
        break;
      }
    }
  }

  async stop() {
    if (this._stopped) return;

    this._stopped = true;

    for (const callback of this._stopCallbacks) {
      try {
        await callback();
      } catch (error) {
        console.error('Error in stop callback:', error);
      }
    }

    for (const write of this._pendingWrites) {
      if (!write || typeof write.committed !== 'function') continue;
      await write.committed();
    }
    this._pendingWrites = [];

    for (const write of this._writesToCommitWhenReady) {
      await write.committed();
    }
    this._writesToCommitWhenReady = [];

    this._stopCallbacks = [];
    this._cachedResults = [];
    this._comparator = null;
    this._unregisterObserver();
  }
}
