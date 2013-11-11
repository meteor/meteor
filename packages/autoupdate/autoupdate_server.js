var crypto = Npm.require('crypto');

AutoUpdate = {};


// The client hash includes __meteor_runtime_config__, so wait until
// all packages have loaded and have had a chance to populate the
// runtime config before using the client hash as our default auto
// update version id.

AutoUpdate.autoUpdateVersion = null;

Meteor.startup(function () {
  AutoUpdate.autoUpdateVersion =
    process.env.AUTOUPDATE_VERSION ||
    process.env.SERVER_ID ||
    WebApp.clientHash;

  // also make the autoUpdateVersion available on the client.
  __meteor_runtime_config__.autoUpdateVersion = AutoUpdate.autoUpdateVersion;
});


Meteor.publish(
  "meteor_autoupdate_clientVersions",
  function () {
    var self = this;
    // Using `autoUpdateVersion` here is safe because we can't get a
    // subscription before webapp starts listening, and it doesn't do
    // that until the startup hooks have run.
    self.added(
      "meteor_autoupdate_clientVersions",
      AutoUpdate.autoUpdateVersion,
      {current: true}
    );
    self.ready();
  },
  {is_auto: true}
);
