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
  CAPACITOR_WEB_APP_LOCAL_SERVER_BRIDGE,
  WEB_APP_LOCAL_SERVER_SHIM,
  getCapacitorExcludedFiles,
  getCapacitorWebDir,
} = require('./constants');
const { getCapacitorHcpMode } = require('./hcp');
const {
  normalizeWebProgramAssetUrls,
  normalizeWebProgramVersions,
} = require('./web-program');

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
  if (process.env.MOBILE_ROOT_URL) return process.env.MOBILE_ROOT_URL;
  if (process.env.ROOT_URL) return process.env.ROOT_URL;
  return `http://${detectLocalIp()}:${getMeteorAppPort()}/`;
}

function resolveRootUrlPathPrefix(rootUrl) {
  try {
    const pathname = new URL(rootUrl).pathname || '';
    return pathname.replace(/\/$/, '') || '';
  } catch (_) {
    return '';
  }
}

function readMeteorAppIdentifier({ appDir = getMeteorAppDir(), env = process.env } = {}) {
  if (env.APP_ID) {
    return env.APP_ID;
  }

  const identifierPath = path.join(appDir, '.meteor', '.id');
  try {
    const id = fs.readFileSync(identifierPath, 'utf8')
      .split(/\r?\n/)
      .map(line => line.replace(/#.*/, '').trim())
      .find(Boolean);

    if (id) {
      return id;
    }
  } catch {
    // The file is created by Meteor project context. Fall through for tests or
    // nonstandard app layouts.
  }

  return env.METEOR_APP_ID || 'meteor-app';
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
export function patchCordovaIndexHtml(html, { hcpMode = getCapacitorHcpMode() } = {}) {
  if (typeof html !== 'string' || !html) {
    return html;
  }

  let out = html;

  if (hcpMode === 'webapp' && !out.includes('window.WebAppLocalServer')) {
    out = out.replace(/<head>/i, `<head>\n  ${CAPACITOR_WEB_APP_LOCAL_SERVER_BRIDGE}`);
  } else if (hcpMode !== 'webapp' && !out.includes('var WebAppLocalServer')) {
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
async function buildIndex({ appDir = getMeteorAppDir(), webDir = resolveWebDir(), cordovaOutDir = null, hcpMode = getCapacitorHcpMode() } = {}) {
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
  const rootUrlPathPrefix = resolveRootUrlPathPrefix(rootUrl);
  let runtimeConfig = {
    meteorRelease: 'none',
    ROOT_URL: rootUrl,
    ROOT_URL_PATH_PREFIX: rootUrlPathPrefix,
    DDP_DEFAULT_CONNECTION_URL:
      process.env.MOBILE_DDP_URL ||
      process.env.DDP_DEFAULT_CONNECTION_URL ||
      rootUrl,
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
    appId: readMeteorAppIdentifier({ appDir }),
    meteorEnv: {
      NODE_ENV: process.env.NODE_ENV || 'development',
      TEST_METADATA: process.env.TEST_METADATA || '{}',
    },
  };
  // Match tools/cordova/builder.js and packages/webapp/webapp_server.js:
  // client HCP hashes include PUBLIC_SETTINGS overrides, not the full runtime
  // config generated for the page.
  program = normalizeWebProgramAssetUrls(program, { stripPrefix: '/__cordova/' });
  program = normalizeWebProgramVersions(program, {});
  runtimeConfig = {
    ...runtimeConfig,
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

  const patched = patchCordovaIndexHtml(html, { hcpMode });

  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, patched, 'utf8');
    if (hcpMode === 'webapp') {
      writeJsonFileReplacing(path.join(appDir, webDir, 'program.json'), program);
    }
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
function syncBundleFiles({ appDir = getMeteorAppDir(), webDir = resolveWebDir(), cordovaOutDir = null, hcpMode = getCapacitorHcpMode() } = {}) {
  const sourceDir = resolveCordovaOutDir({ appDir, cordovaOutDir });
  const targetDir = path.join(appDir, webDir);
  const excludedFiles = getCapacitorExcludedFiles(hcpMode);

  if (!fs.existsSync(sourceDir)) {
    logError(`Capacitor: ${path.relative(appDir, sourceDir)} not found — has the web.cordova arch been built?`);
    return false;
  }

  try {
    copyTreeFiltered(sourceDir, targetDir, excludedFiles);
    if (hcpMode === 'webapp') {
      normalizeCopiedProgramJson({ targetDir });
    }
  } catch (err) {
    logError(`Capacitor: failed to sync bundle files: ${err.message}`);
    return false;
  }

  return true;
}

function normalizeCopiedProgramJson({ targetDir }) {
  const programPath = path.join(targetDir, 'program.json');
  if (!fs.existsSync(programPath)) return;

  const program = JSON.parse(fs.readFileSync(programPath, 'utf8'));
  const normalized = normalizeWebProgramVersions(
    normalizeWebProgramAssetUrls(program, { stripPrefix: '/__cordova/' })
  );
  writeJsonFileReplacing(programPath, normalized);
}

function writeJsonFileReplacing(filePath, data) {
  fs.rmSync(filePath, { force: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Convenience: run buildIndex + syncBundleFiles. Matches the
 * `buildMeteorAppCapacitorIndex` + `buildMeteorAppCapacitorFiles` pair from
 * meteor-capacitor.sh.
 *
 * @returns {boolean} True if both succeeded.
 */
export async function runCapacitorTransforms({ appDir = getMeteorAppDir(), webDir = resolveWebDir(), cordovaOutDir = null, verbose = false, hcpMode = getCapacitorHcpMode() } = {}) {
  const okFiles = syncBundleFiles({ appDir, webDir, cordovaOutDir, hcpMode });
  const okIndex = await buildIndex({ appDir, webDir, cordovaOutDir, hcpMode });
  if (verbose && okFiles && okIndex) {
    const sourceDir = resolveCordovaOutDir({ appDir, cordovaOutDir });
    logInfo(`[i] Capacitor transform applied: ${path.relative(appDir, sourceDir)} → ${webDir}`);
  }
  return okFiles && okIndex;
}

export const _syncBundleFiles = syncBundleFiles;
export const _readMeteorAppIdentifier = readMeteorAppIdentifier;
