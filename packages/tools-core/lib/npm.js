const fs = require('fs');
const path = require('path');
const { spawnProcess } = require('./process');

/**
 * Gets the path to a Node.js binary using Plugin.getCurrentNodeBinDir() if available,
 * otherwise returns null.
 * 
 * @param {string} binaryName - The name of the binary (e.g., 'npm', 'npx', 'node')
 * @returns {string|null} The path to the specified binary, or null if not available
 */
export function getNodeBinaryPath(binaryName) {
  try {
    // Try to access Plugin.getCurrentNodeBinDir()
    if (typeof Plugin !== 'undefined' && 
        typeof Plugin.getCurrentNodeBinDir === 'function' && 
        Plugin.getCurrentNodeBinDir()) {
      return path.join(Plugin.getCurrentNodeBinDir(), binaryName);
    }

    // If we're in a context where we can directly access the function
    if (typeof getCurrentNodeBinDir === 'function') {
      return path.join(getCurrentNodeBinDir(), binaryName);
    }

    return null;
  } catch (e) {
    // If any error occurs, return null
    return null;
  }
}

/**
 * Checks if a npm dependency exists in the project.
 * First checks optimistically in node_modules folder, then checks package.json.
 * 
 * @param {string} dependency - The npm dependency name to check
 * @param {Object} [options] - Options for the check
 * @param {string} [options.cwd] - Current working directory (defaults to process.cwd())
 * @param {boolean} [options.checkNodeModules] - Whether to check in node_modules first (defaults to false)
 * @returns {boolean} True if the dependency exists, false otherwise
 */
export function checkNpmDependencyExists(dependency, options = {}) {
  const cwd = options.cwd || process.cwd();

  // First, optimistically check if the dependency exists in node_modules
  if (options.checkNodeModules) {
    const nodeModulesPath = path.join(cwd, 'node_modules', dependency);
    try {
      if (fs.existsSync(nodeModulesPath)) {
        // Check if it has a package.json to confirm it's a valid package
        const packageJsonPath = path.join(nodeModulesPath, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
          return true;
        }
      }
    } catch (error) {
      // If there's an error checking the file system, continue to the fallback method
    }
  }

  // Fallback: Check package.json directly instead of using `npm ls`
  try {
    const packageJsonPath = path.join(cwd, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      // Check if the dependency is listed in any of the dependency sections
      return !!(
        (packageJson.dependencies && packageJson.dependencies[dependency]) ||
        (packageJson.devDependencies && packageJson.devDependencies[dependency]) ||
        (packageJson.optionalDependencies && packageJson.optionalDependencies[dependency]) ||
        (packageJson.peerDependencies && packageJson.peerDependencies[dependency])
      );
    }
  } catch (error) {
    // If there's an error reading or parsing package.json, return false
    return false;
  }

  // If we've reached this point, the dependency was not found
  return false;
}

/**
 * Checks if a npm binary exists in the project.
 * Looks for the binary in the node_modules/.bin directory.
 * 
 * @param {string} binary - The npm binary name to check
 * @param {Object} [options] - Options for the check
 * @param {string} [options.cwd] - Current working directory (defaults to process.cwd())
 * @returns {boolean} True if the binary exists, false otherwise
 */
export function checkNpmBinaryExists(binary, options = {}) {
  const cwd = options.cwd || process.cwd();
  const binaryPath = path.join(cwd, 'node_modules', '.bin', binary);

  try {
    // Check if the binary file exists and is executable
    const stats = fs.statSync(binaryPath);
    return stats.isFile() && (stats.mode & 0o111); // Check if executable bit is set
  } catch (error) {
    return false;
  }
}

/**
 * Builds npm install arguments based on options and dependencies
 * 
 * @param {string|string[]} dependencies - The npm dependency or dependencies to install
 * @param {Object} [options] - Options for the installation
 * @param {boolean} [options.dev=false] - If true, install as a dev dependency
 * @param {boolean} [options.exact=false] - If true, install with exact version
 * @param {boolean} [options.isMeteorCommand=false] - If true, prepends 'npm' to the args for meteor command
 * @returns {string[]} Array of arguments for the npm install command
 */
function buildNpmInstallArgs(dependencies, options = {}) {
  const args = options.isMeteorCommand ? ['npm', 'install'] : ['install'];

  // Add flags based on options
  if (options.dev) {
    args.push('--save-dev');
  }

  if (options.exact) {
    args.push('--save-exact');
  }

  // Add dependencies to the command
  if (Array.isArray(dependencies)) {
    args.push(...dependencies);
  } else {
    args.push(dependencies);
  }

  return args;
}

/**
 * Builds yarn install arguments based on options and dependencies
 * 
 * @param {string|string[]} dependencies - The npm dependency or dependencies to install
 * @param {Object} [options] - Options for the installation
 * @param {boolean} [options.dev=false] - If true, install as a dev dependency
 * @param {boolean} [options.exact=false] - If true, install with exact version
 * @returns {string[]} Array of arguments for the yarn add command
 */
