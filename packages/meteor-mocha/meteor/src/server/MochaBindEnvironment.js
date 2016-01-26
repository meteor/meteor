Fiber = Npm.require('fibers');

if( ! practical ) {
  practical = {}
}

practical.bindEnvironment = function (func, onException, _this) {
  Meteor._nodeCodeMustBeInFiber();

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

  // This was added so that mocha knows by Function.length that this is an async function
  return function (callback) {
    var args = _.toArray(arguments);

    var runWithEnvironment = function () {
      var savedValues = Fiber.current._meteor_dynamics;
      try {
        // Need to clone boundValues in case two fibers invoke this
        // function at the same time
        Fiber.current._meteor_dynamics = _.clone(boundValues);
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

    if (Fiber.current)
      return runWithEnvironment();
    Fiber(runWithEnvironment).run();
  };
};
