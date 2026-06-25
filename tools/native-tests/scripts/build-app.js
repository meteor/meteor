const path = require("node:path");
const os = require("node:os");
const { createHash } = require("node:crypto");
const fs = require("fs-extra");
const execa = require("execa");
const { buildNativeTestEnv } = require("./env");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const METEOR_BIN = path.join(REPO_ROOT, "meteor");
const CAPACITOR_PACKAGE_DIR = path.join(REPO_ROOT, "npm-packages", "meteor-capacitor");
const NPM_QUIET_INSTALL_FLAGS = ["--no-audit", "--no-fund"];
const CAPACITOR_WEB_APP_LOCAL_SERVER_SHIM = [
  "<script type=\"text/javascript\">",
  "var WebAppLocalServer = (function () {",
  "var newVersionReadyCallbacks = [];",
  "return {",
  "onError() {},",
  "onNewVersionReady(callback) {",
  "if (typeof callback === \"function\") {",
  "newVersionReadyCallbacks.push(callback);",
  "}",
  "},",
  "startupDidComplete(callback) { if (typeof callback === \"function\") callback(); },",
  "switchToPendingVersion(callback) { if (typeof callback === \"function\") callback(); },",
  "checkForUpdates(callback) { if (typeof callback === \"function\") callback(); }",
  "};",
  "}());",
  "</script>",
].join("");
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
      "-quiet",
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

