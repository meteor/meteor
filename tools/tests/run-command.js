var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("run-command", function () {
  var s = new Sandbox;
  var run;

  s.createApp("myapp", "with-command");
  run = s.run("run-command", "myapp/packages/command");
  run.read("argv []\n");
  run.expectEnd();
  run.expectExit(17);

  run = s.run("run-command", "myapp/packages/command", "x", "--", "-f", "--bla");
  run.read("argv [ 'x', '-f', '--bla' ]\n");
  run.expectEnd();
  run.expectExit(17);
});
