import { ChangeStream } from '../reactive/change-stream';
import { ObserveMultiplexer } from '../reactive/observe-multiplexer';

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
 * Thrown when a base-class method that the provider was expected to override
 * is called without an override. Distinct from `ProviderClosedError` (provider
 * was closed) and any future operational errors.
 */
export class NotImplementedError extends Error {
  constructor(className, methodName) {
    super(`${className}.${methodName}() must be implemented`);
    this.name = 'NotImplementedError';
    this.code = 'not-implemented';
  }
}

/**
 * StreamProvider — abstract base class for all AFS data source adapters.
 *
 * afs is a Mongo-DX mapping contract: every adapter implements the same
 * Mongo-shaped CRUD and observe surface. The adapter author decides HOW the
 * adapter satisfies each method (Postgres compiles to SQL, Redis maps to its
 * primitives, etc.) — but the surface is uniform so Meteor app developers
 * write identical code regardless of which backend the Collection lives in.
 *
 * ## Provider implementer's contract
 *
 * Required overrides:
 *   - connect(), close()
 *   - insertAsync(), updateAsync(), removeAsync()
 *   - find(), fetchResults()
 *   - One reactive path:
 *       observeChanges()  OR  (startObserving() + supportsEventEmitter() returning true)
 *   - createIndexAsync(), dropIndexAsync()
 *
 * Optional overrides:
 *   - findOneAsync, upsertAsync, countAsync
 *   - generateId, convertToStoreType, convertFromStoreType
 *   - capabilities (defaults to a conservative dict; override to declare features)
 *   - rawDatabase, rawCollection
 *
 * Protected hooks (call but don't override unless extending):
 *   - _assertOpen, _getMultiplexer, _createMultiplexer, _closeMultiplexers
 *
 * Unimplemented required overrides throw `NotImplementedError`.
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
   * @protected
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
    throw new NotImplementedError(this.constructor.name, 'connect');
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
   * @protected
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
    throw new NotImplementedError(this.constructor.name, 'insertAsync');
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
    throw new NotImplementedError(this.constructor.name, 'updateAsync');
  }

  /**
   * Remove documents matching a selector.
   * @param {string} collectionName
   * @param {Object} selector - MongoDB-style selector
   * @returns {Promise<number>} Number of removed documents
   */
  async removeAsync(collectionName, selector) {
    this._assertOpen('removeAsync');
    throw new NotImplementedError(this.constructor.name, 'removeAsync');
  }

  /**
   * Find a single document matching the selector.
   * @param {string} collectionName
   * @param {Object} selector - MongoDB-style selector
   * @param {Object} [options]
   * @returns {Promise<Object|undefined>}
   */
  async findOneAsync(collectionName, selector, options) {
    this._assertOpen('findOneAsync');
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
    this._assertOpen('upsertAsync');
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
    this._assertOpen('countAsync');
    const docs = await this.fetchResults(collectionName, selector, options || {});
    return docs.length;
  }

  /**
   * Fetch results for a query. Override in subclasses.
   * @param {string} collectionName
   * @param {Object} selector
   * @param {Object} options
   * @returns {Promise<Array>}
   */
  async fetchResults(collectionName, selector, options) {
    this._assertOpen('fetchResults');
    throw new NotImplementedError(this.constructor.name, 'fetchResults');
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
    throw new NotImplementedError(this.constructor.name, 'find');
  }

  // ---------------------------------------------------------------------------
  // Reactive observer support
  // ---------------------------------------------------------------------------

  /**
   * LEGACY callback-based reactive path. Implement this OR
   * {@link startObserving}+{@link supportsEventEmitter}, never both.
   *
   * The cursor dispatches on `supportsEventEmitter()` — returning `true`
   * routes through the EventEmitter path and skips `observeChanges` entirely.
   * New providers should prefer the EventEmitter path: it participates in
   * the provider's multiplexer cache, snapshot-plus-replay late-join, and
   * automatic engine metrics. `observeChanges` bypasses all of that — each
   * call stands up its own observer.
   *
   * @param {Object} cursorDescription - Describes the query (collectionName, selector, options)
   * @param {boolean} ordered - Whether to track document ordering
   * @param {Object} callbacks - { added, changed, removed } or { addedBefore, changed, movedBefore, removed }
   * @param {Object} [options]
   * @returns {Promise<{stop: Function}>} An observe handle with a stop() method
   */
  async observeChanges(cursorDescription, ordered, callbacks, options) {
    this._assertOpen('observeChanges');
    throw new NotImplementedError(this.constructor.name, 'observeChanges');
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
    throw new NotImplementedError(this.constructor.name, 'createIndexAsync');
  }

  /**
   * Drop an index from a collection.
   * @param {string} collectionName
   * @param {string} indexName
   * @returns {Promise<void>}
   */
  async dropIndexAsync(collectionName, indexName) {
    this._assertOpen('dropIndexAsync');
    throw new NotImplementedError(this.constructor.name, 'dropIndexAsync');
  }

  // ---------------------------------------------------------------------------
  // Raw access (adapter-specific escape hatch)
  // ---------------------------------------------------------------------------

  /** Adapter-specific raw database client (e.g. MongoDB Db, pg Pool). */
  rawDatabase() { return null; }

  /** Adapter-specific raw collection/table handle. */
  rawCollection(collectionName) { return null; }

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

  /** Convert a Meteor document to the store's native format before writing. */
  convertToStoreType(doc) { return doc; }

  /** Convert a document from the store's native format after reading. */
  convertFromStoreType(doc) { return doc; }

  // ---------------------------------------------------------------------------
  // Capabilities declaration
  // ---------------------------------------------------------------------------

  /**
   * Declare what this provider supports. Used by FederatedCollection and
   * the adaptive engine to optimize behavior.
   *
   * `reactiveQueries: true` reflects that every StreamProvider MUST implement
   * either `observeChanges` or `startObserving` — reactivity is not optional.
   * Providers that want to declare non-reactive capabilities should still
   * satisfy the observe contract; otherwise subscriptions will fail.
   *
   * @returns {Object}
   */
  capabilities() {
    return {
      reactiveQueries: true,
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
  supportsEventEmitter() {
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
    throw new NotImplementedError(
      this.constructor.name,
      'startObserving (when supportsEventEmitter() returns true)'
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
   * @protected
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
   *
   * Provider teardown contract:
   *   `startObserving` may return either a bare `ChangeStream` (legacy form,
   *   used by mock and mongo providers) or `{ stream, teardown }` (new form,
   *   used by providers that own resources — polling timers, LISTEN handlers,
   *   reconnect listeners — that must be released when the subscription's
   *   refcount hits zero). afs guarantees `teardown` is invoked at most once
   *   per `startObserving` return, with errors caught and logged. Teardown
   *   precedes `stream.stop()` on the eviction (onEmpty) and construction-
   *   failure paths; on `_closeMultiplexers` and provider self-stop paths,
   *   a safety-net `stream.once('stop', …)` listener fires teardown during
   *   stream stop.
   * @protected
   */
  async _createMultiplexer(cursorDescription, ordered, key) {
    const result = this.startObserving(cursorDescription, ordered);

    // Discriminate the union return type: bare ChangeStream (legacy) or
    // { stream, teardown } (new). Reject anything else with a TypeError
    // naming the offending provider class.
    let stream, providerTeardown;
    if (result instanceof ChangeStream) {
      stream = result;
      providerTeardown = null;
    } else if (
      result &&
      result.stream instanceof ChangeStream &&
      typeof result.teardown === 'function'
    ) {
      stream = result.stream;
      providerTeardown = result.teardown;
    } else {
      throw new TypeError(
        `${this.constructor.name}.startObserving must return a ChangeStream ` +
        `or { stream: ChangeStream, teardown: Function }; got ${
          result === null ? 'null' : typeof result
        }`
      );
    }

    // Wrap teardown: at-most-once + error catch. afs owns the guard so
    // providers don't have to write their own.
    let teardownInvoked = false;
    const safeTeardown = () => {
      if (teardownInvoked || !providerTeardown) return;
      teardownInvoked = true;
      try {
        providerTeardown();
      } catch (e) {
        if (typeof Meteor !== 'undefined' && Meteor._debug) {
          Meteor._debug(
            `${this.constructor.name}.startObserving teardown threw:`,
            e
          );
        }
      }
    };

    // Defensive: a contract-violating provider that synchronously stops
    // the stream inside startObserving would have its 'stop' listener
    // registered too late to fire. Run teardown explicitly and bail.
    if (stream.isStopped()) {
      safeTeardown();
      throw new Error(
        `${this.constructor.name}.startObserving returned an already-stopped stream`
      );
    }

    // Safety net: any path ending in stream.stop() runs teardown. Covers
    // _closeMultiplexers (which bypasses onEmpty by stopping the stream
    // directly) and provider-initiated fatal stops. Onset is non-issue
    // because the at-most-once flag short-circuits redundant calls.
    if (providerTeardown) {
      stream.once('stop', safeTeardown);
    }

    // Contract check: the provider MUST NOT emit synchronously from
    // startObserving (see the JSDoc on startObserving for the full rule).
    // If the stream is already ready here, the provider either emitted
    // initial adds or markReady before we could attach listeners — any
    // data events that preceded this line have already been silently
    // dropped. Warn so the provider author notices.
    if (stream.isReady() && typeof Meteor !== 'undefined') {
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
          // Explicit ordering: teardown BEFORE stream.stop() on the normal
          // eviction path. The safety-net once-listener will then fire
          // during stream.stop(), but at-most-once makes it a no-op.
          safeTeardown();
          stream.stop();
        },
      });
    } catch (err) {
      if (detachEngine) detachEngine();
      // Same explicit ordering on the construction-failure path.
      safeTeardown();
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
   * Stop every cached multiplexer whose cursor description targets the
   * given collection and evict its cache entry. Used by
   * `FederatedCollection.destroy()` / `dropCollectionAsync()` so a
   * collection tear-down does not leave stopped streams pinned in the
   * cache or live observers writing into dropped storage.
   *
   * Best-effort: a stop() that throws is swallowed so one broken stream
   * cannot leave later entries pinned.
   *
   * @param {string} name
   */
  stopObserversForCollection(name) {
    if (!name) return;
    const stale = [];
    for (const [key, multiplexer] of this._multiplexerCache) {
      const desc = multiplexer.cursorDescription;
      if (desc && desc.collectionName === name) {
        stale.push([key, multiplexer]);
      }
    }
    for (const [, multiplexer] of stale) {
      try { multiplexer.stop(); } catch (_e) { /* best-effort */ }
    }
    for (const [key] of stale) {
      this._multiplexerCache.delete(key);
    }
  }

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
