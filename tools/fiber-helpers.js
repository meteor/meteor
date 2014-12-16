var _ = require("underscore");
var Fiber = require("fibers");
var Future = require("fibers/future");

exports.parallelEach = function (collection, callback, context) {
  var futures = _.map(collection, function () {
    var args = _.toArray(arguments);
    return function () {
      return callback.apply(context, args);
    }.future()();
  });
  Future.wait(futures);
  // Throw if any threw.
  _.each(futures, function (f) { f.get(); });
};

exports.firstTimeResolver = function (fut) {
  var resolver = fut.resolver();
  return function (err, val) {
    if (fut.isResolved())
      return;
    resolver(err, val);
  };
};

// Waits for one future given as an argument to be resolved. Throws if it threw,
// otherwise returns whichever one returns first.  (Because of this, you
// probably want at most one of the futures to be capable of returning, and have
// the other be throw-only.)
exports.waitForOne = function (/* futures */) {
  var fiber = Fiber.current;
  if (!fiber)
    throw Error("Can't waitForOne without a fiber");
  if (arguments.length === 0)
    throw Error("Must wait for at least one future");

  var combinedFuture = new Future;
  for (var i = 0; i < arguments.length; ++i) {
    var f = arguments[i];
    if (f.isResolved()) {
      // Move its value into combinedFuture.
      f.resolve(combinedFuture.resolver());
      break;
    }
    // Otherwise, this function will be invoked when the future is resolved.
    f.resolve(function (err, result) {
      if (!combinedFuture.isResolved()) {
        combinedFuture.resolver()(err, result);
      }
    });
  }

  return combinedFuture.wait();
};

function disallowedYield() {
  throw new Error("Can't call yield in a noYieldsAllowed block!");
}
// Allow testing Fiber.yield.disallowed.
disallowedYield.disallowed = true;

exports.noYieldsAllowed = function (f, context) {
  var savedYield = Fiber.yield;
  Fiber.yield = disallowedYield;
  try {
    return f.call(context || null);
  } finally {
    Fiber.yield = savedYield;
  }
};

// Borrowed from packages/meteor/dynamics_nodejs.js
// Used by buildmessage

exports.nodeCodeMustBeInFiber = function () {
  if (!Fiber.current) {
    throw new Error("Meteor code must always run within a Fiber. " +
                    "Try wrapping callbacks that you pass to non-Meteor " +
                    "libraries with Meteor.bindEnvironment.");
  }
};

var nextSlot = 0;
exports.EnvironmentVariable = function (defaultValue) {
  var self = this;
  self.slot = 'slot' + nextSlot++;
  self.defaultValue = defaultValue;
};

_.extend(exports.EnvironmentVariable.prototype, {
  get: function () {
    var self = this;
    exports.nodeCodeMustBeInFiber();

    if (!Fiber.current._meteorDynamics)
      return self.defaultValue;
    if (!_.has(Fiber.current._meteorDynamics, self.slot))
      return self.defaultValue;
    return Fiber.current._meteorDynamics[self.slot];
  },

  withValue: function (value, func) {
    var self = this;
    exports.nodeCodeMustBeInFiber();

    if (!Fiber.current._meteorDynamics)
      Fiber.current._meteorDynamics = {};
    var currentValues = Fiber.current._meteorDynamics;

    var saved = _.has(currentValues, self.slot)
          ? currentValues[self.slot] : self.defaultValue;
    currentValues[self.slot] = value;

    try {
      return func();
    } finally {
      currentValues[self.slot] = saved;
    }
  }
});

// This is like Meteor.bindEnvironment.
// Experimentally, we are NOT including onException or _this in this version.
exports.bindEnvironment = function (func) {
  exports.nodeCodeMustBeInFiber();

  var boundValues = _.clone(Fiber.current._meteorDynamics || {});

  return function (/* arguments */) {
    var self = this;
    var args = _.toArray(arguments);

    var runWithEnvironment = function () {
      var savedValues = Fiber.current._meteorDynamics;
      try {
        // Need to clone boundValues in case two fibers invoke this
        // function at the same time
        Fiber.current._meteorDynamics = _.clone(boundValues);
        return func.apply(self, args);
      } finally {
        Fiber.current._meteorDynamics = savedValues;
      }
    };

    if (Fiber.current)
      return runWithEnvironment();
    Fiber(runWithEnvironment).run();
  };
};

// An alternative to bindEnvironment for the rare case where you
// want the callback you're passing to some Node function to start
// a new fiber but *NOT* to inherit the current environment.
// Eg, if you are trying to do the equivalent of start a background
// thread.
exports.inBareFiber = function (func) {
  return function (/*arguments*/) {
    var self = this;
    var args = arguments;
    new Fiber(function () {
      func.apply(self, args);
    }).run();
  };
};
