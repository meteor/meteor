var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
var utils = require('../utils/utils.js');
var net = require('net');
var _ = require('underscore');
var files = require('../fs/files');
var catalog = require('../packaging/catalog/catalog.js');
var os = require('os');
var isReachable = require("is-reachable");
var httpHelpers = require('../utils/http-helpers.js');

var DEFAULT_RELEASE_TRACK = catalog.DEFAULT_TRACK;

var MONGO_LISTENING =
  { stdout: " [initandlisten] waiting for connections on port" };

var SIMPLE_WAREHOUSE = {
  v1: { },
  v2: { recommended: true },
  v3: { }
};

selftest.define("run", async function () {
  var s = new Sandbox({ fakeMongo: true });
  await s.init();

  var run;

  // Starting a run
  await s.createApp("myapp", "standard-app");
  s.cd("myapp");
  s.set("METEOR_TEST_TMP", files.convertToOSPath(files.mkdtemp()));
  run = s.run();
  await run.match("myapp");
  await run.match("proxy");
  await run.tellMongo(MONGO_LISTENING);
  await run.match("MongoDB");
  await run.match("your app");
  run.waitSecs(5);
  await run.match("running at");
  await run.match("localhost");

  // File change
  s.write("empty.js", "");
  run.waitSecs(2);
  await run.match("restarted");
  s.write("empty.js", " ");
  run.waitSecs(2);
  await run.match("restarted");
  // XXX want app to generate output so that we can see restart counter reset

  // Crashes
  s.write("crash.js", "process.exit(42);");
  run.waitSecs(5);
  await run.match("with code: 42");
  run.waitSecs(5);
  await run.match("is crashing");
  s.unlink("crash.js");
  run.waitSecs(5);
  await run.match("Modified");
  run.waitSecs(5);
  await run.match("restarted");
  s.write("empty.js", "");
  run.waitSecs(5);
  // We used to see the restart counter reset but right now restart messages
  // don't coalesce due to intermediate use of the progress bar.
  await run.match("restarted");
  s.write("crash.js", "process.kill(process.pid, 'SIGKILL');");
  run.waitSecs(5);
  await run.match("Exited");
  await run.match("is crashing");

  // Bundle failure
  s.unlink("crash.js");
  s.write("junk.css", "/*");
  run.waitSecs(5);
  await run.match("Modified");
  await run.match("prevented startup");
  await run.match("Unclosed comment");
  await run.match("file change");

  // Back to working
  s.unlink("junk.css");
  run.waitSecs(5);
  await run.match("restarted");
  await run.stop();

  run = s.run('--settings', 's.json');
  run.waitSecs(5);
  await run.match('s.json: file not found (settings file)');
  await run.match('Waiting for file change');
  s.write('s.json', '}');
  await run.match('s.json: parse error reading settings file');
  await run.match('Waiting for file change');
  s.write('s.json', '{}');
  run.waitSecs(15);
  await run.match('App running at');
  await run.stop();

  // Make sure a directory passed to --settings does not cause an infinite
  // re-build loop (issue #3854).
  run = s.run('--settings', os.tmpdir());
  await run.match(`${os.tmpdir()}: file not found (settings file)`);
  await run.match('Waiting for file change');
  run.forbid('Modified -- restarting');
  await run.stop();

  // How about a bundle failure right at startup
  s.write("junk.css", "/*");
  run = s.run();
  await run.tellMongo(MONGO_LISTENING);
  run.waitSecs(5);
  await run.match("prevented startup");
  await run.match("Unclosed comment");
  await run.match("file change");
  s.unlink("junk.css");
  run.waitSecs(5);
  await run.match("restarted");
  await run.stop();

// XXX --port, --production, --raw-logs, --settings, --program
});

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

