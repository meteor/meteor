const selftest = require("../tool-testing/selftest.js");
const { sleepMs } = require("../utils/utils.js");
const Sandbox = selftest.Sandbox;

selftest.define(".meteorignore", async function () {
  const s = new Sandbox();
  await s.init();

  await s.createApp("myapp", "meteor-ignore");
  s.cd("myapp");

  let run = s.run();
  run.waitSecs(30);
  await run.match("/a.js");
  await run.match("/b.js");
  await run.match("/lib/e.js");
  await run.match("/lib/f.js");
  await run.match("/main.js");
  await run.match("/server/c.js");
  await run.match("/server/d.js");
  await run.match("App running at");

  // The serverWatcher is constructed with `async: true` (run-app.js), so
  // ParcelWatcher.subscribe() is still completing asynchronously when
  // "App running at" is logged. On slower CI filesystems the create event
  // for the file we're about to write can land before the subscription
  // is active and be lost — leaving the optimistic cache convinced the
  // file still doesn't exist. Match the established hot-code-push.js
  // pattern and let the watcher settle before the first mutation.
  await sleepMs(10000);

  s.write("server/.meteorignore", "c.*");
  run.waitSecs(10);
  await run.match("/a.js");
  await run.match("/b.js");
  await run.match("/lib/e.js");
  await run.match("/lib/f.js");
  await run.match("/main.js");
  await run.match("/server/d.js");
  await run.match("restarted");

  s.write(".meteorignore", "server/d.js");
  run.waitSecs(10);
  await run.match("/a.js");
  await run.match("/b.js");
  await run.match("/lib/e.js");
  await run.match("/lib/f.js");
  await run.match("/main.js");
  await run.match("restarted");

  s.write("lib/.meteorignore", "*.js\n!e.*");
  run.waitSecs(10);
  await run.match("/a.js");
  await run.match("/b.js");
  await run.match("/lib/e.js");
  await run.match("/main.js");
  await run.match("restarted");

  s.write(".meteorignore", "lib/**");
  run.waitSecs(10);
  await run.match("/a.js");
  await run.match("/b.js");
  await run.match("/main.js");
  await run.match("/server/d.js");
  await run.match("restarted");

  s.write(".meteorignore", "/*.js\nlib");
  run.waitSecs(10);
  await run.match("/server/d.js");
  await run.match("restarted");

  s.unlink(".meteorignore");
  s.unlink("lib/.meteorignore");
  s.unlink("server/.meteorignore");
  run.waitSecs(10);
  await run.match("/a.js");
  await run.match("/b.js");
  await run.match("/lib/e.js");
  await run.match("/lib/f.js");
  await run.match("/main.js");
  await run.match("/server/c.js");
  await run.match("/server/d.js");
  await run.match("restarted");

  await run.stop();
});
