const path = require("node:path");
const os = require("node:os");
const fs = require("fs-extra");
const execa = require("execa");

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
  const workDir = path.join(os.tmpdir(), `native-smoke-${platform}-${runId}`);
  const appDir = path.join(workDir, "app");
  const buildDir = path.join(workDir, "build-out");
  const mobileServerUrl = `http://${lanIp}:${port}`;

  await fs.copy(SMOKE_SRC, appDir, {
    filter: (src) => !src.includes(path.join(".meteor", "local")),
  });

  await execa(METEOR_BIN, ["npm", "install"], {
    cwd: appDir,
    stdio: "inherit",
  });

  await execa(METEOR_BIN, ["add-platform", platform], {
    cwd: appDir,
    stdio: "inherit",
  });

  await execa(
    METEOR_BIN,
    [
      "build", buildDir,
      "--debug",
      "--server", mobileServerUrl,
      ...(platform === "android" ? ["--packageType", "apk"] : []),
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

  return { workDir, appDir, buildDir, bundlePath, mobileServerUrl };
}

/**
 * Remove a tmpdir created by prepareSmokeApp.
 */
async function cleanup(dir) {
  if (!dir) return;
  await fs.remove(dir).catch(() => {});
}

module.exports = { prepareSmokeApp, cleanup };
