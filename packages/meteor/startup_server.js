Meteor.startup = function (callback) {
  if (__meteor_bootstrap__.startupHooks) {
    __meteor_bootstrap__.startupHooks.push(callback);
  } else {
    // We already started up. Just call it now.
    callback();
  }
};
