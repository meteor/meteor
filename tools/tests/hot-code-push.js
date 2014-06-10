var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;
var utils = require('../utils.js');
var Future = require('fibers/future');
var net = require('net');
var _ = require('underscore');
var files = require('../files.js');

selftest.define("css injection", function (options) {
  var s = new Sandbox({
    clients: options.clients,
  });

  s.createApp("myapp", "css-injection-test");
  s.cd("myapp");
  s.testWithAllClients(function (run) {
    run.baseTimeout = 20;
    run.match("myapp");
    run.match("proxy");
    run.match("MongoDB");
    run.match("running at");
    run.match("localhost");

    run.connectClient();

    run.waitSecs(20);
    run.match("client connected");

    // 'numCssChanges' variable is set to 0 on a client refresh.
    // Since CSS changes should not trigger a client refresh, numCssChanges
    // should never reset.

    // The css file is initially empty.
    run.match("numCssChanges: 0");
    run.match("css: \n");

    // The server restarts if a new css file is added.
    s.write("test.css", "body { background-color: red; }");
    run.match("server restarted");
    run.match("numCssChanges: 1");
    run.match("css: body { background-color: red; }");

    s.write("test.css", "body { background-color: orange; }");
    run.match("refreshing");
    run.match("numCssChanges: 2");
    run.match("css: body { background-color: orange; }");

    // The server restarts if a css file is removed.
    s.unlink("test.css");
    run.match("server restarted");
    run.match("numCssChanges: 3");
    run.match("css: \n");
    run.stop();
  });
});

selftest.define("javascript hot code push", function (options) {
  var s = new Sandbox({
    clients: options.clients,
  });

  s.createApp("myapp", "hot-code-push-test");
  s.cd("myapp");
  s.testWithAllClients(function (run) {
    run.baseTimeout = 20;
    run.match("myapp");
    run.match("proxy");
    run.match("MongoDB");
    run.match("running at");
    run.match("localhost");

    run.connectClient();
    run.waitSecs(20);

    // There is initially no JavaScript file.
    run.match("client connected: 0");
    run.match("jsVar: undefined");

    // The server and client both restart if a shared js file is added
    // or removed.
    s.write("test.js", "jsVar = 'foo'");
    run.match("server restarted");
    run.match("client connected: 0");
    run.match("jsVar: foo");

    s.unlink("test.js");
    run.match("server restarted");
    run.match("client connected: 0");
    run.match("jsVar: undefined");

    // Only the client should refresh if a client js file is added. Thus,
    // "client connected" variable will be incremented.
    s.write("client/test.js", "jsVar = 'bar'");
    run.match("client connected: 1");
    run.match("jsVar: bar");

    s.unlink("client/test.js");
    run.match("client connected: 2");
    run.match("jsVar: undefined");

    // When we change a server file the client should not refresh. We observe
    // this by changing a server file and then a client file and verifying
    // that the client has only connected once.
    s.write("server/test.js", "jsVar = 'bar'");
    run.match("server restarted");
    s.write("client/empty.js", "");
    run.match("client connected: 0");
    run.match("jsVar: undefined"); // cannot access a server variable from the client.

    s.unlink("server/test.js");
    run.match("server restarted");
    s.unlink("client/empty.js");
    run.match("client connected: 0");
    run.match("jsVar: undefined");

    // Add appcache and ensure that the browser still reloads.
    s.write(".meteor/packages", "standard-app-packages \n appcache");
    run.match("added appcache");
    run.match("server restarted");
    run.match("client connected: 0");
    run.match("jsVar: undefined");

    s.write("client/test.js", "jsVar = 'bar'");
    run.match("client connected: 1");
    run.match("jsVar: bar");

    // Remove appcache and ensure that the browser still reloads.
    s.write(".meteor/packages", "standard-app-packages");
    run.match("removed");
    run.match("appcache");
    run.match("server restarted");
    run.match("client connected: 0");
    run.match("jsVar: bar");

    s.write("client/test.js", "jsVar = 'baz'");
    run.match("client connected: 1");
    run.match("jsVar: baz");
    s.unlink("client/test.js");

    run.stop();
  });
});
