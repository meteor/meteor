export declare class Promise<T> extends globalThis.Promise<T> {
  /** @deprecated Fiber-era declaration retained for Meteor 3.x compatibility. */
  static async<
    Fn extends (this: This, ...args: Args) => unknown,
    This,
    Args extends unknown[]
  >(
    fn: Fn,
    allowReuseOfCurrentFiber?: boolean
  ): (this: This, ...args: Args) => Promise<ReturnType<Fn>>;
  /** @deprecated Fiber-era declaration retained for Meteor 3.x compatibility. */
  static asyncApply<
    Fn extends (this: This, ...args: Args) => unknown,
    This,
    Args extends unknown[]
  >(
    fn: Fn,
    context: This,
    args: Args,
    allowReuseOfCurrentFiber?: boolean
  ): Promise<ReturnType<Fn>>;
  /** @deprecated Fiber-era declaration retained for Meteor 3.x compatibility. */
  static await<T>(value: PromiseLike<T>): T;
  /** @deprecated Fiber-era declaration retained for Meteor 3.x compatibility. */
  static awaitAll<T>(values: Iterable<T | PromiseLike<T>>): T[];
  /** @deprecated Fiber-era declaration retained for Meteor 3.x compatibility. */
  await(): T;
  /** Like `then`, but terminal: any unhandled rejection is rethrown. */
  done(
    onFulfilled?: (value: T) => void,
    onRejected?: (reason: unknown) => void
  ): void;
}
