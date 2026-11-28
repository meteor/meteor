/**
 * @module processes
 * @description Spawns the Capacitor CLI for sync, build, run and open.
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
  getNativeCommandEnv,
  inheritMeteorToolNodeFlags,
  isMeteorAppDevelopment,
  isMeteorAppProduction,
  isMeteorAppDebug,
  isMeteorAppConfigModernVerbose,
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
const execFile = require('util').promisify(require('child_process').execFile);

const PROC_KEYS = {
  SYNC: 'capacitor.process.sync',
  RUN: 'capacitor.process.run',
};

const RUN_LAUNCH_STATE_KEY = 'capacitor.run.launchScheduled';
const CAPACITOR_RUN_MODES = new Set(['bundled', 'livereload']);

export function normalizeMobileServerUrl(value) {
  if (!value) return null;

  const normalized = String(value).trim();
  if (!normalized) return null;

  return /^[a-z][a-z\d+.-]*:\/\//i.test(normalized)
    ? normalized
    : `http://${normalized}`;
}

export function getCapacitorRunMode({
  mode,
  env = process.env,
} = {}) {
  const sourceValue = mode ||
    env.METEOR_CAPACITOR_MODE ||
    env.METEOR_NATIVE_MODE ||
    'bundled';
  const sourceName = mode ? 'mode'
    : env.METEOR_CAPACITOR_MODE ? 'METEOR_CAPACITOR_MODE'
      : env.METEOR_NATIVE_MODE ? 'METEOR_NATIVE_MODE'
        : 'default';
  const normalized = String(sourceValue).trim().toLowerCase();

  if (!CAPACITOR_RUN_MODES.has(normalized)) {
    throw new Error(
      `Invalid Capacitor run mode "${sourceValue}" from ${sourceName}. ` +
      'Use "bundled" or "livereload".'
    );
  }

  return normalized;
}

/**
 * Builds the env block injected into every spawned `cap` invocation.
 * defineConfig (in @meteorjs/capacitor) reads these to populate the
 * Meteor flag object handed to the user's capacitor.config.js factory.
 */
