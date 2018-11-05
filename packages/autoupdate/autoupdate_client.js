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

import { AutoUpdateBase } from "./autoupdate_client_base";

const clientArch = Meteor.isCordova ? "web.cordova" :
  Meteor.isModern ? "web.browser" : "web.browser.legacy";

const autoupdateVersions =
  ((__meteor_runtime_config__.autoupdate || {}).versions || {})[clientArch] || {
    version: "unknown",
    versionRefreshable: "unknown",
    versionNonRefreshable: "unknown",
    assets: [],
  };

// Set to true if the link.onload callback ever fires for any <link> node.
let knownToSupportCssOnLoad = false;

class AutoUpdateClient extends AutoUpdateBase {
  newClientAvailable = () => {
    return this._clientVersions.newClientAvailable(
      clientArch,
      ["versionRefreshable", "versionNonRefreshable"],
      autoupdateVersions
    );
  };

  _onReady = () => {
    // Call checkNewVersionDocument with a slight delay, so that the
    // const handle declaration is guaranteed to be initialized, even if
    // the added or changed callbacks are called synchronously.
    const resolved = Promise.resolve();
    function check(doc) {
      resolved.then(() => checkNewVersionDocument(doc));
    }

    const stop = this._clientVersions.watch(check);

    const checkNewVersionDocument = (doc) => {
      if (doc._id !== clientArch) {
        return;
      }

      if (doc.versionNonRefreshable !==
        autoupdateVersions.versionNonRefreshable) {
        // Non-refreshable assets have changed, so we have to reload the
        // whole page rather than just replacing <link> tags.
        if (stop) stop();
        this._setStatus('outdated');
        if (Package.reload) {
          // The reload package should be provided by ddp-client, which
          // is provided by the ddp package that autoupdate depends on.
          Package.reload.Reload._reload();
        }
        return;
      }

      if (doc.versionRefreshable !== autoupdateVersions.versionRefreshable) {
        autoupdateVersions.versionRefreshable = doc.versionRefreshable;

        // Switch out old css links for the new css links. Inspired by:
        // https://github.com/guard/guard-livereload/blob/master/js/livereload.js#L710
        var newCss = doc.assets || [];
        var oldLinks = [];

        Array.prototype.forEach.call(
          document.getElementsByTagName('link'),
          function (link) {
            if (link.className === '__meteor-css__') {
              oldLinks.push(link);
            }
          }
        );

        function waitUntilCssLoads(link, callback) {
          var called;

          link.onload = function () {
            knownToSupportCssOnLoad = true;
            if (! called) {
              called = true;
              callback();
            }
          };

          if (! knownToSupportCssOnLoad) {
            var id = Meteor.setInterval(function () {
              if (link.sheet) {
                if (! called) {
                  called = true;
                  callback();
                }
                Meteor.clearInterval(id);
              }
            }, 50);
          }
        }

        let newLinksLeftToLoad = newCss.length;
        function removeOldLinks() {
          if (oldLinks.length > 0 &&
            --newLinksLeftToLoad < 1) {
            oldLinks.splice(0).forEach(link => {
              link.parentNode.removeChild(link);
            });
          }
        }

        if (newCss.length > 0) {
          newCss.forEach(css => {
            const newLink = document.createElement("link");
            newLink.setAttribute("rel", "stylesheet");
            newLink.setAttribute("type", "text/css");
            newLink.setAttribute("class", "__meteor-css__");
            newLink.setAttribute("href", css.url);

            waitUntilCssLoads(newLink, function () {
              Meteor.setTimeout(removeOldLinks, 200);
            });

            const head = document.getElementsByTagName("head").item(0);
            head.appendChild(newLink);
          });
        } else {
          removeOldLinks();
        }
      }
      this._setStatus('uptodate');
    };
  };
}

export const Autoupdate = new AutoUpdateClient();

Autoupdate._retrySubscription();
