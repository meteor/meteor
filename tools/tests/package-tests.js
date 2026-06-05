var _ = require("underscore");

var selftest = require("../tool-testing/selftest.js");
var Sandbox = selftest.Sandbox;

// Given a sandbox, that has the app as its currend cwd, read the packages file
// and check that it contains exactly the packages specified, in order.
//
// sand: a sandbox, that has the main app directory as its cwd.
// packages: an array of packages in order. Packages can be of the form:
//
//    meteor-base (ie: name), in which case this will match any
//    version of that package as long as it is included.
//
//    awesome-pack@1.0.0 (ie: name@version) to match that name at that
//    version explicitly. This is for packages that we included at a specific
//    version.
var checkPackages = selftest.markStack(async function (sand, packages) {
  var lines = sand.read(".meteor/packages").split("\n");
  var i = 0;
  for (const line of lines) {
    if (!line) {
      return;
    }
    // If the specified package contains an @ sign, then it has a version
    // number, so we should match everything.
    if (packages[i].split("@").length > 1) {
      await selftest.expectEqual(line, packages[i]);
    } else {
      var pack = line.split("@")[0];
      await selftest.expectEqual(pack, packages[i]);
    }
    i++;
  }
  await selftest.expectEqual(packages.length, i);
});

// Given a sandbox, that has the app as its currend cwd, read the versions file
// and check that it contains the packages that we are looking for. We don't
// check the order, we just want to make sure that the right dependencies are
// in.
//
// sand: a sandbox, that has the main app directory as its cwd.
// packages: an array of packages in order. Packages can be of the form:
//
//    meteor-base (ie: name), in which case this will match any
//    version of that package as long as it is included. This is for packages
//    external to the app, since we don't want this test to fail when we push a
//    new version.
//
//    awesome-pack@1.0.0 (ie: name@version) to match that name at that
//    version explicitly. This is for packages that only exist for the purpose
//    of this test (for example, packages local to this app), so we know exactly
//    what version we expect.
var checkVersions = selftest.markStack(async function (sand, packages) {
  var lines = sand.read(".meteor/versions").split("\n");
  var depend = {};
  _.each(lines, function (line) {
    if (!line) {
      return;
    }
    // Packages are stored of the form foo@1.0.0, so this should give us an
    // array [foo, 1.0.0].
    var split = line.split("@");
    var pack = split[0];
    depend[pack] = split[1];
  });
  var i = 0;
  for (const pack of packages) {
    var split = pack.split("@");
    if (split.length > 1) {
      await selftest.expectEqual(depend[split[0]], split[1]);
    } else {
      var exists = _.has(depend, split[0]);
      await selftest.expectEqual(exists, true);
    }
    i++;
  }
  await selftest.expectEqual(packages.length, i);
});

selftest.define("add debugOnly and prodOnly packages", [], async function () {
  var s = new Sandbox();
  await s.init();
  var run;

  // Starting a run
  await s.createApp("myapp", "package-tests");
  s.cd("myapp");
  s.set("METEOR_OFFLINE_CATALOG", "t");

  // Add a debugOnly package. It should work during a normal run, but print
  // nothing in production mode.
  run = s.run("add", "debug-only");
  run.waitSecs(30);
  await run.match("debug-only");
  await run.expectExit(0);

  function onStartup(property) {
    s.mkdir("server");
    s.write(
      "server/exit-test.js",
      [
        "Meteor.startup(() => {",
        "  console.log('Meteor.isDevelopment', Meteor.isDevelopment);",
        "  console.log('Meteor.isProduction', Meteor.isProduction);",
        `  console.log('${property}', global.${property});`,
        `  process.exit(global.${property} ? 234 : 235);`,
        "});",
        "",
      ].join("\n")
    );
  }

  onStartup("DEBUG_ONLY_LOADED");

  run = s.run("--once");
  run.waitSecs(30);
  await run.expectExit(234);

  run = s.run("--once", "--production");
  run.waitSecs(30);
  await run.expectExit(235);

  // Add prod-only package, which sets GLOBAL.PROD_ONLY_LOADED.
  run = s.run("add", "prod-only");
  await run.match("prod-only");
  await run.expectExit(0);

  onStartup("PROD_ONLY_LOADED");

  run = s.run("--once");
  run.waitSecs(30);
  await run.expectExit(235);

  run = s.run("--once", "--production");
  run.waitSecs(30);
  await run.expectExit(234);
});

