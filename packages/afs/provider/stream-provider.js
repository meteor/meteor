import { ChangeStream } from '../reactive/change-stream';
import { ObserveMultiplexer } from '../reactive/observe-multiplexer';
import { applyModifier } from '../query/apply-modifier';

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
 * Thrown when a provider is asked to perform an operation it does not support
 * (capability gating, unsupported operators, missing feature for this backend).
 */
export class NotSupportedError extends Error {
  constructor(providerName, feature, details) {
    super(`${providerName} does not support ${feature}${details ? ': ' + details : ''}`);
    this.name = 'NotSupportedError';
    this.code = 'not-supported';
  }
}

/**
 * Thrown when a write fails because of a concurrent conflict — serialization
 * failure, optimistic-lock failure, or write-write conflict. The `cause`
 * (when supplied) preserves the underlying driver error for diagnostics.
 */
export class ConflictError extends Error {
  constructor(message, { cause } = {}) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'ConflictError';
    this.code = 'conflict';
  }
}

/**
 * Thrown when an operation fails because the underlying connection to the
 * data source was lost (network failure, driver disconnect). The `cause`
 * (when supplied) preserves the underlying driver error for diagnostics.
 */
export class ConnectionLostError extends Error {
  constructor(providerName, { cause } = {}) {
    super(
      `${providerName} connection lost`,
      cause !== undefined ? { cause } : undefined
    );
    this.name = 'ConnectionLostError';
    this.code = 'connection-lost';
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
 *   - generateId
 *   - capabilities (defaults to a conservative dict; override to declare features)
 *   - rawDatabase, rawCollection
 *
 * Protected hooks (call but don't override unless extending):
 *   - _assertOpen, _getMultiplexer, _createMultiplexer, _closeMultiplexers
 *
 * Lifecycle hooks (override in subclasses, no-op defaults):
 *   - _drainPendingWrites — await in-flight writes during close()
 *   - _closeTransport     — release pool / sockets / driver during close()
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
    // In-flight close() promise. Cached so concurrent close() callers
    // observe the same teardown rather than racing.
    this._closing = null;
  }

  // ---------------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------------

  /**
   * @protected
   * Throws ProviderClosedError if this provider has been closed OR is in the
   * middle of closing. The state machine is `'open' → 'closing' → 'closed'`;
   * only `'open'` admits new work. As soon as `close()` flips the state to
   * `'closing'`, any concurrent caller (a write racing against teardown, an
   * observe attempt mid-drain) fails fast with `ProviderClosedError` instead
   * of slipping through behind a half-torn-down transport.
   */
  _assertOpen(methodName) {
    if (this._state !== 'open') {
      throw new ProviderClosedError(this.constructor.name, methodName);
    }
  }

  /**
   * Establish connection to the data source.
   *
   * ## State-machine semantics
   *
   * `connect()` is gated by `_assertOpen`, which means `'closed'` is terminal
   * at the base contract: a provider that has been through `close()` cannot
   * be reconnected by calling `connect()` directly — `_assertOpen` will throw
   * `ProviderClosedError`.
   *
   * Subclasses that wish to support reopen MUST flip `_state = 'open'`
   * themselves before calling `super.connect()`, or simply not call super
   * (the base implementation throws `NotImplementedError` anyway). See
   * `MockStreamProvider.connect()` for the canonical reopen pattern.
   *
   * @returns {Promise<void>}
   */
  async connect() {
    this._assertOpen('connect');
    throw new NotImplementedError(this.constructor.name, 'connect');
  }

  /**
   * Close the provider and release every resource it owns.
   *
   * ## Canonical teardown order (the contract subclasses rely on)
   *
   *   1. **Stop accepting new work.** `_state` flips from `'open'` to
   *      `'closing'` synchronously, before any awaits. From this point on
   *      every `_assertOpen` caller — writes, finds, observes — fails with
   *      `ProviderClosedError`. New observe attempts via `_getMultiplexer`
   *      also reject for the same reason.
   *   2. **Stop reactive deliveries.** `_closeMultiplexers()` tears down all
   *      cached observe drivers (multiplexers + their underlying streams +
   *      provider teardown hooks) before any in-flight write is awaited, so
   *      a still-live observer cannot fire a notification into a draining
   *      write path.
   *   3. **Drain in-flight writes.** `await _drainPendingWrites()`. Default
   *      no-op. Subclasses override to await tracked write futures (and may
   *      bound the wait — the base does not impose a timeout). Concurrent
   *      writers that arrived between steps 1 and 3 are already rejected by
   *      `_assertOpen`; this drains the writes that started before step 1.
   *   4. **Close transport.** `await _closeTransport()`. Default no-op.
   *      Subclasses override to end pools, close sockets, send `UNLISTEN *`,
   *      etc. Runs after multiplexers are dead and writes have settled, so
   *      the transport can shut down without orphaning callbacks or losing
   *      ack-paths.
   *   5. **Mark closed.** `_state` flips to `'closed'` and `_connected` is
   *      cleared. Idempotent: a second `close()` returns immediately.
   *
   * Subclasses SHOULD override `_drainPendingWrites()` and/or
   * `_closeTransport()` rather than `close()` itself — the base is the
   * canonical orchestrator. Subclasses that must override `close()` for
   * back-compat MUST call `super.close()` LAST and put their work inside
   * `_closeTransport()` shape (otherwise the contract above does not hold).
   *
   * Idempotent: safe to call more than once. A second invocation while a
   * first is still in `'closing'` returns the same in-flight promise — both
   * callers resolve (or reject) together once the first run reaches
   * `'closed'`. A call after the first has settled returns immediately.
   *
   * ## Error contract for hook failures
   *
   * `_drainPendingWrites` and `_closeTransport` are invoked best-effort and
   * independently: `_closeTransport` ALWAYS runs, even if `_drainPendingWrites`
   * rejects, because a leaked pool / socket is a worse outcome than a lost
   * drain error. If either hook (or both) rejects, `close()` rejects with the
   * FIRST error encountered — drain's error if drain threw, otherwise
   * transport's error. The `_state` flips to `'closed'` regardless, so the
   * provider never gets stuck in `'closing'`.
   *
   * @returns {Promise<void>}
   */
  async close() {
    if (this._state === 'closed') return;
    if (this._closing) return this._closing;
    this._state = 'closing';
    this._closing = (async () => {
      try {
        // Step 2: stop reactive deliveries.
        this._closeMultiplexers();
        // Steps 3 + 4: drain and transport-close are best-effort and
        // independent. _closeTransport MUST run even if _drainPendingWrites
        // throws (otherwise a transport leak hides behind a drain error).
        let firstError = null;
        try {
          await this._drainPendingWrites();
        } catch (e) {
          firstError = e;
        }
        try {
          await this._closeTransport();
        } catch (e) {
          firstError = firstError || e;
        }
        if (firstError) throw firstError;
      } finally {
        // Step 5: mark closed even if a hook threw, so the provider does not
        // get stuck in 'closing' forever.
        this._state = 'closed';
        this._connected = false;
        this._closing = null;
      }
    })();
    return this._closing;
  }

  /**
   * Subclass hook (step 3 of `close()`): await every in-flight write so the
   * transport close that follows does not abort an unacknowledged INSERT/
   * UPDATE/DELETE.
   *
   * Default: no-op (resolves immediately) — adapters with no write tracking
   * skip this step. Adapters that DO track in-flight writes return a Promise
   * that settles when they have all completed; if the adapter wants a bound,
   * it imposes one itself (the base does not provide a default timeout).
   *
   * Called after multiplexers have been stopped and before `_closeTransport`.
   * Concurrent writers arriving after `close()` started are already rejected
   * by `_assertOpen` (state is `'closing'`), so this hook only needs to wait
   * for writes that began while the provider was still `'open'`.
   *
   * @returns {Promise<void>}
   * @protected
   */
  async _drainPendingWrites() {
    // No-op default. Adapters with write tracking override.
  }

  /**
   * Subclass hook (step 4 of `close()`): release transport-owned resources —
   * end the connection pool, close LISTEN sockets, etc. Runs after
   * multiplexers have been stopped and writes have drained, so the transport
   * teardown does not race a live observer or an unacked write.
   *
   * Default: no-op.
   *
   * @returns {Promise<void>}
   * @protected
   */
  async _closeTransport() {
    // No-op default. Adapters with transport state override.
  }

  /**
   * Stop all cached multiplexers and their underlying ChangeStreams.
   * Called automatically from close().
   *
   * Sync by contract; emit-during-tear-down is not supported. Multiplexer /
   * stream stop callbacks that synchronously emit observe events into a
   * draining provider violate the close() ordering and will surface as
   * dropped or undefined-target deliveries.
   *
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
  // Fetch-modify-write template (generic SELECT-FOR-UPDATE → modify → UPDATE)
  // ---------------------------------------------------------------------------

  /**
   * Generic fetch-modify-write loop. Universal across backends that can lock
   * rows (or fetch optimistically) and write them back: SQL `SELECT ... FOR
   * UPDATE`, Redis `WATCH`/`MULTI`, REST `If-Match` PATCH, etc. afs owns the
   * loop, the modifier application via `applyModifier`, and the
   * conflict-retry policy. Subclasses override the four hooks below to
   * supply backend-specific lock + write + retry-classification logic.
   *
   * Behavior (per attempt, up to `maxAttempts`):
   *   1. `locked = await _lockMatching(collectionName, selector, opts)` —
   *      returns the rows to modify. Single-row by default; if `opts.multi`
   *      is true, the hook decides whether and how to lock multiple rows.
   *   2. If `locked.length === 0`, return `{ matchedCount: 0,
   *      modifiedCount: 0 }`.
   *   3. For each `row` in `locked`, call `applyModifier(row, modifier,
   *      applyOptions)` to mutate it in place, then
   *      `await _writeRow(collectionName, modifiedRow, originalRow, opts)`.
   *   4. Return `{ matchedCount, modifiedCount }`.
   *
   * If any step throws and `_isRetryableConflict(err)` returns truthy, retry
   * on a fresh attempt. Past `maxAttempts`, the last conflict surfaces as
   * `ConflictError(... { cause: lastErr })`. Non-conflict errors propagate
   * raw.
   *
   * The base loop is transaction-agnostic: subclasses that need atomic
   * lock-modify-write semantics open the transaction in `_lockMatching`
   * (typically returning a context handle stashed on `opts`) and consume
   * it in `_writeRow`. Subclasses that fetch optimistically (REST PATCH,
   * Redis without WATCH) skip the transaction entirely and rely on the
   * retry loop to recover from concurrent writes.
   *
   * @param {string} collectionName
   * @param {Object} selector
   * @param {Object} modifier
   * @param {Object} [opts]
   * @param {number} [opts.maxAttempts=3]
   * @param {Object} [opts.applyOptions] Forwarded to applyModifier.
   * @param {boolean} [opts.multi=false] Multi-row update (hook-dependent).
   * @returns {Promise<{ matchedCount: number, modifiedCount: number }>}
   * @protected
   */
  async _fetchModifyWrite(collectionName, selector, modifier, opts = {}) {
    return this._runFetchModifyWriteLoop(opts, '_fetchModifyWrite', async () => {
      const locked = await this._lockMatching(collectionName, selector, opts);
      if (!locked || locked.length === 0) {
        return { matchedCount: 0, modifiedCount: 0 };
      }
      const modifiedCount = await this._applyModifierToLocked(
        collectionName, locked, modifier, opts
      );
      return { matchedCount: locked.length, modifiedCount };
    });
  }

  /**
   * Same loop as {@link _fetchModifyWrite} but with insert-on-no-match. If
   * `_lockMatching` returns no rows on the first successful attempt, the
   * hook builds an insert document via `_buildInsertDoc(selector, modifier)`,
   * applies the modifier with `{ isInsert: true }`, and calls `_writeRow`
   * with `opts.isInsert = true`. The returned `insertedId` comes from the
   * built document's `_id`.
   *
   * Like `_fetchModifyWrite`, the loop retries on conflicts (per
   * `_isRetryableConflict`) up to `maxAttempts` and surfaces a
   * `ConflictError` past that.
   *
   * @param {string} collectionName
   * @param {Object} selector
   * @param {Object} modifier
   * @param {Object} [opts]
   * @returns {Promise<{ matchedCount: number, modifiedCount: number,
   *   insertedId?: any }>}
   * @protected
   */
  async _fetchModifyWriteUpsert(collectionName, selector, modifier, opts = {}) {
    return this._runFetchModifyWriteLoop(opts, '_fetchModifyWriteUpsert', async () => {
      const locked = await this._lockMatching(collectionName, selector, opts);
      if (locked && locked.length > 0) {
        const modifiedCount = await this._applyModifierToLocked(
          collectionName, locked, modifier, opts
        );
        return { matchedCount: locked.length, modifiedCount, insertedId: undefined };
      }
      // No match → insert path.
      const insertDoc = this._buildInsertDoc(selector, modifier);
      applyModifier(insertDoc, modifier, {
        ...(opts.applyOptions || {}),
        isInsert: true,
      });
      await this._writeRow(collectionName, insertDoc, null, { ...opts, isInsert: true });
      return { matchedCount: 0, modifiedCount: 0, insertedId: insertDoc._id };
    });
  }

  /**
   * Shared retry/finalize/conflict shell for `_fetchModifyWrite` and
   * `_fetchModifyWriteUpsert`. Runs `runAttempt()` up to `opts.maxAttempts`
   * times, invoking `_finalizeAttempt` after each attempt (success or
   * failure), and translating sustained conflicts into a `ConflictError`.
   *
   * @param {Object} opts             Caller's opts object (maxAttempts read here).
   * @param {string} methodName       Name surfaced in the exhausted-retries error.
   * @param {() => Promise<Object>} runAttempt  Single-attempt body returning the result.
   * @protected
   */
  async _runFetchModifyWriteLoop(opts, methodName, runAttempt) {
    const maxAttempts = opts.maxAttempts || 3;
    let lastErr = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let attemptError = null;
      let result = null;
      try {
        result = await runAttempt();
      } catch (e) {
        attemptError = e;
      }

      // Per-attempt cleanup hook (commit/rollback/release for transactional
      // adapters). Runs whether the attempt succeeded or threw. If the
      // attempt itself succeeded but finalize threw, surface the finalize
      // error; if the attempt threw, prefer the original error.
      try {
        await this._finalizeAttempt(opts, attemptError);
      } catch (finalizeErr) {
        if (!attemptError) attemptError = finalizeErr;
      }

      if (!attemptError) return result;

      const retryable = this._isRetryableConflict(attemptError);
      if (retryable && attempt < maxAttempts) {
        lastErr = attemptError;
        continue;
      }
      if (retryable) {
        throw new ConflictError(
          `serialization conflict after ${maxAttempts} retries`,
          { cause: attemptError }
        );
      }
      throw attemptError;
    }

    // Unreachable when maxAttempts >= 1, but keep a guard for maxAttempts=0.
    throw lastErr || new Error(
      `${this.constructor.name}.${methodName}: exhausted retries`
    );
  }

