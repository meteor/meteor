var selftest = require('../tool-testing/selftest.js');
var testUtils = require('../tool-testing/test-utils.js');
var Sandbox = selftest.Sandbox;

var commandTimeoutSecs = testUtils.accountsCommandTimeoutSecs;

// XXX tests for missing args for all commands

selftest.define("organizations - logged out", async function () {
  var s = new Sandbox;
  await s.init();

  var orgName = testUtils.randomOrgName();

  var run = s.run("admin", "members", orgName, "--add", "testtest");
  run.waitSecs(commandTimeoutSecs);
  await run.matchErr("You must be logged in");
  await run.matchErr("Username:");
  await run.stop();

  run = s.run("admin", "members", orgName, "--remove", "testtest");
  run.waitSecs(commandTimeoutSecs);
  await run.matchErr("You must be logged in");
  await run.matchErr("Username:");
  await run.stop();

  run = s.run("admin", "members", orgName);
  run.waitSecs(commandTimeoutSecs);
  await run.matchErr("You must be logged in");
  await run.matchErr("Username:");
  await run.stop();

  run = s.run("admin", "list-organizations");
  run.waitSecs(commandTimeoutSecs);
  await run.matchErr("You must be logged in");
  await run.matchErr("Username:");
  await run.stop();

});