async function readMeteorAppIdentifier(appDir, env = process.env) {
  if (env.APP_ID) {
    return env.APP_ID;
  }

  const identifierPath = path.join(appDir, ".meteor", ".id");
  try {
    const content = await fs.readFile(identifierPath, "utf8");
    const id = content
      .split(/\r?\n/)
      .map((line) => line.replace(/#.*/, "").trim())
      .find(Boolean);

    if (id) {
      return id;
    }
  } catch {
    // Created by Meteor project context during build/run; fallback keeps unit
    // tests and unusual app layouts deterministic.
  }

  return env.METEOR_APP_ID || "meteor-app";
}

function hashClientProgram(manifest, includeFilter, runtimeConfig = {}) {
  const hash = createHash("sha1");
  hash.update(JSON.stringify(runtimeConfig));

  for (const resource of manifest || []) {
    if (
      (resource.where === "client" || resource.where === "internal") &&
      (!includeFilter || includeFilter(resource.type, resource.replaceable))
    ) {
      hash.update(resource.path || "");
      hash.update(resource.hash || "");
    }
  }

  return hash.digest("hex");
}

function normalizeWebProgramVersions(program, runtimeConfig = {}) {
  const normalized = { ...program };
  const manifest = Array.isArray(normalized.manifest) ? normalized.manifest : [];
  const autoupdateVersion = process.env.AUTOUPDATE_VERSION;

  normalized.version = normalized.version || autoupdateVersion ||
    hashClientProgram(manifest, null, runtimeConfig);
  normalized.versionRefreshable = normalized.versionRefreshable || autoupdateVersion ||
    hashClientProgram(manifest, (type) => type === "css", runtimeConfig);
  normalized.versionNonRefreshable = normalized.versionNonRefreshable || autoupdateVersion ||
    hashClientProgram(
      manifest,
      (type, replaceable) => type !== "css" && !replaceable,
      runtimeConfig
    );
  normalized.versionReplaceable = normalized.versionReplaceable || autoupdateVersion ||
    hashClientProgram(
      manifest,
      (_type, replaceable) => replaceable,
      runtimeConfig
    );

  return normalized;
}

function stripUrlPrefix(url, prefix) {
  if (!prefix || typeof url !== "string" || !url.startsWith(prefix)) {
    return url;
  }

  return `/${url.slice(prefix.length)}`;
}

function normalizeWebProgramAssetUrls(program, { stripPrefix } = {}) {
  const normalized = { ...program };
  const manifest = Array.isArray(normalized.manifest) ? normalized.manifest : [];

  normalized.manifest = manifest.map((resource) => {
    if (!resource || typeof resource !== "object") {
      return resource;
    }

    let next = resource;
    for (const key of ["url", "sourceMapUrl"]) {
      const value = resource[key];
      const stripped = stripUrlPrefix(value, stripPrefix);
      if (stripped !== value) {
        if (next === resource) {
          next = { ...resource };
        }
        next[key] = stripped;
      }
    }

    return next;
  });

  return normalized;
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

function adaptCapacitorAssetUrl(url) {
  return String(url || "").replace(/__cordova\//g, "");
}

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderCapacitorBuildIndexHtml({
  appId,
  body,
  head,
  hcpMode = "webapp",
  mobileServerUrl,
  program,
}) {
  program = normalizeWebProgramVersions(
    normalizeWebProgramAssetUrls(program, { stripPrefix: "/__cordova/" })
  );
  const manifest = Array.isArray(program.manifest) ? program.manifest : [];
  const rootUrl = mobileServerUrl;
  const parsedUrl = new URL(mobileServerUrl);
  const rootUrlPathPrefix = parsedUrl.pathname.replace(/\/$/, "") || "";
  const runtimeConfig = {
    meteorRelease: "none",
    ROOT_URL: rootUrl,
    ROOT_URL_PATH_PREFIX: rootUrlPathPrefix,
    DDP_DEFAULT_CONNECTION_URL: rootUrl,
    autoupdate: {
      versions: {
        "web.cordova": {
          version: program.version,
          versionRefreshable: program.versionRefreshable,
          versionNonRefreshable: program.versionNonRefreshable,
          versionReplaceable: program.versionReplaceable,
        },
      },
    },
    appId,
    meteorEnv: {
      NODE_ENV: "production",
      TEST_METADATA: process.env.TEST_METADATA || "{}",
    },
  };
  const encodedRuntimeConfig = JSON.stringify(
    encodeURIComponent(JSON.stringify(runtimeConfig))
  );
  const cssTags = manifest
    .filter((file) => file.where === "client" && file.type === "css")
    .map((file) =>
      `  <link rel="stylesheet" type="text/css" class="__meteor-css__" href="${escapeAttribute(adaptCapacitorAssetUrl(file.url))}">`
    )
    .join("\n");
  const jsTags = manifest
    .filter((file) => file.where === "client" && file.type === "js")
    .map((file) =>
      `  <script type="text/javascript" src="${escapeAttribute(adaptCapacitorAssetUrl(file.url))}"></script>`
    )
    .join("\n");

  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    "  <meta charset=\"utf-8\">",
    "  <meta name=\"format-detection\" content=\"telephone=no\">",
    "  <meta name=\"viewport\" content=\"user-scalable=no, initial-scale=1, maximum-scale=1, minimum-scale=1, width=device-width, height=device-height, viewport-fit=cover\">",
    "  <meta name=\"msapplication-tap-highlight\" content=\"no\">",
    "  <meta http-equiv=\"Content-Security-Policy\" content=\"default-src * android-webview-video-poster: gap: data: blob: 'unsafe-inline' 'unsafe-eval' ws: wss:;\">",
    hcpMode === "webapp"
      ? `  ${CAPACITOR_WEB_APP_LOCAL_SERVER_BRIDGE}`
      : `  ${CAPACITOR_WEB_APP_LOCAL_SERVER_SHIM}`,
    cssTags,
    head,
    "  <script type=\"text/javascript\">",
    `    __meteor_runtime_config__ = JSON.parse(decodeURIComponent(${encodedRuntimeConfig}));`,
    "  </script>",
    jsTags,
    "</head>",
    "<body>",
    body,
    "</body>",
    "</html>",
  ].filter(Boolean).join("\n");
}

function getCapacitorProductionExcludedFiles({ hcpMode = "webapp" } = {}) {
  const files = ["head.html", "body.html"];
  return hcpMode === "webapp" ? files : ["program.json", ...files];
}

async function syncCapacitorProductionWebDir({
  appConfig,
  appDir,
  buildDir,
  hcpMode = "webapp",
  mobileServerUrl,
}) {
  const sourceDir = getCapacitorBuildWebCordovaPath(buildDir);
  const targetDir = getCapacitorNativeProdPath(appDir);
  const programJsonPath = path.join(sourceDir, "program.json");
  const excludedFiles = getCapacitorProductionExcludedFiles({ hcpMode });

  if (!(await fs.pathExists(programJsonPath))) {
    throw new Error(`Meteor build did not produce ${programJsonPath}`);
  }

  const program = normalizeWebProgramVersions(
    normalizeWebProgramAssetUrls(await fs.readJson(programJsonPath), {
      stripPrefix: "/__cordova/",
    })
  );
  await fs.remove(targetDir);
  await fs.copy(sourceDir, targetDir, {
    filter: (src) => !excludedFiles.includes(path.basename(src)),
  });
  if (hcpMode === "webapp") {
    await fs.remove(path.join(targetDir, "program.json"));
    await fs.writeJson(path.join(targetDir, "program.json"), program, { spaces: 2 });
  }
  const [head, body] = await Promise.all([
    fs.readFile(path.join(sourceDir, "head.html"), "utf8"),
    fs.readFile(path.join(sourceDir, "body.html"), "utf8"),
  ]);
  const appId = await readMeteorAppIdentifier(appDir);
  await fs.writeFile(
    path.join(targetDir, "index.html"),
    renderCapacitorBuildIndexHtml({
      appId,
      body,
      head,
      hcpMode,
      mobileServerUrl,
      program,
    }),
    "utf8"
  );
}

async function syncCapacitorNativeProject({ appDir, mobileServerUrl, platform }) {
  await execa("npx", ["cap", "sync", platform], {
    cwd: appDir,
    env: buildNativeTestEnv(process.env, {
      NODE_ENV: "production",
      ROOT_URL: mobileServerUrl,
      DDP_DEFAULT_CONNECTION_URL: mobileServerUrl,
      METEOR_CAPACITOR: "true",
      METEOR_CAPACITOR_MODE: "bundled",
      METEOR_CAPACITOR_PLATFORM: platform,
      METEOR_BUILD: "true",
      METEOR_NATIVE_ANDROID: platform === "android" ? "true" : "false",
      METEOR_NATIVE_IOS: platform === "ios" ? "true" : "false",
    }),
    stdio: "inherit",
  });
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
  const workspace = getCapacitorIosWorkspacePath(appDir);
  const derivedData = getCapacitorIosDerivedDataPath(appDir);

  if (!(await fs.pathExists(workspace))) {
    throw new Error(`No Capacitor iOS workspace found at ${workspace}`);
  }

  await execa(
    "xcodebuild",
    [
      "-workspace", workspace,
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
  await addPlatform(appDir, platform);
  await cleanupCapacitorBuildInputs(appDir);

  await execa(
    METEOR_BIN,
    buildMeteorBuildArgs({ buildDir, mobileServerUrl, platform }),
    { cwd: appDir, env: buildNativeTestEnv(), stdio: "inherit" }
  );

  await syncCapacitorProductionWebDir({
    appConfig,
    appDir,
    buildDir,
    hcpMode,
    mobileServerUrl,
  });

  const nativeProdIndex = path.join(appDir, "_build", "native-prod", "index.html");
  if (!(await fs.pathExists(nativeProdIndex))) {
    throw new Error(`Meteor build did not produce ${nativeProdIndex}`);
  }
  const nativeProdHtml = await fs.readFile(nativeProdIndex, "utf8");
  if (!nativeProdHtml.includes("__meteor_runtime_config__")) {
    throw new Error(`Meteor build produced an incomplete Capacitor index at ${nativeProdIndex}`);
  }
  await syncCapacitorNativeProject({ appDir, mobileServerUrl, platform });

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
  buildMeteorBuildArgs,
  buildMeteorNpmInstallArgs,
  buildLocalCapacitorInstallArgs,
  getCapacitorAndroidDebugApkPath,
  getCapacitorBuildWebCordovaPath,
  getCapacitorBuildCleanupPaths,
  getCapacitorProductionExcludedFiles,
  getCapacitorBuildHcpModeForNativeTestMode,
  getCapacitorIosDerivedDataPath,
  getCapacitorIosWorkspacePath,
  normalizeWebProgramAssetUrls,
  readMeteorAppIdentifier,
  renderCapacitorBuildIndexHtml,
  prepareApp,
  prepareSmokeApp,
  cleanup,
};
