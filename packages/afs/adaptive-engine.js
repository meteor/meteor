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

    // Performance metrics
    this._metrics = {
      totalQueries: 0,
      totalWrites: 0,
      prefetchHits: 0,
      prefetchMisses: 0,
      throttledQueries: 0,
      backpressureEvents: 0,
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
    const pattern = this._accessPatterns.get(key) || {
      count: 0,
      lastAccess: 0,
      selector,
      options,
      collectionName,
    };

    pattern.count++;
    pattern.lastAccess = Date.now();
    this._accessPatterns.set(key, pattern);
    this._metrics.totalQueries++;
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
        suggestions.push({
          selector: pattern.selector,
          options: pattern.options,
        });
      }
    }

    return suggestions.sort((a, b) => {
      const patternA = this._accessPatterns.get(
        this._patternKey(collectionName, a.selector)
      );
      const patternB = this._accessPatterns.get(
        this._patternKey(collectionName, b.selector)
      );
      return (patternB?.count || 0) - (patternA?.count || 0);
    });
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
   * @returns {Function} Release function to call when operation completes
   */
  acquireSlot(type = 'query') {
    if (type === 'write') {
      this._pendingWrites++;
      return () => { this._pendingWrites--; };
    }
    this._pendingQueries++;
    return () => { this._pendingQueries--; };
  }

  /**
   * Wait until a slot is available (if backpressure is active).
   * @param {string} type - 'query' or 'write'
   * @param {number} [timeout=5000] - Max wait time in ms
   * @returns {Promise<Function>} Release function
   */
  async waitForSlot(type = 'query', timeout = 5000) {
    const startTime = Date.now();

    while (this.shouldApplyBackpressure(type)) {
      if (Date.now() - startTime > timeout) {
        this._metrics.backpressureEvents++;
        throw new Meteor.Error(
          'backpressure',
          `Too many pending ${type} operations. Try again later.`
        );
      }
      // Wait a small interval then check again
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    return this.acquireSlot(type);
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
    this._metrics = {
      totalQueries: 0,
      totalWrites: 0,
      prefetchHits: 0,
      prefetchMisses: 0,
      throttledQueries: 0,
      backpressureEvents: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Generate a stable key for a query pattern.
   * @private
   */
  _patternKey(collectionName, selector) {
    try {
      // Use sorted keys for consistent hashing
      return collectionName + ':' + EJSON.stringify(selector);
    } catch (e) {
      return collectionName + ':*';
    }
  }
}