selftest.define("run errors", async function () {
  var s = new Sandbox;
  await s.init();

  await s.createApp("myapp", "standard-app");
  s.cd("myapp");

  // Prevent mongod from starting up.  (Note that "127.0.0.1" matches the
  // interface that mongo uses.)
  var proxyPort = utils.randomPort();
  var mongoPort = proxyPort + 1;
  let resolver;
  let toWait = new Promise(r => resolver = r);

  var server = net.createServer().listen(mongoPort, "127.0.0.1", resolver);
  await toWait;

  var run = s.run("-p", proxyPort);
  for (let count = 0; count <= 1; count++) {
    run.waitSecs(30);
    await run.match("Unexpected mongo exit code 48. Restarting.");
  }

  run.waitSecs(3);
  await run.match("Can't start Mongo server");
  await run.match("MongoDB exited because its port was closed");
  await run.match("running in the same project.\n");
  await run.expectEnd();
  run.forbid("Started MongoDB");
  await run.expectExit(254);

  toWait = new Promise(r => resolver = r);
  server.close(resolver);
  await toWait;

  // This time, prevent the proxy from starting. (This time, leaving out the
  // interface name matches.)
  toWait = new Promise(r => resolver = r);
  server = net.createServer().listen(proxyPort, resolver);
  await toWait;

  run = s.run("-p", proxyPort);
  run.waitSecs(3);
  await run.match(/Can't listen on port.*another Meteor/);
  await run.expectExit(254);

  toWait = new Promise(r => resolver = r);
  server.close(resolver);
  await toWait;
});

selftest.define("handle requests with large headers", async function() {
  const sandbox = new Sandbox();
  await sandbox.init();

  sandbox.env.NODE_OPTIONS = '--max-http-header-size=8192';

  await sandbox.createApp('myapp', 'standard-app');
  sandbox.cd('myapp');
  sandbox.append('.meteor/packages', 'browser-policy\n');

  const browserPolicyCode = Array(1000).fill(null)
    .map((_, index) => (
      `BrowserPolicy.content.allowConnectOrigin('host${index}.com');`
    ))
    .join('\n');
  sandbox.write('packageless.js', browserPolicyCode);

  const run = sandbox.run();
  run.waitSecs(5);
  await run.match('App running');

  let errorMessage = null;
  try {
    await httpHelpers.getUrl('http://localhost:3000');
  } catch (error) {
    errorMessage = error.message;
  }

  const errorMatchesExpected = /Unexpected error\./.test(errorMessage);
  selftest.expectTrue(errorMatchesExpected);
  await run.match('due to the header size exceeding Node\'s currently');
});

selftest.define("update during run", ["checkout", 'custom-warehouse'], async function () {
  var s = new Sandbox({
    warehouse: SIMPLE_WAREHOUSE,
    fakeMongo: true
  });
  await s.init();

  var run;

  s.set("METEOR_WATCH_PRIORITIZE_CHANGED", "false");

  await s.createApp("myapp", "packageless", { release: DEFAULT_RELEASE_TRACK + '@v1' });
  s.cd("myapp");

  // If the app version changes, we exit with an error message.
  run = s.run();
  await run.tellMongo(MONGO_LISTENING);
  run.waitSecs(10);
  await run.match('localhost:3000');
  s.write('.meteor/release', DEFAULT_RELEASE_TRACK + '@v2');
  await run.matchErr('to Meteor v2 from Meteor v1');
  run.waitSecs(10);
  await run.expectExit(254);

  // But not if the release was forced (case 1)
  s.write('.meteor/release', DEFAULT_RELEASE_TRACK + '@v1');
  run = s.run("--release", DEFAULT_RELEASE_TRACK + "@v3");
  await run.tellMongo(MONGO_LISTENING);
  run.waitSecs(2);
  await run.match('localhost:3000');
  s.write('.meteor/release', DEFAULT_RELEASE_TRACK + '@v2');
  s.write('empty.js', '');
  run.waitSecs(10);
  await run.match('restarted');
  run.waitSecs(10);
  await run.stop();
  run.forbidAll("updated");

  // But not if the release was forced (case 2)
  s.write('.meteor/release', DEFAULT_RELEASE_TRACK + '@v1');
  run = s.run("--release", DEFAULT_RELEASE_TRACK + "@v1");
  await run.tellMongo(MONGO_LISTENING);
  run.waitSecs(10);
  await run.match('localhost:3000');
  s.write('.meteor/release', DEFAULT_RELEASE_TRACK + '@v2');
  s.write('empty.js', '');
  run.waitSecs(10);
  await run.match('restarted');
  run.waitSecs(10);
  await run.stop();
  run.forbidAll("updated");

  // Nor do we do it if you're running from a checkout
  s = new Sandbox({ fakeMongo: true });
  await s.init();

  await s.createApp("myapp", "standard-app");
  s.cd("myapp");

  s.write('.meteor/release', DEFAULT_RELEASE_TRACK + '@v1');
  run = s.run();
  await run.tellMongo(MONGO_LISTENING);
  run.waitSecs(10);
  await run.match('localhost:3000');
  run.waitSecs(10);
  s.write('.meteor/release', DEFAULT_RELEASE_TRACK + '@v2');
  s.write('empty.js', '');
  run.waitSecs(10);
  await run.match('restarted');
  run.waitSecs(10);
  await run.stop();
  run.forbidAll("updated");
});

selftest.define("run with mongo crash", ["checkout"], async function () {
  var s = new Sandbox({ fakeMongo: true });
  await s.init();

  var run;

  await s.createApp("myapp", "standard-app");
  s.cd("myapp");

  // Kill mongod three times.  See that it gives up and quits.
  run = s.run();
  await run.tellMongo(MONGO_LISTENING);
  run.waitSecs(2);
  await run.match('localhost:3000/\n');

  if (process.platform === "win32") {
    await run.match('Type Control-C twice to stop.\n\n');
  }

  await run.tellMongo({exit: 23});
  await run.read('Unexpected mongo exit code 23. Restarting.\n');
  await run.tellMongo({exit: 46});
  await run.read('Unexpected mongo exit code 46. Restarting.\n');
  await run.tellMongo({exit: 47});
  await run.read('Unexpected mongo exit code 47. Restarting.\n');
  await run.read("Can't start Mongo server.\n");
  await run.read("MongoDB exited due to excess clock skew\n");
  await run.expectEnd();
  await run.expectExit(254);

  // Now create a build failure. Make sure that killing mongod three times
  // *also* successfully quits even if we're waiting on file change.
  s.write('bad.css', '/*');
  run = s.run();
  await run.tellMongo(MONGO_LISTENING);
  run.waitSecs(2);
  await run.match("prevented startup");
  await run.match("file change.\n");
  await run.tellMongo({exit: 23});
  await run.match('Unexpected mongo exit code 23. Restarting.\n');
  await run.tellMongo({exit: 46});
  await run.read('Unexpected mongo exit code 46. Restarting.\n');
  await run.tellMongo({exit: 47});
  await run.read('Unexpected mongo exit code 47. Restarting.\n');
  await run.read("Can't start Mongo server.\n");
  await run.read("MongoDB exited due to excess clock skew\n");
  await run.expectEnd();
  await run.expectExit(254);
});

// Test that when the parent runner process is SIGKILLed, the child
// process exits also.
selftest.define("run and SIGKILL parent process", ["yet-unsolved-windows-failure"], async function () {
  var s = new Sandbox();
  await s.init();

  var run;

  await s.createApp("myapp", "app-prints-pid");
  s.cd("myapp");

  run = s.run();
  run.waitSecs(30);
  var match = await run.match(/My pid is (\d+)/);
  var childPid;
  if (! match || ! match[1]) {
    selftest.fail("No pid printed");
  }
  childPid = match[1];

  if (await !isReachable("localhost:3000")) {
    selftest.fail("Child process " + childPid + " already dead?");
  }

  process.kill(run.proc.pid, "SIGKILL");
  // This sleep should be a little more time than the interval at which
  // the child checks if the parent is still alive, in
  // packages/webapp/webapp_server.js.
  await utils.sleepMs(10000);

  // Send the child process a signal of 0. If there is no error, it
  // means that the process is still running, which is not what we
  // expect.
  if (await isReachable("localhost:3000")) {
    selftest.fail("Child process " + childPid + " is still running");
  }

  await run.stop();

  // Test that passing a bad pid in $METEOR_PARENT_PID logs an error and exits
  // immediately.
  s.set("METEOR_BAD_PARENT_PID_FOR_TEST", "t");
  run = s.run();
  run.waitSecs(120);
  await run.match("must be a valid process ID");
  await run.match("Your application is crashing");
  await run.stop();
});

selftest.define("'meteor run --port' accepts/rejects proper values", async function () {
  var s = new Sandbox();
  await s.init();

  var run;

  await s.createApp("myapp", "standard-app");
  s.cd("myapp");

  run = s.run("run", "--port", "example.com");
  run.waitSecs(30);
  await run.matchErr("--port must include a port");
  await run.expectExit(1);

  run = s.run("run", "--port", "http://example.com");
  run.waitSecs(30);
  await run.matchErr("--port must include a port");
  await run.expectExit(1);

  run = s.run("run", "--port", "3500");
  run.waitSecs(30);
  await run.match('App running at: http://localhost:3500/');
  await run.stop();

  run = s.run("run", "--port", "127.0.0.1:3500");
  run.waitSecs(30);
  await run.match('App running at: http://127.0.0.1:3500/');
  await run.stop();
});

// Regression test for #3582.  Previously, meteor run would ignore changes to
// .meteor/versions that originate outside of the process.
selftest.define("update package during run", async function () {
  var s = new Sandbox();
  await s.init();

  await s.createApp("myapp", "app-with-atmosphere-package");
  await s.cd("myapp", async function () {
    // The app starts with this package at 0.0.1 (based on its
    // .meteor/versions).  0.0.2 exists too.  (These are on the real atmosphere
    // server.)
    var listRun = s.run("list");
    listRun.waitSecs(3);
    await listRun.match(/glasser:package-for-selftest.*0.0.1\*/);
    await listRun.match(/\* New versions/);
    await listRun.expectExit(0);

    var runRun = s.run();
    runRun.waitSecs(3);
    await runRun.match("App running at:");

    var updateRun = s.run("update", "glasser:package-for-selftest");
    await updateRun.match(
        /glasser:package-for-selftest.*upgraded from 0.0.1 to 0.0.2/);
    await updateRun.expectExit(0);

    await runRun.match("restarted");

    listRun = s.run("list");
    // When #3582 existed, the `meteor run` would revert this back to 0.0.1
    // before it restarted.
    await listRun.match(/glasser:package-for-selftest.*0.0.2 /);
    await listRun.expectExit(0);

    await runRun.stop();
  });
});

selftest.define("run logging in order", async function () {
  var s = new Sandbox({ fakeMongo: true });
  await s.init();

  var run;

  // Starting a run
  await s.createApp("myapp", "standard-app");
  s.cd("myapp");
  s.write('packageless.js', `
    Meteor.startup(function() {
      for (var i = 0; i < 100000; i++) {
        console.log('line: ' + i + '.');
      }
    });
  `);
  run = s.run();
  await run.match("myapp");
  await run.match("proxy");
  await run.tellMongo(MONGO_LISTENING);
  await run.match("MongoDB");
  run.waitSecs(5);
  for (var i = 0; i < 100000; i++) {
    await run.match(`line: ${i}.`);
  }
});

selftest.define("run ROOT_URL must be an URL", async function () {
  var s = new Sandbox();
  await s.init();
  var run;

  s.set("ROOT_URL", "192.168.0.1");
  await s.createApp("myapp", "standard-app", { dontPrepareApp: true });
  s.cd("myapp");

  run = s.run();
  await run.matchErr("$ROOT_URL, if specified, must be an URL");
  await run.expectExit(1);
});

selftest.define("app starts when settings file has BOM", async function () {
  var s = new Sandbox({ fakeMongo: true });
  await s.init();

  var run;
  await s.createApp("myapp", "standard-app");
  s.cd("myapp");
  files.writeFile(
    files.pathJoin(s.cwd, "settings.json"),
    "\ufeff" + JSON.stringify({ foo: "bar" }),
  );
  run = s.run("--settings", "settings.json", "--once");
  await run.tellMongo(MONGO_LISTENING);
  run.forbid("Build failed");
});
