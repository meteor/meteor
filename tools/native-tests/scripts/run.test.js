const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  artifactStem,
  getHardTimeoutMs,
  getUpdatedAppReadyChecks,
  getInitialFlowPathForMode,
  getUpdatedAppReadyMarker,
  getUpdatedFlowPathForMode,
  parseArgs,
  readServerText,
  shouldRelaunchUpdatedCapacitorApp,
  shouldUseNativeRunBackedServer,
  shouldWaitForUpdatedCordovaManifest,
  shouldRunUpdatedFlowForMode,
  waitForUpdatedAppReady,
  waitForServerTextChange,
} = require("./run");
const { getAppConfig } = require("./app-config");
const packageJson = require("../package.json");
const rootPackageJson = require("../../../package.json");

function readFlow(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

test("parses --platform=android", () => {
  const args = parseArgs(["--platform=android"]);
  assert.equal(args.platform, "android");
  assert.equal(args.appName, "capacitor-tests");
  assert.equal(args.keepRunning, false);
});

test("defaults to run mode", () => {
  const args = parseArgs(["--platform=android"]);
  assert.equal(args.mode, "run");
});

test("parses --mode=build", () => {
  const args = parseArgs(["--platform=android", "--mode=build"]);
  assert.equal(args.mode, "build");
});

test("parses --mode=livereload", () => {
  const args = parseArgs(["--platform=android", "--mode=livereload"]);
  assert.equal(args.mode, "livereload");
});

test("parses --mode=hcp", () => {
  const args = parseArgs(["--platform=android", "--mode=hcp"]);
  assert.equal(args.mode, "hcp");
});

test("supports --mode build (space-separated)", () => {
  const args = parseArgs(["--platform=android", "--mode", "build"]);
  assert.equal(args.mode, "build");
});

test("parses --app=capacitor-tests", () => {
  const args = parseArgs(["--platform=android", "--app=capacitor-tests"]);
  assert.equal(args.appName, "capacitor-tests");
});

test("parses --platform=ios with --keep-running", () => {
  const args = parseArgs(["--platform=ios", "--keep-running"]);
  assert.equal(args.platform, "ios");
  assert.equal(args.keepRunning, true);
});

test("supports --platform android (space-separated)", () => {
  const args = parseArgs(["--platform", "android"]);
  assert.equal(args.platform, "android");
});

test("parses --app=smoke", () => {
  const args = parseArgs(["--platform=android", "--app=smoke"]);
  assert.equal(args.appName, "smoke");
});

test("supports --app smoke (space-separated)", () => {
  const args = parseArgs(["--platform=android", "--app", "smoke"]);
  assert.equal(args.appName, "smoke");
});

test("throws on missing --platform", () => {
  assert.throws(() => parseArgs([]), /--platform is required/);
});

test("throws on invalid platform value", () => {
  assert.throws(() => parseArgs(["--platform=windows"]), /unsupported platform/i);
});

test("throws on invalid mode value", () => {
  assert.throws(() => parseArgs(["--platform=android", "--mode=prod"]), /unsupported mode/i);
});

test("throws on invalid app value", () => {
  assert.throws(() => parseArgs(["--platform=android", "--app=missing"]), /Unknown native test app: missing/);
});

test("native test hard timeout defaults and accepts env override", () => {
  assert.equal(getHardTimeoutMs({}), 20 * 60 * 1000);
  assert.equal(getHardTimeoutMs({ METEOR_NATIVE_TEST_TIMEOUT_MS: "12345" }), 12345);
  assert.equal(getHardTimeoutMs({ METEOR_NATIVE_TEST_TIMEOUT_MS: "bad" }), 20 * 60 * 1000);
});

test("keeps current artifact stem for run mode", () => {
  assert.equal(
    artifactStem({ platform: "android", appName: "capacitor-tests", mode: "run" }),
    "android-capacitor-tests"
  );
});

test("suffixes artifact stem for build mode", () => {
  assert.equal(
    artifactStem({ platform: "android", appName: "capacitor-tests", mode: "build" }),
    "android-capacitor-tests-build"
  );
});

test("suffixes artifact stem for livereload mode", () => {
  assert.equal(
    artifactStem({ platform: "android", appName: "capacitor-tests", mode: "livereload" }),
    "android-capacitor-tests-livereload"
  );
});

test("suffixes artifact stem for hcp mode", () => {
  assert.equal(
    artifactStem({ platform: "android", appName: "capacitor-tests", mode: "hcp" }),
    "android-capacitor-tests-hcp"
  );
});

test("run mode uses default HCP initial flow", () => {
  const appConfig = {
    flowPath: "/flows/base.yaml",
    hcpInitialFlowPath: "/flows/hcp-initial.yaml",
    hcpFlowPath: "/flows/hcp.yaml",
    livereloadInitialFlowPath: "/flows/livereload-initial.yaml",
    livereloadFlowPath: "/flows/livereload.yaml",
  };

  assert.equal(getInitialFlowPathForMode("run", appConfig), "/flows/hcp-initial.yaml");
  assert.equal(getUpdatedFlowPathForMode("run", appConfig), "/flows/hcp.yaml");
  assert.equal(shouldRunUpdatedFlowForMode("run"), true);
});

test("build mode keeps non-HCP flow", () => {
  const appConfig = {
    flowPath: "/flows/base.yaml",
    hcpInitialFlowPath: "/flows/hcp-initial.yaml",
    hcpFlowPath: "/flows/hcp.yaml",
    livereloadInitialFlowPath: "/flows/livereload-initial.yaml",
    livereloadFlowPath: "/flows/livereload.yaml",
  };

  assert.equal(getInitialFlowPathForMode("build", appConfig), "/flows/base.yaml");
  assert.equal(getUpdatedFlowPathForMode("build", appConfig), null);
  assert.equal(shouldRunUpdatedFlowForMode("build"), false);
});

test("updated app marker is exposed for HCP-backed modes", () => {
  assert.equal(
    getUpdatedAppReadyMarker("run"),
    "Welcome to Meteor Capacitor Tests Updated"
  );
  assert.equal(
    getUpdatedAppReadyMarker("hcp"),
    "Welcome to Meteor Capacitor Tests Updated"
  );
  assert.equal(
    getUpdatedAppReadyMarker("livereload"),
    "Welcome to Meteor Capacitor Tests Updated"
  );
  assert.equal(getUpdatedAppReadyMarker("build"), null);
});

test("capacitor HCP-backed modes wait for updated __cordova bundle", () => {
  assert.deepEqual(
    getUpdatedAppReadyChecks({
      mode: "run",
      wrapper: "capacitor",
    }),
    [
      { requestPath: "/", marker: "Welcome to Meteor Capacitor Tests Updated" },
      { requestPath: "/__cordova/", marker: "Welcome to Meteor Capacitor Tests Updated" },
    ]
  );

  assert.deepEqual(
    getUpdatedAppReadyChecks({
      mode: "hcp",
      wrapper: "capacitor",
    }),
    [
      { requestPath: "/", marker: "Welcome to Meteor Capacitor Tests Updated" },
      { requestPath: "/__cordova/", marker: "Welcome to Meteor Capacitor Tests Updated" },
    ]
  );

  assert.deepEqual(
    getUpdatedAppReadyChecks({
      mode: "livereload",
      wrapper: "capacitor",
    }),
    [{ requestPath: "/", marker: "Welcome to Meteor Capacitor Tests Updated" }]
  );

  assert.deepEqual(
    getUpdatedAppReadyChecks({
      mode: "build",
      wrapper: "capacitor",
    }),
    []
  );
});

test("capacitor HCP-backed modes wait for updated manifest", () => {
  assert.equal(
    shouldWaitForUpdatedCordovaManifest({
      mode: "run",
      wrapper: "capacitor",
    }),
    true
  );
  assert.equal(
    shouldWaitForUpdatedCordovaManifest({
      mode: "hcp",
      wrapper: "capacitor",
    }),
    true
  );
  assert.equal(
    shouldWaitForUpdatedCordovaManifest({
      mode: "livereload",
      wrapper: "capacitor",
    }),
    false
  );
  assert.equal(
    shouldWaitForUpdatedCordovaManifest({
      mode: "run",
      wrapper: "cordova",
    }),
    false
  );
});

test("capacitor modes that need web.cordova use a native-run-backed server", () => {
  assert.equal(
    shouldUseNativeRunBackedServer({
      wrapper: "capacitor",
      mode: "run",
    }),
    true
  );
  assert.equal(
    shouldUseNativeRunBackedServer({
      wrapper: "capacitor",
      mode: "livereload",
    }),
    true
  );
  assert.equal(
    shouldUseNativeRunBackedServer({
      wrapper: "capacitor",
      mode: "hcp",
    }),
    true
  );
  assert.equal(
    shouldUseNativeRunBackedServer({
      wrapper: "cordova",
      mode: "hcp",
    }),
    false
  );
});

test("android capacitor HCP modes relaunch before updated assertions", () => {
  assert.equal(
    shouldRelaunchUpdatedCapacitorApp({
      platform: "android",
      wrapper: "capacitor",
      mode: "hcp",
    }),
    true
  );
  assert.equal(
    shouldRelaunchUpdatedCapacitorApp({
      platform: "android",
      wrapper: "capacitor",
      mode: "run",
    }),
    true
  );
  assert.equal(
    shouldRelaunchUpdatedCapacitorApp({
      platform: "android",
      wrapper: "capacitor",
      mode: "livereload",
    }),
    false
  );
  assert.equal(
    shouldRelaunchUpdatedCapacitorApp({
      platform: "ios",
      wrapper: "capacitor",
      mode: "hcp",
    }),
    false
  );
});

test("waits until the updated app marker is served", async () => {
  let attempts = 0;
  const requestedUrls = [];

  await waitForUpdatedAppReady({
    baseUrl: "http://127.0.0.1:3000",
    marker: "Welcome to Meteor Capacitor Tests Updated",
    requestPath: "/__cordova/",
    intervalMs: 0,
    timeoutMs: 100,
    fetchImpl: async (url) => {
      requestedUrls.push(url);
      attempts += 1;
      return {
        ok: true,
        async text() {
          return attempts < 2
            ? "<body>stale</body>"
            : "<body>Welcome to Meteor Capacitor Tests Updated</body>";
        },
      };
    },
  });

  assert.equal(attempts, 2);
  assert.deepEqual(requestedUrls, [
    "http://127.0.0.1:3000/__cordova/",
    "http://127.0.0.1:3000/__cordova/",
  ]);
});

test("reads server text through the configured path", async () => {
  const text = await readServerText({
    baseUrl: "http://127.0.0.1:3000",
    requestPath: "/__cordova/manifest.json",
    fetchImpl: async (url) => {
      assert.equal(url, "http://127.0.0.1:3000/__cordova/manifest.json");
      return {
        ok: true,
        async text() {
          return "{\"version\":\"v2\"}";
        },
      };
    },
  });

  assert.equal(text, "{\"version\":\"v2\"}");
});

test("waits until the server response changes", async () => {
  let attempts = 0;

  await waitForServerTextChange({
    baseUrl: "http://127.0.0.1:3000",
    requestPath: "/__cordova/manifest.json",
    previousText: "{\"version\":\"v1\"}",
    intervalMs: 0,
    timeoutMs: 100,
    fetchImpl: async () => {
      attempts += 1;
      return {
        ok: true,
        async text() {
          return attempts < 2 ? "{\"version\":\"v1\"}" : "{\"version\":\"v2\"}";
        },
      };
    },
  });

  assert.equal(attempts, 2);
});

test("times out when the server response does not change", async () => {
  await assert.rejects(
    waitForServerTextChange({
      baseUrl: "http://127.0.0.1:3000",
      requestPath: "/__cordova/manifest.json",
      previousText: "{\"version\":\"v1\"}",
      intervalMs: 0,
      timeoutMs: 10,
      fetchImpl: async () => ({
        ok: true,
        async text() {
          return "{\"version\":\"v1\"}";
        },
      }),
    }),
    /Timed out waiting for updated server response/
  );
});

test("times out when the updated app marker never appears", async () => {
  await assert.rejects(
    waitForUpdatedAppReady({
      baseUrl: "http://127.0.0.1:3000",
      marker: "Welcome to Meteor Capacitor Tests Updated",
      intervalMs: 0,
      timeoutMs: 10,
      fetchImpl: async () => ({
        ok: true,
        async text() {
          return "<body>stale</body>";
        },
      }),
    }),
    /Timed out waiting for updated app marker/
  );
});

test("native test package exposes default run mode scripts", () => {
  const scripts = packageJson.scripts;

  assert.equal(
    scripts["test:capacitor:android:run"],
    "node scripts/run.js --platform=android --app=capacitor-tests"
  );
  assert.equal(
    scripts["test:capacitor:ios:run"],
    "node scripts/run.js --platform=ios --app=capacitor-tests"
  );
});

test("root package exposes explicit Capacitor run mode scripts", () => {
  const scripts = rootPackageJson.scripts;

  assert.equal(
    scripts["test:native:capacitor:android:run"],
    "cd tools/native-tests && npm run test:capacitor:android:run"
  );
  assert.equal(
    scripts["test:native:capacitor:ios:run"],
    "cd tools/native-tests && npm run test:capacitor:ios:run"
  );
});

test("Capacitor HCP flows assert native bridge and reload execution", () => {
  const app = getAppConfig("capacitor-tests");
  const initialFlow = readFlow(app.hcpInitialFlowPath);
  const updatedFlow = readFlow(app.hcpFlowPath);

  assert.match(initialFlow, /WebAppLocalServer native bridge ready/);
  assert.match(updatedFlow, /HCP check requested/);
  assert.match(updatedFlow, /HCP update ready/);
  assert.match(updatedFlow, /HCP reload executed/);
  assert.match(updatedFlow, /Native client version updated/);
});

test("Capacitor non-HCP flows assert livereload shim mode", () => {
  const app = getAppConfig("capacitor-tests");
  const flowFiles = [
    app.flowPath,
    app.livereloadInitialFlowPath,
    app.livereloadFlowPath,
  ];

  for (const flowFile of flowFiles) {
    assert.match(
      readFlow(flowFile),
      /WebAppLocalServer livereload shim ready/,
      path.basename(flowFile)
    );
  }
});

test("Capacitor livereload flows verify non-root route reloads", () => {
  const app = getAppConfig("capacitor-tests");
  const flowFiles = [
    app.livereloadInitialFlowPath,
    app.livereloadFlowPath,
  ];

  for (const flowFile of flowFiles) {
    const flow = readFlow(flowFile);
    assert.match(flow, /Reload route test/, path.basename(flowFile));
    assert.match(flow, /Route reload preserved/, path.basename(flowFile));
  }
});
