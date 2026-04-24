/**
 * PostgresObserveDriver — polling-based reactive query driver
 * with LISTEN/NOTIFY acceleration.
 *
 * Polls the database at a configurable interval and diffs results
 * using DiffSequence. LISTEN/NOTIFY triggers immediate re-poll
 * (debounced) for low-latency reactivity.
 *
 * Emits changes into an AFS.ChangeStream instead of manually
 * managing observer callbacks. The ChangeStream + ObserveMultiplexer
 * handle fan-out to N consumers.
 *
 * Includes driver caching — identical cursor descriptions
 * share a single driver instance.
 */

// TODO: postgres_stream_provider.js close() should import and call
// dropCachedDriversForProvider(this) to evict this module's cached drivers
// when a provider is torn down.

import { ChangeStream } from 'meteor/afs';
import { Random } from 'meteor/random';

// Minimum 100ms to avoid hot loops if a misconfigured env var is provided.
const _parsedPollingInterval = parseInt(
  process.env.METEOR_POSTGRES_POLLING_INTERVAL_MS || '1000',
  10
);
export const POLLING_INTERVAL_MS = Math.max(
  100,
  Number.isFinite(_parsedPollingInterval) && _parsedPollingInterval > 0
    ? _parsedPollingInterval
    : 1000
);

const NOTIFY_DEBOUNCE_MS = 50;

// Postgres error codes / Node socket codes that indicate a transient
// connection-class failure rather than a semantic query error.
const CONN_ERROR_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND',
  '57P01', '57P02', '57P03', '08000', '08003', '08006', '08001', '08004'
]);

function isConnectionError(err) {
  if (!err) return false;
  return CONN_ERROR_CODES.has(err.code) ||
    /connection terminated|connection closed|connection ended/i.test(err.message || '');
}

// Module-scoped: drivers are keyed by provider URL; multiple providers with distinct URLs never collide.
const _driverCache = new Map();

/**
 * Get or create an observe driver for a cursor description.
 * Returns the driver's ChangeStream for consumers to listen on.
 *
 * @param {Object} cursorDescription
 * @param {boolean} ordered
 * @param {Object} provider - PostgresStreamProvider
 * @returns {ChangeStream}
 */
export function getObserveDriver(cursorDescription, ordered, provider) {
  // Key by provider identity so two providers (e.g. two different pools or
  // connection URLs) don't collide in the module-level cache.
  const providerId =
    provider._url ||
    (provider._cacheKey = provider._cacheKey || Random.id());
  const key = EJSON.stringify({ providerId, ...cursorDescription, ordered });

  if (_driverCache.has(key)) {
    const driver = _driverCache.get(key);
    if (!driver._stopped) {
      return driver._stream;
    }
    _driverCache.delete(key);
  }

  const driver = new PostgresObserveDriver(cursorDescription, ordered, provider, key);
  _driverCache.set(key, driver);
  return driver._stream;
}

/**
 * Drop all cached drivers that belong to the given provider. Intended to be
 * called from `postgres_stream_provider.js` `close()` so a provider teardown
 * evicts its drivers (rather than leaving them wired to a closed connection).
 *
 * @param {Object} provider
 */
export function dropCachedDriversForProvider(provider) {
  for (const [key, driver] of _driverCache) {
    if (driver._provider === provider) {
      _driverCache.delete(key);
      try {
        driver.stop();
      } catch (e) {
        // best-effort; stop() is idempotent
      }
    }
  }
}

class PostgresObserveDriver {
  constructor(cursorDescription, ordered, provider, cacheKey) {
    this._cursorDescription = cursorDescription;
    this._ordered = ordered;
    this._provider = provider;
    this._cacheKey = cacheKey;
    this._stopped = false;
    this._pollTimer = null;
    this._notifyDebounceTimer = null;
    this._notifyCallback = null;
    this._reconnectHandler = null;
    this._repollNeeded = false;

    // Create the ChangeStream that this driver emits into
    this._stream = new ChangeStream(cursorDescription);

    // Clean up when the stream is stopped externally
    this._stream.on('stop', () => {
      this.stop();
    });

    // Current result state for diffing
    this._lastResults = ordered ? [] : new IdMap(MongoID.idStringify, MongoID.idParse);
    this._polling = false;

    this._initialized = false;
    // Tracks whether a reconnect-driven catch-up retry chain is in flight.
    // Used to coalesce overlapping `listen:reconnected` events so we don't
    // run multiple retry chains concurrently.
    this._reconnectRetryInFlight = false;
    this._initPromise = this._init();
    // If _init() rejects we must surface the error to the stream and stop
    // the driver — otherwise consumers sit waiting on a ready that never
    // arrives and we leak timers / listeners.
    this._initPromise.catch(err => {
      if (this._stopped) return;
      try {
        this._stream.markError(err);
      } catch (e) {
        // ignore — stream may already be stopped
      }
      try {
        this.stop();
      } catch (e) {
        // ignore — stop() is guarded against re-entry
      }
    });
  }

