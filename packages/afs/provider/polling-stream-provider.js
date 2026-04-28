import { StreamProvider, NotImplementedError } from './stream-provider';
import { ChangeStream } from '../reactive/change-stream';
import { ReconnectLoop } from '../reactive/reconnect-loop';

/**
 * PollingStreamProvider — base class for adapters whose backend has no native
 * push (REST endpoints, S3, legacy SQL without triggers, key-value stores).
 *
 * Subclasses override `_fetchSnapshot(cursorDescription)` (REQUIRED) and may
 * override `_attachPushSignal(cursorDescription, onChange)` to wire in
 * out-of-band notifications. Everything else — poll timer, diff against
 * previous snapshot, coalesce-on-pending-poll, fetch-failure reconnect loop —
 * is owned by this base class.
 *
 * ## Reactivity contract
 *
 * Implements `startObserving` per the StreamProvider contract: returns
 * `{ stream, teardown }`. afs's `_createMultiplexer` wires teardown up to the
 * multiplexer refcount.
 *
 * Initial poll fires at the next microtask (NOT synchronously) — the
 * multiplexer has not attached its listeners yet at the moment
 * `startObserving` returns, so any synchronous emit would be silently
 * dropped.
 *
 * ## Coalescing
 *
 * If the poll timer fires while a poll is in flight, the request collapses to
 * a single "needs-repoll" flag; one extra poll runs after the in-flight one
 * settles, regardless of how many timer ticks (or push signals) arrived.
 *
 * ## Failure handling
 *
 * If `_fetchSnapshot` rejects with a transient error
 * (`_isFatalFetchError(err)` returns false — the default), polling is
 * suspended and a `ReconnectLoop` retries with backoff. The stream emits
 * `markReconnecting` when retry begins and `markReconnected` after recovery.
 * If `maxAttempts` is configured and exhausted, the stream emits `markReset`
 * and polling stops; the multiplexer sees the loss via subsequent teardown.
 *
 * ## CRUD
 *
 * `PollingStreamProvider` is observe-only; it does NOT implement
 * `insertAsync` / `updateAsync` / `removeAsync` / `find`. Subclasses inherit
 * those from `StreamProvider` (which throws `NotImplementedError`) and add
 * them themselves. Polling is decoupled from CRUD on purpose: a read-only
 * REST adapter wires in just `_fetchSnapshot` and skips writes entirely.
 *
 * ## Adaptive cadence
 *
 * Adaptive engine integration is a follow-up — `AdaptiveEngine` does not yet
 * expose a `getPollDelay` style API. For now the cadence is a fixed
 * `pollIntervalMs`.
 */
export class PollingStreamProvider extends StreamProvider {
  /**
   * @param {Object} opts
   * @param {string} opts.name
   * @param {number} [opts.pollIntervalMs=5000]   Default cadence.
   * @param {Object} [opts.backoff]               Forwarded to ReconnectLoop on
   *   fetch failure. `maxAttempts: Infinity` (default) retries forever; a
   *   finite value triggers `markReset` + teardown on exhaustion.
   * @param {boolean} [opts.coalescePolls=true]   Drop overlapping poll
   *   requests. The next poll runs at most once after the in-flight one
   *   settles regardless of how many ticks accumulated.
   */
  constructor(opts = {}) {
    super(opts);
    this._pollIntervalMs = opts.pollIntervalMs ?? 5000;
    this._backoffOpts = opts.backoff ?? null;
    this._coalescePolls = opts.coalescePolls !== false;
    // Per-cursor poll contexts (so requestImmediatePoll can find the right one).
    // Keyed by EJSON-canonical cursorDescription string. Multiple distinct
    // cursors share the same provider instance.
    this._pollers = new Map();
  }

  // ---------------------------------------------------------------------------
  // Required override
  // ---------------------------------------------------------------------------

  /**
   * Fetch the full result set for a cursor description. Subclasses MUST
   * override.
   *
   * Returned documents MUST have an `_id` field — afs's universal document
   * identity convention. If the native record key is something else (a
   * UUID column, a Redis key, a REST resource id), map it into `_id` in the
   * subclass before returning.
   *
   * @abstract
   * @param {Object} cursorDescription { collectionName, selector, options }
   * @returns {Promise<Array<Object>>}
   * @protected
   */
  async _fetchSnapshot(cursorDescription) {
    throw new NotImplementedError(this.constructor.name, '_fetchSnapshot');
  }

  // ---------------------------------------------------------------------------
  // Optional override
  // ---------------------------------------------------------------------------

