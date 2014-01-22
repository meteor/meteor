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

selftest.define("argument parsing", function () {
  var s = new Sandbox;
  var run;

  run = s.run("aoeuasdf");
  run.matchErr("not a Meteor command");
  run.expectExit(1);


  // XXX test that main.js catches all the weird error cases
});
