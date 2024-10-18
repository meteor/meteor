const { AsyncLocalStorage } = Npm.require("async_hooks");

let nextSlot = 0;
let callAsyncMethodRunning = false;

const CURRENT_VALUE_KEY = "currentValue";

/**
 * @memberOf Meteor
 * @summary Constructor for EnvironmentVariable
 * @locus Anywhere
 * @class
 */
class EnvironmentVariableAsync {
  constructor() {
    this.slot = nextSlot++;
    this.als = new AsyncLocalStorage()
  }

  /**
   * @memberOf Meteor.EnvironmentVariable
   * @summary Getter for the current value of the variable, or `undefined` if
   * called from outside a `withValue` callback.
   * @method get
   * @locus Anywhere
   * @returns {any} The current value of the variable, or `undefined` if no
   */
  get() {
    return this.als.getStore()?.[CURRENT_VALUE_KEY];
  }

  getOrNullIfOutsideFiber() {
    return this.get();
  }

  /**
   * @summary takes a value and a function, calls the function with the value set for the duration of the call
   * @memberof Meteor.EnvironmentVariable
   * @method withValue
   * @param {any} value The value to set for the duration of the function call
   * @param {Function} func The function to call with the new value of the
   * @returns {ReturnType<func>} The return value of the function
   */
  withValue(value, func) {
    return this.als.run({ [CURRENT_VALUE_KEY]: value }, func);
  }

  _set(context) {
    this.als.enterWith(context);
  }

  _setNewContextAndGetCurrent(value) {
    const saved = this.get()

    this._set({ [CURRENT_VALUE_KEY]: value });

    return saved;
  }

  _isCallAsyncMethodRunning() {
    return callAsyncMethodRunning;
  }

  _setCallAsyncMethodRunning(value) {
    callAsyncMethodRunning = value;
  }
}

/**
 * @memberOf Meteor
 * @summary Constructor for EnvironmentVariable
 * @locus Anywhere
 * @class
 */
Meteor.EnvironmentVariable = EnvironmentVariableAsync;

// Meteor application code is always supposed to be run inside a
// fiber. bindEnvironment ensures that the function it wraps is run from
// inside a fiber and ensures it sees the values of Meteor environment
// variables that are set at the time bindEnvironment is called.
//
// If an environment-bound function is called from outside a fiber (eg, from
// an asynchronous callback from a non-Meteor library such as MongoDB), it'll
// kick off a new fiber to execute the function, and returns undefined as soon
// as that fiber returns or yields (and func's return value is ignored).
//
// If it's called inside a fiber, it works normally (the
// return value of the function will be passed through, and no new
// fiber will be created.)
//
// `onException` should be a function or a string.  When it is a
// function, it is called as a callback when the bound function raises
// an exception.  If it is a string, it should be a description of the
// callback, and when an exception is raised a debug message will be
// printed with the description.
/**
 * @summary Stores the current Meteor environment variables, and wraps the
 * function to run with the environment variables restored. On the server, the
 * function is wrapped within Async Local Storage.
 *
 *  This function has two reasons:
 *  1. Return the function to be executed on the MeteorJS context, having it assigned in Async Local Storage.
 *  2. Better error handling, the error message will be more clear.
 * @locus Anywhere
 * @memberOf Meteor
 * @param {Function} func Function that is wrapped
 * @param {Function} onException
 * @param {Object} thisValue Optional `this` object against which the original function will be invoked
 * @return {Function} The wrapped function
 */
Meteor.bindEnvironment = (func, onException = null, thisValue = null) => {
  if (!onException || typeof onException === "string") {
    const description = onException || "callback of async function";
    onException = function (error) {
      Meteor._debug("Exception in " + description + ":", error);
    };
  } else if (typeof onException !== "function") {
    throw new Error(
      "onException argument must be a function, string or undefined for Meteor.bindEnvironment()."
    );
  }

  return function (...args) {
    let ret;

    try {
      ret = func.apply(thisValue, args);

      if (Meteor._isPromise(ret)) {
        ret = ret.catch(onException);
      }
    } catch (e) {
      onException(e);
    }

    return ret;
  };
};
