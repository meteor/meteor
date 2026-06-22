/**
 * @module transforms
 * @description web.cordova/ → Capacitor webDir transforms.
 *   - buildIndex(): compose index.html via boilerplate-generator, patch shim + __cordova/.
 *   - syncBundleFiles(): copy assets, drop server-only files, flatten app/* upward.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { logError, logInfo } = require('meteor/tools-core/lib/log');
const {
  getMeteorAppDir,
  getMeteorAppPort,
  isMeteorAppDevelopment,
  isMeteorAppProduction,
} = require('meteor/tools-core/lib/meteor');
const { Boilerplate } = require('meteor/boilerplate-generator');

const {
  CAPACITOR_CORDOVA_OUTPUT_DIR,
  CAPACITOR_EXCLUDED_FILES,
  WEB_APP_LOCAL_SERVER_SHIM,
  getCapacitorWebDir,
} = require('./constants');

const CORDOVA_ARCH = 'web.cordova';

function detectLocalIp() {
  if (process.env.METEOR_CAPACITOR_LOCAL_IP) return process.env.METEOR_CAPACITOR_LOCAL_IP;
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const info of interfaces[name] || []) {
      if (info.family === 'IPv4' && !info.internal) return info.address;
    }
  }
  return '127.0.0.1';
}

function resolveRootUrl() {
  if (process.env.ROOT_URL) return process.env.ROOT_URL;
  return `http://${detectLocalIp()}:${getMeteorAppPort()}/`;
}

function resolveWebDir() {
  return getCapacitorWebDir({
    isDevelopment: isMeteorAppDevelopment(),
    isProduction: isMeteorAppProduction(),
  });
}

function resolveCordovaOutDir({ appDir, cordovaOutDir }) {
  if (cordovaOutDir) {
    return path.isAbsolute(cordovaOutDir)
      ? cordovaOutDir
      : path.join(appDir, cordovaOutDir);
  }
  return path.join(appDir, CAPACITOR_CORDOVA_OUTPUT_DIR);
}

/**
 * Patches a Meteor web.cordova index.html string for Capacitor:
 *   1. Injects WebAppLocalServer no-op right after the <head> tag.
 *   2. Strips __cordova/ from every asset URL so they resolve from webDir root.
 *
 * @param {string} html - Original index.html content.
 * @returns {string} Patched HTML.
 */
function patchCordovaIndexHtml(html) {
  if (typeof html !== 'string' || !html) {
    return html;
  }

  let out = html;

  if (!out.includes('var WebAppLocalServer')) {
    out = out.replace(/<head>/i, `<head>\n  ${WEB_APP_LOCAL_SERVER_SHIM}`);
  }

  out = out.replace(/__cordova\//g, '');

  return out;
}

/**
 * Composes index.html from head.html/body.html/program.json via
 * boilerplate-generator (the composer tools/cordova/builder.js uses),
 * patches it, and writes to webDir.
 * @returns {Promise<boolean>}
 */
async function buildIndex({ appDir = getMeteorAppDir(), webDir = resolveWebDir(), cordovaOutDir = null } = {}) {
  cordovaOutDir = resolveCordovaOutDir({ appDir, cordovaOutDir });
  const programJsonPath = path.join(cordovaOutDir, 'program.json');
  const targetPath = path.join(appDir, webDir, 'index.html');

  if (!fs.existsSync(programJsonPath)) {
    logError(`Capacitor: ${path.relative(appDir, programJsonPath)} not found — has the web.cordova arch been built?`);
    return false;
  }

  let program;
  try {
    program = JSON.parse(fs.readFileSync(programJsonPath, 'utf8'));
  } catch (err) {
    logError(`Capacitor: failed to parse ${path.relative(appDir, programJsonPath)}: ${err.message}`);
    return false;
  }

  const rootUrl = resolveRootUrl();
  const runtimeConfig = {
    meteorRelease: 'none',
    ROOT_URL: rootUrl,
    ROOT_URL_PATH_PREFIX: '',
    DDP_DEFAULT_CONNECTION_URL: process.env.DDP_DEFAULT_CONNECTION_URL || rootUrl,
    autoupdate: {
      versions: {
        [CORDOVA_ARCH]: {
          version: program.version,
          versionRefreshable: program.versionRefreshable,
          versionNonRefreshable: program.versionNonRefreshable,
          versionReplaceable: program.versionReplaceable,
        },
      },
    },
    appId: process.env.METEOR_APP_ID || 'meteor-app',
    meteorEnv: {
      NODE_ENV: process.env.NODE_ENV || 'development',
      TEST_METADATA: process.env.TEST_METADATA || '{}',
    },
  };

  let html;
  try {
    const boilerplate = new Boilerplate(CORDOVA_ARCH, program.manifest, {
      pathMapper: p => path.join(cordovaOutDir, p),
      baseDataExtension: {
        meteorRuntimeConfig: JSON.stringify(encodeURIComponent(JSON.stringify(runtimeConfig))),
        rootUrlPathPrefix: '',
        inlineScriptsAllowed: true,
        htmlAttributes: {},
      },
    });
    html = await boilerplate.toHTMLAsync();
  } catch (err) {
    logError(`Capacitor: failed to render index.html via boilerplate-generator: ${err.message}`);
    return false;
  }

  const patched = patchCordovaIndexHtml(html);

  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, patched, 'utf8');
  } catch (err) {
    logError(`Capacitor: failed to write ${targetPath}: ${err.message}`);
    return false;
  }

  return true;
}

