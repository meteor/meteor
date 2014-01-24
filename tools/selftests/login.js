var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("login", function () {
  var s = new Sandbox;

  var run = s.run("whoami");
  run.matchErr("Not logged in");
  run.expectExit(1);

  run = s.run("login");
  run.match("Username:");
  run.write("test\n");
  run.match("Password:");
  run.write("testtest\n");
  run.waitSecs(5);
  run.match("Logged in as test.");
  run.expectExit(0);

  // XXX test login failure
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
  run.matchErr("Not logged in");
  run.expectExit(0);

  run = s.run("whoami");
  run.matchErr("Not logged in");
  run.expectExit(1);
});
