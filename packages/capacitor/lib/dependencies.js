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
  getMeteorAppPackageJson,
} = require('meteor/tools-core/lib/meteor');
const {
  installNpmDependency,
} = require('meteor/tools-core/lib/npm');

function isCapacitorDepInstalled(name, appDir) {
  return fs.existsSync(path.join(appDir, 'node_modules', name, 'package.json'));
}

export function isCapacitorDepDeclared({ name, dev }, packageJson) {
  const expectedSection = dev ? packageJson.devDependencies : packageJson.dependencies;
  return !!expectedSection?.[name];
}

const {
  DEFAULT_CAPACITOR_VERSION,
  DEFAULT_METEOR_CAPACITOR_VERSION,
  CAPACITOR_PLATFORMS,
  GLOBAL_STATE_KEYS,
} = require('./constants');

const BASE_DEPENDENCIES = [
  { name: '@capacitor/core', version: `^${DEFAULT_CAPACITOR_VERSION}`, dev: false },
  { name: '@capacitor/cli', version: `^${DEFAULT_CAPACITOR_VERSION}`, dev: true },
  { name: '@meteorjs/capacitor', version: `^${DEFAULT_METEOR_CAPACITOR_VERSION}`, dev: true },
];

const PLATFORM_DEPENDENCIES = {
  android: { name: '@capacitor/android', version: `^${DEFAULT_CAPACITOR_VERSION}`, dev: false },
  ios: { name: '@capacitor/ios', version: `^${DEFAULT_CAPACITOR_VERSION}`, dev: false },
};

export function getCapacitorDependenciesForPlatforms(platforms) {
  const selectedPlatforms = platforms
    ? Array.from(new Set(platforms)).filter(platform => CAPACITOR_PLATFORMS.includes(platform))
    : CAPACITOR_PLATFORMS;

  return [
    ...BASE_DEPENDENCIES,
    ...selectedPlatforms.map(platform => PLATFORM_DEPENDENCIES[platform]),
  ];
}

/**
 * Installs the minimum set of Capacitor packages the build plugin assumes.
 *
 * @param {Object} [options]
 * @param {string[]|null} [options.platforms] Native platform dependencies to
 * include. Omit to install all platform dependencies.
 * @returns {Promise<void>}
 */
export async function ensureCapacitorInstalled({ platforms = null } = {}) {
  if (getGlobalState(GLOBAL_STATE_KEYS.CAPACITOR_INSTALLATION_CHECKED, false)) {
    return;
  }

  const appDir = getMeteorAppDir();
  const packageJson = getMeteorAppPackageJson();
  const dependencies = getCapacitorDependenciesForPlatforms(platforms);

  const missing = dependencies.filter(
    dep => !isCapacitorDepDeclared(dep, packageJson) ||
      !isCapacitorDepInstalled(dep.name, appDir)
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
    ok = ok && await installNpmDependency(runtimeDeps, {
      cwd: appDir,
      dev: false,
      includeDev: true,
      yarn: isYarn,
    });
  }

  if (!ok) {
    logError('=> ❌ Failed to install Capacitor dependencies');
    throw new Error('Failed to install Capacitor dependencies. Install them manually and re-run.');
  }

  logSuccess('=> ✅ Installed Capacitor dependencies');
  setGlobalState(GLOBAL_STATE_KEYS.CAPACITOR_INSTALLATION_CHECKED, true);
}
