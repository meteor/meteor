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
} = require('./npm');
const {
  joinWithAnd,
} = require('./string');

const DEDUP_PREFIX = 'tools-core.deps.';

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
 * @param {Array<{name: string, version: string, semverCondition?: string, dev?: boolean, existenceOnly?: boolean}>} dependencies
 * @param {Object} [options]
 * @param {string} [options.cwd] - Defaults to the Meteor app directory.
 * @returns {Array<{name: string, status: 'ok'|'missing'|'outdated', requiredVersion: string, currentVersion: ?string, dev: boolean, existenceOnly: boolean}>}
 */
export function detectMissingOrOutdatedDeps(dependencies, options = {}) {
  const cwd = options.cwd || getMeteorAppDir();

  return dependencies.map((dep) => {
    const dev = dep.dev !== false;
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
 * @returns {{ devCommand?: string, regularCommand?: string }}
 */
export function formatInstallCommands({ changes, yarn = false } = {}) {
  const needed = (changes || []).filter((c) => c.status !== 'ok');
  const dev = needed.filter((c) => c.dev);
  const regular = needed.filter((c) => !c.dev);

  const toSpec = (c) => `${c.name}@${c.requiredVersion}`;
  const out = {};

  if (dev.length > 0) {
    out.devCommand = yarn
      ? `yarn add --dev ${dev.map(toSpec).join(' ')}`
      : `meteor npm install --save-dev ${dev.map(toSpec).join(' ')}`;
  }

  if (regular.length > 0) {
    out.regularCommand = yarn
      ? `yarn add ${regular.map(toSpec).join(' ')}`
      : `meteor npm install --save ${regular.map(toSpec).join(' ')}`;
  }

  return out;
}

function padName(name, width) {
  if (name.length >= width) return name + ' ';
  return name + ' '.repeat(width - name.length);
}

function renderDepBullets(changes) {
  const width = Math.max(...changes.map((c) => c.name.length)) + 2;
  return changes.map((c) => {
    const padded = padName(c.name, width);
    if (c.status === 'missing') {
      return `   • ${padded}${c.requiredVersion} (new)`;
    }
    if (c.status === 'outdated') {
      return `   • ${padded}${c.currentVersion || '?'} -> ${c.requiredVersion}`;
    }
    return `   • ${padded}${c.requiredVersion}`;
  });
}

function renderDepBulletsManual(changes) {
  const width = Math.max(...changes.map((c) => c.name.length)) + 2;
  return changes.map((c) => {
    const padded = padName(c.name, width);
    if (c.status === 'missing') {
      return `   • ${padded}${c.requiredVersion} (not installed)`;
    }
    return `   • ${padded}${c.requiredVersion} (currently ${c.currentVersion || 'unknown'})`;
  });
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
  renderDepBullets(touched).forEach((line) => logInfo(line));
}

/**
 * Renders the discoverability footer pointing users at `meteor.autoInstallDeps`.
 * Called only after a successful install.
 */
export function renderAutoInstallFooter({ docUrl } = {}) {
  logInfo(`ℹ️  Meteor installed these for you because \`meteor.autoInstallDeps\` is enabled.`);
  logInfo(`   Set \`"meteor": { "autoInstallDeps": false }\` in package.json to manage them yourself.`);
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
 * @param {string} [params.docUrl]
 * @param {string} [params.note]
 */
export function renderManualInstallInstructions({ packageLabel, changes, yarn = false, docUrl, note } = {}) {
  const needed = (changes || []).filter((c) => c.status !== 'ok');
  if (needed.length === 0) return;

  logWarn(`=> ⚠️  ${packageLabel}: npm dependencies need attention`);
  logWarn(``);
  logWarn(`   This version of Meteor requires the following minimum versions to avoid`);
  logWarn(`   incompatibilities at build or runtime:`);
  if (note) {
    logWarn(`   ${note}`);
  }
  logWarn(``);
  renderDepBulletsManual(needed).forEach((line) => logWarn(line));
  logWarn(``);
  logWarn(`   Automatic install is disabled (\`meteor.autoInstallDeps=false\`).`);
  logWarn(`   To bring your project in line, run:`);
  logWarn(``);

  const { devCommand, regularCommand } = formatInstallCommands({ changes: needed, yarn });
  if (devCommand) logWarn(`       ${devCommand}`);
  if (regularCommand) logWarn(`       ${regularCommand}`);

  logWarn(``);
  logWarn(`   Or re-enable auto-install by removing \`"autoInstallDeps": false\` from`);
  logWarn(`   your package.json \`"meteor"\` block.`);
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

  const yarn = process.env.YARN_ENABLED === 'true' || isYarnProject({ cwd });
  if (!process.env.YARN_ENABLED) {
    process.env.YARN_ENABLED = yarn ? 'true' : 'false';
  }

  // `meteor update --npm` is an explicit user request to align NPM deps with
  // the current Meteor release, so it overrides `meteor.autoInstallDeps=false`
  // for that invocation only. The on-disk setting is not modified.
  const isUpdateNpm =
    typeof Package !== 'undefined' &&
    Package?.meteor?.global?.currentCommand?.name === 'update' &&
    Package?.meteor?.global?.currentCommand?.options?.npm === true;

  const autoInstall = isUpdateNpm || hasMeteorAppConfigAutoInstallDeps();

  if (!autoInstall) {
    renderManualInstallInstructions({
      packageLabel,
      changes: needed,
      yarn,
      docUrl,
      note,
    });

    const cmds = formatInstallCommands({ changes: needed, yarn });
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
    installCommands.push(
      yarn
        ? `yarn add --dev ${specs.join(' ')}`
        : `meteor npm install --save-dev ${specs.join(' ')}`
    );
    devOk = await installNpmDependency(specs, { cwd, dev: true, yarn });
  }

  if (regularChanges.length > 0) {
    logProgress(
      `=> 🔧 Installing ${regularChanges.length} dependenc${
        regularChanges.length === 1 ? 'y' : 'ies'
      }...`
    );
    const specs = regularChanges.map((c) => `${c.name}@${c.requiredVersion}`);
    installCommands.push(
      yarn
        ? `yarn add ${specs.join(' ')}`
        : `meteor npm install --save ${specs.join(' ')}`
    );
    regularOk = await installNpmDependency(specs, { cwd, dev: false, yarn });
  }

  const success = devOk && regularOk;

  if (!success) {
    logError(`=> ❌ Failed to install ${packageLabel} dependencies`);
    const cmds = formatInstallCommands({ changes: needed, yarn });
    if (!devOk && cmds.devCommand) {
      logError(`   For dev dependencies, run: ${cmds.devCommand}`);
    }
    if (!regularOk && cmds.regularCommand) {
      logError(`   For regular dependencies, run: ${cmds.regularCommand}`);
    }

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
    const installCommand = yarn ? 'yarn install' : 'npm install';
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
