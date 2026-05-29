/**
 * @module capacitor_plugin
 * @description Build-plugin entry point for the Capacitor integration.
 *
 * Orchestrates:
 *   1. Gating on the active Meteor command (run / build / add-platform). See lib/command.js.
 *   2. Ensuring NPM dependencies, build-native/, and capacitor.config.js exist.
 *   3. Snapshotting the resolved capacitor.config to the per-env build context.
 *   4. On `meteor add-platform`, running `npx cap add` for the requested platforms.
 *   5. On `meteor build` and `meteor run android|ios`, transforming
 *      web.cordova/ into build-native/ and running `cap sync` (scoped to the
 *      active platform when run native).
 */

const path = require('path');
const fs = require('fs');

const {
  isMeteorAppDebug,
  isMeteorAppConfigModernVerbose,
  hasMeteorAppConfigAutoInstallDeps,
  isMeteorAppNativeAndroid,
  isMeteorAppNativeIos,
  getMeteorAppDir,
  setMeteorAppIgnore,
} = require('meteor/tools-core/lib/meteor');
const {
  logInfo,
  logError,
  logProgress,
} = require('meteor/tools-core/lib/log');
const { isYarnProject } = require('meteor/tools-core/lib/npm');

const {
  CAPACITOR_BUILD_CONTEXT,
  CAPACITOR_CORDOVA_OUTPUT_DIR,
  getCapacitorWebDirCandidates,
} = require('./lib/constants');
const { ensureCapacitorInstalled } = require('./lib/dependencies');
const {
  ensureCapacitorBuildContextExists,
  ensureCapacitorConfigExists,
  writeResolvedConfigSnapshot,
} = require('./lib/build-context');
const { runCapacitorTransforms } = require('./lib/transforms');
const {
  runCapSync,
  runCapRun,
  resolveCapTarget,
  ensureNativePlatformAdded,
  addNativePlatformIfMissing,
  cleanup,
} = require('./lib/processes');
const {
  CAPACITOR_PLATFORMS,
  isCapacitorOptIn,
  isCapacitorRunOptIn,
  isCapacitorBuildOptIn,
  isCapacitorAddPlatformOptIn,
} = require('./lib/command');

const isVerbose = () => isMeteorAppDebug() || isMeteorAppConfigModernVerbose();
function logVerbose(...args) {
  if (isVerbose()) logInfo(...args);
}

/**
 * Runs the cordova→build-native transform. Returns false if the
 * transform itself failed (web.cordova/ exists but transforms threw).
 */
async function runTransform({ appDir }) {
  if (isVerbose()) logProgress('=> 🔧 Capacitor: transforming web.cordova → build-native/');
  const ok = await runCapacitorTransforms({ appDir, verbose: isVerbose() });
  if (!ok) {
    logError('=> ❌ Capacitor transform failed');
    return false;
  }
  logVerbose(`[i] Capacitor build-native/ ready at ${path.join(appDir, CAPACITOR_BUILD_CONTEXT)}`);
  return true;
}

/**
 * Resolves once `web.cordova/program.json` is on disk (the bundle Meteor
 * actually emits — buildIndex composes index.html from it). Returns false
 * on timeout.
 */
function waitForCordovaBundle(cordovaOutDir, { intervalMs = 100, timeoutMs = 30_000 } = {}) {
  const sentinelPath = path.join(cordovaOutDir, 'program.json');
  if (fs.existsSync(sentinelPath)) return Promise.resolve(true);

  return new Promise(resolve => {
    const start = Date.now();
    const interval = setInterval(() => {
      if (fs.existsSync(sentinelPath)) {
        clearInterval(interval);
        resolve(true);
      } else if (Date.now() - start >= timeoutMs) {
        clearInterval(interval);
        resolve(false);
      }
    }, intervalMs);
  });
}

/**
 * Runs the transform + cap sync pair used by both `meteor build` and
 * `meteor run android|ios`. Awaits the cordova bundle becoming available
 * before transforming. Continuous re-sync on subsequent rebuilds (the
 * watcher) is planned separately.
 *
 * @param {Object} opts
 * @param {string} opts.appDir
 * @param {string|null} [opts.platform] 'android' / 'ios' for run, null for build.
 */
