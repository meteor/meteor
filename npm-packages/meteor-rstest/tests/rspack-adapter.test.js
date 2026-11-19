const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const createAdapter = require("../src/rspack/index.js");

test("external application builds preserve full-app flags without a runtime bridge", () => {
  const adapter = createAdapter({
    options: { runtime: false },
    projectDir: "/app",
    isClient: true,
    isTestLike: true,
    isTestFullApp: true,
  });
  assert.equal(adapter.runtime, false);
  assert.deepEqual(adapter.meteorTestFlags, { isTest: false, isAppTest: true });
  assert.deepEqual(adapter.entryOptions, {});
  const config = { mode: "production" };
  adapter.finalizeConfig(config);
  assert.deepEqual(config, { mode: "production" });
});

test("runtime adapter owns registration, compiler plugins, and selected-file cache identity", (t) => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "meteor-rstest-adapter-"));
  t.after(() => fs.rmSync(projectDir, { recursive: true, force: true }));
  const manifest = path.join(projectDir, "files.json");
  const settings = path.join(projectDir, "settings.json");
  const selected = path.join(projectDir, "selected.test.ts");
  const setup = path.join(projectDir, "setup.ts");
  fs.writeFileSync(
    manifest,
    JSON.stringify({
      schemaVersion: 2,
      serverFiles: [selected],
      clientFiles: [],
    }),
  );
  fs.writeFileSync(settings, JSON.stringify({ schemaVersion: 1, setupFiles: [setup] }));
  const options = {
    runtime: true,
    npmRoot: path.resolve(__dirname, ".."),
    runtimeManifest: manifest,
    runtimeSettingsPath: settings,
  };
  class RstestPlugin {}
  const build = {
    options,
    projectDir,
    isClient: false,
    isTestLike: true,
    isTestFullApp: true,
    rspack: { experiments: { RstestPlugin } },
  };
  const adapter = createAdapter(build);
  assert.equal(adapter.runtime, true);
  assert.equal(adapter.typescript, true);
  assert.deepEqual(adapter.entryOptions.includeFiles, [selected]);
  assert.deepEqual(adapter.entryOptions.setupFiles, [setup]);
  assert.equal(adapter.entryOptions.testFileRegistration.module, "meteor/rstest");
  assert.deepEqual(adapter.meteorTestFlags, { isTest: true, isAppTest: true });
  const config = {
    mode: "production",
    optimization: { minimize: true, concatenateModules: true },
    resolve: { alias: { "@rstest/core$": "/incorrect.js" } },
  };
  adapter.finalizeConfig(config);
  assert.equal(config.mode, "development");
  assert.equal(config.optimization.minimize, false);
  assert.equal(config.optimization.concatenateModules, false);
  assert.notEqual(config.resolve.alias["@rstest/core$"], "/incorrect.js");
  assert.deepEqual(
    config.plugins.map((plugin) => plugin.constructor.name),
    ["RstestPlugin", "MeteorRstestMockRuntimePlugin"],
  );
  fs.writeFileSync(
    manifest,
    JSON.stringify({
      schemaVersion: 2,
      serverFiles: [selected, path.join(projectDir, "new.test.ts")],
      clientFiles: [],
    }),
  );
  assert.notEqual(createAdapter(build).cacheVersion, adapter.cacheVersion);
});
