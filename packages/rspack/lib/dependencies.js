/**
 * @module dependencies
 * @description Declares the Rspack-related npm dependencies the host Meteor app
 *              needs and delegates detection / install / warning to the generic
 *              engine in `tools-core/lib/deps`.
 *
 * The engine handles both modes:
 *   - `meteor.autoInstallDeps=true` (default): installs and prints a summary.
 *   - `meteor.autoInstallDeps=false`: warns with a copy-pasteable command.
 *
 * Do NOT gate these calls on `hasMeteorAppConfigAutoInstallDeps()` from
 * `rspack_plugin.js`. The engine owns that decision.
 */
import {
  DEFAULT_METEOR_RSPACK_REACT_REFRESH_VERSION,
  DEFAULT_METEOR_RSPACK_SWC_HELPERS_VERSION,
  DEFAULT_RSDOCTOR_RSPACK_PLUGIN_VERSION,
} from './constants';

const {
  getGlobalState,
  setGlobalState,
} = require('meteor/tools-core/lib/global-state');
const {
  getMeteorAppDir,
} = require('meteor/tools-core/lib/meteor');
const {
  checkNpmDependencyExists,
} = require('meteor/tools-core/lib/npm');
const {
  ensurePackageDependencies,
} = require('meteor/tools-core/lib/deps');

const {
  DEFAULT_RSPACK_VERSION,
  DEFAULT_METEOR_RSPACK_VERSION,
  DEFAULT_METEOR_RSPACK_REACT_HMR_VERSION,
  GLOBAL_STATE_KEYS,
} = require('./constants');

const RSPACK_DOCS_URL =
  'https://docs.meteor.com/about/modern-build-stack/rspack-bundler-integration#required-npm-dependencies';

/**
 * Ensures the core Rspack dependencies meet the minimum supported versions.
 * @returns {Promise<void>}
 */
export async function ensureRspackInstalled() {
  const dependencies = [
    { name: '@rspack/cli', version: DEFAULT_RSPACK_VERSION, semverCondition: 'gte', dev: true },
    { name: '@rspack/core', version: DEFAULT_RSPACK_VERSION, semverCondition: 'gte', dev: true },
    { name: '@meteorjs/rspack', version: DEFAULT_METEOR_RSPACK_VERSION, semverCondition: 'gte', dev: true },
    { name: '@swc/helpers', version: DEFAULT_METEOR_RSPACK_SWC_HELPERS_VERSION, semverCondition: 'gte', dev: false },
    { name: '@rsdoctor/rspack-plugin', version: DEFAULT_RSDOCTOR_RSPACK_PLUGIN_VERSION, semverCondition: 'gte', dev: true },
  ];

  await ensurePackageDependencies({
    packageId: 'rspack-core',
    packageLabel: 'Rspack',
    dependencies,
    docUrl: RSPACK_DOCS_URL,
  });
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

/**
 * Ensures the Rspack React HMR dependencies meet the minimum supported versions.
 * @returns {Promise<void>}
 */
export async function ensureRspackReactInstalled() {
  const dependencies = [
    { name: '@rspack/plugin-react-refresh', version: DEFAULT_METEOR_RSPACK_REACT_HMR_VERSION, semverCondition: 'gte', dev: true },
    { name: 'react-refresh', version: DEFAULT_METEOR_RSPACK_REACT_REFRESH_VERSION, semverCondition: 'gte', dev: true },
  ];

  await ensurePackageDependencies({
    packageId: 'rspack-react',
    packageLabel: 'Rspack React',
    dependencies,
    docUrl: RSPACK_DOCS_URL,
  });
}

/**
 * Ensures the Rspack Doctor dependency meets the minimum supported version.
 * @returns {Promise<void>}
 */
export async function ensureRspackDoctorInstalled() {
  const dependencies = [
    { name: '@rsdoctor/rspack-plugin', version: DEFAULT_RSDOCTOR_RSPACK_PLUGIN_VERSION, semverCondition: 'gte', dev: true },
  ];

  await ensurePackageDependencies({
    packageId: 'rspack-doctor',
    packageLabel: 'Rspack Doctor',
    dependencies,
    docUrl: RSPACK_DOCS_URL,
  });
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
