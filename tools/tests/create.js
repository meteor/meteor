var selftest = require('../tool-testing/selftest.js');
const { AVAILABLE_SKELETONS } = require("../cli/commands");
var Sandbox = selftest.Sandbox;
const SIMPLE_WAREHOUSE = { v1: { recommended: true } };

selftest.define("create main", async function () {
  // We need a warehouse so the tool doesn't think we are running from checkout
  var s = new Sandbox({ warehouse: SIMPLE_WAREHOUSE });
  await s.init();

  // Can we create an app? Yes!
  var run = s.run("create", "foobar", "--blaze");
  await run.match("Created a new Meteor app in 'foobar'.");
  await run.match("To run your new app");
  await run.expectExit(0);

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
  await run.expectExit(0);

  // Now, can we run it?
  run = s.run();
  await run.match("foobar");
  await run.match("proxy.");
  // Do not print out the changes to the versions file!
  run.waitSecs(5);
  await run.read("=> Started MongoDB", false);
  run.waitSecs(30);
  await run.match("your app");
  await run.match("running at");
  await run.match("localhost");
  await run.stop();

  run = s.run("create", "--list");
  await run.read('Available');
  await run.match('react');
  await run.expectExit(0);
});

AVAILABLE_SKELETONS.forEach(template => {
  selftest.define("create --" + template, async function () {
    const s = new Sandbox;
    await s.init();

    // Can we create an app? Yes!
    let run = s.run("create", "--" + template, template);
    run.waitSecs(40);
    await run.match("Created a new Meteor app in '" + template + "'.");
    await run.match("To run your new app");

    s.cd(template);
    run = s.run();
    run.waitSecs(40);
    await run.match(template);
    await run.match("proxy")
    run.waitSecs(40);
    await run.match("your app");
    run.waitSecs(5);
    await run.match("running at");
    await run.match("localhost");

    await run.stop();
  });
});