  /**
   * Apply `modifier` to every row in `locked`, writing each via `_writeRow`.
   * Returns the count of rows written.
   *
   * @param {string} collectionName
   * @param {Array<Object>} locked    Rows from `_lockMatching`.
   * @param {Object} modifier
   * @param {Object} opts
   * @returns {Promise<number>}
   * @protected
   */
  async _applyModifierToLocked(collectionName, locked, modifier, opts) {
    let modifiedCount = 0;
    for (const row of locked) {
      const original = row;
      // applyModifier mutates in place and returns the modified doc.
      applyModifier(row, modifier, opts.applyOptions);
      await this._writeRow(collectionName, row, original, opts);
      modifiedCount++;
    }
    return modifiedCount;
  }

  /**
   * Lock-and-fetch rows matching `selector`. The default throws
   * `NotImplementedError`; subclasses that use `_fetchModifyWrite` /
   * `_fetchModifyWriteUpsert` MUST override.
   *
   * Sources without row-level locking (REST PATCH, Redis without WATCH)
   * may fetch optimistically — the retry loop handles concurrent writes
   * via `_isRetryableConflict`.
   *
   * @param {string} collectionName
   * @param {Object} selector
   * @param {Object} opts Forwarded from the template method. Subclasses
   *   may stash a transaction / lock-context handle on `opts` here for
   *   `_writeRow` to consume.
   * @returns {Promise<Array<Object>>} Matching rows (mutated in place by
   *   the loop's `applyModifier` call — return clones if the hook needs
   *   to retain the originals).
   * @protected
   */
  async _lockMatching(collectionName, selector, opts) {
    throw new NotImplementedError(this.constructor.name, '_lockMatching');
  }