  /**
   * Attach an out-of-band push signal for this cursor. Default: no-op.
   *
   * Subclasses with a webhook / SSE / Redis keyspace event / etc. override
   * this hook to call `onChange()` whenever the source signals a possible
   * change. PollingStreamProvider coalesces the resulting poll with the
   * normal cadence.
   *
   * The hook MUST return a teardown function that detaches the signal, or
   * `null` if there's nothing to detach.
   *
   * @param {Object} cursorDescription
   * @param {Function} onChange
   * @returns {Function|null}
   * @protected
   */
  _attachPushSignal(cursorDescription, onChange) {
    return null;
  }

  /**
   * Decide whether `err` from `_fetchSnapshot` is fatal (do NOT retry) vs
   * transient (retry via ReconnectLoop). Default: always treat as transient.
   *
   * Override to fail fast on permanent errors (auth failure, schema mismatch,
   * etc.). When this returns true, the stream emits `markError` and the
   * driver stops without attempting a reconnect loop.
   *
   * @param {Error} err
   * @returns {boolean}
   * @protected
   */
  _isFatalFetchError(err) {
    return false;
  }

  // ---------------------------------------------------------------------------
  // EventEmitter contract
  // ---------------------------------------------------------------------------

  supportsEventEmitter() {
    return true;
  }

  /**
   * StreamProvider entry point — invoked by `_createMultiplexer`. Returns
   * `{ stream, teardown }` so afs wires teardown into the multiplexer.
   *
   * Initial poll is deferred to the next microtask so the multiplexer can
   * attach its listeners first.
   */
  startObserving(cursorDescription, ordered) {
    const stream = new ChangeStream(cursorDescription);
    const ctx = this._spawnPoller(cursorDescription, ordered, stream);
    return {
      stream,
      teardown: () => this._stopPoller(ctx),
    };
  }

  // ---------------------------------------------------------------------------
  // Push hint API
  // ---------------------------------------------------------------------------

  /**
   * Trigger an out-of-cycle poll for `cursorDescription`. Coalesces with any
   * in-flight poll: if a poll is already running, sets `_repollNeeded` so a
   * single follow-up runs once the current one settles. Idempotent — calling
   * twice while a poll is in flight produces one follow-up, not two.
   *
   * Used internally by `_attachPushSignal` subclasses; safe to call from
   * tests too.
   */
  requestImmediatePoll(cursorDescription) {
    const key = this._cursorKey(cursorDescription);
    const ctx = this._pollers.get(key);
    if (!ctx || ctx.stopped) return;
    if (ctx.polling) {
      ctx.repollNeeded = true;
      return;
    }
    this._runPoll(ctx).catch(() => { /* errors handled inside _runPoll */ });
  }

  // ---------------------------------------------------------------------------
  // Internal — poller lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Build a per-cursor poll context and schedule the first poll on the next
   * microtask (NOT synchronously — `_createMultiplexer` has not attached its
   * listeners yet).
   *
   * @protected
   */
  _spawnPoller(cursorDescription, ordered, stream) {
    const ctx = {
      cursorDescription,
      ordered,
      stream,
      // Previous snapshot baseline. Ordered: array. Unordered: IdMap.
      lastResults: ordered ? [] : new IdMap(MongoID.idStringify, MongoID.idParse),
      initialized: false,
      polling: false,
      repollNeeded: false,
      stopped: false,
      timer: null,
      reconnectLoop: null,
      detachPush: null,
    };
    const key = this._cursorKey(cursorDescription);
    // Defensive: stop any pre-existing poller on the same key before
    // overwriting it. Otherwise the orphaned poller's setTimeout chain
    // would keep firing forever even though no caller holds its ctx.
    const existing = this._pollers.get(key);
    if (existing) this._stopPoller(existing);
    this._pollers.set(key, ctx);

    // Defer everything — including the initial poll — to the next microtask.
    // The multiplexer hasn't bound listeners yet at the moment startObserving
    // returns; emitting synchronously would silently drop events.
    Promise.resolve().then(async () => {
      if (ctx.stopped) return;

      // Optional push signal hookup. Errors in subclass code shouldn't crash
      // the whole driver — log and continue with poll-only.
      try {
        const detach = this._attachPushSignal(cursorDescription, () => {
          this.requestImmediatePoll(cursorDescription);
        });
        if (typeof detach === 'function') {
          ctx.detachPush = detach;
        }
      } catch (err) {
        if (typeof Meteor !== 'undefined' && Meteor._debug) {
          Meteor._debug(
            `${this.constructor.name}._attachPushSignal threw:`,
            err
          );
        }
      }

      try {
        await this._runPoll(ctx);
      } catch (_e) {
        // _runPoll handles its own error reporting; the throw is just to
        // signal "don't proceed to scheduling normal cadence." If the
        // reconnect loop is engaged, _runPoll already triggered it; if the
        // error was fatal, the stream is marked + ctx is stopped.
      }
    });

    return ctx;
  }

