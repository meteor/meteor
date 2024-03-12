var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

var MONGO_LISTENING =
  { stdout: " [initandlisten] waiting for connections on port" };

selftest.define("ddp-heartbeat", async function () {
  var s = new Sandbox({ fakeMongo: true });
  await s.init();

  var run;

  await s.createApp("ddpapp", "ddp-heartbeat");
  s.cd("ddpapp");

  var run = s.run("--once", "--raw-logs");
  await run.tellMongo(MONGO_LISTENING);
  run.waitSecs(120);
  await run.expectExit(0);
});
