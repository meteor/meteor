// XXX This pattern is under development. Do not add more callsites
// using this package for now. See:
// https://meteor.hackpad.com/Design-proposal-Hooks-YxvgEW06q6f
//
// Encapsulates the pattern of registering callbacks on a hook.
//
// The `each` method of the hook calls its iterator function argument
// with each registered callback.  This allows the hook to
// conditionally decide not to call the callback (if, for example, the
// observed object has been closed or terminated).
//
// By default, callbacks are bound with `Meteor.bindEnvironment`, so they will be
// called with the Meteor environment of the calling code that
// registered the callback. Override by passing { bindEnvironment: false }
// to the constructor.
//
// Registering a callback returns an object with a single `stop`
// method which unregisters the callback.
//
// The code is careful to allow a callback to be safely unregistered
// while the callbacks are being iterated over.
//
// If the hook is configured with the `exceptionHandler` option, the
// handler will be called if a called callback throws an exception.
// By default (if the exception handler doesn't itself throw an
// exception, or if the iterator function doesn't return a falsy value
// to terminate the calling of callbacks), the remaining callbacks
// will still be called.
//
// Alternatively, the `debugPrintExceptions` option can be specified
// as string describing the callback.  On an exception the string and
// the exception will be printed to the console log with
// `Meteor._debug`, and the exception otherwise ignored.
//
// If an exception handler isn't specified, exceptions thrown in the
// callback will propagate up to the iterator function, and will
// terminate calling the remaining callbacks if not caught.

export class Hook {
  /**
   * Creates a new Hook instance.
   * @param {object} [options={}] - Configuration options for the hook.
   * @param {boolean} [options.bindEnvironment=true] - Whether to automatically wrap registered callbacks with `Meteor.bindEnvironment`.
   *   If `true`, callbacks will run in the Meteor environment of the code that registered them.
   * @param {boolean} [options.wrapAsync=true] - Whether to automatically wrap registered callbacks with `Meteor.wrapFn`.
   *   If `true`, callbacks will be prepared to run asynchronously.
   * @param {Function} [options.exceptionHandler] - A custom function to handle exceptions thrown by registered callbacks.
   *   This function will be called with the exception as its argument.
   *   If provided, `options.debugPrintExceptions` will be ignored.
   * @param {string} [options.debugPrintExceptions] - If an `exceptionHandler` is not provided, and this option is a string,
   *   exceptions thrown by callbacks will be logged to `Meteor._debug` with this string as a description.
   */
    constructor(options = {}) {
      this.callbacks = new Set();

      // Whether to wrap callbacks with Meteor.bindEnvironment
      const { bindEnvironment = true, wrapAsync = true } = options;
      this.bindEnvironment = !!bindEnvironment;
      this.wrapAsync = !!wrapAsync;

      if (options.exceptionHandler) {
        this.exceptionHandler = options.exceptionHandler;
      } else if (options.debugPrintExceptions) {
        if (typeof options.debugPrintExceptions !== "string") {
          throw new Error("Hook option debugPrintExceptions should be a string");
        }
        this.exceptionHandler = options.debugPrintExceptions;
      }
    }

  /**
   * Clears all registered callbacks from this Hook instance.
   * After calling this method, the hook will have no callbacks registered.
   */
  clear() {
    this.callbacks.clear();
  }

  /**
   * Returns the number of callbacks currently registered with this Hook instance.
   * @returns {number} The number of registered callbacks.
   */
  size() {
    return this.callbacks.size;
  }

  /**
   * Returns all registered callbacks as a new Array.
   * This provides a snapshot of the current callbacks.
   * @returns {Array<Function>} An array containing all registered callback functions.
   */
  asArray() {
    return Array.from(this.callbacks);
  }

  /**
   * Replaces the current set of registered callbacks with a new set derived from the given array.
   *
   * @param {Array<Function>} arr An array of callback functions to register with this hook.
   * @throws {Error} If the provided argument `arr` is not an array.
   */
  fromArray(arr) {
    if (!Array.isArray(arr)) {
      throw new Error("Method fromArray expects an array");
    }
    this.callbacks = new Set(arr);
  }

