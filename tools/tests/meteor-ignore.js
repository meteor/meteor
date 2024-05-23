const selftest = require("../tool-testing/selftest.js");
const Sandbox = selftest.Sandbox;

selftest.define(".meteorignore", function () {
  const s = new Sandbox();

  s.createApp("myapp", "meteor-ignore");
  s.cd("myapp");

  let run = s.run();
  run.waitSecs(30);
  run.match("/a.js");
  run.match("/b.js");
  run.match("/lib/e.js");
  run.match("/lib/f.js");
  run.match("/main.js");
  run.match("/server/c.js");
  run.match("/server/d.js");
  run.match("App running at");

  s.write("server/.meteorignore", "c.*");
  run.waitSecs(10);
  run.match("/a.js");
  run.match("/b.js");
  run.match("/lib/e.js");
  run.match("/lib/f.js");
  run.match("/main.js");
  run.match("/server/d.js");
  run.match("restarted");

  s.write(".meteorignore", "server/d.js");
  run.waitSecs(10);
  run.match("/a.js");
  run.match("/b.js");
  run.match("/lib/e.js");
  run.match("/lib/f.js");
  run.match("/main.js");
  run.match("restarted");

  s.write("lib/.meteorignore", "*.js\n!e.*");
  run.waitSecs(10);
  run.match("/a.js");
  run.match("/b.js");
  run.match("/lib/e.js");
  run.match("/main.js");
  run.match("restarted");

  s.write(".meteorignore", "lib/**");
  run.waitSecs(10);
  run.match("/a.js");
  run.match("/b.js");
  run.match("/main.js");
  run.match("/server/d.js");
  run.match("restarted");

  s.write(".meteorignore", "/*.js\nlib");
  run.waitSecs(10);
  run.match("/server/d.js");
  run.match("restarted");

  s.unlink(".meteorignore");
  s.unlink("lib/.meteorignore");
  s.unlink("server/.meteorignore");
  run.waitSecs(10);
  run.match("/a.js");
  run.match("/b.js");
  run.match("/lib/e.js");
  run.match("/lib/f.js");
  run.match("/main.js");
  run.match("/server/c.js");
  run.match("/server/d.js");
  run.match("restarted");

  run.stop();
});
