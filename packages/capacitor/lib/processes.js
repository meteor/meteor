/**
 * @module processes
 * @description Spawns the Capacitor CLI for `cap sync` / `cap run` / `cap open`.
 */

const {
  spawnProcess,
  stopProcess,
  isProcessRunning,
} = require('meteor/tools-core/lib/process');
const {
  logError,
  logInfo,
  logRaw,
  logProgress,
  logSuccess,
} = require('meteor/tools-core/lib/log');
const {
  getNpxCommand,
  getNodeBinEnv,
} = require('meteor/tools-core/lib/npm');
const {
  getMeteorAppDir,
  inheritMeteorToolNodeFlags,
  isMeteorAppDevelopment,
  isMeteorAppProduction,
  isMeteorAppDebug,
  isMeteorAppConfigModernVerbose,
  isMeteorAppRun,
  isMeteorAppBuild,
  isMeteorAppNativeAndroid,
  isMeteorAppNativeIos,
} = require('meteor/tools-core/lib/meteor');

const isVerbose = () => isMeteorAppDebug() || isMeteorAppConfigModernVerbose();
const {
  getGlobalState,
  setGlobalState,
} = require('meteor/tools-core/lib/global-state');

const {
  CAPACITOR_BUILD_CONTEXT,
  getCapacitorWebDir,
} = require('./constants');

const PROC_KEYS = {
  SYNC: 'capacitor.process.sync',
  RUN: 'capacitor.process.run',
};

/**
 * Builds the env block injected into every spawned `cap` invocation.
 * defineConfig (in @meteorjs/capacitor) reads these to populate the
 * Meteor flag object handed to the user's capacitor.config.js factory.
 */
function getCapacitorEnv({ platform, mode } = {}) {
  const isAndroid = isMeteorAppNativeAndroid();
  const isIos = isMeteorAppNativeIos();
  const isDev = isMeteorAppDevelopment();
  const isProd = isMeteorAppProduction();
  const webDir = getCapacitorWebDir({ isDevelopment: isDev, isProduction: isProd });
  return {
    METEOR_CAPACITOR: 'true',
    METEOR_CAPACITOR_MODE: mode || (isProd ? 'bundled' : 'development'),
    METEOR_CAPACITOR_PLATFORM: platform || (isAndroid ? 'android' : isIos ? 'ios' : ''),
    METEOR_BUILD_CONTEXT: CAPACITOR_BUILD_CONTEXT,
    METEOR_CAPACITOR_WEB_DIR: webDir,
    METEOR_RUN: isMeteorAppRun() ? 'true' : 'false',
    METEOR_BUILD: isMeteorAppBuild() ? 'true' : 'false',
    METEOR_DEBUG: isMeteorAppDebug() ? 'true' : 'false',
    METEOR_VERBOSE: isMeteorAppConfigModernVerbose() ? 'true' : 'false',
    METEOR_NATIVE_ANDROID: isAndroid ? 'true' : 'false',
    METEOR_NATIVE_IOS: isIos ? 'true' : 'false',
    NODE_ENV: isProd ? 'production' : (process.env.NODE_ENV || 'development'),
  };
}

function spawnCap(args, { cwd, label, env, onExit, mode, platform }) {
  const { command, args: cmdArgs } = getNpxCommand(['cap', ...args]);
  return spawnProcess(command, cmdArgs, {
    cwd,
    env: inheritMeteorToolNodeFlags({
      ...process.env,
      ...getNodeBinEnv(),
      ...getCapacitorEnv({ platform, mode }),
      ...(env || {}),
    }),
    onStdout: data => {
      if (!isVerbose()) return;
      logRaw(`[Capacitor ${label}] ${data.replace(/\s+$/, '')}`);
    },
    onStderr: data => {
      const trimmed = data.replace(/\s+$/, '');
      if (!trimmed) return;
      logError(`[Capacitor ${label}] ${trimmed}`);
    },
    onError: err => logError(`Capacitor ${label} error: ${err.message}`),
    onExit: code => {
      if (typeof onExit === 'function') onExit(code);
    },
  });
}

/**
 * Runs `npx cap add <platform>`. Used internally by the run-time
 * auto-bootstrap and the add-platform branch so a freshly cloned project
 * doesn't need an explicit add-platform step. Skips if
 * `<appDir>/<platform>` already exists on disk.
 *
 * @returns {Promise<number>} Exit code (0 = success or already-present).
 */
