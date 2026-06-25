/**
 * @module build-context
 * @description Manages the build-native/ output directory and capacitor.config.js scaffolding.
 */

const fs = require('fs');
const path = require('path');

const { logError, logInfo } = require('meteor/tools-core/lib/log');
const { addGitignoreEntries } = require('meteor/tools-core/lib/git');
const {
  getMeteorAppDir,
  getMeteorAppPackageJson,
  getMeteorAppPlatforms,
  isMeteorAppDevelopment,
  isMeteorAppProduction,
  isMeteorAppDebug,
  isMeteorAppConfigModernVerbose,
} = require('meteor/tools-core/lib/meteor');

const isVerbose = () => isMeteorAppDebug() || isMeteorAppConfigModernVerbose();
const { setGlobalState } = require('meteor/tools-core/lib/global-state');

const {
  CAPACITOR_BUILD_CONTEXT,
  GLOBAL_STATE_KEYS,
  getCapacitorWebDir,
} = require('./constants');

/**
 * Creates the build context root (shared with rspack) and gitignores it
 * plus the per-platform cap-sync targets.
 * @returns {string} Build context absolute path.
 */
export function ensureCapacitorBuildContextExists() {
  const appDir = getMeteorAppDir();
  const buildContextPath = path.join(appDir, CAPACITOR_BUILD_CONTEXT);

  if (!fs.existsSync(buildContextPath)) {
    try {
      fs.mkdirSync(buildContextPath, { recursive: true });
    } catch (error) {
      logError(`Failed to create Capacitor build context directory: ${error.message}`);
      throw error;
    }
  }

  addGitignoreEntries(
    appDir,
    [CAPACITOR_BUILD_CONTEXT],
    'Meteor build context (rspack + capacitor)'
  );

  // Gate entries by platforms present. Union the current command args so
  // the first `meteor add-platform` lands lines on the same compile.
  const platformArgs = Package?.meteor?.global?.currentCommand?.options?.args || [];
  const platforms = new Set([...getMeteorAppPlatforms(), ...platformArgs]);
  const platformEntries = [
    ...(platforms.has('android') ? [
      'android/app/src/main/assets/public',
      'android/app/src/main/assets/capacitor.*.json',
    ] : []),
    ...(platforms.has('ios') ? [
      'ios/App/App/public',
      'ios/App/App/capacitor.*.json',
      'ios/App/App/config.xml',
    ] : []),
  ];
  if (platformEntries.length > 0) {
    addGitignoreEntries(appDir, platformEntries, 'Meteor Capacitor synced native assets');
  }

  setGlobalState(GLOBAL_STATE_KEYS.CAPACITOR_BUILD_CONTEXT_PREPARED, true);
  return buildContextPath;
}

/**
 * Returns the existing capacitor.config.* at project root or scaffolds a
 * defineConfig-based JS file from package.json metadata.
 * @returns {string} Config file path.
 */
export function ensureCapacitorConfigExists() {
  const appDir = getMeteorAppDir();
  const candidates = [
    'capacitor.config.ts',
    'capacitor.config.js',
    'capacitor.config.mjs',
    'capacitor.config.cjs',
    'capacitor.config.json',
  ];

  for (const candidate of candidates) {
    const candidatePath = path.join(appDir, candidate);
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  const pkgJson = getMeteorAppPackageJson() || {};
  // Java package segment: [a-zA-Z][a-zA-Z0-9_]+, no dashes.
  const sanitizedSegment = (pkgJson.name || 'meteor-app')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^[^a-z]+/, '') || 'meteorapp';
  const appId = pkgJson?.capacitor?.appId || `com.example.${sanitizedSegment}`;
  const appName = pkgJson?.capacitor?.appName || pkgJson.name || 'MeteorApp';

  const target = path.join(appDir, 'capacitor.config.js');
  const template = `const { defineConfig } = require('@meteorjs/capacitor');

/**
 * Capacitor configuration for a Meteor project.
 *
 * defineConfig deep-merges this on top of Meteor defaults
 * (webDir, server.url, plugins.SplashScreen, and others) and re-enforces \`bundledWebRuntime: false\`.
 * Anything set here wins, except RESERVED_PATHS, which warn and are ignored.
 *
 * Typed flags on the \`Meteor\` object include:
 * - \`Meteor.isDevelopment\` / \`Meteor.isProduction\`
 * - \`Meteor.isLivereload\` / \`Meteor.isBundled\`
 * - \`Meteor.isNativeAndroid\` / \`Meteor.isNativeIos\`
 * - \`Meteor.buildContext\` / \`Meteor.webDir\`
 * - \`Meteor.rootUrl\` / \`Meteor.localIp\` / \`Meteor.port\`
 */
module.exports = defineConfig(Meteor => ({
  appId: ${JSON.stringify(appId)},
  appName: ${JSON.stringify(appName)},
  ios: { contentInset: 'always' },
}));
`;

  try {
    fs.writeFileSync(target, template, 'utf8');
    logInfo(`[i] Scaffolded ${path.relative(appDir, target)}`);
  } catch (error) {
    logError(`Failed to scaffold capacitor.config.js: ${error.message}`);
    throw error;
  }

  setGlobalState(GLOBAL_STATE_KEYS.CAPACITOR_CONFIG_SCAFFOLDED, true);
  return target;
}

