var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

var MONGO_LISTENING =
  { stdout: " [initandlisten] waiting for connections on port" };

selftest.define("ddp-heartbeat", function () {
  var s = new Sandbox({ fakeMongo: true });
  var run;

  s.createApp("ddpapp", "ddp-heartbeat");
  s.cd("ddpapp");

  var run = s.run("--once", "--raw-logs");
  run.tellMongo(MONGO_LISTENING);
  run.waitSecs(120);
  run.expectExit(0);
});