function runCapAdd({ appDir = getMeteorAppDir(), platform } = {}) {
  if (!platform) return Promise.resolve(0);

  const path = require('path');
  const fs = require('fs');
  const nativeDir = path.join(appDir, platform);
  if (fs.existsSync(nativeDir)) {
    return Promise.resolve(0);
  }

  return new Promise(resolve => {
    logProgress(`=> 📱 Capacitor add ${platform} (native project missing — bootstrapping)`);
    spawnCap(['add', platform], {
      cwd: appDir,
      label: `Add/${platform}`,
      platform,
      onExit: code => {
        if (code === 0) logSuccess(`=> ✅ Capacitor add ${platform} complete`);
        else logError(`=> ❌ Capacitor add ${platform} exited with code ${code}`);
        resolve(code);
      },
    });
  });
}

/**
 * `meteor add-platform <platform>` core: runs `npx cap add` if the native
 * dir is missing, no-ops if it exists. cap sync is intentionally skipped —
 * meteor run / meteor build handle that via transformAndSync (sync needs a
 * populated webDir that add-platform can't produce on its own).
 * @returns {Promise<number>}
 */
export async function addNativePlatformIfMissing({ appDir = getMeteorAppDir(), platform } = {}) {
  if (!platform) return 0;
  const path = require('path');
  const fs = require('fs');
  const nativeDir = path.join(appDir, platform);
  if (fs.existsSync(nativeDir)) {
    if (isVerbose()) {
      logInfo(`[Capacitor] ${platform}: native project already exists at ./${platform}/, skipping cap add`);
    }
    return 0;
  }
  return runCapAdd({ appDir, platform });
}

/**
 * Ensures the native project for the currently-targeted platform exists.
 * Resolves the platform from the run-target args (android/ios/*-device).
 * For `meteor build`, no-op (build doesn't care about a specific platform —
 * `cap sync` later will scaffold whatever is referenced).
 *
 * @returns {Promise<number>} Exit code.
 */
export function ensureNativePlatformAdded({ appDir = getMeteorAppDir() } = {}) {
  const platform = isMeteorAppNativeAndroid() ? 'android'
    : isMeteorAppNativeIos() ? 'ios'
    : null;
  if (!platform) return Promise.resolve(0);
  return runCapAdd({ appDir, platform });
}

/**
 * Runs `npx cap sync` in the app directory. Resolves on exit code 0.
 * Skips if a previous sync is still running.
 *
 * @returns {Promise<number>} Exit code.
 */
export function runCapSync({ appDir = getMeteorAppDir(), platform } = {}) {
  const existing = getGlobalState(PROC_KEYS.SYNC, null);
  if (existing && isProcessRunning(existing)) {
    if (isVerbose()) {
      logInfo('[Capacitor] Skipping cap sync: previous run still in progress');
    }
    return Promise.resolve(0);
  }

  return new Promise(resolve => {
    if (isVerbose()) logProgress('=> 🔄 Capacitor sync');
    const proc = spawnCap(['sync', ...(platform ? [platform] : [])], {
      cwd: appDir,
      label: 'Sync',
      platform,
      onExit: code => {
        setGlobalState(PROC_KEYS.SYNC, null);
        if (code === 0) {
          if (isVerbose()) logSuccess('=> ✅ Capacitor sync complete');
        } else {
          logError(`=> ❌ Capacitor sync exited with code ${code}`);
        }
        resolve(code);
      },
    });
    setGlobalState(PROC_KEYS.SYNC, proc);
  });
}

/**
 * Runs `npx cap run <platform>` in the app directory.
 * Long-running: returns the spawned process so callers can manage lifecycle.
 *
 * @returns {Object} The spawned process.
 */
export function runCapRun({ appDir = getMeteorAppDir(), platform, extraArgs = [] }) {
  const existing = getGlobalState(PROC_KEYS.RUN, null);
  if (existing && isProcessRunning(existing)) {
    return existing;
  }

  logProgress(`=> ▶️  Capacitor run ${platform}`);
  const proc = spawnCap(['run', platform, ...extraArgs], {
    cwd: appDir,
    label: `Run/${platform}`,
    platform,
    onExit: code => {
      setGlobalState(PROC_KEYS.RUN, null);
      if (code !== 0) logError(`=> ❌ Capacitor run exited with code ${code}`);
    },
  });
  setGlobalState(PROC_KEYS.RUN, proc);
  return proc;
}

/**
 * Runs `npx cap open <platform>` (opens Xcode / Android Studio).
 * Fire-and-forget.
 */
export function runCapOpen({ appDir = getMeteorAppDir(), platform }) {
  spawnCap(['open', platform], {
    cwd: appDir,
    label: `Open/${platform}`,
    platform,
  });
}

/**
 * Stops any long-lived Capacitor child processes. Called on Meteor exit.
 */
export function cleanup() {
  for (const key of Object.values(PROC_KEYS)) {
    const proc = getGlobalState(key, null);
    if (proc) {
      stopProcess(proc);
      setGlobalState(key, null);
    }
  }
}
