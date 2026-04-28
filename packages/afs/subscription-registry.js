/**
 * SubscriptionRegistry — per-key serialization queue for adapter subscription
 * lifecycles.
 *
 * Push-based StreamProviders (Postgres LISTEN/NOTIFY, Redis Pub/Sub, Kafka,
 * NATS) all need the same primitive: a per-channel / per-topic queue where
 * register / unregister operations run sequentially and operations on
 * different keys run in parallel. Without per-key serialization, a
 * concurrent register + unregister on the same channel can interleave and
 * leave the source stuck listening to a key whose state has been torn down
 * (or vice versa).
 *
 * On top of `run`, `dropAtomically` exists so an adapter can fold an
 * unregister + storage drop into a single slot for the key — preventing the
 * deadlock that would otherwise occur if the drop body called back into
 * `run(key, ...)` recursively.
 */
export class SubscriptionRegistry {
  constructor() {
    // key → tail Promise. The tail is the "sequencing chain" promise — it
    // resolves whether or not the underlying op succeeded so a single
    // failure does not poison everything queued behind it. Each call to
    // `run` / `dropAtomically` chains a new op onto the tail and updates
    // the map.
    this._queues = new Map();
  }

  /**
   * Run `fn` serialized against any other run/dropAtomically targeting `key`.
   * Returns a promise that resolves / rejects with `fn`'s actual outcome —
   * the caller sees the raw exception even though the internal sequencing
   * chain catches it for ordering purposes.
   *
   * @param {string} key
   * @param {() => Promise<any>} fn
   * @returns {Promise<any>}
   */
  async run(key, fn) {
    const prev = this._queues.get(key) ?? Promise.resolve();
    // The sequencing chain catches errors in both branches so a failed op
    // never blocks ops queued behind it.
    const next = prev.then(fn, fn);
    this._queues.set(key, next);
    // After this op settles (success or failure), if no newer op was
    // chained on top of `next`, drop the entry to bound memory. Otherwise
    // the newer op owns the slot and will clean up when it settles.
    //
    // Use `.then(cleanup, cleanup)` rather than `.finally(cleanup)` so
    // the cleanup chain consumes a rejection from `fn` instead of
    // propagating it into a new unobserved promise — which would
    // surface as an UnhandledPromiseRejection at the process level
    // even though the caller awaits `next` directly and handles it.
    const cleanup = () => {
      if (this._queues.get(key) === next) {
        this._queues.delete(key);
      }
    };
    next.then(cleanup, cleanup);
    // Caller sees the raw outcome of fn. We can return `next` directly
    // here — `prev.then(fn, fn)` calls fn once, the resulting promise
    // resolves / rejects with fn's outcome.
    return next;
  }

  /**
   * Same per-key serialization as {@link run}, but signals intent that this
   * op is the LAST operation for `key`. Callers are responsible for not
   * enqueuing further ops on `key` after `dropAtomically` resolves; if they
   * do, those ops will run normally — there is no tombstone fence.
   *
   * Structurally `dropAtomically(key, fn)` is identical to `run(key, fn)`:
   * both chain `fn` onto the per-key tail, delete the entry once nothing
   * newer owns the slot, and propagate `fn`'s outcome to the caller. The
   * empty-key cleanup happens whether or not the op was a "drop." The
   * difference is documentary: `dropAtomically` names the caller's
   * intent, while `run` is the general-purpose primitive.
   *
   * Like `run`, awaiting a recursive `run(key, ...)` or
   * `dropAtomically(key, ...)` from inside `fn` deadlocks; call the
   * underlying primitives directly instead.
   *
   * @param {string} key
   * @param {() => Promise<any>} fn
   * @returns {Promise<any>}
   */
  async dropAtomically(key, fn) {
    return this.run(key, fn);
  }

  /**
   * Returns true if any operation is queued or running for `key`.
   * Mainly useful for tests and observability.
   *
   * @param {string} key
   * @returns {boolean}
   */
  isBusy(key) {
    return this._queues.has(key);
  }

  /**
   * Wait for every queued operation across every key to settle. Useful in
   * `_drainPendingWrites` overrides where the provider needs to know that
   * no pending subscribe / drop work remains before transport teardown.
   *
   * @returns {Promise<void>}
   */
  async drain() {
    // Snapshot the values; new ops queued after we snapshot will not block
    // drain — by that point they were not "pending at drain time."
    const tails = [...this._queues.values()];
    await Promise.allSettled(tails);
  }
}
