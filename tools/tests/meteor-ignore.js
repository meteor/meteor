const selftest = require("../tool-testing/selftest.js");
const Sandbox = selftest.Sandbox;

selftest.define(".meteorignore", async function () {
  const s = new Sandbox();
  await s.init();

  // Force fs.watchFile-based polling (safe-watcher.ts:111). The test writes
  // a file the millisecond after the app reports "App running at", and
  // @parcel/watcher's recursive subscription on Linux is both async-init
  // and prone to silently dropping events on inotify queue overflow
  // (safe-watcher.ts:312-314) — under those failure modes the optimistic
  // cache stays convinced the .meteorignore doesn't exist and no rebuild
  // ever fires. Polling is slower (500ms tick) but observes real mtimes
  // and is reliable across CI hosts. The cost is invisible here since
  // the test already tolerates 10s+ waits between mutations.
  s.set("METEOR_WATCH_FORCE_POLLING", "t");

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
