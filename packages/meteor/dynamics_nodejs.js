// Fiber-aware implementation of dynamic scoping, for use on the server

var Fiber = Npm.require('fibers');

var nextSlot = 0;

var noFiberMessage = "Meteor code must always run within a Fiber. " +
                     "Try wrapping callbacks that you pass to non-Meteor " +
                     "libraries with Meteor.bindEnvironment.";

Meteor.EnvironmentVariable = function () {
  this.slot = nextSlot++;
};

_.extend(Meteor.EnvironmentVariable.prototype, {
  get: function () {
    if (!Fiber.current)
      throw new Error(noFiberMessage);

    return Fiber.current._meteor_dynamics &&
      Fiber.current._meteor_dynamics[this.slot];
  },

  withValue: function (value, func) {
    if (!Fiber.current)
      throw new Error(noFiberMessage);

    if (!Fiber.current._meteor_dynamics)
      Fiber.current._meteor_dynamics = [];
    var currentValues = Fiber.current._meteor_dynamics;

    var saved = currentValues[this.slot];
    try {
      currentValues[this.slot] = value;
      var ret = func();
    } finally {
      currentValues[this.slot] = saved;
    }

    return ret;
  }
});

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
Meteor.bindEnvironment = function (func, onException, _this) {
  if (!Fiber.current)
    throw new Error(noFiberMessage);

  var boundValues = _.clone(Fiber.current._meteor_dynamics || []);

  if (!onException || typeof(onException) === 'string') {
    var description = onException || "callback of async function";
    onException = function (error) {
      Meteor._debug(
        "Exception in " + description + ":",
        error && error.stack || error
      );
    };
  }

  return function (/* arguments */) {
    var args = _.toArray(arguments);

    var runWithEnvironment = function () {
      var savedValues = Fiber.current._meteor_dynamics;
      try {
        // Need to clone boundValues in case two fibers invoke this
        // function at the same time
        Fiber.current._meteor_dynamics = _.clone(boundValues);
        var ret = func.apply(_this, args);
      } catch (e) {
        onException(e);
      } finally {
        Fiber.current._meteor_dynamics = savedValues;
      }
      return ret;
    };

    if (Fiber.current)
      return runWithEnvironment();
    Fiber(runWithEnvironment).run();
  };
};


var profiles = {};





var accumHrtime = function (accum, additional) {
  accum[0] += additional[0];
  accum[1] += additional[1];
};

Meteor._profiled = function (tag, f) {
  return function () {
    return Meteor._profile(tag, f);
  };
};

Meteor._profile = function (tag, f) {
  if (!Fiber.current._nonProfiledRun) {
    Fiber.current._nonProfiledRun = Fiber.current.run;

    Fiber.current.run = function (/*arguments*/) {
      enterFiber(this);
      return this._nonProfiledRun.apply(this, arguments);
    };
    Fiber.current._profileStack = [];
  }
  var savedYield = global.yield;
  var enterFiber = function (fib) {
    savedYield = global.yield;
    fib._entered = process.hrtime();
    Fiber.yield = global.yield = function(/* arguments */) {
      exitFiber(Fiber.current, true);
      return savedYield.apply(Fiber.current, arguments);
    };
  };
  var exitFiber = function (fib, isYield) {
    Fiber.yield = global.yield = savedYield;
    if (!_.isEmpty(fib._profileStack)) {
      if (!fib._entered) {
        console.log("fiber run did not go through normal channels");
        return null;
      }
      var elapsed = process.hrtime(fib._entered);
      var profile = fib._profileStack[fib._profileStack.length - 1];
      profile.inFiberTime[0] += elapsed[0];
      profile.inFiberTime[1] += elapsed[1];
      if (isYield)
        profile.yields++;
      return profile;
    }
    return null;
  };
  exitFiber(Fiber.current, false);
  Fiber.current._profileStack.push({
    tag: tag,
    inFiberTime: [0, 0],
    yields: 0
  });
  var start = process.hrtime();
  enterFiber(Fiber.current);
  try {
    f();
  } finally {
    var profile = exitFiber(Fiber.current, false);
  }
  var total = process.hrtime(start);
  // accumulate this profile in the profiles under its tag
  if (!profiles[tag]) {
    profiles[tag] = {
      tag: tag,
      inFiberTime: [0, 0],
      totalTime: [0, 0],
      runs: 0,
      yields: 0
    };
  }
  var accum = profiles[tag];
  accumHrtime(accum.inFiberTime, profile.inFiberTime);
  accumHrtime(accum.totalTime, total);
  accum.yields += profile.yields;
  accum.runs++;
  Fiber.current._profileStack.pop();
  // accumulate the inner time as part of the outer.
  if (!_.isEmpty(Fiber.current._profileStack)) {
    var upperProfile = Fiber.current._profileStack[Fiber.current._profileStack.length - 1];
    accumHrtime(upperProfile.inFiberTime, profile.inFiberTime);
    upperProfile.yields += profile.yields;
  };
};

var pad = function (n, width) {
  n = '' + n;
  return n.length >= width ? n : new Array(width - n.length + 1).join('0') + n;
};

var printableTime = function (hrtime) {
  var ns = Math.floor(hrtime[0]*1e9 + hrtime[1]);
  return "" + Math.floor(ns/1e9) + "." + pad(ns%1e9, 9);
};

Meteor._printProfile = function (tag) {
  var prof = profiles[tag];
  console.log("Profile for", tag);
  console.log("in-fiber time:", printableTime(prof.inFiberTime));
  console.log("total time:", printableTime(prof.totalTime));
  console.log("runs:", prof.runs);
  console.log("");
  if (prof.runs > 0) {
    console.log("yields:", prof.yields);
    console.log("in-fiber time per run:", printableTime(_.map(prof.inFiberTime, function (x) { return x / prof.runs;})));
    console.log("total time per run:", printableTime(_.map(prof.totalTime, function (x) { return x / prof.runs;})));
    console.log("yields per run:", prof.yields/prof.runs);
  }
};


Meteor._getProfile = function (tag) {
  return profiles[tag];
};
