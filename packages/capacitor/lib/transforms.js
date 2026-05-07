/**
 * @module transforms
 * @description Transforms Meteor's web.cordova/ output into a Capacitor webDir.
 *
 * Two pure operations, no network and no shell:
 *   - buildIndex(): patch index.html (inject WebAppLocalServer no-op, strip __cordova/)
 *   - syncBundleFiles(): copy assets, drop server-only files, flatten app/* upward
 *
 * Doing the transform in Node means the same logic runs in `meteor build`,
 * `meteor run android|ios`, and the watcher on top of it.
 */

const fs = require('fs');
const path = require('path');

const { logError, logInfo } = require('meteor/tools-core/lib/log');
const {
  getMeteorAppDir,
  isMeteorAppDevelopment,
  isMeteorAppProduction,
} = require('meteor/tools-core/lib/meteor');

const {
  CAPACITOR_CORDOVA_OUTPUT_DIR,
  CAPACITOR_EXCLUDED_FILES,
  WEB_APP_LOCAL_SERVER_SHIM,
  getCapacitorWebDir,
} = require('./constants');

function resolveWebDir() {
  return getCapacitorWebDir({
    isDevelopment: isMeteorAppDevelopment(),
    isProduction: isMeteorAppProduction(),
  });
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
 * Reads index.html from web.cordova/, applies patchCordovaIndexHtml, writes it
 * into build-native/index.html.
 *
 * @returns {boolean} True if the file was written.
 */
function buildIndex({ appDir = getMeteorAppDir(), webDir = resolveWebDir() } = {}) {
  const sourcePath = path.join(appDir, CAPACITOR_CORDOVA_OUTPUT_DIR, 'index.html');
  const targetPath = path.join(appDir, webDir, 'index.html');

  if (!fs.existsSync(sourcePath)) {
    logError(`Capacitor: ${path.relative(appDir, sourcePath)} not found — has the web.cordova arch been built?`);
    return false;
  }

  let html;
  try {
    html = fs.readFileSync(sourcePath, 'utf8');
  } catch (err) {
    logError(`Capacitor: failed to read ${sourcePath}: ${err.message}`);
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
      fs.copyFileSync(srcPath, dstPath);
    } else if (entry.isSymbolicLink()) {
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
 * Copies web.cordova/ → build-native/ minus excluded server-only files,
 * then flattens build-native/app/* up to build-native/ (Meteor places client
 * sources under app/ inside the cordova program).
 *
 * @returns {boolean}
 */
function syncBundleFiles({ appDir = getMeteorAppDir(), webDir = resolveWebDir() } = {}) {
  const sourceDir = path.join(appDir, CAPACITOR_CORDOVA_OUTPUT_DIR);
  const targetDir = path.join(appDir, webDir);

  if (!fs.existsSync(sourceDir)) {
    logError(`Capacitor: ${path.relative(appDir, sourceDir)} not found — has the web.cordova arch been built?`);
    return false;
  }

  try {
    copyTreeFiltered(sourceDir, targetDir, CAPACITOR_EXCLUDED_FILES);

    const appNested = path.join(targetDir, 'app');
    if (fs.existsSync(appNested) && fs.statSync(appNested).isDirectory()) {
      copyTreeFiltered(appNested, targetDir, CAPACITOR_EXCLUDED_FILES);
      fs.rmSync(appNested, { recursive: true, force: true });
    }
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
export function runCapacitorTransforms({ appDir = getMeteorAppDir(), webDir = resolveWebDir(), verbose = false } = {}) {
  const okFiles = syncBundleFiles({ appDir, webDir });
  const okIndex = buildIndex({ appDir, webDir });
  if (verbose && okFiles && okIndex) {
    logInfo(`[i] Capacitor transform applied: ${CAPACITOR_CORDOVA_OUTPUT_DIR} → ${webDir}`);
  }
  return okFiles && okIndex;
}
