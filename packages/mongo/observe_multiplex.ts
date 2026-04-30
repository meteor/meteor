import isEmpty from "lodash.isempty";
import { EJSON } from "meteor/ejson";
import { ObserveHandle } from "./observe_handle";

interface ObserveMultiplexerOptions {
  ordered: boolean;
  onStop?: () => void;
}

export type ObserveHandleCallback =
  | "added"
  | "addedBefore"
  | "changed"
  | "movedBefore"
  | "removed";

type DeliveryChain = Promise<unknown>;

interface ChainedHandle extends ObserveHandle {
  _deliveryChain?: DeliveryChain;
}

/**
 * Allows multiple identical ObserveHandles to be driven by a single observe driver.
 *
 * This optimization ensures that multiple identical observations
 * don't result in duplicate database queries.
 *
 * Concurrency model
 * -----------------
 * Notifications are delivered through *per-handle* promise chains rather than a
 * single shared FIFO queue. The previous design serialized initial-adds for new
 * handles, change notifications for all handles, and fence `onFlush` commits
 * through one `_AsynchronousQueue`, which produced head-of-line blocking under
 * parallel test load: a slow `_sendAdds` (or any slow user callback) would
 * defer fence commits indefinitely, so DDP `updated` messages never landed and
 * methods that depended on data quiescence would hang past the test timeout.
 *
 * In the new model:
 *
 *   - `_applyCallback` synchronously updates the cache, then synchronously
 *     fans the event out across all currently-attached handles by extending
 *     each handle's `_deliveryChain`.
 *
 *   - Each handle's chain is seeded from `handle.initialAddsSent`, so
 *     mid-stream notifications for a given handle are gated behind that
 *     handle's own initial adds — without holding back other handles.
 *
 *   - `_addHandleAndSendInitialAdds` runs outside any shared queue. It waits
 *     for `_readyPromise` (so the cache is fully populated by the driver),
 *     installs the handle into `_handles`, and starts `_sendAdds` immediately.
 *     The cache iteration in `_sendAdds` is synchronous, so it captures a
 *     consistent snapshot before any subsequent `_applyCallback` can mutate
 *     state.
 *
 *   - `onFlush(cb)` snapshots the current per-handle delivery chains and
 *     awaits them before running `cb`. Events queued *before* `onFlush` was
 *     called (the events corresponding to the fence's writes) are guaranteed
 *     to have been delivered; events queued *after* (other fences' writes)
 *     do not block this commit. This preserves backpressure between a write's
 *     own notifications and its commit while removing cross-write blocking.
 */
export class ObserveMultiplexer {
  private readonly _ordered: boolean;
  private readonly _onStop: () => void;
  private _handles: { [key: string]: ChainedHandle } | null;
  private _resolver: ((value?: unknown) => void) | null;
  private readonly _readyPromise: Promise<boolean | void>;
  private _isReady: boolean;
  private _cache: any;
  private _addHandleTasksScheduledButNotPerformed: number;

  constructor({ ordered, onStop = () => {} }: ObserveMultiplexerOptions) {
    if (ordered === undefined) throw Error("must specify ordered");

    // @ts-ignore
    Package["facts-base"] &&
      Package["facts-base"].Facts.incrementServerFact(
        "mongo-livedata",
        "observe-multiplexers",
        1
      );

    this._ordered = ordered;
    this._onStop = onStop;
    this._handles = {};
    this._resolver = null;
    this._isReady = false;
    this._readyPromise = new Promise((r) => (this._resolver = r)).then(
      () => (this._isReady = true)
    );
    // @ts-ignore
    this._cache = new LocalCollection._CachingChangeObserver({ ordered });
    this._addHandleTasksScheduledButNotPerformed = 0;

    this.callbackNames().forEach((callbackName) => {
      (this as any)[callbackName] = (...args: any[]) => {
        this._applyCallback(callbackName, args);
      };
    });
  }

  addHandleAndSendInitialAdds(handle: ObserveHandle): Promise<void> {
    return this._addHandleAndSendInitialAdds(handle as ChainedHandle);
  }

