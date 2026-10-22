var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
var utils = require('../utils/utils.js');

selftest.define("css hot code push", async function (options) {
  var s = new Sandbox({
    clients: options.clients
  });
  await s.init();

  s.set("METEOR_WATCH_PRIORITIZE_CHANGED", "false");

  await s.createApp("myapp", "css-injection-test");
  s.cd("myapp");
  await s.testWithAllClients(async function (run) {
    await run.match("myapp");
    await run.match("proxy");
    await run.match("running at");
    await run.match("localhost");

    run.connectClient();

    run.waitSecs(4800);
    await run.match("client connected");

    // 'numCssChanges' variable is set to 0 on a client refresh.
    // Since CSS changes should not trigger a client refresh, numCssChanges
    // should never reset.

    // The css file is initially empty.
    await run.match("numCssChanges: 0");

    // Some browsers represent no background as 'transparent', others use
    // rgba(0, 0, 0, 0).
    await run.match(/background-color: (transparent|rgba\(0, 0, 0, 0\))/);

    // The server does NOT restart if a new css file is added.
    s.write("test.css", "body { background-color: red; }");
    run.waitSecs(50);
    await run.match("Client modified -- refreshing");
    await run.match("numCssChanges: 1");
    await run.match(/background-color: (red|rgb\(255, 0, 0\))/);

    s.write("test.css", "body { background-color: blue; }");
    await run.match("Client modified -- refreshing");
    await run.match("numCssChanges: 2");
    await run.match(/background-color: (blue|rgb\(0, 0, 255\))/);

    // The server does NOT restart if a css file is removed.
    s.unlink("test.css");
    await run.match("Client modified -- refreshing");
    await run.match("numCssChanges: 3");
    await run.match(/background-color: (transparent|rgba\(0, 0, 0, 0\))/);

    s.write(".meteor/packages", `meteor-base
jquery
my-package`);
    await run.match(/my-package.*added,/);
    await run.match("client connected");
    run.waitSecs(45);
    await run.match("numCssChanges: 0");

    s.write("packages/my-package/foo.css", "body { background-color: blue; }");
    await run.match("numCssChanges: 1");
    await run.match(/background-color: (blue|rgb\(0, 0, 255\))/);

    // Add appcache and ensure that the browser still reloads.
    s.write(".meteor/packages", `meteor-base
jquery
my-package
appcache`);
    await run.match(/appcache.*added,/);
    await run.match("server restarted");
    await run.match("numCssChanges: 0");
    await run.match(/background-color: (blue|rgb\(0, 0, 255\))/);
    run.waitSecs(30);

    s.write("packages/my-package/foo.css", "body { background-color: red; }");
    await run.match("Client modified -- refreshing");
    await run.match("numCssChanges: 1");
    await run.match(/background-color: (red|rgb\(255, 0, 0\))/);
    run.waitSecs(20);

    // XXX: Remove me.  This shouldn't be needed, but sometimes
    // if we run too quickly on fast (or Linux?) machines, it looks
    // like there's a race and we see a weird state
    utils.sleepMs(10000);

    s.write(".meteor/packages", `meteor-base
jquery`);
    await run.match(/my-package.*removed from your project/);
    await run.match("numCssChanges: 0");
    await run.match(/background-color: (transparent|rgba\(0, 0, 0, 0\))/);
    run.waitSecs(30);

    await run.stop();
  },{
    testName: 'css hot code push',
    testFile: 'hot-code-push.js' });
});

selftest.define("versioning hot code push", async function (options) {
  var s = new Sandbox({
    clients: options.clients,
  });
  await s.init();

  s.set("AUTOUPDATE_VERSION", "1.0");
  await s.createApp("myapp", "hot-code-push-test");
  await s.cd("myapp");

  await s.testWithAllClients(async function (run) {
    await run.match("myapp");
    await run.match("proxy");
    await run.match("running at");
    await run.match("localhost");
    run.connectClient();
    run.waitSecs(4800);

    await run.match("client connected: 0");

    run.forbidAll("Error listening");

    await run.stop();
  },{
    testName: 'versioning hot code push',
    testFile: 'hot-code-push.js' });
});

