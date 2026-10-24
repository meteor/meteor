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

test("extractNpmDepsFromPackageJs collects Npm.depends and build plugin deps", () => {
  const source = `
    Package.describe({ summary: "x", version: "1.0.0" });
    Npm.depends({ express: "5.1.0", "@types/express": "5.0.1",
      "uWebSockets.js": "git+https://github.com/unetworking/uWebSockets.js#v20.66.0" });
    Package.registerBuildPlugin({ name: "p", npmDependencies: { terser: "5.31.0" } });
    Package.onUse(function (api) { api.use("ecmascript"); api.mainModule("x.js", "server"); });
    Package.onTest(function (api) { api.use("tinytest"); });
  `;
  const { dependencies, unauditable } = lib.extractNpmDepsFromPackageJs(source, "package.js");
  assert.deepEqual(dependencies, { express: "5.1.0", "@types/express": "5.0.1", terser: "5.31.0" });
  assert.deepEqual(unauditable, {
    "uWebSockets.js": "git+https://github.com/unetworking/uWebSockets.js#v20.66.0",
  });
});

test("collectMeteorPackageDeps skips packages without npm deps and reports eval errors", (t) => {
  const root = withTempRepo(t, {
    "packages/a/package.js": `Npm.depends({ lodash: "4.17.21" });`,
    "packages/b/package.js": `Package.describe({});`,
    "packages/c/package.js": `Npm.depends(undefinedVariable);`,
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
  assert.match(result[1].error, /undefinedVariable/);
});

test("loadPolicy validates shape", (t) => {
  const root = withTempRepo(t, {
    "ok.json": JSON.stringify({ failOn: "high", allow: [
      { ghsa: "GHSA-aaaa-bbbb-cccc", reason: "r", expires: "2030-01-01" } ] }),
    "bad-sev.json": JSON.stringify({ failOn: "severe", allow: [] }),
    "bad-entry.json": JSON.stringify({ failOn: "high", allow: [{ ghsa: "GHSA-aaaa-bbbb-cccc" }] }),
  });
  assert.equal(lib.loadPolicy(path.join(root, "ok.json")).failOn, "high");
  assert.throws(() => lib.loadPolicy(path.join(root, "bad-sev.json")), /failOn/);
  assert.throws(() => lib.loadPolicy(path.join(root, "bad-entry.json")), /reason/);
});

const sampleReport = {
  metadata: { dependencies: { total: 10 } },
  vulnerabilities: {
    tmp: {
      name: "tmp", severity: "high", isDirect: true, range: "<=0.2.5",
      fixAvailable: { name: "tmp", version: "0.2.7", isSemVerMajor: false },
      via: [{ source: 1, name: "tmp", title: "tmp symlink write", url: "https://github.com/advisories/GHSA-1111-2222-3333", severity: "high", range: "<=0.2.5" }],
    },
    qs: {
      name: "qs", severity: "moderate", isDirect: false, range: "<=6.15.3", fixAvailable: true,
      via: [{ source: 2, name: "qs", title: "qs DoS", url: "https://github.com/advisories/GHSA-4444-5555-6666", severity: "moderate", range: "<=6.15.3" }],
    },
    express: {
      // vulnerable only through qs: `via` is a string pointer, not an advisory
      name: "express", severity: "moderate", isDirect: true, range: "*", fixAvailable: true,
      via: ["qs"],
    },
    openpgp: {
      name: "openpgp", severity: "high", isDirect: false, range: "5.0.1 - 5.11.2", fixAvailable: false,
      via: [{ source: 3, name: "openpgp", title: "signature spoof", url: "https://github.com/advisories/GHSA-7777-8888-9999", severity: "high", range: "5.0.1 - 5.11.2" }],
    },
  },
};

test("summarizeAudit classifies advisories against the policy", () => {
  const policy = {
    failOn: "high",
    allow: [
      { ghsa: "GHSA-7777-8888-9999", reason: "no fix upstream", expires: "2030-01-01" },
      { ghsa: "GHSA-0000-0000-0000", reason: "already expired", expires: "2020-01-01" },
    ],
  };
  const s = lib.summarizeAudit(sampleReport, policy, new Date("2026-10-24"));
  assert.equal(s.advisories.length, 3, "string `via` pointers are not advisories");
  assert.deepEqual(s.counts, { critical: 0, high: 1, moderate: 1, low: 0 });
  assert.deepEqual(s.blocking.map((r) => r.id), ["GHSA-1111-2222-3333"]);
  assert.equal(s.blocking[0].fix, "bump tmp to 0.2.7");
  assert.deepEqual(s.allowlisted.map((r) => r.id), ["GHSA-7777-8888-9999"]);
  assert.deepEqual(s.expiredAllowEntries.map((e) => e.ghsa), ["GHSA-0000-0000-0000"]);
  assert.equal(s.totalDependencies, 10);
});

test("summarizeAudit honours failOn none and expiry", () => {
  const policy = {
    failOn: "none",
    allow: [{ ghsa: "GHSA-7777-8888-9999", reason: "x", expires: "2026-01-01" }],
  };
  const s = lib.summarizeAudit(sampleReport, policy, new Date("2026-10-24"));
  assert.equal(s.blocking.length, 0);
  assert.equal(s.allowlisted.length, 0, "expired entries no longer suppress");
  assert.equal(s.counts.high, 2);
});

test("renderMarkdown produces a table with totals and blocking section", () => {
  const policy = { failOn: "high", allow: [] };
  const summary = lib.summarizeAudit(sampleReport, policy, new Date("2026-10-24"));
  const md = lib.renderMarkdown(
    [
      { label: "packages/webapp", summary },
      { label: "packages/ddp-server", error: "npm audit produced no JSON" },
      { label: "npm-packages/x", unauditable: { foo: "git+https://x" } },
    ],
    policy
  );
  assert.match(md, /\| packages\/webapp \| 0 \| 2 \| 1 \| 0 \| 10 \| ❌ 2 blocking \|/);
  assert.match(md, /\| \*\*Total\*\* \| \*\*0\*\* \| \*\*2\*\* \| \*\*1\*\* \| \*\*0\*\* \|/);
  assert.match(md, /### Blocking advisories/);
  assert.match(md, /GHSA-1111-2222-3333/);
  assert.match(md, /⚠️ npm audit produced no JSON/);
  assert.match(md, /skipped \(no lockfile\)/);
  assert.match(md, /`foo` → `git\+https:\/\/x`/);
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
