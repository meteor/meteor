const selftest = require("../tool-testing/selftest.js");
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
