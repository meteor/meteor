var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;
var utils = require('../utils.js');

selftest.define("css hot code push", function (options) {
  var s = new Sandbox({
    clients: options.clients
  });

  s.createApp("myapp", "css-injection-test");
  s.cd("myapp");
  s.testWithAllClients(function (run) {
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

    // Some browsers represent no background as 'transparent', others use
    // rgba(0, 0, 0, 0).
    run.match(/background-color: (transparent|rgba\(0, 0, 0, 0\))/);

    // The server does NOT restart if a new css file is added.
    s.write("test.css", "body { background-color: red; }");
    run.waitSecs(30);
    run.match("Client modified -- refreshing");
    run.match("numCssChanges: 1");
    run.match(/background-color: (red|rgb\(255, 0, 0\))/);

    s.write("test.css", "body { background-color: blue; }");
    run.match("Client modified -- refreshing");
    run.match("numCssChanges: 2");
    run.match(/background-color: (blue|rgb\(0, 0, 255\))/);

    // The server does NOT restart if a css file is removed.
    s.unlink("test.css");
    run.match("Client modified -- refreshing");
    run.match("numCssChanges: 3");
    run.match(/background-color: (transparent|rgba\(0, 0, 0, 0\))/);

    s.write(".meteor/packages", "standard-app-packages \n my-package");
    run.match(/my-package.*added,/);
    run.match("client connected");
    run.match("numCssChanges: 0");

    s.write("packages/my-package/foo.css", "body { background-color: blue; }");
    run.match("numCssChanges: 1");
    run.match(/background-color: (blue|rgb\(0, 0, 255\))/);

    // Add appcache and ensure that the browser still reloads.
    s.write(".meteor/packages", "standard-app-packages \n my-package \n appcache");
    run.match(/appcache.*added,/);
    run.match("server restarted");
    run.match("numCssChanges: 0");
    run.match(/background-color: (blue|rgb\(0, 0, 255\))/);

    s.write("packages/my-package/foo.css", "body { background-color: red; }");
    run.match("Client modified -- refreshing");
    run.match("numCssChanges: 1");
    run.match(/background-color: (red|rgb\(255, 0, 0\))/);

    // XXX: Remove me.  This shouldn't be needed, but sometimes
    // if we run too quickly on fast (or Linux?) machines, it looks
    // like there's a race and we see a weird state
    utils.sleepMs(10000);

    s.write(".meteor/packages", "standard-app-packages");
    run.match(/my-package.*removed from your project/);
    run.match("numCssChanges: 0");
    run.match(/background-color: (transparent|rgba\(0, 0, 0, 0\))/);

    run.stop();
  });
});

selftest.define("versioning hot code push", function (options) {
  var s = new Sandbox();

  s.set("AUTOUPDATE_VERSION", "1.0");
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

    run.match("client connected: 0");

    run.forbidAll("Error listening");

    run.stop();
  });
});

selftest.define("javascript hot code push", function (options) {
  var s = new Sandbox({
    clients: options.clients
  });

  s.createApp("myapp", "hot-code-push-test");
  s.cd("myapp");
  s.testWithAllClients(function (run) {
    run.match("myapp");
    run.match("proxy");
    run.match("MongoDB");
    run.match("running at");
    run.match("localhost");

    run.connectClient();
    run.waitSecs(40);

    // There is initially no JavaScript file.
    run.match("client connected: 0");
    run.match("jsVar: undefined");
    run.match("sessionVar: null");

    // The server and client both restart if a shared js file is added
    // or removed.
    s.write("test.js", "jsVar = 'foo'");
    run.match("server restarted");
    run.match("client connected: 0");
    run.match("jsVar: foo");
    run.match("sessionVar: true");

    s.unlink("test.js");
    run.match("server restarted");
    run.match("client connected: 0");
    run.match("jsVar: undefined");


    // Only the client should refresh if a client js file is added. Thus,
    // "client connected" variable will be incremented.
    s.mkdir("client");

    s.write("client/test.js", "jsVar = 'bar'");
    run.match("client connected: 1");
    run.match("jsVar: bar");

    s.unlink("client/test.js");
    run.match("client connected: 2");
    run.match("jsVar: undefined");

    // When we change a server file the client should not refresh. We observe
    // this by changing a server file and then a client file and verifying
    // that the client has only connected once.
    s.mkdir("server");
    s.write("server/test.js", "jsVar = 'bar'");
    run.match("server restarted");

    s.write("client/empty.js", "");
    run.match("client connected: 0");
    // We should not be able to access a server variable from the client.
    run.match("jsVar: undefined");

    s.unlink("client/empty.js");
    run.waitSecs(5);
    run.match("client connected: 1");
    run.match("jsVar: undefined");

    // Break the HTML file. This should kill the server, and print errors.
    // (It would be reasonable behavior for this to NOT kill the server, since
    // it only affects the client. But this is a regression test for a bug where
    // fixing the HTML file wouldn't actually restart the server; that's the
    // important part of this test.)
    s.write("hot-code-push-test.html", ">");
    run.match("Errors prevented startup");
    run.match("bad formatting in HTML template");
    // Fix it. It should notice, and restart. The client will restart too.
    s.write("hot-code-push-test.html", "");
    run.match("server restarted");
    run.match("client connected: 0");
    // Write something else to it. The client should restart.
    s.write("hot-code-push-test.html", "<head><title>foo</title></head>");
    run.match("Client modified -- refreshing");
    run.match("client connected: 1");
    run.match("jsVar: undefined");

    s.write(".meteor/packages", "standard-app-packages \n my-package");
    run.match(/my-package.*added,/);
    run.match("server restarted");
    run.match("client connected: 0");
    run.match("jsVar: undefined");
    run.match("packageVar: foo");

    s.write("packages/my-package/foo.js", "packageVar = 'bar'");
    run.match("client connected: 1");
    run.match("jsVar: undefined");
    run.match("packageVar: bar");

    // Add appcache and ensure that the browser still reloads.
    s.write(".meteor/packages", "standard-app-packages \n appcache");
    run.match(/appcache.*added,/);
    run.match("server restarted");
    run.match("client connected: 0");
    run.match("jsVar: undefined");

    // XXX: Remove me.  This shouldn't be needed, but sometimes
    // if we run too quickly on fast (or Linux?) machines, it looks
    // like there's a race and we see a weird state
    utils.sleepMs(10000);

    s.write("client/test.js", "jsVar = 'bar'");
    run.match("client connected: 1");
    run.match("jsVar: bar");

    // Remove appcache and ensure that the browser still reloads.
    s.write(".meteor/packages", "standard-app-packages");
    run.match(/appcache.*removed from your project/);
    run.match("server restarted");
    run.match("client connected: 0");

    s.write("client/test.js", "jsVar = 'baz'");
    run.match("client connected: 1");
    run.match("jsVar: baz");

    s.unlink("client/test.js");

    // Setting the autoupdateVersion to a different string should also
    // force the client to restart.
    s.write("server/test.js",
            "Package.autoupdate.Autoupdate.autoupdateVersion = 'random'");
    run.match("server restarted");
    run.match("client connected: 0");
    run.match("jsVar: undefined");

    s.unlink("server/test.js");
    run.match("server restarted");

    run.stop();
  });
});
