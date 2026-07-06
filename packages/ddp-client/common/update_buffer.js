import { Meteor } from 'meteor/meteor';
import { isEmpty } from "meteor/ddp-common/utils";

// Collects incoming data-message writes per collection and owns the decision
// of when to flush them to the stores:
//
//   - a non-batched message (anything but added/changed/removed), or
//     batching disabled (interval 0)          → flush immediately
//   - writes arriving within `interval` ms    → debounced into one flush
//   - continuous writes                       → flushed at least every
//                                               `maxAge` ms
//
// The buffer owns its two timers (the debounce handle and the max-age
// deadline) and the atomic take-and-clear used by the flush, so the whole
// batching lifecycle lives in one place.
export class UpdateBuffer {
  // flush: called (and awaited where the caller awaits) to drain the buffer;
  //        it must call takeAll() to claim the pending writes.
  constructor({ interval, maxAge, flush }) {
    this._interval = interval;
    this._maxAge = maxAge;
    this._flush = flush;

    // Collection name -> array of messages.
    this._writes = Object.create(null);
    // When the current buffer must be flushed by, in ms timestamp.
    this._flushAt = null;
    // Timeout handle for the next processing of all pending writes.
    this._flushHandle = null;

    // The flush promise from a debounce-timer flush, exposed so tests can
    // await write completion (Connection._liveDataWritesPromise aliases it).
    this.pendingWritesPromise = undefined;
  }

  // The accumulator that message processors push writes into.
  get writes() {
    return this._writes;
  }

  isEmpty() {
    return isEmpty(this._writes);
  }

  // Apply the flush policy after a message has been processed into the
  // buffer. Immediate flushes are awaited; a scheduled flush returns at
  // once and records its promise in pendingWritesPromise when it runs.
  async afterMessage(isBatchedWrite) {
    if (this._interval === 0 || !isBatchedWrite) {
      await this._flush();
      return;
    }

    if (this._flushAt === null) {
      this._flushAt = new Date().valueOf() + this._maxAge;
    } else if (this._flushAt < new Date().valueOf()) {
      await this._flush();
      return;
    }

    if (this._flushHandle) {
      clearTimeout(this._flushHandle);
    }
    this._flushHandle = setTimeout(() => {
      this.pendingWritesPromise = this._flush();
      if (Meteor._isPromise(this.pendingWritesPromise)) {
        this.pendingWritesPromise.finally(
          () => (this.pendingWritesPromise = undefined)
        );
      }
    }, this._interval);
  }

  // Atomically claim the pending writes and reset the batching state. The
  // buffer is cleared before the writes are applied because there is no
  // guarantee the store updates will exit cleanly.
  takeAll() {
    if (this._flushHandle) {
      clearTimeout(this._flushHandle);
      this._flushHandle = null;
    }
    this._flushAt = null;

    const writes = this._writes;
    this._writes = Object.create(null);
    return writes;
  }
}
