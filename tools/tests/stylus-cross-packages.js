var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;
var utils = require('../utils.js');

selftest.define("can import stylus across packages", function (options) {
  var s = new Sandbox({
    clients: options.clients
  });

  s.createApp("myapp", "app-using-stylus");
  s.cd("myapp");
  s.testWithAllClients(function (run) {
    run.match("myapp");
    run.match("proxy");
    run.match("MongoDB");
    run.match("running at");
    run.match("localhost");

    run.connectClient();
    run.waitSecs(40);

    run.match("true");
    run.match("true");
    run.match("true");
    run.match("true");
    run.match("true");

    run.stop();
  });
});
