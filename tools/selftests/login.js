var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("login", function () {
  var s = new Sandbox;

  // XXX need to create a new credentials file for this run! (and a
  // user account)
  // XXX how to clean up test user accounts at end of test run? or,
  // only ever do it against a testing universe, and don't bother?
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
  // XXX want something like 'matchAll' that you call after expectExit
  // and must match all remaining input. basically, it's like match
  // except that it requires the match offset to be zero. if you call
  // that after exit it will do what we want.
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
