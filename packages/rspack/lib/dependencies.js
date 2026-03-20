/**
 * @module dependencies
 * @description Functions for managing dependencies for Rspack plugin
 */
import { 
  DEFAULT_METEOR_RSPACK_REACT_REFRESH_VERSION, 
  DEFAULT_METEOR_RSPACK_SWC_HELPERS_VERSION,
  DEFAULT_RSDOCTOR_RSPACK_PLUGIN_VERSION
} from "./constants";

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
  isMeteorAppUpdate,
  getMeteorAppDir,
} = require('meteor/tools-core/lib/meteor');
const {
  checkNpmDependencyExists,
  installNpmDependency,
  checkNpmDependencyVersion,
} = require('meteor/tools-core/lib/npm');
const {
  joinWithAnd,
} = require('meteor/tools-core/lib/string');

const {
  DEFAULT_RSPACK_VERSION,
  DEFAULT_METEOR_RSPACK_VERSION,
  DEFAULT_METEOR_RSPACK_REACT_HMR_VERSION,
  GLOBAL_STATE_KEYS,
} = require('./constants');

/**
 * Generic function to ensure dependencies are installed with correct versions
 * @param {Object[]} dependencies - Array of dependency objects with name, version, and semverCondition
 * @param {string} globalStateKey - Global state key to track if check has been done
 * @param {string} packageName - Name of the package for logging purposes
 * @returns {Promise<void>} A promise that resolves when the check/installation is complete
 * @throws {Error} If installation fails
 */
async function ensureDependenciesInstalled(dependencies, globalStateKey, packageName) {
  // Skip if already checked
  if (getGlobalState(globalStateKey, false)) {
    return;
  }

  const appDir = getMeteorAppDir();

  // Filter dependencies that need to be installed (missing or wrong version)
  const allDepsToInstall = dependencies.filter(dep =>
    !checkNpmDependencyExists(dep.name, { cwd: appDir }) ||
    !checkNpmDependencyVersion(dep.name, {
      cwd: appDir,
      versionRequirement: dep.version,
      semverCondition: dep.semverCondition || 'gte',
      existenceOnly: dep.existenceOnly,
    })
  );

  // Format dependencies for installation
  const dependencyStrings = allDepsToInstall.map(dep => `${dep.name}@${dep.version}`);

  if (allDepsToInstall.length > 0) {
    let devDepsSuccess = true;
    let regularDepsSuccess = true;
    let devDepsStrings = [];
    let regularDepsStrings = [];

    // Display a header for the installation process
    logProgress(`=> 📦 ${packageName} Dependencies`);

    // Show what dependencies will be installed
    dependencyStrings.forEach(dep => {
      logInfo(`   • ${dep}`);
    });

    // Check if this is a Yarn project
    const isYarnProj = process.env.YARN_ENABLED === 'true';

    // Install dev dependencies
    const devDepsToInstall = allDepsToInstall.filter(dep => dep.dev === true || dep.dev == null);
    if (devDepsToInstall.length > 0) {
      devDepsStrings = devDepsToInstall.map(dep => `${dep.name}@${dep.version}`);

      // Log progress for dev dependencies
      logProgress(
        `=> 🔧 Installing ${devDepsToInstall.length} dev dependenc${
          devDepsToInstall.length === 1 ? "y" : "ies"
        }...`
      );

      devDepsSuccess = await installNpmDependency(devDepsStrings, {
        cwd: appDir,
        dev: true,
        yarn: isYarnProj,
      });
    }

    // Install regular dependencies
    const regularDepsToInstall = allDepsToInstall.filter(dep => dep.dev === false);
    if (regularDepsToInstall.length > 0) {
      regularDepsStrings = regularDepsToInstall.map(dep => `${dep.name}@${dep.version}`);

      // Log progress for regular dependencies
      logProgress(
        `=> 🔧 Installing ${regularDepsToInstall.length} dependenc${
          regularDepsToInstall.length === 1 ? "y" : "ies"
        }...`
      );

      regularDepsSuccess = await installNpmDependency(regularDepsStrings, {
        cwd: appDir,
        dev: false,
        yarn: isYarnProj,
      });
    }

    const success = devDepsSuccess && regularDepsSuccess;

    if (!success) {
      const isYarnProj = process.env.YARN_ENABLED === 'true';

      logError(`=> ❌ Failed to install ${packageName}`);

      if (!devDepsSuccess && devDepsStrings.length > 0) {
        const devInstallCommand = isYarnProj 
          ? `yarn add --dev ${devDepsStrings.join(' ').trim()}`
          : `meteor npm install -D ${devDepsStrings.join(' ').trim()}`;
        logError(`   For dev dependencies, run: ${devInstallCommand}`);
      }

      if (!regularDepsSuccess && regularDepsStrings.length > 0) {
        const regularInstallCommand = isYarnProj 
          ? `yarn add ${regularDepsStrings.join(' ').trim()}`
          : `meteor npm install ${regularDepsStrings.join(' ').trim()}`;
        logError(`   For regular dependencies, run: ${regularInstallCommand}`);
      }

      const allFailedDeps = [];
      if (!devDepsSuccess) allFailedDeps.push('dev dependencies');
      if (!regularDepsSuccess) allFailedDeps.push('regular dependencies');

      throw new Error(
        `Failed to install ${packageName} ${joinWithAnd(allFailedDeps)}. Please install them manually with the commands above.`
      );
    }

    logSuccess(`=> ✅ Installed ${packageName} dependencies`);

    if (isMeteorAppUpdate()) {
      const isYarnProj = process.env.YARN_ENABLED === 'true';
      const installCommand = isYarnProj ? 'yarn install' : 'npm install';

      logInfo(`=> 🔔 Remember: Run \`${installCommand}\` after the Meteor update finishes.`);
      logInfo(`   This helps keep your dependencies correct and your project stable.`);
    }
  }

  // Mark as checked
  setGlobalState(globalStateKey, true);
}

