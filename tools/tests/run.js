var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
var utils = require('../utils/utils.js');
var net = require('net');
var Future = require('fibers/future');
var _ = require('underscore');
var files = require('../fs/files.js');
var catalog = require('../packaging/catalog/catalog.js');
var os = require('os');

var DEFAULT_RELEASE_TRACK = catalog.DEFAULT_TRACK;

var MONGO_LISTENING =
  { stdout: " [initandlisten] waiting for connections on port" };

var SIMPLE_WAREHOUSE = {
  v1: { },
  v2: { recommended: true },
  v3: { }
};

selftest.define("run", function () {
  var s = new Sandbox({ fakeMongo: true });
  var run;

  // Starting a run
  s.createApp("myapp", "standard-app");
  s.cd("myapp");
  s.set("METEOR_TEST_TMP", files.convertToOSPath(files.mkdtemp()));
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
  run.waitSecs(2);
  run.match("restarted");
  s.write("empty.js", " ");
  run.waitSecs(2);
  run.match("restarted");
  // XXX want app to generate output so that we can see restart counter reset

  // Crashes
  s.write("crash.js", "process.exit(42);");
  run.waitSecs(5);
  run.match("with code: 42");
  run.waitSecs(5);
  run.match("is crashing");
  s.unlink("crash.js");
  run.waitSecs(5);
  run.match("Modified");
  run.waitSecs(5);
  run.match("restarted");
  s.write("empty.js", "");
  run.waitSecs(5);
  // We used to see the restart counter reset but right now restart messages
  // don't coalesce due to intermediate use of the progress bar.
  run.match("restarted");
  s.write("crash.js", "process.kill(process.pid, 'SIGKILL');");
  run.waitSecs(5);
  run.match("Exited");
  run.match("is crashing");

  // Bundle failure
  s.unlink("crash.js");
  s.write("junk.css", "/*");
  run.waitSecs(5);
  run.match("Modified");
  run.match("prevented startup");
  run.match("End of comment missing");
  run.match("file change");

  // Back to working
  s.unlink("junk.css");
  run.waitSecs(5);
  run.match("restarted");

  // Crash just once, then restart successfully
  s.write("crash_then_restart.js", `
var fs = Npm.require('fs');
var path = Npm.require('path');
var crashmark = path.join(process.env.METEOR_TEST_TMP, 'crashed');
try {
  fs.readFileSync(crashmark);
} catch (e) {
  fs.writeFileSync(crashmark);
  process.exit(137);
}`);
  run.waitSecs(5);
  run.match("with code: 137");
  run.waitSecs(5);
  run.match("restarted");
  run.stop();
  s.unlink("crash_then_restart.js");

  run = s.run('--settings', 's.json');
  run.waitSecs(5);
  run.match('s.json: file not found (settings file)');
  run.match('Waiting for file change');
  s.write('s.json', '}');
  run.match('s.json: parse error reading settings file');
  run.match('Waiting for file change');
  s.write('s.json', '{}');
  run.waitSecs(15);
  run.match('App running at');
  run.stop();

  // Make sure a directory passed to --settings does not cause an infinite
  // re-build loop (issue #3854).
  run = s.run('--settings', os.tmpdir());
  run.match(`${os.tmpdir()}: file not found (settings file)`);
  run.match('Waiting for file change');
  run.forbid('Modified -- restarting');
  run.stop();

  // How about a bundle failure right at startup
  s.write("junk.css", "/*");
  run = s.run();
  run.tellMongo(MONGO_LISTENING);
  run.waitSecs(5);
  run.match("prevented startup");
  run.match("End of comment missing");
  run.match("file change");
  s.unlink("junk.css");
  run.waitSecs(5);
  run.match("restarted");
  run.stop();

// XXX --port, --production, --raw-logs, --settings, --program
});

selftest.define("run --once", ["yet-unsolved-windows-failure"], function () {
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
  s.write("junk.css", "/*");
  run = s.run("--once");
  run.waitSecs(5);
  run.matchErr("Build failed");
  run.matchErr("End of comment missing");
  run.expectExit(254);
  s.unlink("junk.css");

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
});

