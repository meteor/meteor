var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;
var files = require('../files.js');
var catalog = require('../catalog.js');

var DEFAULT_RELEASE_TRACK = catalog.DEFAULT_TRACK;

// XXX: Why is this an internet using test? Because our warehouse is a
// hackhackhack. If we clean up the hackhackhackhack, then this does not need
// the internets. (Or, to be more specific: our warehouse code tries to fetch
// the packages from the internet. If we could fool it into using local packages
// instead, or think that it alreayd has the packages, it would be ok). (This is
// because it calls 'create' from a warehouse, to be specific).
selftest.define("springboard", ['checkout', 'net'], function () {
  var s = new Sandbox({
    warehouse: {
      v1: { },
      v2: { recommended: true }
    }
  });
  var run;

  // If run not in an app dir, runs the latest version ...
  run = s.run("--version");
  run.read('Meteor v2\n');
  run.expectEnd();
  run.expectExit(0);

  // ... unless you asked for a different one.
  run = s.run("--version", "--release", DEFAULT_RELEASE_TRACK + "@v1");
  run.read('Meteor v1\n');
  run.expectEnd();
  run.expectExit(0);

  // Apps are created with the latest release ...
  run = s.run("create", "myapp");
  run.waitSecs(5);
  run.expectExit(0);
  s.cd('myapp', function () {
    run = s.run("--version");
    run.read('Meteor v2\n');
    run.expectExit(0);
  });

  // ... unless you asked for a different one.
  run = s.run("create", "myapp2", "--release", DEFAULT_RELEASE_TRACK + "@v1").expectExit(0);
  s.cd('myapp2', function () {
    run = s.run("--version");
    run.read('Meteor v1\n');
    run.expectExit(0);
  });

  // Suppose you ask for a release that doesn't exist.
  s.set('METEOR_TEST_FAIL_RELEASE_DOWNLOAD', 'not-found');
  run = s.run("--release", "weird");
  run.readErr("Meteor weird: unknown release.\n");
  run.expectEnd();
  run.expectExit(1);

  // Suppose you're offline and you ask for a release you don't have
  // cached.
  // XXX On the refreshpolicy branch, we removed some of the support
  // code for this test. Make sure we get it to pass before merging.
  s.set('METEOR_TEST_FAIL_RELEASE_DOWNLOAD', 'offline');
  run = s.run("--release", "weird");
  run.matchErr("offline");
  run.matchErr("weird: unknown release");
  run.expectExit(1);

  // Project asking for nonexistent release.
  s.cd('myapp2', function () {
    s.write(".meteor/release", "strange");
    s.set('METEOR_TEST_FAIL_RELEASE_DOWNLOAD', 'not-found');
    run = s.run();
    run.matchErr("uses Meteor strange");

    run.matchErr(/don't\s+have\s+it\s+either/);
    run.expectExit(1);

    // You're offline and project asks for non-cached release.
    s.set('METEOR_TEST_FAIL_RELEASE_DOWNLOAD', 'offline');
    run = s.run();
    run.matchErr("offline");
    run.matchErr(/it\s+uses\s+Meteor\s+strange/);
    run.matchErr(/don't\s+have\s+that\s+version/);
    run.matchErr(/of\s+Meteor\s+installed/);
    run.matchErr(/update\s+servers/);
    run.expectExit(1);

    // You create an app from a checkout, and then try to use it from an
    // install without setting a release on it.
    s.unset('METEOR_TEST_FAIL_RELEASE_DOWNLOAD');
    s.write(".meteor/release", "none");
    run = s.run("--requires-release");
    run.matchErr("must specify");
    run.matchErr("permanently set");
    run.expectExit(1);

    // As previous, but you pass --release to manually pick a release.
    run = s.run("--version", "--release", "v1");
    run.expectExit(0);
    run.forbidAll("must specify");
    run.forbidAll("permanently set");

    // You use modern Meteor with a super old release from the dark ages
    // before the .meteor/release file. You get an error.
    s.unlink('.meteor/release');
    run = s.run("--version");
    run.matchErr("does not have a .meteor/release file");
    run.matchErr("edit the .meteor/release file");
    run.expectExit(1);

    // .meteor/release exists but is empty. You get an error.
    s.write(".meteor/release", "\n");
    run = s.run("--version");
    run.matchErr("release file which is empty");
    run.expectExit(1);

    // XXX Test springboard to pre-0.9.0 release
  });
});

// XXX: Why is this an internet using test? Because our warehouse is a
// hackhackhack. If we clean up the hackhackhackhack, then this does not need
// the internets. (Or, to be more specific: our warehouse code tries to fetch
// the packages from the internet. If we could fool it into using local packages
// instead, or think that it already has the packages, it would be ok).
selftest.define("writing versions file", ['checkout', 'net'], function () {
  var s = new Sandbox({
    warehouse: {
      v1: { recommended: true},
      v2: { recommended: true }
    }
  });
  var run;

  // Create an app with the latest release.
  run = s.run("create", "myapp");
  run.waitSecs(15);
  run.expectExit(0);
  s.cd('myapp');
  run = s.run("--version");
  run.read('Meteor v2\n');
  run.expectExit(0);

  // Check the contents of the versions file.
  var versions = s.read('.meteor/versions');
  if (!versions) {
    selftest.fail("Versions file NOT written in new app.");
  }

  // Remove the versions file.
  s.unlink('.meteor/versions');

  // Run with --release, do not change versions file.
  run = s.run("list", "--release", "v1");
  run.expectExit(0);
  versions = s.read('.meteor/versions');
  if (versions) {
    selftest.fail("Versions file written with --release.");
  }

  // Update with --release.
  run = s.run("update", "--release", "v1");
  run.expectExit(0);

  // version file should exist.
  versions = s.read('.meteor/versions');
  if (!versions) {
    selftest.fail("Versions file NOT written after update");
  }

});


selftest.define("checkout", ['checkout'], function () {
  var s = new Sandbox;
  var run;

  // Can't specify a release when running Meteor from a checkout
  run = s.run("--release", "v1");
  run.waitSecs(5);
  run.matchErr("Can't specify");
  run.expectExit(1);

  // You get a warning banner when the checkout overrides the release
  // that an app is pinned to
  s.createApp('myapp', 'standard-app');
  s.cd('myapp', function () {
    s.write(".meteor/release", "something");
    run = s.run("list");
    run.readErr("=> Running Meteor from a checkout");
    run.matchErr("project version");
    run.matchErr("(Meteor something)\n");
    run.expectExit(0);
  });
});


selftest.define("download and springboard to pre-0.9.0 release", ['net', 'slow'], function () {
  var s, run;

  if (files.inCheckout())
    s = new Sandbox({ warehouse: { v1: { tools: 'tools1', latest: true } } });
  else
    s = new Sandbox;

  // End-to-end, online test of downloading and springboarding. This
  // release was built from the
  // 'release/release-used-to-test-springboarding' tag in GitHub. All
  // it does is print this string and exit.
  run = s.run("--release", "release-used-to-test-springboarding");
  run.waitSecs(1000);

  if (process.platform === "win32") {
    run.matchErr("Meteor on Windows does not support");
  } else {
    run.match("THIS IS A FAKE RELEASE ONLY USED TO TEST ENGINE SPRINGBOARDING");
  }

  run.expectExit();
});


selftest.define("unknown release", [], function () {
  var s = new Sandbox({
    warehouse: {
      v2: { recommended: true }
    }
  });
 s.set("METEOR_OFFLINE_CATALOG", "t");
  var run;

  s.createApp('myapp', 'packageless', { dontPrepareApp: true });
  s.cd('myapp');
  run = s.run("--release", "bad");
  run.matchErr("Meteor bad: unknown release");

  // METEOR in the release file.
  s.write('.meteor/release', DEFAULT_RELEASE_TRACK + "@0.9-bad");
  run = s.run();
  run.matchErr(
    /This\s+project\s+says\s+that\s+it\s+uses\s+Meteor\s+0.9-bad,\s+but/);

  // No METEOR in the release file.
  s.write('.meteor/release', "0.9.x-bad");
  run = s.run();
  run.matchErr(
    /This\s+project\s+says\s+that\s+it\s+uses\s+Meteor\s+0.9.x-bad,\s+but/);

  // Non-standard track
  s.write('.meteor/release', "FOO@bad");
  run = s.run();
  run.matchErr(
    /This\s+project\s+says\s+that\s+it\s+uses\s+Meteor\s+release\s+FOO@bad,\s+but/);

});