function buildYarnInstallArgs(dependencies, options = {}) {
  const args = ['add'];

  // Add flags based on options
  if (options.dev) {
    args.push('--dev');
  }

  if (options.exact) {
    args.push('--exact');
  }

  // Add dependencies to the command
  if (Array.isArray(dependencies)) {
    args.push(...dependencies);
  } else {
    args.push(dependencies);
  }

  return args;
}

/**
 * Executes a command and returns a promise that resolves to true if successful
 * 
 * @param {string} command - The command to execute
 * @param {string[]} args - The arguments for the command
 * @param {Object} options - Options for the spawn process
 * @param {string} options.cwd - Current working directory
 * @returns {Promise<boolean>} A promise that resolves to true if command succeeded, false otherwise
 */
function executeCommand(command, args, options) {
  return new Promise((resolve) => {
    spawnProcess(command, args, {
      cwd: options.cwd,
      onExit: (code) => {
        resolve(code === 0);
      },
      onError: () => {
        resolve(false);
      }
    });
  });
}

/**
 * Installs a npm dependency using direct npm binary if available, otherwise falls back to `meteor npm install`.
 * If yarn option is true, uses yarn instead.
 * 
 * @param {string|string[]} dependencies - The npm dependency or dependencies to install
 * @param {Object} [options] - Options for the installation
 * @param {string} [options.cwd] - Current working directory (defaults to process.cwd())
 * @param {boolean} [options.dev=false] - If true, install as a dev dependency
 * @param {boolean} [options.exact=false] - If true, install with exact version
 * @param {boolean} [options.yarn=false] - If true, use yarn instead of npm
 * @returns {Promise<boolean>} A promise that resolves to true if installation succeeded, false otherwise
 */
export function installNpmDependency(dependencies, options = {}) {
  const cwd = options.cwd || process.cwd();

  // If yarn option is true, use yarn
  if (options.yarn) {
    const { command, args: baseArgs } = getYarnCommand([]);
    const args = buildYarnInstallArgs(dependencies, options);
    return executeCommand(command, [...baseArgs, ...args], { cwd });
  }

  // Try to get the npm binary path
  const npmBinaryPath = getNodeBinaryPath('npm');

  // If we have a direct path to npm, use it
  if (npmBinaryPath && fs.existsSync(npmBinaryPath)) {
    const args = buildNpmInstallArgs(dependencies, options);
    return executeCommand(npmBinaryPath, args, { cwd });
  }

  // Fall back to the current method using 'meteor npm install'
  const args = buildNpmInstallArgs(dependencies, { ...options, isMeteorCommand: true });
  return executeCommand('meteor', args, { cwd });
}


/**
 * Checks if a specific npm dependency version meets a semver condition.
 * First checks in node_modules if checkNodeModules is true, then checks project's package.json.
 * 
 * @param {string} dependency - The npm dependency name to check
 * @param {Object} [options] - Options for the check
 * @param {string} [options.cwd] - Current working directory (defaults to process.cwd())
 * @param {string} [options.versionRequirement] - The version requirement to check against (e.g., '6.0.0')
 * @param {string} [options.semverCondition='gte'] - The semver condition to use (e.g., 'gte', 'lt', 'eq')
 * @param {boolean} [options.checkNodeModules] - Whether to check in node_modules first (defaults to false)
 * @param {boolean} [options.existenceOnly] - If true, only checks if the dependency exists without version validation
 * @returns {boolean} True if the dependency version meets the condition (or exists if existenceOnly is true), false otherwise
 */
export function checkNpmDependencyVersion(dependency, options = {}) {
  const semver = require('semver');
  const cwd = options.cwd || process.cwd();
  const versionRequirement = options.versionRequirement;
  const semverCondition = options.semverCondition || 'gte';

  if (!dependency) {
    throw new Error('Dependency name must be specified');
  }

  // If existenceOnly is true, delegate to checkNpmDependencyExists
  if (options.existenceOnly) {
    return checkNpmDependencyExists(dependency, {
      cwd,
      checkNodeModules: options.checkNodeModules
    });
  }

  if (!versionRequirement) {
    throw new Error('Version requirement must be specified');
  }

  if (!semver[semverCondition]) {
    throw new Error(`Invalid semver condition: ${semverCondition}`);
  }

  // First, check in node_modules if the option is enabled
  if (options.checkNodeModules) {
    const nodeModulesPath = path.join(cwd, 'node_modules', dependency, 'package.json');
    try {
      if (fs.existsSync(nodeModulesPath)) {
        const packageJson = JSON.parse(fs.readFileSync(nodeModulesPath, 'utf8'));
        if (packageJson.version) {
          return semver[semverCondition](packageJson.version, versionRequirement);
        }
      }
    } catch (error) {
      // If there's an error reading the package.json, continue to the fallback method
    }
  }

  // Fallback: Check project's package.json directly
  try {
    const packageJsonPath = path.join(cwd, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      // Check all dependency sections for the package and its version
      const sections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

      for (const section of sections) {
        if (packageJson[section] && packageJson[section][dependency]) {
          const versionString = packageJson[section][dependency];
          // Extract the version number from the version string (removing ^ or ~ if present)
          const version = versionString.replace(/^[\^~]/, '');
          return semver[semverCondition](version, versionRequirement);
        }
      }
    }
  } catch (error) {
    // If there's an error reading or parsing package.json, return false
    return false;
  }

  // If we've reached this point, the dependency version couldn't be determined
  return false;
}

