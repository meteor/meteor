// The Meteor Promise is the native global Promise with one added prototype
// method, `done`. The Fiber-era static/instance helpers (async, asyncApply,
// await, awaitAll, prototype.await) were removed in Meteor 3 and are NOT present
// on the runtime Promise (see promise/extensions.js, which only adds done/finally).
export declare class Promise<T> extends globalThis.Promise<T> {
  /** Like `then`, but terminal: any unhandled rejection is rethrown. */
  done(
    onFulfilled?: (value: T) => void,
    onRejected?: (reason: unknown) => void
  ): void;
}
