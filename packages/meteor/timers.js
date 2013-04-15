var withCurrentInvocation = function (f) {
  if (Meteor._CurrentInvocation) {
    if (Meteor._CurrentInvocation.get() && Meteor._CurrentInvocation.get().isSimulation)
      throw new Error("Can't set timers inside simulations");
    return function () { Meteor._CurrentInvocation.withValue(null, f); };
  }
  else
    return f;
};

var bindAndCatch = function (context, f) {
  return Meteor.bindEnvironment(withCurrentInvocation(f), function (e) {
    // XXX report nicely (or, should we catch it at all?)
    Meteor._debug("Exception from " + context + ":", e);
  });
};

_.extend(Meteor, {
  // Meteor.setTimeout and Meteor.setInterval callbacks scheduled
  // inside a server method are not part of the method invocation and
  // should clear out the CurrentInvocation environment variable.

  setTimeout: function (f, duration) {
    return setTimeout(bindAndCatch("setTimeout callback", f), duration);
  },

  setInterval: function (f, duration) {
    return setInterval(bindAndCatch("setInterval callback", f), duration);
  },

  clearInterval: function(x) {
    return clearInterval(x);
  },

  clearTimeout: function(x) {
    return clearTimeout(x);
  },

  // won't be necessary once we clobber the global setTimeout
  //
  // XXX consider making this guarantee ordering of defer'd callbacks, like
  // Deps.afterFlush or Node's nextTick (in practice). Then tests can do:
  //    callSomethingThatDefersSomeWork();
  //    Meteor.defer(expect(somethingThatValidatesThatTheWorkHappened));
  defer: function (f) {
    // Older Firefox will pass an argument to the setTimeout callback
    // function, indicating the "actual lateness." It's non-standard,
    // so for defer, standardize on not having it.
    Meteor.setTimeout(function () {f();}, 0);
  }
});
