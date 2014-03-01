var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;
var utils = require('../utils.js');
var net = require('net');
var Future = require('fibers/future');
var _ = require('underscore');
var files = require('../files.js');

var MONGO_LISTENING =
  { stdout: " [initandlisten] waiting for connections on port" };

var SIMPLE_WAREHOUSE = {
  v1: { tools: 'tools1' },
  v2: { tools: 'tools1', latest: true },
  v3: { tools: 'tools1' },
};

selftest.define("run", function () {
  var s = new Sandbox({ fakeMongo: true });
  var run;

  // Starting a run
  s.createApp("myapp", "standard-app");
  s.cd("myapp");
  s.set("METEOR_TEST_TMP", files.mkdtemp());
  run = s.run();
  run.match("myapp");
  run.match("proxy");
  run.tellMongo(MONGO_LISTENING);
  run.match("MongoDB");
  run.match("your app");
  run.waitSecs(5);
  run.match("running at");
  run.match("localhost");

  // File change
  s.write("empty.js", "");
  run.waitSecs(1);
  run.match("restarted");
  s.write("empty.js", " ");
  run.waitSecs(1);
  run.match("restarted (x2)");
  // XXX want app to generate output so that we can see restart counter reset

  // Crashes
  s.write("crash.js", "process.exit(42);");
  run.waitSecs(5);
  run.match("with code: 42");
  run.waitSecs(5);
  run.match("is crashing");
  s.unlink("crash.js");
  run.match("Modified");
  run.match("restarted");
  s.write("empty.js", "");
  run.waitSecs(5);
  run.match("restarted (x2)"); // see that restart counter reset
  s.write("crash.js", "process.kill(process.pid, 'SIGKILL');");
  run.waitSecs(5);
  run.match("from signal: SIGKILL");
  run.waitSecs(5);
  run.match("is crashing");

  // Bundle failure
  s.unlink("crash.js");
  s.write("junk.js", "]");
  run.match("Modified");
  run.match("prevented startup");
  run.match("Unexpected token");
  run.match("file change");

  // Back to working
  s.unlink("junk.js");
  run.match("restarted");

  // Crash just once, then restart successfully
  s.write("crash.js",
"var fs = Npm.require('fs')\n" +
"var path = Npm.require('path')\n" +
"var crashmark = path.join(process.env.METEOR_TEST_TMP, 'crashed');\n" +
"try {\n" +
"  fs.readFileSync(crashmark);\n" +
"} catch (e) {\n" +
"  fs.writeFileSync(crashmark);\n" +
"  process.exit(137);\n" +
"}\n");
  run.waitSecs(5);
  run.match("with code: 137");
  run.match("restarted");
  run.stop();

  // How about a bundle failure right at startup
  s.unlink("crash.js");
  s.write("junk.js", "]");
  run = s.run();
  run.tellMongo(MONGO_LISTENING);
  run.waitSecs(5);
  run.match("prevented startup");
  run.match("Unexpected token");
  run.match("file change");
  s.unlink("junk.js");
  run.match("restarted");
  run.stop();

// XXX --port, --production, --raw-logs, --settings, --program
});

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
  var originalRelease = s.read('.meteor/release');
  s.write('.meteor/release', 'v1');
  utils.sleepMs(2000); // sorry, hard to avoid
  run.stop();
  run.forbidAll("updated");
  s.unlink('empty.js');
  s.write('.meteor/release', originalRelease);

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
  run.match("'xyzzy' not found");
  run.expectExit(254);

  // Try it with a real Mongo. Make sure that it actually starts one.
  s = new Sandbox;
  s.createApp("onceapp", "once");
  s.cd("onceapp");
  s.set("RUN_ONCE_OUTCOME", "mongo");
  run = s.run("--once");
  run.waitSecs(15);
  run.expectExit(86);
});

selftest.define("run errors", function () {
  var s = new Sandbox;
  s.createApp("myapp", "standard-app");
  s.cd("myapp");

  // Prevent mongod from starting up.  (Note that "127.0.0.1" matches the
  // interface that mongo uses.)
  var proxyPort = utils.randomPort();
  var mongoPort = proxyPort + 1;
  var f = new Future;
  var server = net.createServer().listen(mongoPort, "127.0.0.1", f.resolver());
  f.wait();

  var run = s.run("-p", proxyPort);
  _.times(3, function () {
    run.waitSecs(3);
    run.match("Unexpected mongo exit code 48. Restarting.");
  });
  run.waitSecs(3);
  run.match("Can't start Mongo server");
  run.match("MongoDB exited because its port was closed");
  run.match("running in the same project.\n");
  run.expectEnd();
  run.forbid("Started MongoDB");
  run.expectExit(254);

  f = new Future;
  server.close(f.resolver());
  f.wait();

  // This time, prevent the proxy from starting. (This time, leaving out the
  // interface name matches.)
  f = new Future;
  server = net.createServer().listen(proxyPort, f.resolver());
  f.wait();

  run = s.run("-p", proxyPort);
  run.waitSecs(3);
  run.match(/Can't listen on port.*another Meteor/);
  run.expectExit(254);

  f = new Future;
  server.close(f.resolver());
  f.wait();
});

selftest.define("update during run", ["checkout"], function () {
  var s = new Sandbox({
    warehouse: SIMPLE_WAREHOUSE,
    fakeMongo: true
  });
  var run;

  s.createApp("myapp", "standard-app");
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
  s.createApp("myapp", "standard-app");
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
