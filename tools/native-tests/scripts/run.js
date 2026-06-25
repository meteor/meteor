#!/usr/bin/env node
const path = require("node:path");
const fs = require("fs-extra");
const { checkMaestro } = require("./check-maestro");
const { getAppConfig, DEFAULT_APP } = require("./app-config");
const { prepareApp, cleanup: cleanupApp } = require("./build-app");
const {
  resolveLanIp,
  resolveNativeServerConfig,
  startNativeRun,
  startServer,
} = require("./server");
const { bootSimulator } = require("./simulator");
const { runFlow } = require("./maestro");

const PLATFORMS = new Set(["ios", "android"]);
const MODES = new Set(["run", "build", "livereload", "hcp"]);
const JUNIT_DIR = path.resolve(__dirname, "..", "junit");
const DEFAULT_HARD_TIMEOUT_MS = 20 * 60 * 1000;
const LIVERELOAD_SETTLE_MS = 30_000;
const UPDATED_APP_READY_TIMEOUT_MS = 120_000;
const UPDATED_APP_READY_INTERVAL_MS = 1_000;
const UPDATED_ANDROID_CAPACITOR_SETTLE_MS = 10_000;

const EXIT_PASS = 0;
const EXIT_FLOW_FAIL = 1;
const EXIT_INFRA = 2;
const EXIT_FRAMEWORK = 3;

function parseArgs(argv) {
  const out = {
    platform: null,
    appName: DEFAULT_APP,
    keepRunning: false,
    mode: "run",
  };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--keep-running") {
      out.keepRunning = true;
    } else if (token === "--app") {
      out.appName = argv[++i];
    } else if (token.startsWith("--app=")) {
      out.appName = token.slice("--app=".length);
    } else if (token === "--mode") {
      out.mode = argv[++i];
    } else if (token.startsWith("--mode=")) {
      out.mode = token.slice("--mode=".length);
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
  if (!MODES.has(out.mode)) {
    throw new Error(`Unsupported mode: ${out.mode}`);
  }
  getAppConfig(out.appName);
  return out;
}

function getHardTimeoutMs(env = process.env) {
  const raw = env.METEOR_NATIVE_TEST_TIMEOUT_MS;
  if (!raw) return DEFAULT_HARD_TIMEOUT_MS;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_HARD_TIMEOUT_MS;
}

function artifactStem({ platform, appName, mode }) {
  const stem = `${platform}-${appName}`;
  return mode === "run" ? stem : `${stem}-${mode}`;
}

async function replaceFileText(file, replacements) {
  let content = await fs.readFile(file, "utf8");
  for (const [from, to] of replacements) {
    content = content.replace(from, to);
  }
  await fs.writeFile(file, content, "utf8");
}

async function applyLivereloadFixtureChanges(appDir) {
  await Promise.all([
    replaceFileText(
      path.join(appDir, "client", "main.html"),
      [["Welcome to Meteor Capacitor Tests", "Welcome to Meteor Capacitor Tests Updated"]]
    ),
    replaceFileText(
      path.join(appDir, "client", "main.js"),
      [["Native client version initial", "Native client version updated"]]
    ),
    replaceFileText(
      path.join(appDir, "server", "main.js"),
      [["Native server version initial", "Native server version updated"]]
    ),
  ]);
}

function updatedJunitPath(junitOut) {
  return junitOut.replace(/\.xml$/, "-updated.xml");
}

function getInitialFlowPathForMode(mode, appConfig) {
  if (mode === "livereload") {
    return appConfig.livereloadInitialFlowPath;
  }
  if (mode === "run" || mode === "hcp") {
    return appConfig.hcpInitialFlowPath;
  }
  return appConfig.flowPath;
}

function getUpdatedFlowPathForMode(mode, appConfig) {
  if (mode === "livereload") {
    return appConfig.livereloadFlowPath;
  }
  if (mode === "run" || mode === "hcp") {
    return appConfig.hcpFlowPath;
  }
  return null;
}

