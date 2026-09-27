const selftest = require("../tool-testing/selftest.js");
const Sandbox = selftest.Sandbox;

selftest.define(".meteorignore - root and legacy environment patterns", async function () {
  const s = new Sandbox();
  await s.init();
  await s.createApp("myapp", "meteor-ignore");
  s.cd("myapp");
  s.set("METEOR_IGNORE_ROOT", "test/** /*.hidden.js **/node_modules/**");
  s.set("METEOR_IGNORE", "legacy/** /*.legacy.js");

  s.mkdir("test");
  s.mkdir("_build");
  s.mkdir("_build/test");
  s.mkdir("legacy");
  s.mkdir("_build/test/legacy");
  s.mkdir("_build/test/node_modules");
  s.mkdir("_build/test/node_modules/ignore-scope-dependency");
  s.write("test/excluded.js", 'throw new Error("root test directory was not ignored");');
  s.write("root.hidden.js", 'throw new Error("root anchored pattern was not applied");');
  s.write("_build/test/included.js", 'require("/imports/registry.js").add(module.id);');
  s.write("_build/test/nested.hidden.js", 'require("/imports/registry.js").add(module.id);');
  s.write("_build/test/ignored.js", 'throw new Error("nested meteorignore was not applied");');
  s.write("_build/test/.meteorignore", "ignored.js\n");
  s.write("legacy/excluded.js", 'throw new Error("root legacy pattern was not applied");');
  s.write("_build/test/legacy/excluded.js", 'throw new Error("nested legacy pattern was not applied");');
  s.write("root.legacy.js", 'throw new Error("root anchored legacy pattern was not applied");');
  s.write("_build/test/nested.legacy.js", 'throw new Error("nested anchored legacy pattern was not applied");');
  s.write("_build/test/node_modules/ignore-scope-dependency/package.json",
    JSON.stringify({ name: "ignore-scope-dependency", version: "1.0.0", main: "index.js" }));
  s.write("_build/test/node_modules/ignore-scope-dependency/index.js", 'exports.value = "nested dependency";');
  s.write("_build/test/node_modules/ignore-scope-dependency/excluded.jsx", "this is not valid JavaScript {{");
  s.write("_build/test/uses-dependency.js", [
    'if (require("ignore-scope-dependency").value !== "nested dependency") throw new Error("nested dependency was not resolved");',
    'require("/imports/registry.js").add(module.id);',
  ].join("\n"));

  const run = s.run();
  run.waitSecs(30);
  await run.match("/_build/test/included.js");
  await run.match("/_build/test/nested.hidden.js");
  await run.match("/_build/test/uses-dependency.js");
  await run.match("App running at");
  await run.stop();
});

selftest.define(".meteorignore", async function () {
  const s = new Sandbox();
  await s.init();
  // Recursive native watches can miss a .meteorignore mutation before their
  // subscription is ready on a busy Linux CI host. Polling observes the mtime
  // reliably, and this test already permits a ten-second rebuild window.
  s.set("METEOR_WATCH_FORCE_POLLING", "true");

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