/**
 * Recursively copies a directory tree, skipping files in `excludedFiles`
 * and walking subdirectories.
 */
function copyTreeFiltered(srcDir, dstDir, excludedFiles) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(dstDir, { recursive: true });

  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (excludedFiles.includes(entry.name)) continue;

    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);

    if (entry.isDirectory()) {
      copyTreeFiltered(srcPath, dstPath, excludedFiles);
    } else if (entry.isFile()) {
      // Meteor writes web.cordova/ read-only; unlink first so re-runs overwrite.
      fs.rmSync(dstPath, { force: true });
      fs.copyFileSync(srcPath, dstPath);
    } else if (entry.isSymbolicLink()) {
      fs.rmSync(dstPath, { force: true });
      const linkTarget = fs.readlinkSync(srcPath);
      try {
        fs.symlinkSync(linkTarget, dstPath);
      } catch {
        const resolved = fs.realpathSync(srcPath);
        if (fs.statSync(resolved).isFile()) fs.copyFileSync(resolved, dstPath);
      }
    }
  }
}

/**
 * Copies web.cordova/ → build-native/ minus excluded server-only files.
 * Keep the app/ directory intact because the generated index references
 * /app/app.js and /app/global-imports.js after __cordova/ path adaptation.
 *
 * @returns {boolean}
 */
function syncBundleFiles({ appDir = getMeteorAppDir(), webDir = resolveWebDir(), cordovaOutDir = null } = {}) {
  const sourceDir = resolveCordovaOutDir({ appDir, cordovaOutDir });
  const targetDir = path.join(appDir, webDir);

  if (!fs.existsSync(sourceDir)) {
    logError(`Capacitor: ${path.relative(appDir, sourceDir)} not found — has the web.cordova arch been built?`);
    return false;
  }

  try {
    copyTreeFiltered(sourceDir, targetDir, CAPACITOR_EXCLUDED_FILES);
  } catch (err) {
    logError(`Capacitor: failed to sync bundle files: ${err.message}`);
    return false;
  }

  return true;
}

/**
 * Convenience: run buildIndex + syncBundleFiles. Matches the
 * `buildMeteorAppCapacitorIndex` + `buildMeteorAppCapacitorFiles` pair from
 * meteor-capacitor.sh.
 *
 * @returns {boolean} True if both succeeded.
 */
export async function runCapacitorTransforms({ appDir = getMeteorAppDir(), webDir = resolveWebDir(), cordovaOutDir = null, verbose = false } = {}) {
  const okFiles = syncBundleFiles({ appDir, webDir, cordovaOutDir });
  const okIndex = await buildIndex({ appDir, webDir, cordovaOutDir });
  if (verbose && okFiles && okIndex) {
    const sourceDir = resolveCordovaOutDir({ appDir, cordovaOutDir });
    logInfo(`[i] Capacitor transform applied: ${path.relative(appDir, sourceDir)} → ${webDir}`);
  }
  return okFiles && okIndex;
}

export const _syncBundleFiles = syncBundleFiles;
