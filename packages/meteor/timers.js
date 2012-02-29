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

  clearInterval: _.bind(clearInterval, null),

  clearTimeout: _.bind(clearTimeout, null),

  // won't be necessary once we clobber the global setTimeout
  defer: function (f) {
    Meteor.setTimeout(f, 0);
  }
});