  async _addHandleAndSendInitialAdds(handle: ChainedHandle): Promise<void> {
    ++this._addHandleTasksScheduledButNotPerformed;

    // @ts-ignore
    Package["facts-base"] &&
      Package["facts-base"].Facts.incrementServerFact(
        "mongo-livedata",
        "observe-handles",
        1
      );

    try {
      // Wait for the driver to populate the cache and call `ready()`. Doing
      // this *before* registering the handle in `_handles` means concurrent
      // `_applyCallback` fan-outs (which are gated on `_ready()` for non-add
      // events) won't try to deliver to a half-initialized handle.
      await this._readyPromise;

      // Multiplexer was stopped while we were waiting — nothing to send.
      if (!this._handles) {
        handle.initialAddsSentResolver();
        return;
      }

      // Seed the per-handle delivery chain with `_sendAdds` BEFORE the handle
      // becomes visible to `_applyCallback`. `_sendAdds` iterates the cache
      // synchronously up to its first `await`, so the registration on the next
      // line happens *after* the snapshot is captured. Any change that arrives
      // after this point is delivered as a notification chained behind
      // `_deliveryChain` (i.e. behind the initial adds), so the new handle
      // sees: initial adds based on the snapshot, then mid-stream events.
      const sendAdds = this._sendAdds(handle);
      handle._deliveryChain = sendAdds;
      this._handles[handle._id] = handle;

      await sendAdds;
    } finally {
      --this._addHandleTasksScheduledButNotPerformed;
    }
  }

  async removeHandle(id: number): Promise<void> {
    if (!this._ready())
      throw new Error("Can't remove handles until the multiplex is ready");

    if (this._handles) {
      delete this._handles[id];
    }

    // @ts-ignore
    Package["facts-base"] &&
      Package["facts-base"].Facts.incrementServerFact(
        "mongo-livedata",
        "observe-handles",
        -1
      );

    if (
      this._handles &&
      isEmpty(this._handles) &&
      this._addHandleTasksScheduledButNotPerformed === 0
    ) {
      await this._stop();
    }
  }

  async _stop(options: { fromQueryError?: boolean } = {}): Promise<void> {
    if (!this._ready() && !options.fromQueryError)
      throw Error("surprising _stop: not ready");

    await this._onStop();

    // @ts-ignore
    Package["facts-base"] &&
      Package["facts-base"].Facts.incrementServerFact(
        "mongo-livedata",
        "observe-multiplexers",
        -1
      );

    this._handles = null;
  }

  async ready(): Promise<void> {
    if (this._ready()) {
      throw Error("can't make ObserveMultiplex ready twice!");
    }
    if (!this._resolver) {
      throw new Error("Missing resolver");
    }
    // Resolve synchronously. The previous implementation routed this through
    // the shared queue so the resolver ran after any pending notification
    // tasks; with per-handle chains there is no shared FIFO to drain, and the
    // cache mutations performed by those tasks happen synchronously in
    // `_applyCallback`, so the cache is already up-to-date the moment we
    // return.
    this._resolver();
    this._isReady = true;
  }

  async queryError(err: Error): Promise<void> {
    if (this._ready())
      throw Error("can't claim query has an error after it worked!");
    await this._stop({ fromQueryError: true });
    throw err;
  }

  async onFlush(cb: () => void | Promise<void>): Promise<void> {
    // The driver calls `onFlush` after it has synchronously fanned out the
    // notifications corresponding to the current fence's writes (via
    // `multiplexer.added/changed/removed`). Snapshot the per-handle delivery
    // chains now: anything queued before this point is part of the snapshot
    // and will be awaited; anything queued afterward (e.g. a notification for
    // a *different* fence's write) is not — its commit will be handled by
    // that fence's own `onFlush`.
    if (!this._ready()) {
      // Match the old contract: `onFlush` is only valid once the multiplexer
      // is (or will be) ready. With the synchronous `ready()` we no longer
      // race the resolver, but a misbehaving driver could still call
      // `onFlush` before `ready()` — surface that as before.
      throw Error("only call onFlush on a multiplexer that will be ready");
    }

    const inflight: Promise<unknown>[] = [];
    if (this._handles) {
      for (const handleId of Object.keys(this._handles)) {
        const handle = this._handles[handleId];
        if (!handle) continue;
        if (handle._deliveryChain) {
          inflight.push(handle._deliveryChain);
        } else {
          // Handle is registered but hasn't received any events yet. Wait on
          // its initialAddsSent so a commit can't fire ahead of the very
          // first `_added` for a freshly-attached handle.
          inflight.push(handle.initialAddsSent);
        }
      }
    }
    if (inflight.length) {
      await Promise.allSettled(inflight);
    }
    await cb();
  }

