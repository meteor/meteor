var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;

var setManifest = function (sandbox, version, banner) {
  // These are the only keys in the update manifest that are actually
  // used by contemporary Meteor
  sandbox.set("METEOR_TEST_UPDATE_MANIFEST", JSON.stringify({
    releases: {
      stable: {
        version: version,
        banner: banner
      }
    }
  }));
};

selftest.define("autoupdate", ['checkout'], function () {
  var s = new Sandbox({
    warehouse: {
      v1: { tools: 'tools1' },
      v2: { tools: 'tools1', latest: true },
      v3: { tools: 'tools1' }
    }
  });
  var run;

  // These tests involve running an app, but only because we want to
  // exercise the autoupdater, not because we actually care if the app
  // manages to run. So stop mongo from starting so that it goes faster.
  s.set("MONGO_URL", "whatever");

  // If we are at the latest version of Meteor, we don't get any
  // messages about updating.
  s.createApp('myapp', 'standard-app');
  s.cd('myapp', function () {
    setManifest(s, "v2", "=> New hotness v2 being downloaded.\n");
    s.write('.meteor/release', 'v2');
    run = s.run("--port", "21000");
    run.waitSecs(5);
    run.match("running at");
    run.stop();
    run.forbidAll("download");
    run.forbidAll("update");
    run.forbidAll("hotness");

    // If we are not at the latest version of Meteor, at startup, we get
    // a prompt to update.
    s.write('.meteor/release', 'v1');
    run = s.run("--port", "22000");
    run.match("v2");
    run.match("meteor update");
    run.stop();

    // .. unless we explicitly forced this release. Then, no prompt.
    run = s.run("--release", "v3", "--port", "23000");
    run.waitSecs(5);
    run.match("running at");
    run.stop();
    run.forbidAll("download");
    run.forbidAll("update");

    // OK, now say there actually is a new version available. (Use a
    // version that we will fail to download, just so we have a chance
    // to see what it happens if we restart before the download
    // finishes)
    s.write('.meteor/release', 'v2');
    s.set('METEOR_TEST_FAIL_RELEASE_DOWNLOAD', 'offline');
    setManifest(s, "test-junk", "=> New hotness test-junk being downloaded.\n");
    run = s.run("--port", "24000");
    run.match("New hotness test-junk");
    run.stop();

    // But we only print the banner once.
    run = s.run("--port", "25000");
    run.match("Meteor test-junk is being downloaded");
    run.stop();
    run.forbidAll("hotness");

    // OK, now use a version that we already have, so that the update
    // will succeed (we don't currently have facilities for stubbing out
    // the release download itself, but that's OK -- the updater only
    // checks if our latest version is not equal to the one in the
    // manifest, not if we actually have the version in the manifest;
    // and the downloading code turns out to be a noop if we already
    // have that version).
    setManifest(s, "v3", "=> New hotness v3 being downloaded.\n");
    s.unset('METEOR_TEST_FAIL_RELEASE_DOWNLOAD');
    run = s.run("--port", "26000");
    run.match("New hotness v3"); // the banner, and then eventually..
    run.match("Meteor v3 is available");
    run.match("meteor update");
    run.stop();

    run = s.run("update");
    run.read("myapp: updated to Meteor v3.\n");
    run.expectEnd();
    run.expectExit(0);

    run = s.run("--version");
    run.read("Release v3\n");
    run.expectEnd();
    run.expectExit(0);

    run = s.run("update");
    run.match("already at Meteor v3, the latest release");
    run.expectExit(0);

    // Update the app back to an older version.
    run = s.run("update", "--release", "v2");
    run.read("myapp: updated to Meteor v2.\n");
    run.expectEnd();
    run.expectExit(0);

    run = s.run("--version");
    run.read("Release v2\n");
    run.expectEnd();
    run.expectExit(0);

    run = s.run("update", "--release", "v2");
    run.match("already at Meteor v2");
    run.forbidAll("the latest release");
    run.expectExit(0);
  });

  // The latest version has been updated globally too.
  run = s.run("--version");
  run.read("Release v3\n");
  run.expectEnd();
  run.expectExit(0);
});
