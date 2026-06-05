var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
var catalog = require('../packaging/catalog/catalog.js');

var DEFAULT_RELEASE_TRACK = catalog.DEFAULT_TRACK;

var MONGO_LISTENING =
  { stdout: " [initandlisten] waiting for connections on port" };

var SIMPLE_WAREHOUSE = {
  v1: { },
  v2: { recommended: true },
  v3: { }
};

selftest.define("update during run", ["checkout", 'custom-warehouse'], async function () {
  var s = new Sandbox({
    warehouse: SIMPLE_WAREHOUSE,
    fakeMongo: true
  });
  await s.init();

  var run;

  s.set("METEOR_WATCH_PRIORITIZE_CHANGED", "false");

  await s.createApp("myapp", "packageless", { release: DEFAULT_RELEASE_TRACK + '@v1' });
  s.cd("myapp");

  // If the app version changes, we exit with an error message.
  run = s.run();
  await run.tellMongo(MONGO_LISTENING);
  run.waitSecs(10);
  await run.match('localhost:3000');
  s.write('.meteor/release', DEFAULT_RELEASE_TRACK + '@v2');
  await run.matchErr('to Meteor v2 from Meteor v1');
  run.waitSecs(10);
  await run.expectExit(254);

  // But not if the release was forced (case 1)
  s.write('.meteor/release', DEFAULT_RELEASE_TRACK + '@v1');
  run = s.run("--release", DEFAULT_RELEASE_TRACK + "@v3");
  await run.tellMongo(MONGO_LISTENING);
  run.waitSecs(2);
  await run.match('localhost:3000');
  s.write('.meteor/release', DEFAULT_RELEASE_TRACK + '@v2');
  s.write('empty.js', '');
  run.waitSecs(10);
  await run.match('restarted');
  run.waitSecs(10);
  await run.stop();
  run.forbidAll("updated");

  // But not if the release was forced (case 2)
  s.write('.meteor/release', DEFAULT_RELEASE_TRACK + '@v1');
  run = s.run("--release", DEFAULT_RELEASE_TRACK + "@v1");
  await run.tellMongo(MONGO_LISTENING);
  run.waitSecs(10);
  await run.match('localhost:3000');
  s.write('.meteor/release', DEFAULT_RELEASE_TRACK + '@v2');
  s.write('empty.js', '');
  run.waitSecs(10);
  await run.match('restarted');
  run.waitSecs(10);
  await run.stop();
  run.forbidAll("updated");

  // Nor do we do it if you're running from a checkout
  s = new Sandbox({ fakeMongo: true });
  await s.init();

  await s.createApp("myapp", "standard-app");
  s.cd("myapp");

  s.write('.meteor/release', DEFAULT_RELEASE_TRACK + '@v1');
  run = s.run();
  await run.tellMongo(MONGO_LISTENING);
  run.waitSecs(10);
  await run.match('localhost:3000');
  run.waitSecs(10);
  s.write('.meteor/release', DEFAULT_RELEASE_TRACK + '@v2');
  s.write('empty.js', '');
  run.waitSecs(10);
  await run.match('restarted');
  run.waitSecs(10);
  await run.stop();
  run.forbidAll("updated");
});

// Regression test for #3582.  Previously, meteor run would ignore changes to
// .meteor/versions that originate outside of the process.
selftest.define("update package during run", async function () {
  var s = new Sandbox();
  await s.init();

  await s.createApp("myapp", "app-with-atmosphere-package");
  await s.cd("myapp", async function () {
    // The app starts with this package at 0.0.1 (based on its
    // .meteor/versions).  0.0.2 exists too.  (These are on the real atmosphere
    // server.)
    var listRun = s.run("list");
    listRun.waitSecs(3);
    await listRun.match(/glasser:package-for-selftest.*0.0.1\*/);
    await listRun.match(/\* New versions/);
    await listRun.expectExit(0);

    var runRun = s.run();
    runRun.waitSecs(3);
    await runRun.match("App running at");

    var updateRun = s.run("update", "glasser:package-for-selftest");
    await updateRun.match(
        /glasser:package-for-selftest.*upgraded from 0.0.1 to 0.0.2/);
    await updateRun.expectExit(0);

    await runRun.match("restarted");

    listRun = s.run("list");
    // When #3582 existed, the `meteor run` would revert this back to 0.0.1
    // before it restarted.
    await listRun.match(/glasser:package-for-selftest.*0.0.2 /);
    await listRun.expectExit(0);

    await runRun.stop();
  });
});
