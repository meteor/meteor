var autoupdateVersion = __meteor_runtime_config__.autoupdateVersion || "unknown";
var autoupdateVersionRefreshable =
  __meteor_runtime_config__.autoupdateVersionRefreshable || "unknown";

// The collection of acceptable client versions.
ClientVersions = new Meteor.Collection("meteor_autoupdate_clientVersions");

Autoupdate = {};

Autoupdate.newClientAvailable = function () {
  return !! ClientVersions.findOne(
    {$and: [
      {current: true},
      {_id: {$ne: autoupdateVersion}}
    ]}
  );
};

var onNewVersion = function (handle) {
  var ft = new FileTransfer();
  var uri = encodeURI(Meteor.absoluteUrl() + 'cordova' +
                      '/__cordova_program__.html');

  ft.download(uri, 'cdvfile://localhost/persistent/__cordova_program__.html',
    function (entry) {
      // XXX doesn't preserve session -- use reload package
      location.reload();
    }, function (error) {
      console.log('fail source: ', error.source);
      console.log('fail target: ', error.target);
  });
};

var retry = new Retry({
  minCount: 0, // don't do any immediate retries
  baseTimeout: 30*1000 // start with 30s
});
var failures = 0;

Autoupdate._retrySubscription = function () {
  console.log("hear event");
  Meteor.subscribe("meteor_autoupdate_clientVersions", {
    onError: function (error) {
      Meteor._debug("autoupdate subscription failed:", error);
      failures++;
      retry.retryLater(failures, function () {
        Autoupdate._retrySubscription();
      });
    },
    onReady: function () {
      if (Package.reload) {
        var handle = ClientVersions.find().observeChanges({
          added: function (id, fields) {
            var self = this;
            console.log("NEW VERSION FOUND!", id, fields);

            // XXX fix for CSS changes
            // XXX maybe a race condition? We shouldn't start looking for
            // updates until we run meteor_cordova_loader.
            // if (fields.refreshable && id !== autoupdateVersionRefreshable) {
            //   autoupdateVersionRefreshable = id;
            //   onNewVersion(handle);
            // } else
            //
            if (! fields.refreshable && id !== autoupdateVersion) {
              console.log("Added new version", id);
              console.log("current version", autoupdateVersion);
              autoupdateVersion = id;
              onNewVersion(handle);
            }
          }
        });
      }
    }
  });
};

document.addEventListener("deviceready", function () {
  document.addEventListener("meteor-cordova-loaded",
    Autoupdate._retrySubscription, false);
});

