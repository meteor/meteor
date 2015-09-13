var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("create", function () {
  var s = new Sandbox;

  // Can we create an app? Yes!
  var run = s.run("create", "foobar");
  run.waitSecs(60);
  run.match("Created a new Meteor app in 'foobar'.");
  run.match("To run your new app");
  run.expectExit(0);

  // Now, can we run it?
  s.cd("foobar");
  run = s.run();
  run.waitSecs(15);
  run.match("foobar");
  run.match("proxy.");
  // Do not print out the changes to the versions file!
  run.read("\n=>");
  run.match("MongoDB");
  run.waitSecs(5);
  run.match("your app");
  run.waitSecs(5);
  run.match("running at");
  run.match("localhost");
  run.stop();

  run = s.run("create", "--list");
  run.waitSecs(5);
  run.read('Available');
  run.match('leaderboard');
  run.expectExit(0);
  // XXX test that --list always gives you the examples of the current
  // release!

  // XXX XXX more more
});
