var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;
var utils = require('../utils.js');

var MONGO_LISTENING =
  { stdout: " [initandlisten] waiting for connections on port" };

var SIMPLE_WAREHOUSE = {
  v1: { tools: 'tools1' },
  v2: { tools: 'tools1', latest: true },
  v3: { tools: 'tools1' },
};

selftest.define("run --once", function () {
  var s = new Sandbox({ fakeMongo: true });
  var run;

  s.createApp("onceapp", "once");
  s.cd("onceapp");

  // Basic run --once
  s.set("RUN_ONCE_OUTCOME", "exit");
  run = s.run("--once");
  run.tellMongo(MONGO_LISTENING);
  run.waitSecs(5);
  run.match("once test\n");
  run.expectExit(123);

  // run --once, exit on signal
  s.set("RUN_ONCE_OUTCOME", "kill");
  run = s.run("--once");
  run.tellMongo(MONGO_LISTENING);
  run.waitSecs(5);
  run.match("once test\n");
  run.matchErr("Killed (SIGKILL)\n");
  run.expectExit(255);

  // run --once, bundle failure
  s.set("RUN_ONCE_OUTCOME", "exit");
  s.write("junk.js", "]");
  run = s.run("--once");
  run.tellMongo(MONGO_LISTENING);
  run.waitSecs(5);
  run.matchErr("Build failed");
  run.matchErr("Unexpected token");
  run.expectExit(254);
  s.unlink("junk.js");

  // file changes don't make it restart
  s.set("RUN_ONCE_OUTCOME", "hang");
  run = s.run("--once");
  run.tellMongo(MONGO_LISTENING);
  run.waitSecs(5);
  run.match("once test\n");
  s.write('empty.js', 'null');
  s.write('.meteor/release', 'v1');
  utils.sleepMs(2000); // sorry, hard to avoid
  run.stop();
  run.forbidAll("updated");
  s.unlink('empty.js');
  s.write('.meteor/release', 'none');

  // running a different program
  run = s.run("--once", "--program", "other");
  run.tellMongo(MONGO_LISTENING);
  run.waitSecs(5);
  run.match("other program\n");
  run.expectExit(44);

  // bad program name
  run = s.run("--once", "--program", "xyzzy");
  run.tellMongo(MONGO_LISTENING);
  run.waitSecs(5);
  run.match("xyzzy");
  run.expectExit(254);

  // Try it with a real Mongo. Make sure that it actually starts one.
  s = new Sandbox;
  s.createApp("onceapp", "once");
  s.cd("onceapp");
  s.set("RUN_ONCE_OUTCOME", "mongo");
  run = s.run("--once");
  run.waitSecs(5);
  run.expectExit(86);
});


selftest.define("update during run", ["checkout"], function () {
  var s = new Sandbox({
    warehouse: SIMPLE_WAREHOUSE,
    fakeMongo: true
  });
  var run;

  s.createApp("myapp", "empty");
  s.cd("myapp");

  // If the app version changes, we exit with an error message.
  s.write('.meteor/release', 'v1');
  run = s.run();
  run.tellMongo(MONGO_LISTENING);
  run.waitSecs(2)
  run.match('localhost:3000');
  s.write('.meteor/release', 'v2');
  run.matchErr('to Meteor v2 from Meteor v1');
  run.expectExit(254);

  // But not if the release was forced (case 1)
  s.write('.meteor/release', 'v1');
  run = s.run("--release", "v3");
  run.tellMongo(MONGO_LISTENING);
  run.waitSecs(2)
  run.match('localhost:3000');
  s.write('.meteor/release', 'v2');
  s.write('empty.js', '');
  run.waitSecs(2)
  run.match('restarted');
  run.stop();
  run.forbidAll("updated");

  // But not if the release was forced (case 2)
  s.write('.meteor/release', 'v1');
  run = s.run("--release", "v1");
  run.tellMongo(MONGO_LISTENING);
  run.waitSecs(2)
  run.match('localhost:3000');
  s.write('.meteor/release', 'v2');
  s.write('empty.js', '');
  run.waitSecs(2)
  run.match('restarted');
  run.stop();
  run.forbidAll("updated");

  // Nor do we do it if you're running from a checkout
  s = new Sandbox({ fakeMongo: true });
  s.createApp("myapp", "empty");
  s.cd("myapp");

  s.write('.meteor/release', 'v1');
  run = s.run();
  run.tellMongo(MONGO_LISTENING);
  run.waitSecs(2)
  run.match('localhost:3000');
  s.write('.meteor/release', 'v2');
  s.write('empty.js', '');
  run.waitSecs(2)
  run.match('restarted');
  run.stop();
  run.forbidAll("updated");
});

