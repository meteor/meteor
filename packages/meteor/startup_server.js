Meteor.startup = function (callback) {
  if (__meteor_bootstrap__.startupHooks) {
    __meteor_bootstrap__.startupHooks.push(callback);
  } else {
    // We already started up. Schedule it to be called.
    // We're on the server, so Meteor._setImmediate is guaranteed to run
    // these in order.
    Meteor._setImmediate(callback);
  }
};