/**
 * Gets the npm command and arguments
 * @param {string[]} args - The arguments to pass to npm
 * @returns {Object} An object with command, args, and base properties
 */
export function getNpmCommand(args) {
  // Try to get the npm binary path
  const npmBinaryPath = getNodeBinaryPath('npm');

  // If we have a direct path to npm, use it
  if (npmBinaryPath && fs.existsSync(npmBinaryPath)) {
    return {
      command: npmBinaryPath,
      args: args,
      prefix: `${npmBinaryPath}`,
    };
  }

  // Fall back to the current method using 'meteor npm'
  return {
    command: 'meteor',
    args: ['npm', ...args],
    prefix: `meteor npm`,
  };
}

/**
 * Gets the npx command and arguments
 * @param {string[]} args - The arguments to pass to npx
 * @returns {Object} An object with command, args, and base properties
 */
export function getNpxCommand(args) {
  // Try to get the npx binary path
  const npxBinaryPath = getNodeBinaryPath('npx');

  // If we have a direct path to npx, use it
  if (npxBinaryPath && fs.existsSync(npxBinaryPath)) {
    return {
      command: npxBinaryPath,
      args: args,
      prefix: `${npxBinaryPath}`,
    };
  }

  // Fall back to the current method using 'meteor npx'
  return {
    command: 'meteor',
    args: ['npx', ...args],
    prefix: `meteor npx`,
  };
}

/**
 * Checks if the current project is a Yarn project.
 * Looks for yarn.lock file in the current working directory and checks packageManager in package.json.
 * 
 * @param {Object} [options] - Options for the check
 * @param {string} [options.cwd] - Current working directory (defaults to process.cwd())
 * @returns {boolean} True if it's a Yarn project, false otherwise
 */
export function isYarnProject(options = {}) {
  const cwd = options.cwd || process.cwd();

  // Check if yarn.lock exists
  const yarnLockPath = path.join(cwd, 'yarn.lock');
  if (fs.existsSync(yarnLockPath)) {
    return true;
  }

  // Check packageManager field in package.json
  try {
    const packageJsonPath = path.join(cwd, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      // Check if packageManager contains "yarn"
      if (packageJson.packageManager && packageJson.packageManager.includes('yarn')) {
        return true;
      }
    }
  } catch (error) {
    // If there's an error reading or parsing package.json, continue
  }

  return false;
}

/**
 * Gets the yarn command and arguments
 * @param {string[]} args - The arguments to pass to yarn
 * @returns {Object} An object with command, args, and base properties
 */
export function getYarnCommand(args) {
  // Try to get the yarn binary path
  const yarnBinaryPath = getNodeBinaryPath('yarn');

  // If we have a direct path to yarn, use it
  if (yarnBinaryPath && fs.existsSync(yarnBinaryPath)) {
    return {
      command: yarnBinaryPath,
      args,
      prefix: `${yarnBinaryPath}`,
    };
  }

  // Fall back to using 'yarn' directly
  return {
    command: 'yarn',
    args,
    prefix: `yarn`,
  };
}

/**
 * Gets the path to the monorepo root by checking for common monorepo indicators.
 * Traverses up the directory tree until it finds a monorepo indicator or reaches the root.
 * 
 * @param {Object} [options] - Options for the detection
 * @param {string} [options.cwd] - Current working directory (defaults to process.cwd())
 * @returns {string|null} Path to the monorepo root if found, null otherwise
 */
export function getMonorepoPath(options = {}) {
  const cwd = options.cwd || process.cwd();
  let currentDir = cwd;

  // Function to check if directory has monorepo indicators
  const hasMonorepoIndicators = (dir) => {
    try {
      // Check for npm/yarn workspaces in package.json
      const packageJsonPath = path.join(dir, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        if (packageJson.workspaces) {
          return true;
        }
      }

      // Check for Lerna
      const lernaJsonPath = path.join(dir, 'lerna.json');
      if (fs.existsSync(lernaJsonPath)) {
        return true;
      }

      // Check for pnpm workspaces
      const pnpmWorkspacePath = path.join(dir, 'pnpm-workspace.yaml');
      if (fs.existsSync(pnpmWorkspacePath)) {
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  };

  // Traverse up the directory tree
  while (currentDir !== path.dirname(currentDir)) { // Stop when we reach the root directory
    if (hasMonorepoIndicators(currentDir)) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }

  // Check the root directory as well
  return hasMonorepoIndicators(currentDir) ? currentDir : null;
}

/**
 * Detects if a directory is within a monorepo by checking for common monorepo indicators.
 *
 * @param {Object} [options] - Options for the detection
 * @param {string} [options.cwd] - Current working directory (defaults to process.cwd())
 * @returns {boolean} True if the directory is within a monorepo, false otherwise
 */
export function isMonorepo(options = {}) {
  return getMonorepoPath(options) !== null;
}