selftest.define("run --once with real Mongo", function () {
  var s = new Sandbox;
  s.createApp("onceapp", "once");
  s.cd("onceapp");
  s.set("RUN_ONCE_OUTCOME", "mongo");
  var run = s.run("--once");
  run.waitSecs(30);
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
  _.times(2, function () {
    run.waitSecs(30);
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

selftest.define("update during run", ["checkout", 'custom-warehouse'], function () {
  var s = new Sandbox({
    warehouse: SIMPLE_WAREHOUSE,
    fakeMongo: true
  });
  var run;

  s.set("METEOR_WATCH_PRIORITIZE_CHANGED", "false");

  s.createApp("myapp", "packageless", { release: DEFAULT_RELEASE_TRACK + '@v1' });
  s.cd("myapp");

  // If the app version changes, we exit with an error message.
  run = s.run();
  run.tellMongo(MONGO_LISTENING);
  run.waitSecs(10);
  run.match('localhost:3000');
  s.write('.meteor/release', DEFAULT_RELEASE_TRACK + '@v2');
  run.matchErr('to Meteor v2 from Meteor v1');
  run.waitSecs(10);
  run.expectExit(254);

  // But not if the release was forced (case 1)
  s.write('.meteor/release', DEFAULT_RELEASE_TRACK + '@v1');
  run = s.run("--release", DEFAULT_RELEASE_TRACK + "@v3");
  run.tellMongo(MONGO_LISTENING);
  run.waitSecs(2);
  run.match('localhost:3000');
  s.write('.meteor/release', DEFAULT_RELEASE_TRACK + '@v2');
  s.write('empty.js', '');
  run.waitSecs(10);
  run.match('restarted');
  run.waitSecs(10);
  run.stop();
  run.forbidAll("updated");

  // But not if the release was forced (case 2)
  s.write('.meteor/release', DEFAULT_RELEASE_TRACK + '@v1');
  run = s.run("--release", DEFAULT_RELEASE_TRACK + "@v1");
  run.tellMongo(MONGO_LISTENING);
  run.waitSecs(10);
  run.match('localhost:3000');
  s.write('.meteor/release', DEFAULT_RELEASE_TRACK + '@v2');
  s.write('empty.js', '');
  run.waitSecs(10);
  run.match('restarted');
  run.waitSecs(10);
  run.stop();
  run.forbidAll("updated");

  // Nor do we do it if you're running from a checkout
  s = new Sandbox({ fakeMongo: true });
  s.createApp("myapp", "standard-app");
  s.cd("myapp");

  s.write('.meteor/release', DEFAULT_RELEASE_TRACK + '@v1');
  run = s.run();
  run.tellMongo(MONGO_LISTENING);
  run.waitSecs(10);
  run.match('localhost:3000');
  run.waitSecs(10);
  s.write('.meteor/release', DEFAULT_RELEASE_TRACK + '@v2');
  s.write('empty.js', '');
  run.waitSecs(10);
  run.match('restarted');
  run.waitSecs(10);
  run.stop();
  run.forbidAll("updated");
});

selftest.define("run with mongo crash", ["checkout"], function () {
  var s = new Sandbox({ fakeMongo: true });
  var run;

  s.createApp("myapp", "standard-app");
  s.cd("myapp");

  // Kill mongod three times.  See that it gives up and quits.
  run = s.run();
  run.tellMongo(MONGO_LISTENING);
  run.waitSecs(2);
  run.match('localhost:3000/\n');

  if (process.platform === "win32") {
    run.match('Type Control-C twice to stop.\n\n');
  }

  run.tellMongo({exit: 23});
  run.read('Unexpected mongo exit code 23. Restarting.\n');
  run.tellMongo({exit: 46});
  run.read('Unexpected mongo exit code 46. Restarting.\n');
  run.tellMongo({exit: 47});
  run.read('Unexpected mongo exit code 47. Restarting.\n');
  run.read("Can't start Mongo server.\n");
  run.read("MongoDB exited due to excess clock skew\n");
  run.expectEnd();
  run.expectExit(254);

  // Now create a build failure. Make sure that killing mongod three times
  // *also* successfully quits even if we're waiting on file change.
  s.write('bad.css', '/*');
  run = s.run();
  run.tellMongo(MONGO_LISTENING);
  run.waitSecs(2);
  run.match("prevented startup");
  run.match("file change.\n");
  run.tellMongo({exit: 23});
  run.match('Unexpected mongo exit code 23. Restarting.\n');
  run.tellMongo({exit: 46});
  run.read('Unexpected mongo exit code 46. Restarting.\n');
  run.tellMongo({exit: 47});
  run.read('Unexpected mongo exit code 47. Restarting.\n');
  run.read("Can't start Mongo server.\n");
  run.read("MongoDB exited due to excess clock skew\n");
  run.expectEnd();
  run.expectExit(254);
});

// Test that when the parent runner process is SIGKILLed, the child
// process exits also.
selftest.define("run and SIGKILL parent process", ["yet-unsolved-windows-failure"], function () {
  var s = new Sandbox();
  var run;

  s.createApp("myapp", "app-prints-pid");
  s.cd("myapp");

  run = s.run();
  run.waitSecs(30);
  var match = run.match(/My pid is (\d+)/);
  var childPid;
  if (! match || ! match[1]) {
    selftest.fail("No pid printed");
  }
  childPid = match[1];

  process.kill(run.proc.pid, "SIGKILL");
  // This sleep should be a little more time than the interval at which
  // the child checks if the parent is still alive, in
  // packages/webapp/webapp_server.js.
  utils.sleepMs(3500);

  // Send the child process a signal of 0. If there is no error, it
  // means that the process is still running, which is not what we
  // expect.
  var caughtError;
  try {
    process.kill(childPid, 0);
  } catch (err) {
    caughtError = err;
  }

  if (! caughtError) {
    selftest.fail("Child process " + childPid + " is still running");
  }

  run.stop();

  // Test that passing a bad pid in $METEOR_PARENT_PID logs an error and exits
  // immediately.
  s.set("METEOR_BAD_PARENT_PID_FOR_TEST", "t");
  run = s.run();
  run.waitSecs(120);
  run.match("must be a valid process ID");
  run.match("Your application is crashing");
  run.stop();
});

selftest.define("'meteor run --port' accepts/rejects proper values", function () {
  var s = new Sandbox();
  var run;

  s.createApp("myapp", "standard-app");
  s.cd("myapp");

  run = s.run("run", "--port", "example.com");
  run.waitSecs(30);
  run.matchErr("--port must include a port");
  run.expectExit(1);

  run = s.run("run", "--port", "http://example.com");
  run.waitSecs(30);
  run.matchErr("--port must include a port");
  run.expectExit(1);

  run = s.run("run", "--port", "3500");
  run.waitSecs(30);
  run.match('App running at: http://localhost:3500/');
  run.stop();

  run = s.run("run", "--port", "127.0.0.1:3500");
  run.waitSecs(30);
  run.match('App running at: http://127.0.0.1:3500/');
  run.stop();
});

// Regression test for #3582.  Previously, meteor run would ignore changes to
// .meteor/versions that originate outside of the process.
selftest.define("update package during run", function () {
  var s = new Sandbox();

  s.createApp("myapp", "app-with-atmosphere-package");
  s.cd("myapp", function () {
    // The app starts with this package at 0.0.1 (based on its
    // .meteor/versions).  0.0.2 exists too.  (These are on the real atmosphere
    // server.)
    var listRun = s.run("list");
    listRun.waitSecs(3);
    listRun.match(/glasser:package-for-selftest.*0.0.1\*/);
    listRun.match(/\* New versions/);
    listRun.expectExit(0);

    var runRun = s.run();
    runRun.waitSecs(3);
    runRun.match("App running at:");

    var updateRun = s.run("update", "glasser:package-for-selftest");
    updateRun.match(
        /glasser:package-for-selftest.*upgraded from 0.0.1 to 0.0.2/);
    updateRun.expectExit(0);

    runRun.match("restarted");

    listRun = s.run("list");
    // When #3582 existed, the `meteor run` would revert this back to 0.0.1
    // before it restarted.
    listRun.match(/glasser:package-for-selftest.*0.0.2 /);
    listRun.expectExit(0);

    runRun.stop();
  });
});

selftest.define("run logging in order", function () {
  var s = new Sandbox({ fakeMongo: true });
  var run;

  // Starting a run
  s.createApp("myapp", "standard-app");
  s.cd("myapp");
  s.write('packageless.js', `
    Meteor.startup(function() {
      for (var i = 0; i < 100000; i++) {
        console.log('line: ' + i + '.');
      }
    });
  `);
  run = s.run();
  run.match("myapp");
  run.match("proxy");
  run.tellMongo(MONGO_LISTENING);
  run.match("MongoDB");
  run.waitSecs(5);
  for (var i = 0; i < 100000; i++) {
    run.match(`line: ${i}.`);
  }
});
