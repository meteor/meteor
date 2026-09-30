const test = require("node:test");
const assert = require("node:assert/strict");
const { parseArgs } = require("./run");

test("parses --platform=android", () => {
  const args = parseArgs(["--platform=android"]);
  assert.equal(args.platform, "android");
  assert.equal(args.keepRunning, false);
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

test("throws on missing --platform", () => {
  assert.throws(() => parseArgs([]), /--platform is required/);
});

test("throws on invalid platform value", () => {
  assert.throws(() => parseArgs(["--platform=windows"]), /unsupported platform/i);
});
