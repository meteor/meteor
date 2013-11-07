var crypto = Npm.require('crypto');

AutoUpdate = {};


// Everything that goes into the client code and resources as
// downloaded by the browser.

var calculateClientHash = function () {
  var hash = crypto.createHash('sha1');
  hash.update(JSON.stringify(__meteor_runtime_config__), 'utf8');
  _.each(WebApp.clientProgram.manifest, function (resource) {
    if (resource.where === 'client' || resource.where === 'internal') {
      hash.update(resource.hash);
    }
  });
  return hash.digest('hex');
};


// We need to calculate the autoupdate version after all packages have
// loaded and have had an opportunity to update
// `__meteor_runtime_config__`, so it's possible a subscription might
// get started before we have the version available.

var autoUpdateVersion = null;


// Subscriptions waiting for the autoupdate version to become
// available.

var callbacks = [];


// Calls the callback `cb` when the version is available.

AutoUpdate.withAutoUpdateVersion = function (cb) {
  if (autoUpdateVersion === null)
    callbacks.push(cb);
  else
    cb(autoUpdateVersion);
};


Meteor.publish(
  "meteor_autoupdate_clientVersions",
  function () {
    var self = this;
    AutoUpdate.withAutoUpdateVersion(function (autoUpdateVersion) {
      self.added(
        "meteor_autoupdate_clientVersions",
        autoUpdateVersion,
        {current: true}
      );
      self.ready();
    });
  },
  {is_auto: true}
);


// Wait until all packages have loaded and have had a chance to
// populate __meteor_runtime_config__.

Meteor.startup(function () {
  autoUpdateVersion =
    process.env.AUTOUPDATE_VERSION ||
    process.env.SERVER_ID ||
    calculateClientHash();
    
  __meteor_runtime_config__.autoUpdateVersion = autoUpdateVersion;

  while (callbacks.length > 0)
    callbacks.shift()(autoUpdateVersion);
});
