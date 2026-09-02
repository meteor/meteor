/**
 * @module dependencies
 * @description Functions for managing dependencies for Rspack plugin
 */
import {
  DEFAULT_METEOR_RSPACK_REACT_REFRESH_VERSION,
  DEFAULT_METEOR_RSPACK_SWC_HELPERS_VERSION,
  DEFAULT_METEOR_RSPACK_SWC_CORE_VERSION,
  DEFAULT_RSDOCTOR_RSPACK_PLUGIN_VERSION
} from "./constants";

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
  isMeteorAppUpdate,
  getMeteorAppDir,
} = require('meteor/tools-core/lib/meteor');
const {
  checkNpmDependencyExists,
  installNpmDependency,
  checkNpmDependencyVersion,
  getMonorepoPath,
  isYarnProject,
} = require('meteor/tools-core/lib/npm');
const {
  joinWithAnd,
} = require('meteor/tools-core/lib/string');

const {
  DEFAULT_RSPACK_VERSION,
  DEFAULT_RSPACK_DEV_SERVER_VERSION,
  DEFAULT_METEOR_RSPACK_VERSION,
  DEFAULT_METEOR_RSPACK_REACT_HMR_VERSION,
  GLOBAL_STATE_KEYS,
} = require('./constants');

function readPackageJson(directory) {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(directory, 'package.json'), 'utf8')
    );
  } catch (error) {
    return {};
  }
}

function getPackageManagerFromManifest(packageJson) {
  if (typeof packageJson.packageManager !== 'string') {
    return null;
  }

  const packageManager = packageJson.packageManager.split('@')[0];
  return /^[a-z0-9_-]+$/i.test(packageManager) ? packageManager : null;
}

/**
 * Detects the package manager and workspace containing a Meteor app.
 * The workspace root takes precedence because it owns the shared lockfile.
 *
 * @param {string} appDir - Absolute path to the Meteor app
 * @returns {{appDir: string, isMonorepo: boolean, packageManager: string, workspaceRoot: string}}
 */
export function getDependencyInstallContext(appDir) {
  const resolvedAppDir = path.resolve(appDir);
  const detectedWorkspaceRoot = getMonorepoPath({ cwd: resolvedAppDir });
  const workspaceRoot = detectedWorkspaceRoot || resolvedAppDir;
  const workspacePackageJson = readPackageJson(workspaceRoot);
  const appPackageJson = workspaceRoot === resolvedAppDir
    ? workspacePackageJson
    : readPackageJson(resolvedAppDir);

  let packageManager = getPackageManagerFromManifest(workspacePackageJson);

  if (!packageManager) {
    const packageManagerLockfiles = [
      ['pnpm', 'pnpm-workspace.yaml'],
      ['pnpm', 'pnpm-lock.yaml'],
      ['yarn', 'yarn.lock'],
      ['npm', 'package-lock.json'],
      ['npm', 'npm-shrinkwrap.json'],
    ];

    packageManager = packageManagerLockfiles.find(([, lockfile]) =>
      fs.existsSync(path.join(workspaceRoot, lockfile))
    )?.[0];
  }

  if (!packageManager && workspaceRoot !== resolvedAppDir) {
    packageManager = getPackageManagerFromManifest(appPackageJson);
  }

  if (!packageManager) {
    packageManager = process.env.YARN_ENABLED === 'true' ||
      isYarnProject({ cwd: resolvedAppDir })
      ? 'yarn'
      : 'npm';
  }

  return {
    appDir: resolvedAppDir,
    isMonorepo: detectedWorkspaceRoot !== null,
    packageManager,
    workspaceRoot,
  };
}

/**
 * Creates package-manager-specific commands without changing the workspace.
 * Commands are intended to be run from the Meteor app directory so workspace
 * managers update the app manifest and the workspace lockfile correctly.
 *
 * @param {Object[]} dependencies - Dependencies with name, version, and dev fields
 * @param {string} packageManager - npm, yarn, or pnpm
 * @returns {{dev: string|null, regular: string|null}}
 */
export function formatDependencyInstallCommands(dependencies, packageManager) {
  const devDependencies = dependencies
    .filter(dep => dep.dev === true || dep.dev == null)
    .map(dep => `${dep.name}@${dep.version}`);
  const regularDependencies = dependencies
    .filter(dep => dep.dev === false)
    .map(dep => `${dep.name}@${dep.version}`);

  const commands = {
    dev: null,
    regular: null,
  };

  if (devDependencies.length > 0) {
    const dependencyList = devDependencies.join(' ');
    commands.dev = {
      yarn: `yarn add --dev ${dependencyList}`,
      pnpm: `pnpm add --save-dev ${dependencyList}`,
      npm: `meteor npm install --save-dev ${dependencyList}`,
    }[packageManager] || null;
  }

  if (regularDependencies.length > 0) {
    const dependencyList = regularDependencies.join(' ');
    commands.regular = {
      yarn: `yarn add ${dependencyList}`,
      pnpm: `pnpm add ${dependencyList}`,
      npm: `meteor npm install ${dependencyList}`,
    }[packageManager] || null;
  }

  return commands;
}

