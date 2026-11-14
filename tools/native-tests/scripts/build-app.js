const path = require("node:path");
const os = require("node:os");
const fs = require("fs-extra");
const execa = require("execa");
const { buildNativeTestEnv } = require("./env");
const { configureLocalMeteorWebappPlugin } = require("./cordova-plugin-override");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const METEOR_BIN = path.join(REPO_ROOT, "meteor");
const CAPACITOR_PACKAGE_DIR = path.join(REPO_ROOT, "npm-packages", "meteor-capacitor");
const METEOR_WEBAPP_PLUGIN_DIR = path.join(REPO_ROOT, "npm-packages", "cordova-plugin-meteor-webapp");
const NPM_QUIET_INSTALL_FLAGS = ["--no-audit", "--no-fund"];

const CAPACITOR_WEB_APP_LOCAL_SERVER_BRIDGE = [
  "<script type=\"text/javascript\">",
  "(function() {",
  "if (window.WebAppLocalServer) return;",
  "var _P;",
  "function getPlugin() {",
  "if (!_P) _P = ((window.Capacitor || {}).Plugins || {}).CapacitorMeteorWebApp;",
  "if (!_P) console.warn(\"WebAppLocalServer shim: CapacitorMeteorWebApp plugin not available\");",
  "return _P;",
  "}",
  "window.WebAppLocalServer = {",
  "startupDidComplete(callback) { var P = getPlugin(); if (!P) return; P.startupDidComplete().then(function() { if (callback) callback(); }).catch(function(error) { console.error(\"WebAppLocalServer.startupDidComplete() failed:\", error); }); },",
  "checkForUpdates(callback) { var P = getPlugin(); if (!P) return; P.checkForUpdates().then(function() { if (callback) callback(); }).catch(function(error) { console.error(\"WebAppLocalServer.checkForUpdates() failed:\", error); }); },",
  "onNewVersionReady(callback) { var P = getPlugin(); if (!P) return; P.addListener(\"updateAvailable\", function(event) { callback(event.version); }); },",
  "switchToPendingVersion(callback, errorCallback) { var P = getPlugin(); if (!P) return; P.reload().then(function() { if (callback) callback(); }).catch(function(error) { console.error(\"switchToPendingVersion failed:\", error); if (typeof errorCallback === \"function\") errorCallback(error); }); },",
  "onError(callback) { var P = getPlugin(); if (!P) return; P.addListener(\"error\", function(event) { var error = new Error(event.message || \"Unknown CapacitorMeteorWebApp error\"); callback(error); }); },",
  "localFileSystemUrl(_fileUrl) { throw new Error(\"Local filesystem URLs not supported by Capacitor\"); }",
  "};",
  "})();",
  "</script>",
].join("");

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

