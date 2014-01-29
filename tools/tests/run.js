var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("x", function () {
  var s = new Sandbox({ fakeMongo: true });

  s.createApp("myapp", "empty");
  s.cd("myapp");

  var run = s.run();
  run.match('');
  run.tellMongo({ stdout: " [initandlisten] waiting for connections on port" });
  run.tellMongo({ exit: 99 });
  run.waitSecs(0);
  run.expectExit(123);
  run.stop();
});