function shouldRunUpdatedFlowForMode(mode) {
  return mode === "run" || mode === "livereload" || mode === "hcp";
}

function getUpdatedAppReadyMarker(mode) {
  if (mode === "run" || mode === "hcp") {
    return "Welcome to Meteor Capacitor Tests Updated";
  }

  if (mode === "livereload") {
    return "Welcome to Meteor Capacitor Tests Updated";
  }

  return null;
}

function getUpdatedAppReadyChecks({ mode, wrapper }) {
  const marker = getUpdatedAppReadyMarker(mode);
  if (!marker) {
    return [];
  }

  const checks = [{ requestPath: "/", marker }];

  if (
    wrapper === "capacitor" &&
    (mode === "run" || mode === "hcp")
  ) {
    checks.push({ requestPath: "/__cordova/", marker });
  }

  return checks;
}

function shouldWaitForUpdatedCordovaManifest({ mode, wrapper }) {
  return wrapper === "capacitor" && (mode === "run" || mode === "hcp");
}

function shouldUseNativeRunBackedServer({ wrapper, mode }) {
  return wrapper === "capacitor" && (mode === "run" || mode === "livereload" || mode === "hcp");
}

function shouldRelaunchUpdatedCapacitorApp({ platform, wrapper, mode }) {
  return (
    platform === "android" &&
    wrapper === "capacitor" &&
    (mode === "run" || mode === "hcp")
  );
}

async function readServerText({
  baseUrl,
  requestPath = "/",
  fetchImpl = globalThis.fetch,
}) {
  if (!baseUrl || typeof fetchImpl !== "function") {
    return null;
  }

  const targetUrl = new URL(requestPath, baseUrl).toString();
  const response = await fetchImpl(targetUrl, {
    headers: { "cache-control": "no-cache" },
  });

  if (!response.ok) {
    throw new Error(`unexpected HTTP status ${response.status}`);
  }

  return response.text();
}