function buildIosSimulatorArgs({ workspace, derivedData }) {
  const scheme = path.basename(workspace, ".xcworkspace");
  return [
    "-workspace", workspace,
    "-scheme", scheme,
    "-configuration", "Debug",
    "-sdk", "iphonesimulator",
    "-destination", "generic/platform=iOS Simulator",
    "-derivedDataPath", derivedData,
    "build",
  ];
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
  await execa(
    "xcodebuild",
    buildIosSimulatorArgs({ workspace, derivedData }),
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

function buildMeteorNpmInstallArgs() {
  return ["npm", "install", ...NPM_QUIET_INSTALL_FLAGS];
}

function buildLocalCapacitorInstallArgs(packageDir = CAPACITOR_PACKAGE_DIR) {
  return [
    "install",
    packageDir,
    "--save-dev",
    "--no-package-lock",
    ...NPM_QUIET_INSTALL_FLAGS,
  ];
}

async function installAppDeps(appDir) {
  await execa(METEOR_BIN, buildMeteorNpmInstallArgs(), {
    cwd: appDir,
    env: buildNativeTestEnv(),
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
    buildLocalCapacitorInstallArgs(),
    {
      cwd: appDir,
      env: buildNativeTestEnv(),
      stdio: "inherit",
    }
  );
}

async function addPlatform(appDir, platform) {
  await execa(METEOR_BIN, ["add-platform", platform], {
    cwd: appDir,
    env: buildNativeTestEnv(),
    stdio: "inherit",
  });
}

function buildMeteorBuildArgs({ buildDir, mobileServerUrl, platform }) {
  return [
    "build",
    buildDir,
    "--directory",
    "--server",
    mobileServerUrl,
    `--platforms=${platform}`,
  ];
}

function getCapacitorAndroidDebugApkPath(appDir) {
  return path.join(
    appDir,
    "android",
    "app",
    "build",
    "outputs",
    "apk",
    "debug",
    "app-debug.apk"
  );
}

function getCapacitorIosWorkspacePath(appDir) {
  return path.join(appDir, "ios", "App", "App.xcworkspace");
}

async function getCapacitorIosBuildTarget(appDir) {
  const workspace = getCapacitorIosWorkspacePath(appDir);
  if (await fs.pathExists(workspace)) return ["-workspace", workspace];
  const project = path.join(appDir, "ios", "App", "App.xcodeproj");
  if (await fs.pathExists(project)) return ["-project", project];
  throw new Error(`No Capacitor iOS workspace or project found in ${path.dirname(project)}`);
}

function getCapacitorIosDerivedDataPath(appDir) {
  return path.join(appDir, "ios", "derived-data");
}

function getCapacitorNativeProdPath(appDir) {
  return path.join(appDir, "_build", "native-prod");
}

function getCapacitorBuildWebCordovaPath(buildDir) {
  return path.join(buildDir, "bundle", "programs", "web.cordova");
}

function getCapacitorBuildCleanupPaths(appDir) {
  return [
    getCapacitorNativeProdPath(appDir),
    path.join(appDir, ".meteor", "local", "build", "programs", "web.cordova"),
  ];
}

async function cleanupCapacitorBuildInputs(appDir) {
  await Promise.all(
    getCapacitorBuildCleanupPaths(appDir).map((buildPath) => fs.remove(buildPath))
  );
}

async function prepareCordovaApp({
  appConfig,
  platform,
  lanIp,
  mobileServerUrl = `http://${lanIp}:${port}`,
  port = 3000,
}) {
  if (platform !== "ios" && platform !== "android") {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const workDir = path.join(os.tmpdir(), `native-${appConfig.name}-${platform}-${runId}`);
  const appDir = path.join(workDir, "app");
  const buildDir = path.join(workDir, "build-out");
  await copyAppSource(appConfig.sourceDir, appDir);
  await configureLocalMeteorWebappPlugin({ appDir, pluginDir: METEOR_WEBAPP_PLUGIN_DIR });
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
    { cwd: appDir, env: buildNativeTestEnv(), stdio: "inherit" }
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

async function prepareCapacitorRunApp({
  appConfig,
  platform,
  lanIp,
  mobileServerUrl = `http://${lanIp}:${port}`,
  port = 3000,
}) {
  if (platform !== "ios" && platform !== "android") {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const workDir = path.join(os.tmpdir(), `native-${appConfig.name}-${platform}-${runId}`);
  const appDir = path.join(workDir, "app");
  await copyAppSource(appConfig.sourceDir, appDir);
  await installAppDeps(appDir);
  await linkLocalCapacitor(appDir);
  await addPlatform(appDir, platform);

  return {
    workDir,
    appDir,
    mobileServerUrl,
    wrapper: appConfig.wrapper,
    mode: "run",
  };
}

async function compileCapacitorAndroidForEmulator({ appDir }) {
  const androidDir = path.join(appDir, "android");
  const gradlew = path.join(
    androidDir,
    process.platform === "win32" ? "gradlew.bat" : "gradlew"
  );

  await execa(gradlew, [":app:assembleDebug"], {
    cwd: androidDir,
    env: buildNativeTestEnv(),
    stdio: "inherit",
  });

  const apkPath = getCapacitorAndroidDebugApkPath(appDir);
  if (!(await fs.pathExists(apkPath))) {
    throw new Error(`Gradle did not produce an APK at ${apkPath}`);
  }
  return apkPath;
}

async function compileCapacitorIosForSimulator({ appDir }) {
  const target = await getCapacitorIosBuildTarget(appDir);
  const derivedData = getCapacitorIosDerivedDataPath(appDir);

  await execa(
    "xcodebuild",
    [
      ...target,
      "-scheme", "App",
      "-configuration", "Debug",
      "-sdk", "iphonesimulator",
      "-destination", "generic/platform=iOS Simulator",
      "-derivedDataPath", derivedData,
      "-quiet",
      "build",
    ],
    { stdio: "inherit" }
  );

  const productsDir = path.join(
    derivedData,
    "Build",
    "Products",
    "Debug-iphonesimulator"
  );
  const app = await findFirst(productsDir, /\.app$/);
  if (!app) {
    throw new Error(`xcodebuild did not produce a .app in ${productsDir}`);
  }
  return app;
}

function getCapacitorBuildHcpModeForNativeTestMode(mode) {
  return mode === "hcp" ? "webapp" : "none";
}

async function prepareCapacitorBuildApp({
  appConfig,
  platform,
  lanIp,
  mobileServerUrl = `http://${lanIp}:${port}`,
  port = 3000,
  hcpMode = "none",
}) {
  if (platform !== "ios" && platform !== "android") {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const workDir = path.join(os.tmpdir(), `native-${appConfig.name}-${platform}-build-${runId}`);
  const appDir = path.join(workDir, "app");
  const buildDir = path.join(workDir, "build-out");
  await copyAppSource(appConfig.sourceDir, appDir);
  await installAppDeps(appDir);
  await linkLocalCapacitor(appDir);
  const manifestPath = path.join(appDir, "package.json");
  const manifest = await fs.readJson(manifestPath);
  manifest.meteor = {
    ...manifest.meteor,
    capacitor: { ...manifest.meteor?.capacitor, hcp: hcpMode },
  };
  await fs.writeJson(manifestPath, manifest, { spaces: 2 });
  await addPlatform(appDir, platform);
  await cleanupCapacitorBuildInputs(appDir);

  const buildEnv = buildNativeTestEnv();
  if (platform === "android") {
    // Release packaging uses an isolated test key, never a developer's key.
    buildEnv.NATIVE_TEST_KEYSTORE = path.join(workDir, "native-test.keystore");
    buildEnv.NATIVE_TEST_KEYSTORE_PASSWORD = "meteor-native-test";
    await execa("keytool", [
      "-genkeypair", "-keystore", buildEnv.NATIVE_TEST_KEYSTORE,
      "-storepass", buildEnv.NATIVE_TEST_KEYSTORE_PASSWORD,
      "-keypass", buildEnv.NATIVE_TEST_KEYSTORE_PASSWORD,
      "-alias", "native-test", "-dname", "CN=Meteor Native Tests",
      "-keyalg", "RSA", "-keysize", "2048", "-validity", "7", "-storetype", "JKS",
    ], { env: buildEnv });
  }
  await execa(
    METEOR_BIN,
    buildMeteorBuildArgs({ buildDir, mobileServerUrl, platform }),
    { cwd: appDir, env: buildEnv, stdio: "inherit" }
  );

  await validateCapacitorBuildOutput({ appDir, platform, mobileServerUrl, hcpMode });

  const bundlePath = platform === "android"
    ? await compileCapacitorAndroidForEmulator({ appDir })
    : await compileCapacitorIosForSimulator({ appDir });

  return {
    workDir,
    appDir,
    buildDir,
    bundlePath,
    mobileServerUrl,
    wrapper: appConfig.wrapper,
    mode: "build",
  };
}

async function validateCapacitorBuildOutput({ appDir, platform, mobileServerUrl, hcpMode }) {
  const webDir = getCapacitorNativeProdPath(appDir);
  const html = await fs.readFile(path.join(webDir, "index.html"), "utf8");
  const match = html.match(/__meteor_runtime_config__ = JSON\.parse\(decodeURIComponent\((.+?)\)\);/);
  if (!match) throw new Error("Meteor build produced an incomplete Capacitor runtime config");
  const config = JSON.parse(decodeURIComponent(JSON.parse(match[1])));
  for (const name of ["ROOT_URL", "DDP_DEFAULT_CONNECTION_URL"]) {
    if (new URL(config[name]).href !== new URL(mobileServerUrl).href) {
      throw new Error(`Meteor build produced ${name}=${config[name]}; expected ${mobileServerUrl}`);
    }
  }
  const hasProgram = await fs.pathExists(path.join(webDir, "program.json"));
  if (hasProgram !== (hcpMode === "webapp")) {
    throw new Error(`Meteor build produced the wrong manifest for HCP mode ${hcpMode}`);
  }
  const nativeDir = platform === "android"
    ? path.join(appDir, "android", "app", "src", "main", "assets", "public")
    : path.join(appDir, "ios", "App", "App", "public");
  if (await fs.readFile(path.join(nativeDir, "index.html"), "utf8") !== html) {
    throw new Error("Meteor build did not synchronize the generated Capacitor index");
  }
}

async function prepareApp({
  appConfig,
  platform,
  lanIp,
  mobileServerUrl = `http://${lanIp}:${port}`,
  port = 3000,
  mode = "run",
}) {
  if (appConfig.wrapper === "capacitor") {
    if (mode === "build" || mode === "hcp") {
      return prepareCapacitorBuildApp({
        appConfig,
        platform,
        lanIp,
        mobileServerUrl,
        port,
        hcpMode: getCapacitorBuildHcpModeForNativeTestMode(mode),
      });
    }
    return prepareCapacitorRunApp({
      appConfig,
      platform,
      lanIp,
      mobileServerUrl,
      port,
    });
  }
  if (appConfig.wrapper === "cordova") {
    return prepareCordovaApp({
      appConfig,
      platform,
      lanIp,
      mobileServerUrl,
      port,
    });
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
  buildIosSimulatorArgs,
  buildMeteorBuildArgs,
  buildMeteorNpmInstallArgs,
  buildLocalCapacitorInstallArgs,
  getCapacitorAndroidDebugApkPath,
  getCapacitorBuildWebCordovaPath,
  getCapacitorBuildCleanupPaths,
  getCapacitorBuildHcpModeForNativeTestMode,
  getCapacitorIosDerivedDataPath,
  getCapacitorIosWorkspacePath,
  getCapacitorIosBuildTarget,
  validateCapacitorBuildOutput,
  prepareApp,
  prepareSmokeApp,
  cleanup,
};
