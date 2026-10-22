# Native Mobile Smoke Tests with Maestro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `tools/native-tests/`, a sibling to `tools/e2e-tests/`, that boots a Meteor-built Cordova app in iOS and Android simulators, asserts it launches and connects via DDP, and runs nightly plus on-demand in CI.

**Architecture:** Plain Node CLI orchestrator (no Jest). Six small scripts each with one job, a single Maestro YAML flow, a purpose-built minimal Meteor app, and a GitHub Actions workflow. Platform-neutral naming so Capacitor can join later without rename churn.

**Tech Stack:** Node 20, [Maestro](https://maestro.dev), `execa`, `wait-on`, `fs-extra`, GitHub Actions, `reactivecircus/android-emulator-runner@v2`, `xcrun simctl`, Meteor's Cordova integration.

**Spec:** [docs/superpowers/specs/2026-05-13-native-maestro-testing-design.md](../specs/2026-05-13-native-maestro-testing-design.md)

---

## Task 1: Bootstrap `tools/native-tests/` directory

**Files:**
- Create: `tools/native-tests/package.json`
- Create: `tools/native-tests/README.md`
- Create: `tools/native-tests/.gitignore`

- [ ] **Step 1: Create `tools/native-tests/package.json`**

```json
{
  "name": "meteor-native-tests",
  "version": "1.0.0",
  "private": true,
  "description": "Maestro flows verifying Meteor's native mobile shell (Cordova).",
  "scripts": {
    "test": "node scripts/run.js"
  },
  "devDependencies": {
    "execa": "^5.1.1",
    "fs-extra": "^11.3.1",
    "wait-on": "^7.0.0"
  }
}
```

- [ ] **Step 2: Create `tools/native-tests/README.md`**

```markdown
# Native mobile smoke tests

Maestro flows verifying Meteor's native mobile shell. Builds a minimal Meteor
app for Cordova, installs it on an iOS Simulator or Android emulator, and asserts
that the app launches, the Meteor client renders, and DDP connects.

Sibling to `tools/e2e-tests/`. Isolated `package.json` so test dependencies never
contaminate the dev bundle's `node_modules`.

## Local usage

Prerequisites: Node 20+, Maestro CLI, Xcode (for iOS), Android SDK + emulator
(for Android). On a fresh checkout:

```sh
npm run install:native            # installs deps and checks for maestro CLI
npm run test:native -- --platform=android
npm run test:native -- --platform=ios
```

## Layout

| Path | Purpose |
|------|---------|
| `apps/smoke/` | Minimal Meteor app under test (committed source) |
| `flows/launch.yaml` | The single smoke flow |
| `scripts/run.js` | Entrypoint, wires the pipeline |
| `scripts/build-app.js` | `meteor add-platform` + `meteor build` |
| `scripts/server.js` | Starts `meteor run` and waits for ready |
| `scripts/simulator.js` | Boots iOS Simulator or Android emulator |
| `scripts/maestro.js` | Spawns Maestro and captures JUnit output |
| `scripts/check-maestro.js` | Preflight; prints install hint if Maestro missing |
| `junit/` | JUnit reports (gitignored, uploaded as CI artifact) |

## CI

See `.github/workflows/native.yml`. Runs nightly at 06:00 UTC and on PRs labeled
`mobile`.
```

- [ ] **Step 3: Create `tools/native-tests/.gitignore`**

```
node_modules/
junit/
tmp/
```

- [ ] **Step 4: Install dependencies**

Run:
```sh
cd tools/native-tests && npm install
```
Expected: `package-lock.json` created, `node_modules/` populated, no errors.

- [ ] **Step 5: Commit**

```sh
git add tools/native-tests/package.json tools/native-tests/README.md \
        tools/native-tests/.gitignore tools/native-tests/package-lock.json
git commit -m "scaffold tools/native-tests directory"
```

---

## Task 2: Build the smoke Meteor app source

**Files:**
- Create: `tools/native-tests/apps/smoke/.meteor/packages`
- Create: `tools/native-tests/apps/smoke/.meteor/release`
- Create: `tools/native-tests/apps/smoke/.meteor/.gitignore`
- Create: `tools/native-tests/apps/smoke/package.json`
- Create: `tools/native-tests/apps/smoke/mobile-config.js`
- Create: `tools/native-tests/apps/smoke/client/main.html`
- Create: `tools/native-tests/apps/smoke/client/main.js`
- Create: `tools/native-tests/apps/smoke/client/main.css`
- Create: `tools/native-tests/apps/smoke/server/main.js`
- Create: `tools/native-tests/flows/launch.yaml`

- [ ] **Step 1: Create `apps/smoke/.meteor/packages`**

```
meteor-base
mobile-experience
mongo
ecmascript
standard-minifier-css
standard-minifier-js
es5-shim
shell-server
static-html
tracker
```

- [ ] **Step 2: Create `apps/smoke/.meteor/release`**

```
none
```

This makes the app use whatever Meteor binary invokes it. The repo's `./meteor`
launcher uses the local dev bundle, which is what we want.

- [ ] **Step 3: Create `apps/smoke/.meteor/.gitignore`**

```
local
```

- [ ] **Step 4: Create `apps/smoke/package.json`**

```json
{
  "name": "smoke",
  "private": true,
  "scripts": {
    "start": "meteor run"
  },
  "dependencies": {
    "@babel/runtime": "^7.23.5",
    "meteor-node-stubs": "^1.2.12"
  },
  "meteor": {
    "mainModule": {
      "client": "client/main.js",
      "server": "server/main.js"
    }
  }
}
```

- [ ] **Step 5: Create `apps/smoke/mobile-config.js`**

```js
// Keep `name` space-free so the resulting Xcode scheme and .app bundle have
// predictable paths (xcodebuild -scheme MeteorSmoke). `appId` is the bundle
// identifier Maestro uses to launch the app; it can stay descriptive.
App.info({
  id: "com.meteor.smoke",
  name: "MeteorSmoke",
  description: "Smoke test target for tools/native-tests",
  version: "1.0.0",
});

App.setPreference("WebAppStartupTimeout", "20000");
App.setPreference("DisallowOverscroll", "true");
```

- [ ] **Step 6: Create `apps/smoke/client/main.html`**

```html
<head>
  <title>Smoke</title>
</head>

<body>
  <div id="status">Meteor connecting</div>
  <div id="ddp">DDP connecting</div>
</body>
```

- [ ] **Step 7: Create `apps/smoke/client/main.js`**

```js
import { Meteor } from "meteor/meteor";
import { Tracker } from "meteor/tracker";

Meteor.startup(() => {
  document.getElementById("status").textContent = "Meteor ready";

  Meteor.subscribe("ping");

  Tracker.autorun(() => {
    const status = Meteor.status();
    document.getElementById("ddp").textContent = status.connected
      ? "DDP connected"
      : "DDP connecting";
  });
});
```

- [ ] **Step 8: Create `apps/smoke/client/main.css`**

```css
body {
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  padding: 24px;
  font-size: 20px;
}

#status,
#ddp {
  padding: 8px 0;
}
```

- [ ] **Step 9: Create `apps/smoke/server/main.js`**

```js
import { Meteor } from "meteor/meteor";

Meteor.publish("ping", function () {
  this.ready();
});
```

- [ ] **Step 10: Create `tools/native-tests/flows/launch.yaml`**

```yaml
appId: com.meteor.smoke
---
- launchApp:
    clearState: true
- assertVisible: "Meteor ready"
- assertVisible: "DDP connected"
```

- [ ] **Step 11: Smoke-check the app boots in dev mode** (web only, no device yet)

Run:
```sh
./meteor run --port 3100 --settings /dev/null --no-release-check \
  --directory tools/native-tests/apps/smoke
```
Wait for `App running at: http://localhost:3100`, open it in a browser, verify
the page shows "Meteor ready" and "DDP connected". Stop with Ctrl-C.

If it fails, fix the app source before continuing. The Maestro flow assertions
depend on these exact strings.

- [ ] **Step 12: Commit**

```sh
git add tools/native-tests/apps/smoke tools/native-tests/flows/launch.yaml
git commit -m "add minimal smoke meteor app and launch maestro flow"
```

---

## Task 3: `scripts/check-maestro.js` with tests

**Files:**
- Create: `tools/native-tests/scripts/check-maestro.js`
- Create: `tools/native-tests/scripts/check-maestro.test.js`

- [ ] **Step 1: Write the failing test**

Create `tools/native-tests/scripts/check-maestro.test.js`:
```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { checkMaestro } = require("./check-maestro");

test("returns ok when maestro is on PATH", async () => {
  const result = await checkMaestro({
    exec: async () => ({ stdout: "Maestro 1.40.0", exitCode: 0 }),
  });
  assert.equal(result.ok, true);
  assert.match(result.version, /Maestro/);
});

test("returns not-ok with install hint when missing", async () => {
  const result = await checkMaestro({
    exec: async () => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.hint, /get\.maestro\.mobile\.dev/);
});

test("returns not-ok when maestro exits non-zero", async () => {
  const result = await checkMaestro({
    exec: async () => ({ stdout: "", stderr: "broken", exitCode: 1 }),
  });
  assert.equal(result.ok, false);
  assert.match(result.hint, /get\.maestro\.mobile\.dev/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```sh
cd tools/native-tests && node --test scripts/check-maestro.test.js
```
Expected: failure with "Cannot find module './check-maestro'".

- [ ] **Step 3: Implement `scripts/check-maestro.js`**

```js
const { execa } = require("execa");

const INSTALL_HINT =
  "Maestro is not on PATH. Install with:\n" +
  "  curl -fsSL https://get.maestro.mobile.dev | bash";

async function checkMaestro({ exec = execa } = {}) {
  try {
    const result = await exec("maestro", ["--version"], { reject: false });
    if (result.exitCode === 0) {
      return { ok: true, version: result.stdout.trim() };
    }
    return { ok: false, hint: INSTALL_HINT, stderr: result.stderr };
  } catch (err) {
    return { ok: false, hint: INSTALL_HINT, error: err.message };
  }
}

async function main() {
  const result = await checkMaestro();
  if (result.ok) {
    console.log(`maestro found: ${result.version}`);
    process.exit(0);
  }
  console.error(result.hint);
  process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = { checkMaestro, INSTALL_HINT };
```

Note: `execa` v5 is CommonJS-friendly. If a future bump to v6+ breaks the
require, switch to dynamic `import("execa")` or pin to v5.

- [ ] **Step 4: Run the test to verify it passes**

Run:
```sh
cd tools/native-tests && node --test scripts/check-maestro.test.js
```
Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```sh
git add tools/native-tests/scripts/check-maestro.js \
        tools/native-tests/scripts/check-maestro.test.js
git commit -m "add maestro preflight check with tests"
```

---

## Task 4: `scripts/maestro.js`

**Files:**
- Create: `tools/native-tests/scripts/maestro.js`

This script is a thin wrapper around the maestro CLI. The Maestro CLI itself is
the assertion engine; we just spawn it, point it at a flow and a device, and
surface the exit code.

- [ ] **Step 1: Implement `scripts/maestro.js`**

```js
const { execa } = require("execa");
const path = require("node:path");
const fs = require("fs-extra");

/**
 * Run a single Maestro flow against a device.
 *
 * @param {object} opts
 * @param {string} opts.flowPath  Absolute path to a .yaml flow file.
 * @param {string} opts.deviceId  Device identifier (UDID for iOS, "emulator-5554" for Android).
 * @param {string} opts.junitOut  Absolute path where JUnit XML will be written.
 * @returns {Promise<{exitCode: number}>}
 */
async function runFlow({ flowPath, deviceId, junitOut }) {
  await fs.ensureDir(path.dirname(junitOut));

  const result = await execa(
    "maestro",
    [
      "--device", deviceId,
      "test", flowPath,
      "--format", "junit",
      "--output", junitOut,
    ],
    { reject: false, stdio: "inherit" }
  );

  return { exitCode: result.exitCode };
}

module.exports = { runFlow };
```

- [ ] **Step 2: Commit**

```sh
git add tools/native-tests/scripts/maestro.js
git commit -m "add maestro cli wrapper"
```

---

## Task 5: `scripts/server.js`

**Files:**
- Create: `tools/native-tests/scripts/server.js`
- Create: `tools/native-tests/scripts/server.test.js`

- [ ] **Step 1: Write the failing test for LAN IP resolution**

Create `tools/native-tests/scripts/server.test.js`:
```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveLanIp } = require("./server");

test("returns a non-loopback IPv4 address", () => {
  const ip = resolveLanIp();
  assert.match(ip, /^\d+\.\d+\.\d+\.\d+$/);
  assert.notEqual(ip, "127.0.0.1");
  assert.notEqual(ip, "0.0.0.0");
});

test("prefers the supplied interface name when present", () => {
  const fakeInterfaces = {
    "en0": [
      { family: "IPv4", address: "10.0.0.5", internal: false },
    ],
    "lo0": [
      { family: "IPv4", address: "127.0.0.1", internal: true },
    ],
  };
  const ip = resolveLanIp({ interfaces: fakeInterfaces, prefer: "en0" });
  assert.equal(ip, "10.0.0.5");
});

test("falls back to first non-loopback IPv4 when prefer is missing", () => {
  const fakeInterfaces = {
    "eth0": [
      { family: "IPv4", address: "172.20.0.4", internal: false },
    ],
  };
  const ip = resolveLanIp({ interfaces: fakeInterfaces, prefer: "en0" });
  assert.equal(ip, "172.20.0.4");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```sh
cd tools/native-tests && node --test scripts/server.test.js
```
Expected: failure (module not found).

- [ ] **Step 3: Implement `scripts/server.js`**

```js
const os = require("node:os");
const path = require("node:path");
const { execa } = require("execa");
const waitOn = require("wait-on");

function resolveLanIp({ interfaces = os.networkInterfaces(), prefer } = {}) {
  const flat = [];
  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs || []) {
      if (addr.family === "IPv4" && !addr.internal) {
        flat.push({ name, address: addr.address });
      }
    }
  }
  if (!flat.length) {
    throw new Error("No non-loopback IPv4 interface found");
  }
  if (prefer) {
    const preferred = flat.find((entry) => entry.name === prefer);
    if (preferred) return preferred.address;
  }
  return flat[0].address;
}

/**
 * Start `meteor run` for the smoke app on the chosen LAN IP.
 *
 * @param {object} opts
 * @param {string} opts.appDir   Absolute path to the Meteor app source.
 * @param {string} opts.lanIp    IPv4 address the server should bind to.
 * @param {number} [opts.port]   Defaults to 3000.
 * @param {string} [opts.meteorBin]  Path to the meteor launcher. Defaults to ./meteor at the repo root.
 * @returns {Promise<{stop: () => Promise<void>, url: string}>}
 */
async function startServer({ appDir, lanIp, port = 3000, meteorBin }) {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const meteor = meteorBin || path.join(repoRoot, "meteor");
  const url = `http://${lanIp}:${port}`;

  const child = execa(
    meteor,
    ["run", "--port", `${lanIp}:${port}`],
    {
      cwd: appDir,
      stdio: "inherit",
      reject: false,
      detached: false,
    }
  );

  await waitOn({ resources: [url], timeout: 240_000, interval: 1000 });

  return {
    url,
    async stop() {
      if (child.pid && !child.killed) {
        child.kill("SIGTERM");
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (!child.killed) child.kill("SIGKILL");
      }
    },
  };
}

module.exports = { resolveLanIp, startServer };
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```sh
cd tools/native-tests && node --test scripts/server.test.js
```
Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```sh
git add tools/native-tests/scripts/server.js \
        tools/native-tests/scripts/server.test.js
git commit -m "add meteor server orchestration helper"
```

---

## Task 6: `scripts/build-app.js`

**Files:**
- Create: `tools/native-tests/scripts/build-app.js`

This script copies the smoke app to a tmpdir, adds the requested mobile
platform, and runs `meteor build`. The tmpdir copy keeps the committed source
clean; without it, `meteor add-platform` would mutate `.meteor/platforms` in
the repo.

- [ ] **Step 1: Implement `scripts/build-app.js`**

```js
const path = require("node:path");
const os = require("node:os");
const fs = require("fs-extra");
const { execa } = require("execa");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const METEOR_BIN = path.join(REPO_ROOT, "meteor");
const SMOKE_SRC = path.resolve(__dirname, "..", "apps", "smoke");

/**
 * Return the first child of `dir` whose name matches `regex`, or null.
 */
async function findFirst(dir, regex) {
  if (!(await fs.pathExists(dir))) return null;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (regex.test(e.name)) return path.join(dir, e.name);
  }
  return null;
}

async function compileIosForSimulator({ buildDir }) {
  // `meteor build` produces an Xcode project under <buildDir>/ios/project/.
  // For Maestro to install on the Simulator, we need a compiled .app, so we
  // invoke xcodebuild ourselves. derivedData lives next to the project so the
  // output path is predictable.
  const projectDir = path.join(buildDir, "ios", "project");
  const derivedData = path.join(buildDir, "ios", "derived-data");

  const workspace = await findFirst(projectDir, /\.xcworkspace$/);
  if (!workspace) {
    throw new Error(`No .xcworkspace found in ${projectDir}`);
  }
  // Scheme name matches App.info({ name }) in mobile-config.js (MeteorSmoke).
  await execa(
    "xcodebuild",
    [
      "-workspace", workspace,
      "-scheme", "MeteorSmoke",
      "-configuration", "Debug",
      "-sdk", "iphonesimulator",
      "-destination", "generic/platform=iOS Simulator",
      "-derivedDataPath", derivedData,
      "build",
    ],
    { stdio: "inherit" }
  );

  const productsDir = path.join(
    derivedData, "Build", "Products", "Debug-iphonesimulator"
  );
  const app = await findFirst(productsDir, /\.app$/);
  if (!app) {
    throw new Error(`xcodebuild did not produce a .app in ${productsDir}`);
  }
  return app;
}

/**
 * Prepare a fresh build of the smoke app for one mobile platform.
 *
 * @param {object} opts
 * @param {"ios"|"android"} opts.platform
 * @param {string} opts.lanIp
 * @param {number} [opts.port]
 * @returns {Promise<{appDir: string, buildDir: string, bundlePath: string, mobileServerUrl: string}>}
 */
async function prepareSmokeApp({ platform, lanIp, port = 3000 }) {
  if (platform !== "ios" && platform !== "android") {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const appDir = path.join(os.tmpdir(), `native-smoke-${platform}-${runId}`);
  const buildDir = path.join(appDir, "build-out");
  const mobileServerUrl = `http://${lanIp}:${port}`;

  await fs.copy(SMOKE_SRC, appDir, {
    filter: (src) => !src.includes(path.join(".meteor", "local")),
  });

  await execa(METEOR_BIN, ["add-platform", platform], {
    cwd: appDir,
    stdio: "inherit",
  });

  await execa(
    METEOR_BIN,
    [
      "build", buildDir,
      "--server", `${lanIp}:${port}`,
      "--mobile-server", mobileServerUrl,
    ],
    { cwd: appDir, stdio: "inherit" }
  );

  let bundlePath;
  if (platform === "android") {
    // Meteor's android output produces an apk under <buildDir>/android/.
    // Filename may be `release-unsigned.apk` or vary across cordova versions;
    // glob for any *.apk rather than hardcoding.
    bundlePath = await findFirst(
      path.join(buildDir, "android"),
      /\.apk$/
    );
  } else {
    bundlePath = await compileIosForSimulator({ buildDir });
  }

  if (!bundlePath || !(await fs.pathExists(bundlePath))) {
    throw new Error(
      `Build completed but no installable bundle found for ${platform}.\n` +
      "Inspect the meteor build output above for clues."
    );
  }

  return { appDir, buildDir, bundlePath, mobileServerUrl };
}

/**
 * Remove a tmpdir created by prepareSmokeApp.
 */
async function cleanup(appDir) {
  if (!appDir) return;
  await fs.remove(appDir).catch(() => {});
}

module.exports = { prepareSmokeApp, cleanup };
```

Notes:
- Android: filename for the apk is globbed (`*.apk`) rather than hardcoded.
  Cordova has shipped variants like `release-unsigned.apk`, `app-debug.apk`,
  etc. Globbing avoids breaking on a future rename.
- iOS: `meteor build` produces only the Xcode project. We invoke xcodebuild
  ourselves to compile a Simulator-installable `.app`. The scheme name
  matches `App.info({ name })` in `mobile-config.js`, which is why Task 2
  uses "MeteorSmoke" (no spaces).

- [ ] **Step 2: Commit**

```sh
git add tools/native-tests/scripts/build-app.js
git commit -m "add smoke app build orchestration"
```

---

## Task 7: `scripts/simulator.js`

**Files:**
- Create: `tools/native-tests/scripts/simulator.js`

Single module, two backends (iOS and Android) behind one interface. Cannot be
unit-tested without real devices; verified end-to-end in Task 12.

- [ ] **Step 1: Implement `scripts/simulator.js`**

```js
const { execa } = require("execa");

const BOOT_TIMEOUT_MS = 300_000;
const APP_ID = "com.meteor.smoke";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function bootIos() {
  const deviceName = process.env.MAESTRO_IOS_DEVICE || "iPhone 15";

  await execa("xcrun", ["simctl", "boot", deviceName], { reject: false });
  await execa("xcrun", ["simctl", "bootstatus", deviceName, "-b"]);

  const { stdout } = await execa("xcrun", ["simctl", "list", "devices", "booted", "-j"]);
  const data = JSON.parse(stdout);
  let udid = null;
  for (const list of Object.values(data.devices)) {
    for (const dev of list) {
      if (dev.name === deviceName && dev.state === "Booted") {
        udid = dev.udid;
        break;
      }
    }
    if (udid) break;
  }
  if (!udid) {
    throw new Error(`Could not resolve UDID for booted iOS device "${deviceName}"`);
  }

  return {
    platform: "ios",
    deviceId: udid,
    async install(bundlePath) {
      await execa("xcrun", ["simctl", "install", udid, bundlePath]);
    },
    async uninstall() {
      await execa("xcrun", ["simctl", "uninstall", udid, APP_ID], { reject: false });
    },
    async captureLogs(outPath) {
      const { stdout } = await execa(
        "xcrun",
        ["simctl", "spawn", udid, "log", "show", "--last", "5m", "--style", "compact"],
        { reject: false }
      );
      const fs = require("fs-extra");
      await fs.outputFile(outPath, stdout);
    },
    async shutdown() {
      await execa("xcrun", ["simctl", "shutdown", udid], { reject: false });
    },
  };
}

async function bootAndroid() {
  // On CI, reactivecircus/android-emulator-runner@v2 brings the emulator up
  // before our script runs. Locally, the caller must have run `emulator -avd <name>`
  // beforehand. Either way, `adb wait-for-device` is the right ready gate.
  await execa("adb", ["wait-for-device"]);

  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  let booted = false;
  while (Date.now() < deadline) {
    const { stdout } = await execa(
      "adb",
      ["shell", "getprop", "sys.boot_completed"],
      { reject: false }
    );
    if (stdout.trim() === "1") {
      booted = true;
      break;
    }
    await sleep(2000);
  }
  if (!booted) {
    throw new Error("Android emulator did not reach sys.boot_completed=1 in 5 min");
  }

  const { stdout: devices } = await execa("adb", ["devices"]);
  const match = devices.split("\n").find((l) => /^emulator-\d+\s+device$/.test(l));
  if (!match) {
    throw new Error("No booted Android emulator visible to adb");
  }
  const deviceId = match.split(/\s+/)[0];

  return {
    platform: "android",
    deviceId,
    async install(bundlePath) {
      await execa("adb", ["-s", deviceId, "install", "-r", bundlePath]);
    },
    async uninstall() {
      await execa("adb", ["-s", deviceId, "uninstall", APP_ID], { reject: false });
    },
    async captureLogs(outPath) {
      const { stdout } = await execa(
        "adb",
        ["-s", deviceId, "logcat", "-d"],
        { reject: false }
      );
      const fs = require("fs-extra");
      await fs.outputFile(outPath, stdout);
    },
    async shutdown() {
      // On CI the emulator-runner action handles shutdown. Locally we leave
      // the user's emulator running for fast iteration; uninstall covers cleanup.
    },
  };
}

async function bootSimulator(platform) {
  if (platform === "ios") return bootIos();
  if (platform === "android") return bootAndroid();
  throw new Error(`Unsupported platform: ${platform}`);
}

module.exports = { bootSimulator };
```

- [ ] **Step 2: Commit**

```sh
git add tools/native-tests/scripts/simulator.js
git commit -m "add ios and android simulator backends"
```

---

## Task 8: `scripts/run.js` orchestrator entrypoint

**Files:**
- Create: `tools/native-tests/scripts/run.js`
- Create: `tools/native-tests/scripts/run.test.js`

- [ ] **Step 1: Write the failing test for arg parsing**

Create `tools/native-tests/scripts/run.test.js`:
```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```sh
cd tools/native-tests && node --test scripts/run.test.js
```
Expected: failure (module not found).

- [ ] **Step 3: Implement `scripts/run.js`**

```js
#!/usr/bin/env node
const path = require("node:path");
const fs = require("fs-extra");
const { checkMaestro } = require("./check-maestro");
const { prepareSmokeApp, cleanup: cleanupApp } = require("./build-app");
const { resolveLanIp, startServer } = require("./server");
const { bootSimulator } = require("./simulator");
const { runFlow } = require("./maestro");

const PLATFORMS = new Set(["ios", "android"]);
const FLOW_PATH = path.resolve(__dirname, "..", "flows", "launch.yaml");
const JUNIT_DIR = path.resolve(__dirname, "..", "junit");
const HARD_TIMEOUT_MS = 8 * 60 * 1000;

const EXIT_PASS = 0;
const EXIT_FLOW_FAIL = 1;
const EXIT_INFRA = 2;
const EXIT_FRAMEWORK = 3;

function parseArgs(argv) {
  const out = { platform: null, keepRunning: false };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--keep-running") {
      out.keepRunning = true;
    } else if (token === "--platform") {
      out.platform = argv[++i];
    } else if (token.startsWith("--platform=")) {
      out.platform = token.slice("--platform=".length);
    }
  }
  if (!out.platform) {
    throw new Error("--platform is required (ios or android)");
  }
  if (!PLATFORMS.has(out.platform)) {
    throw new Error(`Unsupported platform: ${out.platform}`);
  }
  return out;
}

async function run(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(err.message);
    return EXIT_FRAMEWORK;
  }

  if (!(await fs.pathExists(FLOW_PATH))) {
    console.error(`Missing flow file: ${FLOW_PATH}`);
    return EXIT_FRAMEWORK;
  }

  const maestro = await checkMaestro();
  if (!maestro.ok) {
    console.error(maestro.hint);
    return EXIT_INFRA;
  }

  const junitOut = path.join(JUNIT_DIR, `${args.platform}-launch.xml`);
  const logOut = path.join(JUNIT_DIR, `${args.platform}-device.log`);
  await fs.ensureDir(JUNIT_DIR);

  const cleanup = [];
  const cleanupAll = async () => {
    while (cleanup.length) {
      const fn = cleanup.pop();
      try { await fn(); } catch (err) {
        console.error("cleanup step failed:", err.message);
      }
    }
  };

  const hardTimeout = setTimeout(() => {
    console.error(`Hard timeout (${HARD_TIMEOUT_MS}ms) reached. Aborting.`);
    cleanupAll().finally(() => process.exit(EXIT_INFRA));
  }, HARD_TIMEOUT_MS);
  hardTimeout.unref();

  try {
    const lanIp = resolveLanIp({ prefer: process.env.MAESTRO_IFACE });
    console.log(`Using LAN IP ${lanIp}`);

    const build = await prepareSmokeApp({ platform: args.platform, lanIp });
    cleanup.push(() => cleanupApp(build.appDir));

    const server = await startServer({ appDir: build.appDir, lanIp });
    cleanup.push(() => server.stop());
    console.log(`Server up at ${server.url}`);

    const sim = await bootSimulator(args.platform);
    cleanup.push(() => sim.uninstall());
    cleanup.push(() => sim.captureLogs(logOut));
    cleanup.push(() => sim.shutdown());

    await sim.install(build.bundlePath);
    console.log(`Installed bundle on ${args.platform} device ${sim.deviceId}`);

    const { exitCode } = await runFlow({
      flowPath: FLOW_PATH,
      deviceId: sim.deviceId,
      junitOut,
    });

    if (exitCode === 0) return EXIT_PASS;
    return EXIT_FLOW_FAIL;
  } catch (err) {
    console.error("Infrastructure failure:", err.message);
    if (err.stack) console.error(err.stack);
    return EXIT_INFRA;
  } finally {
    clearTimeout(hardTimeout);
    if (!process.argv.includes("--keep-running")) {
      await cleanupAll();
    } else {
      console.log("--keep-running: skipping teardown");
    }
  }
}

if (require.main === module) {
  run(process.argv.slice(2)).then((code) => process.exit(code));
}

module.exports = {
  parseArgs,
  run,
  EXIT_PASS,
  EXIT_FLOW_FAIL,
  EXIT_INFRA,
  EXIT_FRAMEWORK,
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```sh
cd tools/native-tests && node --test scripts/run.test.js
```
Expected: all 5 tests pass.

- [ ] **Step 5: Run all unit tests together**

Run:
```sh
cd tools/native-tests && node --test scripts/
```
Expected: every `*.test.js` passes (check-maestro, server, run).

- [ ] **Step 6: Commit**

```sh
git add tools/native-tests/scripts/run.js \
        tools/native-tests/scripts/run.test.js
git commit -m "add native-tests orchestrator entrypoint"
```

---

## Task 9: Wire root `package.json` scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Inspect the current `"scripts"` block**

Run:
```sh
grep -n -A 1 '"install:e2e"' package.json
```
Expected: confirms the surrounding lines so the Edit anchor is unique.

- [ ] **Step 2: Add `install:native` and `test:native` after `test:e2e`**

In `package.json`, change:
```json
    "install:e2e": "cd tools/e2e-tests && npm install && npx playwright install --with-deps chromium chromium-headless-shell",
    "test:e2e": "cd tools/e2e-tests && npm test -- ",
    "create-app:e2e": "cd tools/e2e-tests && node scripts/create-app.js",
```

to:
```json
    "install:e2e": "cd tools/e2e-tests && npm install && npx playwright install --with-deps chromium chromium-headless-shell",
    "test:e2e": "cd tools/e2e-tests && npm test -- ",
    "create-app:e2e": "cd tools/e2e-tests && node scripts/create-app.js",
    "install:native": "cd tools/native-tests && npm install && node scripts/check-maestro.js",
    "test:native": "cd tools/native-tests && npm test --",
```

- [ ] **Step 3: Sanity-check the scripts are registered**

Run:
```sh
npm run --silent 2>&1 | grep -E "install:native|test:native"
```
Expected: both lines printed.

- [ ] **Step 4: Commit**

```sh
git add package.json
git commit -m "add install:native and test:native root scripts"
```

---

## Task 10: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/native.yml`

- [ ] **Step 1: Create `.github/workflows/native.yml`**

```yaml
name: Native mobile smoke tests

on:
  schedule:
    - cron: "0 6 * * *"
  pull_request:
    types: [labeled]

concurrency:
  group: native-${{ github.ref }}
  cancel-in-progress: true

jobs:
  android:
    if: github.event_name == 'schedule' || github.event.label.name == 'mobile'
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "17"
      - name: Enable KVM
        run: |
          echo 'KERNEL=="kvm", GROUP="kvm", MODE="0666"' \
            | sudo tee /etc/udev/rules.d/99-kvm4all.rules
          sudo udevadm control --reload-rules
          sudo udevadm trigger --name-match=kvm
      - name: Install Maestro
        run: |
          curl -fsSL "https://get.maestro.mobile.dev" | bash
          echo "$HOME/.maestro/bin" >> "$GITHUB_PATH"
      - name: Install root deps
        run: npm ci
      - name: Install native-tests deps
        run: npm run install:native
      - name: Run smoke flow on Android emulator
        uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 34
          arch: x86_64
          target: default
          force-avd-creation: false
          emulator-options: -no-window -no-audio -gpu swiftshader_indirect
          script: npm run test:native -- --platform=android
      - name: Upload JUnit and device logs
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: native-android-${{ github.run_id }}
          path: tools/native-tests/junit/

  ios:
    if: github.event_name == 'schedule' || github.event.label.name == 'mobile'
    runs-on: macos-14
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - name: Install Maestro
        run: |
          curl -fsSL "https://get.maestro.mobile.dev" | bash
          echo "$HOME/.maestro/bin" >> "$GITHUB_PATH"
      - name: Install root deps
        run: npm ci
      - name: Install native-tests deps
        run: npm run install:native
      - name: Pre-boot iOS Simulator
        run: |
          xcrun simctl boot "iPhone 15" || true
          xcrun simctl bootstatus "iPhone 15" -b
      - name: Run smoke flow on iOS Simulator
        run: npm run test:native -- --platform=ios
      - name: Upload JUnit and device logs
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: native-ios-${{ github.run_id }}
          path: tools/native-tests/junit/
```

- [ ] **Step 2: Validate the workflow YAML parses**

Run:
```sh
node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/native.yml','utf8'))" \
  || python3 -c "import yaml; yaml.safe_load(open('.github/workflows/native.yml'))"
```
Expected: no output (success).

- [ ] **Step 3: Commit**

```sh
git add .github/workflows/native.yml
git commit -m "add github actions workflow for native mobile smoke tests"
```

---

## Task 11: Update AGENTS.md and testing skill

**Files:**
- Modify: `AGENTS.md`
- Modify: `.github/skills/testing/SKILL.md`

- [ ] **Step 1: Add the new commands to AGENTS.md**

In `AGENTS.md`, change:
```
./meteor test-packages ./packages/<name>     # Package tests (browser UI at localhost:3000)
./packages/test-in-console/run.sh "<name>"   # Package tests (terminal output via Puppeteer)
npm run test:unit                            # Unit tests (Jest)
npm run test:e2e                             # E2E tests (Jest + Playwright)
```

to:
```
./meteor test-packages ./packages/<name>     # Package tests (browser UI at localhost:3000)
./packages/test-in-console/run.sh "<name>"   # Package tests (terminal output via Puppeteer)
npm run test:unit                            # Unit tests (Jest)
npm run test:e2e                             # E2E tests (Jest + Playwright)
npm run test:native -- --platform=android    # Native mobile smoke tests (Maestro)
```

- [ ] **Step 2: Add an entry to the testing skill's command table**

In `.github/skills/testing/SKILL.md`, find the "E2E tests (Jest + Playwright)" code fence and append below `npm run test:e2e -- -t="React"`:
```bash
# Native mobile smoke tests (Maestro)
npm run install:native                       # Install deps, verify Maestro CLI on PATH
npm run test:native -- --platform=android    # Run Android smoke flow
npm run test:native -- --platform=ios        # Run iOS smoke flow
```

Then after the `## E2E Tests (`tools/e2e-tests/`)` section, add a sibling section:
```markdown
## Native mobile smoke tests (`tools/native-tests/`)

Plain Node orchestrator + Maestro YAML flows. Builds a minimal Meteor app for
Cordova, installs it on an iOS Simulator or Android emulator, asserts the app
launches and DDP connects. Runs nightly in CI plus on PRs labeled `mobile`.

**Local prerequisites:** Maestro CLI (`curl -fsSL https://get.maestro.mobile.dev | bash`),
Xcode (iOS), Android SDK + emulator (Android).

**Tests:** `flows/launch.yaml` against `apps/smoke/`.
```

- [ ] **Step 3: Commit**

```sh
git add AGENTS.md .github/skills/testing/SKILL.md
git commit -m "document native mobile smoke test surface"
```

---

## Task 12: Local end-to-end verification

**Files:** none modified; this is verification only.

These steps are manual and depend on host setup. If you don't have one of the
platforms locally, skip its sub-task and rely on CI for that platform.

- [ ] **Step 1: Verify the preflight passes**

Run:
```sh
npm run install:native
```
Expected: deps install, final output `maestro found: Maestro <version>`. If
missing, install Maestro via the printed hint and retry.

- [ ] **Step 2: Verify Android run end-to-end**

Boot an Android emulator first (any API 33+ AVD):
```sh
$ANDROID_HOME/emulator/emulator -avd <your-avd-name> -no-window -no-audio &
adb wait-for-device
```

Then run:
```sh
npm run test:native -- --platform=android
```

Expected console output:
- `Using LAN IP <ip>`
- `meteor build` output
- `Server up at http://<ip>:3000`
- `Installed bundle on android device emulator-5554`
- Maestro flow output ending in `✓ Flow Passed: launch.yaml` (or similar)
- Process exits 0

A JUnit report appears at `tools/native-tests/junit/android-launch.xml`.

- [ ] **Step 3: Verify iOS run end-to-end** (macOS only)

Run:
```sh
xcrun simctl boot "iPhone 15" || true
xcrun simctl bootstatus "iPhone 15" -b
npm run test:native -- --platform=ios
```

Same expectations as Android. JUnit at `tools/native-tests/junit/ios-launch.xml`.

- [ ] **Step 4: Verify the failure path is clear**

Edit `apps/smoke/client/main.js` and replace `"Meteor ready"` with `"Meteor BROKEN"`.
Run `npm run test:native -- --platform=android` again. Expected: exit 1, the
Maestro output reports the failing `assertVisible: "Meteor ready"` step, and
`junit/android-launch.xml` contains a `<failure>` element.

Revert the edit before committing anything else.

- [ ] **Step 5: No commit**

Verification only. The plan is complete once local runs pass on at least one
platform; CI exercises both.

---

## Out of scope (deferred)

These are deliberately not in this plan and have a designed-around seam:

| Future work | Seam |
|-------------|------|
| Hot-code-push flow | Drop a second YAML into `flows/`. Have `run.js` iterate `flows/*.yaml` if more than one exists. |
| Capacitor wrapper | Add `wrapper` param to `prepareSmokeApp`; today's body becomes the `cordova` branch. |
| Skeleton matrix | Add more dirs under `apps/`; `run.js` learns `--app=<name>` (default `smoke`). |
| Real device farm | `bootSimulator` interface stays; a third backend (e.g., BrowserStack tunnel) joins. |
