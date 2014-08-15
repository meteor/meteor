var autoupdateVersionCordova = __meteor_runtime_config__.autoupdateVersionCordova || "unknown";

// The collection of acceptable client versions.
ClientVersions = new Meteor.Collection("meteor_autoupdate_clientVersions");

Autoupdate = {};

Autoupdate.newClientAvailable = function () {
  return !! ClientVersions.findOne({
    _id: 'version-cordova',
    version: {$ne: autoupdateVersionCordova}
  });
};

var onNewVersion = function (handle) {
  var ft = new FileTransfer();
  var urlPrefix = Meteor.absoluteUrl() + 'cordova';
  var localPathPrefix = cordova.file.applicationStorageDirectory;
  var iOS = /(iPad|iPhone|iPod)/g.test(navigator.userAgent);

  // on iOS 'Documents' is read-write, unlinke the storage dir
  if (iOS)
    localPathPrefix += 'Documents/';


  HTTP.get(urlPrefix + '/manifest.json', function (err, res) {
    if (err || ! res.data) {
      console.log('failed to download the manifest ' + (err && err.message) + ' ' + (res && res.content));
      return;
    }
    var ft = new FileTransfer();
    var downloads = 0;
    _.each(res.data.manifest, function (item) {
      if (! item.url) return;
      var uri = encodeURI(urlPrefix + item.url);
      downloads++;
      ft.download(uri, localPathPrefix + item.url, function (entry) {
        downloads--;

        if (! downloads) {
          // success! downloaded all sources
          // save the manifest
          uri = encodeURI(urlPrefix + '/manifest.json');
          ft.download(uri, localPathPrefix + '/manifest.json', function () {
            handle.stop();
            Package.reload.Reload._reload();
          });
        }
      }, function (error) {
        console.log('fail source: ', error.source);
        console.log('fail target: ', error.target);
      });
    });
  });
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
        // Just retry making the subscription, don't reload the whole
        // page. While reloading would catch more cases (for example,
        // the server went back a version and is now doing old-style hot
        // code push), it would also be more prone to reload loops,
        // which look really bad to the user. Just retrying the
        // subscription over DDP means it is at least possible to fix by
        // updating the server.
        Autoupdate._retrySubscription();
      });
    },
    onReady: function () {
      if (Package.reload) {
        var checkNewVersionDocument = function (id, fields) {
          var self = this;
          if (fields.version !== autoupdateVersionCordova && handle) {
            onNewVersion(handle);
          }
        };

        var handle = ClientVersions.find({
          _id: 'version-cordova'
        }).observeChanges({
          added: checkNewVersionDocument,
          changed: checkNewVersionDocument
        });
      }
    }
  });
};

Meteor.startup(Autoupdate._retrySubscription);

