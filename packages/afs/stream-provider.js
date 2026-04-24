import { ChangeStream } from './change-stream';
import { ObserveMultiplexer } from './observe-multiplexer';

/**
 * Thrown when a method is called on a StreamProvider that has been closed.
 */
export class ProviderClosedError extends Error {
  constructor(providerName, methodName) {
    super(`${providerName}.${methodName}() called on a closed provider`);
    this.name = 'ProviderClosedError';
    this.code = 'provider-closed';
  }
}

/**
 * StreamProvider - Abstract base class for all AFS data source adapters.
 *
 * Each data source (MongoDB, PostgreSQL, Redis, Kafka, etc.) implements this
 * interface to participate in Meteor's reactive data system. A StreamProvider
 * handles all communication with the underlying data store.
 *
 * Subclasses MUST implement: connect, close, insertAsync, updateAsync,
 * removeAsync, find, observeChanges, _fetchResults (cursor.fetchAsync,
 * cursor.countAsync, and the default countAsync all delegate to it).
 *
 * Subclasses SHOULD implement: findOneAsync, upsertAsync, createIndexAsync,
 * dropIndexAsync, rawDatabase, rawCollection, capabilities.
 *
 * Subclasses MAY implement: _supportsEventEmitter, startObserving
 * (to opt into the EventEmitter-based reactive path via ChangeStream).
 */
export class StreamProvider {
  /**
   * @param {Object} options
   * @param {string} options.name - Human-readable provider name (e.g., 'mongo', 'postgres')
   */
  constructor(options = {}) {
    if (new.target === StreamProvider) {
      throw new Error('StreamProvider is abstract and cannot be instantiated directly');
    }
    this.name = options.name || 'unknown';
    this._connected = false;
    this._state = 'open';
    this._collections = new Map();
    this._multiplexerCache = new Map();
    this._multiplexerPending = new Map();
  }

  // ---------------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------------

  /**
   * @private
   * Throws ProviderClosedError if this provider has been closed.
   */
  _assertOpen(methodName) {
    if (this._state === 'closed') {
      throw new ProviderClosedError(this.constructor.name, methodName);
    }
  }

  /**
   * Establish connection to the data source.
   * @returns {Promise<void>}
   */
  async connect() {
    this._assertOpen('connect');
    throw new Error(`${this.constructor.name}.connect() must be implemented`);
  }

  /**
   * Close the connection to the data source.
   * Subclasses SHOULD call super.close() as the LAST step of their cleanup.
   * The base implementation stops all cached multiplexers, marks the provider
   * as closed, and is safe to call more than once.
   * @returns {Promise<void>}
   */
  async close() {
    if (this._state === 'closed') return;
    this._closeMultiplexers();
    this._state = 'closed';
    this._connected = false;
  }

  /**
   * Stop all cached multiplexers and their underlying ChangeStreams.
   * Called automatically from close().
   */
  _closeMultiplexers() {
    for (const [, multiplexer] of this._multiplexerCache) {
      if (!multiplexer._stream.isStopped()) {
        multiplexer._stream.stop();
      }
    }
    this._multiplexerCache.clear();
    this._multiplexerPending.clear();
  }

  /**
   * @returns {boolean} Whether this provider is currently connected
   */
  isConnected() {
    return this._connected;
  }

  // ---------------------------------------------------------------------------
  // CRUD operations
  // ---------------------------------------------------------------------------

  /**
   * Insert a document into a collection.
   * @param {string} collectionName
   * @param {Object} doc - The document to insert (may or may not have _id)
   * @returns {Promise<string>} The _id of the inserted document
   */
  async insertAsync(collectionName, doc) {
    this._assertOpen('insertAsync');
    throw new Error(`${this.constructor.name}.insertAsync() must be implemented`);
  }

  /**
   * Update documents matching a selector.
   * @param {string} collectionName
   * @param {Object} selector - MongoDB-style selector
   * @param {Object} modifier - MongoDB-style modifier ($set, $unset, etc.)
   * @param {Object} [options]
   * @param {boolean} [options.multi=false] - Update multiple documents
   * @param {boolean} [options.upsert=false] - Insert if no match found
   * @returns {Promise<number>} Number of affected documents
   */
  async updateAsync(collectionName, selector, modifier, options) {
    this._assertOpen('updateAsync');
    throw new Error(`${this.constructor.name}.updateAsync() must be implemented`);
  }

