/**
 * @module constants
 * @description Constants and global state keys for Rspack plugin
 */

export const DEFAULT_RSPACK_VERSION = '1.6.5';

export const DEFAULT_METEOR_RSPACK_VERSION = '0.2.54';

export const DEFAULT_METEOR_RSPACK_REACT_HMR_VERSION = '1.4.3';

export const DEFAULT_METEOR_RSPACK_REACT_REFRESH_VERSION = '0.17.0';

export const DEFAULT_METEOR_RSPACK_SWC_LOADER_VERSION = '0.2.6';

export const DEFAULT_METEOR_RSPACK_SWC_HELPERS_VERSION = '0.5.17';

export const DEFAULT_RSDOCTOR_RSPACK_PLUGIN_VERSION = '1.2.3';

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

/**
 * Directory name for Rspack build context
 * Can be overridden with RSPACK_BUILD_CONTEXT environment variable
 * @constant {string}
 */
export const RSPACK_BUILD_CONTEXT =
  meteorConfig?.buildContext ||
  process.env.RSPACK_BUILD_CONTEXT ||
  '_build';

process.env.RSPACK_BUILD_CONTEXT = RSPACK_BUILD_CONTEXT;

/**
 * Directory name for Rspack assets context
 * Can be overridden with RSPACK_ASSETS_CONTEXT environment variable
 * @constant {string}
 */
export const RSPACK_ASSETS_CONTEXT =
  meteorConfig?.assetsContext ||
  process.env.RSPACK_ASSETS_CONTEXT ||
  'build-assets';

process.env.RSPACK_ASSETS_CONTEXT = RSPACK_ASSETS_CONTEXT;

/**
 * Directory name for Rspack bundles context
 * Can be overridden with RSPACK_ASSETS_CONTEXT environment variable
 * @constant {string}
 */
export const RSPACK_CHUNKS_CONTEXT =
  meteorConfig?.chunksContext ||
  process.env.RSPACK_CHUNKS_CONTEXT ||
  'build-chunks';

process.env.RSPACK_CHUNKS_CONTEXT = RSPACK_CHUNKS_CONTEXT;

/**
 * Directory name for Rspack doctor context
 * @type {string}
 */
export const RSPACK_DOCTOR_CONTEXT = '.rsdoctor';

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
