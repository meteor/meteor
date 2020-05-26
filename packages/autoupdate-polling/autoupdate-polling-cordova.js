import { ClientVersions } from "./client-versions.js";


const clientArch = Meteor.isCordova ? "web.cordova" :
  Meteor.isModern ? "web.browser" : "web.browser.legacy";

var autoupdateVersionsCordova =
  __meteor_runtime_config__.autoupdate.versions[clientArch] || {
    version: "unknown"
  };

export const AutoupdatePolling = {};

// Stores acceptable client versions.
const clientVersions = new ClientVersions();

AutoupdatePolling.newClientAvailable = function () {
  return clientVersions.newClientAvailable(
    clientArch,
    ["version"],
    autoupdateVersionsCordova
  );
};

let lastInterval;

AutoupdatePolling._pollingSubscribe = function pollingSubscribe(delay) {
  window.clearInterval(lastInterval);
  window.setInterval(function() {

    var xhr = new XMLHttpRequest();

    xhr.addEventListener("load", function (evt ) {
      const mostRecentVersion = JSON.parse(evt.target.response);
      clientVersions.set(clientArch, { ...mostRecentVersion });
    });

    // https://github.com/meteor/meteor/issues/11024
    // TODO grab IP from --mobile-server parameter instead of constant 10.0.2.2
    xhr.open("GET", `http://10.0.2.2:3000/meteor_autoupdate_polling_clientVersions?arch=${clientArch}`);
    xhr.send();

  }, delay);
};

if (!Meteor.isProduction || Meteor.settings.public.autoupdate_polling_time)
  AutoupdatePolling._pollingSubscribe(Meteor.settings.public.autoupdate_polling_time || 3000);

function checkNewVersionDocument(doc) {
  if (doc.version !== autoupdateVersionsCordova.version) {
    newVersionAvailable();
  }
}

clientVersions.watch(checkNewVersionDocument, {
  filter: clientArch
});

Meteor.startup(() => {
  WebAppLocalServer.onNewVersionReady(() => {
    if (Package.reload) {
      Package.reload.Reload._reload();
    }
  });
});

function newVersionAvailable() {
  WebAppLocalServer.checkForUpdates();
}