  /**
   * Remove documents matching a selector.
   * @param {string} collectionName
   * @param {Object} selector - MongoDB-style selector
   * @returns {Promise<number>} Number of removed documents
   */
  async removeAsync(collectionName, selector) {
    this._assertOpen('removeAsync');
    throw new Error(`${this.constructor.name}.removeAsync() must be implemented`);
  }

  /**
   * Find a single document matching the selector.
   * @param {string} collectionName
   * @param {Object} selector - MongoDB-style selector
   * @param {Object} [options]
   * @returns {Promise<Object|undefined>}
   */
  async findOneAsync(collectionName, selector, options) {
    // Default implementation using find().fetchAsync()
    const cursor = this.find(collectionName, selector, { ...options, limit: 1 });
    const docs = await cursor.fetchAsync();
    return docs[0];
  }

  /**
   * Upsert: update if exists, insert if not.
   * @param {string} collectionName
   * @param {Object} selector
   * @param {Object} modifier
   * @param {Object} [options]
   * @returns {Promise<{numberAffected: number, insertedId?: string}>}
   */
  async upsertAsync(collectionName, selector, modifier, options) {
    return this.updateAsync(collectionName, selector, modifier, {
      ...options,
      upsert: true,
    });
  }

  /**
   * Count documents matching a selector.
   * Default implementation fetches all and counts. Override for efficiency.
   * @param {string} collectionName
   * @param {Object} selector
   * @param {Object} [options]
   * @returns {Promise<number>}
   */
  async countAsync(collectionName, selector, options) {
    const docs = await this._fetchResults(collectionName, selector, options || {});
    return docs.length;
  }

  /**
   * Fetch results for a query. Override in subclasses.
   * @param {string} collectionName
   * @param {Object} selector
   * @param {Object} options
   * @returns {Promise<Array>}
   */
  async _fetchResults(collectionName, selector, options) {
    this._assertOpen('_fetchResults');
    throw new Error(`${this.constructor.name}._fetchResults() must be implemented`);
  }

  // ---------------------------------------------------------------------------
  // Query / Cursor support
  // ---------------------------------------------------------------------------

  /**
   * Create a cursor for querying a collection.
   * @param {string} collectionName
   * @param {Object} [selector={}] - MongoDB-style selector
   * @param {Object} [options={}] - sort, skip, limit, projection, transform
   * @returns {AFSCursor} A cursor implementing the Meteor cursor interface
   */
  find(collectionName, selector, options) {
    this._assertOpen('find');
    throw new Error(`${this.constructor.name}.find() must be implemented`);
  }

  // ---------------------------------------------------------------------------
  // Reactive observer support
  // ---------------------------------------------------------------------------

  /**
   * Observe changes to a query result set. This is the core reactive primitive.
   *
   * @param {Object} cursorDescription - Describes the query (collectionName, selector, options)
   * @param {boolean} ordered - Whether to track document ordering
   * @param {Object} callbacks - { added, changed, removed } or { addedBefore, changed, movedBefore, removed }
   * @param {Object} [options]
   * @returns {Promise<{stop: Function}>} An observe handle with a stop() method
   */
  async observeChanges(cursorDescription, ordered, callbacks, options) {
    this._assertOpen('observeChanges');
    throw new Error(`${this.constructor.name}.observeChanges() must be implemented`);
  }

  /**
   * Notify the system that a change occurred (for providers that push changes).
   * @param {string} collectionName
   * @param {Object} change - { type: 'added'|'changed'|'removed', id, fields, doc }
   */
  async publishChange(collectionName, change) {
    // Optional: override in providers that push changes externally
  }

  // ---------------------------------------------------------------------------
  // Index management
  // ---------------------------------------------------------------------------

  /**
   * Create an index on a collection.
   * @param {string} collectionName
   * @param {Object} index - Index specification (e.g., { fieldName: 1 })
   * @param {Object} [options] - Index options (unique, sparse, name, etc.)
   * @returns {Promise<void>}
   */
  async createIndexAsync(collectionName, index, options) {
    this._assertOpen('createIndexAsync');
    throw new Error(`${this.constructor.name}.createIndexAsync() must be implemented`);
  }

