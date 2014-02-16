var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("login", ['net'], function () {
  var s = new Sandbox;

  var run = s.run("whoami");
  run.matchErr("Not logged in");
  run.expectExit(1);

  // Username and password prompts happen on stderr so that scripts can
  // run commands that do login interactively and still save the command
  // output with the login prompts appearing in it.
  run = s.run("login");
  run.matchErr("Username:");
  run.write("test\n");
  run.matchErr("Password:");
  run.write("testtest\n");
  run.waitSecs(5);
  run.matchErr("Logged in as test.");
  run.expectExit(0);

  // XXX test login by email

  run = s.run("whoami");
  run.read("test\n");
  run.expectEnd();
  run.expectExit(0);

  run = s.run("logout");
  run.waitSecs(5);
  run.matchErr("Logged out");
  run.expectExit(0);

  run = s.run("logout");
  run.waitSecs(1);
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
  run.waitSecs(5);
  run.matchErr("Login failed");
  run.expectExit(1);

  // Logging in with a capitalized username should work (usernames are
  // case-insensitive).
  run = s.run("login");
  run.matchErr("Username:");
  run.write("TeSt\n");
  run.matchErr("Password:");
  run.write("testtest\n");
  run.waitSecs(5);
  run.matchErr("Logged in as test.");
  run.expectExit(0);

  run = s.run("logout");
  run.waitSecs(2);
  run.matchErr("Logged out");
  run.expectExit(0);

  // Logging in with a capitalized password should NOT work (can't be
  // too safe...)
  run = s.run("login");
  run.matchErr("Username:");
  run.write("test\n");
  run.matchErr("Password:");
  run.write("TesTTesT\n");
  run.waitSecs(5);
  run.matchErr("Login failed");
  run.expectExit(1);
});
