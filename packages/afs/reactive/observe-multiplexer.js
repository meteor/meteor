import { CHANGE_EVENTS } from './change-stream';

/**
 * ObserveMultiplexer - Fans out ChangeStream events to N ObserveHandles.
 *
 * Wraps a single ChangeStream and manages multiple observers. Caches
 * the current result set so late-joining observers receive initial adds.
 *
 * Inspired by Mongo's ObserveMultiplexer but built on EventEmitter-based
 * ChangeStream rather than direct callbacks.
 *
 * ## Observer callback contract
 *
 * Consumer callbacks (added/addedBefore/changed/removed/movedBefore,
 * error, reconnected, reset, paused, resumed) MUST NOT throw. A throwing
 * callback is caught and logged to console.error as a last-resort
 * diagnostic — the error does NOT stop the handle, tear down the
 * subscription, or propagate to other handles. Observers that need to
 * signal a fatal condition should call `stop()` explicitly.
 *
 * Async callbacks returning a rejected promise are handled the same way:
 * the rejection is caught and logged; the handle remains active.
 */

export class ObserveMultiplexer {
  /**
   * @param {ChangeStream} changeStream - The event source
   * @param {boolean} ordered - Whether to track document ordering
   * @param {Object} [options]
   * @param {Function} [options.onEmpty] - Called when last handle is removed.
   *   If not provided, the stream is stopped automatically.
   * @param {number} [options.pendingQueueCap=10000] - Max number of events
   *   buffered per pending handle before the queue is collapsed to a single
   *   'reset' replay entry. Prevents unbounded memory growth if a handle's
   *   initial-add phase stalls while a burst of live events fires. Pass 0
   *   to disable the cap.
   */
  constructor(changeStream, ordered, options = {}) {
    this._stream = changeStream;
    this._ordered = ordered;
    this._onEmpty = options.onEmpty || null;
    this._pendingQueueCap = options.pendingQueueCap == null ? 10000 : options.pendingQueueCap;
    this._handles = new Map();
    // Handles that are mid-addHandle (awaiting initial-adds). Any live event
    // emitted while a handle is pending is queued here and replayed to that
    // handle once it transitions into _handles, so live-only emissions (e.g.
    // 'reconnected', 'reset') that don't mutate the cache aren't lost.
    this._pendingHandles = new Map();
    // Cached count of handles with mutating callbacks. Avoids an O(n) scan
    // on every cache-mutating event when fan-out asks whether args need
    // cloning.
    this._mutatingHandleCount = 0;

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
   * Cursor description of the underlying stream. Public window onto
   * `_stream.cursorDescription` so afs-internal callers (e.g.
   * `StreamProvider.stopObserversForCollection`) don't reach into the
   * multiplexer's private stream reference.
   */
  get cursorDescription() {
    return this._stream && this._stream.cursorDescription;
  }

  /**
   * Stop the underlying stream. Convenience delegator that prevents callers
   * from reaching into `_stream` directly.
   */
  stop() {
    if (this._stream) this._stream.stop();
  }

  /**
   * Determine whether the shared event args need to be cloned before fan-out.
   *
   * Returns false (skip the clone) when every handle has
   * `nonMutatingCallbacks: true`, or when there is only a single handle. In
   * both cases there is no mutation-induced aliasing risk between handles.
   * Uses `_mutatingHandleCount` so the check is O(1) per cache-mutating
   * event regardless of handle count.
   * @private
   */
  _handlesNeedCloning() {
    if (this._handles.size <= 1) return false;
    return this._mutatingHandleCount > 0;
  }

  /**
   * Bind to ChangeStream events: update cache and fan out to handles.
   * @private
   */
  _bindStreamEvents() {
    // Retain listener refs so destroy() can detach them explicitly — the
    // anonymous-fn closure captured `this`, so we need the ref to remove.
    this._boundListeners = [];

    const callbackNames = this._ordered
      ? [CHANGE_EVENTS.ADDED_BEFORE, CHANGE_EVENTS.CHANGED, CHANGE_EVENTS.MOVED_BEFORE, CHANGE_EVENTS.REMOVED]
      : [CHANGE_EVENTS.ADDED, CHANGE_EVENTS.CHANGED, CHANGE_EVENTS.REMOVED];

    for (const name of callbackNames) {
      const listener = (...args) => {
        // Update cache first. _CachingChangeObserver takes a defensive shallow
        // copy of `fields` via `{ ...fields }` before storing it in its docs
        // map, so the cache does NOT alias the args we're about to broadcast.
        this._cache.applyChange[name](...args);

        // Clone-on-write invariant: args are broadcast by reference; any handle
        // that may mutate MUST receive an EJSON.clone to avoid cross-handle aliasing.
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

        // Buffer cache-mutating events for any handle mid-addHandle so the
        // handle does not miss deltas that fire while it is receiving its
        // initial adds. addHandle replays buffered events after its snapshot
        // has been delivered, which brings the handle to the current state.
        this._bufferForPending(name, args);
      };
      this._stream.on(name, listener);
      this._boundListeners.push([name, listener]);
    }

    // Ready event — also check if stream was already ready before we attached
    if (this._stream.isReady()) {
      this._isReady = true;
      this._readyResolver();
    }
    const readyListener = () => {
      this._isReady = true;
      this._readyResolver();
    };
    this._stream.on(CHANGE_EVENTS.READY, readyListener);
    this._boundListeners.push([CHANGE_EVENTS.READY, readyListener]);

    // Error event forwarded to handles
    const errorListener = (err) => {
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
      this._bufferForPending(CHANGE_EVENTS.ERROR, [err]);
    };
    this._stream.on(CHANGE_EVENTS.ERROR, errorListener);
    this._boundListeners.push([CHANGE_EVENTS.ERROR, errorListener]);

    // Lifecycle events forwarded to handles
    for (const evt of [CHANGE_EVENTS.RECONNECTED, CHANGE_EVENTS.RESET, CHANGE_EVENTS.PAUSED, CHANGE_EVENTS.RESUMED]) {
      const lifecycleListener = (...args) => {
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
        this._bufferForPending(evt, args);
      };
      this._stream.on(evt, lifecycleListener);
      this._boundListeners.push([evt, lifecycleListener]);
    }
  }

  /**
   * Buffer an event into every pending handle's replay queue.
   * Honors the pending-queue cap set on construction — a handle whose
   * queue exceeds the cap is converted to a "reset" replay item so the
   * eventual drain tells it to resubscribe from scratch rather than
   * silently dropping events.
   * @private
   */
  _bufferForPending(name, args) {
    if (this._pendingHandles.size === 0) return;
    for (const [, queue] of this._pendingHandles) {
      if (queue._overflowed) continue;
      if (this._pendingQueueCap > 0 && queue.length >= this._pendingQueueCap) {
        queue.length = 0;
        queue.push({ name: CHANGE_EVENTS.RESET, args: [] });
        queue._overflowed = true;
        continue;
      }
      queue.push({ name, args });
    }
  }

  /**
   * Explicitly detach all listeners from the underlying ChangeStream and
   * release internal state. Safe to call more than once.
   *
   * Normally the multiplexer is torn down when the last handle stops (via
   * onEmpty, which stops the stream and removes its listeners). This method
   * exists so callers that share a stream across multiplexers — or that
   * want to unbind without stopping the stream — can do so explicitly.
   */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this._boundListeners) {
      for (const [name, listener] of this._boundListeners) {
        this._stream.removeListener(name, listener);
      }
      this._boundListeners.length = 0;
    }
    this._handles.clear();
    this._pendingHandles.clear();
    this._mutatingHandleCount = 0;
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
    // Symbol() gives each handle a guaranteed-unique identity without the
    // risk of counter overflow in long-lived multiplexers.
    const id = Symbol('handle');
    const handle = {
      id,
      callbacks,
      nonMutatingCallbacks: !!options.nonMutatingCallbacks,
      _stopped: false,
    };

