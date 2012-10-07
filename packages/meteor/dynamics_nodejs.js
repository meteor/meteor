// Fiber-aware implementation of dynamic scoping, for use on the server

(function () {

  var nextSlot = 0;

  Meteor.EnvironmentVariable = function () {
    this.slot = nextSlot++;
  };

  _.extend(Meteor.EnvironmentVariable.prototype, {
    get: function () {
      if (!Fiber.current)
        throw new Error("Meteor code must always run within a Fiber");

      return Fiber.current._meteor_dynamics &&
        Fiber.current._meteor_dynamics[this.slot];
    },

    withValue: function (value, func) {
      if (!Fiber.current)
        throw new Error("Meteor code must always run within a Fiber");

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
  Meteor.bindEnvironment = function (func, onException, _this) {
    var boundValues = _.clone(Fiber.current._meteor_dynamics || []);

    if (!onException)
      throw new Error("onException must be supplied");

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

})();
