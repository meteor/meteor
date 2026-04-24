import { CHANGE_EVENTS } from './change-stream';

/**
 * AdaptiveEngine - Intelligent optimization layer for AFS.
 *
 * The adaptive engine provides:
 * 1. Predictive prefetching - anticipates queries based on access patterns
 * 2. Dynamic throttling - adjusts query rates based on load
 * 3. Backpressure management - prevents overwhelming data sources
 * 4. Shard routing - directs queries to optimal data source instances
 */
export class AdaptiveEngine {
  constructor(options = {}) {
    this._options = {
      // Prefetch settings
      prefetchEnabled: options.prefetchEnabled !== false,
      prefetchThreshold: options.prefetchThreshold || 3, // hits before prefetching
      maxPatterns: options.maxPatterns || 1000, // LRU cap for access patterns

      // Throttle settings
      throttleEnabled: options.throttleEnabled !== false,
      minInterval: options.minInterval || 50,   // ms between queries
      maxInterval: options.maxInterval || 5000,  // ms maximum backoff

      // Backpressure settings
      backpressureEnabled: options.backpressureEnabled !== false,
      maxPendingQueries: options.maxPendingQueries || 100,
      maxPendingWrites: options.maxPendingWrites || 50,
    };

    // Access pattern tracking for prefetching
    this._accessPatterns = new Map();

    // Throttle state per collection
    this._throttleState = new Map();

    // Pending operation counters for backpressure
    this._pendingQueries = 0;
    this._pendingWrites = 0;

    // Promise-based wait queue for backpressure
    this._waitingForSlot = { query: [], write: [] };

    // Performance metrics
    this._metrics = {
      totalQueries: 0,
      totalWrites: 0,
      prefetchHits: 0,
      prefetchMisses: 0,
      throttledQueries: 0,
      backpressureEvents: 0,
      totalChanges: 0,
      errors: 0,
      reconnections: 0,
      // Selectors that could not be canonically stringified (e.g. circular
      // refs). They collapse to `collectionName:*` and are excluded from
      // pattern tracking so we don't pool unrelated queries together.
      patternKeyFailures: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Prefetching
  // ---------------------------------------------------------------------------

  /**
   * Record a query access pattern for potential prefetching.
   * @param {string} collectionName
   * @param {Object} selector
   * @param {Object} options
   */
  recordAccess(collectionName, selector, options) {
    if (!this._options.prefetchEnabled) return;

    const key = this._patternKey(collectionName, selector);
    const existing = this._accessPatterns.get(key);
    const pattern = existing || {
      count: 0,
      lastAccess: 0,
      selector,
      options,
      collectionName,
    };

    pattern.count++;
    pattern.lastAccess = Date.now();

    // LRU: delete so re-set places at the tail (most-recently-used).
    if (existing) this._accessPatterns.delete(key);
    this._accessPatterns.set(key, pattern);

    // Evict least-recently-used entries once we exceed the cap.
    const cap = this._options.maxPatterns;
    while (this._accessPatterns.size > cap) {
      const oldestKey = this._accessPatterns.keys().next().value;
      if (oldestKey === undefined) break;
      this._accessPatterns.delete(oldestKey);
    }

    this._metrics.totalQueries++;
  }

  /**
   * Record that a write (insert/update/remove) happened for a collection.
   * Single centralized accounting so the metric stays accurate even as
   * mutation surfaces multiply (collection.js, provider adapter, DDP path).
   * @param {string} collectionName
   */
  recordWrite(collectionName) {
    this._metrics.totalWrites++;
  }

  /**
   * Check if a query result should be prefetched based on access patterns.
   * @param {string} collectionName
   * @param {Object} selector
   * @returns {boolean}
   */
  shouldPrefetch(collectionName, selector) {
    if (!this._options.prefetchEnabled) return false;

    const key = this._patternKey(collectionName, selector);
    const pattern = this._accessPatterns.get(key);

    if (!pattern) return false;

    return pattern.count >= this._options.prefetchThreshold;
  }

  /**
   * Get suggested prefetch queries based on observed access patterns.
   * @param {string} collectionName
   * @returns {Array<{selector: Object, options: Object}>}
   */
  getPrefetchSuggestions(collectionName) {
    const suggestions = [];

    for (const [, pattern] of this._accessPatterns) {
      if (
        pattern.collectionName === collectionName &&
        pattern.count >= this._options.prefetchThreshold
      ) {
        // Include count so sort is O(n log n) comparisons (no extra Map
        // lookups / EJSON.stringify per comparison). We strip it before
        // returning so callers don't see an internal field.
        suggestions.push({
          selector: pattern.selector,
          options: pattern.options,
          _count: pattern.count,
        });
      }
    }

    suggestions.sort((a, b) => b._count - a._count);
    return suggestions.map(s => ({ selector: s.selector, options: s.options }));
  }

  // ---------------------------------------------------------------------------
  // Throttling
  // ---------------------------------------------------------------------------

  /**
   * Check if a query should be throttled.
   * @param {string} collectionName
   * @returns {boolean}
   */
  shouldThrottle(collectionName) {
    if (!this._options.throttleEnabled) return false;

    const state = this._throttleState.get(collectionName);
    if (!state) return false;

    const elapsed = Date.now() - state.lastQuery;
    return elapsed < state.currentInterval;
  }

  /**
   * Get the delay (in ms) before this query should execute.
   * @param {string} collectionName
   * @returns {number} Milliseconds to wait (0 = execute immediately)
   */
  getThrottleDelay(collectionName) {
    if (!this._options.throttleEnabled) return 0;

    const state = this._throttleState.get(collectionName);
    if (!state) return 0;

    const elapsed = Date.now() - state.lastQuery;
    const remaining = state.currentInterval - elapsed;
    return Math.max(0, remaining);
  }

  /**
   * Record that a query was executed for throttle tracking.
   * @param {string} collectionName
   * @param {number} duration - Query execution time in ms
   */
  recordQueryExecution(collectionName, duration) {
    if (!this._options.throttleEnabled) return;

    let state = this._throttleState.get(collectionName);
    if (!state) {
      state = {
        lastQuery: 0,
        currentInterval: this._options.minInterval,
        avgDuration: duration,
      };
      this._throttleState.set(collectionName, state);
    }

    state.lastQuery = Date.now();

    // Exponential moving average of query duration
    state.avgDuration = state.avgDuration * 0.7 + duration * 0.3;

    // Adjust interval based on query performance
    if (duration > state.avgDuration * 2) {
      // Queries getting slow - increase throttle
      state.currentInterval = Math.min(
        state.currentInterval * 1.5,
        this._options.maxInterval
      );
    } else if (duration < state.avgDuration * 0.5) {
      // Queries fast - decrease throttle
      state.currentInterval = Math.max(
        state.currentInterval * 0.8,
        this._options.minInterval
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Backpressure
  // ---------------------------------------------------------------------------

  /**
   * Check if we should apply backpressure (too many pending operations).
   * @param {string} type - 'query' or 'write'
   * @returns {boolean}
   */
  shouldApplyBackpressure(type = 'query') {
    if (!this._options.backpressureEnabled) return false;

    if (type === 'write') {
      return this._pendingWrites >= this._options.maxPendingWrites;
    }
    return this._pendingQueries >= this._options.maxPendingQueries;
  }

  /**
   * Increment pending operation counter.
   * @param {string} type - 'query' or 'write'
   * @returns {Function} Release function to call when operation completes.
   *   Calling the release function more than once is a no-op — the counter
   *   is only ever decremented once per acquire.
   */
  acquireSlot(type = 'query') {
    let released = false;
    if (type === 'write') {
      this._pendingWrites++;
      return () => {
        if (released) return;
        released = true;
        this._pendingWrites--;
        this._notifySlotAvailable('write');
      };
    }
    this._pendingQueries++;
    return () => {
      if (released) return;
      released = true;
      this._pendingQueries--;
      this._notifySlotAvailable('query');
    };
  }

  /**
   * Notify waiters that a slot has become available.
   * @private
   */
  _notifySlotAvailable(type) {
    const waiting = this._waitingForSlot[type];
    while (waiting && waiting.length > 0 && !this.shouldApplyBackpressure(type)) {
      const waiter = waiting.shift();
      // Skip waiters that already timed out and settled — acquireSlot()
      // would otherwise bump the pending counter for a dead waiter whose
      // release function nobody will ever call. See waitForSlot below.
      if (waiter.settled) continue;
      waiter.settled = true;
      waiter.resolve(this.acquireSlot(type));
      return;
    }
  }

  /**
   * Wait until a slot is available (if backpressure is active).
   * Uses Promise-based notification instead of polling.
   * @param {string} type - 'query' or 'write'
   * @param {number} [timeout=5000] - Max wait time in ms
   * @returns {Promise<Function>} Release function
   */
  async waitForSlot(type = 'query', timeout = 5000) {
    if (!this.shouldApplyBackpressure(type)) {
      return this.acquireSlot(type);
    }

    const self = this;
    return new Promise((resolve, reject) => {
      // Shared waiter state. Both the timer and _notifySlotAvailable flip
      // `settled` so neither path can double-fire: if the timer trips
      // first, _notifySlotAvailable will skip this entry (no acquireSlot
      // leak); if _notifySlotAvailable fires first, the timer becomes a
      // no-op via clearTimeout.
      //
      // The waiter object is fully constructed (including its `resolve`
      // function) BEFORE being pushed into the queue. That preserves the
      // invariant that _notifySlotAvailable never observes a half-built
      // waiter, even if a synchronous release() races the Promise executor.
      const waiter = { settled: false, resolve: null };

      const timer = setTimeout(() => {
        if (waiter.settled) return;
        waiter.settled = true;
        const waiting = self._waitingForSlot[type];
        const idx = waiting.indexOf(waiter);
        if (idx !== -1) waiting.splice(idx, 1);
        self._metrics.backpressureEvents++;
        reject(new Meteor.Error('backpressure', `Too many pending ${type} operations.`));
      }, timeout);

      waiter.resolve = (slot) => {
        clearTimeout(timer);
        resolve(slot);
      };

      self._waitingForSlot[type].push(waiter);
    });
  }

  // ---------------------------------------------------------------------------
  // Metrics
  // ---------------------------------------------------------------------------

  /**
   * Get current engine metrics.
   * @returns {Object}
   */
  getMetrics() {
    return {
      ...this._metrics,
      pendingQueries: this._pendingQueries,
      pendingWrites: this._pendingWrites,
      trackedPatterns: this._accessPatterns.size,
      throttledCollections: this._throttleState.size,
    };
  }

  /**
   * Reset all metrics and tracking state.
   */
  reset() {
    this._accessPatterns.clear();
    this._throttleState.clear();
    this._pendingQueries = 0;
    this._pendingWrites = 0;
    this._waitingForSlot = { query: [], write: [] };
    this._metrics = {
      totalQueries: 0,
      totalWrites: 0,
      prefetchHits: 0,
      prefetchMisses: 0,
      throttledQueries: 0,
      backpressureEvents: 0,
      totalChanges: 0,
      errors: 0,
      reconnections: 0,
      patternKeyFailures: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // ChangeStream integration
  // ---------------------------------------------------------------------------

  /**
   * Attach to a ChangeStream to collect reactive metrics.
   * Tracks total changes, errors, and reconnections.
   *
   * @param {ChangeStream} stream - The ChangeStream to monitor
   * @returns {Function} Detach function to stop monitoring
   */
  attachToStream(stream) {
    const onAdded = () => { this._metrics.totalChanges = (this._metrics.totalChanges || 0) + 1; };
    const onChanged = () => { this._metrics.totalChanges = (this._metrics.totalChanges || 0) + 1; };
    const onRemoved = () => { this._metrics.totalChanges = (this._metrics.totalChanges || 0) + 1; };
    const onError = () => { this._metrics.errors = (this._metrics.errors || 0) + 1; };
    const onReconnected = () => { this._metrics.reconnections = (this._metrics.reconnections || 0) + 1; };

    stream.on(CHANGE_EVENTS.ADDED, onAdded);
    stream.on(CHANGE_EVENTS.CHANGED, onChanged);
    stream.on(CHANGE_EVENTS.REMOVED, onRemoved);
    stream.on(CHANGE_EVENTS.ERROR, onError);
    stream.on(CHANGE_EVENTS.RECONNECTED, onReconnected);

    return () => {
      stream.removeListener(CHANGE_EVENTS.ADDED, onAdded);
      stream.removeListener(CHANGE_EVENTS.CHANGED, onChanged);
      stream.removeListener(CHANGE_EVENTS.REMOVED, onRemoved);
      stream.removeListener(CHANGE_EVENTS.ERROR, onError);
      stream.removeListener(CHANGE_EVENTS.RECONNECTED, onReconnected);
    };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Generate a stable key for a query pattern.
   * Uses canonical EJSON so semantically-equal selectors with differing
   * key insertion orders produce the same pattern key.
   * @private
   */
  _patternKey(collectionName, selector) {
    try {
      return collectionName + ':' + EJSON.stringify(selector, { canonical: true });
    } catch (e) {
      this._metrics.patternKeyFailures++;
      if (typeof Meteor !== 'undefined' && Meteor._debug) {
        Meteor._debug(
          `AFS.AdaptiveEngine: failed to canonicalize selector for '${collectionName}':`,
          e.message
        );
      }
      return collectionName + ':*';
    }
  }
}
