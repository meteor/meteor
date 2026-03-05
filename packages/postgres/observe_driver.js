/**
 * PostgresObserveDriver — polling-based reactive query driver
 * with LISTEN/NOTIFY acceleration.
 *
 * Polls the database at a configurable interval and diffs results
 * using DiffSequence. LISTEN/NOTIFY triggers immediate re-poll
 * (debounced) for low-latency reactivity.
 *
 * Includes observer multiplexing — identical cursor descriptions
 * share a single driver instance.
 */

const POLLING_INTERVAL_MS = parseInt(
  process.env.METEOR_POSTGRES_POLLING_INTERVAL_MS || '1000',
  10
);

const NOTIFY_DEBOUNCE_MS = 50;

// Multiplexer cache: key → PostgresObserveDriver
const _multiplexerCache = new Map();

/**
 * Get or create an observe driver for a cursor description.
 *
 * @param {Object} cursorDescription
 * @param {boolean} ordered
 * @param {Object} provider - PostgresStreamProvider
 * @returns {PostgresObserveDriver}
 */
export function getObserveDriver(cursorDescription, ordered, provider) {
  const key = EJSON.stringify({ ...cursorDescription, ordered });

  if (_multiplexerCache.has(key)) {
    const driver = _multiplexerCache.get(key);
    if (!driver._stopped) {
      return driver;
    }
    _multiplexerCache.delete(key);
  }

  const driver = new PostgresObserveDriver(cursorDescription, ordered, provider, key);
  _multiplexerCache.set(key, driver);
  return driver;
}

class PostgresObserveDriver {
  constructor(cursorDescription, ordered, provider, cacheKey) {
    this._cursorDescription = cursorDescription;
    this._ordered = ordered;
    this._provider = provider;
    this._cacheKey = cacheKey;
    this._observers = new Set();
    this._stopped = false;
    this._pollTimer = null;
    this._notifyDebounceTimer = null;
    this._notifyCallback = null;

    // Current result state
    this._lastResults = ordered ? [] : new IdMap(MongoID.idStringify, MongoID.idParse);

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
    }

    // Run initial poll
    await this._poll();
    this._initialized = true;

    // Start polling interval
    this._pollTimer = setInterval(() => {
      this._poll().catch(e => Log.error('Postgres observe poll error:', e));
    }, POLLING_INTERVAL_MS);
  }

  async _poll() {
    if (this._stopped) return;

    const { collectionName, selector, options } = this._cursorDescription;

    let results;
    try {
      results = await this._provider._fetchResults(collectionName, selector, options || {});
    } catch (e) {
      Log.error('Postgres observe query error:', e);
      return;
    }

    if (this._stopped) return;

    if (this._ordered) {
      this._diffOrdered(results);
    } else {
      this._diffUnordered(results);
    }
  }

  _diffOrdered(newResults) {
    const oldResults = this._lastResults;
    this._lastResults = newResults;

    if (!this._initialized && oldResults.length === 0) {
      // Initial results — fire added for each
      for (let i = 0; i < newResults.length; i++) {
        const doc = newResults[i];
        const fields = EJSON.clone(doc);
        delete fields._id;
        for (const observer of this._observers) {
          if (observer.addedBefore) {
            const before = i < newResults.length - 1 ? newResults[i + 1]._id : null;
            observer.addedBefore(doc._id, fields, before);
          } else if (observer.added) {
            observer.added(doc._id, fields);
          }
        }
      }
      return;
    }

    DiffSequence.diffQueryOrderedChanges(oldResults, newResults, {
      addedBefore: (id, fields, before) => {
        for (const observer of this._observers) {
          if (observer.addedBefore) observer.addedBefore(id, fields, before);
          else if (observer.added) observer.added(id, fields);
        }
      },
      movedBefore: (id, before) => {
        for (const observer of this._observers) {
          if (observer.movedBefore) observer.movedBefore(id, before);
        }
      },
      changed: (id, fields) => {
        for (const observer of this._observers) {
          if (observer.changed) observer.changed(id, fields);
        }
      },
      removed: (id) => {
        for (const observer of this._observers) {
          if (observer.removed) observer.removed(id);
        }
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
      // Initial results — fire added for each
      newResults.forEach((doc, id) => {
        const fields = EJSON.clone(doc);
        delete fields._id;
        for (const observer of this._observers) {
          if (observer.added) observer.added(id, fields);
        }
      });
      return;
    }

    DiffSequence.diffQueryUnorderedChanges(oldResults, newResults, {
      added: (id, fields) => {
        for (const observer of this._observers) {
          if (observer.added) observer.added(id, fields);
        }
      },
      changed: (id, fields) => {
        for (const observer of this._observers) {
          if (observer.changed) observer.changed(id, fields);
        }
      },
      removed: (id) => {
        for (const observer of this._observers) {
          if (observer.removed) observer.removed(id);
        }
      },
    });
  }

  /**
   * Add an observer and fire initial added callbacks.
   * @param {Object} callbacks - { added, changed, removed } or { addedBefore, movedBefore, changed, removed }
   * @returns {Promise<{ stop: Function }>}
   */
  async addObserver(callbacks) {
    // Wait for initialization
    await this._initPromise;

    this._observers.add(callbacks);

    // Fire initial state
    if (this._ordered) {
      const results = this._lastResults;
      for (let i = 0; i < results.length; i++) {
        const doc = results[i];
        const fields = EJSON.clone(doc);
        delete fields._id;
        if (callbacks.addedBefore) {
          const before = i < results.length - 1 ? results[i + 1]._id : null;
          callbacks.addedBefore(doc._id, fields, before);
        } else if (callbacks.added) {
          callbacks.added(doc._id, fields);
        }
      }
    } else {
      this._lastResults.forEach((doc, id) => {
        const fields = EJSON.clone(doc);
        delete fields._id;
        if (callbacks.added) callbacks.added(id, fields);
      });
    }

    const self = this;
    return {
      stop() {
        self._observers.delete(callbacks);
        if (self._observers.size === 0) {
          self.stop();
        }
      },
    };
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

    // Remove LISTEN/NOTIFY callback
    if (this._notifyCallback) {
      const collectionName = this._cursorDescription.collectionName;
      this._provider._connection.removeListenNotify(collectionName, this._notifyCallback)
        .catch(e => Log.error('Postgres: UNLISTEN error:', e));
      this._notifyCallback = null;
    }

    // Remove from multiplexer cache
    _multiplexerCache.delete(this._cacheKey);
  }
}
