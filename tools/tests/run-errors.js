var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
var utils = require('../utils/utils.js');
var net = require('net');

var MONGO_LISTENING =
  { stdout: " [initandlisten] waiting for connections on port" };

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
  await run.match('App running at http://localhost:3500/');
  await run.stop();

  run = s.run("run", "--port", "127.0.0.1:3500");
  run.waitSecs(30);
  await run.match('App running at http://127.0.0.1:3500/');
  await run.stop();
});
