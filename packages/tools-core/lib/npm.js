const fs = require('fs');
const path = require('path');
const { spawnProcess } = require('./process');
const { logError, logInfo } = require('./log');

/**
 * Gets the candidate executable names for a Node.js tool on the current
 * platform.
 *
 * Windows commonly exposes npm-family tools via .cmd launchers, while other
 * platforms use the bare binary name.
 *
 * @param {string} binaryName - The tool name (for example, 'npm' or 'npx')
 * @param {string} [platform=process.platform] - Platform to resolve for
 * @returns {string[]} Candidate executable names in lookup priority order
 */
export function getNodeBinaryCandidates(binaryName, platform = process.platform) {
  return platform === 'win32'
    ? [`${binaryName}.cmd`, `${binaryName}.exe`, binaryName]
    : [binaryName];
}

/**
 * Gets the dev_bundle bin directory from a Meteor checkout installation on
 * Windows.
 *
 * @param {string} [meteorInstallation=process.env.METEOR_INSTALLATION] - Meteor installation root
 * @param {string} [platform=process.platform] - Platform to resolve for
 * @returns {string|null} The dev_bundle bin directory, or null if unavailable
 */
export function getMeteorInstallationBinDir(
  meteorInstallation = process.env.METEOR_INSTALLATION,
  platform = process.platform,
) {
  if (platform !== 'win32' || typeof meteorInstallation !== 'string' || !meteorInstallation) {
    return null;
  }

  const binDir = path.join(meteorInstallation, 'dev_bundle', 'bin');
  return fs.existsSync(binDir) ? binDir : null;
}

/**
 * Gets the Meteor command path for fallback npm/npx execution.
 *
 * On Windows checkouts, Meteor is launched via meteor.bat rather than a bare
 * 'meteor' command name.
 *
 * @param {string} [meteorInstallation=process.env.METEOR_INSTALLATION] - Meteor installation root
 * @param {string} [platform=process.platform] - Platform to resolve for
 * @returns {string} The Meteor command path or command name
 */
export function getMeteorCommandPath(
  meteorInstallation = process.env.METEOR_INSTALLATION,
  platform = process.platform,
) {
  if (platform === 'win32') {
    if (typeof meteorInstallation === 'string' && meteorInstallation) {
      const meteorCommandPath = path.join(meteorInstallation, 'meteor.bat');
      if (fs.existsSync(meteorCommandPath)) {
        return meteorCommandPath;
      }
    }
    
    // Precheck if meteor.bat exists in PATH
    const pathEnv = process.env.PATH || process.env.Path || '';
    const pathDirs = pathEnv.split(path.delimiter);
    for (const dir of pathDirs) {
      if (dir && fs.existsSync(path.join(dir, 'meteor.bat'))) {
        return 'meteor.bat';
      }
    }
  }

  return 'meteor';
}

/**
 * Returns the Meteor dev_bundle bin directory path if available, otherwise null.
 *
 * @returns {string|null} The path to the dev_bundle bin directory, or null if not available
 */
function resolveNodeBinDir() {
  try {
    if (typeof Plugin !== 'undefined' &&
        typeof Plugin.getCurrentNodeBinDir === 'function' &&
        Plugin.getCurrentNodeBinDir()) {
      return Plugin.getCurrentNodeBinDir();
    }

    if (typeof getCurrentNodeBinDir === 'function') {
      return getCurrentNodeBinDir();
    }
  } catch (e) {
    // fall through
  }

  const meteorInstallationBinDir = getMeteorInstallationBinDir();
  if (meteorInstallationBinDir) {
    return meteorInstallationBinDir;
  }

  return null;
}

/**
 * Returns environment variables that ensure child processes can find
 * Meteor's bundled Node.js (and npm/npx) on their PATH.
 *
 * When the dev_bundle bin directory is available, it is prepended to PATH
 * so that `#!/usr/bin/env node` shebangs in spawned scripts resolve to
 * Meteor's Node rather than requiring a separate global install.
 *
 * Returns an empty object when the bin directory cannot be determined,
 * leaving the caller's environment unchanged.
 *
 * @returns {Object} An object with a PATH key, or empty object
 */
export function getNodeBinEnv() {
  const binDir = resolveNodeBinDir();
  if (!binDir) {
    return {};
  }
  const currentPath = process.env.PATH || process.env.Path || '';
  return {
    PATH: binDir + path.delimiter + currentPath,
  };
}

/**
 * Gets the path to a Node.js binary using Plugin.getCurrentNodeBinDir() if available,
 * otherwise returns null.
 *
 * @param {string} binaryName - The name of the binary (e.g., 'npm', 'npx', 'node')
 * @returns {string|null} The path to the specified binary, or null if not available
 */
