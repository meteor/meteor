const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const lib = require("../lib.js");

function withTempRepo(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "npm-deps-audit-"));
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("extractNpmDepsFromPackageJs collects Npm.depends and build plugin deps statically", () => {
  const source = `
    Package.describe({ summary: "x", version: "1.0.0" });
    // Npm.depends({ "commented-out": "1.0.0" });
    /* Npm.depends({ "block-commented": "1.0.0" }); */
    Npm.depends({
      express: "5.1.0", // trailing comment
      "@types/express": '5.0.1',
      'single-quoted': \`1.2.3\`,
      "uWebSockets.js": "git+https://github.com/unetworking/uWebSockets.js#v20.66.0",
    });
    Npm.depends({ second: "2.0.0" });
    Package.registerBuildPlugin({ name: "p", npmDependencies: { terser: "5.31.0" } });
    Package.onUse(function (api) { api.use("ecmascript"); api.mainModule("x.js", "server"); });
    const s = "Npm.depends({ 'in-a-string': '1' })";
  `;
  const { dependencies, unauditable } = lib.extractNpmDepsFromPackageJs(source);
  assert.deepEqual(dependencies, {
    express: "5.1.0",
    "@types/express": "5.0.1",
    "single-quoted": "1.2.3",
    second: "2.0.0",
    terser: "5.31.0",
  });
  assert.deepEqual(unauditable, {
    "uWebSockets.js": "git+https://github.com/unetworking/uWebSockets.js#v20.66.0",
  });
});

test("extractNpmDepsFromPackageJs rejects non-literal declarations instead of guessing", () => {
  assert.throws(
    () => lib.extractNpmDepsFromPackageJs(`Npm.depends(deps);`),
    /Expected an object literal/
  );
  assert.throws(
    () => lib.extractNpmDepsFromPackageJs(`Npm.depends({ lodash: version });`),
    /must be a string literal/
  );
  assert.throws(
    () => lib.extractNpmDepsFromPackageJs(`Npm.depends({ lodash: \`\${v}\` });`),
    /Template literals/
  );
  assert.throws(
    () => lib.extractNpmDepsFromPackageJs(`Npm.depends({ lodash: "1" "2" });`),
    /Expected ',' or '}'/
  );
});

test("extractNpmDepsFromPackageJs handles no declarations", () => {
  assert.deepEqual(lib.extractNpmDepsFromPackageJs(`Package.describe({});`), {
    dependencies: {},
    unauditable: {},
  });
});

test("collectMeteorPackageDeps skips packages without npm deps and reports parse errors", (t) => {
  const root = withTempRepo(t, {
    "packages/a/package.js": `Npm.depends({ lodash: "4.17.21" });`,
    "packages/b/package.js": `Package.describe({});`,
    "packages/c/package.js": `Npm.depends(someVariable);`,
    "packages/d/README.md": "no package.js here",
  });
  const result = lib.collectMeteorPackageDeps(root);
  assert.deepEqual(result.map((r) => r.name), ["a", "c"]);
  assert.deepEqual(result[0], {
    name: "a",
    sourcePath: "packages/a/package.js",
    dependencies: { lodash: "4.17.21" },
    unauditable: {},
  });
  assert.match(result[1].error, /packages\/c\/package\.js: Expected an object literal/);
});

test("isRegistrySpec distinguishes registry versions from git/http/file specs", () => {
  assert.equal(lib.isRegistrySpec("1.2.3"), true);
  assert.equal(lib.isRegistrySpec("^7.0.0 || >=8"), true);
  assert.equal(lib.isRegistrySpec("git+https://github.com/x/y#v1"), false);
  assert.equal(lib.isRegistrySpec("file:../local"), false);
  assert.equal(lib.isRegistrySpec("latest"), false);
});

