/**
 * @module dependencies
 * @description Ensures Capacitor NPM dependencies are present in the consuming app.
 */

const fs = require('fs');
const path = require('path');

const {
  getGlobalState,
  setGlobalState,
} = require('meteor/tools-core/lib/global-state');
const {
  logProgress,
  logSuccess,
  logInfo,
  logError,
} = require('meteor/tools-core/lib/log');
const {
  getMeteorAppDir,
} = require('meteor/tools-core/lib/meteor');
const {
  installNpmDependency,
} = require('meteor/tools-core/lib/npm');

// Checks node_modules, not package.json. checkNpmDependencyExists treats
// a declaration as "exists", which masks half-installed apps.
function isCapacitorDepInstalled(name, appDir) {
  return fs.existsSync(path.join(appDir, 'node_modules', name, 'package.json'));
}

const {
  DEFAULT_CAPACITOR_VERSION,
  DEFAULT_METEOR_CAPACITOR_VERSION,
  GLOBAL_STATE_KEYS,
} = require('./constants');

/**
 * Installs the minimum set of Capacitor packages the build plugin assumes.
 *
 * @returns {Promise<void>}
 */
export async function ensureCapacitorInstalled() {
  if (getGlobalState(GLOBAL_STATE_KEYS.CAPACITOR_INSTALLATION_CHECKED, false)) {
    return;
  }

  const appDir = getMeteorAppDir();
  const dependencies = [
    { name: '@capacitor/core', version: `^${DEFAULT_CAPACITOR_VERSION}`, dev: false },
    { name: '@capacitor/cli', version: `^${DEFAULT_CAPACITOR_VERSION}`, dev: true },
    { name: '@capacitor/android', version: `^${DEFAULT_CAPACITOR_VERSION}`, dev: false },
    { name: '@capacitor/ios', version: `^${DEFAULT_CAPACITOR_VERSION}`, dev: false },
    { name: '@meteorjs/capacitor', version: `^${DEFAULT_METEOR_CAPACITOR_VERSION}`, dev: true },
  ];

  const missing = dependencies.filter(
    dep => !isCapacitorDepInstalled(dep.name, appDir)
  );

  if (missing.length === 0) {
    setGlobalState(GLOBAL_STATE_KEYS.CAPACITOR_INSTALLATION_CHECKED, true);
    return;
  }

  logProgress('=> 📦 Capacitor Dependencies');
  missing.forEach(dep => logInfo(`   • ${dep.name}@${dep.version}`));

  const isYarn = process.env.YARN_ENABLED === 'true';
  const devDeps = missing.filter(d => d.dev).map(d => `${d.name}@${d.version}`);
  const runtimeDeps = missing.filter(d => !d.dev).map(d => `${d.name}@${d.version}`);

  let ok = true;
  if (devDeps.length) {
    ok = ok && await installNpmDependency(devDeps, { cwd: appDir, dev: true, yarn: isYarn });
  }
  if (runtimeDeps.length) {
    ok = ok && await installNpmDependency(runtimeDeps, { cwd: appDir, dev: false, yarn: isYarn });
  }

  if (!ok) {
    logError('=> ❌ Failed to install Capacitor dependencies');
    throw new Error('Failed to install Capacitor dependencies. Install them manually and re-run.');
  }

  logSuccess('=> ✅ Installed Capacitor dependencies');
  setGlobalState(GLOBAL_STATE_KEYS.CAPACITOR_INSTALLATION_CHECKED, true);
}
