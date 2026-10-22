// Implementation of dynamic scoping, for use on the server with AsyncLocalStorage
let nextSlot = 0;
let callAsyncMethodRunning = false;

/**
 * @memberOf Meteor
 * @summary Constructor for EnvironmentVariable
 * @locus Anywhere
 * @class
 */
class EnvironmentVariableAsync {
  constructor() {
    this.slot = nextSlot++;
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
    let store = Meteor._getAslStore();

    if (store && store.dynamics) {
      return store.dynamics[this.slot];
    }
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
   * @param {Object} [options] Optional additional properties for adding in [asl](https://nodejs.org/api/async_context.html#class-asynclocalstorage)
   * @returns {Promise<any>} The return value of the function
   */
  withValue(value, func, options = {}) {
    let store = Meteor._getAslStore();
    let dynamics = store && store.dynamics ? store.dynamics.slice() : [];
    dynamics[this.slot] = value;

    let newStore = { dynamics: dynamics };

    if (options) {
      Object.assign(newStore, options);
    }

    return Meteor._getAsl().run(newStore, func);
  }

  _set(value) {
    const dynamics = Meteor._getValueFromAslStore('dynamics') || [];
    dynamics[this.slot] = value;
  }

  _setNewContextAndGetCurrent(value) {
    const dynamics = Meteor._getValueFromAslStore('dynamics') || [];
    
    const saved = dynamics[this.slot];
    
    dynamics[this.slot] = value;

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
 * @param {Object} _this Optional `this` object against which the original function will be invoked
 * @return {Function} The wrapped function
 */
Meteor.bindEnvironment = (func, onException, _this) => {
  let store = Meteor._getAsl().getStore();
  let dynamics = store && store.dynamics ? store.dynamics.slice() : [];

  if (!onException || typeof onException === "string") {
    var description = onException || "callback of async function";
    onException = function (error) {
      Meteor._debug("Exception in " + description + ":", error);
    };
  } else if (typeof onException !== "function") {
    throw new Error(
      "onException argument must be a function, string or undefined for Meteor.bindEnvironment()."
    );
  }

  return function (/* arguments */) {
    var args = Array.prototype.slice.call(arguments);

    return Meteor._getAsl().run({
      dynamics: dynamics
    }, function () {
      let ret;
      try {
        ret = func.apply(_this, args);

        // Using this strategy to be consistent between client and server and stop always returning a promise from the server
        if (Meteor._isPromise(ret)) {
          ret = ret.catch(onException);
        }
      } catch (e) {
        onException(e);
      }
      return ret;
    });
  };
};
