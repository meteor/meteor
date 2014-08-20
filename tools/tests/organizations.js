var selftest = require('../selftest.js');
var testUtils = require('../test-utils.js');
var Sandbox = selftest.Sandbox;

var commandTimeoutSecs = testUtils.accountsCommandTimeoutSecs;

var randomOrgName = function () {
  return "selftestorg" + testUtils.randomString(10);
};

// XXX tests for missing args for all commands

selftest.define("organizations - logged out", function () {
  var s = new Sandbox;

  var orgName = randomOrgName();

  var run = s.run("admin", "create-organization", orgName);
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("You must be logged in");
  run.expectExit(1);

  run = s.run("admin", "add-member", "testtest", orgName);
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("You must be logged in");
  run.expectExit(1);

  run = s.run("admin", "remove-member", "testtest", orgName);
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("You must be logged in");
  run.expectExit(1);

  run = s.run("admin", "show-organization", orgName);
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("You must be logged in");
  run.expectExit(1);

  run = s.run("admin", "list-organizations");
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("You must be logged in");
  run.expectExit(1);

});

// For now, this test only runs from checkout with a universe file
// pointing to a testing meteor-accounts server (e.g. one deployed with
// Meteor.settings.testing = true). Otherwise, we won't be able to
// create organizations.
selftest.define("organizations", ["net", "slow", "checkout"], function () {
  var s = new Sandbox;

  testUtils.login(s, "test", "testtest");

  // Create an organization for the test.
  var orgName = randomOrgName();
  var run = s.run("admin", "create-organization", orgName);
  run.waitSecs(commandTimeoutSecs);
  run.expectExit();

  if (run.exitStatus.code) {
    selftest.fail(
      "Failed to create organization. This test can only be run from \n" +
        "checkout with a universe file pointing to a testing \n" +
        "meteor-accounts server.");
  }

  // Create an organization with the same name as an existing
  // organization; make sure it fails.
  run = s.run("admin", "create-organization", orgName);
  run.waitSecs(commandTimeoutSecs);
  // XXX This should really ready "organization name", not
  // "username". See XXX in "admin create-organization" commands.js.
  run.matchErr("Username already exists");
  run.expectExit(1);

  // Create an organization with an invalid name.
  run = s.run("admin", "create-organization", "invalid characters");
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("Organization names can contain");
  run.expectExit(1);

  // A reserved name.
  run = s.run("admin", "create-organization", "official");
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("Organization name already exists");
  run.expectExit(1);

  // Add a nonexistent user.
  run = s.run("admin", "add-member", orgName, testUtils.randomString(15));
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("user does not exist");
  run.expectExit(1);

  // Add a user to a nonexistent org.
  run = s.run("admin", "add-member", testUtils.randomString(15), "testtest");
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("Organization does not exist");
  run.expectExit(1);

  // Add a real user to a real org.
  run = s.run("admin", "add-member", orgName, "testtest");
  run.waitSecs(commandTimeoutSecs);
  run.match("testtest added to organization " + orgName);
  run.expectExit(0);

  // Try to show a nonexistent organization.
  run = s.run("admin", "show-organization", testUtils.randomString(15));
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("Organization does not exist");
  run.expectExit(1);

  // 'show-organization' should show the right members, and
  // 'list-organization' should show that 'test' is a member.
  run = s.run("admin", "show-organization", orgName);
  run.waitSecs(commandTimeoutSecs);
  run.read("test\ntesttest\n");
  run.expectExit(0);
  run = s.run("admin", "list-organizations");
  run.waitSecs(commandTimeoutSecs);
  run.match(orgName + "\n");
  run.expectExit(0);

  // Deploy an app and authorize our organization.
  var appName = testUtils.createAndDeployApp(s);
  run = s.run("authorized", appName, "--add", orgName);
  run.waitSecs(commandTimeoutSecs);
  run.expectExit(0);

  run = s.run("authorized", appName);
  run.waitSecs(commandTimeoutSecs);
  run.read("test\n" + orgName + "\n");
  run.expectExit(0);

  testUtils.logout(s);

  // Log in as testtest and see that we are authorized.
  testUtils.login(s, "testtest", "testtest");
  run = s.run("list-sites");
  run.waitSecs(commandTimeoutSecs);
  run.match(appName);
  run.expectExit(0);

  run = s.run("logs", appName);
  run.waitSecs(commandTimeoutSecs);
  run.expectExit(0);

  run = s.run("admin", "list-organizations");
  run.waitSecs(commandTimeoutSecs);
  run.match(orgName);
  run.expectExit(0);

  testUtils.logout(s);
  testUtils.login(s, "test", "testtest");

  // Remove testtest from the organization.
  run = s.run("admin", "remove-member", orgName, "testtest");
  run.waitSecs(commandTimeoutSecs);
  run.expectExit(0);

  run = s.run("admin", "show-organization", orgName);
  run.waitSecs(commandTimeoutSecs);
  run.forbidAll("testtest");
  run.expectExit(0);

  testUtils.logout(s);

  // Log in as testtest, see that we are no longer authorized.
  testUtils.login(s, "testtest", "testtest");
  run = s.run("list-sites");
  run.waitSecs(commandTimeoutSecs);
  run.forbidAll(appName);
  run.expectExit(0);

  run = s.run("logs", appName);
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("belongs to a different user");
  run.expectExit(1);

  run = s.run("admin", "list-organizations");
  run.waitSecs(commandTimeoutSecs);
  run.forbidAll(orgName);
  run.expectExit(0);

  run = s.run("admin", "show-organization", orgName);
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("not a member of this organization");
  run.expectExit(1);

  testUtils.logout(s);

  // Add testtest back to the org, and then de-authorize the org for our
  // app.
  testUtils.login(s, "test", "testtest");
  run = s.run("admin", "add-member", orgName, "testtest");
  run.waitSecs(commandTimeoutSecs);
  run.expectExit(0);

  run = s.run("authorized", appName, "--remove", orgName);
  run.waitSecs(commandTimeoutSecs);
  run.expectExit(0);

  run = s.run("authorized", appName);
  run.waitSecs(commandTimeoutSecs);
  run.forbidAll(appName);
  run.expectExit(0);

  // As testtest, check that we are not still authorized.
  testUtils.logout(s);
  testUtils.login(s, "testtest", "testtest");
  run = s.run("list-sites");
  run.waitSecs(commandTimeoutSecs);
  run.forbidAll(appName);
  run.expectExit(0);

  run = s.run("logs", appName);
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("belongs to a different user");
  run.expectExit(1);

  testUtils.logout(s);
});
