// Implementation of dynamic scoping, for use on the server - with Fibers or AsyncLocalStorage

var Fiber = Meteor._isFibersEnabled && Npm.require('fibers');

let nextSlot = 0;
let callAsyncMethodRunning = false;

Meteor._nodeCodeMustBeInFiber = function() {
  if (!Fiber.current) {
    throw new Error(
      'Meteor code must always run within a Fiber. ' +
        'Try wrapping callbacks that you pass to non-Meteor ' +
        'libraries with Meteor.bindEnvironment.'
    );
  }
};

class EnvironmentVariableFibers {
  constructor() {
    this.slot = nextSlot++;
  }

  get() {
    Meteor._nodeCodeMustBeInFiber();

    return (
      Fiber.current._meteor_dynamics &&
      Fiber.current._meteor_dynamics[this.slot]
    );
  }

  getOrNullIfOutsideFiber() {
    if (!Fiber.current) return null;
    return this.get();
  }

  withValue(value, func) {
    Meteor._nodeCodeMustBeInFiber();

    if (!Fiber.current._meteor_dynamics) {
      Fiber.current._meteor_dynamics = [];
    }
    var currentValues = Fiber.current._meteor_dynamics;

    var saved = currentValues[this.slot];
    try {
      currentValues[this.slot] = value;
      return func();
    } finally {
      currentValues[this.slot] = saved;
    }
  }

  _set(context) {
    Meteor._nodeCodeMustBeInFiber();
    Fiber.current._meteor_dynamics[this.slot] = context;
  }

  _setNewContextAndGetCurrent(value) {
    Meteor._nodeCodeMustBeInFiber();
    if (!Fiber.current._meteor_dynamics) {
      Fiber.current._meteor_dynamics = [];
    }
    const saved = Fiber.current._meteor_dynamics[this.slot];
    this._set(value);
    return saved;
  }
}

class EnvironmentVariableAsync {
  constructor() {
    this.slot = nextSlot++;
  }

  get() {
    const currentValue = Meteor._getValueFromAslStore('_meteor_dynamics');
    return currentValue && currentValue[this.slot];
  }
  getExt() {
    return Meteor._getValueFromAslStore('currentValue');
  }

  getOrNullIfOutsideFiber() {
    return this.get();
  }

  async withValue(value, func) {
    let currentValues = Meteor._getValueFromAslStore('_meteor_dynamics');
    if (!currentValues) {
      currentValues = [];
    }

    const saved = currentValues[this.slot];
    let ret;
    try {
      currentValues[this.slot] = value;
      Meteor._updateAslStore('_meteor_dynamics', currentValues);
      ret = await func();
    } finally {
      currentValues[this.slot] = saved;
      Meteor._updateAslStore('_meteor_dynamics', currentValues);
    }

    return ret;
  }

  async withValueExt(value, func, storeOptions = {}) {
    return Meteor._runAsync(
      async () => {
        let ret;
        try {
          Meteor._updateAslStore('currentValue', value);
          ret = await func();
        } finally {
          console.log(
            `withValueExt finish running ${Meteor._getValueFromAslStore(
              'callId'
            ) || 'no-id'} from met/sub ${Meteor._getValueFromAslStore('name') ||
              'no-name'}`
          );
        }
        return ret;
      },
      this,
      { callId: `withValueExt-${this.slot}`, ...storeOptions }
    );
  }

  _set(context) {
    const _meteor_dynamics =
      Meteor._getValueFromAslStore('_meteor_dynamics') || [];
    _meteor_dynamics[this.slot] = context;
  }

  _setNewContextAndGetCurrent(value) {
    let _meteor_dynamics = Meteor._getValueFromAslStore('_meteor_dynamics');
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
Meteor.EnvironmentVariable = Meteor._isFibersEnabled
  ? EnvironmentVariableFibers
  : EnvironmentVariableAsync;

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
 * function is wrapped within a fiber.
 * @locus Anywhere
 * @memberOf Meteor
 * @param {Function} func Function that is wrapped
 * @param {Function} onException
 * @param {Object} _this Optional `this` object against which the original function will be invoked
 * @return {Function} The wrapped function
 */
Meteor.bindEnvironment = function(func, onException, _this) {
  return Meteor._isFibersEnabled
    ? bindEnvironmentFibers(func, onException, _this)
    : bindEnvironmentAsync(func, onException, _this);
};

const bindEnvironmentFibers = (func, onException, _this) => {
  Meteor._nodeCodeMustBeInFiber();

  var dynamics = Fiber.current._meteor_dynamics;
  var boundValues = dynamics ? dynamics.slice() : [];

  if (!onException || typeof onException === 'string') {
    var description = onException || 'callback of async function';
    onException = function(error) {
      Meteor._debug('Exception in ' + description + ':', error);
    };
  } else if (typeof onException !== 'function') {
    throw new Error(
      'onException argument must be a function, string or undefined for Meteor.bindEnvironment().'
    );
  }

  return function(/* arguments */) {
    var args = Array.prototype.slice.call(arguments);

    var runWithEnvironment = function() {
      var savedValues = Fiber.current._meteor_dynamics;
      try {
        // Need to clone boundValues in case two fibers invoke this
        // function at the same time
        Fiber.current._meteor_dynamics = boundValues.slice();
        var ret = func.apply(_this, args);
      } catch (e) {
        // note: callback-hook currently relies on the fact that if onException
        // throws and you were originally calling the wrapped callback from
        // within a Fiber, the wrapped call throws.
        onException(e);
      } finally {
        Fiber.current._meteor_dynamics = savedValues;
      }
      return ret;
    };

    if (Fiber.current) return runWithEnvironment();
    Fiber(runWithEnvironment).run();
  };
};

const bindEnvironmentAsync = (func, onException, _this) => {
  var dynamics = Meteor._getValueFromAslStore('_meteor_dynamics');
  var boundValues = Array.isArray(dynamics) ? dynamics.slice() : [];

  if (!onException || typeof onException === 'string') {
    var description = onException || 'callback of async function';
    onException = function(error) {
      Meteor._debug('Exception in ' + description + ':', error);
    };
  } else if (typeof onException !== 'function') {
    throw new Error(
      'onException argument must be a function, string or undefined for Meteor.bindEnvironment().'
    );
  }

  return function(/* arguments */) {
    var args = Array.prototype.slice.call(arguments);

    var runWithEnvironment = async function() {
      const savedValues = Meteor._getValueFromAslStore('_meteor_dynamics');
      let ret;
      try {
        // Need to clone boundValues in case two fibers invoke this
        // function at the same time
        // TODO -> Probably not needed
        Meteor._updateAslStore('_meteor_dynamics', boundValues.slice());
        ret = await func.apply(_this, args);
      } catch (e) {
        onException(e);
      } finally {
        Meteor._updateAslStore('_meteor_dynamics', savedValues);
      }
      return ret;
    };

    if (Meteor._getAslStore()) {
      return runWithEnvironment();
    }
    global.asyncLocalStorage.run({}, runWithEnvironment);
  };
};
