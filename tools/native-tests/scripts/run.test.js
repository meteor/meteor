const test = require("node:test");
const assert = require("node:assert/strict");
const { artifactStem, parseArgs } = require("./run");

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