selftest.define("javascript hot code push", async function (options) {
  var s = new Sandbox({
    clients: options.clients
  });
  await s.init();

  await s.createApp("myapp", "hot-code-push-test");
  s.cd("myapp");
  await s.testWithAllClients(async function (run) {
    await run.match("myapp");
    await run.match("proxy");
    await run.match("running at");
    await run.match("localhost");

    run.connectClient();
    run.waitSecs(150);

    // There is initially no JavaScript file.
    await run.match("client connected: 0");
    await run.match("jsVar: undefined");
    await run.match("sessionVar: null");

    // The server and client both restart if a shared js file is added
    // or removed.
    s.write("test.js", "jsVar = 'foo'");
    await run.match("server restarted");
    await run.match("client connected: 0");
    await run.match("jsVar: foo");
    await run.match("sessionVar: true");

    s.unlink("test.js");
    await run.match("server restarted");
    await run.match("client connected: 0");
    await run.match("jsVar: undefined");


    // Only the client should refresh if a client js file is added. Thus,
    // "client connected" variable will be incremented.
    s.mkdir("client");

    s.write("client/test.js", "jsVar = 'bar'");
    await run.match("client connected: 1");
    await run.match("jsVar: bar");

    s.unlink("client/test.js");
    await run.match("client connected: 2");
    await run.match("jsVar: undefined");

    // When we change a server file the client should not refresh. We observe
    // this by changing a server file and then a client file and verifying
    // that the client has only connected once.
    s.mkdir("server");
    s.write("server/test.js", "jsVar = 'bar'");
    await run.match("server restarted");

    s.write("client/empty.js", "");
    await run.match("client connected: 0");
    // We should not be able to access a server variable from the client.
    await run.match("jsVar: undefined");

    s.unlink("client/empty.js");
    run.waitSecs(5);
    await run.match("client connected: 1");
    await run.match("jsVar: undefined");

    // Break the HTML file. This should kill the server, and print errors.
    // (It would be reasonable behavior for this to NOT kill the server, since
    // it only affects the client. But this is a regression test for a bug where
    // fixing the HTML file wouldn't actually restart the server; that's the
    // important part of this test.)
    s.write("hot-code-push-test.html", ">");
    await run.match("Errors prevented startup");
    await run.match("Expected one of: <body>, <head>, <template>");
    // Fix it. It should notice, and restart. The client will restart too.
    s.write("hot-code-push-test.html", "");
    await run.match("server restarted");
    await run.match("client connected: 0");
    // Write something else to it. The client should restart.
    s.write("hot-code-push-test.html", "<head><title>foo</title></head>");
    await run.match("Client modified -- refreshing");
    await run.match("client connected: 1");
    await run.match("jsVar: undefined");

    s.write(".meteor/packages", `meteor-base
session
my-package`);
    await run.match(/my-package.*added,/);
    await run.match("server restarted");
    await run.match("client connected: 0");
    await run.match("jsVar: undefined");
    await run.match("packageVar: foo");

    s.write("packages/my-package/foo.js", "packageVar = 'bar'");
    await run.match("client connected: 0");
    await run.match("jsVar: undefined");
    await run.match("packageVar: bar");

    // Ensure we set back to foo for subsequent runs
    s.write("packages/my-package/foo.js", "packageVar = 'foo'");

    // Add appcache and ensure that the browser still reloads.
    s.write(".meteor/packages", `meteor-base
session
appcache`);
    await run.match(/appcache.*added,/);
    await run.match("server restarted");
    await run.match("client connected: 0");
    await run.match("jsVar: undefined");

    // XXX: Remove me.  This shouldn't be needed, but sometimes if we run too
    // quickly on fast (or Linux?) machines, it looks like there's a race and we
    // see a weird state. Without this line this test was failing one time on
    // every build in CircleCI, but oddly enough would succeed on the second
    // try.
    await utils.sleepMs(10000);

    s.write("client/test.js", "jsVar = 'bar'");
    run.waitSecs(20);
    await run.match("client connected: 1");
    await run.match("jsVar: bar");

    // Remove appcache and ensure that the browser still reloads.
    s.write(".meteor/packages", `meteor-base
    static-html
session`);
    await run.match(/appcache.*removed from your project/);
    await run.match("server restarted");
    await run.match("client connected: 0");

    s.write("client/test.js", "jsVar = 'baz'");
    await run.match("client connected: 1");
    await run.match("jsVar: baz");

    s.unlink("client/test.js");
    await run.match("client connected: 2");
    await run.match("jsVar: undefined");

    s.write("server/test.js", 'console.log("DONE");');
    await run.match("DONE");
    await run.match("server restarted");

    await run.stop();
  },{
    testName: 'javascript hot code push',
    testFile: 'hot-code-push.js' });
});
