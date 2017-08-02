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
  } else {
    return f;
  }
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
Meteor.clearInterval = function(x) {
  return clearInterval(x);
};

/**
 * @memberOf Meteor
 * @summary Cancel a function call scheduled by `Meteor.setTimeout`.
 * @locus Anywhere
 * @param {Object} id The handle returned by `Meteor.setTimeout`
 */
Meteor.clearTimeout = function(x) {
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
