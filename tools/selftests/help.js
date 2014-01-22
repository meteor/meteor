var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("help", function () {
  var s = new Sandbox;

  var run = s.run("help");
  run.match("Usage: meteor");
  run.match("Commands:");
  run.match(/create\s*Create a new project/);
  run.expectExit(0);

  // XXX test --help, help for particular commands
});
