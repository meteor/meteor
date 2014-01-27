var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("springboard", ['checkout'], function () {
  var s = new Sandbox({
    warehouse: {
      v1: { tools: 'tools1', notices: ["kitten"] },
      v2: { tools: 'tools2', notices: ["puppies"], upgraders: ["cats"],
            latest: true }}
  });
  var run;

  // If run not in an app dir, runs the latest version ...
  run = s.run("--long-version");
  run.read('v2\ntools2\n');
  run.expectEnd();
  run.expectExit(0);

  // ... unless you asked for a different one.
  run = s.run("--long-version", "--release", "v1");
  run.read('v1\ntools1\n');
  run.expectEnd();
  run.expectExit(0);

  // Apps are created with the latest release ...
  run = s.run("create", "myapp").expectExit(0);
  s.cd('myapp');
  run = s.run("--long-version");
  run.read('v2\ntools2\n');
  run.expectExit(0);

  // ... unless you asked for a different one.
  s.cd('..');
  run = s.run("create", "myapp2", "--release", "v1").expectExit(0);
  s.cd('myapp2');
  run = s.run("--long-version");
  run.read('v1\ntools1\n');
  run.expectExit(0);

  // Suppose you ask for a release that doesn't exist.
  s.cd('..');
  s.set('METEOR_TEST_FAIL_RELEASE_DOWNLOAD', 'not-found');
  run = s.run("--release", "weird");
  run.readErr("weird: unknown release.\n");
  run.expectEnd();
  run.expectExit(1);

  // Suppose you're offline and you ask for a release you don't have
  // cached.
  s.set('METEOR_TEST_FAIL_RELEASE_DOWNLOAD', 'offline');
  run = s.run("--release", "weird");
  run.matchErr("Meteor weird");
  run.matchErr("online");
  run.expectExit(1);

  // Project asking for nonexistent release.
  s.cd('myapp2');
  s.write(".meteor/release", "strange");
  s.set('METEOR_TEST_FAIL_RELEASE_DOWNLOAD', 'not-found');
  run = s.run();
  run.matchErr("version strange of Meteor");
  run.matchErr("valid Meteor release");
  run.expectExit(1);

  // You're offline and project asks for non-cached release.
  s.set('METEOR_TEST_FAIL_RELEASE_DOWNLOAD', 'offline');
  run = s.run();
  run.matchErr("Meteor strange");
  run.matchErr("not installed");
  run.matchErr("online");
  run.expectExit(1);

  // You create an app from a checkout, and then try to use it from an
  // install without setting a release on it.
  s.unset('METEOR_TEST_FAIL_RELEASE_DOWNLOAD');
  s.write(".meteor/release", "none");
  run = s.run("list", "--using");
  run.matchErr("must specify");
  run.matchErr("permanently set");
  run.expectExit(1);

  // As previous, but you pass --release to manually pick a release.
  run = s.run("list", "--using", "--release", "v1");
  run.expectExit(0);
  run.forbidAll("must specify");
  run.forbidAll("permanently set");

  // You use modern Meteor with a super old release from the dark ages
  // before the .meteor/release file. You get the latest version.
  s.unlink('.meteor/release');
  run = s.run("--long-version");
  run.read('v2\ntools2\n');
  run.expectEnd();
  run.expectExit(0);
});


selftest.define("checkout", ['checkout'], function () {
  var s = new Sandbox;
  var run;

  // Can't specify a release when running Meteor from a checkout
  run = s.run("--release", "v1");
  run.matchErr("Can't specify");
  run.expectExit(1);

  // You get a warning banner when the checkout overrides the release
  // that an app is pinned to
  s.copyApp('myapp', 'empty');
  s.cd('myapp');
  s.write(".meteor/release", "something");
  run = s.run("list", "--using");
  run.readErr("=> Running Meteor from a checkout");
  run.matchErr("project version (something)\n\n");
  run.expectExit(0);
});

// XXX NEXT
// add METEOR_TEST_FAIL_RELEASE_DOWNLOAD=(offline|not-found)
// add METEOR_TEST_UPDATE_MANIFEST=(replacement manifest, for updater.getManifest) or offline
//
// => should be enough to test everything, since the updater only
// checks to see if the mentioned release is not our 'latest' release
// (not whether we have it!), and the actual downloading code in the
// update process is a noop if we already have the release.