test("writeManifest produces a private package.json pointing back at package.js", (t) => {
  const root = withTempRepo(t, {});
  const dir = lib.writeManifest(root, {
    name: "webapp",
    sourcePath: "packages/webapp/package.js",
    dependencies: { tmp: "0.2.3" },
  });
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  assert.equal(manifest.name, "meteor-package-webapp");
  assert.equal(manifest.private, true);
  assert.deepEqual(manifest.dependencies, { tmp: "0.2.3" });
  assert.match(manifest.description, /packages\/webapp\/package\.js/);
});

test("purl encodes scoped package names", () => {
  assert.equal(lib.purl("lodash", "4.17.21"), "pkg:npm/lodash@4.17.21");
  assert.equal(lib.purl("@babel/core", "7.0.0"), "pkg:npm/%40babel/core@7.0.0");
});

test("lockfileToResolved maps a v3 lockfile with nested node_modules", () => {
  const lock = {
    lockfileVersion: 3,
    packages: {
      "": { dependencies: { a: "1.0.0", "@s/b": "2.0.0" } },
      "node_modules/a": { version: "1.0.0", dependencies: { c: "^1.0.0" } },
      "node_modules/@s/b": { version: "2.0.0", dependencies: { c: "^2.0.0" } },
      "node_modules/c": { version: "1.5.0" },
      "node_modules/@s/b/node_modules/c": { version: "2.1.0", dev: true },
      "node_modules/linked": { link: true, resolved: "../x" },
    },
  };
  const resolved = lib.lockfileToResolved(lock);
  assert.deepEqual(Object.keys(resolved).sort(), [
    "node_modules/@s/b", "node_modules/@s/b/node_modules/c", "node_modules/a", "node_modules/c",
  ]);
  assert.equal(resolved["node_modules/a"].relationship, "direct");
  assert.deepEqual(resolved["node_modules/a"].dependencies, ["pkg:npm/c@1.5.0"]);
  assert.equal(resolved["node_modules/@s/b"].package_url, "pkg:npm/%40s/b@2.0.0");
  assert.deepEqual(resolved["node_modules/@s/b"].dependencies, ["pkg:npm/c@2.1.0"], "nested copy wins");
  assert.equal(resolved["node_modules/c"].relationship, "indirect");
  assert.equal(resolved["node_modules/c"].scope, "runtime");
  assert.equal(resolved["node_modules/@s/b/node_modules/c"].scope, "development");
});

test("buildSnapshot uses Actions env and one manifest per package.js", (t) => {
  const root = withTempRepo(t, {
    "webapp/package-lock.json": JSON.stringify({
      lockfileVersion: 3,
      packages: { "": { dependencies: { tmp: "0.2.3" } }, "node_modules/tmp": { version: "0.2.3" } },
    }),
  });
  const env = {
    GITHUB_SHA: "abc", GITHUB_REF: "refs/heads/devel", GITHUB_WORKFLOW: "npm dependency audit",
    GITHUB_JOB: "submit", GITHUB_RUN_ID: "42", GITHUB_SERVER_URL: "https://github.com",
    GITHUB_REPOSITORY: "meteor/meteor",
  };
  const snapshot = lib.buildSnapshot(
    [
      { name: "webapp", sourcePath: "packages/webapp/package.js", lockfile: path.join(root, "webapp/package-lock.json") },
      { name: "broken", sourcePath: "packages/broken/package.js", error: "boom" },
    ],
    env,
    new Date("2026-10-24T00:00:00Z")
  );
  assert.equal(snapshot.version, 0);
  assert.equal(snapshot.sha, "abc");
  assert.equal(snapshot.job.correlator, "npm dependency audit/submit");
  assert.equal(snapshot.job.html_url, "https://github.com/meteor/meteor/actions/runs/42");
  assert.deepEqual(Object.keys(snapshot.manifests), ["packages/webapp/package.js"]);
  const m = snapshot.manifests["packages/webapp/package.js"];
  assert.equal(m.file.source_location, "packages/webapp/package.js");
  assert.equal(m.resolved["node_modules/tmp"].package_url, "pkg:npm/tmp@0.2.3");
});
