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
  s.write("_build/test/.meteorignore", "ignored.js\n");

  const filesToLoad = [
    // Root-scoped test/** only excludes the app's top-level test/ contents.
    "_build/test/included.js",
    // Root-scoped /*.hidden.js only excludes files at the app root.
    "_build/test/nested.hidden.js",
  ];
  const filesToIgnore = [
    // METEOR_IGNORE_ROOT matches these paths from the app root.
    "test/excluded.js",
    "root.hidden.js",
    // The nested .meteorignore matches relative to _build/test/.
    "_build/test/ignored.js",
    // Legacy METEOR_IGNORE rules match at both root and nested directories.
    "legacy/excluded.js",
    "_build/test/legacy/excluded.js",
    "root.legacy.js",
    "_build/test/nested.legacy.js",
  ];
  for (const file of filesToLoad) {
    s.write(file, 'require("/imports/registry.js").add(module.id);');
  }
  for (const file of filesToIgnore) {
    s.write(file, `throw new Error("Unexpectedly loaded: ${file}");`);
  }

  // Keep node_modules discoverable so imports resolve, while excluding its
  // contents from the eager source scan (the invalid JSX must never be compiled).
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
  for (const file of filesToLoad) {
    await run.match(`/${file}`);
  }
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