  /**
   * Cancel the timer, abort the reconnect loop, detach push signals.
   * Awaited in-flight polls are NOT canceled — Promise has no abort
   * primitive — but their results are discarded.
   *
   * @protected
   */
  _stopPoller(ctx) {
    if (!ctx || ctx.stopped) return;
    ctx.stopped = true;
    if (ctx.timer) {
      clearTimeout(ctx.timer);
      ctx.timer = null;
    }
    if (ctx.reconnectLoop) {
      try { ctx.reconnectLoop.stop(); } catch (_e) { /* ignore */ }
      ctx.reconnectLoop = null;
    }
    if (ctx.detachPush) {
      try { ctx.detachPush(); } catch (_e) { /* ignore */ }
      ctx.detachPush = null;
    }
    const key = this._cursorKey(ctx.cursorDescription);
    if (this._pollers.get(key) === ctx) {
      this._pollers.delete(key);
    }
  }

  /**
   * Run one poll: fetch + diff + emit. Reschedules the next poll on success.
   * On transient failure, hands off to a reconnect loop. On fatal failure,
   * emits `markError` and stops the poller.
   *
   * @protected
   */
  async _runPoll(ctx) {
    if (ctx.stopped) return;
    if (this._coalescePolls && ctx.polling) {
      ctx.repollNeeded = true;
      return;
    }
    ctx.polling = true;

    let snapshot;
    try {
      snapshot = await this._fetchSnapshot(ctx.cursorDescription);
    } catch (err) {
      ctx.polling = false;
      if (ctx.stopped) return;
      // Fatal vs transient classification.
      if (this._isFatalFetchError(err)) {
        try { ctx.stream.markError(err); } catch (_e) { /* ignore */ }
        this._stopPoller(ctx);
        return;
      }
      // Transient — engage reconnect loop. Suppress normal cadence while it
      // runs; on success, reconnect loop's doReplay does a catch-up poll
      // and rejoins the cadence.
      this._engageReconnectLoop(ctx, err);
      return;
    }

    try {
      if (ctx.stopped) return;
      // Defensive: every doc in the snapshot must carry _id. afs's universal
      // identity convention is _id; subclasses are responsible for mapping
      // their native key (UUID column, Redis key, REST resource id, etc.)
      // into _id inside their _fetchSnapshot. Catching this here gives a
      // clear error rather than letting a mysterious `undefined` id leak
      // into the diff and the multiplexer.
      for (const doc of snapshot) {
        if (doc == null || doc._id == null) {
          throw new Error(
            `${this.constructor.name}: _fetchSnapshot returned a doc without _id; ` +
            `map your native key to _id in your row converter`
          );
        }
      }
      if (ctx.ordered) {
        this._diffOrdered(ctx, snapshot);
      } else {
        this._diffUnordered(ctx, snapshot);
      }
      if (!ctx.initialized) {
        ctx.initialized = true;
        ctx.stream.markReady();
      }
    } catch (diffErr) {
      // Diff / markReady threw. Surface to the stream and stop the poller —
      // otherwise the throw propagates to the outer .catch() callers and
      // disappears silently, leaving observers stuck on a stale snapshot.
      if (!ctx.stopped) {
        try { ctx.stream.markError(diffErr); } catch (_e) { /* ignore */ }
        this._stopPoller(ctx);
      }
      return;
    } finally {
      ctx.polling = false;
    }

    // Coalesced repoll: if a tick or push hint arrived during the fetch,
    // run exactly one extra poll on the next microtask (no sleep).
    if (ctx.repollNeeded && !ctx.stopped) {
      ctx.repollNeeded = false;
      Promise.resolve().then(() => {
        if (ctx.stopped) return;
        this._runPoll(ctx).catch(() => { /* handled inside */ });
      });
      return;
    }

    if (!ctx.stopped) {
      this._scheduleNextPoll(ctx);
    }
  }

  /**
   * Arm the cadence timer for the next poll. Cleared on stop.
   * @protected
   */
  _scheduleNextPoll(ctx) {
    if (ctx.stopped) return;
    if (ctx.timer) clearTimeout(ctx.timer);
    ctx.timer = setTimeout(() => {
      ctx.timer = null;
      if (ctx.stopped) return;
      this._runPoll(ctx).catch(() => { /* handled inside */ });
    }, this._pollIntervalMs);
  }

