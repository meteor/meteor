var selftest = require('../selftest.js');
var testUtils = require('../test-utils.js');
var Sandbox = selftest.Sandbox;

var commandTimeoutSecs = 15;

var loggedInError = function(run) {
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("You must be logged in for that.");
  run.expectExit(1);
};

selftest.define("authorized", ['net', 'slow'], function () {
  var s = new Sandbox;

  // Deploy an app authorized to test.
  testUtils.login(s, "test", "testtest");
  var appName = testUtils.createAndDeployApp(s);
  testUtils.logout(s);

  // You are not authorized if you are not logged in.
  var run = s.run("authorized", appName);
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("You must be logged in for that.");
  run.expectExit(1);

  run = s.run("authorized", appName, "--remove", "bob");
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("You must be logged in for that.");
  run.expectExit(1);

  run = s.run("authorized", appName, "--add", "bob");
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("You must be logged in for that.");
  run.expectExit(1);

  run = s.run("authorized", appName, "--list");
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("You must be logged in for that.");
  run.expectExit(1);

  // Now let us log in, but as the wrong user.
  testUtils.login(s, "testtest", "testtest");

  run = s.run("authorized", appName, "--remove", "bob");
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("Couldn't change authorized users");
  run.expectExit(1);

  run = s.run("authorized", appName, "--add", "bob");
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("Couldn't change authorized users");
  run.expectExit(1);

  run = s.run("authorized", appName, "--list");
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("Couldn't get authorized users list");
  run.expectExit(1);

  // Yay, now let's log in as the right user.
  testUtils.logout(s);
  testUtils.login(s, "test", "testtest");

  run = s.run("authorized", appName, "--list");
  run.waitSecs(commandTimeoutSecs);
  run.match("test");
  run.expectExit(0);

  run = s.run("authorized", appName, "--add", "test");
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("Couldn't change authorized users: test: already an authorized user");
  run.expectExit(1);

  // Adding a user
  var newUser = testUtils.randomString(10);
  run = s.run("authorized", appName, "--add", newUser);
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("Couldn't change authorized users: Unknown user");
  run.expectExit(1);

  run = s.run("authorized", appName, "--add", "testtest");
  run.waitSecs(commandTimeoutSecs);
  run.match(": added testtest");
  run.expectExit(0);

  run = s.run("authorized", appName, "--list");
  run.waitSecs(commandTimeoutSecs);
  run.match("test\ntesttest");
  run.expectExit(0);

  // Removing a user
  run = s.run("authorized", appName, "--remove", newUser);
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("Couldn't change authorized users: Unknown user");
  run.expectExit(1);

  run = s.run("authorized", appName, "--remove", "test");
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("Couldn't change authorized users: Can't remove yourself");
  run.expectExit(1);

  run = s.run("authorized", appName, "--remove", "testtest");
  run.waitSecs(commandTimeoutSecs);
  run.match(": removed testtest");
  run.expectExit(0);

  run = s.run("authorized", appName, "--list");
  run.waitSecs(commandTimeoutSecs);
  run.match("test\n");
  run.expectExit(0);

  run = s.run("authorized", appName, "--remove", "testtest");
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("Couldn't change authorized users: testtest: not an authorized user");
  run.expectExit(1);

  testUtils.cleanUpApp(s, appName);
});
