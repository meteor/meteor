/**
 * @module constants
 * @description Constants and global state keys for Rspack plugin
 */

import path from 'path';

/* Minimum accepted and auto-install version for `@rspack/core` and `@rspack/cli`. */
export const DEFAULT_RSPACK_VERSION = '1.7.1';

/* `@meteorjs/rspack` minimum and auto-install version; sync with its package.json. */
export const DEFAULT_METEOR_RSPACK_VERSION = '2.2.0';

/* Minimum accepted and auto-install version for `@rspack/plugin-react-refresh`. */
export const DEFAULT_METEOR_RSPACK_REACT_HMR_VERSION = '1.4.3';

/* Minimum accepted and auto-install version for the `react-refresh` HMR runtime. */
export const DEFAULT_METEOR_RSPACK_REACT_REFRESH_VERSION = '0.17.0';

/* Reserved `swc-loader` version; currently unused by `dependencies.js`. */
export const DEFAULT_METEOR_RSPACK_SWC_LOADER_VERSION = '0.2.6';

/* Minimum accepted and auto-install version for the `@swc/helpers` runtime. */
export const DEFAULT_METEOR_RSPACK_SWC_HELPERS_VERSION = '0.5.17';

/* Minimum accepted and auto-install version for `@rsdoctor/rspack-plugin`. */
export const DEFAULT_RSDOCTOR_RSPACK_PLUGIN_VERSION = '1.5.7';

/**
 * Global state keys used for storing and retrieving state across the application
 * @constant {Object}
 * @property {string} CLIENT_PROCESS - Key for storing the client process
 * @property {string} SERVER_PROCESS - Key for storing the server process
 * @property {string} RSPACK_INSTALLATION_CHECKED - Key for tracking if Rspack installation was checked
 * @property {string} IS_REACT_ENABLED - Key for tracking if React is enabled
 * @property {string} INITIAL_ENTRYPONTS - Key for storing initial entrypoints
 * @property {string} CLIENT_FIRST_COMPILE - Key for tracking client first compilation state
 * @property {string} SERVER_FIRST_COMPILE - Key for tracking server first compilation state
 * @property {string} BUILD_CONTEXT_FILES_CLEANED - Key for tracking if build context files have been cleaned
 */
export const GLOBAL_STATE_KEYS = {
  CLIENT_PROCESS: 'rspack.clientProcess',
  SERVER_PROCESS: 'rspack.serverProcess',
  RSPACK_INSTALLATION_CHECKED: 'rspack.rspackInstallationChecked',
  RSPACK_REACT_INSTALLATION_CHECKED: 'rspack.rspackReactInstallationChecked',
  RSPACK_DOCTOR_INSTALLATION_CHECKED: 'rspack.rspackDoctorInstallationChecked',
  REACT_CHECKED: 'rspack.reactChecked',
  TYPESCRIPT_CHECKED: 'rspack.typescriptChecked',
  ANGULAR_CHECKED: 'rspack.angularChecked',
  INITIAL_ENTRYPONTS: 'meteor.initialEntrypoints',
  CLIENT_FIRST_COMPILE: 'rspack.clientFirstCompile',
  SERVER_FIRST_COMPILE: 'rspack.serverFirstCompile',
  BUILD_CONTEXT_FILES_CLEANED: 'rspack.buildContextFilesCleaned',
};

const meteorConfig = typeof Plugin !== 'undefined' ? Plugin?.getMeteorConfig() : null;

const meteorLocalDirName = process.env.METEOR_LOCAL_DIR
  ? path.basename(process.env.METEOR_LOCAL_DIR.replace(/\\/g, '/'))
  : '';

/**
 * Directory name for Rspack build context
 * Can be overridden with RSPACK_BUILD_CONTEXT environment variable
 * @constant {string}
 */
export const RSPACK_BUILD_CONTEXT =
  meteorConfig?.buildContext ||
  process.env.RSPACK_BUILD_CONTEXT ||
  `_build${(meteorLocalDirName && `-${meteorLocalDirName}`) || ''}`;

process.env.RSPACK_BUILD_CONTEXT = RSPACK_BUILD_CONTEXT;

/**
 * Directory name for Rspack assets context
 * Can be overridden with RSPACK_ASSETS_CONTEXT environment variable
 * @constant {string}
 */
export const RSPACK_ASSETS_CONTEXT =
  meteorConfig?.assetsContext ||
  process.env.RSPACK_ASSETS_CONTEXT ||
  `build-assets${(meteorLocalDirName && `-${meteorLocalDirName}`) || ''}`;

process.env.RSPACK_ASSETS_CONTEXT = RSPACK_ASSETS_CONTEXT;

/**
 * Directory name for Rspack bundles context
 * Can be overridden with RSPACK_ASSETS_CONTEXT environment variable
 * @constant {string}
 */
export const RSPACK_CHUNKS_CONTEXT =
  meteorConfig?.chunksContext ||
  process.env.RSPACK_CHUNKS_CONTEXT ||
  `build-chunks${(meteorLocalDirName && `-${meteorLocalDirName}`) || ''}`;

process.env.RSPACK_CHUNKS_CONTEXT = RSPACK_CHUNKS_CONTEXT;

/**
 * Directory name for Rspack doctor context
 * @type {string}
 */
export const RSPACK_DOCTOR_CONTEXT = '.rsdoctor';

/**
 * Gets the mode suffix used to isolate build artifacts produced by different
 * Meteor commands running concurrently on the same app directory (e.g. a dev
 * server in one terminal and `meteor test` in another). This is a different
 * isolation axis than the METEOR_LOCAL_DIR suffix baked into the base
 * context names above: that one separates local directories, this one
 * separates modes within a single local directory. The two compose.
 * @param {boolean} isTest - Whether in test mode
 * @param {boolean} isTestFullApp - Whether in --full-app test mode
 * @returns {string} '' (run/build), '-test' (test) or '-app-test' (full-app)
 */
function getModeSuffix(isTest, isTestFullApp) {
  if (isTest && isTestFullApp) return '-app-test';
  if (isTest) return '-test';
  return '';
}

/**
 * Gets the mode-aware Rspack chunks context directory name
 * (e.g. 'build-chunks', 'build-chunks-test', 'build-chunks-app-test')
 * @param {boolean} isTest - Whether in test mode
 * @param {boolean} isTestFullApp - Whether in --full-app test mode
 * @returns {string} Context directory name
 */
export function getRspackChunksContext(isTest = false, isTestFullApp = false) {
  return `${RSPACK_CHUNKS_CONTEXT}${getModeSuffix(isTest, isTestFullApp)}`;
}

/**
 * Gets the mode-aware Rspack assets context directory name
 * (e.g. 'build-assets', 'build-assets-test', 'build-assets-app-test')
 * @param {boolean} isTest - Whether in test mode
 * @param {boolean} isTestFullApp - Whether in --full-app test mode
 * @returns {string} Context directory name
 */
export function getRspackAssetsContext(isTest = false, isTestFullApp = false) {
  return `${RSPACK_ASSETS_CONTEXT}${getModeSuffix(isTest, isTestFullApp)}`;
}

/**
 * Regex pattern for hot update files
 * @constant {RegExp}
 */
export const RSPACK_HOT_UPDATE_REGEX = /^\/(.+\.hot-update\.(?:json|js))$/;

export const FILE_ROLE = {
  build: 'build',
  entry: 'entry',
  run: 'run',
  output: 'output',
};
