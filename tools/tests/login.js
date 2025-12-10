var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
var testUtils = require('../tool-testing/test-utils.js');

var commandTimeoutSecs = 10;
var loginTimeoutSecs = 2;

selftest.define("login", ['net'], async function () {
  var s = new Sandbox;
  await s.init();

  var run = s.run("whoami");
  await run.matchErr("Not logged in");
  await run.expectExit(1);

  // Username and password prompts happen on stderr so that scripts can
  // run commands that do login interactively and still save the command
  // output with the login prompts appearing in it.
  //
  // Do this twice to confirm that the login command prints a prompt
  // even if you are already logged in.
  for (var i = 0; i < 2; i++) {
    run = s.run("login");
    run.waitSecs(loginTimeoutSecs);
    await run.matchErr("Username:");
    run.write("test\n");
    await run.matchErr("Password:");
    run.write("testtest\n");
    run.waitSecs(commandTimeoutSecs);
    await run.matchErr("Logged in as test.");
    await run.expectExit(0);
  }

  // Leaving username blank, or getting the password wrong, doesn't
  // reprompt. It also doesn't log you out.
  run = s.run("login");
  run.waitSecs(loginTimeoutSecs);
  await run.matchErr("Username:");
  run.write("\n");
  await run.matchErr("Password:");
  run.write("whatever\n");
  run.waitSecs(commandTimeoutSecs);
  await run.matchErr("failed");
  await run.expectExit(1);

  run = s.run("login");
  run.waitSecs(loginTimeoutSecs);
  await run.matchErr("Username:");
  run.write("test\n");
  await run.matchErr("Password:");
  run.write("whatever\n");
  run.waitSecs(commandTimeoutSecs);
  await run.matchErr("failed");
  await run.expectExit(1);

  run = s.run('login');
  run.waitSecs(loginTimeoutSecs);
  await run.matchErr("Username:");
  run.write("test\n");
  await run.matchErr("Password:");
  run.write("testtest\n");
  run.waitSecs(commandTimeoutSecs);
  await run.matchErr("Logged in as test.");
  await run.expectExit(0);

  // XXX test login by email

  run = s.run("whoami");
  await run.read("test\n");
  await run.expectExit(0);

  run = s.run("logout");
  run.waitSecs(commandTimeoutSecs);
  await run.matchErr("Logged out");
  await run.expectExit(0);

  run = s.run("logout");
  run.waitSecs(commandTimeoutSecs);
  await run.matchErr("Not logged in");
  await run.expectExit(0);

  run = s.run("whoami");
  await run.matchErr("Not logged in");
  await run.expectExit(1);

  // Test login failure
  run = s.run("login");
  run.waitSecs(loginTimeoutSecs);
  await run.matchErr("Username:");
  run.write("test\n");
  await run.matchErr("Password:");
  run.write("badpassword\n");
  run.waitSecs(commandTimeoutSecs);
  await run.matchErr("Login failed");
  await run.expectExit(1);

  // Logging in with a capitalized username should work (usernames are
  // case-insensitive).
  run = s.run("login");
  run.waitSecs(loginTimeoutSecs);
  await run.matchErr("Username:");
  run.write("TeSt\n");
  await run.matchErr("Password:");
  run.write("testtest\n");
  run.waitSecs(commandTimeoutSecs);
  await run.matchErr("Logged in as test.");
  await run.expectExit(0);

  run = s.run("logout");
  run.waitSecs(commandTimeoutSecs);
  await run.matchErr("Logged out");
  await run.expectExit(0);

  // Logging in with a capitalized password should NOT work (can't be
  // too safe...)
  run = s.run("login");
  run.waitSecs(loginTimeoutSecs);
  await run.matchErr("Username:");
  run.write("test\n");
  await run.matchErr("Password:");
  run.write("TesTTesT\n");
  run.waitSecs(commandTimeoutSecs);
  await run.matchErr("Login failed");
  await run.expectExit(1);
});

// This is a Galaxy-related command (deploy), but still pretty auth-y.
selftest.define("login on deploy", ['net'], async function () {
  const s = new Sandbox;
  await s.init();

  const appName = testUtils.randomAppName();

  await s.createApp(appName, "standard-app");
  s.cd(appName);

  let run = s.run("deploy", appName);
  await run.matchErr(/You must be logged in to deploy/);

  await run.matchErr("Email:");
  run.write("test@test.com\n");

  await run.matchErr("Logging in as test.");

  await run.matchErr("Password:");
  run.write("SoVeryWrong\n");
  run.waitSecs(commandTimeoutSecs);
  await run.matchErr("Login failed");

  await run.matchErr("Password:");
  run.write("testtest\n");
  run.waitSecs(commandTimeoutSecs);
  await run.match("Talking to Galaxy servers");
  run.waitSecs(commandTimeoutSecs * 10);
  // "test" user can't actually deploy, so it will still fail.
  await run.expectExit(1);
});
