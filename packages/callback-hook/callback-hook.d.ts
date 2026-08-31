export interface HookOptions {
  /** Whether to wrap callbacks with Meteor.bindEnvironment. Default: true */
  bindEnvironment?: boolean;
  /** Whether to wrap callbacks with Meteor.wrapFn for async support. Default: true */
  wrapAsync?: boolean;
  /** Exception handler function called when a callback throws */
  exceptionHandler?: (exception: Error) => void;
  /** String describing the callback for debug logging on exceptions */
  debugPrintExceptions?: string;
}

export interface HookRegistration<T extends Function = Function> {
  /** The (possibly wrapped) callback function */
  callback: T;
  /** Unregisters the callback */
  stop: () => void;
}

/**
 * Encapsulates the pattern of registering callbacks on a hook.
 */
export class Hook<T extends Function = Function> {
  constructor(options?: HookOptions);

  /**
   * Register a callback on the hook.
   * @param callback The callback function to register
   * @returns An object with `stop()` to unregister and `callback` for the wrapped function
   */
  register(callback: T): HookRegistration<T>;

  /** Clear all registered callbacks. */
  clear(): void;

  /** The number of callbacks currently registered. */
  size(): number;

  /** A snapshot of the registered (wrapped) callbacks as a new array. */
  asArray(): T[];

  /** Replace the registered callbacks with the given array. Throws if not an array. */
  fromArray(callbacks: T[]): void;

  /**
   * For each registered callback, call the passed iterator function with the callback.
   * The iteration is stopped if the iterator function returns a falsy value or throws.
   * @param iterator Function called with each registered callback
   */
  forEach(iterator: (callback: T) => boolean | void): void;

  /**
   * Async version of forEach.
   * @param iterator Async function called with each registered callback
   */
  forEachAsync(iterator: (callback: T) => Promise<boolean | void> | boolean | void): Promise<void>;

  /**
   * @deprecated Use forEach instead
   */
  each(iterator: (callback: T) => boolean | void): void;

  /** Iterate the registered callbacks (`for...of` / spread). */
  [Symbol.iterator](): IterableIterator<T>;
}
