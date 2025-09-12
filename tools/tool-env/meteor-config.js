import files from "../fs/files";

/**
 * Global configuration object for Meteor.
 * @type {Object}
 */
export let meteorConfig;

/**
 * Default configuration for modern mode features.
 * @type {Object}
 * @property {boolean} transpiler - Whether to use the modern transpiler.
 * @property {boolean} minifier - Whether to use the modern minifier.
 * @property {boolean} webArchOnly - Whether to use modern features only for web architecture.
 * @property {boolean} watcher - Whether to use the modern watcher.
 */
const DEFAULT_MODERN = {
  transpiler: true,
  minifier: true,
  webArchOnly: true,
  watcher: true,
};

/**
 * Normalizes the modern configuration by applying default values.
 * @param {boolean|Object} r - The input modern configuration. If true, uses all defaults.
 *                             If false, disables all modern features. If an object, merges with defaults.
 * @returns {Object} - The normalized modern configuration object.
 */
export const normalizeModernConfig = (r = false) => Object.fromEntries(
  Object.entries(DEFAULT_MODERN).map(([k, def]) => [
    k,
    r === true
      ? def
      : r === false || r?.[k] === false
        ? false
        : typeof r?.[k] === 'object'
          ? { ...r[k] }
          : def,
  ]),
);

/**
 * Initializes the Meteor configuration based on the application directory.
 * Reads configuration from package.json if available, and applies environment variables.
 * 
 * @param {string|null} appDir - The application directory path. If null, only environment variables are used.
 * @returns {Object} - The initialized Meteor configuration object.
 */
export function initMeteorConfig(appDir) {
  const modernForced = JSON.parse(process.env.METEOR_MODERN || "false");
  let packageJson;
  if (appDir) {
    const packageJsonPath = files.pathJoin(appDir, 'package.json');
    if (!files.exists(packageJsonPath)) {
      setMeteorConfig({
        modern: normalizeModernConfig(modernForced || false),
      });
      return meteorConfig;
    }
    const packageJsonFile = files.readFile(packageJsonPath, 'utf8');
    packageJson = JSON.parse(packageJsonFile);
  }
  setMeteorConfig({
    ...(packageJson?.meteor || {}),
    modern: normalizeModernConfig(modernForced || packageJson?.meteor?.modern || false),
  });
  return meteorConfig;
}

/**
 * Gets the current Meteor configuration.
 * @returns {Object} - The current Meteor configuration object.
 */
export function getMeteorConfig() {
  return meteorConfig;
}

/**
 * Sets the Meteor configuration to a new value.
 * @param {Object} config - The new configuration object to set.
 */
export function setMeteorConfig(config) {
  meteorConfig = config;
}
