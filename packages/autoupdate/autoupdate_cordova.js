import { AutoUpdateBase } from "./autoupdate_client_base";

var autoupdateVersionsCordova =
  __meteor_runtime_config__.autoupdate.versions["web.cordova"] || {
    version: "unknown"
  };

const {appId} = __meteor_runtime_config__;

class AutoUpdateCordovaClient extends AutoUpdateBase {
  newClientAvailable = () => {
    return this._clientVersions.newClientAvailable(
      "web.cordova",
      ["version"],
      autoupdateVersionsCordova
    );
  };

  _onReady = () => {
    if (Package.reload) {
      const checkNewVersionDocument = (doc) => {
        if (doc.version !== autoupdateVersionsCordova.version) {
          this._setStatus('loading');
          newVersionAvailable();
        } else {
          this._setStatus('uptodate');
        }
      };

      this._clientVersions.watch(checkNewVersionDocument, {
        filter: "web.cordova"
      });
    }
  };
}

Meteor.startup(() => {
  WebAppLocalServer.onNewVersionReady(() => {
    if (Package.reload) {
      Package.reload.Reload._reload();
    }
  });

  Autoupdate._retrySubscription();
});

function newVersionAvailable() {
  // Todo use WebAppLocalServer.checkForUpdates once it exposes an error callback
  cordova.exec(
    () => Autoupdate._setStatus('outdated'),
    () => {
      Meteor._debug("autoupdate download failed");
      Autoupdate._retryLater();
    },
    "WebAppLocalServer",
    "checkForUpdates",
    []);
}

export const Autoupdate = new AutoUpdateCordovaClient({appId});
