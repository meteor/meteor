// Simple implementation of dynamic scoping, for use in browsers

var nextSlot = 0;
var currentValues = [];
var callAsyncMethodRunning = false;

Meteor.EnvironmentVariable = function () {
  this.slot = nextSlot++;
};

var EVp = Meteor.EnvironmentVariable.prototype;

EVp.getCurrentValues = function () {
  return currentValues;
};
/**
 * @memberof Meteor.EnvironmentVariable
 * @method get
 * @returns {any} The current value of the variable, or its default value if
 */
EVp.get = function () {
  return currentValues[this.slot];
};

EVp.getOrNullIfOutsideFiber = function () {
  return this.get();
};


/**
 * @memberof Meteor.EnvironmentVariable
 * @method withValue
 * @param {any} value The value to set for the duration of the function call
 * @param {Function} func The function to call with the new value of the
 * @returns {any} The return value of the function
 */
EVp.withValue = function (value, func) {
  var saved = currentValues[this.slot];

  try {
    currentValues[this.slot] = value;

    var ret = func();
    var isPromise = Meteor._isPromise(ret);

    if (isPromise) {
      var self = this;
      return ret.then(function (res) {
        currentValues[self.slot] = saved;
        return res
      });
    }
  } catch (e) {
    throw e;
  } finally {
    if (!isPromise) {
      currentValues[this.slot] = saved;
    }
  }

  return ret;
};

EVp._set = function (context) {
  currentValues[this.slot] = context;
};

EVp._setNewContextAndGetCurrent = function (value) {
  var saved = currentValues[this.slot];
  this._set(value);
  return saved;
};

EVp._isCallAsyncMethodRunning = function () {
  return callAsyncMethodRunning;
};

EVp._setCallAsyncMethodRunning = function (value) {
  callAsyncMethodRunning = value;
};


Meteor.bindEnvironment = function (func, onException, _this) {
  // needed in order to be able to create closures inside func and
  // have the closed variables not change back to their original
  // values
  var boundValues = currentValues.slice();

  if (!onException || typeof(onException) === 'string') {
    var description = onException || "callback of async function";
    onException = function (error) {
      Meteor._debug(
        "Exception in " + description + ":",
        error
      );
    };
  }

  return function (/* arguments */) {
    var savedValues = currentValues;
    try {
      currentValues = boundValues;
      var ret = func.apply(_this, arguments);
    } catch (e) {
      // note: callback-hook currently relies on the fact that if onException
      // throws in the browser, the wrapped call throws.
      onException(e);
    } finally {
      currentValues = savedValues;
    }
    return ret;
  };
};
