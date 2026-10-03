var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

import * as files from "../fs/files";

// Tests for `meteor build --format=esm`

selftest.define("build --format=esm produces index.mjs and esm-loader", async function () {
  const s = new Sandbox();
  await s.init();

  await s.createApp("myapp", "esm-format-test");
  s.cd("myapp");

  const run = s.run("build", "--format=esm", "--directory", "../esm-build");
  run.waitSecs(120);
  await run.expectExit(0);

  const bundlePath = files.pathJoin(s.home, "esm-build", "bundle");

  // index.mjs should exist (ESM entrypoint)
  selftest.expectTrue(files.exists(
    files.pathJoin(bundlePath, "index.mjs")
  ));

  // esm-loader.mjs should exist in programs/server/
  selftest.expectTrue(files.exists(
    files.pathJoin(bundlePath, "programs", "server", "esm-loader.mjs")
  ));

  // main.js should NOT exist (that's the legacy entrypoint)
  selftest.expectFalse(files.exists(
    files.pathJoin(bundlePath, "main.js")
  ));
});

selftest.define("build --format=esm omits legacy boot files", async function () {
  const s = new Sandbox();
  await s.init();

  await s.createApp("myapp", "esm-format-test");
  s.cd("myapp");

  const run = s.run("build", "--format=esm", "--directory", "../esm-build");
  run.waitSecs(120);
  await run.expectExit(0);

  const serverPath = files.pathJoin(s.home, "esm-build", "bundle", "programs", "server");

  // Legacy boot files should NOT be present
  selftest.expectFalse(files.exists(files.pathJoin(serverPath, "boot.js")));
  selftest.expectFalse(files.exists(files.pathJoin(serverPath, "runtime.js")));
  selftest.expectFalse(files.exists(files.pathJoin(serverPath, "npm-require.js")));
  selftest.expectFalse(files.exists(files.pathJoin(serverPath, "boot-utils.js")));

  // npm-rebuild.js should still be present (needed for postinstall)
  selftest.expectTrue(files.exists(files.pathJoin(serverPath, "npm-rebuild.js")));

  // program.json should still be present (the ESM loader uses it)
  selftest.expectTrue(files.exists(files.pathJoin(serverPath, "program.json")));
});

selftest.define("build without --format produces legacy bundle (no regression)", async function () {
  const s = new Sandbox();
  await s.init();

  await s.createApp("myapp", "esm-format-test");
  s.cd("myapp");

  const run = s.run("build", "--directory", "../legacy-build");
  run.waitSecs(120);
  await run.expectExit(0);

  const bundlePath = files.pathJoin(s.home, "legacy-build", "bundle");
  const serverPath = files.pathJoin(bundlePath, "programs", "server");

  // Legacy entrypoint should exist
  selftest.expectTrue(files.exists(files.pathJoin(bundlePath, "main.js")));

  // ESM entrypoint should NOT exist
  selftest.expectFalse(files.exists(files.pathJoin(bundlePath, "index.mjs")));

  // Legacy boot files should be present
  selftest.expectTrue(files.exists(files.pathJoin(serverPath, "boot.js")));
  selftest.expectTrue(files.exists(files.pathJoin(serverPath, "runtime.js")));

  // esm-loader.mjs should NOT be present
  selftest.expectFalse(files.exists(files.pathJoin(serverPath, "esm-loader.mjs")));
});

selftest.define("build --format=invalid fails with error", async function () {
  const s = new Sandbox();
  await s.init();

  await s.createApp("myapp", "esm-format-test");
  s.cd("myapp");

  const run = s.run("build", "--format=invalid", "--directory", "../bad-build");
  run.waitSecs(30);
  await run.matchErr('Unknown --format value');
  await run.expectExit(1);
});

selftest.define("build --format=esm index.mjs contains ESM import syntax", async function () {
  const s = new Sandbox();
  await s.init();

  await s.createApp("myapp", "esm-format-test");
  s.cd("myapp");

  const run = s.run("build", "--format=esm", "--directory", "../esm-build");
  run.waitSecs(120);
  await run.expectExit(0);

  const indexContent = files.readFile(
    files.pathJoin(s.home, "esm-build", "bundle", "index.mjs"),
    'utf8'
  );

  // Should contain ESM import syntax
  selftest.expectTrue(indexContent.includes('import '));
  selftest.expectTrue(indexContent.includes('await boot('));

  // Should NOT contain CJS require
  selftest.expectFalse(indexContent.includes('require('));
});

selftest.define("build --format=esm README mentions index.mjs", async function () {
  const s = new Sandbox();
  await s.init();

  await s.createApp("myapp", "esm-format-test");
  s.cd("myapp");

  const run = s.run("build", "--format=esm", "--directory", "../esm-build");
  run.waitSecs(120);
  await run.expectExit(0);

  const readmeContent = files.readFile(
    files.pathJoin(s.home, "esm-build", "bundle", "README"),
    'utf8'
  );

  selftest.expectTrue(readmeContent.includes('index.mjs'));
  selftest.expectTrue(readmeContent.includes('ESM'));
});