export function getCapacitorEnv({ platform, mode, mobileServerUrl } = {}) {
  const nativePlatform = platform || (isMeteorAppNativeAndroid() ? 'android' : isMeteorAppNativeIos() ? 'ios' : '');
  const isDev = isMeteorAppDevelopment();
  const isProd = isMeteorAppProduction();
  const webDir = getCapacitorWebDir({ isDevelopment: isDev, isProduction: isProd });
  const capacitorMode = getCapacitorRunMode({ mode });
  const normalizedMobileServerUrl = normalizeMobileServerUrl(mobileServerUrl);
  return {
    METEOR_CAPACITOR: 'true',
    METEOR_CAPACITOR_MODE: capacitorMode,
    METEOR_NATIVE_MODE: capacitorMode,
    METEOR_CAPACITOR_PLATFORM: nativePlatform,
    METEOR_BUILD_CONTEXT: CAPACITOR_BUILD_CONTEXT,
    METEOR_CAPACITOR_WEB_DIR: webDir,
    ...getNativeCommandEnv(nativePlatform),
    ...(normalizedMobileServerUrl ? {
      MOBILE_ROOT_URL: normalizedMobileServerUrl,
      MOBILE_DDP_URL: normalizedMobileServerUrl,
    } : {}),
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

function spawnCap(args, { cwd, label, env, onExit, onError, mode, platform, interactive, secrets = [] }) {
  const { command, args: cmdArgs } = _getCapCommand(args, { cwd });
  // Capacitor reports the plugins it selected and their native setup warnings
  // during add and sync, before the next Xcode or Gradle build.
  const showOutput = isVerbose() || args[0] === 'add' || args[0] === 'sync';
  const stderrLines = [];
  const redact = value => secrets.reduce((text, secret) => text.split(secret).join('[redacted]'), value);
  const outputBuffers = new Map();
  const logLine = (line, logger) => {
    if (!line.trim()) return;
    logger(`=> ${redact(line.trimEnd())}`);
  };
  const logOutput = (data, logger) => {
    const lines = ((outputBuffers.get(logger) || '') + data).split(/\r?\n/);
    outputBuffers.set(logger, lines.pop());
    for (const line of lines) logLine(line, logger);
  };
  const rememberStderr = data => {
    const trimmed = data.replace(/\s+$/, '');
    if (!trimmed) return;
    if (secrets.length) stderrLines.push(data);
    else stderrLines.push(...trimmed.split(/\r?\n/).filter(Boolean));
    if (stderrLines.length > 8) {
      stderrLines.splice(0, stderrLines.length - 8);
    }
  };
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
      onError: err => {
        logError(`Capacitor ${label} error: ${redact(err.message)}`);
        if (onError) onError(err);
      },
      onExit: code => {
        if (typeof onExit === 'function') onExit(code);
      },
    });
  }
  const finish = code => {
    for (const [logger, buffered] of outputBuffers) {
      logLine(buffered, logger);
    }
    if (code !== 0 && !showOutput && stderrLines.length) {
      const stderr = stderrLines.join(secrets.length ? '' : '\n');
      logError(`=> Capacitor ${label} failed: ${redact(stderr).trimEnd().split(/\r?\n/).pop()}`);
    }
    if (typeof onExit === 'function') onExit(code);
  };
  return spawnProcess(command, cmdArgs, {
    cwd,
    env: inheritMeteorToolNodeFlags({
      ...process.env,
      ...getNodeBinEnv(),
      ...getCapacitorEnv({ platform, mode }),
      ...(env || {}),
    }),
    onStdout: data => {
      if (showOutput) logOutput(data, logRaw);
    },
    onStderr: data => {
      if (showOutput) logOutput(data, logError);
      else rememberStderr(data);
    },
    onError: err => {
      logError(`Capacitor ${label} error: ${redact(err.message)}`);
      if (onError) onError(err);
    },
    onExit: finish,
  });
}

/** Create the configured native project once across add, run, and build. */
export async function addNativePlatformIfMissing({ appDir = getMeteorAppDir(), platform, nativeDir } = {}) {
  if (!platform) return 0;
  if (!nativeDir) {
    const reader = Plugin.projectConfig;
    const file = reader.findProjectConfig(appDir, 'capacitor.config');
    const configured = file && await reader.readPlatformPath(file, [platform, 'path'], getCapacitorEnv({ platform }));
    nativeDir = path.resolve(appDir, configured || platform);
  }
  if (fs.existsSync(nativeDir)) {
    if (isVerbose()) logInfo(`[Capacitor] Native project already exists at ${nativeDir}, skipping cap add`);
    return 0;
  }

  return new Promise(resolve => {
    logProgress(`=> Capacitor: adding ${platform} platform`);
    _ensureCapacitorWebDirIndex({ appDir });
    spawnCap(['add', platform], {
      cwd: appDir,
      label: `Add/${platform}`,
      platform,
      onExit: code => {
        if (code === 0) logSuccess(`=> Capacitor: added ${platform} platform`);
        else logError(`=> Capacitor: add ${platform} exited with code ${code}`);
        resolve(code);
      },
    });
  });
}

/**
 * Ensures the native project for the currently-targeted platform exists.
 * Resolves the platform from the run-target args (android/ios/*-device).
 * For `meteor build`, selected project creation belongs to the build scenario.
 *
 * @returns {Promise<number>} Exit code.
 */
export function ensureNativePlatformAdded({ appDir = getMeteorAppDir() } = {}) {
  const platform = isMeteorAppNativeAndroid() ? 'android'
    : isMeteorAppNativeIos() ? 'ios'
    : null;
  return addNativePlatformIfMissing({ appDir, platform });
}