  async _init() {
    // Set up LISTEN/NOTIFY for the collection
    const collectionName = this._cursorDescription.collectionName;

    this._notifyCallback = () => {
      if (this._stopped) return;
      // Debounce: clear any pending debounce and trigger re-poll
      if (this._notifyDebounceTimer) {
        clearTimeout(this._notifyDebounceTimer);
      }
      this._notifyDebounceTimer = setTimeout(() => {
        this._poll().catch(e => {
          Log.error('Postgres observe poll error:', e);
          if (!isConnectionError(e)) this._stream.markError(e);
        });
      }, NOTIFY_DEBOUNCE_MS);
    };

    try {
      await this._provider._connection.setupListenNotify(collectionName, this._notifyCallback);
    } catch (e) {
      // LISTEN/NOTIFY setup may fail (permissions, etc.) — fall back to polling only
      Log.warn('Postgres: LISTEN/NOTIFY setup failed for ' + collectionName + ', using polling only:', e.message);
      this._notifyCallback = null;
      // Emit degraded mode event on the connection for observability
      if (this._provider._connection && this._provider._connection.emit) {
        this._provider._connection.emit('listen:failed', { collectionName, error: e });
      }
    }

    // Subscribe to listen-client reconnects so we can re-poll and signal
    // downstream consumers. Without this, writes during the disconnect
    // gap never surface until the next regular poll tick.
    const connection = this._provider._connection;
    if (connection && typeof connection.on === 'function') {
      this._reconnectHandler = (info) => {
        if (this._stopped) return;

        // Only react if our channel was among those replayed (when payload
        // supplies a channel list). Falls back to always-react otherwise.
        if (info && Array.isArray(info.channels)) {
          const ourChannel = `meteor_pg_${collectionName}`;
          if (!info.channels.includes(ourChannel)) return;
        }

        // Writes that happened between disconnect and re-LISTEN were never
        // delivered; divergence is guaranteed, not hypothetical. Emit `reset`
        // so downstream re-issues the initial snapshot. Also clear the diff
        // baseline so the next poll replays full state against empty.
        try {
          if (typeof this._stream.emit === 'function') {
            this._stream.emit('reset');
          }
          this._lastResults = this._ordered
            ? []
            : new IdMap(MongoID.idStringify, MongoID.idParse);
        } catch (emitErr) {
          Log.error('Postgres observe driver: error emitting reset:', emitErr);
        }

        if (this._polling) {
          this._repollNeeded = true;
          return;
        }

        // Coalesce overlapping reconnects: if a retry chain is already
        // running, don't start a second one — the in-flight chain will
        // resolve state for both signals.
        if (this._reconnectRetryInFlight) {
          return;
        }
        this._reconnectRetryInFlight = true;
        this._catchUpPollWithRetry()
          .catch(e => Log.error('Postgres observe reconnect poll error:', e))
          .then(() => {
            this._reconnectRetryInFlight = false;
          });
      };
      connection.on('listen:reconnected', this._reconnectHandler);
    }

    // Run initial poll
    await this._poll();
    this._initialized = true;

    // Mark the stream as ready after initial data is sent
    this._stream.markReady();

    // Start polling interval
    this._pollTimer = setInterval(() => {
      this._poll().catch(e => {
        Log.error('Postgres observe poll error:', e);
        if (!isConnectionError(e)) this._stream.markError(e);
      });
    }, POLLING_INTERVAL_MS);
  }