async function transformAndSync({ appDir, platform = null }) {
  const cordovaOutDir = path.join(appDir, CAPACITOR_CORDOVA_OUTPUT_DIR);

  logVerbose(`[i] Capacitor: waiting for ${CAPACITOR_CORDOVA_OUTPUT_DIR}/program.json`);
  const ready = await waitForCordovaBundle(cordovaOutDir);
  if (!ready) {
    logError(`Capacitor: timed out waiting for ${CAPACITOR_CORDOVA_OUTPUT_DIR} (30s).`);
    return;
  }

  if (!(await runTransform({ appDir }))) return;

  return runCapSync({ appDir, platform }).catch(err =>
    logError(`Capacitor sync failed: ${err.message}`),
  );
}

if (isCapacitorOptIn()) {
  try {
    if (process.env.YARN_ENABLED === undefined) {
      process.env.YARN_ENABLED = isYarnProject() ? 'true' : 'false';
    }

    process.env.METEOR_CAPACITOR = 'true';
    // Bypass Cordova's runner when the project has the `capacitor` package.
    // The Meteor CLI sets the same disable flag at command start (see
    // tools/cli/commands.js shouldDisableCordova, which checks for the
    // capacitor package constraint); this assignment covers downstream
    // child processes spawned by the plugin (cap sync, etc.).
    process.env.METEOR_CORDOVA_DISABLE = 'true';

    // Skip native webDirs at isobuild scan time. Scoped to native-*
    // subdirs so rspack's main-* outputs under the same _build/ root
    // stay visible.
    setMeteorAppIgnore(getCapacitorWebDirCandidates().join(' '));

    if (hasMeteorAppConfigAutoInstallDeps()) {
      // Top-level await: build plugins are evaluated as ESM with TLA enabled.
      await ensureCapacitorInstalled();
    }

    ensureCapacitorBuildContextExists();
    ensureCapacitorConfigExists();

    // Snapshot the resolved capacitor.config to the per-env webDir
    // (`_build/native-{dev,prod}/capacitor.config.json`). Informational:
    // capacitor's CLI still loads the source .js from project root.
    await writeResolvedConfigSnapshot({ appDir: getMeteorAppDir() });

    // Auto-bootstrap the native project (`android/` or `ios/`) when the user
    // ran `meteor run android|ios|*-device` without a prior `meteor add-platform`,
    // so a freshly-cloned project just works.
    if (isCapacitorRunOptIn()) {
      await ensureNativePlatformAdded({ appDir: getMeteorAppDir() });
    }

    process.on('exit', cleanup);
    process.on('SIGINT', () => {
      cleanup();
      process.exit();
    });

    if (isCapacitorAddPlatformOptIn()) {
      // Run cap add per requested platform; no-op when already added.
      // The CLI writes .meteor/platforms after the compile returns.
      const appDir = getMeteorAppDir();
      const requested = Package?.meteor?.global?.currentCommand?.options?.args || [];
      const platforms = requested.filter(p => CAPACITOR_PLATFORMS.includes(p));
      for (const platform of platforms) {
        const code = await addNativePlatformIfMissing({ appDir, platform });
        if (code !== 0) {
          throw new Error(`cap add ${platform} exited with code ${code}`);
        }
      }
    }

    if (isCapacitorBuildOptIn()) {
      // `meteor build` emits all platforms in .meteor/platforms. Sync without
      // a platform arg lets capacitor mirror the build-native bundle into both
      // android and ios native projects when present.
      transformAndSync({ appDir: getMeteorAppDir() });
    }

    if (isCapacitorRunOptIn()) {
      // Sync once at startup, then launch Capacitor. METEOR_CAPACITOR_TARGET
      // selects a specific device/emulator. METEOR_CAPACITOR_AUTO_PICK_TARGET
      // enables the temporary first-target auto-pick path; otherwise Capacitor
      // keeps its normal target-selection behavior.
      const platform = isMeteorAppNativeAndroid() ? 'android'
        : isMeteorAppNativeIos() ? 'ios'
        : null;
      const appDir = getMeteorAppDir();
      await transformAndSync({ appDir, platform });
      if (platform) {
        const target = await resolveCapTarget({ appDir, platform });
        const extraArgs = ['--no-sync'];
        if (target) {
          logInfo(`=> Capacitor launching on ${target}${process.env.METEOR_CAPACITOR_TARGET ? '' : ' (auto-picked)'}`);
          extraArgs.push(`--target=${target}`);
        }
        runCapRun({ appDir, platform, extraArgs });
      }
    }
  } catch (error) {
    logError(`Capacitor plugin error: ${error.message}`);
    throw error;
  }
}
