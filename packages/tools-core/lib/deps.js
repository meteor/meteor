/**
 * @module deps
 * @description Generic engine for declaring required host-app npm dependencies
 * from a Meteor atmosphere package.
 *
 * Any package that depends on `tools-core` can use this module to:
 *   - Detect missing or below-minimum-version npm dependencies in the host app.
 *   - Auto-install them when `meteor.autoInstallDeps` is enabled (default).
 *   - Warn the user with a single ready-to-copy install command when
 *     `meteor.autoInstallDeps=false`.
 *
 * The engine is consumer-agnostic. All consumer-specific data (dep list, label,
 * docs link) is passed in via the public API. Consumers MUST NOT branch on
 * `meteor.autoInstallDeps` themselves: the engine owns that decision.
 */

const fs = require('fs');
const path = require('path');

const {
  logProgress,
  logSuccess,
  logInfo,
  logError,
  logWarn,
} = require('./log');
const {
  getGlobalState,
  setGlobalState,
} = require('./global-state');
const {
  getMeteorAppDir,
  hasMeteorAppConfigAutoInstallDeps,
  isMeteorAppUpdate,
} = require('./meteor');
const {
  checkNpmDependencyExists,
  checkNpmDependencyVersion,
  installNpmDependency,
  isYarnProject,
  getMonorepoPath,
} = require('./npm');
const {
  joinWithAnd,
} = require('./string');

const DEDUP_PREFIX = 'tools-core.deps.';

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

