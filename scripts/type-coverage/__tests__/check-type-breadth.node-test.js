const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { analyzeTypeBreadth, runTypeBreadth } = require("../check-type-breadth.js");

function createFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "type-breadth-"));
  fs.mkdirSync(path.join(root, "packages"), { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function createPackage(root, key, { declaration = false } = {}) {
  const packageDir = path.join(root, "packages", key);
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, "package.js"), "Package.describe({});\n");
  if (declaration) {
    fs.writeFileSync(path.join(packageDir, "index.d.ts"), "export {};\n");
  }
}

function writeManifest(root, manifest) {
  const manifestPath = path.join(root, "packages-manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  return manifestPath;
}

test("strict mode passes when required packages are typed and waivers are explicit", (t) => {
  const root = createFixture(t);
  createPackage(root, "public-api", { declaration: true });
  createPackage(root, "build-only");
  const manifestPath = writeManifest(root, {
    needsTypes: ["public-api"],
    waived: { "build-only": "build-time package" },
  });

  const output = [];
  const result = runTypeBreadth({
    root,
    manifestPath,
    strict: true,
    logger: { log: (line) => output.push(line), error: (line) => output.push(line) },
  });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.analysis.typed, ["public-api"]);
  assert.deepEqual(result.analysis.missing, []);
  assert.deepEqual(result.analysis.unclassified, []);
  assert.match(output.join("\n"), /strict: passed/);
});

test("strict mode fails when a required package has no declaration", (t) => {
  const root = createFixture(t);
  createPackage(root, "missing-types");
  const manifestPath = writeManifest(root, {
    needsTypes: ["missing-types"],
    waived: {},
  });

  const result = runTypeBreadth({
    root,
    manifestPath,
    strict: true,
    logger: { log() {}, error() {} },
  });

  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.analysis.missing, ["missing-types"]);
});

test("strict mode fails closed for an unclassified package", (t) => {
  const root = createFixture(t);
  createPackage(root, "new-package", { declaration: true });
  const manifestPath = writeManifest(root, { needsTypes: [], waived: {} });

  const result = runTypeBreadth({
    root,
    manifestPath,
    strict: true,
    logger: { log() {}, error() {} },
  });

  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.analysis.unclassified, ["new-package"]);
});

test("discovers nested packages and excludes git submodule trees", (t) => {
  const root = createFixture(t);
  createPackage(root, "non-core/jquery", { declaration: true });
  createPackage(root, "vendor/submodule/ignored", { declaration: true });
  fs.writeFileSync(
    path.join(root, ".gitmodules"),
    '[submodule "vendor"]\n  path = packages/vendor/submodule\n',
  );
  const manifestPath = writeManifest(root, {
    needsTypes: ["non-core/jquery"],
    waived: {},
  });

  const analysis = analyzeTypeBreadth({ root, manifestPath });

  assert.deepEqual(analysis.packageKeys, ["non-core/jquery"]);
  assert.deepEqual(analysis.typed, ["non-core/jquery"]);
  assert.deepEqual(analysis.unclassified, []);
});