export function getNodeBinaryPath(binaryName) {
  const binDir = resolveNodeBinDir();
  if (binDir) {
    const candidates = getNodeBinaryCandidates(binaryName);

    for (const candidate of candidates) {
      const binaryPath = path.join(binDir, candidate);
      if (fs.existsSync(binaryPath)) {
        return binaryPath;
      }
    }
  }
  return null;
}

/**
 * Finds a Node.js command on PATH without spawning it.
 *
 * @param {string} binaryName - The command name to find
 * @returns {string|null} Absolute command path, or null when unavailable
 */
function getNodeBinaryPathFromEnv(binaryName) {
  const pathEnv = process.env.PATH || process.env.Path || '';

  for (const directory of pathEnv.split(path.delimiter)) {
    if (!directory) continue;

    const normalizedDirectory = directory.replace(/^"|"$/g, '');
    for (const candidate of getNodeBinaryCandidates(binaryName)) {
      const binaryPath = path.join(normalizedDirectory, candidate);
      if (fs.existsSync(binaryPath)) {
        return binaryPath;
      }
    }
  }

  return null;
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
 * Builds pnpm add arguments.
 *
 * @param {string|string[]} dependencies - Dependencies to install
 * @param {Object} [options] - Installation options
 * @param {boolean} [options.dev=false] - Save as development dependencies
 * @param {boolean} [options.exact=false] - Save exact versions
 * @returns {string[]} Array of arguments for pnpm
 */
function buildPnpmInstallArgs(dependencies, options = {}) {
  const args = ['add'];

  if (options.dev) {
    args.push('--save-dev');
  }

  if (options.exact) {
    args.push('--save-exact');
  }

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
 * @param {boolean} [options.logFailure=true] - Whether to log command failure details
 * @returns {Promise<boolean>} A promise that resolves to true if command succeeded, false otherwise
 */
function executeCommand(command, args, options) {
  return new Promise((resolve) => {
    let stdoutBuf = '';
    let stderrBuf = '';

    const formatCommand = () => `${command} ${args.join(' ')}`.trim();
    const tail = (str, max = 4000) =>
      str.length > max ? `…(truncated)\n${str.slice(-max)}` : str;

    let settled = false;

    spawnProcess(command, args, {
      cwd: options.cwd,
      onStdout: (chunk) => {
        stdoutBuf = tail(stdoutBuf + chunk);
        if (options.onStdout) options.onStdout(chunk);
      },
      onStderr: (chunk) => {
        stderrBuf = tail(stderrBuf + chunk);
        if (options.onStderr) options.onStderr(chunk);
      },
      onExit: (code, signal) => {
        if (settled) return;
        settled = true;
        if (code === 0) {
          resolve(true);
          return;
        }
        if (options.logFailure !== false) {
          logError(`=> Command failed: ${formatCommand()}`);
          logError(`   cwd: ${options.cwd || process.cwd()}`);
          logError(`   exit code: ${code}${signal ? ` (signal: ${signal})` : ''}`);
          if (stderrBuf.trim()) logError(`   stderr:\n${tail(stderrBuf)}`);
          if (stdoutBuf.trim()) logError(`   stdout:\n${tail(stdoutBuf)}`);
        }
        resolve(false);
      },
      onError: (err) => {
        if (settled) return;
        settled = true;
        if (options.logFailure !== false) {
          logError(`=> Command could not be spawned: ${formatCommand()}`);
          logError(`   ${err && err.message ? err.message : String(err)}`);
        }
        resolve(false);
      }
    });
  });
}

async function installPnpmDependency(dependencies, options, cwd) {
  const candidates = getPnpmCommandCandidates([]);
  if (candidates.length === 0) {
    logError('=> pnpm auto-install is unavailable: neither pnpm nor Corepack was found.');
    return false;
  }

  const installArgs = buildPnpmInstallArgs(dependencies, options);
  for (let index = 0; index < candidates.length; index += 1) {
    const { command, args: baseArgs } = candidates[index];
    const isLastCandidate = index === candidates.length - 1;
    const success = await executeCommand(
      command,
      [...baseArgs, ...installArgs],
      { cwd, logFailure: isLastCandidate }
    );

    if (success) {
      return true;
    }

    if (!isLastCandidate) {
      logInfo('=> Direct pnpm command failed; retrying with Corepack...');
    }
  }

  return false;
}

async function installYarnDependency(dependencies, options, cwd) {
  const candidates = getYarnCommandCandidates([]);
  const installArgs = buildYarnInstallArgs(dependencies, options);

  for (let index = 0; index < candidates.length; index += 1) {
    const { command, args: baseArgs } = candidates[index];
    const isLastCandidate = index === candidates.length - 1;
    const success = await executeCommand(
      command,
      [...baseArgs, ...installArgs],
      { cwd, logFailure: isLastCandidate }
    );

    if (success) {
      return true;
    }

    if (!isLastCandidate) {
      logInfo('=> Direct Yarn command failed; retrying with Corepack...');
    }
  }

  return false;
}

/**
 * Installs npm dependencies with npm, Yarn, or pnpm. npm uses Meteor's npm
 * fallback; Yarn and pnpm use a directly available binary or Corepack.
 * 
 * @param {string|string[]} dependencies - The npm dependency or dependencies to install
 * @param {Object} [options] - Options for the installation
 * @param {string} [options.cwd] - Current working directory (defaults to process.cwd())
 * @param {boolean} [options.dev=false] - If true, install as a dev dependency
 * @param {boolean} [options.exact=false] - If true, install with exact version
 * @param {boolean} [options.yarn=false] - If true, use yarn instead of npm
 * @param {'npm'|'yarn'|'pnpm'} [options.packageManager] - Explicit package manager
 * @returns {Promise<boolean>} A promise that resolves to true if installation succeeded, false otherwise
 */
export function installNpmDependency(dependencies, options = {}) {
  const cwd = options.cwd || process.cwd();
  const packageManager = options.packageManager ||
    (options.yarn ? 'yarn' : 'npm');

  if (packageManager === 'yarn') {
    return installYarnDependency(dependencies, options, cwd);
  }

  if (packageManager === 'pnpm') {
    return installPnpmDependency(dependencies, options, cwd);
  }

  if (packageManager !== 'npm') {
    logError(`=> Unsupported package manager for auto-install: ${packageManager}`);
    return Promise.resolve(false);
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
    command: getMeteorCommandPath(),
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
    command: getMeteorCommandPath(),
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
 * Gets the available Yarn command candidates in fallback order. Corepack
 * respects the workspace's packageManager version when invoked from the
 * Meteor app directory.
 *
 * @param {string[]} args - Arguments to pass to Yarn
 * @param {Object} [options] - Resolution overrides for tests
 * @param {Function} [options.resolveBinary] - Resolves a binary name to a path
 * @returns {{command: string, args: string[], prefix: string}[]}
 */
export function getYarnCommandCandidates(args, options = {}) {
  const resolveBinary = options.resolveBinary || (binaryName =>
    getNodeBinaryPath(binaryName) || getNodeBinaryPathFromEnv(binaryName)
  );
  const yarnBinaryPath = resolveBinary('yarn');
  const corepackBinaryPath = resolveBinary('corepack');
  const commands = [];

  if (yarnBinaryPath) {
    commands.push({
      command: yarnBinaryPath,
      args,
      prefix: yarnBinaryPath,
    });
  }

  if (corepackBinaryPath) {
    commands.push({
      command: corepackBinaryPath,
      args: ['yarn', ...args],
      prefix: `${corepackBinaryPath} yarn`,
    });
  }

  // Preserve the historical PATH-based attempt when neither command could be
  // resolved ahead of time. A spawn failure is surfaced as manual guidance.
  if (commands.length === 0) {
    commands.push({
      command: 'yarn',
      args,
      prefix: 'yarn',
    });
  }

  return commands;
}

/**
 * Gets the preferred Yarn command. See getYarnCommandCandidates for the
 * execution fallback order.
 *
 * @param {string[]} args - Arguments to pass to Yarn
 * @param {Object} [options] - Resolution overrides for tests
 * @returns {{command: string, args: string[], prefix: string}}
 */
export function getYarnCommand(args, options = {}) {
  return getYarnCommandCandidates(args, options)[0];
}

/**
 * Gets the available pnpm command candidates in fallback order. A direct pnpm
 * executable takes precedence; Corepack respects the workspace's packageManager
 * version when invoked from the Meteor app directory.
 *
 * @param {string[]} args - Arguments to pass to pnpm
 * @param {Object} [options] - Resolution overrides for tests
 * @param {Function} [options.resolveBinary] - Resolves a binary name to a path
 * @returns {{command: string, args: string[], prefix: string}[]}
 */
export function getPnpmCommandCandidates(args, options = {}) {
  const resolveBinary = options.resolveBinary || (binaryName =>
    getNodeBinaryPath(binaryName) || getNodeBinaryPathFromEnv(binaryName)
  );
  const pnpmBinaryPath = resolveBinary('pnpm');
  const corepackBinaryPath = resolveBinary('corepack');
  const commands = [];

  if (pnpmBinaryPath) {
    commands.push({
      command: pnpmBinaryPath,
      args,
      prefix: pnpmBinaryPath,
    });
  }

  if (corepackBinaryPath) {
    commands.push({
      command: corepackBinaryPath,
      args: ['pnpm', ...args],
      prefix: `${corepackBinaryPath} pnpm`,
    });
  }

  return commands;
}

/**
 * Gets the preferred pnpm command. See getPnpmCommandCandidates for the
 * execution fallback order.
 *
 * @param {string[]} args - Arguments to pass to pnpm
 * @param {Object} [options] - Resolution overrides for tests
 * @returns {{command: string, args: string[], prefix: string}|null}
 */
export function getPnpmCommand(args, options = {}) {
  return getPnpmCommandCandidates(args, options)[0] || null;
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