/**
 * Runs `npx cap sync` in the app directory. Resolves on exit code 0.
 * Skips if a previous sync is still running.
 *
 * @returns {Promise<number>} Exit code.
 */
export function runCapSync({ appDir = getMeteorAppDir(), platform, mode } = {}) {
  const existing = getGlobalState(PROC_KEYS.SYNC, null);
  if (existing && isProcessRunning(existing)) {
    if (isVerbose()) {
      logInfo('[Capacitor] Skipping cap sync: previous run still in progress');
    }
    return Promise.resolve(0);
  }

  return new Promise(resolve => {
    logProgress(`=> Capacitor: syncing${platform ? ` ${platform}` : ''}`);
    const proc = spawnCap(['sync', ...(platform ? [platform] : [])], {
      cwd: appDir,
      label: 'Sync',
      platform,
      mode,
      onExit: code => {
        setGlobalState(PROC_KEYS.SYNC, null);
        if (code === 0) {
          logSuccess(`=> Capacitor: synced${platform ? ` ${platform}` : ''}`);
        } else {
          logError(`=> Capacitor: sync exited with code ${code}`);
        }
        resolve(code);
      },
    });
    setGlobalState(PROC_KEYS.SYNC, proc);
  });
}

/** Package selected native projects after Meteor has transformed and synced them. */
export function runCapBuild({ appDir = getMeteorAppDir(), request, mode } = {}) {
  const { platform } = request;
  logProgress(`=> Capacitor: building ${platform}`);
  return new Promise((resolve, reject) => {
    const callbacks = {
      onError: reject,
      onExit: code => {
        if (code === 0) logSuccess(`=> Capacitor: built ${platform}`);
        resolve(code);
      },
    };
    if (request.gradleTask) {
      const wrapper = path.join(request.nativeDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
      spawnProcess(wrapper, [request.gradleTask], {
        cwd: request.nativeDir,
        env: { ...process.env, ...getCapacitorEnv({ platform, mode }) },
        stdio: 'inherit',
        ...callbacks,
      });
    } else {
      spawnCap(request.args, { cwd: appDir, label: 'Build', platform, mode, secrets: request.secrets, ...callbacks });
    }
  });
}

function shouldSkipNativeRun() {
  return /^(1|true|yes)$/i.test(process.env.METEOR_CAPACITOR_SKIP_NATIVE_RUN || '');
}

/**
 * Lists run targets via `cap run <platform> --list --json` and returns the
 * parsed array. Discovery errors must not become an empty selection.
 * @returns {Promise<Array<{name:string,api:string,id:string}>>}
 */
export function listCapTargets({ appDir = getMeteorAppDir(), platform } = {}) {
  return new Promise((resolve, reject) => {
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
      onError: reject,
      onExit: code => {
        if (code !== 0) return reject(new Error(`Capacitor target listing failed with exit code ${code}.`));
        const match = stdoutBuf.match(/\[\s*{[\s\S]*}\s*\]|\[\s*\]/);
        if (!match) return reject(new Error('Capacitor returned an invalid target list.'));
        try { resolve(JSON.parse(match[0])); }
        catch { reject(new Error('Capacitor returned an invalid target list.')); }
      },
    });
  });
}

async function onlineCapTargets({ appDir, platform, targets }) {
  const options = { cwd: appDir, env: process.env, timeout: 15000 };
  if (platform === 'android') {
    const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
    const adb = sdk ? path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb') : 'adb';
    const { stdout } = await execFile(adb, ['devices'], options);
    const serials = stdout.split(/\r?\n/).map(line => line.trim().split(/\s+/))
      .filter(([, state]) => state === 'device').map(([id]) => id);
    // Capacitor can list a running emulator under both its serial and AVD name.
    const online = await Promise.all(serials.map(async serial => {
      const ids = [serial];
      if (serial.startsWith('emulator-')) {
        const { stdout: avd } = await execFile(adb, ['-s', serial, 'emu', 'avd', 'name'], options);
        ids.push(avd.trim().split(/\r?\n/)[0]);
      }
      return ids.map(id => targets.find(target => target.id === id)).find(Boolean);
    }));
    return online.filter(Boolean);
  }
  const { stdout } = await execFile('xcrun', ['simctl', 'list', 'devices', '--json'], options);
  const simulators = Object.values(JSON.parse(stdout).devices).flat();
  return targets.filter(target => {
    const simulator = simulators.find(device => device.udid === target.id);
    // Capacitor lists only connected physical iOS devices.
    return !simulator || simulator.state === 'Booted';
  });
}

