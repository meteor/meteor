#!/usr/bin/env node
const path = require("node:path");
const fs = require("fs-extra");
const { checkMaestro } = require("./check-maestro");
const { prepareSmokeApp, cleanup: cleanupApp } = require("./build-app");
const { resolveLanIp, startServer } = require("./server");
const { bootSimulator } = require("./simulator");
const { runFlow } = require("./maestro");
const {
  applyCordovaFixtureUpdate,
  readCordovaManifest,
  waitForCordovaManifestChange,
} = require("./cordova-hcp");

const PLATFORMS = new Set(["ios", "android"]);
const FLOW_PATH = path.resolve(__dirname, "..", "flows", "launch.yaml");
const HCP_FLOW_PATH = path.resolve(
  __dirname,
  "..",
  "flows",
  "hcp-updated.yaml"
);
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

function updatedJunitPath(junitOut) {
  return junitOut.replace(/-launch\.xml$/, "-hcp-updated.xml");
}

async function run(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(err.message);
    return EXIT_FRAMEWORK;
  }

  for (const flowPath of [FLOW_PATH, HCP_FLOW_PATH]) {
    if (!(await fs.pathExists(flowPath))) {
      console.error(`Missing flow file: ${flowPath}`);
      return EXIT_FRAMEWORK;
    }
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
    cleanup.push(() => cleanupApp(build.workDir));

    const server = await startServer({ appDir: build.appDir, lanIp });
    cleanup.push(() => server.stop());
    console.log(`Server up at ${server.url}`);

    const sim = await bootSimulator(args.platform);
    // cleanupAll runs in LIFO order: collect logs while the device and app are
    // still available, then uninstall, then shut the simulator down.
    cleanup.push(() => sim.shutdown());
    cleanup.push(() => sim.uninstall());
    cleanup.push(() => sim.captureLogs(logOut));

    await sim.install(build.bundlePath);
    console.log(`Installed bundle on ${args.platform} device ${sim.deviceId}`);

    const initialManifest = await readCordovaManifest({
      baseUrl: server.url,
    });

    const initial = await runFlow({
      flowPath: FLOW_PATH,
      deviceId: sim.deviceId,
      junitOut,
    });
    if (initial.exitCode !== 0) return EXIT_FLOW_FAIL;

    await applyCordovaFixtureUpdate(build.appDir);
    await waitForCordovaManifestChange({
      baseUrl: server.url,
      previousVersion: initialManifest.version,
    });

    const updated = await runFlow({
      flowPath: HCP_FLOW_PATH,
      deviceId: sim.deviceId,
      junitOut: updatedJunitPath(junitOut),
    });
    return updated.exitCode === 0 ? EXIT_PASS : EXIT_FLOW_FAIL;
  } catch (err) {
    console.error("Infrastructure failure:", err.message);
    if (err.stack) console.error(err.stack);
    return EXIT_INFRA;
  } finally {
    clearTimeout(hardTimeout);
    if (!args.keepRunning) {
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
  updatedJunitPath,
  run,
  EXIT_PASS,
  EXIT_FLOW_FAIL,
  EXIT_INFRA,
  EXIT_FRAMEWORK,
};