async function waitForUpdatedAppReady({
  baseUrl,
  marker,
  requestPath = "/",
  timeoutMs = UPDATED_APP_READY_TIMEOUT_MS,
  intervalMs = UPDATED_APP_READY_INTERVAL_MS,
  fetchImpl = globalThis.fetch,
}) {
  if (!baseUrl || !marker || typeof fetchImpl !== "function") {
    return;
  }

  const targetUrl = new URL(requestPath, baseUrl).toString();
  const deadline = Date.now() + timeoutMs;
  let lastFailure = null;

  while (Date.now() < deadline) {
    try {
      const body = await readServerText({
        baseUrl,
        requestPath,
        fetchImpl,
      });
      if (body.includes(marker)) {
        return;
      }
      lastFailure = new Error(`marker not served yet: ${marker}`);
    } catch (error) {
      lastFailure = error;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  const suffix = lastFailure ? ` (${lastFailure.message})` : "";
  throw new Error(`Timed out waiting for updated app marker at ${targetUrl}${suffix}`);
}

async function waitForServerTextChange({
  baseUrl,
  requestPath = "/",
  previousText,
  timeoutMs = UPDATED_APP_READY_TIMEOUT_MS,
  intervalMs = UPDATED_APP_READY_INTERVAL_MS,
  fetchImpl = globalThis.fetch,
}) {
  if (!baseUrl || typeof fetchImpl !== "function") {
    return;
  }

  const targetUrl = new URL(requestPath, baseUrl).toString();
  const deadline = Date.now() + timeoutMs;
  let lastFailure = null;

  while (Date.now() < deadline) {
    try {
      const body = await readServerText({
        baseUrl,
        requestPath,
        fetchImpl,
      });
      if (body !== previousText) {
        return;
      }
      lastFailure = new Error(`response unchanged at ${requestPath}`);
    } catch (error) {
      lastFailure = error;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  const suffix = lastFailure ? ` (${lastFailure.message})` : "";
  throw new Error(`Timed out waiting for updated server response at ${targetUrl}${suffix}`);
}

async function run(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(err.message);
    return EXIT_FRAMEWORK;
  }

  const appConfig = getAppConfig(args.appName);

  if (!(await fs.pathExists(appConfig.flowPath))) {
    console.error(`Missing flow file: ${appConfig.flowPath}`);
    return EXIT_FRAMEWORK;
  }
  if (
    args.mode === "livereload" &&
    !(await fs.pathExists(appConfig.livereloadInitialFlowPath))
  ) {
    console.error(`Missing livereload initial flow file: ${appConfig.livereloadInitialFlowPath}`);
    return EXIT_FRAMEWORK;
  }
  if (
    args.mode === "livereload" &&
    !(await fs.pathExists(appConfig.livereloadFlowPath))
  ) {
    console.error(`Missing livereload flow file: ${appConfig.livereloadFlowPath}`);
    return EXIT_FRAMEWORK;
  }
  if (
    (args.mode === "run" || args.mode === "hcp") &&
    !(await fs.pathExists(appConfig.hcpInitialFlowPath))
  ) {
    console.error(`Missing HCP initial flow file: ${appConfig.hcpInitialFlowPath}`);
    return EXIT_FRAMEWORK;
  }
  if (
    (args.mode === "run" || args.mode === "hcp") &&
    !(await fs.pathExists(appConfig.hcpFlowPath))
  ) {
    console.error(`Missing HCP flow file: ${appConfig.hcpFlowPath}`);
    return EXIT_FRAMEWORK;
  }

  const maestro = await checkMaestro();
  if (!maestro.ok) {
    console.error(maestro.hint);
    return EXIT_INFRA;
  }

  const stem = artifactStem({
    platform: args.platform,
    appName: appConfig.name,
    mode: args.mode,
  });
  const junitOut = path.join(JUNIT_DIR, `${stem}.xml`);
  const logOut = path.join(JUNIT_DIR, `${stem}-device.log`);
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

  const hardTimeoutMs = getHardTimeoutMs();
  const hardTimeout = setTimeout(() => {
    console.error(`Hard timeout (${hardTimeoutMs}ms) reached. Aborting.`);
    cleanupAll().finally(() => process.exit(EXIT_INFRA));
  }, hardTimeoutMs);
  hardTimeout.unref();

  try {
    const lanIp = resolveLanIp({ prefer: process.env.MAESTRO_IFACE });
    const serverConfig = resolveNativeServerConfig({
      platform: args.platform,
      lanIp,
    });
    console.log(`Using LAN IP ${lanIp}`);
    console.log(`Using native bind URL ${serverConfig.bindUrl}`);
    console.log(`Using native mobile server ${serverConfig.mobileServerUrl}`);

    const build = await prepareApp({
      appConfig,
      platform: args.platform,
      lanIp,
      mobileServerUrl: serverConfig.mobileServerUrl,
      mode: args.mode,
    });
    cleanup.push(() => cleanupApp(build.workDir));

    const sim = await bootSimulator(args.platform, { appId: appConfig.appId });
    cleanup.push(() => sim.uninstall());
    cleanup.push(() => sim.captureLogs(logOut));
    cleanup.push(() => sim.shutdown());
    await sim.uninstall();

    if (shouldUseNativeRunBackedServer({
      wrapper: appConfig.wrapper,
      mode: args.mode,
    })) {
      const nativeRun = await startNativeRun({
        appDir: build.appDir,
        platform: args.platform,
        bindHost: serverConfig.bindHost,
        lanIp,
        mobileServerUrl: serverConfig.mobileServerUrl,
        deviceId: args.mode === "hcp" ? undefined : sim.deviceId,
        capacitorMode: args.mode === "livereload" ? "livereload" : "bundled",
        baseEnv: args.mode === "hcp"
          ? { ...process.env, METEOR_CAPACITOR_SKIP_NATIVE_RUN: "true" }
          : process.env,
      });
      cleanup.push(() => nativeRun.stop());
      if (args.mode === "hcp") {
        console.log(`Capacitor HCP server up at ${nativeRun.url}`);
        await sim.install(build.bundlePath);
        console.log(`Installed bundle on ${args.platform} device ${sim.deviceId}`);
      } else {
        console.log(`Native Meteor run up at ${nativeRun.url}`);
        await sim.waitForInstall();
        console.log(`Capacitor app ${appConfig.appId} installed on ${args.platform} device ${sim.deviceId}`);
      }
    } else {
      const server = await startServer({
        appDir: build.appDir,
        bindHost: serverConfig.bindHost,
        lanIp,
        mobileServerUrl: serverConfig.mobileServerUrl,
      });
      cleanup.push(() => server.stop());
      console.log(`Server up at ${server.url}`);

      await sim.install(build.bundlePath);
      console.log(`Installed bundle on ${args.platform} device ${sim.deviceId}`);
    }

    const initialFlowPath = getInitialFlowPathForMode(args.mode, appConfig);

    const { exitCode } = await runFlow({
      flowPath: initialFlowPath,
      deviceId: sim.deviceId,
      junitOut,
      platform: args.platform,
      retries: 1,
    });

    if (exitCode !== 0) return EXIT_FLOW_FAIL;
    if (shouldRunUpdatedFlowForMode(args.mode)) {
      const initialCordovaManifest = shouldWaitForUpdatedCordovaManifest({
        mode: args.mode,
        wrapper: appConfig.wrapper,
      })
        ? await readServerText({
          baseUrl: serverConfig.bindUrl,
          requestPath: "/__cordova/manifest.json",
        })
        : null;

      await applyLivereloadFixtureChanges(build.appDir);
      await new Promise((resolve) => setTimeout(resolve, LIVERELOAD_SETTLE_MS));
      if (initialCordovaManifest !== null) {
        await waitForServerTextChange({
          baseUrl: serverConfig.bindUrl,
          requestPath: "/__cordova/manifest.json",
          previousText: initialCordovaManifest,
        });
      }
      for (const check of getUpdatedAppReadyChecks({
        mode: args.mode,
        wrapper: appConfig.wrapper,
      })) {
        await waitForUpdatedAppReady({
          baseUrl: serverConfig.bindUrl,
          ...check,
        });
      }
      if (
        shouldRelaunchUpdatedCapacitorApp({
          platform: args.platform,
          wrapper: appConfig.wrapper,
          mode: args.mode,
        })
      ) {
        await sim.launch();
        await new Promise((resolve) => setTimeout(resolve, UPDATED_ANDROID_CAPACITOR_SETTLE_MS));
      }
      const updated = await runFlow({
        flowPath: getUpdatedFlowPathForMode(args.mode, appConfig),
        deviceId: sim.deviceId,
        junitOut: updatedJunitPath(junitOut),
        platform: args.platform,
        retries: 1,
      });
      if (updated.exitCode === 0) return EXIT_PASS;
      return EXIT_FLOW_FAIL;
    }
    return EXIT_PASS;
  } catch (err) {
    console.error("Infrastructure failure:", err.message);
    if (err.stack) console.error(err.stack);
    return EXIT_INFRA;
  } finally {
    clearTimeout(hardTimeout);
    if (!args?.keepRunning) {
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
  artifactStem,
  getHardTimeoutMs,
  getUpdatedAppReadyChecks,
  getInitialFlowPathForMode,
  getUpdatedAppReadyMarker,
  getUpdatedFlowPathForMode,
  parseArgs,
  readServerText,
  shouldRelaunchUpdatedCapacitorApp,
  shouldUseNativeRunBackedServer,
  run,
  shouldWaitForUpdatedCordovaManifest,
  shouldRunUpdatedFlowForMode,
  waitForUpdatedAppReady,
  waitForServerTextChange,
  EXIT_PASS,
  EXIT_FLOW_FAIL,
  EXIT_INFRA,
  EXIT_FRAMEWORK,
};
