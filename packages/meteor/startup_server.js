Meteor.startup = function (callback) {
  __meteor_bootstrap__.startup_hooks.push(callback);
};
