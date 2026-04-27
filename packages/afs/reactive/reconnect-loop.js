/**
 * ReconnectLoop — generic reconnect-with-backoff state machine.
 *
 * Hoists the per-attempt loop that every networked StreamProvider needs:
 *   shutdown flag, cancellable sleep, attempt counter, exponential backoff
 *   with jitter, lifecycle events.
 *
 * Providers supply only the part that varies — `doReconnect()` (one attempt)
 * and an optional `doReplay()` to run once after success (e.g. catch-up
 * poll). Pure: no dependency on ChangeStream, no global event bus.
 *
 * Lifecycle:
 *   start()  -> running; calls `doReconnect()` in a backoff loop.
 *   success  -> stopped; `doReplay()` runs (if provided), `start()` resolves.
 *   stop()   -> aborts pending sleep; current `doReconnect()` is NOT killed
 *               mid-flight (we have no cancellation primitive for arbitrary
 *               async work) but no new attempt starts; `start()` resolves
 *               to `{ aborted: true }` after the in-flight attempt settles.
 *   exhausted / non-retryable -> `start()` REJECTS with the last error
 *               (the 'gave-up' event still fires before the rejection).
 */

const ABORTED = Symbol('reconnect-loop-aborted');

export class ReconnectLoop {
  /**
   * @param {Object} opts
   * @param {() => Promise<void>} opts.doReconnect   Single attempt; resolves on success, rejects on retryable failure.
   * @param {() => Promise<void>} [opts.doReplay]    Optional, runs once after success (e.g. catch-up poll).
   * @param {(err: any) => boolean} [opts.shouldRetry] Decide if `err` is retryable. Defaults to "always retry."
   * @param {(evt: string, payload?: object) => void} [opts.onEvent] Lifecycle hook. Events:
   *   'reconnecting' (loop started, payload: { maxAttempts })
   *   'attempt'      (about to sleep then call doReconnect, payload: { attempt, delay })
   *   'success'      (doReconnect resolved, payload: { attempt })
   *   'gave-up'      (about to reject, payload: { attempts, error })
   *   'aborted'      (stop() was honored, payload: { attempt })
   * @param {Object} [opts.backoff]
   * @param {number} [opts.backoff.initialMs=500]
   * @param {number} [opts.backoff.maxMs=30000]
   * @param {number} [opts.backoff.factor=2]
   * @param {number} [opts.backoff.jitter=0.2]   Multiplicative jitter range [1-jitter, 1+jitter].
   * @param {number} [opts.backoff.maxAttempts=Infinity]
   * @param {boolean} [opts.backoff.immediateFirst=false] If true, attempt 1
   *   skips the leading sleep — first attempt fires immediately, subsequent
   *   attempts sleep with `initialMs` as the base for attempt 2.
   * @param {() => number} [opts.random]         Injectable RNG for tests. Defaults to Math.random.
   * @param {(ms: number, onTimeout: () => void) => any} [opts.setTimeoutFn] Injectable for tests.
   * @param {(handle: any) => void} [opts.clearTimeoutFn] Injectable for tests.
   */
  constructor(opts) {
    if (!opts || typeof opts.doReconnect !== 'function') {
      throw new Error('ReconnectLoop: opts.doReconnect is required');
    }
    this._doReconnect = opts.doReconnect;
    this._doReplay = typeof opts.doReplay === 'function' ? opts.doReplay : null;
    this._shouldRetry = typeof opts.shouldRetry === 'function' ? opts.shouldRetry : () => true;
    this._onEvent = typeof opts.onEvent === 'function' ? opts.onEvent : () => {};

    const b = opts.backoff || {};
    this._initialMs = b.initialMs ?? 500;
    this._maxMs = b.maxMs ?? 30000;
    this._factor = b.factor ?? 2;
    this._jitter = b.jitter ?? 0.2;
    this._maxAttempts = b.maxAttempts ?? Infinity;
    this._immediateFirst = !!b.immediateFirst;

    this._random = typeof opts.random === 'function' ? opts.random : Math.random;
    this._setTimeout = typeof opts.setTimeoutFn === 'function'
      ? opts.setTimeoutFn
      : (ms, fn) => setTimeout(fn, ms);
    this._clearTimeout = typeof opts.clearTimeoutFn === 'function'
      ? opts.clearTimeoutFn
      : (handle) => clearTimeout(handle);

    this._stopped = false;
    this._running = false;
    this._inFlight = null;       // current start() promise
    this._abortSleep = null;     // resolves the active cancellable sleep
  }

  /** Currently running? */
  get running() { return this._running; }