/**
 * Checks if Rspack is installed, and installs it if not
 * @returns {Promise<void>} A promise that resolves when the check/installation is complete
 * @throws {Error} If Rspack installation fails
 */
export async function ensureRspackInstalled() {
  const dependencies = [
    { name: '@rspack/cli', version: DEFAULT_RSPACK_VERSION, semverCondition: 'gte', dev: true },
    { name: '@rspack/core', version: DEFAULT_RSPACK_VERSION, semverCondition: 'gte', dev: true },
    { name: '@meteorjs/rspack', version: DEFAULT_METEOR_RSPACK_VERSION, semverCondition: 'gte', dev: true },
    { name: '@swc/helpers', version: DEFAULT_METEOR_RSPACK_SWC_HELPERS_VERSION, semverCondition: 'gte', dev: false },
    { name: '@rsdoctor/rspack-plugin', version: DEFAULT_RSDOCTOR_RSPACK_PLUGIN_VERSION, semverCondition: 'gte', dev: true },
  ];

  await ensureDependenciesInstalled(
    dependencies,
    GLOBAL_STATE_KEYS.RSPACK_INSTALLATION_CHECKED,
    'Rspack',
  );
}

/**
 * Checks if React is installed and sets global state accordingly
 * Sets global state and environment variables based on React detection
 * @returns {Promise<void>} A promise that resolves when the check is complete
 */
export function checkReactInstalled() {
  // Skip if already checked
  if (getGlobalState(GLOBAL_STATE_KEYS.REACT_CHECKED, false)) {
    return;
  }

  const appDir = getMeteorAppDir();
  // Check if React is a dependency in the project
  const isReactInstalled = checkNpmDependencyExists('react', { cwd: appDir });

  if (isReactInstalled) {
    // Set environment variable to indicate React is enabled
    process.env.METEOR_REACT_ENABLED = 'true';
  } else {
    process.env.METEOR_REACT_ENABLED = 'false';
  }

  // Mark as checked
  setGlobalState(GLOBAL_STATE_KEYS.REACT_CHECKED, true);

  return isReactInstalled;
}

export async function ensureRspackReactInstalled() {
  const dependencies = [
    { name: '@rspack/plugin-react-refresh', version: DEFAULT_METEOR_RSPACK_REACT_HMR_VERSION, semverCondition: 'gte', dev: true },
    { name: 'react-refresh', version: DEFAULT_METEOR_RSPACK_REACT_REFRESH_VERSION, semverCondition: 'gte', dev: true },
  ];

  await ensureDependenciesInstalled(
    dependencies,
    GLOBAL_STATE_KEYS.RSPACK_REACT_INSTALLATION_CHECKED,
    'Rspack React'
  );
}

/**
 * Checks if Rspack Doctor is installed, and installs it if not
 * @returns {Promise<void>} A promise that resolves when the check/installation is complete
 * @throws {Error} If Rspack Doctor installation fails
 */
export async function ensureRspackDoctorInstalled() {
  const dependencies = [
    { name: '@rsdoctor/rspack-plugin', version: DEFAULT_RSDOCTOR_RSPACK_PLUGIN_VERSION, semverCondition: 'gte', dev: true },
  ];

  await ensureDependenciesInstalled(
    dependencies,
    GLOBAL_STATE_KEYS.RSPACK_DOCTOR_INSTALLATION_CHECKED,
    'Rspack Doctor'
  );
}

/**
 * Checks if TypeScript is installed and sets global state accordingly
 * Sets global state and environment variables based on TypeScript detection
 * @returns {boolean} Whether TypeScript is installed
 */
export function checkTypescriptInstalled() {
  // Skip if already checked
  if (getGlobalState(GLOBAL_STATE_KEYS.TYPESCRIPT_CHECKED, false)) {
    return;
  }

  const appDir = getMeteorAppDir();
  // Check if TypeScript is a dependency in the project
  const isTypescriptInstalled = checkNpmDependencyExists('typescript', { cwd: appDir });

  if (isTypescriptInstalled) {
    // Set environment variable to indicate TypeScript is enabled
    process.env.METEOR_TYPESCRIPT_ENABLED = 'true';
  } else {
    process.env.METEOR_TYPESCRIPT_ENABLED = 'false';
  }

  // Mark as checked
  setGlobalState(GLOBAL_STATE_KEYS.TYPESCRIPT_CHECKED, true);

  return isTypescriptInstalled;
}

/**
 * Checks if Angular is installed and sets global state accordingly
 * Sets global state and environment variables based on Angular detection
 * @returns {boolean} Whether Angular is installed
 */
export function checkAngularInstalled() {
  // Skip if already checked
  if (getGlobalState(GLOBAL_STATE_KEYS.ANGULAR_CHECKED, false)) {
    return;
  }

  const appDir = getMeteorAppDir();
  // Check if @nx/angular-rspack is a dependency in the project
  const isAngularInstalled = checkNpmDependencyExists('@nx/angular-rspack', { cwd: appDir });

  if (isAngularInstalled) {
    // Set environment variable to indicate Angular is enabled
    process.env.METEOR_ANGULAR_ENABLED = 'true';
  } else {
    process.env.METEOR_ANGULAR_ENABLED = 'false';
  }

  // Mark as checked
  setGlobalState(GLOBAL_STATE_KEYS.ANGULAR_CHECKED, true);

  return isAngularInstalled;
}
