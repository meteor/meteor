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

const hasOwn = Object.prototype.hasOwnProperty;

export class Hook {
  constructor(options) {
    options = options || {};
    this.nextCallbackId = 0;
    this.callbacks = Object.create(null);
    // Whether to wrap callbacks with Meteor.bindEnvironment
    this.bindEnvironment = true;
    if (options.bindEnvironment === false) {
      this.bindEnvironment = false;
    }

    this.wrapAsync = true;
    if (options.wrapAsync === false) {
      this.wrapAsync = false;
    }

    if (options.exceptionHandler) {
      this.exceptionHandler = options.exceptionHandler;
    } else if (options.debugPrintExceptions) {
      if (typeof options.debugPrintExceptions !== "string") {
        throw new Error("Hook option debugPrintExceptions should be a string");
      }
      this.exceptionHandler = options.debugPrintExceptions;
    }
  }

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
      callback = dontBindEnvironment(callback, exceptionHandler);
    }

    if (this.wrapAsync) {
      callback = Meteor.wrapFn(callback);
    }

    const id = this.nextCallbackId++;
    this.callbacks[id] = callback;

    return {
      callback,
      stop: () => {
        delete this.callbacks[id];
      }
    };
  }

  clear() {
    this.nextCallbackId = 0;
    this.callbacks = [];
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

    const ids = Object.keys(this.callbacks);
    for (let i = 0;  i < ids.length;  ++i) {
      const id = ids[i];
      // check to see if the callback was removed during iteration
      if (hasOwn.call(this.callbacks, id)) {
        const callback = this.callbacks[id];
        if (! iterator(callback)) {
          break;
        }
      }
    }
  }

  async forEachAsync(iterator) {
    const ids = Object.keys(this.callbacks);
    for (let i = 0;  i < ids.length;  ++i) {
      const id = ids[i];
      // check to see if the callback was removed during iteration
      if (hasOwn.call(this.callbacks, id)) {
        const callback = this.callbacks[id];
        if (!await iterator(callback)) {
          break;
        }
      }
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
    const ids = Object.keys(this.callbacks);
    for (let i = 0;  i < ids.length;  ++i) {
      const id = ids[i];
      // check to see if the callback was removed during iteration
      if (hasOwn.call(this.callbacks, id)) {
        const callback = this.callbacks[id];
        if (!await iterator(callback)) {
          break;
        }
      }
    }
  }

  /**
   * @deprecated use forEach
   * @param iterator
   */
  each(iterator) {
    return this.forEach(iterator);
  }
}

// Copied from Meteor.bindEnvironment and removed all the env stuff.
function dontBindEnvironment(func, onException, _this) {
  if (!onException || typeof(onException) === 'string') {
    const description = onException || "callback of async function";
    onException = function (error) {
      Meteor._debug(
        "Exception in " + description,
        error
      );
    };
  }

  return function (...args) {
    let ret;
    try {
      ret = func.apply(_this, args);
    } catch (e) {
      onException(e);
    }
    return ret;
  };
}
