var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("meteor shell", async function () {
  var s = new Sandbox();
  await s.init();

  await s.createApp("meteor-shell-test", "shell");
  s.cd("meteor-shell-test");

  var server = s.run();
  server.waitSecs(60);
  await server.match("App running at");

  var shell = s.run("shell");
  // First try a simple one-line expression.
  shell.write("({server:Meteor.isServer})\n");
  shell.proc.stdin.end();
  shell.waitSecs(10);
  await shell.match('{"server":true}');
  await shell.expectExit(0);

  shell = s.run("shell");
  // Make sure that the special Node REPL _ variable is not stomping on any
  // global `_` (i.e. Underscore) since the default `repl` behavior sets the
  // special variable `_` to the result of the last operation. This method
  // call to the server will make sure our special `_` remains intact after
  // the shell is launched.
  shell.write(
    "Meteor.call('__meteor__/__self_test__/shell-tests/underscore')\n");
  shell.proc.stdin.end();
  shell.waitSecs(10);
  await shell.match('["_specialUnderscoreTestObject"]');
  await shell.expectExit(0);

  shell = s.run("shell");
  // Now try with a bunch of newlines in the input.
  shell.write("500+\n4000\n+60\n\n+\n7\n");
  shell.proc.stdin.end();
  shell.waitSecs(10);
  await shell.match("4567");
  await shell.expectExit(0);

  shell = s.run("shell");
  // Now use the shell to make the server output something.
  shell.write('console.log("oyez")\n');
  shell.proc.stdin.end();
  shell.waitSecs(10);
  await server.match("oyez");
  await shell.expectExit(0);

  shell = s.run("shell");
  // Now check something set by the test app.
  shell.write('Meteor.checkMeFromShell\n');
  shell.proc.stdin.end();
  shell.waitSecs(10);
  await shell.match("oky dok");
  await shell.expectExit(0);

  shell = s.run("shell");
  // Now check importing a module
  shell.write('import { Meteor } from "meteor/meteor"\n');
  shell.proc.stdin.end();
  shell.waitSecs(10);
  await shell.match("undefined");
  await shell.expectExit(0);

  await server.stop();
});