/**
 * Preserve an explicit target; select one online device automatically.
 * Null leaves ambiguous interactive selection to Capacitor's own TTY picker.
 * @returns {Promise<string|null>}
 */
export async function resolveCapTarget({ appDir = getMeteorAppDir(), platform, extraArgs = [] } = {}) {
  if (extraArgs.some(arg => /^--(?:target|target-name|list)(?:=|$)/.test(arg))) return null;
  if (process.env.METEOR_CAPACITOR_TARGET) return process.env.METEOR_CAPACITOR_TARGET;
  if (process.env.METEOR_CAPACITOR_TARGET_NAME || /^(1|true|yes)$/i.test(process.env.METEOR_CAPACITOR_LIST || '')) return null;
  const targets = [...new Map((await listCapTargets({ appDir, platform }))
    .filter(target => target.id && target.id !== '?').map(target => [target.id, target])).values()];
  const online = targets.length ? await onlineCapTargets({ appDir, platform, targets }) : [];
  if (online.length === 1) return online[0].id;
  if (targets.length && process.stdin.isTTY && process.stdout.isTTY &&
      !/^(1|true|yes)$/i.test(process.env.CI || '') &&
      !/^(1|true|yes)$/i.test(process.env.METEOR_HEADLESS || '')) return null;
  const reason = online.length ? 'Multiple online devices' : 'No online device';
  const choices = targets.map(target => `${target.name || target.id} (${target.id})`).join(', ');
  throw new Error(`${reason} for ${platform}. Set METEOR_CAPACITOR_TARGET to a target ID${choices ? `: ${choices}` : '; connect a device or start a simulator first'}.`);
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
export function runCapRun({ appDir = getMeteorAppDir(), platform, extraArgs = [], mode }) {
  const existing = getGlobalState(PROC_KEYS.RUN, null);
  if (existing && isProcessRunning(existing)) {
    return existing;
  }

  const finalArgs = _mergeExtraArgsWithEnv(extraArgs);

  logProgress(`=> Capacitor: launching ${platform}`);
  const proc = spawnCap(['run', platform, ...finalArgs], {
    cwd: appDir,
    label: `Run/${platform}`,
    platform,
    mode,
    interactive: true,
    onExit: code => {
      setGlobalState(PROC_KEYS.RUN, null);
      if (code !== 0 && isVerbose()) {
        logError(`=> Capacitor: run exited with code ${code}`);
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
  mode,
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
      logProgress(`=> Capacitor: waiting for Meteor server at ${readinessUrl}`);
    }
    const ready = await waitForReady({ url: readinessUrl });
    if (!ready?.ok) {
      setGlobalState(RUN_LAUNCH_STATE_KEY, null);
      logError(`=> Capacitor: timed out waiting for Meteor server at ${readinessUrl}`);
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

    const target = await resolveTarget({ appDir, platform, extraArgs });
    const runArgs = [...extraArgs];
    if (target) {
      logInfo(`=> Capacitor launching on ${target}`);
      runArgs.push(`--target=${target}`);
    }
    run({ appDir, platform, mode, extraArgs: runArgs });
  })().catch(error => {
    setGlobalState(RUN_LAUNCH_STATE_KEY, null);
    logError(`=> Capacitor: launch failed: ${error.message}`);
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
