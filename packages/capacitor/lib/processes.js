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
const { waitForMeteorIndexReady, getMeteorIndexUrl } = require('./readiness');

const {
  CAPACITOR_BUILD_CONTEXT,
  getCapacitorWebDir,
} = require('./constants');

const fs = require('fs');
const path = require('path');

const PROC_KEYS = {
  SYNC: 'capacitor.process.sync',
  RUN: 'capacitor.process.run',
};

const RUN_LAUNCH_STATE_KEY = 'capacitor.run.launchScheduled';

/**
 * Builds the env block injected into every spawned `cap` invocation.
 * defineConfig (in @meteorjs/capacitor) reads these to populate the
 * Meteor flag object handed to the user's capacitor.config.js factory.
 */
export function getCapacitorEnv({ platform, mode } = {}) {
  const isAndroid = isMeteorAppNativeAndroid();
  const isIos = isMeteorAppNativeIos();
  const isDev = isMeteorAppDevelopment();
  const isProd = isMeteorAppProduction();
  const webDir = getCapacitorWebDir({ isDevelopment: isDev, isProduction: isProd });
  const capacitorMode = mode || process.env.METEOR_CAPACITOR_MODE ||
    (isProd ? 'bundled' : 'development');
  return {
    METEOR_CAPACITOR: 'true',
    METEOR_CAPACITOR_MODE: capacitorMode,
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

export function _getCapCommand(args, { cwd = getMeteorAppDir() } = {}) {
  const binName = process.platform === 'win32' ? 'cap.cmd' : 'cap';
  const localCap = path.join(cwd, 'node_modules', '.bin', binName);
  if (fs.existsSync(localCap)) {
    return {
      command: localCap,
      args,
      prefix: localCap,
    };
  }
  return getNpxCommand(['cap', ...args]);
}

export function _ensureCapacitorWebDirIndex({
  appDir = getMeteorAppDir(),
  webDir = getCapacitorWebDir({
    isDevelopment: isMeteorAppDevelopment(),
    isProduction: isMeteorAppProduction(),
  }),
} = {}) {
  const targetDir = path.join(appDir, webDir);
  const indexPath = path.join(targetDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    return indexPath;
  }
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(
    indexPath,
    '<!doctype html><html><head><meta charset="utf-8"><title>Meteor Capacitor</title></head><body></body></html>\n',
    'utf8'
  );
  return indexPath;
}

function spawnCap(args, { cwd, label, env, onExit, mode, platform, interactive }) {
  const { command, args: cmdArgs } = _getCapCommand(args, { cwd });
  // Interactive commands (cap run's target picker) need the parent's TTY;
  // piped stdio corrupts arrow-key navigation and ANSI cursor moves.
  if (interactive) {
    return spawnProcess(command, cmdArgs, {
      cwd,
      env: inheritMeteorToolNodeFlags({
        ...process.env,
        ...getNodeBinEnv(),
        ...getCapacitorEnv({ platform, mode }),
        ...(env || {}),
      }),
      stdio: 'inherit',
      onError: err => logError(`Capacitor ${label} error: ${err.message}`),
      onExit: code => {
        if (typeof onExit === 'function') onExit(code);
      },
    });
  }
  return spawnProcess(command, cmdArgs, {
    cwd,
    env: inheritMeteorToolNodeFlags({
      ...process.env,
      ...getNodeBinEnv(),
      ...getCapacitorEnv({ platform, mode }),
      ...(env || {}),
    }),
    onStdout: data => {
      const trimmed = data.replace(/\s+$/, '');
      if (!trimmed) return;
      trimmed.split(/\r?\n/).forEach(line => {
        if (line) logRaw(`=> ${line}`);
      });
    },
    onStderr: data => {
      const trimmed = data.replace(/\s+$/, '');
      if (!trimmed) return;
      trimmed.split(/\r?\n/).forEach(line => {
        if (line) logError(`=> ${line}`);
      });
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
    _ensureCapacitorWebDirIndex({ appDir });
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

function shouldAutoPickTarget() {
  return /^(1|true|yes)$/i.test(process.env.METEOR_CAPACITOR_AUTO_PICK_TARGET || '');
}

function shouldSkipNativeRun() {
  return /^(1|true|yes)$/i.test(process.env.METEOR_CAPACITOR_SKIP_NATIVE_RUN || '');
}

/**
 * Lists run targets via `cap run <platform> --list --json` and returns the
 * parsed array. Empty on no targets / parse failure.
 * @returns {Promise<Array<{name:string,api:string,id:string}>>}
 */
export function listCapTargets({ appDir = getMeteorAppDir(), platform } = {}) {
  return new Promise(resolve => {
    const { command, args: cmdArgs } = _getCapCommand(['run', platform, '--list', '--json'], {
      cwd: appDir,
    });
    let stdoutBuf = '';
    spawnProcess(command, cmdArgs, {
      cwd: appDir,
      env: inheritMeteorToolNodeFlags({
        ...process.env,
        ...getNodeBinEnv(),
        ...getCapacitorEnv({ platform }),
      }),
      onStdout: data => { stdoutBuf += data; },
      onStderr: () => {},
      onExit: () => {
        const match = stdoutBuf.match(/\[\s*{[\s\S]*}\s*\]|\[\s*\]/);
        if (!match) return resolve([]);
        try { resolve(JSON.parse(match[0])); }
        catch { resolve([]); }
      },
    });
  });
}

/**
 * Resolves a target for `cap run`. METEOR_CAPACITOR_TARGET wins; the temporary
 * first-target auto-pick path only runs when METEOR_CAPACITOR_AUTO_PICK_TARGET
 * is truthy. Null leaves target selection to Capacitor.
 * @returns {Promise<string|null>}
 */
export async function resolveCapTarget({ appDir = getMeteorAppDir(), platform } = {}) {
  if (process.env.METEOR_CAPACITOR_TARGET) return process.env.METEOR_CAPACITOR_TARGET;
  if (!shouldAutoPickTarget()) return null;
  const targets = await listCapTargets({ appDir, platform });
  return targets[0]?.id || null;
}

/**
 * Environment variables starting with this prefix are automatically passed
 * through to the Capacitor CLI as flags.
 */
const CAP_ENV_PREFIX = 'METEOR_CAPACITOR_';

/**
 * Internal environment variables that should NOT be passed as CLI flags.
 */
const CAP_INTERNAL_ENVS = new Set([
  'METEOR_CAPACITOR',
  'METEOR_CAPACITOR_MODE',
  'METEOR_CAPACITOR_PLATFORM',
  'METEOR_CAPACITOR_WEB_DIR',
  'METEOR_CAPACITOR_LOCAL_IP',
  'METEOR_CAPACITOR_AUTO_PICK_TARGET',
  'METEOR_CAPACITOR_SKIP_NATIVE_RUN',
]);

/**
 * Returns an array of CLI arguments for `cap run` derived dynamically from
 * METEOR_CAPACITOR_* environment variables.
 *
 * @private (exported for testing)
 */
export function _getCapRunArgsFromEnv() {
  const args = [];
  Object.keys(process.env).forEach(key => {
    if (key.startsWith(CAP_ENV_PREFIX) && !CAP_INTERNAL_ENVS.has(key)) {
      const value = process.env[key];
      if (!value) return;

      // Convert METEOR_CAPACITOR_SOME_FLAG to --some-flag
      let flag = '--' + key
        .slice(CAP_ENV_PREFIX.length)
        .toLowerCase()
        .replace(/_/g, '-');

      // Special case: FORWARD_PORTS -> forwardPorts (camelCase)
      if (key === 'METEOR_CAPACITOR_FORWARD_PORTS') flag = '--forwardPorts';

      if (/^(1|true|yes)$/i.test(value)) {
        args.push(flag);
      } else {
        args.push(`${flag}=${value}`);
      }
    }
  });
  return args;
}

/**
 * Merges extraArgs with arguments derived from METEOR_CAPACITOR_* environment
 * variables. extraArgs takes precedence in case of collisions.
 *
 * @private (exported for testing)
 */
export function _mergeExtraArgsWithEnv(extraArgs = []) {
  const envArgs = _getCapRunArgsFromEnv();
  const finalArgs = [...extraArgs];
  envArgs.forEach(arg => {
    const flag = arg.split('=')[0];
    // Check for exact match or flag= prefix to avoid --target matching --target-name
    if (!finalArgs.some(a => a === flag || a.startsWith(flag + '='))) {
      finalArgs.push(arg);
    }
  });
  return finalArgs;
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

  const finalArgs = _mergeExtraArgsWithEnv(extraArgs);

  if (isVerbose()) logProgress(`=> ▶️  Capacitor run ${platform}`);
  const proc = spawnCap(['run', platform, ...finalArgs], {
    cwd: appDir,
    label: `Run/${platform}`,
    platform,
    interactive: true,
    onExit: code => {
      setGlobalState(PROC_KEYS.RUN, null);
      if (code !== 0 && isVerbose()) {
        logError(`=> ❌ Capacitor run exited with code ${code}`);
      }
    },
  });
  setGlobalState(PROC_KEYS.RUN, proc);
  return proc;
}

/**
 * Schedules the single interactive `cap run` launch for a Meteor run command.
 * The build plugin must not await Meteor HTTP readiness during bundling because
 * the app server only starts after the bundle step returns.
 */
export function scheduleCapRunAfterMeteorReady({
  appDir = getMeteorAppDir(),
  platform,
  extraArgs = [],
  readinessUrl = getMeteorIndexUrl(),
  waitForReady = waitForMeteorIndexReady,
  resolveTarget = resolveCapTarget,
  beforeRun = async () => true,
  run = runCapRun,
} = {}) {
  if (!platform) return false;

  const existingLaunch = getGlobalState(RUN_LAUNCH_STATE_KEY, null);
  const existingRun = getGlobalState(PROC_KEYS.RUN, null);
  if (existingLaunch || (existingRun && isProcessRunning(existingRun))) {
    return false;
  }

  setGlobalState(RUN_LAUNCH_STATE_KEY, true);

  (async () => {
    if (isVerbose()) {
      logProgress(`=> ⏳ Capacitor waiting for Meteor server at ${readinessUrl}`);
    }
    const ready = await waitForReady({ url: readinessUrl });
    if (!ready?.ok) {
      setGlobalState(RUN_LAUNCH_STATE_KEY, null);
      logError(`=> ❌ Capacitor timed out waiting for Meteor server at ${readinessUrl}`);
      return;
    }

    const beforeRunOk = await beforeRun({ appDir, platform });
    if (beforeRunOk === false) {
      setGlobalState(RUN_LAUNCH_STATE_KEY, null);
      return;
    }

    if (shouldSkipNativeRun()) {
      setGlobalState(RUN_LAUNCH_STATE_KEY, null);
      logInfo('=> Capacitor native run skipped by METEOR_CAPACITOR_SKIP_NATIVE_RUN');
      return;
    }

    const target = await resolveTarget({ appDir, platform });
    const runArgs = [...extraArgs];
    if (target) {
      logInfo(`=> Capacitor launching on ${target}${process.env.METEOR_CAPACITOR_TARGET ? '' : ' (auto-picked)'}`);
      runArgs.push(`--target=${target}`);
    }
    run({ appDir, platform, extraArgs: runArgs });
  })().catch(error => {
    setGlobalState(RUN_LAUNCH_STATE_KEY, null);
    logError(`=> ❌ Capacitor launch failed: ${error.message}`);
  });

  return true;
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
