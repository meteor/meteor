// Implementation of dynamic scoping, for use on the server with AsyncLocalStorage
let nextSlot = 0;
let callAsyncMethodRunning = false;

const CURRENT_VALUE_KEY_NAME = "currentValue";
const UPPER_CALL_DYNAMICS_KEY_NAME = "upperCallDynamics";

const SLOT_CALL_KEY = "slotCall";
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
    if (this.slot !== Meteor._getValueFromAslStore(SLOT_CALL_KEY)) {
      const dynamics = Meteor._getValueFromAslStore(UPPER_CALL_DYNAMICS_KEY_NAME) || {};

      return dynamics[this.slot];
    }
    return Meteor._getValueFromAslStore(CURRENT_VALUE_KEY_NAME);
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
    const self = this;
    const slotCall = self.slot;
    const dynamics = Object.assign(
      {},
      Meteor._getValueFromAslStore(UPPER_CALL_DYNAMICS_KEY_NAME) || {}
    );

    if (slotCall != null) {
      dynamics[slotCall] = value;
    }

    return Meteor._runAsync(
      function () {
        Meteor._updateAslStore(CURRENT_VALUE_KEY_NAME, value);
        Meteor._updateAslStore(UPPER_CALL_DYNAMICS_KEY_NAME, dynamics);
        return func();
      },
      self,
      Object.assign(
        {
          callId: `${this.slot}-${Math.random()}`,
          [SLOT_CALL_KEY]: this.slot,
        },
        options,
      ),
    );
  }

  _set(context) {
    const _meteor_dynamics =
      Meteor._getValueFromAslStore("_meteor_dynamics") || [];
    _meteor_dynamics[this.slot] = context;
  }

  _setNewContextAndGetCurrent(value) {
    let _meteor_dynamics = Meteor._getValueFromAslStore("_meteor_dynamics");
    if (!_meteor_dynamics) {
      _meteor_dynamics = [];
    }

    const saved = _meteor_dynamics[this.slot];
    this._set(value);
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
  const dynamics = Meteor._getValueFromAslStore(CURRENT_VALUE_KEY_NAME);
  const currentSlot = Meteor._getValueFromAslStore(SLOT_CALL_KEY);

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

    var runWithEnvironment = function () {
      return Meteor._runAsync(
        () => {
          let ret;
          try {
            if (currentSlot) {
              Meteor._updateAslStore(CURRENT_VALUE_KEY_NAME, dynamics);
            }
            ret = func.apply(_this, args);

            // Using this strategy to be consistent between client and server and stop always returning a promise from the server
            if (Meteor._isPromise(ret)) {
              ret = ret.catch(onException);
            }
          } catch (e) {
            onException(e);
          }
          return ret;
        },
        _this,
        {
          callId: `bindEnvironment-${Math.random()}`,
          [SLOT_CALL_KEY]: currentSlot,
        }
      );
    };

    if (Meteor._getAslStore()) {
      return runWithEnvironment();
    }

    return Meteor._getAsl().run({}, runWithEnvironment);
  };
};
