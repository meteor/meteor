var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;
var testUtils = require('../test-utils.js');

var commandTimeoutSecs = testUtils.accountsCommandTimeoutSecs;

selftest.define("login", ['net'], function () {
  var s = new Sandbox;

  var run = s.run("whoami");
  run.matchErr("Not logged in");
  run.expectExit(1);

  // Username and password prompts happen on stderr so that scripts can
  // run commands that do login interactively and still save the command
  // output with the login prompts appearing in it.
  //
  // Do this twice to confirm that the login command prints a prompt
  // even if you are already logged in.
  for (var i = 0; i < 2; i++) {
    run = s.run("login");
    run.matchErr("Username:");
    run.write("test\n");
    run.matchErr("Password:");
    run.write("testtest\n");
    run.waitSecs(commandTimeoutSecs);
    run.matchErr("Logged in as test.");
    run.expectExit(0);
  }

  // Leaving username blank, or getting the password wrong, doesn't
  // reprompt. It also doesn't log you out.
  run = s.run("login");
  run.matchErr("Username:");
  run.write("\n");
  run.matchErr("Password:");
  run.write("whatever\n");
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("failed");
  run.expectExit(1);

  run = s.run("login");
  run.matchErr("Username:");
  run.write("test\n");
  run.matchErr("Password:");
  run.write("whatever\n");
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("failed");
  run.expectExit(1);

  run = s.run('login');
  run.matchErr("Username:");
  run.write("test\n");
  run.matchErr("Password:");
  run.write("testtest\n");
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("Logged in as test.");
  run.expectExit(0);

  // XXX test login by email

  run = s.run("whoami");
  run.read("test\n");
  run.expectEnd();
  run.expectExit(0);

  run = s.run("logout");
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("Logged out");
  run.expectExit(0);

  run = s.run("logout");
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("Not logged in");
  run.expectExit(0);

  run = s.run("whoami");
  run.matchErr("Not logged in");
  run.expectExit(1);

  // Test login failure
  run = s.run("login");
  run.matchErr("Username:");
  run.write("test\n");
  run.matchErr("Password:");
  run.write("badpassword\n");
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("Login failed");
  run.expectExit(1);

  // Logging in with a capitalized username should work (usernames are
  // case-insensitive).
  run = s.run("login");
  run.matchErr("Username:");
  run.write("TeSt\n");
  run.matchErr("Password:");
  run.write("testtest\n");
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("Logged in as test.");
  run.expectExit(0);

  run = s.run("logout");
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("Logged out");
  run.expectExit(0);

  // Logging in with a capitalized password should NOT work (can't be
  // too safe...)
  run = s.run("login");
  run.matchErr("Username:");
  run.write("test\n");
  run.matchErr("Password:");
  run.write("TesTTesT\n");
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("Login failed");
  run.expectExit(1);
});

selftest.define('whoami - no username', ['net', 'slow'], function () {
  var s = new Sandbox;
  var email = testUtils.randomUserEmail();
  var username = testUtils.randomString(10);
  var appName = testUtils.randomAppName();
  var token = testUtils.deployWithNewEmail(s, email, appName);

  var run = s.run('whoami');
  run.waitSecs(commandTimeoutSecs);
  run.matchErr('You haven\'t chosen your username yet');
  run.matchErr(testUtils.registrationUrlRegexp);
  run.expectExit(1);
  testUtils.registerWithToken(token, username, 'test', email);

  run = s.run('whoami');
  run.waitSecs(commandTimeoutSecs);
  run.read(username);
  run.expectExit(0);

  testUtils.cleanUpApp(s, appName);
  testUtils.logout(s);
});
