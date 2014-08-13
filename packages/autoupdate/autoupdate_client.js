// Subscribe to the `meteor_autoupdate_clientVersions` collection,
// which contains the set of acceptable client versions.
//
// A "hard code push" occurs when the running client version is not in
// the set of acceptable client versions (or the server updates the
// collection, there is a published client version marked `current` and
// the running client version is no longer in the set).
//
// When the `reload` package is loaded, a hard code push causes
// the browser to reload, so that it will load the latest client
// version from the server.
//
// A "soft code push" represents the situation when the running client
// version is in the set of acceptable versions, but there is a newer
// version available on the server.
//
// `Autoupdate.newClientAvailable` is a reactive data source which
// becomes `true` if there is a new version of the client is available on
// the server.
//
// This package doesn't implement a soft code reload process itself,
// but `newClientAvailable` could be used for example to display a
// "click to reload" link to the user.

// The client version of the client code currently running in the
// browser.
var autoupdateVersion = __meteor_runtime_config__.autoupdateVersion || "unknown";
var autoupdateVersionRefreshable =
  __meteor_runtime_config__.autoupdateVersionRefreshable || "unknown";

// The collection of acceptable client versions.
ClientVersions = new Meteor.Collection("meteor_autoupdate_clientVersions");

Autoupdate = {};

Autoupdate.newClientAvailable = function () {
  return !! ClientVersions.findOne({
               refreshable: false,
               version: {$ne: autoupdateVersion} }) ||
         !! ClientVersions.findOne({
               refreshable: true,
               version: {$ne: autoupdateVersionRefreshable} });
};

var knownToSupportCssOnLoad = false;

var retry = new Retry({
  // Unlike the stream reconnect use of Retry, which we want to be instant
  // in normal operation, this is a wacky failure. We don't want to retry
  // right away, we can start slowly.
  //
  // A better way than timeconstants here might be to use the knowledge
  // of when we reconnect to help trigger these retries. Typically, the
  // server fixing code will result in a restart and reconnect, but
  // potentially the subscription could have a transient error.
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
            autoupdateVersionRefreshable = fields.version;
            // Switch out old css links for the new css links. Inspired by:
            // https://github.com/guard/guard-livereload/blob/master/js/livereload.js#L710
            var newCss = fields.assets.allCss;
            var oldLinks = [];
            _.each(document.getElementsByTagName('link'), function (link) {
              if (link.className === '__meteor-css__') {
                oldLinks.push(link);
              }
            });

            var waitUntilCssLoads = function  (link, callback) {
              var executeCallback = _.once(callback);
              link.onload = function () {
                knownToSupportCssOnLoad = true;
                executeCallback();
              };
              if (! knownToSupportCssOnLoad) {
                var id = Meteor.setInterval(function () {
                  if (link.sheet) {
                    executeCallback();
                    Meteor.clearInterval(id);
                  }
                }, 50);
              }
            };

            var attachStylesheetLink = function (newLink) {
              var removeOldLinks = _.after(newCss.length, function () {
                _.each(oldLinks, function (oldLink) {
                  oldLink.parentNode.removeChild(oldLink);
                });
              });

              document.getElementsByTagName("head").item(0).appendChild(newLink);

              waitUntilCssLoads(newLink, function () {
                Meteor.setTimeout(removeOldLinks, 200);
              });
            };

            _.each(newCss, function (css) {
              var newLink = document.createElement("link");
              newLink.setAttribute("rel", "stylesheet");
              newLink.setAttribute("type", "text/css");
              newLink.setAttribute("class", "__meteor-css__");
              newLink.setAttribute("href", css.url);
              attachStylesheetLink(newLink);
            });
          }
          else if (! isRefreshable &&
                   fields.version !== autoupdateVersionRefreshable && handle) {
            handle.stop();
            Package.reload.Reload._reload();
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
Autoupdate._retrySubscription();