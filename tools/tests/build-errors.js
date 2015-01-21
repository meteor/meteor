var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("build errors - colon in filename", function () {
  var s = new Sandbox();
  var run;

  s.createApp("myapp", "build-errors");
  s.cd("myapp");
  run = s.run("build", "myapp.tgz");
  run.waitSecs(60);
  run.matchErr("crash in plugin (compiling foo.awesome)");
  run.expectExit(1);
  run.forbidAll("Couldn't parse stack");
});
