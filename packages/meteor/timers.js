_.extend(Meteor, {
  setTimeout: function (f, duration) {
    return setTimeout(Meteor.bindEnvironment(f, function (e) {
      // XXX report nicely (or, should we catch it at all?)
      Meteor._debug("Exception from setTimeout callback:", e.stack);
    }), duration);
  },

  setInterval: function (f, duration) {
    return setInterval(Meteor.bindEnvironment(f, function (e) {
      // XXX report nicely (or, should we catch it at all?)
      Meteor._debug("Exception from setInterval callback:", e.stack);
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
    // Older Firefox will pass an argument to the setTimout callback
    // function, indicating the "actual lateness." It's non-standard,
    // so for defer, standardize on not having it.
    Meteor.setTimeout(function () {f();}, 0);
  }
});