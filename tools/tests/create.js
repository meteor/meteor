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

  const packageJson = JSON.parse(s.read("package.json"));
  if (! packageJson.dependencies.hasOwnProperty("@babel/runtime")) {
    selftest.fail("New app package.json does not depend on @babel/runtime");
  }

  // Install basic packages like babel-runtime and meteor-node-stubs from
  // package.json.
  run = s.run("npm", "install");
  run.waitSecs(15);
  run.expectExit(0);

  // Now, can we run it?
  run = s.run();
  run.waitSecs(60);
  run.match("foobar");
  run.match("proxy.");
  // Do not print out the changes to the versions file!
  run.waitSecs(15);
  run.read("\n=>");
  run.waitSecs(5);
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

["bare",
 "minimal",
 "full",
].forEach(template => {
  selftest.define("create --" + template, function () {
    const s = new Sandbox;

    // Can we create an app? Yes!
    let run = s.run("create", "--" + template, template);
    run.waitSecs(60);
    run.match("Created a new Meteor app in '" + template + "'.");
    run.match("To run your new app");

    s.cd(template);
    run = s.run();
    run.waitSecs(60);
    run.match(template);
    run.match("proxy")
    run.waitSecs(60);
    run.match("your app");
    run.waitSecs(5);
    run.match("running at");
    run.match("localhost");

    run.stop();
  });
});