    // Register as pending BEFORE awaiting readiness. Any live emission
    // (cache-mutating AND lifecycle) that fires while this handle is
    // mid-setup will be captured here and replayed after initial adds.
    this._pendingHandles.set(id, []);

    try {
      // Wait for initial data to be ready
      await this._readyPromise;

      // Snapshot the cache BEFORE sending initial adds. Sending directly
      // from this._cache.docs is unsafe when consumer callbacks can
      // synchronously mutate the collection: the iteration would observe
      // partially-mutated state and the cache-mutating events that fire
      // during the iteration would be dropped for this handle (it is not
      // yet in _handles). The snapshot-plus-replay pattern below avoids
      // both problems.
      const snapshot = this._snapshotCache();

      // Send initial adds from the snapshot. Callbacks may synchronously
      // mutate the collection; resulting events land in _pendingHandles.
      this._sendInitialAddsFromSnapshot(handle, snapshot);

      // A reentrant stop() during the snapshot is possible. Skip the
      // promotion to _handles and drop the buffered queue in that case.
      if (handle._stopped) {
        return this._makeHandle(id, handle);
      }

      // Drain everything buffered during the snapshot window, in FIFO
      // order. The handle is NOT yet in _handles, so live mutations fired
      // by drain callbacks only enter the buffer (not the fan-out path);
      // that prevents double-delivery while preserving chronological
      // order of the original events relative to any reentrant emissions.
      const queue = this._pendingHandles.get(id);
      while (queue && queue.length > 0) {
        const { name, args } = queue.shift();
        if (handle._stopped) break;
        const cb = handle.callbacks[name];
        if (!cb) continue;
        try {
          const result = cb(...args);
          if (result && typeof result === 'object' && typeof result.then === 'function') {
            result.catch(err =>
              console.error(`Error in observeChanges ${name} callback:`, err)
            );
          }
        } catch (err) {
          console.error(`Error in observeChanges ${name} callback:`, err);
        }
      }

      // Handle may have been stopped during the drain; honor that.
      if (handle._stopped) {
        return this._makeHandle(id, handle);
      }

      // Promote to _handles — live events will fan out directly from here.
      // _pendingHandles entry is removed in the finally below, so future
      // events take the fan-out path only (no double-delivery).
      this._handles.set(id, handle);
      if (!handle.nonMutatingCallbacks) this._mutatingHandleCount++;
    } finally {
      this._pendingHandles.delete(id);
    }

