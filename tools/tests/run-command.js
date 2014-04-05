var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("run-command", function () {
  var s = new Sandbox;
  var run;

  console.log("XXX: Added some timeouts because of package loading times.");
  console.log("XXX: also the second test fails because of package server workaround.");

  s.createApp("myapp", "with-command");
  run = s.run("run-command", "myapp/packages/command");
  run.waitSecs(3);
  run.read("argv []\n");
  run.expectEnd();
  run.expectExit(17);

  run = s.run("run-command", "myapp/packages/command", "x", "--", "-f", "--bla");
  run.waitSecs(3);
  run.read("argv [ 'x', '-f', '--bla' ]\n");
  run.expectEnd();
  run.expectExit(17);
});
