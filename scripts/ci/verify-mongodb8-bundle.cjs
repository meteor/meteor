// Temporary guard for PR #14663 validation. Remove the test-server selection
// when an official MongoDB 8 dev bundle is published.
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { readFileSync, appendFileSync } = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const bundleVersion = "26.8.2-mongodb8-pr14663-20260923";
const mongoVersion = "8.0.29";
const windows = process.platform === "win32";
const options = { cwd: root, encoding: "utf8" };

assert.equal(
  process.env.USE_TEST_DEV_BUNDLE_SERVER,
  "1",
  "MongoDB 8 validation requires the test dev bundle server",
);
assert.match(
  readFileSync(path.join(root, "meteor"), "utf8"),
  /^BUNDLE_VERSION=26\.8\.2-mongodb8-pr14663-20260923$/m,
);

// Always run the launcher: it replaces a restored cache with an older bundle.
execFileSync(
  windows ? "cmd.exe" : "./meteor",
  windows ? ["/d", "/c", "meteor.bat node --version"] : ["node", "--version"],
  { ...options, stdio: "inherit" },
);
assert.equal(
  readFileSync(path.join(root, "dev_bundle/.bundle_version.txt"), "utf8").trim(),
  bundleVersion,
);

for (const [binary, label] of [
  ["mongod", "db"],
  ["mongos", "mongos"],
]) {
  const executable = path.join(root, "dev_bundle/mongodb/bin", binary + (windows ? ".exe" : ""));
  const output = execFileSync(executable, ["--version"], options);
  process.stdout.write(output);
  assert.ok(
    output.split(/\r?\n/).includes(`${label} version v${mongoVersion}`),
    `${binary} must be MongoDB ${mongoVersion}; refusing to run tests`,
  );
}

const summary = `Verified dev bundle: ${bundleVersion}\nMongoDB: ${mongoVersion}\n`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}
