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
 * Ensures the build context root (matches RSPACK_BUILD_CONTEXT) exists at the
 * project root and is gitignored. Per-env native-{dev,prod} subfolders are
 * created on demand by the transform.
 * @returns {string} The absolute path to the build context root.
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

  setGlobalState(GLOBAL_STATE_KEYS.CAPACITOR_BUILD_CONTEXT_PREPARED, true);
  return buildContextPath;
}

/**
 * Ensures a capacitor.config.{js,ts,mjs,cjs,json} exists at project root.
 * If none exists, scaffolds a JS file that imports defineConfig from
 * @meteorjs/capacitor and reads appId/appName from package.json.
 *
 * @returns {string} Path to the config file.
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
 * (webDir, plugins.SplashScreen, …) and re-enforces \`bundledWebRuntime: false\`.
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
  server: Meteor.isDevelopment
    ? { url: \`http://\${Meteor.localIp}:\${Meteor.port}\`, cleartext: true }
    : Meteor.isLivereload
    ? { url: Meteor.rootUrl }
    : undefined,
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

/**
 * Loads the project's capacitor.config.{js,cjs,mjs,json}, evaluates
 * defineConfig (which deep-merges Meteor defaults under the user factory
 * and re-enforces RESERVED_PATHS), and writes the resolved object as
 * `capacitor.config.json` inside the per-env webDir
 * (`_build/native-{dev,prod}/`).
 *
 * The snapshot is informational; Capacitor's CLI hardcodes its lookup to
 * project-root `capacitor.config.{ts,js,json}` and continues to load the
 * source .js, re-running defineConfig per invocation. The snapshot exists
 * so users (and other tools) can inspect what defineConfig actually
 * produced for the current env without re-running the factory.
 *
 * Skips silently when:
 *   - no capacitor.config.* found,
 *   - the file is .ts (plain Node can't load it without a TS loader).
 *
 * @returns {Promise<boolean>} True if a snapshot was written.
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
    logError(`Capacitor: failed to evaluate ${path.relative(appDir, configPath)}: ${error.message}`);
    return false;
  }

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
