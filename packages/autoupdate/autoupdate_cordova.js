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
          var isRefreshable = id === 'version-refreshable';
          if (isRefreshable &&
              fields.version !== autoupdateVersionRefreshable) {
            var previousVersionRefreshable = autoupdateVersionRefreshable;
            autoupdateVersionRefreshable = fields.version;

            if (previousVersionRefreshable !== 'unknown') {
              onNewVersion();
            }
          }
          else if (! isRefreshable &&
                   fields.version !== autoupdateVersion && handle) {
            var previousVersion = autoupdateVersion;
            autoupdateVersion = fields.version;

            if (previousVersion !== 'unknown') {
              onNewVersion();
            }
          }
        };

        var handle = ClientVersions.find().observeChanges({
          added: checkNewVersionDocument,
          changed: checkNewVersionDocument
        });
      }
    }
  });
};

Meteor.startup(Autoupdate._retrySubscription);
