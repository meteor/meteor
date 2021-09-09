var selftest = require('../tool-testing/selftest.js');
var testUtils = require('../tool-testing/test-utils.js');
var Sandbox = selftest.Sandbox;

var commandTimeoutSecs = testUtils.accountsCommandTimeoutSecs;

// XXX tests for missing args for all commands

selftest.define("organizations - logged out", function () {
  var s = new Sandbox;

  var orgName = testUtils.randomOrgName();

  var run = s.run("admin", "members", orgName, "--add", "testtest");
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("You must be logged in");
  run.matchErr("Username:");
  run.stop();

  run = s.run("admin", "members", orgName, "--remove", "testtest");
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("You must be logged in");
  run.matchErr("Username:");
  run.stop();

  run = s.run("admin", "members", orgName);
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("You must be logged in");
  run.matchErr("Username:");
  run.stop();

  run = s.run("admin", "list-organizations");
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("You must be logged in");
  run.matchErr("Username:");
  run.stop();

});
