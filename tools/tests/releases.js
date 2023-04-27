var selftest = require("../tool-testing/selftest.js");
var Sandbox = selftest.Sandbox;
var files = require("../fs/files");
var catalog = require("../packaging/catalog/catalog.js");

var DEFAULT_RELEASE_TRACK = catalog.DEFAULT_TRACK;

// XXX: Why is this an internet using test? Because our warehouse is a
// hackhackhack. If we clean up the hackhackhackhack, then this does not need
// the internets. (Or, to be more specific: our warehouse code tries to fetch
// the packages from the internet. If we could fool it into using local packages
// instead, or think that it alreayd has the packages, it would be ok). (This is
// because it calls 'create' from a warehouse, to be specific).
selftest.define(
  "springboard",
  ["checkout", "net", "custom-warehouse"],
  async function () {
    var s = new Sandbox({
      warehouse: {
        v1: {},
        v2: { recommended: true },
      },
    });
    await s.init();

    var run;

    // If run not in an app dir, runs the latest version ...
    run = s.run("--version");
    await run.read("Meteor v2\n");
    await run.expectEnd();
    await run.expectExit(0);

    // ... unless you asked for a different one.
    run = s.run("--version", "--release", DEFAULT_RELEASE_TRACK + "@v1");
    await run.read("Meteor v1\n");
    await run.expectEnd();
    await run.expectExit(0);

    // Apps are created with the latest release ...
    run = s.run("create", "myapp", "--blaze");
    run.waitSecs(5);

    await run.expectExit(0);
    await s.cd("myapp", async function () {
      run = s.run("--version");
      await run.read("Meteor v2\n");
      await run.expectExit(0);
    });

    // ... unless you asked for a different one.
    run = s
      .run(
        "create",
        "myapp2",
        "--blaze",
        "--release",
        DEFAULT_RELEASE_TRACK + "@v1"
      )
    run.waitSecs(5);
    await run.expectExit(0);
    await s.cd("myapp2", async function () {
      run = s.run("--version");
      await run.read("Meteor v1\n");
      await run.expectExit(0);
    });

    // Suppose you ask for a release that doesn't exist.
    s.set("METEOR_TEST_FAIL_RELEASE_DOWNLOAD", "not-found");
    run = s.run("--release", "weird");
    await run.readErr("Meteor weird: unknown release.\n");
    await run.expectEnd();
    await run.expectExit(1);

    // Suppose you're offline and you ask for a release you don't have
    // cached.
    // XXX On the refreshpolicy branch, we removed some of the support
    // code for this test. Make sure we get it to pass before merging.
    s.set("METEOR_TEST_FAIL_RELEASE_DOWNLOAD", "offline");
    run = s.run("--release", "weird");
    await run.matchErr("offline");
    await run.matchErr("weird: unknown release");
    await run.expectExit(1);

    // Project asking for nonexistent release.
    await s.cd("myapp2", async function () {
      s.write(".meteor/release", "strange");
      s.set("METEOR_TEST_FAIL_RELEASE_DOWNLOAD", "not-found");
      run = s.run();
      await run.matchErr("uses Meteor strange");

      await run.matchErr(/don't\s+have\s+it\s+either/);
      await run.expectExit(1);

      // You're offline and project asks for non-cached release.
      s.set("METEOR_TEST_FAIL_RELEASE_DOWNLOAD", "offline");
      run = s.run();
      await run.matchErr("offline");
      await run.matchErr(/it\s+uses\s+Meteor\s+strange/);
      await run.matchErr(/don't have that version/);
      await run.matchErr(/of Meteor installed/);
      await run.matchErr(/update servers/);
      await run.expectExit(1);

      // You create an app from a checkout, and then try to use it from an
      // install without setting a release on it.
      s.unset("METEOR_TEST_FAIL_RELEASE_DOWNLOAD");
      s.write(".meteor/release", "none");
      run = s.run("--requires-release");
      await run.matchErr("must specify");
      await run.matchErr("permanently set");
      await run.expectExit(1);

      // As previous, but you pass --release to manually pick a release.
      run = s.run("--version", "--release", "v1");
      await run.expectExit(0);
      run.forbidAll("must specify");
      run.forbidAll("permanently set");

      // You use modern Meteor with a super old release from the dark ages
      // before the .meteor/release file. You get an error.
      s.unlink(".meteor/release");
      run = s.run("--version");
      await run.matchErr("does not have a .meteor/release file");
      await run.matchErr("edit the .meteor/release file");
      await run.expectExit(1);

      // .meteor/release exists but is empty. You get an error.
      s.write(".meteor/release", "\n");
      run = s.run("--version");
      await run.matchErr("release file which is empty");
      await run.expectExit(1);

      // XXX Test springboard to pre-0.9.0 release
    });
  }
);

// XXX: Why is this an internet using test? Because our warehouse is a
// hackhackhack. If we clean up the hackhackhackhack, then this does not need
// the internets. (Or, to be more specific: our warehouse code tries to fetch
// the packages from the internet. If we could fool it into using local packages
// instead, or think that it already has the packages, it would be ok).
selftest.define(
  "writing versions file",
  ["checkout", "net", "custom-warehouse"],
  async function () {
    var s = new Sandbox({
      warehouse: {
        v1: { recommended: true },
        v2: { recommended: true },
      },
    });
    await s.init();
    var run;

    // Create an app with the latest release.
    run = s.run("create", "myapp", "--blaze");
    run.waitSecs(15);
    await run.expectExit(0);
    s.cd("myapp");
    run = s.run("--version");
    await run.read("Meteor v2\n");
    await run.expectExit(0);

    // Check the contents of the versions file.
    var versions = s.read(".meteor/versions");
    if (!versions) {
      selftest.fail("Versions file NOT written in new app.");
    }

    // Remove the versions file.
    s.unlink(".meteor/versions");

    // Run with --release, do not change versions file.
    run = s.run("list", "--release", "v1");
    await run.expectExit(0);
    versions = await s.read(".meteor/versions");
    if (versions) {
      selftest.fail("Versions file written with --release.");
    }

    // Update with --release.
    run = s.run("update", "--release", "v1");
    await run.expectExit(0);

    // version file should exist.
    versions = await s.read(".meteor/versions");
    if (!versions) {
      selftest.fail("Versions file NOT written after update");
    }
  }
);

selftest.define("checkout", ["checkout"], async function () {
  var s = new Sandbox();
  await s.init();

  var run;

  // Can't specify a release when running Meteor from a checkout
  run = s.run("--release", "v1");
  run.waitSecs(5);
  await run.matchErr("Can't specify");
  await run.expectExit(1);

  // You get a warning banner when the checkout overrides the release
  // that an app is pinned to
  await s.createApp("myapp", "standard-app");
  await s.cd("myapp", async function () {
    s.write(".meteor/release", "something");
    run = s.run("list");
    await run.readErr("=> Running Meteor from a checkout");
    await run.matchErr("project version");
    await run.matchErr("(Meteor something)\n");
    run.waitSecs(10);
    await run.expectExit(0);
  });
});

selftest.define(
  "download and springboard to pre-0.9.0 release",
  ["net", "slow", "custom-warehouse"],
  async function () {
    var s, run;

    if (files.inCheckout()) {
      s = new Sandbox({ warehouse: { v1: { tools: "tools1", latest: true } } });
    } else {
      s = new Sandbox();
    }
    await s.init();

    // End-to-end, online test of downloading and springboarding. This
    // release was built from the
    // 'release/release-used-to-test-springboarding' tag in GitHub. All
    // it does is print this string and exit.
    run = s.run("--release", "release-used-to-test-springboarding");
    run.waitSecs(1000);

    if (process.platform === "win32") {
      await run.matchErr("Meteor on Windows does not support");
    } else {
      await run.match(
        "THIS IS A FAKE RELEASE ONLY USED TO TEST ENGINE SPRINGBOARDING"
      );
    }

    await run.expectExit();
  }
);

selftest.define("unknown release", ["custom-warehouse"], async function () {
  var s = new Sandbox({
    warehouse: {
      v2: { recommended: true },
    },
  });
  await s.init();

  s.set("METEOR_OFFLINE_CATALOG", "t");
  var run;

  await s.createApp("myapp", "packageless", { dontPrepareApp: true });
  s.cd("myapp");
  run = s.run("--release", "bad");
  await run.matchErr("Meteor bad: unknown release");

  // METEOR in the release file.
  s.write(".meteor/release", DEFAULT_RELEASE_TRACK + "@0.9-bad");
  run = s.run();
  await run.matchErr(
    /This\s+project\s+says\s+that\s+it\s+uses\s+Meteor\s+0.9-bad,\s+but/
  );

  // No METEOR in the release file.
  s.write(".meteor/release", "0.9.x-bad");
  run = s.run();
  await run.matchErr(
    /This\s+project\s+says\s+that\s+it\s+uses\s+Meteor\s+0.9.x-bad,\s+but/
  );

  // Non-standard track
  s.write(".meteor/release", "FOO@bad");
  run = s.run();
  await run.matchErr(
    /This\s+project\s+says\s+that\s+it\s+uses\s+Meteor\s+release\s+FOO@bad,\s+but/
  );
});