function readCurrentVersion(name, cwd) {
  try {
    const packageJsonPath = path.join(cwd, 'package.json');
    if (!fs.existsSync(packageJsonPath)) return null;
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const sections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
    for (const section of sections) {
      if (pkg[section] && pkg[section][name]) {
        return pkg[section][name].replace(/^[\^~>=<\s]+/, '').trim() || null;
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

/**
 * Detects which dependencies are missing or below the minimum supported version.
 *
 * @param {Array<{name: string, version: string, semverCondition?: string, dev: boolean, existenceOnly?: boolean}>} dependencies
 * @param {Object} [options]
 * @param {string} [options.cwd] - Defaults to the Meteor app directory.
 * @returns {Array<{name: string, status: 'ok'|'missing'|'outdated', requiredVersion: string, currentVersion: ?string, dev: boolean, existenceOnly: boolean}>}
 */
export function detectMissingOrOutdatedDeps(dependencies, options = {}) {
  const cwd = options.cwd || getMeteorAppDir();

  return dependencies.map((dep) => {
    if (typeof dep.dev !== 'boolean') {
      throw new Error(
        `Dependency descriptor for ${dep.name} must set dev to true or false`,
      );
    }

    const dev = dep.dev;
    const existenceOnly = !!dep.existenceOnly;
    const exists = checkNpmDependencyExists(dep.name, { cwd });

    if (!exists) {
      return {
        name: dep.name,
        status: 'missing',
        requiredVersion: dep.version,
        currentVersion: null,
        dev,
        existenceOnly,
      };
    }

    if (existenceOnly) {
      return {
        name: dep.name,
        status: 'ok',
        requiredVersion: dep.version,
        currentVersion: readCurrentVersion(dep.name, cwd),
        dev,
        existenceOnly,
      };
    }

    const ok = checkNpmDependencyVersion(dep.name, {
      cwd,
      versionRequirement: dep.version,
      semverCondition: dep.semverCondition || 'gte',
      // Local protocols describe a source location, not a semver range.
      checkNodeModules: /^(file|link|portal|workspace):/.test(
        readCurrentVersion(dep.name, cwd) || '',
      ),
    });

    return {
      name: dep.name,
      status: ok ? 'ok' : 'outdated',
      requiredVersion: dep.version,
      currentVersion: readCurrentVersion(dep.name, cwd),
      dev,
      existenceOnly,
    };
  });
}

/**
 * Formats the install command(s) for the given changes.
 *
 * Returns `{ devCommand?, regularCommand? }` so the caller can render a single
 * line when only one bucket is needed.
 *
 * @param {Object} params
 * @param {Array} params.changes - Output of detectMissingOrOutdatedDeps.
 * @param {boolean} [params.yarn=false]
 * @param {'npm'|'yarn'|'pnpm'} [params.packageManager] - Overrides the legacy yarn option.
 * @returns {{ devCommand?: string, regularCommand?: string }}
 */
export function formatInstallCommands({ changes, yarn = false, packageManager = yarn ? 'yarn' : 'npm' } = {}) {
  const needed = (changes || []).filter((c) => c.status !== 'ok');
  const dev = needed.filter((c) => c.dev);
  const regular = needed.filter((c) => !c.dev);

  const toSpec = (c) => `${c.name}@${c.requiredVersion}`;
  const out = {};
  const commands = {
    npm: { dev: 'meteor npm install --save-dev', regular: 'meteor npm install --save' },
    yarn: { dev: 'yarn add --dev', regular: 'yarn add' },
    pnpm: { dev: 'pnpm add --save-dev', regular: 'pnpm add' },
  }[packageManager];

  if (!commands) return out;

  if (dev.length > 0) {
    out.devCommand = `${commands.dev} ${dev.map(toSpec).join(' ')}`;
  }

  if (regular.length > 0) {
    out.regularCommand = `${commands.regular} ${regular.map(toSpec).join(' ')}`;
  }

  return out;
}

function padName(name, width) {
  if (name.length >= width) return name + ' ';
  return name + ' '.repeat(width - name.length);
}

function bulletAuto(c, width) {
  const padded = padName(c.name, width);
  if (c.status === 'missing') {
    return `   • ${padded}${c.requiredVersion} (new)`;
  }
  if (c.status === 'outdated') {
    return `   • ${padded}${c.currentVersion || '?'} -> ${c.requiredVersion}`;
  }
  return `   • ${padded}${c.requiredVersion}`;
}

function bulletManual(c, width) {
  const padded = padName(c.name, width);
  if (c.status === 'missing') {
    return `   • ${padded}${c.requiredVersion} (not installed)`;
  }
  return `   • ${padded}${c.requiredVersion} (currently ${c.currentVersion || 'unknown'})`;
}

function groupedBullets(changes, bulletFn) {
  const dev = changes.filter((c) => c.dev);
  const regular = changes.filter((c) => !c.dev);
  const all = [...dev, ...regular];
  const width = Math.max(...all.map((c) => c.name.length)) + 2;
  const out = [];
  if (dev.length > 0) {
    if (regular.length > 0) out.push(`   Dev dependencies:`);
    dev.forEach((c) => out.push(bulletFn(c, width)));
  }
  if (regular.length > 0) {
    if (dev.length > 0) out.push(`   Dependencies:`);
    regular.forEach((c) => out.push(bulletFn(c, width)));
  }
  return out;
}

/**
 * Renders the auto-install summary block.
 *
 * @param {Object} params
 * @param {string} params.packageLabel
 * @param {Array} params.changes - All processed dependencies (the function filters non-ok itself).
 * @param {string} [params.docUrl]
 * @param {string} [params.note]
 */
export function renderAutoInstallSummary({ packageLabel, changes, docUrl, note } = {}) {
  const touched = (changes || []).filter((c) => c.status !== 'ok');
  if (touched.length === 0) return;

  logProgress(`=> 📦 ${packageLabel}: updating npm dependencies`);
  if (note) {
    logInfo(`   ${note}`);
  }
  groupedBullets(touched, bulletAuto).forEach((line) => logInfo(line));
}

/**
 * Renders the discoverability footer pointing users at `meteor.autoInstallDeps`.
 * Called only after a successful install.
 */
export function renderAutoInstallFooter({ docUrl } = {}) {
  logInfo(`=> ℹ️  Set \`"meteor": { "autoInstallDeps": false }\` in package.json to manage them yourself.`);
  if (docUrl) {
    logInfo(`   See: ${docUrl}`);
  }
}

/**
 * Renders the manual-mode warning block. Does not install anything.
 *
 * @param {Object} params
 * @param {string} params.packageLabel
 * @param {Array} params.changes
 * @param {boolean} [params.yarn=false]
 * @param {string} [params.packageManager]
 * @param {Object} [params.installContext] - Workspace and app paths for manual guidance.
 * @param {string} [params.docUrl]
 * @param {string} [params.note]
 */
export function renderManualInstallInstructions({ packageLabel, changes, yarn = false, packageManager = yarn ? 'yarn' : 'npm', installContext, docUrl, note } = {}) {
  const needed = (changes || []).filter((c) => c.status !== 'ok');
  if (needed.length === 0) return;

  logWarn(`=> ⚠️  ${packageLabel}: npm dependencies need attention`);
  if (note) {
    logWarn(`   ${note}`);
  }
  logWarn(`   Package manager: ${packageManager}`);
  if (installContext?.isMonorepo) {
    logWarn(`   Workspace root: ${installContext.workspaceRoot}`);
    logWarn(`   Meteor app: ${path.relative(installContext.workspaceRoot, installContext.appDir) || '.'}`);
  }
  groupedBullets(needed, bulletManual).forEach((line) => logWarn(line));
  logWarn(``);
  logWarn(installContext
    ? `   From the Meteor app directory (${installContext.appDir}), run:`
    : `   To bring your project in line, run:`);

  const { devCommand, regularCommand } = formatInstallCommands({ changes: needed, packageManager });
  if (devCommand) logWarn(`       ${devCommand}`);
  if (regularCommand) logWarn(`       ${regularCommand}`);
  if (!devCommand && !regularCommand) {
    logWarn(`       Install the dependencies above with ${packageManager}.`);
  }
  logWarn(`=> ℹ️  Set \`"meteor": { "autoInstallDeps": true }\` in package.json to manage them automatically.`);
  if (docUrl) {
    logWarn(`   See: ${docUrl}`);
  }
}

/**
 * Generic entry point. Detects required deps, then either installs them
 * (auto mode) or prints actionable instructions (manual mode).
 *
 * Consumers MUST NOT gate this call on `hasMeteorAppConfigAutoInstallDeps()`.
 * The engine handles both modes.
 *
 * @param {Object} params
 * @param {string} params.packageId - Stable id used for once-per-process dedup.
 * @param {string} params.packageLabel - Human label shown in logs.
 * @param {Array} params.dependencies - DependencyDescriptor[].
 * @param {string} [params.docUrl] - Link shown in the discoverability footer / manual block.
 * @param {string} [params.note] - Optional line shown above the dep list.
 * @param {string} [params.cwd] - Defaults to the Meteor app directory.
 * @returns {Promise<{mode: string, changes: Array, installed: boolean, installCommands: string[]}>}
 */
export async function ensurePackageDependencies(params = {}) {
  const {
    packageId,
    packageLabel,
    dependencies,
    docUrl,
    note,
    cwd: cwdParam,
  } = params;

  if (!packageId || !packageLabel || !Array.isArray(dependencies)) {
    throw new Error(
      'ensurePackageDependencies requires { packageId, packageLabel, dependencies }'
    );
  }

  const dedupKey = DEDUP_PREFIX + packageId;
  if (getGlobalState(dedupKey, false)) {
    return { mode: 'noop', changes: [], installed: false, installCommands: [] };
  }

  const cwd = cwdParam || getMeteorAppDir();
  const changes = detectMissingOrOutdatedDeps(dependencies, { cwd });
  const needed = changes.filter((c) => c.status !== 'ok');

  if (needed.length === 0) {
    setGlobalState(dedupKey, true);
    return { mode: 'noop', changes, installed: false, installCommands: [] };
  }

  const installContext = getDependencyInstallContext(cwd);
  const { packageManager } = installContext;

  // `meteor update --npm` is an explicit user request to align NPM deps with
  // the current Meteor release, so it overrides `meteor.autoInstallDeps=false`
  // for that invocation only. The on-disk setting is not modified.
  const isUpdateNpm =
    typeof Package !== 'undefined' &&
    Package?.meteor?.global?.currentCommand?.name === 'update' &&
    Package?.meteor?.global?.currentCommand?.options?.npm === true;

  const autoInstall = isUpdateNpm || hasMeteorAppConfigAutoInstallDeps({ cwd });

  const canAutoInstall = ['npm', 'yarn', 'pnpm'].includes(packageManager);
  const cmds = formatInstallCommands({ changes: needed, packageManager });

  if (!autoInstall || !canAutoInstall) {
    const reason = !autoInstall
      ? 'Automatic dependency installation is disabled by meteor.autoInstallDeps=false.'
      : `Automatic dependency installation does not support ${packageManager} yet; no package files were changed.`;
    renderManualInstallInstructions({
      packageLabel,
      changes: needed,
      packageManager,
      installContext,
      docUrl,
      note: [note, reason].filter(Boolean).join(' '),
    });

    setGlobalState(dedupKey, true);

    return {
      mode: 'manual-warning',
      changes,
      installed: false,
      installCommands: [cmds.devCommand, cmds.regularCommand].filter(Boolean),
    };
  }

  renderAutoInstallSummary({ packageLabel, changes, docUrl, note });

  const devChanges = needed.filter((c) => c.dev);
  const regularChanges = needed.filter((c) => !c.dev);
  const installCommands = [];

  let devOk = true;
  let regularOk = true;

  if (devChanges.length > 0) {
    logProgress(
      `=> 🔧 Installing ${devChanges.length} dev dependenc${
        devChanges.length === 1 ? 'y' : 'ies'
      }...`
    );
    const specs = devChanges.map((c) => `${c.name}@${c.requiredVersion}`);
    installCommands.push(cmds.devCommand);
    devOk = await installNpmDependency(specs, { cwd, dev: true, packageManager });
  }

  if (regularChanges.length > 0) {
    logProgress(
      `=> 🔧 Installing ${regularChanges.length} dependenc${
        regularChanges.length === 1 ? 'y' : 'ies'
      }...`
    );
    const specs = regularChanges.map((c) => `${c.name}@${c.requiredVersion}`);
    installCommands.push(cmds.regularCommand);
    regularOk = await installNpmDependency(specs, { cwd, dev: false, packageManager });
  }

  const success = devOk && regularOk;

  if (!success) {
    logError(`=> ❌ Failed to install ${packageLabel} dependencies`);
    renderManualInstallInstructions({
      packageLabel,
      changes: needed.filter((c) => c.dev ? !devOk : !regularOk),
      packageManager,
      installContext,
      docUrl,
      note: `Automatic installation with ${packageManager} failed.`,
    });

    const failed = [];
    if (!devOk) failed.push('dev dependencies');
    if (!regularOk) failed.push('regular dependencies');

    throw new Error(
      `Failed to install ${packageLabel} ${joinWithAnd(failed)}. Please install them manually with the commands above.`
    );
  }

  logSuccess(`=> ✅ ${packageLabel} dependencies are up to date`);
  renderAutoInstallFooter({ docUrl });

  if (isMeteorAppUpdate()) {
    const installCommand = `${packageManager} install`;
    logInfo(`=> 🔔 Remember: Run \`${installCommand}\` after the Meteor update finishes.`);
    logInfo(`   This helps keep your dependencies correct and your project stable.`);
  }

  setGlobalState(dedupKey, true);

  return {
    mode: 'auto-install',
    changes,
    installed: true,
    installCommands,
  };
}