  /**
   * Start the loop. Idempotent if already running — returns the in-flight promise.
   *
   * Resolves on success or after stop() (with `{ aborted: true }`).
   * Rejects with the last error when maxAttempts is exhausted or
   * `shouldRetry(err)` returns false.
   */
  start() {
    if (this._inFlight) return this._inFlight;
    if (this._stopped) {
      // stop() before start() — surface immediate aborted resolution.
      return Promise.resolve({ aborted: true });
    }
    this._running = true;
    this._inFlight = this._run().finally(() => {
      this._running = false;
      this._inFlight = null;
    });
    return this._inFlight;
  }

  /**
   * Abort the current attempt + cancel any pending sleep. Resolves the
   * in-flight `start()` promise with `{ aborted: true }`. Idempotent.
   *
   * If a `doReconnect()` is currently executing it runs to completion (we
   * cannot cancel arbitrary async work) but its result is discarded and no
   * further attempt starts.
   */
  stop() {
    if (this._stopped) return;
    this._stopped = true;
    if (this._abortSleep) {
      const fn = this._abortSleep;
      this._abortSleep = null;
      try { fn(); } catch (e) { /* ignore */ }
    }
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  async _run() {
    this._onEvent('reconnecting', { maxAttempts: this._maxAttempts });

    let attempt = 0;
    let lastError = null;

    while (!this._stopped && attempt < this._maxAttempts) {
      attempt += 1;

      // Sleep before each attempt by default. With `immediateFirst: true`,
      // attempt 1 skips the leading sleep entirely; for attempts >=2 the
      // exponent is shifted so attempt 2 uses `initialMs` (not initialMs*factor).
      const skipSleep = this._immediateFirst && attempt === 1;
      const exponent = this._immediateFirst ? attempt - 2 : attempt - 1;
      const delay = skipSleep ? 0 : this._computeDelay(exponent);

      this._onEvent('attempt', { attempt, delay });

      if (!skipSleep) {
        const sleepResult = await this._sleep(delay);
        if (sleepResult === ABORTED || this._stopped) {
          this._onEvent('aborted', { attempt });
          return { aborted: true };
        }
      }

      try {
        await this._doReconnect();
      } catch (err) {
        lastError = err;
        if (this._stopped) {
          this._onEvent('aborted', { attempt });
          return { aborted: true };
        }
        if (!this._shouldRetry(err)) {
          this._onEvent('gave-up', { attempts: attempt, error: err });
          throw err;
        }
        // else: keep looping
        continue;
      }

      // Success.
      if (this._stopped) {
        // stop() was called during doReconnect. Honor it: do NOT run replay.
        this._onEvent('aborted', { attempt });
        return { aborted: true };
      }

      this._onEvent('success', { attempt });

      if (this._doReplay) {
        // Replay errors are surfaced as a rejection — same shape as a
        // non-retryable doReconnect failure. The 'success' event has
        // already fired, which matches the documented sequence.
        await this._doReplay();
      }
      return { aborted: false };
    }

    // Loop exited without success.
    if (this._stopped) {
      this._onEvent('aborted', { attempt });
      return { aborted: true };
    }
    // maxAttempts exhausted.
    this._onEvent('gave-up', { attempts: attempt, error: lastError });
    throw lastError !== null
      ? lastError
      : new Error('ReconnectLoop: maxAttempts exhausted with no error');
  }

  /**
   * @param {number} exponent  Backoff exponent (0 = base = initialMs).
   *   Caller passes `attempt - 1` for default mode, or `attempt - 2` when
   *   `immediateFirst` shifted the schedule by one. Negative values clamp to 0.
   */
  _computeDelay(exponent) {
    const e = Math.max(0, exponent);
    const exp = Math.min(this._maxMs, this._initialMs * Math.pow(this._factor, e));
    const jitterMul = 1 + this._jitter * (this._random() * 2 - 1);
    const delay = Math.max(0, Math.floor(exp * jitterMul));
    return delay;
  }

  /**
   * Cancellable sleep. Resolves with `undefined` on timeout, with `ABORTED`
   * on stop().
   */
  _sleep(ms) {
    return new Promise((resolve) => {
      // If already stopped, resolve aborted immediately without arming timer.
      if (this._stopped) {
        resolve(ABORTED);
        return;
      }
      const handle = this._setTimeout(ms, () => {
        this._abortSleep = null;
        resolve();
      });
      this._abortSleep = () => {
        try { this._clearTimeout(handle); } catch (e) { /* ignore */ }
        resolve(ABORTED);
      };
    });
  }
}
