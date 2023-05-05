var _ = require("underscore");

const {debug} = require("util");
const makeGlobalAsyncLocalStorage = () => {
  if (!global.asyncLocalStorage) {
    const { AsyncLocalStorage } = require('async_hooks');
    global.asyncLocalStorage = new AsyncLocalStorage();
  }

  return global.asyncLocalStorage;
};

const getAslStore = () => global.asyncLocalStorage.getStore();
const getValueFromAslStore = key => getAslStore()[key];
const updateAslStore = (key, value) => getAslStore()[key] = value;

exports.makeGlobalAsyncLocalStorage = makeGlobalAsyncLocalStorage;

exports.parallelEach = async function (collection, callback, context) {
  const errors = [];
  context = context || null;

  const results = await Promise.all(_.map(collection, (...args) => {
    async function run() {
      return callback.apply(context, args);
    }

    return run().catch(error => {
      // Collect the errors but do not propagate them so that we can
      // re-throw the first error after all iterations have completed.
      errors.push(error);
    });
  }));

  if (errors.length > 0) {
    throw errors[0];
  }

  return results;
};

function disallowedYield() {
  throw new Error("Can't call yield in a noYieldsAllowed block!");
}
// Allow testing Fiber.yield.disallowed.
disallowedYield.disallowed = true;

exports.noYieldsAllowed = function (f, context) {
  // no op since we don't use fibers anymore
  return f.call(context || null);
};

// Borrowed from packages/meteor/dynamics_nodejs.js
// Used by buildmessage

var nextSlot = 0;
exports.EnvironmentVariable = function (defaultValue) {
  var self = this;
  self.slot = 'slot' + nextSlot++;
  self.defaultValue = defaultValue;
};

Object.assign(exports.EnvironmentVariable.prototype, {
  /**
   * @memberof Meteor.EnvironmentVariable
   * @method get
   * @returns {any} The current value of the variable, or its default value if
   */
  get() {
    const self = this;
    const currentValue = getValueFromAslStore("_meteor_dynamics");
    let returnValue = currentValue && currentValue[self.slot];

    if (!returnValue) {
      returnValue = self.defaultValue;
    }

    return returnValue;
  },

  set(value) {
    const self = this;
    const currentValues = getValueFromAslStore("_meteor_dynamics") || {};

    const saved = _.has(currentValues, self.slot)
      ? currentValues[self.slot]
      : this.defaultValue;

    currentValues[self.slot] = value;
    updateAslStore("_meteor_dynamics", currentValues);

    return () => {
      currentValues[self.slot] = saved;
      updateAslStore("_meteor_dynamics", currentValues);
    };
  },

  /**
   * @memberof Meteor.EnvironmentVariable
   * @method withValue
   * @param {any} value The value to set for the duration of the function call
   * @param {Function} func The function to call with the new value of the
   * @returns {any} The return value of the function
   */
  async withValue(value, func) {
    const reset = this.set(value);
    try {
      return await func();
    } finally {
      reset();
    }
  }
});

// This is like Meteor.bindEnvironment.
// Experimentally, we are NOT including onException or _this in this version.
exports.bindEnvironment = function (func) {
  var dynamics = getValueFromAslStore("_meteor_dynamics");
  var boundValues = Array.isArray(dynamics) ? dynamics.slice() : [];

  return function (...args) {
    const self = this;

    var runWithEnvironment = async function () {
      const savedValues = getValueFromAslStore("_meteor_dynamics");
      let ret;
      try {
        // Need to clone boundValues in case two fibers invoke this
        // function at the same time
        // TODO -> Probably not needed
        updateAslStore("_meteor_dynamics", boundValues.slice());
        ret = await func.apply(self, args);
      } catch (e) {
        console.error(e);
      } finally {
        updateAslStore("_meteor_dynamics", savedValues);
      }
      return ret;
    };

    if (getAslStore()) {
      return runWithEnvironment();
    }

    return global.asyncLocalStorage.run({}, runWithEnvironment);
  };
};

// Returns a Promise that supports .resolve(result) and .reject(error).
exports.makeFulfillablePromise = function () {
  var resolve, reject;
  var promise = new Promise(function (res, rej) {
    resolve = res;
    reject = rej;
  });
  promise.resolve = resolve;
  promise.reject = reject;
  return promise;
};