// Add packages through the command line. Make sure that the correct set of
// changes is reflected in .meteor/packages, .meteor/versions and list.
selftest.define("add packages to app", [], async function () {
  var s = new Sandbox();
  await s.init();

  var run;

  // Starting a run
  await s.createApp("myapp", "package-tests");
  s.cd("myapp");
  s.set("METEOR_OFFLINE_CATALOG", "t");

  // This has legit version syntax, but accounts-base started with 1.0.0 and is
  // unlikely to backtrack.
  run = s.run("add", "accounts-base@0.123.123");
  await run.matchErr("no such version");
  await run.expectExit(1);

  // Adding a nonexistent package at a nonexistent version should print
  // only one error message, not two. (We used to print "no such
  // package" and "no such version".)
  run = s.run("add", "not-a-real-package-and-never-will-be@1.0.0");
  await run.matchErr("no such package");
  await run.expectExit(1);
  run.forbidAll("no such version");

  run = s.run("add", "accounts-base");

  await run.match("accounts-base: A user account system");
  await run.expectExit(0);

  await checkPackages(s, ["meteor-base", "accounts-base"]);

  // Adding the nonexistent version now should still say "no such
  // version". Regression test for
  // https://github.com/meteor/meteor/issues/2898.
  run = s.run("add", "accounts-base@0.123.123");
  await run.matchErr("no such version");
  await run.expectExit(1);
  run.forbidAll("Currently using accounts-base");
  run.forbidAll("will be changed to");

  run = s.run("--once");

  run = s.run("add", "say-something@1.0.0");
  await run.match("say-something: print to console");
  await run.expectExit(0);

  await checkPackages(s, [
    "meteor-base",
    "accounts-base",
    "say-something@1.0.0",
  ]);

  run = s.run("add", "depends-on-plugin");
  await run.match(/depends-on-plugin.*added,/);
  await run.expectExit(0);

  await checkPackages(s, [
    "meteor-base",
    "accounts-base",
    "say-something@1.0.0",
    "depends-on-plugin",
  ]);

  await checkVersions(s, [
    "accounts-base",
    "depends-on-plugin",
    "say-something",
    "meteor-base",
    "contains-plugin@1.1.0",
  ]);

  run = s.run("remove", "say-something");
  await run.match("say-something: removed dependency");
  await checkVersions(s, [
    "accounts-base",
    "depends-on-plugin",
    "meteor-base",
    "contains-plugin",
  ]);

  run = s.run("remove", "depends-on-plugin");
  await run.match(/contains-plugin.*removed from your project/);
  await run.match(/depends-on-plugin.*removed from your project/);
  await run.match("depends-on-plugin: removed dependency");

  await checkVersions(s, ["accounts-base", "meteor-base"]);
  run = s.run("list");
  await run.match("accounts-base");
  await run.match("meteor-base");

  // Add a description-less package. Check that no weird things get
  // printed (like "added no-description: undefined").
  run = s.run("add", "no-description");
  await run.match("no-description\n");
  await run.expectEnd();
  await run.expectExit(0);
});

selftest.define(
  "add package with both debugOnly and prodOnly",
  [],
  async function () {
    var s = new Sandbox();
    await s.init();
    var run;

    // Add an app with a package with prodOnly and debugOnly set (an error)
    await s.createApp("myapp", "debug-only-test", { dontPrepareApp: true });
    s.cd("myapp");
    run = s.run("--prepare-app");
    run.waitSecs(20);
    await run.matchErr(
      "can't have more than one of: debugOnly, prodOnly, testOnly"
    );
    await run.expectExit(1);
  }
);

// Add a package that adds files to specific client architectures.
selftest.define("add packages client archs", async function (options) {
  var runTestWithArgs = async function (clientType, args, port) {
    var s = new Sandbox({
      clients: Object.assign(options.clients, { port: port }),
    });
    await s.init();

    // Starting a run
    await s.createApp("myapp", "package-tests");
    s.cd("myapp");
    s.set("METEOR_OFFLINE_CATALOG", "t");

    var outerRun = s.run("add", "say-something-client-targets");
    await outerRun.match(/say-something-client-targets.*added,/);
    await outerRun.expectExit(0);
    await checkPackages(s, ["meteor-base", "say-something-client-targets"]);

    await s.testWithAllClients(
      async function (run) {
        var expectedLogNum = 0;
        run.waitSecs(10);
        await run.match("myapp");
        await run.match("proxy");
        run.waitSecs(10);
        await run.match("running at");
        await run.match("localhost");

        run.connectClient();
        run.waitSecs(40);
        await run.match("all clients " + expectedLogNum++);
        await run.match(clientType + " client " + expectedLogNum++);
        await run.stop();
      },
      {
        args,
        testName: "add packages client archs",
        testFile: "package-tests.js",
      }
    );
  };

  await runTestWithArgs("browser", [], 3000);
});

selftest.define("add package with no builds", ["net"], async function () {
  var s = new Sandbox();
  await s.init();

  // This depends on glasser:binary-package-with-no-builds@1.0.0 existing with
  // no published builds.

  await s.createApp("myapp", "empty");
  s.cd("myapp");

  var run = s.run("add", "glasser:binary-package-with-no-builds");
  run.waitSecs(10);
  await run.matchErr("glasser:binary-package-with-no-builds@1.0.0");
  await run.matchErr("No compatible binary build found");
  await run.expectExit(1);
});
