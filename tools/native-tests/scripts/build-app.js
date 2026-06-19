const path = require("node:path");
const os = require("node:os");
const fs = require("fs-extra");
const execa = require("execa");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const METEOR_BIN = path.join(REPO_ROOT, "meteor");
const CAPACITOR_PACKAGE_DIR = path.join(REPO_ROOT, "npm-packages", "meteor-capacitor");

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

async function compileIosForSimulator({ buildDir, scheme }) {
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
  await execa(
    "xcodebuild",
    [
      "-workspace", workspace,
      "-scheme", scheme,
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

async function copyAppSource(sourceDir, appDir) {
  await fs.copy(sourceDir, appDir, {
    filter: (src) => !src.includes(path.join(".meteor", "local")),
  });
}

async function installAppDeps(appDir) {
  await execa(METEOR_BIN, ["npm", "install"], {
    cwd: appDir,
    stdio: "inherit",
  });
}

async function linkLocalCapacitor(appDir) {
  if (process.env.NPM_LINK_CAPACITOR === "false") {
    console.warn("NPM_LINK_CAPACITOR=false, using app dependency for @meteorjs/capacitor.");
    return;
  }

  await execa(
    "npm",
    ["install", CAPACITOR_PACKAGE_DIR, "--save-dev", "--no-package-lock"],
    {
      cwd: appDir,
      stdio: "inherit",
    }
  );
}

async function addPlatform(appDir, platform) {
  await execa(METEOR_BIN, ["add-platform", platform], {
    cwd: appDir,
    stdio: "inherit",
  });
}

async function prepareCordovaApp({ appConfig, platform, lanIp, port = 3000 }) {
  if (platform !== "ios" && platform !== "android") {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const workDir = path.join(os.tmpdir(), `native-${appConfig.name}-${platform}-${runId}`);
  const appDir = path.join(workDir, "app");
  const buildDir = path.join(workDir, "build-out");
  const mobileServerUrl = `http://${lanIp}:${port}`;

  await copyAppSource(appConfig.sourceDir, appDir);
  await installAppDeps(appDir);
  await addPlatform(appDir, platform);

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
    bundlePath = await findFirst(
      path.join(buildDir, "android"),
      /\.apk$/
    );
  } else {
    bundlePath = await compileIosForSimulator({
      buildDir,
      scheme: appConfig.appName,
    });
  }

  if (!bundlePath || !(await fs.pathExists(bundlePath))) {
    throw new Error(
      `Build completed but no installable bundle found for ${platform}.\n` +
      "Inspect the meteor build output above for clues."
    );
  }

  return {
    workDir,
    appDir,
    buildDir,
    bundlePath,
    mobileServerUrl,
    wrapper: appConfig.wrapper,
  };
}

async function prepareCapacitorApp({ appConfig, platform, lanIp, port = 3000 }) {
  if (platform !== "ios" && platform !== "android") {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const workDir = path.join(os.tmpdir(), `native-${appConfig.name}-${platform}-${runId}`);
  const appDir = path.join(workDir, "app");
  const mobileServerUrl = `http://${lanIp}:${port}`;

  await copyAppSource(appConfig.sourceDir, appDir);
  await installAppDeps(appDir);
  await linkLocalCapacitor(appDir);
  await addPlatform(appDir, platform);

  return {
    workDir,
    appDir,
    mobileServerUrl,
    wrapper: appConfig.wrapper,
  };
}

async function prepareApp({ appConfig, platform, lanIp, port = 3000 }) {
  if (appConfig.wrapper === "capacitor") {
    return prepareCapacitorApp({ appConfig, platform, lanIp, port });
  }
  if (appConfig.wrapper === "cordova") {
    return prepareCordovaApp({ appConfig, platform, lanIp, port });
  }
  throw new Error(`Unsupported native app wrapper: ${appConfig.wrapper}`);
}

async function prepareSmokeApp({ platform, lanIp, port = 3000 }) {
  const { getAppConfig } = require("./app-config");
  return prepareApp({
    appConfig: getAppConfig("smoke"),
    platform,
    lanIp,
    port,
  });
}

/**
 * Remove a tmpdir created by prepareSmokeApp.
 */
async function cleanup(dir) {
  if (!dir) return;
  await fs.remove(dir).catch(() => {});
}

module.exports = {
  prepareApp,
  prepareSmokeApp,
  cleanup,
};
