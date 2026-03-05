/**
 * AFSCursor - A cursor implementation that works with any StreamProvider.
 *
 * Implements the full Meteor cursor interface so it can be used in publications,
 * templates, and application code identically to Mongo.Cursor.
 *
 * On the server, delegates queries and observations to the StreamProvider.
 * On the client, this is not used directly - client-side collections use
 * Minimongo cursors via LocalCollectionDriver.
 */
export class AFSCursor {
  /**
   * @param {StreamProvider} provider - The data source provider
   * @param {string} collectionName - Collection/table name
   * @param {Object} [selector={}] - MongoDB-style query selector
   * @param {Object} [options={}] - Query options
   * @param {Object} [options.sort] - Sort specification
   * @param {number} [options.skip] - Number of documents to skip
   * @param {number} [options.limit] - Maximum documents to return
   * @param {Object} [options.projection] - Field inclusion/exclusion
   * @param {Function} [options.transform] - Document transform function
   */
  constructor(provider, collectionName, selector = {}, options = {}) {
    this._provider = provider;
    this._collectionName = collectionName;
    this._selector = selector;
    this._options = options;
    this._transform = options.transform || null;

    this._cursorDescription = {
      collectionName,
      selector,
      options: {
        sort: options.sort,
        skip: options.skip,
        limit: options.limit,
        projection: options.projection || options.fields,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Core cursor interface
  // ---------------------------------------------------------------------------

  /**
   * Return all matching documents as an array.
   * @returns {Array<Object>}
   */
  fetch() {
    return Promise.await(this.fetchAsync());
  }

  /**
   * Return all matching documents as an array (async).
   * @returns {Promise<Array<Object>>}
   */
  async fetchAsync() {
    const results = await this._provider._fetchResults(
      this._collectionName,
      this._selector,
      this._options
    );
    if (this._transform) {
      return results.map(doc => this._transform(doc));
    }
    return results;
  }

  /**
   * Call callback for each matching document.
   * @param {Function} callback - Called with (doc, index, cursor)
   * @param {*} [thisArg]
   */
  forEach(callback, thisArg) {
    return Promise.await(this.forEachAsync(callback, thisArg));
  }

  /**
   * Call callback for each matching document (async).
   * @param {Function} callback - Called with (doc, index, cursor)
   * @param {*} [thisArg]
   * @returns {Promise<void>}
   */
  async forEachAsync(callback, thisArg) {
    const docs = await this.fetchAsync();
    for (let i = 0; i < docs.length; i++) {
      await callback.call(thisArg, docs[i], i, this);
    }
  }

  /**
   * Map callback over all matching documents.
   * @param {Function} callback - Called with (doc, index, cursor)
   * @param {*} [thisArg]
   * @returns {Array}
   */
  map(callback, thisArg) {
    return Promise.await(this.mapAsync(callback, thisArg));
  }

  /**
   * Map callback over all matching documents (async).
   * @param {Function} callback - Called with (doc, index, cursor)
   * @param {*} [thisArg]
   * @returns {Promise<Array>}
   */
  async mapAsync(callback, thisArg) {
    const docs = await this.fetchAsync();
    const result = [];
    for (let i = 0; i < docs.length; i++) {
      result.push(await callback.call(thisArg, docs[i], i, this));
    }
    return result;
  }

  /**
   * Count matching documents.
   * @returns {number}
   */
  count() {
    return Promise.await(this.countAsync());
  }

  /**
   * Count matching documents (async).
   * @returns {Promise<number>}
   */
  async countAsync() {
    const docs = await this._provider._fetchResults(
      this._collectionName,
      this._selector,
      // Don't apply skip/limit for counting
      { ...this._options, skip: undefined, limit: undefined }
    );
    return docs.length;
  }

  // ---------------------------------------------------------------------------
  // Async iteration
  // ---------------------------------------------------------------------------

  async *[Symbol.asyncIterator]() {
    const docs = await this.fetchAsync();
    for (const doc of docs) {
      yield doc;
    }
  }

  [Symbol.iterator]() {
    const docs = this.fetch();
    return docs[Symbol.iterator]();
  }

  // ---------------------------------------------------------------------------
  // Observer interface (reactive queries)
  // ---------------------------------------------------------------------------

  /**
   * Watch for changes to the cursor result set.
   * @param {Object} callbacks - { added, changed, removed } or { addedBefore, changed, movedBefore, removed }
   * @param {Object} [options]
   * @returns {Object} Handle with stop() method
   */
  observe(callbacks) {
    return Promise.await(this.observeAsync(callbacks));
  }

  /**
   * Watch for changes (async).
   * @param {Object} callbacks
   * @returns {Promise<Object>}
   */
  async observeAsync(callbacks) {
    const ordered = !!(
      callbacks.addedAt ||
      callbacks.changedAt ||
      callbacks.removedAt ||
      callbacks.movedTo
    );

    // Use LocalCollection._observeFromObserveChanges for compatibility
    return LocalCollection._observeFromObserveChanges(this, callbacks);
  }

  /**
   * Watch for changes to the cursor (low-level delta callbacks).
   * @param {Object} callbacks - { added(id, fields), changed(id, fields), removed(id) }
   * @param {Object} [options]
   * @returns {Object} Handle with stop() method
   */
  observeChanges(callbacks, options = {}) {
    return Promise.await(this.observeChangesAsync(callbacks, options));
  }

  /**
   * Watch for changes (async, low-level).
   * @param {Object} callbacks
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async observeChangesAsync(callbacks, options = {}) {
    const ordered = !!(
      callbacks.addedBefore ||
      callbacks.movedBefore
    );

    return this._provider.observeChanges(
      this._cursorDescription,
      ordered,
      callbacks,
      options
    );
  }

  // ---------------------------------------------------------------------------
  // DDP publish integration
  // ---------------------------------------------------------------------------

  /**
   * Publish this cursor's data to a DDP subscription.
   * This is the critical method that makes AFS cursors work with Meteor.publish.
   *
   * @param {Object} sub - The DDP subscription object
   * @returns {Promise<Object>} The observe handle
   */
  async _publishCursor(sub) {
    const collection = this._collectionName;

    const observeHandle = await this.observeChangesAsync(
      {
        added(id, fields) {
          sub.added(collection, id, fields);
        },
        changed(id, fields) {
          sub.changed(collection, id, fields);
        },
        removed(id) {
          sub.removed(collection, id);
        },
      },
      { nonMutatingCallbacks: true }
    );

    // Clean up observer when subscription stops
    sub.onStop(async function () {
      return await observeHandle.stop();
    });

    return observeHandle;
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /**
   * @returns {Function|null} The transform function for this cursor
   */
  getTransform() {
    return this._transform;
  }

  /**
   * @returns {string} The collection name this cursor queries
   */
  _getCollectionName() {
    return this._collectionName;
  }

  /**
   * @returns {Object} The cursor description (for observe deduplication)
   */
  getCursorDescription() {
    return this._cursorDescription;
  }
}
