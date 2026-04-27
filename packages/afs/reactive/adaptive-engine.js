import { CHANGE_EVENTS } from './change-stream';

/**
 * AdaptiveEngine — metrics collector for AFS query/write/stream activity.
 *
 * Tracks:
 *   - per-collection access patterns (LRU-bounded, canonicalized) via recordAccess
 *   - cumulative write counts via recordWrite
 *   - per-collection EMA of query duration via recordQueryExecution
 *   - reactive-stream events (added/changed/removed/error/reconnected) via attachToStream
 *
 * The engine is server-only and stateless beyond its in-memory counters.
 * Higher-level features (prefetching, throttling, backpressure) are not
 * implemented; only the metrics they would have been driven from are kept.
 */
export class AdaptiveEngine {
  constructor(options = {}) {
    this._options = {
      maxPatterns: options.maxPatterns || 1000,
    };

    // Access pattern tracking (LRU-bounded by maxPatterns).
    this._accessPatterns = new Map();

    // Per-collection EMA of query duration.
    this._throttleState = new Map();

    this._metrics = {
      totalQueries: 0,
      totalWrites: 0,
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
  // Access patterns
  // ---------------------------------------------------------------------------

  /**
   * Record a query access pattern.
   * @param {string} collectionName
   * @param {Object} selector
   * @param {Object} options
   */
  recordAccess(collectionName, selector, options) {
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
   * Record a query execution duration; updates a per-collection EMA.
   * @param {string} collectionName
   * @param {number} duration - Query execution time in ms
   */
  recordQueryExecution(collectionName, duration) {
    let state = this._throttleState.get(collectionName);
    if (!state) {
      state = { lastQuery: 0, avgDuration: duration };
      this._throttleState.set(collectionName, state);
    }
    state.lastQuery = Date.now();
    state.avgDuration = state.avgDuration * 0.7 + duration * 0.3;
  }

  // ---------------------------------------------------------------------------
  // Metrics
  // ---------------------------------------------------------------------------

  getMetrics() {
    return {
      ...this._metrics,
      trackedPatterns: this._accessPatterns.size,
      trackedCollections: this._throttleState.size,
    };
  }

  reset() {
    this._accessPatterns.clear();
    this._throttleState.clear();
    this._metrics = {
      totalQueries: 0,
      totalWrites: 0,
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
   * @param {ChangeStream} stream
   * @returns {Function} Detach function
   */
  attachToStream(stream) {
    const bindings = [
      [CHANGE_EVENTS.ADDED, 'totalChanges'],
      [CHANGE_EVENTS.CHANGED, 'totalChanges'],
      [CHANGE_EVENTS.REMOVED, 'totalChanges'],
      [CHANGE_EVENTS.ERROR, 'errors'],
      [CHANGE_EVENTS.RECONNECTED, 'reconnections'],
    ].map(([event, key]) => {
      const handler = () => { this._metrics[key] = (this._metrics[key] || 0) + 1; };
      stream.on(event, handler);
      return [event, handler];
    });

    return () => {
      for (const [event, handler] of bindings) {
        stream.removeListener(event, handler);
      }
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
