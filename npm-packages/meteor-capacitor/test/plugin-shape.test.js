const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const pkg = require("..");

const ROOT = path.resolve(__dirname, "..");
test("exports CapacitorMeteorWebApp plugin proxy", () => {
  assert.equal(typeof pkg.defineConfig, "function");
  assert.equal(typeof pkg.CapacitorMeteorWebApp, "object");
  assert.equal(typeof pkg.CapacitorMeteorWebApp.startupDidComplete, "function");
  assert.equal(typeof pkg.CapacitorMeteorWebApp.checkForUpdates, "function");
});

test("package declares native Capacitor source directories", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

  assert.equal(packageJson.capacitor.ios.src, "ios");
  assert.equal(packageJson.capacitor.android.src, "android");
  assert.equal(packageJson.types, "index.d.ts");
  assert.equal(packageJson.exports["."].types, "./index.d.ts");
  assert.ok(packageJson.files.includes("index.d.ts"));
  assert.ok(packageJson.files.includes("ios/Sources/"));
  assert.ok(packageJson.files.includes("android/src/main/"));
});