function getDeclaredDependencyVersion(packageJson, dependencyName) {
  const sections = [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ];

  for (const section of sections) {
    if (packageJson[section]?.[dependencyName]) {
      return packageJson[section][dependencyName];
    }
  }

  return null;
}

function shouldCheckInstalledDependencyVersion(packageJson, dependencyName) {
  const declaredVersion = getDeclaredDependencyVersion(
    packageJson,
    dependencyName
  );

  return typeof declaredVersion === 'string' &&
    /^(file|link|portal|workspace):/.test(declaredVersion);
}

function logManualDependencyInstructions({
  appDir,
  dependencies,
  packageManager,
  packageName,
  reason,
  workspaceRoot,
  isMonorepo,
}) {
  const appPackageJson = readPackageJson(appDir);
  const commands = formatDependencyInstallCommands(
    dependencies,
    packageManager
  );

  logInfo(`=> ⚠️  ${packageName} dependencies need attention`);
  logInfo(`   ${reason}`);
  logInfo(`   Package manager: ${packageManager}`);

  if (isMonorepo) {
    const relativeAppDir = path.relative(workspaceRoot, appDir) || '.';
    logInfo(`   Workspace root: ${workspaceRoot}`);
    logInfo(`   Meteor app: ${relativeAppDir}`);
  }

  logInfo('   Missing or incompatible dependencies:');
  dependencies.forEach(dep => {
    const declaredVersion = getDeclaredDependencyVersion(
      appPackageJson,
      dep.name
    );
    const currentVersion = declaredVersion || 'missing';
    const conditionLabels = {
      eq: '=',
      gt: '>',
      gte: '>=',
      lt: '<',
      lte: '<=',
    };
    const condition = dep.semverCondition || 'gte';
    const requirement = dep.existenceOnly
      ? 'must be declared'
      : `requires ${conditionLabels[condition] || condition} ${dep.version}`;
    logInfo(`   • ${dep.name}: ${currentVersion} (${requirement})`);
  });

  if (commands.dev || commands.regular) {
    logInfo(`   From the Meteor app directory (${appDir}), run:`);
    if (commands.dev) {
      logInfo(`     ${commands.dev}`);
    }
    if (commands.regular) {
      logInfo(`     ${commands.regular}`);
    }
  } else {
    logInfo(
      `   Install them with ${packageManager} from the Meteor app directory: ${appDir}`
    );
  }
}

/**
 * Generic function to ensure dependencies are installed with correct versions
 * @param {Object[]} dependencies - Array of dependency objects with name, version, and semverCondition
 * @param {string} globalStateKey - Global state key to track if check has been done
 * @param {string} packageName - Name of the package for logging purposes
 * @param {Object} [options] - Dependency handling options
 * @param {boolean} [options.autoInstall=true] - Whether supported managers may install dependencies
 * @returns {Promise<void>} A promise that resolves when the check/installation is complete
 * @throws {Error} If installation fails
 */
