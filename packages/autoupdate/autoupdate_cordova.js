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

var writeManifestToDisk = function (manifest, urlPrefix) {
  var ft = new FileTransfer();
  // XXX refactor to use _.after
  var downloads = 0;
  _.each(manifest, function (item) {
    if (! item.url) return;
    var uri = encodeURI(urlPrefix + item.url);
    downloads++;
    ft.download(uri, "cdvfile://localhost/persistent/" + item.url, function (entry) {
      downloads--;

      if (! downloads) {
        // success! downloaded all sources
        Package.reload.Reload._reload();
      }
    }, function (error) {
      console.log('fail source: ', error.source);
      console.log('fail target: ', error.target);
    });
  });
};

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
            console.log("FOUND A NEW VERSION!2");
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

        var onNewVersion = function () {
          if (handle) {
            handle.stop();
          }

          var urlPrefix = Meteor.absoluteUrl() + 'cordova';
          HTTP.get(urlPrefix + '/manifest.json', function (err, res) {
            try {
              // We also want to save the manifest. For simplicity,
              // just download it again with the same process.
              res.data.push({
                url: '/manifest.json'
              });
              writeManifestToDisk(res.data, urlPrefix);
            } catch (err) { console.log("failedFT", err.message); }
          });
        };
      }
    }
  });
};
Autoupdate._retrySubscription();

