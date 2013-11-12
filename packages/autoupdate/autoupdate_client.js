// Subscribe to the `meteor_autoupdate_clientVersions` collection,
// which contains the set of acceptable client versions.
//
// A "hard code push" occurs when the current client version is not in
// the set of acceptable client versions (or the server updates the
// collection, and the current client version is no longer in the
// set).
//
// When the `reload` package is loaded, a hard code push causes
// the browser to reload, so that it will load the latest client
// version from the server.
//
// A "soft code push" represents the situation when the current client
// version is in the set of acceptable versions, but there is a newer
// version available on the server.
//
// `AutoUpdate.newClientAvailable` is a reactive data source which
// becomes `true` if there is a new version of the client is available on
// the server.
//
// This package doesn't implement a soft code reload process itself,
// but `newClientAvailable` could be used for example to display a
// "click to reload" link to the user.

// The client version of the client code currently running in the
// browser.
var autoUpdateVersion = __meteor_runtime_config__.autoUpdateVersion;


// The collection of acceptable client versions.
var ClientVersions = new Meteor.Collection("meteor_autoupdate_clientVersions");


AutoUpdate = {};

AutoUpdate.newClientAvailable = function () {
  return !! ClientVersions.findOne(
    {$and: [
      {current: true},
      {_id: {$ne: autoUpdateVersion}}
    ]}
  );
};


Meteor.subscribe("meteor_autoupdate_clientVersions", {
  onError: function (error) {
    Meteor._debug("autoupdate subscription failed:", error);
  },
  onReady: function () {
    if (Package.reload) {
      Meteor.autorun(function (computation) {
        if (ClientVersions.findOne({current: true}) &&
            (! ClientVersions.findOne({_id: autoUpdateVersion}))) {
          computation.stop();
          Package.reload.Reload._reload();
        }
      });
    }
  }
});
