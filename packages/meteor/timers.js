_.extend(Meteor, {
  // Meteor.setTimeout and Meteor.setInterval callbacks scheduled
  // inside a server method are not part of the method invocation, and
  // should clear out the CurrentInvocation and CurrentWriteFence
  // environment variables.

  setTimeout: function (f, duration) {
    if (Meteor._CurrentInvocation) {
      if (Meteor._CurrentInvocation.get() && Meteor._CurrentInvocation.get().is_simulation)
        throw new Error("Can't set timers inside simulations");

      var f_with_ci = f;
      f = function () { Meteor._CurrentInvocation.withValue(null, f_with_ci); };
    }

    if (Meteor._CurrentWriteFence) {
      var f_with_cwf = f;
      f = function () { Meteor._CurrentWriteFence.withValue(null, f_with_cwf); };
    }

    return setTimeout(Meteor.bindEnvironment(f, function (e) {
      // XXX report nicely (or, should we catch it at all?)
      Meteor._debug("Exception from setTimeout callback:", e.stack);
    }), duration);
  },

  setInterval: function (f, duration) {
    if (Meteor._CurrentInvocation) {
      if (Meteor._CurrentInvocation.get() && Meteor._CurrentInvocation.get().is_simulation)
        throw new Error("Can't set timers inside simulations");

      var f_with_ci = f;
      f = function () { Meteor._CurrentInvocation.withValue(null, f_with_ci); };
    }

    if (Meteor._CurrentWriteFence) {
      var f_with_cwf = f;
      f = function () { Meteor._CurrentWriteFence.withValue(null, f_with_cwf); };
    }

    return setInterval(Meteor.bindEnvironment(f, function (e) {
      // XXX report nicely (or, should we catch it at all?)
      Meteor._debug("Exception from setInterval callback:", e);
    }), duration);
  },

  clearInterval: function(x) {
    return clearInterval(x);
  },

  clearTimeout: function(x) {
    return clearTimeout(x);
  },

  // won't be necessary once we clobber the global setTimeout
  defer: function (f) {
    // Older Firefox will pass an argument to the setTimeout callback
    // function, indicating the "actual lateness." It's non-standard,
    // so for defer, standardize on not having it.
    Meteor.setTimeout(function () {f();}, 0);
  }
});