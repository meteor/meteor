#!/usr/bin/env node
const path = require("node:path");
const fs = require("fs-extra");
const { checkMaestro } = require("./check-maestro");
const { getAppConfig, DEFAULT_APP } = require("./app-config");
const { prepareApp, cleanup: cleanupApp } = require("./build-app");
const { resolveLanIp, startNativeRun, startServer } = require("./server");
const { bootSimulator } = require("./simulator");
const { runFlow } = require("./maestro");

const PLATFORMS = new Set(["ios", "android"]);
const JUNIT_DIR = path.resolve(__dirname, "..", "junit");
const HARD_TIMEOUT_MS = 8 * 60 * 1000;

const EXIT_PASS = 0;
const EXIT_FLOW_FAIL = 1;
const EXIT_INFRA = 2;
const EXIT_FRAMEWORK = 3;

function parseArgs(argv) {
  const out = { platform: null, appName: DEFAULT_APP, keepRunning: false };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--keep-running") {
      out.keepRunning = true;
    } else if (token === "--app") {
      out.appName = argv[++i];
    } else if (token.startsWith("--app=")) {
      out.appName = token.slice("--app=".length);
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
  getAppConfig(out.appName);
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

  const appConfig = getAppConfig(args.appName);

  if (!(await fs.pathExists(appConfig.flowPath))) {
    console.error(`Missing flow file: ${appConfig.flowPath}`);
    return EXIT_FRAMEWORK;
  }

  const maestro = await checkMaestro();
  if (!maestro.ok) {
    console.error(maestro.hint);
    return EXIT_INFRA;
  }

  const junitOut = path.join(JUNIT_DIR, `${args.platform}-${appConfig.name}.xml`);
  const logOut = path.join(JUNIT_DIR, `${args.platform}-${appConfig.name}-device.log`);
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

    const build = await prepareApp({
      appConfig,
      platform: args.platform,
      lanIp,
    });
    cleanup.push(() => cleanupApp(build.workDir));

    const sim = await bootSimulator(args.platform, { appId: appConfig.appId });
    cleanup.push(() => sim.uninstall());
    cleanup.push(() => sim.captureLogs(logOut));
    cleanup.push(() => sim.shutdown());
    await sim.uninstall();

    if (appConfig.wrapper === "capacitor") {
      const nativeRun = await startNativeRun({
        appDir: build.appDir,
        platform: args.platform,
        lanIp,
        deviceId: sim.deviceId,
      });
      cleanup.push(() => nativeRun.stop());
      console.log(`Native Meteor run up at ${nativeRun.url}`);
      await sim.waitForInstall();
      console.log(`Capacitor app ${appConfig.appId} installed on ${args.platform} device ${sim.deviceId}`);
    } else {
      const server = await startServer({ appDir: build.appDir, lanIp });
      cleanup.push(() => server.stop());
      console.log(`Server up at ${server.url}`);

      await sim.install(build.bundlePath);
      console.log(`Installed bundle on ${args.platform} device ${sim.deviceId}`);
    }

    const { exitCode } = await runFlow({
      flowPath: appConfig.flowPath,
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
  parseArgs,
  run,
  EXIT_PASS,
  EXIT_FLOW_FAIL,
  EXIT_INFRA,
  EXIT_FRAMEWORK,
};
