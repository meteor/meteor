var selftest = require('../selftest.js');
var utils = require('../test-utils.js');
var Sandbox = selftest.Sandbox;

var loggedInError = function(run) {
  run.waitSecs(AUTHTIMEOUT);
  run.matchErr("You must be logged in for that.");
  run.expectExit(1);
}

selftest.define("authorized", ['net', 'slow'], function () {
  var s = new Sandbox;
  var AUTHTIMEOUT = 5;

  // Deploy an app authorized to test.
  login(s, "test", "testtest");
  var appName = createAndDeployApp(s);
  logout(s);

  // You are not authorized if you are not logged in.
  var run = s.run("authorized", appName);
  run.waitSecs(AUTHTIMEOUT);
  run.matchErr("You must be logged in for that.");
  run.expectExit(1);

  run = s.run("authorized", appName, "--remove", "bob");
  run.waitSecs(AUTHTIMEOUT);
  run.matchErr("You must be logged in for that.");
  run.expectExit(1);

  run = s.run("authorized", appName, "--add", "bob");
  run.waitSecs(AUTHTIMEOUT);
  run.matchErr("You must be logged in for that.");
  run.expectExit(1);

  run = s.run("authorized", appName, "--list");
  run.waitSecs(AUTHTIMEOUT);
  run.matchErr("You must be logged in for that.");
  run.expectExit(1);

  // Now let us log in, but as the wrong user.
  login(s, "testtest", "testtest");

  run = s.run("authorized", appName, "--remove", "bob");
  run.waitSecs(AUTHTIMEOUT);
  run.matchErr("Couldn't change authorized users");
  run.expectExit(1);

  run = s.run("authorized", appName, "--add", "bob");
  run.waitSecs(AUTHTIMEOUT);
  run.matchErr("Couldn't change authorized users");
  run.expectExit(1);

  run = s.run("authorized", appName, "--list");
  run.waitSecs(AUTHTIMEOUT);
  run.matchErr("Couldn't get authorized users list");
  run.expectExit(1);

  // Yay, now let's log in as the right user.
  logout(s);
  login(s, "test", "testtest");

  run = s.run("authorized", appName, "--list");
  run.waitSecs(AUTHTIMEOUT);
  run.match("test");
  run.expectExit(0);

  run = s.run("authorized", appName, "--add", "test");
  run.waitSecs(AUTHTIMEOUT);
  run.matchErr("Couldn't change authorized users: test: already an authorized user");
  run.expectExit(1);

  // Adding a user
  var newUser = randomString(10);
  run = s.run("authorized", appName, "--add", newUser);
  run.waitSecs(AUTHTIMEOUT);
  run.matchErr("Couldn't change authorized users: Unknown user");
  run.expectExit(1);

  run = s.run("authorized", appName, "--add", "testtest");
  run.waitSecs(AUTHTIMEOUT);
  run.match(": added testtest");
  run.expectExit(0);

  run = s.run("authorized", appName, "--list");
  run.waitSecs(AUTHTIMEOUT);
  run.match("test\ntesttest");
  run.expectExit(0);

  // Removing a user
  run = s.run("authorized", appName, "--remove", newUser);
  run.waitSecs(AUTHTIMEOUT);
  run.matchErr("Couldn't change authorized users: Unknown user");
  run.expectExit(1);

  run = s.run("authorized", appName, "--remove", "test");
  run.waitSecs(AUTHTIMEOUT);
  run.matchErr("Couldn't change authorized users: Can't remove yourself");
  run.expectExit(1);

  run = s.run("authorized", appName, "--remove", "testtest");
  run.waitSecs(AUTHTIMEOUT);
  run.match(": removed testtest");
  run.expectExit(0);

  run = s.run("authorized", appName, "--list");
  run.waitSecs(AUTHTIMEOUT);
  run.match("test\n");
  run.expectExit(0);

  run = s.run("authorized", appName, "--remove", "testtest");
  run.waitSecs(AUTHTIMEOUT);
  run.matchErr("Couldn't change authorized users: testtest: not an authorized user");
  run.expectExit(1);

  cleanUpApp(s, appName);
})
