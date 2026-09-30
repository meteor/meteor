const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("fs-extra");

const {
  applyCordovaFixtureUpdate,
  readCordovaManifest,
  waitForCordovaManifestChange,
} = require("./cordova-hcp");

async function makeFixture() {
  const appDir = await fs.mkdtemp(path.join(os.tmpdir(), "cordova-hcp-test-"));
  await fs.ensureDir(path.join(appDir, "client"));
  await fs.ensureDir(path.join(appDir, "server"));
  await fs.writeFile(
    path.join(appDir, "client", "main.html"),
    "Welcome to Meteor Cordova Tests",
    "utf8"
  );
  await fs.writeFile(
    path.join(appDir, "client", "main.js"),
    'const CLIENT_VERSION = "Native client version initial";',
    "utf8"
  );
  await fs.writeFile(
    path.join(appDir, "server", "main.js"),
    'const SERVER_VERSION = "Native server version initial";',
    "utf8"
  );
  return appDir;
}

test("updates every required Cordova fixture marker", async (t) => {
  const appDir = await makeFixture();
  t.after(() => fs.remove(appDir));

  await applyCordovaFixtureUpdate(appDir);

  assert.match(
    await fs.readFile(path.join(appDir, "client", "main.html"), "utf8"),
    /Welcome to Meteor Cordova Tests Updated/
  );
  assert.match(
    await fs.readFile(path.join(appDir, "client", "main.js"), "utf8"),
    /Native client version updated/
  );
  assert.match(
    await fs.readFile(path.join(appDir, "server", "main.js"), "utf8"),
    /Native server version updated/
  );
});

test("rejects an incomplete Cordova fixture instead of silently skipping it", async (t) => {
  const appDir = await makeFixture();
  t.after(() => fs.remove(appDir));
  await fs.writeFile(
    path.join(appDir, "client", "main.html"),
    "wrong marker",
    "utf8"
  );

  await assert.rejects(
    applyCordovaFixtureUpdate(appDir),
    /Welcome to Meteor Cordova Tests/
  );
});

test("reads a versioned Cordova manifest", async () => {
  const result = await readCordovaManifest({
    baseUrl: "http://127.0.0.1:3000",
    fetchImpl: async (url, options) => {
      assert.equal(url, "http://127.0.0.1:3000/__cordova/manifest.json");
      assert.equal(options.headers["cache-control"], "no-cache");
      return {
        ok: true,
        status: 200,
        async json() {
          return { version: "initial-v1", manifest: [] };
        },
      };
    },
  });

  assert.equal(result.version, "initial-v1");
  assert.deepEqual(result.manifest, {
    version: "initial-v1",
    manifest: [],
  });
});

test("rejects unsuccessful or unversioned manifest responses", async () => {
  await assert.rejects(
    readCordovaManifest({
      baseUrl: "http://127.0.0.1:3000",
      fetchImpl: async () => ({ ok: false, status: 503 }),
    }),
    /503/
  );

  await assert.rejects(
    readCordovaManifest({
      baseUrl: "http://127.0.0.1:3000",
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() {
          return { manifest: [] };
        },
      }),
    }),
    /non-empty version/
  );
});

test("waits until Cordova manifest version changes", async () => {
  let calls = 0;
  const result = await waitForCordovaManifestChange({
    baseUrl: "http://127.0.0.1:3000",
    previousVersion: "initial-v1",
    intervalMs: 0,
    timeoutMs: 100,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        calls += 1;
        return { version: calls < 2 ? "initial-v1" : "updated-v2" };
      },
    }),
  });

  assert.equal(calls, 2);
  assert.equal(result.version, "updated-v2");
});

test("times out while Cordova manifest version remains unchanged", async () => {
  await assert.rejects(
    waitForCordovaManifestChange({
      baseUrl: "http://127.0.0.1:3000",
      previousVersion: "initial-v1",
      intervalMs: 0,
      timeoutMs: 10,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() {
          return { version: "initial-v1" };
        },
      }),
    }),
    /__cordova\/manifest\.json.*initial-v1/
  );
});

test("aborts a stalled Cordova manifest request at the deadline", async () => {
  let requestSignal;
  let guardTimer;

  const waitResult = waitForCordovaManifestChange({
    baseUrl: "http://127.0.0.1:3000",
    previousVersion: "initial-v1",
    intervalMs: 0,
    timeoutMs: 20,
    fetchImpl: async (_url, options) => {
      requestSignal = options.signal;
      return new Promise(() => {});
    },
  }).then(
    () => ({ status: "resolved" }),
    (error) => ({ status: "rejected", error })
  );
  const guardResult = new Promise((resolve) => {
    guardTimer = setTimeout(() => resolve({ status: "guard-timeout" }), 250);
  });

  const result = await Promise.race([waitResult, guardResult]);
  clearTimeout(guardTimer);

  assert.equal(result.status, "rejected");
  assert.match(
    result.error.message,
    /Timed out waiting for Cordova manifest .*: request timed out/
  );
  assert.equal(requestSignal.aborted, true);
});
