var autoUpdateVersion = __meteor_runtime_config__.autoUpdateVersion;

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