  /**
   * Drop an index from a collection.
   * @param {string} collectionName
   * @param {string} indexName
   * @returns {Promise<void>}
   */
  async dropIndexAsync(collectionName, indexName) {
    this._assertOpen('dropIndexAsync');
    throw new Error(`${this.constructor.name}.dropIndexAsync() must be implemented`);
  }

  // ---------------------------------------------------------------------------
  // Raw access (adapter-specific escape hatch)
  // ---------------------------------------------------------------------------

  /**
   * Get the raw database client for this provider.
   * Returns adapter-specific objects (e.g., MongoDB Db, pg Pool).
   * @returns {Object|null}
   */
  rawDatabase() {
    return null;
  }

  /**
   * Get the raw collection/table handle for adapter-specific operations.
   * @param {string} collectionName
   * @returns {Object|null}
   */
  rawCollection(collectionName) {
    return null;
  }

  // ---------------------------------------------------------------------------
  // ID generation
  // ---------------------------------------------------------------------------

  /**
   * Generate a new document ID for a collection.
   * Override to use database-native ID formats (UUID, serial, ObjectID, etc.)
   * @param {string} collectionName
   * @returns {string|Object} A new unique ID
   */
  generateId(collectionName) {
    return Random.id();
  }

  // ---------------------------------------------------------------------------
  // Type conversion
  // ---------------------------------------------------------------------------

  /**
   * Convert a Meteor document to the store's native format before writing.
   * @param {Object} doc
   * @returns {Object}
   */
  convertToStoreType(doc) {
    return doc;
  }

  /**
   * Convert a document from the store's native format after reading.
   * @param {Object} doc
   * @returns {Object}
   */
  convertFromStoreType(doc) {
    return doc;
  }

  // ---------------------------------------------------------------------------
  // Schema support
  // ---------------------------------------------------------------------------

  /**
   * Whether this provider supports schema-driven migrations.
   * @returns {boolean}
   */
  supportsSchema() {
    return false;
  }

  /**
   * Apply a schema migration for a collection.
   * @param {string} collectionName
   * @param {Object} schema - Schema definition
   * @returns {Promise<void>}
   */
  async migrateSchema(collectionName, schema) {
    // Optional: override in providers with schema support
  }

  // ---------------------------------------------------------------------------
  // Capabilities declaration
  // ---------------------------------------------------------------------------

  /**
   * Declare what this provider supports. Used by FederatedCollection and
   * the adaptive engine to optimize behavior.
   * @returns {Object}
   */
  capabilities() {
    return {
      reactiveQueries: false,
      transactions: false,
      changeStreams: false,
      oplog: false,
      fullTextSearch: false,
      geoQueries: false,
      aggregation: false,
      joins: false,
      upsert: true,
    };
  }

  // ---------------------------------------------------------------------------
  // EventEmitter-based reactive support (opt-in)
  // ---------------------------------------------------------------------------

  /**
   * Whether this provider supports the EventEmitter-based reactive path.
   * Override to return true when the provider implements startObserving().
   * @returns {boolean}
   */
  _supportsEventEmitter() {
    return false;
  }

  /**
   * Create a ChangeStream for a cursor description.
   * Convenience factory — providers can use this or construct ChangeStream directly.
   * @param {Object} cursorDescription
   * @returns {ChangeStream}
   */
  createChangeStream(cursorDescription) {
    return new ChangeStream(cursorDescription);
  }

  /**
   * Start observing a query and return a ChangeStream that emits changes.
   * Override this in providers that support EventEmitter mode.
   *
   * ## Event emission contract (MUST NOT violate)
   *
   * The caller (typically {@link _createMultiplexer}) attaches its
   * listeners AFTER this method returns. Therefore:
   *
   *   - The provider MUST NOT emit ANY event (added, addedBefore, changed,
   *     removed, movedBefore, ready, error, reset, reconnected, paused,
   *     resumed) synchronously during startObserving.
   *   - The provider MUST defer ALL initial emission to at least the next
   *     microtask (e.g. `Promise.resolve().then(...)` or `setImmediate`).
   *
   * Violating this contract will silently drop events — the multiplexer's
   * listeners aren't attached yet, so synchronously-emitted events go
   * nowhere. See {@link MockStreamProvider.startObserving} for the
   * canonical pattern.
   *
   * The returned ChangeStream must eventually emit 'ready' after sending
   * the initial result set via added/addedBefore events.
   *
   * @param {Object} cursorDescription
   * @param {boolean} ordered
   * @returns {ChangeStream}
   */
  startObserving(cursorDescription, ordered) {
    this._assertOpen('startObserving');
    throw new Error(
      `${this.constructor.name}.startObserving() must be implemented ` +
      `when _supportsEventEmitter() returns true`
    );
  }

