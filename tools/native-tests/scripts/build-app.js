const path = require("node:path");
const os = require("node:os");
const fs = require("fs-extra");
const execa = require("execa");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const METEOR_BIN = path.join(REPO_ROOT, "meteor");
const CAPACITOR_PACKAGE_DIR = path.join(REPO_ROOT, "npm-packages", "meteor-capacitor");
const CAPACITOR_WEB_APP_LOCAL_SERVER_SHIM = [
  "<script type=\"text/javascript\">",
  "var WebAppLocalServer = {",
  "onError() {},",
  "onNewVersionReady() {},",
  "startupDidComplete(callback) { if (typeof callback === \"function\") callback(); },",
  "switchToPendingVersion(callback) { if (typeof callback === \"function\") callback(); },",
  "checkForUpdates(callback) { if (typeof callback === \"function\") callback(); }",
  "};",
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
  mobileServerUrl,
  program,
}) {
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
    `  ${CAPACITOR_WEB_APP_LOCAL_SERVER_SHIM}`,
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

async function syncCapacitorProductionWebDir({ appConfig, appDir, buildDir, mobileServerUrl }) {
  const sourceDir = getCapacitorBuildWebCordovaPath(buildDir);
  const targetDir = getCapacitorNativeProdPath(appDir);
  const programJsonPath = path.join(sourceDir, "program.json");

  if (!(await fs.pathExists(programJsonPath))) {
    throw new Error(`Meteor build did not produce ${programJsonPath}`);
  }

  const program = await fs.readJson(programJsonPath);
  await fs.remove(targetDir);
  await fs.copy(sourceDir, targetDir, {
    filter: (src) => !["program.json", "head.html", "body.html"].includes(path.basename(src)),
  });
  const [head, body] = await Promise.all([
    fs.readFile(path.join(sourceDir, "head.html"), "utf8"),
    fs.readFile(path.join(sourceDir, "body.html"), "utf8"),
  ]);
  await fs.writeFile(
    path.join(targetDir, "index.html"),
    renderCapacitorBuildIndexHtml({
      appId: appConfig.appId,
      body,
      head,
      mobileServerUrl,
      program,
    }),
    "utf8"
  );
}

async function syncCapacitorNativeProject({ appDir, mobileServerUrl, platform }) {
  await execa("npx", ["cap", "sync", platform], {
    cwd: appDir,
    env: {
      ...process.env,
      NODE_ENV: "production",
      ROOT_URL: mobileServerUrl,
      DDP_DEFAULT_CONNECTION_URL: mobileServerUrl,
      METEOR_CAPACITOR: "true",
      METEOR_CAPACITOR_MODE: "bundled",
      METEOR_CAPACITOR_PLATFORM: platform,
      METEOR_BUILD: "true",
      METEOR_NATIVE_ANDROID: platform === "android" ? "true" : "false",
      METEOR_NATIVE_IOS: platform === "ios" ? "true" : "false",
    },
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

async function prepareCapacitorRunApp({ appConfig, platform, lanIp, port = 3000 }) {
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

async function prepareCapacitorBuildApp({ appConfig, platform, lanIp, port = 3000 }) {
  if (platform !== "ios" && platform !== "android") {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const workDir = path.join(os.tmpdir(), `native-${appConfig.name}-${platform}-build-${runId}`);
  const appDir = path.join(workDir, "app");
  const buildDir = path.join(workDir, "build-out");
  const mobileServerUrl = `http://${lanIp}:${port}`;

  await copyAppSource(appConfig.sourceDir, appDir);
  await installAppDeps(appDir);
  await linkLocalCapacitor(appDir);
  await addPlatform(appDir, platform);
  await cleanupCapacitorBuildInputs(appDir);

  await execa(
    METEOR_BIN,
    buildMeteorBuildArgs({ buildDir, mobileServerUrl, platform }),
    { cwd: appDir, stdio: "inherit" }
  );

  await syncCapacitorProductionWebDir({
    appConfig,
    appDir,
    buildDir,
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

async function prepareApp({ appConfig, platform, lanIp, port = 3000, mode = "run" }) {
  if (appConfig.wrapper === "capacitor") {
    if (mode === "build") {
      return prepareCapacitorBuildApp({ appConfig, platform, lanIp, port });
    }
    return prepareCapacitorRunApp({ appConfig, platform, lanIp, port });
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
  buildMeteorBuildArgs,
  getCapacitorAndroidDebugApkPath,
  getCapacitorBuildWebCordovaPath,
  getCapacitorBuildCleanupPaths,
  getCapacitorIosDerivedDataPath,
  getCapacitorIosWorkspacePath,
  renderCapacitorBuildIndexHtml,
  prepareApp,
  prepareSmokeApp,
  cleanup,
};
