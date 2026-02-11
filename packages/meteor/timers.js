function withoutInvocation(f) {
  if (Package.ddp) {
    var DDP = Package.ddp.DDP;
    var CurrentInvocation =
      DDP._CurrentMethodInvocation ||
      // For backwards compatibility, as explained in this issue:
      // https://github.com/meteor/meteor/issues/8947
      DDP._CurrentInvocation;

    var invocation = CurrentInvocation.get();
    if (invocation && invocation.isSimulation) {
      throw new Error("Can't set timers inside simulations");
    }

    return function () {
      CurrentInvocation.withValue(null, f);
    };
  }
  return f;
}

function bindAndCatch(context, f) {
  return Meteor.bindEnvironment(withoutInvocation(f), context);
}

// Meteor.setTimeout and Meteor.setInterval callbacks scheduled
// inside a server method are not part of the method invocation and
// should clear out the CurrentMethodInvocation environment variable.

/**
 * @memberOf Meteor
 * @summary Call a function in the future after waiting for a specified delay.
 * @locus Anywhere
 * @param {Function} func The function to run
 * @param {Number} delay Number of milliseconds to wait before calling function
 */
Meteor.setTimeout = function (f, duration) {
  return setTimeout(bindAndCatch("setTimeout callback", f), duration);
};

/**
 * @memberOf Meteor
 * @summary Call a function repeatedly, with a time delay between calls.
 * @locus Anywhere
 * @param {Function} func The function to run
 * @param {Number} delay Number of milliseconds to wait between each function call.
 */
Meteor.setInterval = function (f, duration) {
  return setInterval(bindAndCatch("setInterval callback", f), duration);
};

/**
 * @memberOf Meteor
 * @summary Cancel a repeating function call scheduled by `Meteor.setInterval`.
 * @locus Anywhere
 * @param {Object} id The handle returned by `Meteor.setInterval`
 */
Meteor.clearInterval = function (x) {
  return clearInterval(x);
};

/**
 * @memberOf Meteor
 * @summary Cancel a function call scheduled by `Meteor.setTimeout`.
 * @locus Anywhere
 * @param {Object} id The handle returned by `Meteor.setTimeout`
 */
Meteor.clearTimeout = function (x) {
  return clearTimeout(x);
};

// XXX consider making this guarantee ordering of defer'd callbacks, like
// Tracker.afterFlush or Node's nextTick (in practice). Then tests can do:
//    callSomethingThatDefersSomeWork();
//    Meteor.defer(expect(somethingThatValidatesThatTheWorkHappened));

/**
 * @memberOf Meteor
 * @summary Defer execution of a function to run asynchronously in the background (similar to `Meteor.setTimeout(func, 0)`.
 * @locus Anywhere
 * @param {Function} func The function to run
 */
Meteor.defer = function (f) {
  Meteor._setImmediate(bindAndCatch("defer callback", f));
};

/**
 * @memberOf Meteor
 * @summary Defer execution of a function to run asynchronously in the background based on environment (similar to Meteor.isDevelopment ? Meteor.defer(fn) : Meteor.startup(fn)).
 * @locus Anywhere
 * @param {Function} func The function to run
 * @param {Object} options The options object
 * @param {Array<String>} options.on Condition to determine whether to defer the function, you can pass an array of environments ['development', 'production', 'test']
 */
Meteor.deferrable = function (f, options) {
  var on = (options && options.on) || [];

  // throw if on is not an array
  if (!Array.isArray(on)) {
    throw new Error("options.on must be an array");
  }

  var env = Meteor.isDevelopment
    ? "development"
    : Meteor.isProduction
    ? "production"
    : "test";

  if (on.includes(env)) {
    return Meteor.defer(f);
  }

  return f();
};

/**
 * @memberOf Meteor
 * @summary Defer execution of a function to run asynchronously in the background in development (similar to Meteor.isDevelopment ? Meteor.defer(fn) : Meteor.startup(fn)).
 * @locus Anywhere
 * @param {Function} func The function to run
 * @param {Object} options The options object
 */
Meteor.deferDev = function (f) {
  return Meteor.deferrable(f, { on: ["development", "test"] });
};

/**
 * @memberOf Meteor
 * @summary Defer execution of a function to run asynchronously in the background in production (similar to Meteor.isProduction ? Meteor.defer(fn) : Meteor.startup(fn)).
 * @locus Anywhere
 * @param {Function} func The function to run
 * @param {Object} options The options object
 */
Meteor.deferProd = function (f) {
  return Meteor.deferrable(f, { on: ["production"] });
};