  callbackNames(): ObserveHandleCallback[] {
    return this._ordered
      ? ["addedBefore", "changed", "movedBefore", "removed"]
      : ["added", "changed", "removed"];
  }

  _ready(): boolean {
    return !!this._isReady;
  }

  _applyCallback(callbackName: string, args: any[]) {
    // Update cache SYNCHRONOUSLY so it's immediately available for subsequent
    // operations. This prevents race conditions where an update event arrives
    // before the insert has been recorded in the cache.
    this._cache.applyChange[callbackName].apply(null, args);

    if (!this._handles) return;

    if (
      !this._ready() &&
      callbackName !== "added" &&
      callbackName !== "addedBefore"
    ) {
      throw new Error(`Got ${callbackName} during initial adds`);
    }

    // Fan out synchronously: extend each handle's per-handle delivery chain
    // with this event. Per-handle chains preserve event order for that handle
    // while letting different handles deliver in parallel. Crucially, a slow
    // callback on one handle no longer holds up notifications on other
    // handles — and no longer holds up `onFlush` commits on this multiplexer
    // for unrelated writes.
    for (const handleId of Object.keys(this._handles)) {
      const handle = this._handles[handleId];
      if (!handle) continue;

      const callback = (handle as any)[`_${callbackName}`];
      if (!callback) continue;

      const clonedArgs = handle.nonMutatingCallbacks
        ? args
        : EJSON.clone(args);

      const previous: DeliveryChain =
        handle._deliveryChain || handle.initialAddsSent;

      handle._deliveryChain = previous.then(() => {
        // Re-check on the microtask: the handle may have been removed (or the
        // entire multiplexer stopped) while waiting for our turn in the chain.
        if (!this._handles || !this._handles[handle._id]) return;

        try {
          const r = callback.apply(null, clonedArgs);
          // Match the previous semantics: log and discard any rejection from
          // the user callback, but do NOT await the returned promise. Awaiting
          // here would let a slow (or hung) async callback hold up subsequent
          // events on the same handle and — via the snapshot in `onFlush` —
          // any future fence commit on this multiplexer. The callback's sync
          // portion has already run by the time we return, which is what
          // determines event order on the handle.
          if (r && Meteor._isPromise(r)) {
            r.catch((error: unknown) => {
              console.error(
                `Error in observeChanges callback ${callbackName}:`,
                error
              );
            });
          }
        } catch (error) {
          console.error(
            `Error in observeChanges callback ${callbackName}:`,
            error
          );
        }
      });
    }
  }

  async _sendAdds(handle: ChainedHandle): Promise<void> {
    const add = this._ordered ? handle._addedBefore : handle._added;
    if (!add) {
      handle.initialAddsSentResolver();
      return;
    }

    const addPromises: (Promise<void> | void)[] = [];

    // note: docs may be an _IdMap or an OrderedDict.
    // The forEach iteration is synchronous: by the time this function awaits
    // below, `addPromises` reflects the cache state as of *this* call. Any
    // subsequent cache mutations are delivered as chained notifications on
    // the handle's `_deliveryChain` (set up by the caller before any await).
    this._cache.docs.forEach((doc: any, id: string) => {
      const { _id, ...fields } = handle.nonMutatingCallbacks
        ? doc
        : EJSON.clone(doc);

      const promise = new Promise<void>((resolve, reject) => {
        try {
          const r = this._ordered ? add(id, fields, null) : add(id, fields);
          resolve(r);
        } catch (error) {
          reject(error);
        }
      });

      addPromises.push(promise);
    });

    const settled = await Promise.allSettled(addPromises);
    for (const result of settled) {
      if (result.status === "rejected") {
        console.error(`Error in adds for handle: ${result.reason}`);
      }
    }

    handle.initialAddsSentResolver();
  }
}