  /**
   * Write a row that has already been modified by `applyModifier` (or, on
   * the upsert insert path, freshly built by `_buildInsertDoc`). Subclasses
   * MUST override.
   *
   * `originalRow` is `null` on the upsert insert path; otherwise it is the
   * row reference returned from `_lockMatching` (same reference as `row`,
   * since the loop mutates in place). `opts.isInsert === true` distinguishes
   * the insert case.
   *
   * @param {string} collectionName
   * @param {Object} row Modified or inserted document.
   * @param {Object|null} originalRow
   * @param {Object} opts
   * @returns {Promise<void>}
   * @protected
   */
  async _writeRow(collectionName, row, originalRow, opts) {
    throw new NotImplementedError(this.constructor.name, '_writeRow');
  }

  /**
   * Decide whether `err` is a retryable conflict (e.g., Postgres SQLSTATE
   * 40001 serialization failure, optimistic-lock failure, version mismatch).
   * The default never retries; subclasses override to opt into retry.
   *
   * @param {Error} err
   * @returns {boolean}
   * @protected
   */
  _isRetryableConflict(err) {
    return false;
  }

  /**
   * Build the document to insert when `_fetchModifyWriteUpsert` finds no
   * matching row. The default throws `NotImplementedError`; only required
   * when the caller routes through the upsert template.
   *
   * Implementations typically copy scalar equality fields out of `selector`
   * and seed an `_id` (calling `generateId` when absent). The loop then
   * applies the modifier with `{ isInsert: true }` on top.
   *
   * @param {Object} selector
   * @param {Object} modifier
   * @returns {Object} New document.
   * @protected
   */
  _buildInsertDoc(selector, modifier) {
    throw new NotImplementedError(this.constructor.name, '_buildInsertDoc');
  }