  /**
   * Get or create a cached ObserveMultiplexer for a cursor description.
   * Ensures identical queries share the same multiplexer (and thus the
   * same underlying ChangeStream/driver), so late-joining observers
   * receive the correct initial state from the cache.
   *
   * @param {Object} cursorDescription
   * @param {boolean} ordered
   * @returns {Promise<ObserveMultiplexer>}
   */
  async _getMultiplexer(cursorDescription, ordered) {
    // Canonical stringify so semantically-equal cursor descriptions with
    // differing key-insertion orders dedupe to the same multiplexer.
    const key = EJSON.stringify({ ...cursorDescription, ordered }, { canonical: true });

    if (this._multiplexerCache.has(key)) {
      return this._multiplexerCache.get(key);
    }

    // Check if another call is already creating this multiplexer
    if (this._multiplexerPending.has(key)) {
      return this._multiplexerPending.get(key);
    }

    const promise = this._createMultiplexer(cursorDescription, ordered, key);
    this._multiplexerPending.set(key, promise);

    try {
      return await promise;
    } finally {
      this._multiplexerPending.delete(key);
    }
  }

  /**
   * Create a new multiplexer for a cursor description.
   *
   * Caches the multiplexer BEFORE any handle can be attached, so a reentrant
   * stop() fired synchronously during initial-adds cannot leave a stopped
   * multiplexer pinned in the cache. The onEmpty handler guards against
   * stale-reference deletions via an identity check on the cache entry.
   * @private
   */
  async _createMultiplexer(cursorDescription, ordered, key) {
    const stream = this.startObserving(cursorDescription, ordered);

    // Contract check: the provider MUST NOT emit synchronously from
    // startObserving (see the JSDoc on startObserving for the full rule).
    // If the stream is already ready here, the provider either emitted
    // initial adds or markReady before we could attach listeners — any
    // data events that preceded this line have already been silently
    // dropped. Warn so the provider author notices.
    if (stream._ready && typeof Meteor !== 'undefined') {
      Meteor._debug(
        `${this.constructor.name}.startObserving violated the sync-emission ` +
        `contract: stream is already ready before listeners could attach. ` +
        `Provider MUST defer initial emission to the next microtask.`
      );
    }

    // Auto-attach the adaptive engine for metrics collection
    let detachEngine = null;
    if (typeof AFS !== 'undefined' && AFS._engine) {
      detachEngine = AFS._engine.attachToStream(stream);
    }

    const self = this;
    let multiplexer;
    try {
      multiplexer = new ObserveMultiplexer(stream, ordered, {
        onEmpty() {
          // Only evict if we're still the cached entry for this key.
          // Prevents a late onEmpty from clobbering a replacement multiplexer
          // that a later _getMultiplexer call may have installed.
          if (self._multiplexerCache.get(key) !== multiplexer) return;
          self._multiplexerCache.delete(key);
          if (detachEngine) detachEngine();
          stream.stop();
        },
      });
    } catch (err) {
      if (detachEngine) detachEngine();
      stream.stop();
      throw err;
    }

    // Cache before returning so the entry is visible to onEmpty handlers that
    // may fire the moment a consumer attaches and synchronously calls stop().
    self._multiplexerCache.set(key, multiplexer);
    return multiplexer;
  }

  // ---------------------------------------------------------------------------
  // Collection tracking
  // ---------------------------------------------------------------------------

  /**
   * Register a collection with this provider.
   * @param {string} name
   * @param {Object} collection - The FederatedCollection instance
   */
  registerCollection(name, collection) {
    this._collections.set(name, collection);
  }

  /**
   * Get a registered collection by name.
   * @param {string} name
   * @returns {Object|undefined}
   */
  getCollection(name) {
    return this._collections.get(name);
  }
}