  /**
   * Run the catch-up poll after a listen reconnect, retrying up to 3 times
   * with backoff + jitter. If all attempts fail we surface the error to the
   * stream (via markError) so the subscription terminates instead of silently
   * sitting stale for up to `POLLING_INTERVAL_MS`.
   *
   * Delays: 200ms, 500ms, 1000ms, each multiplied by `0.5 + Math.random()`.
   */
  async _catchUpPollWithRetry() {
    const baseDelays = [200, 500, 1000];
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (this._stopped) return;
      try {
        await this._poll();
        return;
      } catch (e) {
        lastErr = e;
        Log.error(
          `Postgres observe catch-up poll attempt ${attempt + 1} failed:`,
          e
        );
        if (attempt < 2) {
          const delay = baseDelays[attempt] * (0.5 + Math.random());
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    if (this._stopped) return;
    try {
      this._stream.markError(lastErr);
    } catch (e) {
      // stream may already be stopped
    }
  }

  async _poll() {
    if (this._stopped || this._polling) return;
    this._polling = true;

    let fetchErr = null;
    try {
      const { collectionName, selector, options } = this._cursorDescription;

      let results;
      try {
        results = await this._provider._fetchResults(collectionName, selector, options || {});
      } catch (e) {
        fetchErr = e;
        if (isConnectionError(e)) {
          // Transient connection-class error — do NOT markError here; the
          // normal poll interval / reconnect cycle will recover. We still
          // propagate the error so the reconnect retry chain can apply
          // backoff; non-reconnect callers swallow the throw via `.catch`.
          Meteor._debug(
            'Postgres observe: transient connection error, will retry',
            e && e.message ? e.message : e
          );
          return;
        }
        // Semantic / unexpected error — log it. `markError` is deferred to
        // the caller (initial-poll handler, retry chain, or periodic poll's
        // `.catch`) so we don't double-mark when errors rethrow.
        Log.error('Postgres observe query error:', e);
        return;
      }

      if (this._stopped) return;

      if (this._ordered) {
        this._diffOrdered(results);
      } else {
        this._diffUnordered(results);
      }
    } finally {
      this._polling = false;
    }

    if (this._repollNeeded && !this._stopped) {
      this._repollNeeded = false;
      setImmediate(() => {
        if (this._stopped) return;
        this._poll().catch(e => Log.error('Postgres observe coalesced repoll error:', e));
      });
    }

    // Propagate the fetch error (after finally cleared `_polling`) so callers
    // can decide whether to retry, markError, or swallow.
    if (fetchErr) {
      throw fetchErr;
    }
  }

  _diffOrdered(newResults) {
    const oldResults = this._lastResults;
    this._lastResults = newResults;

    if (!this._initialized && oldResults.length === 0) {
      // Initial results — emit added for each
      for (let i = 0; i < newResults.length; i++) {
        const doc = newResults[i];
        const fields = EJSON.clone(doc);
        delete fields._id;
        const before = i < newResults.length - 1 ? newResults[i + 1]._id : null;
        this._stream.addedBefore(doc._id, fields, before);
      }
      return;
    }

    DiffSequence.diffQueryOrderedChanges(oldResults, newResults, {
      addedBefore: (id, fields, before) => {
        this._stream.addedBefore(id, fields, before);
      },
      movedBefore: (id, before) => {
        this._stream.movedBefore(id, before);
      },
      changed: (id, fields) => {
        this._stream.changed(id, fields);
      },
      removed: (id) => {
        this._stream.removed(id);
      },
    });
  }

  _diffUnordered(newResultsArr) {
    // Convert array to IdMap
    const newResults = new IdMap(MongoID.idStringify, MongoID.idParse);
    for (const doc of newResultsArr) {
      newResults.set(doc._id, doc);
    }

    const oldResults = this._lastResults;
    this._lastResults = newResults;

    if (!this._initialized && oldResults.size() === 0) {
      // Initial results — emit added for each
      newResults.forEach((doc, id) => {
        const fields = EJSON.clone(doc);
        delete fields._id;
        this._stream.added(id, fields);
      });
      return;
    }

    DiffSequence.diffQueryUnorderedChanges(oldResults, newResults, {
      added: (id, fields) => {
        this._stream.added(id, fields);
      },
      changed: (id, fields) => {
        this._stream.changed(id, fields);
      },
      removed: (id) => {
        this._stream.removed(id);
      },
    });
  }

  /**
   * Stop the driver — clear timers, UNLISTEN, remove from cache.
   */
  stop() {
    if (this._stopped) return;
    this._stopped = true;

    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }

    if (this._notifyDebounceTimer) {
      clearTimeout(this._notifyDebounceTimer);
      this._notifyDebounceTimer = null;
    }

    // Detach reconnect listener to avoid leaks
    if (this._reconnectHandler) {
      const connection = this._provider._connection;
      if (connection && typeof connection.removeListener === 'function') {
        try {
          connection.removeListener('listen:reconnected', this._reconnectHandler);
        } catch (e) {
          // ignore
        }
      }
      this._reconnectHandler = null;
    }

    // Remove LISTEN/NOTIFY callback
    if (this._notifyCallback) {
      const collectionName = this._cursorDescription.collectionName;
      this._provider._connection.removeListenNotify(collectionName, this._notifyCallback)
        .catch(e => Log.error('Postgres: UNLISTEN error:', e));
      this._notifyCallback = null;
    }

    // Stop the ChangeStream (if not already stopped)
    if (!this._stream.isStopped()) {
      this._stream.stop();
    }

    // Remove from driver cache
    _driverCache.delete(this._cacheKey);
  }
}
