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

var retry = new Retry({
  minCount: 0, // don't do any immediate retries
  baseTimeout: 30*1000 // start with 30s
});
var failures = 0;

Autoupdate._retrySubscription = function () {
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
            if (fields.refreshable && id !== autoupdateVersionRefreshable) {
              autoupdateVersionRefreshable = id;
              onNewVersion();
            } else if (! fields.refreshable && id !== autoupdateVersion) {
              autoupdateVersion = id;
              onNewVersion();
            }
          }
        });

        function onNewVersion () {
          if (handle) {
            handle.stop();
          }

          console.log("getting a new version");
          var urlPrefix = Meteor.absoluteUrl() + 'cordova';
          HTTP.get(urlPrefix + '/manifest.json', function (err, res) {
            console.log("FETCHED JSON", JSON.stringify(res.data));
            try {
            var ft = new FileTransfer();
            _.each(res.data, function (item) {
              var uri = encodeURI(urlPrefix + item.url);
              ft.download(uri, "cdvfile://localhost/persistent/" + item.url, function (entry) {
                console.log('success: ', entry);
              }, function (error) {
                console.log('fail source: ', error.source);
                console.log('fail target: ', error.target);
              });
            });
            } catch (err) { console.log("failedFT", err.message); }
            console.log("Finished fetching");
            //Package.reload.Reload._reload();
          });
        }
      }
    }
  });
};
Autoupdate._retrySubscription();