  /**
   * Registers a new callback with this Hook instance.
   *
   * @param {Function} callback The function to register. This function will be called when the hook is iterated over.
   * @returns {{callback: Function, stop: Function}} An object containing:
   *   - `callback`: The actual callback function that was added to the hook's internal set (after any wrapping).
   *   - `stop`: A function that, when called, unregisters this specific callback from the hook.
   */
  register(callback) {
    const exceptionHandler = this.exceptionHandler || function (exception) {
      // Note: this relies on the undocumented fact that if bindEnvironment's
      // onException throws, and you are invoking the callback either in the
      // browser or from within a Fiber in Node, the exception is propagated.
      throw exception;
    };

    if (this.bindEnvironment) {
      callback = Meteor.bindEnvironment(callback, exceptionHandler);
    } else {
      callback = wrapHookWithErrorHandling(callback, exceptionHandler);
    }

    if (this.wrapAsync) {
      callback = Meteor.wrapFn(callback);
    }

    this.callbacks.add(callback);

    return {
      callback,
      stop: () => {
        this.callbacks.delete(callback);
      }
    };
  }

  /**
   * For each registered callback, call the passed iterator function with the callback.
   *
   * The iterator function can choose whether or not to call the
   * callback.  (For example, it might not call the callback if the
   * observed object has been closed or terminated).
   * The iteration is stopped if the iterator function returns a falsy
   * value or throws an exception.
   *
   * @param iterator
   */
  forEach(iterator) {
    for (const callback of this.callbacks) {
      if (!iterator(callback)) break;
    }
  }

  /**
   * For each registered callback, call the passed iterator function with the callback.
   *
   * it is a counterpart of forEach, but it is async and returns a promise
   * @param iterator
   * @return {Promise<void>}
   * @see forEach
   */
  async forEachAsync(iterator) {
    for (const callback of this.callbacks) {
      if (!await iterator(callback)) break;
    }
  }

  /**
   * @deprecated use forEach
   * @param iterator
   */
  each(iterator) {
    return this.forEach(iterator);
  }

  /**
   * Makes the Hook instance iterable, allowing it to be used in `for...of` loops.
   * It iterates over the registered callbacks.
   * @returns {Iterator<Function>} An iterator for the registered callbacks.
   */
  [Symbol.iterator]() {
    return this.callbacks[Symbol.iterator]();
  }
}

/**
 * Wraps a given function with error handling. If the wrapped function throws an exception,
 * it will be caught and passed to the provided exception handler.
 * This is similar to `Meteor.bindEnvironment` but without the Meteor environment binding.
 *
 * @param {Function} func The function to wrap.
 * @param {Function|string} onException The exception handler function to call if `func` throws,
 *   or a string description for default exception logging.
 * @param {any} _this The `this` context to bind to `func` when it is called.
 * @returns {Function} A new function that executes `func` with error handling.
 */
function wrapHookWithErrorHandling(func, onException, _this) {
  const exceptionHandler = normalizeHookExceptionHandler(onException);
  return function executeHookWithErrorHandling(...args) {
    let ret;
    try {
      ret = func.apply(_this, args);
    } catch (e) {
      exceptionHandler(e);
    }
    return ret;
  };
}

/**
 * Normalizes an exception handler, ensuring it is a function.
 * If a function is provided, it is returned directly.
 * If a string is provided, it is used as a description for a default handler that logs exceptions.
 * Otherwise, a generic default handler that logs exceptions with a default description is returned.
 *
 * @param {Function|string} exceptionHandler The exception handler to normalize. Can be a function,
 *   a string description for logging, or any other value (which defaults to generic logging).
 * @returns {Function} A function that handles exceptions.
 */
function normalizeHookExceptionHandler(exceptionHandler) {
  if (typeof exceptionHandler === 'function') {
    return exceptionHandler;
  }

  const description = typeof exceptionHandler === 'string'
    ? exceptionHandler
    : "callback of async function";

  return function defaultHookExceptionHandler(error) {
    Meteor._debug(`Exception in ${description}`, error);
  }
}
