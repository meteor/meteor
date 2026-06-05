var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
var utils = require('../utils/utils.js');

var MONGO_LISTENING =
  { stdout: " [initandlisten] waiting for connections on port" };

selftest.define("run --once", ["yet-unsolved-windows-failure"], async function () {
  var s = new Sandbox({ fakeMongo: true });
  await s.init();
  var run;

  await s.createApp("onceapp", "once");
  s.cd("onceapp");

  // Basic run --once
  s.set("RUN_ONCE_OUTCOME", "exit");
  run = s.run("--once");
  await run.tellMongo(MONGO_LISTENING);
  run.waitSecs(5);
  await run.match("once test\n");
  await run.expectExit(123);

  // run --once, exit on signal
  s.set("RUN_ONCE_OUTCOME", "kill");
  run = s.run("--once");
  await run.tellMongo(MONGO_LISTENING);
  run.waitSecs(5);
  await run.match("once test\n");
  await run.matchErr("Killed (SIGKILL)\n");
  await run.expectExit(255);

  // run --once, bundle failure
  s.set("RUN_ONCE_OUTCOME", "exit");
  s.write("junk.css", "/*");
  run = s.run("--once");
  run.waitSecs(5);
  await run.matchErr("Build failed");
  await run.matchErr("Unclosed comment");
  await run.expectExit(254);
  s.unlink("junk.css");

  // file changes don't make it restart
  s.set("RUN_ONCE_OUTCOME", "hang");
  run = s.run("--once");
  await run.tellMongo(MONGO_LISTENING);
  run.waitSecs(5);
  await run.match("once test\n");
  s.write('empty.js', 'null');
  var originalRelease = s.read('.meteor/release');
  s.write('.meteor/release', 'v1');
  await utils.sleepMs(2000); // sorry, hard to avoid
  await run.stop();
  run.forbidAll("updated");
  s.unlink('empty.js');
  s.write('.meteor/release', originalRelease);
});

selftest.define("run --once with real Mongo", async function () {
  var s = new Sandbox;
  await s.init();

  await s.createApp("onceapp", "once");
  s.cd("onceapp");
  s.set("RUN_ONCE_OUTCOME", "mongo");
  var run = s.run("--once");
  run.waitSecs(30);
  await run.expectExit(86);
});
