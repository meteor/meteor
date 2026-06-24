const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  artifactStem,
  getInitialFlowPathForMode,
  getUpdatedFlowPathForMode,
  parseArgs,
  shouldRunUpdatedFlowForMode,
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

test("Capacitor non-HCP flows assert no-op bridge mode", () => {
  const app = getAppConfig("capacitor-tests");
  const flowFiles = [
    app.flowPath,
    app.livereloadInitialFlowPath,
    app.livereloadFlowPath,
  ];

  for (const flowFile of flowFiles) {
    assert.match(
      readFlow(flowFile),
      /WebAppLocalServer no-op shim ready/,
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
