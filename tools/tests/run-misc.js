var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
var utils = require('../utils/utils.js');
var isReachable = require("is-reachable");
var httpHelpers = require('../utils/http-helpers.js');

var MONGO_LISTENING =
  { stdout: " [initandlisten] waiting for connections on port" };

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

// Test that when the parent runner process is SIGKILLed, the child
// process exits also.
selftest.define("run and SIGKILL parent process", ["yet-unsolved-windows-failure"], async function () {
  var s = new Sandbox();
  await s.init();

  var run;

  await s.createApp("myapp", "app-prints-pid");
  s.cd("myapp");

  run = s.run("run", "--timestamps");
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
  run = s.run("run", "--timestamps");

  run.waitSecs(120);
  await run.match("must be a valid process ID");
  await run.match("Your application is crashing");
  await run.stop();
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