  /**
   * Hand off to a `ReconnectLoop` after a transient fetch failure. The loop
   * runs `_fetchSnapshot` until it succeeds (or maxAttempts exhausts). On
   * success, replays the snapshot via the diff path and rejoins the normal
   * cadence. On exhaustion, emits `markReset` and stops the poller.
   *
   * Stream emits `markReconnecting` when the loop starts and `markReconnected`
   * after first successful fetch.
   *
   * @protected
   */
  _engageReconnectLoop(ctx, firstError) {
    if (ctx.stopped) return;
    if (ctx.reconnectLoop) return; // already engaged
    try { ctx.stream.markReconnecting(); } catch (_e) { /* ignore */ }

    let recoveredSnapshot = null;
    const loop = new ReconnectLoop({
      doReconnect: async () => {
        if (ctx.stopped) return;
        recoveredSnapshot = await this._fetchSnapshot(ctx.cursorDescription);
      },
      shouldRetry: (err) => !this._isFatalFetchError(err),
      backoff: this._backoffOpts || undefined,
    });
    ctx.reconnectLoop = loop;

    loop.start().then((result) => {
      if (ctx === null || ctx.stopped) return;
      if (ctx.reconnectLoop === loop) ctx.reconnectLoop = null;
      if (result && result.aborted) return;
      // Success path: emit reconnected, run diff, rejoin cadence.
      try { ctx.stream.markReconnected(); } catch (_e) { /* ignore */ }
      try {
        if (ctx.ordered) {
          this._diffOrdered(ctx, recoveredSnapshot);
        } else {
          this._diffUnordered(ctx, recoveredSnapshot);
        }
        if (!ctx.initialized) {
          ctx.initialized = true;
          ctx.stream.markReady();
        }
      } catch (diffErr) {
        try { ctx.stream.markError(diffErr); } catch (_e) { /* ignore */ }
        this._stopPoller(ctx);
        return;
      }
      this._scheduleNextPoll(ctx);
    }).catch((finalErr) => {
      if (ctx.reconnectLoop === loop) ctx.reconnectLoop = null;
      if (ctx.stopped) return;
      // Reconnect attempts exhausted (or non-retryable). Emit reset so
      // consumers know their snapshot is gone, then stop.
      try { ctx.stream.markReset(); } catch (_e) { /* ignore */ }
      // Surface the last error too so observers can log / alert. markError
      // after markReset is intentional — the order matches "snapshot is
      // invalid, here is why."
      try { ctx.stream.markError(finalErr); } catch (_e) { /* ignore */ }
      this._stopPoller(ctx);
    });
  }

  // ---------------------------------------------------------------------------
  // Diff machinery (delegates to diff-sequence)
  // ---------------------------------------------------------------------------

  /**
   * Diff `newResults` (Array) against `ctx.lastResults` (Array, ordered) and
   * emit `addedBefore` / `movedBefore` / `changed` / `removed`. On the very
   * first poll (when `ctx.lastResults` is empty and the driver hasn't been
   * initialized), emits `addedBefore` for each doc — same shape as the diff
   * but skipping the LCS algorithm.
   *
   * @protected
   */
  _diffOrdered(ctx, newResults) {
    const oldResults = ctx.lastResults;
    ctx.lastResults = newResults;

    if (!ctx.initialized && oldResults.length === 0) {
      for (let i = 0; i < newResults.length; i++) {
        const doc = newResults[i];
        const fields = EJSON.clone(doc);
        delete fields._id;
        const before = i < newResults.length - 1 ? newResults[i + 1]._id : null;
        ctx.stream.addedBefore(doc._id, fields, before);
      }
      return;
    }

    DiffSequence.diffQueryOrderedChanges(oldResults, newResults, {
      addedBefore: (id, fields, before) => ctx.stream.addedBefore(id, fields, before),
      movedBefore: (id, before) => ctx.stream.movedBefore(id, before),
      changed: (id, fields) => ctx.stream.changed(id, fields),
      removed: (id) => ctx.stream.removed(id),
    });
  }

  /**
   * Diff `newResultsArr` (Array) against `ctx.lastResults` (IdMap, unordered)
   * and emit `added` / `changed` / `removed`. Same first-poll shortcut as
   * `_diffOrdered`.
   *
   * @protected
   */
  _diffUnordered(ctx, newResultsArr) {
    const newResults = new IdMap(MongoID.idStringify, MongoID.idParse);
    for (const doc of newResultsArr) {
      newResults.set(doc._id, doc);
    }
    const oldResults = ctx.lastResults;
    ctx.lastResults = newResults;

    if (!ctx.initialized && oldResults.size() === 0) {
      newResults.forEach((doc, id) => {
        const fields = EJSON.clone(doc);
        delete fields._id;
        ctx.stream.added(id, fields);
      });
      return;
    }

    DiffSequence.diffQueryUnorderedChanges(oldResults, newResults, {
      added: (id, fields) => ctx.stream.added(id, fields),
      changed: (id, fields) => ctx.stream.changed(id, fields),
      removed: (id) => ctx.stream.removed(id),
    });
  }

  // ---------------------------------------------------------------------------
  // Misc helpers
  // ---------------------------------------------------------------------------

  /**
   * Canonical key for a cursor description. Stable across key-insertion-order
   * differences via EJSON canonical stringify.
   * @protected
   */
  _cursorKey(cursorDescription) {
    return EJSON.stringify(cursorDescription, { canonical: true });
  }
}
