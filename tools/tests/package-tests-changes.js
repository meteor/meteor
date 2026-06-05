var selftest = require("../tool-testing/selftest.js");
var Sandbox = selftest.Sandbox;
var utils = require("../utils/utils.js");

// Add packages to an app. Change the contents of the packages and their
// dependencies, make sure that the app still refreshes.
selftest.define("change packages during hot code push", [], async function () {
  var s = new Sandbox();
  await s.init();
  var run;

  // Starting a run
  await s.createApp("myapp", "package-tests");
  s.cd("myapp");
  run = s.run();
  run.waitSecs(5);
  await run.match("myapp");
  await run.match("proxy");
  run.waitSecs(5);
  await run.match("your app");
  run.waitSecs(5);
  await run.match("running at");
  await run.match("localhost");
  // Add the local package 'say-something'. It should print a message.
  s.write(".meteor/packages", "meteor-base \n say-something");
  run.waitSecs(3);
  await run.match("initial");

  // Modify the local package 'say-something'.
  s.cd("packages/say-something", function () {
    s.write("foo.js", 'console.log("another");');
  });
  run.waitSecs(12);
  await run.match("another");

  // Add a local package depends-on-plugin.
  s.write(".meteor/packages", "meteor-base \n depends-on-plugin");
  run.waitSecs(2);
  await run.match("foobar");

  // Change something in the plugin.
  s.cd("packages/contains-plugin/plugin", function () {
    s.write("plugin.js", 'console.log("edit");');
  });
  run.waitSecs(2);
  await run.match("edit");
  await run.match("foobar!");

  // Check that we are watching the versions file, as well as the packages file.
  s.unlink(".meteor/versions");
  run.waitSecs(10);
  await run.match("restarted");

  // Switch back to say-something for a moment.
  s.write(".meteor/packages", "meteor-base \n say-something");
  run.waitSecs(3);
  await run.match("another");
  await run.stop();

  s.rename("packages/say-something", "packages/shout-something");
  s.write(".meteor/packages", "meteor-base \n shout-something");
  s.cd("packages/shout-something", function () {
    s.write("foo.js", 'console.log("louder");');
  });

  run = s.run();
  run.waitSecs(5);
  await run.match("myapp");
  await run.match("proxy");
  run.waitSecs(5);
  await run.match("louder"); // the package actually loaded

  // How about breaking and fixing a package.js?
  await s.cd("packages/shout-something", async function () {
    var packageJs = s.read("package.js");
    s.write("package.js", "]");
    run.waitSecs(3);
    await run.match("=> Errors prevented startup");
    await run.match("package.js:1: Unexpected token");
    await run.match("Waiting for file change");

    s.write("package.js", packageJs);
    run.waitSecs(3);
    await run.match("restarting");
    await run.match("restarted");
  });
  await run.stop();
});

selftest.define(
  "package skeleton creates correct versionsFrom",
  ["custom-warehouse"],
  async function () {
    var s = new Sandbox({ warehouse: { v1: { recommended: true } } });
    await s.init();

    var token = utils.randomToken();
    var fullPackageName = "test:" + token;
    var fsPackageName = token;

    var run = s.run("create", "--package", fullPackageName);
    run.waitSecs(15);
    await run.match(fullPackageName);
    await run.expectExit(0);

    s.cd(fsPackageName);
    var packageJs = s.read("package.js");
    if (!packageJs.match(/api.versionsFrom\('v1'\);/)) {
      selftest.fail(
        "package.js missing correct 'api.versionsFrom':\n" + packageJs
      );
    }
  }
);

selftest.define("circular dependency errors", async function () {
  var s = new Sandbox();
  await s.init();

  // meteor add refreshes, but we don't need anything from the official catalog
  // here.
  s.set("METEOR_OFFLINE_CATALOG", "t");
  var run;

  // This app contains some pairs of packages with circular dependencies The app
  // currently *uses* no packages, so it can be created successfully.
  await s.createApp("myapp", "circular-deps");
  s.cd("myapp");

  // Try to add one of a pair of circularly-depending packages. See an error.
  run = s.run("add", "first");
  await run.matchErr("error: circular dependency");
  await run.expectExit(1);

  // Note that the app still builds fine because 'first' didn't actually get
  // added.
  run = s.run("--prepare-app");
  await run.expectExit(0);

  // This pair has first-imply uses second-imply, second-imply implies
  // first-imply.
  run = s.run("add", "first-imply");
  await run.matchErr("error: circular dependency");
  await run.expectExit(1);

  // This pair has first-weak uses second-weak, second-weak uses first-weak
  // weakly.  Currently, it's possible to add a weak cycle to an app (ie, the
  // prepare-app step passes), but not to run the bundler. We don't want to
  // write a test that prevents us from making the weak cycle an error at
  // prepare-time, so let's skip straight to bundling.
  s.write(".meteor/packages", "first-weak");
  run = s.run("--once");
  await run.matchErr("error: circular dependency");
  await run.expectExit(254);

  // ... but we can add second-weak, which just doesn't pull in first-weak at
  // all.
  s.write(".meteor/packages", "second-weak");
  run = s.run("--once");
  await run.match(/first-weak.*removed from your project/);
  await run.expectExit(123); // the app immediately calls process.exit(123)

  // This pair has first-unordered uses second-unordered, second-unordered uses
  // first-unordered unorderedly.  This should work just fine: that's why
  // unordered exists!
  s.write(".meteor/packages", "first-unordered");
  run = s.run("--once");
  await run.match(/first-unordered.*added/);
  await run.match(/second-unordered.*added/);
  await run.match(/second-weak.*removed from your project/);
  await run.expectExit(123); // the app immediately calls process.exit(123)
});
