var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
const SIMPLE_WAREHOUSE = { v1: { recommended: true } };

selftest.define("create", function () {
  // We need a warehouse so the tool doesn't think we are running from checkout
  var s = new Sandbox({ warehouse: SIMPLE_WAREHOUSE });

  // Can we create an app? Yes!
  var run = s.run("create", "foobar");
  run.waitSecs(60);
  run.match("Created a new Meteor app in 'foobar'.");
  run.match("To run your new app");
  run.expectExit(0);

  // Test that the release constraints have been written to .meteor/packages
  s.cd("foobar");
  const packages = s.read(".meteor/packages");
  if (!packages.match('meteor-base@')) {
    selftest.fail("Failed to add a version specifier to `meteor-base` package");
  }

  // Now, can we run it?
  run = s.run();
  run.waitSecs(15);
  run.match("foobar");
  run.match("proxy.");
  // Do not print out the changes to the versions file!
  run.read("\n=>");
  run.match("MongoDB");
  run.waitSecs(5);
  run.match("your app");
  run.waitSecs(5);
  run.match("running at");
  run.match("localhost");
  run.stop();

  run = s.run("create", "--list");
  run.waitSecs(5);
  run.read('Available');
  run.match('leaderboard');
  run.expectExit(0);
  // XXX test that --list always gives you the examples of the current
  // release!

  // XXX XXX more more
});