async function ensureDependenciesInstalled(
  dependencies,
  globalStateKey,
  packageName,
  options = {}
) {
  // Skip if already checked
  if (getGlobalState(globalStateKey, false)) {
    return;
  }

  const appDir = getMeteorAppDir();
  const autoInstall = options.autoInstall !== false;
  const appPackageJson = readPackageJson(appDir);

  // Filter dependencies that need to be installed (missing or wrong version)
  const allDepsToInstall = dependencies.filter(dep =>
    !checkNpmDependencyExists(dep.name, { cwd: appDir }) ||
    !checkNpmDependencyVersion(dep.name, {
      cwd: appDir,
      versionRequirement: dep.version,
      semverCondition: dep.semverCondition || 'gte',
      existenceOnly: dep.existenceOnly,
      checkNodeModules: shouldCheckInstalledDependencyVersion(
        appPackageJson,
        dep.name
      ),
    })
  );

  if (allDepsToInstall.length > 0) {
    const installContext = getDependencyInstallContext(appDir);
    const dependencyStrings = allDepsToInstall.map(
      dep => `${dep.name}@${dep.version}`
    );
    const canAutoInstall = ['npm', 'yarn', 'pnpm'].includes(
      installContext.packageManager
    );

    if (!autoInstall || !canAutoInstall) {
      const reason = !autoInstall
        ? 'Automatic dependency installation is disabled by meteor.autoInstallDeps=false.'
        : `Automatic dependency installation does not support ${installContext.packageManager} yet; no package files were changed.`;

      logManualDependencyInstructions({
        ...installContext,
        dependencies: allDepsToInstall,
        packageName,
        reason,
      });
      setGlobalState(globalStateKey, true);
      return;
    }

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

    const isYarnProj = installContext.packageManager === 'yarn';

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
        packageManager: installContext.packageManager,
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
        packageManager: installContext.packageManager,
      });
    }

    const success = devDepsSuccess && regularDepsSuccess;

    if (!success) {
      logError(`=> ❌ Failed to install ${packageName}`);
      logManualDependencyInstructions({
        ...installContext,
        dependencies: allDepsToInstall,
        packageName,
        reason: `Automatic installation with ${installContext.packageManager} failed.`,
      });

      const allFailedDeps = [];
      if (!devDepsSuccess) allFailedDeps.push('dev dependencies');
      if (!regularDepsSuccess) allFailedDeps.push('regular dependencies');

      const commandWord = allFailedDeps.length === 1 ? 'command' : 'commands';

      throw new Error(
        `Failed to install ${packageName} ${joinWithAnd(allFailedDeps)}. Please install them manually with the ${commandWord} above.`
      );
    }

    logSuccess(`=> ✅ Installed ${packageName} dependencies`);

    if (isMeteorAppUpdate()) {
      const installCommand = {
        npm: 'npm install',
        pnpm: 'pnpm install',
        yarn: 'yarn install',
      }[installContext.packageManager];

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
export async function ensureRspackInstalled(options = {}) {
  const dependencies = [
    { name: '@rspack/cli', version: DEFAULT_RSPACK_VERSION, semverCondition: 'gte', dev: true },
    { name: '@rspack/core', version: DEFAULT_RSPACK_VERSION, semverCondition: 'gte', dev: true },
    { name: '@rspack/dev-server', version: DEFAULT_RSPACK_DEV_SERVER_VERSION, semverCondition: 'gte', dev: true },
    { name: '@meteorjs/rspack', version: DEFAULT_METEOR_RSPACK_VERSION, semverCondition: 'gte', dev: true },
    { name: '@swc/core', version: DEFAULT_METEOR_RSPACK_SWC_CORE_VERSION, semverCondition: 'gte', dev: true },
    { name: '@swc/helpers', version: DEFAULT_METEOR_RSPACK_SWC_HELPERS_VERSION, semverCondition: 'gte', dev: false },
    { name: '@rsdoctor/rspack-plugin', version: DEFAULT_RSDOCTOR_RSPACK_PLUGIN_VERSION, semverCondition: 'gte', dev: true },
  ];

  await ensureDependenciesInstalled(
    dependencies,
    GLOBAL_STATE_KEYS.RSPACK_INSTALLATION_CHECKED,
    'Rspack',
    options,
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
  const isReactInstalled = checkNpmDependencyExists('react', { cwd: appDir }) && !checkNpmDependencyExists('preact', { cwd: appDir });

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

export async function ensureRspackReactInstalled(options = {}) {
  const dependencies = [
    { name: '@rspack/plugin-react-refresh', version: DEFAULT_METEOR_RSPACK_REACT_HMR_VERSION, semverCondition: 'gte', dev: true },
    { name: 'react-refresh', version: DEFAULT_METEOR_RSPACK_REACT_REFRESH_VERSION, semverCondition: 'gte', dev: true },
  ];

  await ensureDependenciesInstalled(
    dependencies,
    GLOBAL_STATE_KEYS.RSPACK_REACT_INSTALLATION_CHECKED,
    'Rspack React',
    options,
  );
}

/**
 * Checks if Rspack Doctor is installed, and installs it if not
 * @returns {Promise<void>} A promise that resolves when the check/installation is complete
 * @throws {Error} If Rspack Doctor installation fails
 */
export async function ensureRspackDoctorInstalled(options = {}) {
  const dependencies = [
    { name: '@rsdoctor/rspack-plugin', version: DEFAULT_RSDOCTOR_RSPACK_PLUGIN_VERSION, semverCondition: 'gte', dev: true },
  ];

  await ensureDependenciesInstalled(
    dependencies,
    GLOBAL_STATE_KEYS.RSPACK_DOCTOR_INSTALLATION_CHECKED,
    'Rspack Doctor',
    options,
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
