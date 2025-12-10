var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("reset - clean cache vs database", async function () {
  var s = new Sandbox();
  await s.init();

  function shouldIncludeDb(sandbox, only) {
    var cacheFiles = sandbox.readDir('.meteor/local');
    if (!cacheFiles) return false;
    if (!only) return cacheFiles.includes('db');
    return cacheFiles.length === 1 && cacheFiles.includes('db');
  }

  var run;

  await s.createApp("myresetapp", "standard-app");
  s.cd("myresetapp");
  selftest.expectTrue(!shouldIncludeDb(s));

  run = s.run("run");
  await run.read("=> Started MongoDB", false);
  selftest.expectTrue(shouldIncludeDb(s));
  await run.stop();

  run = s.run("reset");
  run.waitSecs(5);
  await run.expectExit(0);
  selftest.expectTrue(shouldIncludeDb(s, true));

  run = s.run("reset", "--db");
  run.waitSecs(5);
  await run.expectExit(0);
  selftest.expectTrue(!shouldIncludeDb(s));
});
