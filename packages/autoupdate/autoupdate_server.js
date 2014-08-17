// Publish the current client versions to the client.  When a client
// sees the subscription change and that there is a new version of the
// client available on the server, it can reload.
//
// By default there are two current client versions. The refreshable client
// version is identified by a hash of the client resources seen by the browser
// that are refreshable, such as CSS, while the non refreshable client version
// is identified by a hash of the rest of the client assets
// (the HTML, code, and static files in the `public` directory).
//
// If the environment variable `AUTOUPDATE_VERSION` is set it will be
// used as the client id instead.  You can use this to control when
// the client reloads.  For example, if you want to only force a
// reload on major changes, you can use a custom AUTOUPDATE_VERSION
// which you only change when something worth pushing to clients
// immediately happens.
//
// For backwards compatibility, SERVER_ID can be used instead of
// AUTOUPDATE_VERSION.
//
// The server publishes a `meteor_autoupdate_clientVersions`
// collection.  The contract of this collection is that each document
// in the collection represents an acceptable client version, with the
// `_id` field of the document set to the client id.
//
// An "unacceptable" client version, for example, might be a version
// of the client code which has a severe UI bug, or is incompatible
// with the server.  An "acceptable" client version could be one that
// is older than the latest client code available on the server but
// still works.
//
// One of the published documents in the collection will have its
// `current` field set to `true`.  This is the version of the client
// code that the browser will receive from the server if it reloads.
//
// In this implementation only two documents are present in the collection
// the current refreshable client version and the current nonRefreshable client
// version.  Developers can easily experiment with different versioning and
// updating models by forking this package.

Autoupdate = {};

// The collection of acceptable client versions.
ClientVersions = new Meteor.Collection("meteor_autoupdate_clientVersions",
  { connection: null });

// The client hash includes __meteor_runtime_config__, so wait until
// all packages have loaded and have had a chance to populate the
// runtime config before using the client hash as our default auto
// update version id.

Autoupdate.autoupdateVersion = null;
Autoupdate.autoupdateVersionRefreshable = null;

var syncQueue = new Meteor._SynchronousQueue();
var startupVersion = null;

// updateVersions can only be called after the server has fully loaded.
var updateVersions = function (shouldReloadClientProgram) {
  syncQueue.runTask(function () {
    // Step 1: load the current client program on the server and update the
    // hash values in __meteor_runtime_config__.
    if (shouldReloadClientProgram) {
      WebAppInternals.reloadClientProgram();
    }

    if (startupVersion === null) {
      Autoupdate.autoupdateVersion =
        __meteor_runtime_config__.autoupdateVersion =
          process.env.AUTOUPDATE_VERSION ||
          process.env.SERVER_ID || // XXX COMPAT 0.6.6
          WebApp.calculateClientHashNonRefreshable();
    }

    Autoupdate.autoupdateVersionRefreshable =
      __meteor_runtime_config__.autoupdateVersionRefreshable =
        process.env.AUTOUPDATE_VERSION ||
        process.env.SERVER_ID || // XXX COMPAT 0.6.6
        WebApp.calculateClientHashRefreshable();

    // Step 2: form the new client boilerplate which contains the updated
    // assets and __meteor_runtime_config__.
    if (shouldReloadClientProgram) {
      WebAppInternals.generateBoilerplate();
    }

    if (! ClientVersions.findOne({_id: "version"})) {
      ClientVersions.insert({
        _id: "version",
        version: Autoupdate.autoupdateVersion,
      });
    } else {
      ClientVersions.update("version", { $set: {
        version: Autoupdate.autoupdateVersion,
      }});
    }

    if (! ClientVersions.findOne({_id: "version-refreshable"})) {
      ClientVersions.insert({
        _id: "version-refreshable",
        version: Autoupdate.autoupdateVersionRefreshable,
        assets: WebAppInternals.refreshableAssets
      });
    } else {
      ClientVersions.update("version-refreshable", { $set: {
        version: Autoupdate.autoupdateVersionRefreshable,
        assets: WebAppInternals.refreshableAssets
      }});
    }
  });
};

Meteor.startup(function () {
  // Allow people to override Autoupdate.autoupdateVersion before startup.
  // Tests do this.
  startupVersion = Autoupdate.autoupdateVersion;
  updateVersions(false);
});

Meteor.publish(
  "meteor_autoupdate_clientVersions",
  function () {
    return ClientVersions.find();
  },
  {is_auto: true}
);

// Listen for SIGUSR2, which signals that a client asset has changed.
process.on('SIGUSR2', Meteor.bindEnvironment(function () {
  updateVersions(true);
}));
