/**
 * ObserveMultiplexer - Fans out ChangeStream events to N ObserveHandles.
 *
 * Wraps a single ChangeStream and manages multiple observers. Caches
 * the current result set so late-joining observers receive initial adds.
 *
 * Inspired by Mongo's ObserveMultiplexer but built on EventEmitter-based
 * ChangeStream rather than direct callbacks.
 */

export class ObserveMultiplexer {
  /**
   * @param {ChangeStream} changeStream - The event source
   * @param {boolean} ordered - Whether to track document ordering
   * @param {Object} [options]
   * @param {Function} [options.onEmpty] - Called when last handle is removed.
   *   If not provided, the stream is stopped automatically.
   */
  constructor(changeStream, ordered, options = {}) {
    this._stream = changeStream;
    this._ordered = ordered;
    this._onEmpty = options.onEmpty || null;
    this._handles = new Map();
    this._handleIdCounter = 0;

    // Cache current result set using Minimongo's caching observer
    this._cache = new LocalCollection._CachingChangeObserver({
      ordered: this._ordered,
    });

    // Ready state tracking
    this._isReady = false;
    this._readyPromise = new Promise(resolve => {
      this._readyResolver = resolve;
    });

    // Subscribe to ChangeStream events and fan out
    this._bindStreamEvents();
  }

  /**
   * Determine whether the shared event args need to be cloned before fan-out.
   *
   * Returns false (skip the clone) when every handle has
   * `nonMutatingCallbacks: true`, or when there is only a single handle. In
   * both cases there is no mutation-induced aliasing risk between handles.
   * @private
   */
  _handlesNeedCloning() {
    if (this._handles.size <= 1) return false;
    for (const [, handle] of this._handles) {
      if (!handle.nonMutatingCallbacks) return true;
    }
    return false;
  }

  /**
   * Bind to ChangeStream events: update cache and fan out to handles.
   * @private
   */
  _bindStreamEvents() {
    const callbackNames = this._ordered
      ? ['addedBefore', 'changed', 'movedBefore', 'removed']
      : ['added', 'changed', 'removed'];

    for (const name of callbackNames) {
      this._stream.on(name, (...args) => {
        // Update cache first. _CachingChangeObserver takes a defensive shallow
        // copy of `fields` via `{ ...fields }` before storing it in its docs
        // map, so the cache does NOT alias the args we're about to broadcast.
        this._cache.applyChange[name](...args);

        // Clone the mutable arguments ONCE per event and broadcast the same
        // reference to every mutating handle. This mirrors Mongo's
        // ObserveMultiplexer pattern: one clone, broadcast reference.
        //
        // Skip the clone entirely when we can prove no handle will mutate:
        //   - every registered handle has nonMutatingCallbacks: true, or
        //   - there is only a single handle (the clone would be pointless
        //     since there's no cross-handle aliasing to protect against).
        // In those cases the raw args are forwarded directly.
        let sharedClonedArgs = null;
        const needsClone = this._handlesNeedCloning();

        // Fan out to all handles
        for (const [, handle] of this._handles) {
          if (handle._stopped) continue;
          const cb = handle.callbacks[name];
          if (cb) {
            try {
              let callArgs;
              if (handle.nonMutatingCallbacks || !needsClone) {
                callArgs = args;
              } else {
                if (sharedClonedArgs === null) {
                  sharedClonedArgs = args.map(a =>
                    a !== null && typeof a === 'object' ? EJSON.clone(a) : a
                  );
                }
                callArgs = sharedClonedArgs;
              }
              const result = cb(...callArgs);
              if (result && typeof result === 'object' && typeof result.then === 'function') {
                result.catch(err =>
                  console.error(`Error in observeChanges ${name} callback:`, err)
                );
              }
            } catch (err) {
              console.error(`Error in observeChanges ${name} callback:`, err);
            }
          }
        }
      });
    }

    // Ready event — also check if stream was already ready before we attached
    if (this._stream.isReady()) {
      this._isReady = true;
      this._readyResolver();
    }
    this._stream.on('ready', () => {
      this._isReady = true;
      this._readyResolver();
    });

    // Error event forwarded to handles
    this._stream.on('error', (err) => {
      for (const [, handle] of this._handles) {
        if (handle._stopped) continue;
        if (handle.callbacks.error) {
          try {
            handle.callbacks.error(err);
          } catch (e) {
            console.error('Error in observeChanges error callback:', e);
          }
        }
      }
    });

    // Lifecycle events forwarded to handles
    for (const evt of ['reconnected', 'reset', 'paused', 'resumed']) {
      this._stream.on(evt, (...args) => {
        for (const [, handle] of this._handles) {
          if (handle._stopped) continue;
          if (handle.callbacks[evt]) {
            try {
              handle.callbacks[evt](...args);
            } catch (e) {
              console.error(`Error in observeChanges ${evt} callback:`, e);
            }
          }
        }
      });
    }
  }

  /**
   * Add an observer handle. Returns a handle with a stop() method.
   *
   * Waits for the stream to be ready, then sends initial adds from
   * the cached result set before returning.
   *
   * @param {Object} callbacks - Observer callbacks (added, changed, removed, etc.)
   * @param {Object} [options]
   * @param {boolean} [options.nonMutatingCallbacks] - Skip EJSON.clone if true
   * @returns {Promise<{stop: Function}>}
   */
  async addHandle(callbacks, options = {}) {
    const id = ++this._handleIdCounter;
    const handle = {
      id,
      callbacks,
      nonMutatingCallbacks: !!options.nonMutatingCallbacks,
      _stopped: false,
    };

    // Wait for initial data to be ready
    await this._readyPromise;

    // Send initial adds BEFORE adding to handles (so live events don't interleave)
    this._sendInitialAdds(handle);

    // NOW add to handles — live events will fan out from this point
    this._handles.set(id, handle);

    const self = this;
    return {
      stop() {
        handle._stopped = true;
        self._handles.delete(id);
        // If no more handles, clean up
        if (self._handles.size === 0) {
          if (self._onEmpty) {
            self._onEmpty();
          } else {
            self._stream.stop();
          }
        }
      },
    };
  }

  /**
   * Send cached documents to a newly added handle.
   * @private
   */
  _sendInitialAdds(handle) {
    if (this._ordered) {
      const addCb = handle.callbacks.addedBefore || handle.callbacks.added;
      if (!addCb) return;

      // Collect IDs in order to compute correct `before` values
      const ids = [];
      this._cache.docs.forEach((doc, id) => { ids.push(id); });

      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const doc = this._cache.docs.get(id);
        const fields = handle.nonMutatingCallbacks
          ? Object.assign({}, doc)
          : EJSON.clone(doc);
        delete fields._id;

        try {
          if (handle.callbacks.addedBefore) {
            const before = i < ids.length - 1 ? ids[i + 1] : null;
            addCb(id, fields, before);
          } else {
            addCb(id, fields);
          }
        } catch (err) {
          console.error('Error in observeChanges initial add callback:', err);
        }
      }
    } else {
      const addCb = handle.callbacks.added;
      if (!addCb) return;

      this._cache.docs.forEach((doc, id) => {
        const fields = handle.nonMutatingCallbacks
          ? Object.assign({}, doc)
          : EJSON.clone(doc);
        delete fields._id;
        try {
          addCb(id, fields);
        } catch (err) {
          console.error('Error in observeChanges initial add callback:', err);
        }
      });
    }
  }
}
