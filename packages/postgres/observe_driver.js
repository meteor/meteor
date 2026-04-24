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

import { ChangeStream } from 'meteor/afs';

const POLLING_INTERVAL_MS = parseInt(
  process.env.METEOR_POSTGRES_POLLING_INTERVAL_MS || '1000',
  10
);

const NOTIFY_DEBOUNCE_MS = 50;

// Driver cache: key → PostgresObserveDriver
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
  const key = EJSON.stringify({ ...cursorDescription, ordered });

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
    // When a reconnect fires during an in-flight poll we can't just kick
    // off a second poll; instead we set this flag and re-poll once the
    // current one finishes. Idempotent under repeated reconnect signals.
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
    this._initPromise = this._init();
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
        this._poll().catch(e => Log.error('Postgres observe poll error:', e));
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

        // Signal consumers that state may be stale; observe-multiplexer
        // forwards 'reconnected' through to ChangeStream subscribers.
        // `reconnected` is the minimum needed here — `reset` would imply
        // divergence we haven't actually verified yet.
        try {
          if (typeof this._stream.emit === 'function') {
            this._stream.emit('reconnected');
          }
        } catch (emitErr) {
          Log.error('Postgres observe driver: error emitting reconnected:', emitErr);
        }

        // Debounce / coalesce: if a poll is already in flight, just mark
        // that we need another pass when it finishes. Otherwise poll now.
        if (this._polling) {
          this._repollNeeded = true;
          return;
        }
        this._poll().catch(e => Log.error('Postgres observe reconnect poll error:', e));
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
      this._poll().catch(e => Log.error('Postgres observe poll error:', e));
    }, POLLING_INTERVAL_MS);
  }

  async _poll() {
    if (this._stopped || this._polling) return;
    this._polling = true;

    try {
      const { collectionName, selector, options } = this._cursorDescription;

      let results;
      try {
        results = await this._provider._fetchResults(collectionName, selector, options || {});
      } catch (e) {
        Log.error('Postgres observe query error:', e);
        this._stream.markError(e);
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

    // If a reconnect fired while we were mid-poll, run exactly one more pass.
    // This keeps the trigger idempotent under listen-client flapping.
    if (this._repollNeeded && !this._stopped) {
      this._repollNeeded = false;
      this._poll().catch(e => Log.error('Postgres observe coalesced repoll error:', e));
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
