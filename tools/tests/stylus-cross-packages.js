var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("can import stylus across packages", async function (options) {
  var s = new Sandbox({
    clients: options.clients
  });
  await s.init();

  await s.createApp("myapp", "app-using-stylus");
  s.cd("myapp");
  await s.testWithAllClients(async function (run) {
    await run.match("myapp");
    await run.match("proxy");
    await run.match("running at");
    await run.match("localhost");

    run.connectClient();
    run.waitSecs(40);

    await run.match("true");
    await run.match("true");
    await run.match("true");
    await run.match("true");
    await run.match("true");

    await run.stop();
  },{
    testName: 'can import stylus across packages',
    testFile: 'stylus-cross-packages.js' });
});