  /**
   * Per-attempt cleanup hook. Invoked by the fetch-modify-write loop after
   * each attempt — successful or failed — and before the loop decides
   * whether to retry. The default is a no-op; transactional adapters
   * override to commit on success and roll back on error, plus release
   * any client/connection stashed on `opts` by `_lockMatching`.
   *
   * `error` is `null` on success and the thrown error on failure. The hook
   * MUST be safe to call multiple times across attempts and MUST NOT throw
   * for cleanup paths that already settled (e.g., a release on a
   * not-yet-acquired client). If the hook itself throws and the attempt
   * was otherwise successful, the loop surfaces the cleanup error;
   * otherwise the original attempt error wins.
   *
   * Subclasses with per-attempt transactional state (e.g., a row lock or an
   * open client) MUST clear that state from `opts` (e.g.,
   * `opts._client = null`) inside this hook. Otherwise the next attempt
   * will see stale context — `_lockMatching` is expected to attach a fresh
   * client every iteration.
   *
   * Called even on the no-match branch (when `matchedCount === 0`).
   * Implementations doing transaction commit/rollback should be safe to
   * commit empty transactions — Postgres `COMMIT` on a transaction that
   * issued only a SELECT is a no-op, and other backends should treat the
   * matching empty-commit case identically.
   *
   * @param {Object} opts The same opts object passed through the loop.
   * @param {Error|null} error
   * @returns {Promise<void>}
   * @protected
   */
  async _finalizeAttempt(opts, error) {
    // No-op default. Transactional adapters override.
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
    // Reactive observe is the EventEmitter equivalent of CRUD entry points;
    // gate it on the same state machine so an observe attempt arriving
    // mid-`close()` (state = 'closing') rejects with ProviderClosedError
    // instead of standing up a multiplexer the close() about to drain.
    this._assertOpen('observeChanges');
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
    const engine = global.AFS && global.AFS._engine;
    if (engine) {
      detachEngine = engine.attachToStream(stream);
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
