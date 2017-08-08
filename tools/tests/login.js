var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
var testUtils = require('../tool-testing/test-utils.js');

var commandTimeoutSecs = 10;
var loginTimeoutSecs = 2;

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
    run.waitSecs(loginTimeoutSecs);
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
  run.waitSecs(loginTimeoutSecs);
  run.matchErr("Username:");
  run.write("\n");
  run.matchErr("Password:");
  run.write("whatever\n");
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("failed");
  run.expectExit(1);

  run = s.run("login");
  run.waitSecs(loginTimeoutSecs);
  run.matchErr("Username:");
  run.write("test\n");
  run.matchErr("Password:");
  run.write("whatever\n");
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("failed");
  run.expectExit(1);

  run = s.run('login');
  run.waitSecs(loginTimeoutSecs);
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
  run.waitSecs(loginTimeoutSecs);
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
  run.waitSecs(loginTimeoutSecs);
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
  run.waitSecs(loginTimeoutSecs);
  run.matchErr("Username:");
  run.write("test\n");
  run.matchErr("Password:");
  run.write("TesTTesT\n");
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("Login failed");
  run.expectExit(1);
});

// This is a Galaxy-related command (deploy), but still pretty auth-y.
selftest.define("login on deploy", ['net'], function () {
  const s = new Sandbox;

  const appName = testUtils.randomAppName();

  s.createApp(appName, "standard-app");
  s.cd(appName);

  let run = s.run("deploy", appName);
  run.matchErr(/You must be logged in to deploy/);

  run.matchErr("Email:");
  run.write("test@test.com\n");

  run.matchErr("Logging in as test.");

  run.matchErr("Password:");
  run.write("SoVeryWrong\n");
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("Login failed");

  run.matchErr("Password:");
  run.write("testtest\n");
  run.waitSecs(commandTimeoutSecs);
  run.match("Talking to Galaxy servers");

  // "test" user can't actually deploy, so it will still fail.
  run.expectExit(1);
});
