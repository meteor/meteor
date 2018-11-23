// Publish the current client versions for each client architecture
// (web.browser, web.browser.legacy, web.cordova). When a client observes
// a change in the versions associated with its client architecture,
// it will refresh itself, either by swapping out CSS assets or by
// reloading the page.
//
// There are three versions for any given client architecture: `version`,
// `versionRefreshable`, and `versionNonRefreshable`. The refreshable
// version is a hash of just the client resources that are refreshable,
// such as CSS, while the non-refreshable version is a hash of the rest of
// the client assets, excluding the refreshable ones: HTML, JS, and static
// files in the `public` directory. The `version` version is a combined
// hash of everything.
//
// If the environment variable `AUTOUPDATE_VERSION` is set, it will be
// used in place of all client versions. You can use this variable to
// control when the client reloads. For example, if you want to force a
// reload only after major changes, use a custom AUTOUPDATE_VERSION and
// change it only when something worth pushing to clients happens.
//
// The server publishes a `meteor_autoupdate_clientVersions` collection.
// The ID of each document is the client architecture, and the fields of
// the document are the versions described above.

var Future = Npm.require("fibers/future");

export const Autoupdate = __meteor_runtime_config__.autoupdate = {
  // Map from client architectures (web.browser, web.browser.legacy,
  // web.cordova) to version fields { version, versionRefreshable,
  // versionNonRefreshable, refreshable } that will be stored in
  // ClientVersions documents (whose IDs are client architectures). This
  // data gets serialized into the boilerplate because it's stored in
  // __meteor_runtime_config__.autoupdate.versions.
  versions: {}
};

// The collection of acceptable client versions.
const ClientVersions =
  new Mongo.Collection("meteor_autoupdate_clientVersions", {
    connection: null
  });

// The client hash includes __meteor_runtime_config__, so wait until
// all packages have loaded and have had a chance to populate the
// runtime config before using the client hash as our default auto
// update version id.

// Note: Tests allow people to override Autoupdate.autoupdateVersion before
// startup.
Autoupdate.autoupdateVersion = null;
Autoupdate.autoupdateVersionRefreshable = null;
Autoupdate.autoupdateVersionCordova = null;
Autoupdate.appId = __meteor_runtime_config__.appId = process.env.APP_ID;

var syncQueue = new Meteor._SynchronousQueue();

function updateVersions(shouldReloadClientProgram) {
  // Step 1: load the current client program on the server
  if (shouldReloadClientProgram) {
    WebAppInternals.reloadClientPrograms();
  }

  const {
    // If the AUTOUPDATE_VERSION environment variable is defined, it takes
    // precedence, but Autoupdate.autoupdateVersion is still supported as
    // a fallback. In most cases neither of these values will be defined.
    AUTOUPDATE_VERSION = Autoupdate.autoupdateVersion
  } = process.env;

  // Step 2: update __meteor_runtime_config__.autoupdate.versions.
  const clientArchs = Object.keys(WebApp.clientPrograms);
  clientArchs.forEach(arch => {
    Autoupdate.versions[arch] = {
      version: AUTOUPDATE_VERSION ||
        WebApp.calculateClientHash(arch),
      versionRefreshable: AUTOUPDATE_VERSION ||
        WebApp.calculateClientHashRefreshable(arch),
      versionNonRefreshable: AUTOUPDATE_VERSION ||
        WebApp.calculateClientHashNonRefreshable(arch),
    };
  });

  // Step 3: form the new client boilerplate which contains the updated
  // assets and __meteor_runtime_config__.
  if (shouldReloadClientProgram) {
    WebAppInternals.generateBoilerplate();
  }

  // Step 4: update the ClientVersions collection.
  // We use `onListening` here because we need to use
  // `WebApp.getRefreshableAssets`, which is only set after
  // `WebApp.generateBoilerplate` is called by `main` in webapp.
  WebApp.onListening(() => {
    clientArchs.forEach(arch => {
      const payload = {
        ...Autoupdate.versions[arch],
        assets: WebApp.getRefreshableAssets(arch),
      };
      if (! ClientVersions.findOne({ _id: arch })) {
        ClientVersions.insert({ _id: arch, ...payload });
      } else {
        ClientVersions.update(arch, { $set: payload });
      }
    });
  });
}

Meteor.publish(
  "meteor_autoupdate_clientVersions",
  function (appId) {
    // `null` happens when a client doesn't have an appId and passes
    // `undefined` to `Meteor.subscribe`. `undefined` is translated to
    // `null` as JSON doesn't have `undefined.
    check(appId, Match.OneOf(String, undefined, null));

    // Don't notify clients using wrong appId such as mobile apps built with a
    // different server but pointing at the same local url
    if (Autoupdate.appId && appId && Autoupdate.appId !== appId)
      return [];

    return ClientVersions.find();
  },
  {is_auto: true}
);

Meteor.startup(function () {
  updateVersions(false);

  // Force any connected clients that are still looking for these older
  // document IDs to reload.
  ["version",
   "version-refreshable",
   "version-cordova",
  ].forEach(_id => {
    ClientVersions.upsert(_id, {
      $set: { version: "outdated" }
    });
  });
});

var fut = new Future();

// We only want 'refresh' to trigger 'updateVersions' AFTER onListen,
// so we add a queued task that waits for onListen before 'refresh' can queue
// tasks. Note that the `onListening` callbacks do not fire until after
// Meteor.startup, so there is no concern that the 'updateVersions' calls from
// 'refresh' will overlap with the `updateVersions` call from Meteor.startup.

syncQueue.queueTask(function () {
  fut.wait();
});

WebApp.onListening(function () {
  fut.return();
});

function enqueueVersionsRefresh() {
  syncQueue.queueTask(function () {
    updateVersions(true);
  });
}

// Listen for messages pertaining to the client-refresh topic.
import { onMessage } from "meteor/inter-process-messaging";
onMessage("client-refresh", enqueueVersionsRefresh);

// Another way to tell the process to refresh: send SIGHUP signal
process.on('SIGHUP', Meteor.bindEnvironment(function () {
  enqueueVersionsRefresh();
}, "handling SIGHUP signal for refresh"));
