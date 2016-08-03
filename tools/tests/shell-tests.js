var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("meteor shell", function () {
  var s = new Sandbox();
  s.createApp("meteor-shell-test", "shell");
  s.cd("meteor-shell-test");

  var server = s.run("run", "--once");
  server.waitSecs(45);
  server.match("App running at");

  var shell = s.run("shell");
  // First try a simple one-line expression.
  shell.write("{server:Meteor.isServer}\n");
  shell.proc.stdin.end();
  shell.match('{"server":true}');

  shell = s.run("shell");
  // Now try with a bunch of newlines in the input.
  shell.write("500+\n4000\n+60\n\n+\n7\n");
  shell.proc.stdin.end();
  shell.match("4567");

  shell = s.run("shell");
  // Now use the shell to make the server output something.
  shell.write('console.log("oyez")\n');
  shell.proc.stdin.end();
  server.match("oyez");

  shell = s.run("shell");
  // Now check something set by the test app.
  shell.write('Meteor.checkMeFromShell\n');
  shell.proc.stdin.end();
  shell.match("oky dok");
});
