var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("create", function () {
  var s = new Sandbox;

  run = s.run("create", "--list");
  run.read('Available');
  run.match('leaderboard');
  run.expectExit(0);
  // XXX test that --list always gives you the examples of the current
  // release!


  // XXX XXX more more
});