    return this._makeHandle(id, handle);
  }

  /**
   * @private
   */
  _makeHandle(id, handle) {
    const self = this;
    return {
      stop() {
        if (handle._stopped) return;
        handle._stopped = true;
        if (self._handles.delete(id) && !handle.nonMutatingCallbacks) {
          self._mutatingHandleCount--;
        }
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
   * Take a shallow-but-stable snapshot of the current cache. For ordered
   * multiplexers we also snapshot the iteration order of ids so addedBefore
   * references remain consistent during initial-adds.
   * @private
   */
  _snapshotCache() {
    const docs = new Map();
    const ids = [];
    this._cache.docs.forEach((doc, id) => {
      ids.push(id);
      // Clone the doc so a subsequent mutation of the cache entry does not
      // change the fields we are about to emit.
      docs.set(id, EJSON.clone(doc));
    });
    return { docs, ids };
  }

  /**
   * Send snapshot documents to a newly added handle.
   * @private
   */
  _sendInitialAddsFromSnapshot(handle, snapshot) {
    if (this._ordered) {
      const addCb = handle.callbacks.addedBefore || handle.callbacks.added;
      if (!addCb) return;

      const { ids, docs } = snapshot;
      for (let i = 0; i < ids.length; i++) {
        if (handle._stopped) return;
        const id = ids[i];
        const doc = docs.get(id);
        if (!doc) continue;
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

      const { docs } = snapshot;
      docs.forEach((doc, id) => {
        if (handle._stopped) return;
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
