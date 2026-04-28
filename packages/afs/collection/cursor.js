/**
 * AFSCursor - A cursor implementation that works with any StreamProvider.
 *
 * Implements the async Meteor 3 cursor interface so it can be used in
 * publications, templates, and application code identically to Mongo.Cursor.
 *
 * On the server, delegates queries and observations to the StreamProvider.
 * On the client, this is not used directly - client-side collections use
 * Minimongo cursors via LocalCollectionDriver.
 *
 * **`_id` assumption (Mongo-DX shape).** The `added` / `changed` / `removed`
 * event payloads this cursor surfaces — and the `cursorDescription` it
 * passes to the provider — are Mongo-DX shaped: they assume `_id` is the
 * document identifier. Backends whose primary key is not `_id` (Kafka
 * offset, SQL `BIGSERIAL`, REST resource path, Redis key) MUST map their
 * native key to `_id` in the row converter / response decoder before
 * handing documents to afs, and accept `_id` as the selector key on the
 * way back. This matches afs's "Mongo-DX mapping per backend" design
 * intent — adapters translate at the boundary so application code stays
 * uniform.
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
  // Core cursor interface (async-only; Meteor 3)
  // ---------------------------------------------------------------------------

  /**
   * Return all matching documents as an array.
   * @returns {Promise<Array<Object>>}
   */
  async fetchAsync() {
    const startTime = Date.now();
    const results = await this._provider.fetchResults(
      this._collectionName,
      this._selector,
      this._options
    );
    const duration = Date.now() - startTime;

    // Record query execution time for adaptive engine
    const engine = global.AFS && global.AFS._engine;
    if (engine) {
      engine.recordQueryExecution(this._collectionName, duration);
    }

    if (this._transform) {
      return results.map(doc => this._transform(doc));
    }
    return results;
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
   * Count matching documents (async).
   * @returns {Promise<number>}
   */
  async countAsync() {
    if (this._provider.countAsync) {
      return this._provider.countAsync(
        this._collectionName,
        this._selector,
        // Don't apply skip/limit for counting
        { ...this._options, skip: undefined, limit: undefined }
      );
    }
    const docs = await this._provider.fetchResults(
      this._collectionName,
      this._selector,
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

  // ---------------------------------------------------------------------------
  // Observer interface (reactive queries, async-only)
  // ---------------------------------------------------------------------------

  /**
   * Watch for changes (async).
   * @param {Object} callbacks
   * @returns {Promise<Object>}
   */
  async observeAsync(callbacks) {
    // Use LocalCollection._observeFromObserveChanges for compatibility
    return LocalCollection._observeFromObserveChanges(this, callbacks);
  }

  /**
   * Synchronous-API alias used by `LocalCollection._observeFromObserveChanges`.
   * AFSCursor is async-first, so this returns the same promise.
   */
  observeChanges(callbacks, options = {}) {
    return this.observeChangesAsync(callbacks, options);
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

    if (this._provider.supportsEventEmitter()) {
      // New EventEmitter path: provider returns a ChangeStream,
      // and the provider's _getMultiplexer handles caching and fan-out
      return this._provider._getMultiplexer(
        this._cursorDescription,
        ordered
      ).then(multiplexer => multiplexer.addHandle(callbacks, options));
    }

    // Legacy callback path (unchanged)
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

        // Lifecycle events — forward to subscription when supported
        error(err) {
          Meteor._debug('Cursor error in publication for ' + collection + ':', err);
          if (typeof sub.error === 'function') {
            sub.error(new Meteor.Error('observe-error', err.message));
          }
        },
        reconnected() {
          Meteor._debug('Cursor reconnected for ' + collection);
        },
        reset() {
          Meteor._debug('Cursor reset for ' + collection);
        },
      },
      { nonMutatingCallbacks: true }
    );

    // Clean up observer when subscription stops. observeHandle.stop() is
    // synchronous — no async wrapper needed.
    sub.onStop(function () {
      observeHandle.stop();
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