const CAPACITOR_CONFIG_LOOKUP = [
  'capacitor.config.js',
  'capacitor.config.cjs',
  'capacitor.config.mjs',
  'capacitor.config.json',
];

export function formatCapacitorConfigError({ appDir, configPath, error }) {
  const displayPath = path.relative(appDir, configPath) || path.basename(configPath);
  return [
    `Capacitor config error in ${displayPath}: ${error.message}`,
    'Export a Capacitor config object, or use defineConfig(Meteor => ({ ... })).',
    'Run with --verbose to see the full stack trace.',
  ].join('\n');
}

export function validateResolvedCapacitorConfig(resolved, { appDir, configPath } = {}) {
  if (!resolved || typeof resolved !== 'object' || Array.isArray(resolved)) {
    const displayPath = configPath && appDir
      ? path.relative(appDir, configPath)
      : 'capacitor.config.js';
    throw new Error(
      `${displayPath} must export a Capacitor config object. ` +
      'Use module.exports = defineConfig(Meteor => ({ ... })).'
    );
  }

  return resolved;
}

/**
 * Loads capacitor.config.{js,cjs,mjs,json}, runs defineConfig, and writes
 * the resolved object as capacitor.config.json into the per-env webDir.
 * Informational only (cap CLI re-evaluates the source on each invocation).
 * Skips .ts and missing configs silently.
 * @returns {Promise<boolean>}
 */
export async function writeResolvedConfigSnapshot({ appDir = getMeteorAppDir() } = {}) {
  let configPath;
  for (const candidate of CAPACITOR_CONFIG_LOOKUP) {
    const candidatePath = path.join(appDir, candidate);
    if (fs.existsSync(candidatePath)) {
      configPath = candidatePath;
      break;
    }
  }

  if (!configPath) return false;

  let resolved;
  try {
    if (configPath.endsWith('.mjs')) {
      const { pathToFileURL } = require('url');
      const mod = await import(pathToFileURL(configPath).href);
      resolved = mod && mod.default ? mod.default : mod;
    } else if (configPath.endsWith('.json')) {
      resolved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } else {
      // Meteor's build-plugin require can't resolve arbitrary file paths;
      // createRequire anchors a real Node require at the user's config.
      const { createRequire } = require('module');
      const nodeRequire = createRequire(configPath);
      delete nodeRequire.cache[nodeRequire.resolve(configPath)];
      const mod = nodeRequire(configPath);
      resolved = mod && mod.default ? mod.default : mod;
    }
  } catch (error) {
    const message = formatCapacitorConfigError({ appDir, configPath, error });
    logError(isVerbose() && error.stack ? error.stack : message);
    throw new Error(message);
  }

  validateResolvedCapacitorConfig(resolved, { appDir, configPath });

  const webDir = getCapacitorWebDir({
    isDevelopment: isMeteorAppDevelopment(),
    isProduction: isMeteorAppProduction(),
  });
  const targetDir = path.join(appDir, webDir);
  fs.mkdirSync(targetDir, { recursive: true });

  const snapshotPath = path.join(targetDir, 'capacitor.config.json');
  fs.writeFileSync(snapshotPath, JSON.stringify(resolved, null, 2) + '\n', 'utf8');
  if (isVerbose()) {
    logInfo(`[i] Capacitor: snapshot resolved config -> ${path.relative(appDir, snapshotPath)}`);
  }
  return true;
}
