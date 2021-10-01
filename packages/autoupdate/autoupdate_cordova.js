import { ClientVersions } from "./client_versions.js";

var autoupdateVersionsCordova =
  __meteor_runtime_config__.autoupdate.versions["web.cordova"] || {
    version: "unknown"
  };

export const Autoupdate = {};

// Stores acceptable client versions.
const clientVersions = new ClientVersions();

Meteor.connection.registerStore(
  "meteor_autoupdate_clientVersions",
  clientVersions.createStore()
);

Autoupdate.newClientAvailable = function () {
  return clientVersions.newClientAvailable(
    "web.cordova",
    ["version"],
    autoupdateVersionsCordova
  );
};

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

let failures = 0;

Autoupdate._retrySubscription = () => {
  const { appId } = __meteor_runtime_config__;

  Meteor.subscribe("meteor_autoupdate_clientVersions", appId, {
    onError(error) {
      console.log("autoupdate subscription failed:", error);
      failures++;
      retry.retryLater(failures, function() {
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

    onReady() {
      if (Package.reload) {
        function checkNewVersionDocument(doc) {
          if (doc.version !== autoupdateVersionsCordova.version) {
            newVersionAvailable();
          }
        }

        clientVersions.watch(checkNewVersionDocument, {
          filter: "web.cordova"
        });
      }
    }
  });
};

Meteor.startup(() => {
  WebAppLocalServer.onNewVersionReady(() => {
    if (Package.reload) {
      Package.reload.Reload._reload();
    }
  });

  Autoupdate._retrySubscription();
});

function newVersionAvailable() {
  WebAppLocalServer.checkForUpdates();
}
