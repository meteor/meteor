import LocalCollection from 'meteor/minimongo/local_collection';
import { replaceMongoAtomWithMeteor, replaceTypes } from './mongo_common';

/**
 * This is just a light wrapper for the cursor. The goal here is to ensure compatibility even if
 * there are breaking changes on the MongoDB driver.
 *
 * This is an internal implementation detail and is created lazily by the main Cursor class.
 */
export class AsynchronousCursor {
  _closing = false;
  _pendingNext = null;
  constructor(dbCursor, cursorDescription, options) {
    this._dbCursor = dbCursor;
    this._cursorDescription = cursorDescription;

    this._selfForIteration = options.selfForIteration || this;
    if (options.useTransform && cursorDescription.options.transform) {
      this._transform = LocalCollection.wrapTransform(
        cursorDescription.options.transform);
    } else {
      this._transform = null;
    }

    this._visitedIds = new LocalCollection._IdMap;
  }

  [Symbol.asyncIterator]() {
    var cursor = this;
    return {
      async next() {
        const value = await cursor._nextObjectPromise();
        return { done: !value, value };
      },
    };
  }

  // Returns a Promise for the next object from the underlying cursor (before
  // the Mongo->Meteor type replacement).
  async _rawNextObjectPromise() {
    if (this._closing) {
      // Prevent next() after close is called
      return null;
    }
    try {
      this._pendingNext = this._dbCursor.next();
      const result = await this._pendingNext;
      this._pendingNext = null;
      return result;
    } catch (e) {
      console.error(e);
    } finally {
      this._pendingNext = null;
    }
  }

  // Returns a Promise for the next object from the cursor, skipping those whose
  // IDs we've already seen and replacing Mongo atoms with Meteor atoms.
  async _nextObjectPromise () {
    while (true) {
      var doc = await this._rawNextObjectPromise();

      if (!doc) return null;
      doc = replaceTypes(doc, replaceMongoAtomWithMeteor);

      if (!this._cursorDescription.options.tailable && '_id' in doc) {
        // Did Mongo give us duplicate documents in the same cursor? If so,
        // ignore this one. (Do this before the transform, since transform might
        // return some unrelated value.) We don't do this for tailable cursors,
        // because we want to maintain O(1) memory usage. And if there isn't _id
        // for some reason (maybe it's the oplog), then we don't do this either.
        // (Be careful to do this for falsey but existing _id, though.)
        if (this._visitedIds.has(doc._id)) continue;
        this._visitedIds.set(doc._id, true);
      }

      if (this._transform)
        doc = this._transform(doc);

      return doc;
    }
  }

  // Returns a promise which is resolved with the next object (like with
  // _nextObjectPromise) or rejected if the cursor doesn't return within
  // timeoutMS ms.
  _nextObjectPromiseWithTimeout(timeoutMS) {
    const nextObjectPromise = this._nextObjectPromise();
    if (!timeoutMS) {
      return nextObjectPromise;
    }

    const timeoutPromise = new Promise(resolve => {
      // On timeout, close the cursor.
      const timeoutId = setTimeout(() => {
        resolve(this.close());
      }, timeoutMS);

      // If the `_nextObjectPromise` returned first, cancel the timeout.
      nextObjectPromise.finally(() => {
        clearTimeout(timeoutId);
      });
    });

    return Promise.race([nextObjectPromise, timeoutPromise]);
  }

  async forEach(callback, thisArg) {
    // Get back to the beginning.
    this._rewind();

    let idx = 0;
    while (true) {
      const doc = await this._nextObjectPromise();
      if (!doc) return;
      await callback.call(thisArg, doc, idx++, this._selfForIteration);
    }
  }

  async map(callback, thisArg) {
    const results = [];
    await this.forEach(async (doc, index) => {
      results.push(await callback.call(thisArg, doc, index, this._selfForIteration));
    });

    return results;
  }

  _rewind() {
    // known to be synchronous
    this._dbCursor.rewind();

    this._visitedIds = new LocalCollection._IdMap;
  }

  // Mostly usable for tailable cursors.
  async close() {
    this._closing = true;
    // If there's a pending next(), wait for it to finish or abort
    if (this._pendingNext) {
      try {
        await this._pendingNext;
      } catch (e) {
        // ignore
      }
    }
    this._dbCursor.close();
  }

  fetch() {
    return this.map(doc => doc);
  }

  /**
   * FIXME: (node:34680) [MONGODB DRIVER] Warning: cursor.count is deprecated and will be
   *  removed in the next major version, please use `collection.estimatedDocumentCount` or
   *  `collection.countDocuments` instead.
   */
  count() {
    return this._dbCursor.count();
  }

  // This method is NOT wrapped in Cursor.
  async getRawObjects(ordered) {
    var self = this;
    if (ordered) {
      return self.fetch();
    } else {
      var results = new LocalCollection._IdMap;
      await self.forEach(function (doc) {
        results.set(doc._id, doc);
      });
      return results;
    }
  }
}