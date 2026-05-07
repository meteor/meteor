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
  ensureNativePlatformAdded,
  addOrSyncNativePlatform,
  cleanup,
} = require('./lib/processes');
const {
  CAPACITOR_PLATFORMS,
  isCapacitorOptIn,
  isCapacitorRunOptIn,
  isCapacitorBuildOptIn,
  isCapacitorAddPlatformOptIn,
} = require('./lib/command');

function logVerbose(...args) {
  if (isMeteorAppDebug() || isMeteorAppConfigModernVerbose()) {
    logInfo(...args);
  }
}

/**
 * Runs the cordova→build-native transform. Returns false if the
 * transform itself failed (web.cordova/ exists but transforms threw).
 */
function runTransform({ appDir }) {
  logProgress('=> 🔧 Capacitor: transforming web.cordova → build-native/');
  const ok = runCapacitorTransforms({
    appDir,
    verbose: isMeteorAppDebug() || isMeteorAppConfigModernVerbose(),
  });
  if (!ok) {
    logError('=> ❌ Capacitor transform failed');
    return false;
  }
  logVerbose(`[i] Capacitor build-native/ ready at ${path.join(appDir, CAPACITOR_BUILD_CONTEXT)}`);
  return true;
}

/**
 * Resolves once `web.cordova/index.html` exists on disk (i.e. the bundler
 * has emitted the cordova arch the transform reads from). Polls the actual
 * file rather than guessing a delay; returns false on timeout.
 */
function waitForCordovaBundle(cordovaOutDir, { intervalMs = 100, timeoutMs = 30_000 } = {}) {
  const indexPath = path.join(cordovaOutDir, 'index.html');
  if (fs.existsSync(indexPath)) return Promise.resolve(true);

  return new Promise(resolve => {
    const start = Date.now();
    const interval = setInterval(() => {
      if (fs.existsSync(indexPath)) {
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

  logVerbose(`[i] Capacitor: waiting for ${CAPACITOR_CORDOVA_OUTPUT_DIR}/index.html`);
  const ready = await waitForCordovaBundle(cordovaOutDir);
  if (!ready) {
    logError(`Capacitor: timed out waiting for ${CAPACITOR_CORDOVA_OUTPUT_DIR} (30s).`);
    return;
  }

  if (!runTransform({ appDir })) return;

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
      // The CLI forces a compile on `meteor add-platform` so this build
      // plugin loads. Run cap add against each requested platform (or cap
      // sync if the native dir already exists). The CLI writes
      // .meteor/platforms after the compile returns.
      const appDir = getMeteorAppDir();
      const requested = Package?.meteor?.global?.currentCommand?.options?.args || [];
      const platforms = requested.filter(p => CAPACITOR_PLATFORMS.includes(p));
      for (const platform of platforms) {
        const code = await addOrSyncNativePlatform({ appDir, platform });
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
      // `meteor run android|ios`: same pipeline, scoped to the active
      // platform. Continuous re-sync on subsequent rebuilds (the watcher)
      // is planned separately; this is the one-shot at startup.
      const platform = isMeteorAppNativeAndroid() ? 'android'
        : isMeteorAppNativeIos() ? 'ios'
        : null;
      transformAndSync({ appDir: getMeteorAppDir(), platform });
    }
  } catch (error) {
    logError(`Capacitor plugin error: ${error.message}`);
    throw error;
  }
}
