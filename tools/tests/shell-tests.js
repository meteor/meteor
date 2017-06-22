var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("meteor shell", function () {
  var s = new Sandbox();
  s.createApp("meteor-shell-test", "shell");
  s.cd("meteor-shell-test");

  var server = s.run();
  server.waitSecs(60);
  server.match("App running at");

  var shell = s.run("shell");
  // First try a simple one-line expression.
  shell.write("({server:Meteor.isServer})\n");
  shell.proc.stdin.end();
  shell.waitSecs(10);
  shell.match('{"server":true}');
  shell.expectExit(0);

  shell = s.run("shell");
  // Now try with a bunch of newlines in the input.
  shell.write("500+\n4000\n+60\n\n+\n7\n");
  shell.proc.stdin.end();
  shell.waitSecs(10);
  shell.match("4567");
  shell.expectExit(0);

  shell = s.run("shell");
  // Now use the shell to make the server output something.
  shell.write('console.log("oyez")\n');
  shell.proc.stdin.end();
  shell.waitSecs(10);
  server.match("oyez");
  shell.expectExit(0);

  shell = s.run("shell");
  // Now check something set by the test app.
  shell.write('Meteor.checkMeFromShell\n');
  shell.proc.stdin.end();
  shell.waitSecs(10);
  shell.match("oky dok");
  shell.expectExit(0);

  shell = s.run("shell");
  // Now check importing a module
  shell.write('import { Meteor } from "meteor/meteor"\n');
  shell.proc.stdin.end();
  shell.waitSecs(10);
  shell.match("undefined");
  shell.expectExit(0);

  server.stop();
});
