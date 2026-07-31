/**
 * @module constants
 * @description Shared constants for the Capacitor build plugin.
 */

import path from 'path';

const meteorConfig = typeof Plugin !== 'undefined' ? Plugin?.getMeteorConfig() : null;

const meteorLocalDirName = process.env.METEOR_LOCAL_DIR
  ? path.basename(process.env.METEOR_LOCAL_DIR.replace(/\\/g, '/'))
  : '';

/**
 * Build context root. Resolution: meteor.buildContext >
 * RSPACK_BUILD_CONTEXT > CAPACITOR_BUILD_CONTEXT > `_build[-<localDir>]`.
 */
export const CAPACITOR_BUILD_CONTEXT =
  meteorConfig?.buildContext ||
  process.env.RSPACK_BUILD_CONTEXT ||
  process.env.CAPACITOR_BUILD_CONTEXT ||
  `_build${(meteorLocalDirName && `-${meteorLocalDirName}`) || ''}`;

process.env.CAPACITOR_BUILD_CONTEXT = CAPACITOR_BUILD_CONTEXT;

/**
 * Capacitor webDir per env. Honors METEOR_CAPACITOR_WEB_DIR.
 * @param {{ isDevelopment?: boolean, isProduction?: boolean }} [env]
 * @returns {string}
 */
export function getCapacitorWebDir({ isDevelopment, isProduction } = {}) {
  if (process.env.METEOR_CAPACITOR_WEB_DIR) {
    return process.env.METEOR_CAPACITOR_WEB_DIR;
  }
  const suffix = isDevelopment ? 'dev' : isProduction ? 'prod' : 'dev';
  return `${CAPACITOR_BUILD_CONTEXT}/native-${suffix}`;
}

/**
 * All possible capacitor webDir paths (both env defaults + override).
 * Used to feed setMeteorAppIgnore covering dev↔prod switches.
 * @returns {string[]}
 */
export function getCapacitorWebDirCandidates() {
  return Array.from(new Set([
    `${CAPACITOR_BUILD_CONTEXT}/native-dev`,
    `${CAPACITOR_BUILD_CONTEXT}/native-prod`,
    ...(process.env.METEOR_CAPACITOR_WEB_DIR ? [process.env.METEOR_CAPACITOR_WEB_DIR] : []),
  ]));
}

/**
 * Path to Meteor's web.cordova build output. Honors METEOR_LOCAL_DIR (the
 * env var Meteor itself uses to relocate `.meteor/local`); defaults to the
 * standard `.meteor/local` location when unset.
 */
export const CAPACITOR_CORDOVA_OUTPUT_DIR = `${
  process.env.METEOR_LOCAL_DIR || '.meteor/local'
}/build/programs/web.cordova`;

export const CAPACITOR_PLATFORMS = ['android', 'ios'];

export function getCapacitorIgnoreCandidates() {
  return Array.from(new Set([
    ...getCapacitorWebDirCandidates(),
    ...CAPACITOR_PLATFORMS,
  ]));
}

export const DEFAULT_CAPACITOR_VERSION = '7.4.3';
export const DEFAULT_METEOR_CAPACITOR_VERSION = '0.2.0-alpha.1';

export const GLOBAL_STATE_KEYS = {
  CAPACITOR_INSTALLATION_CHECKED: 'capacitor.installationChecked',
  CAPACITOR_BUILD_CONTEXT_PREPARED: 'capacitor.buildContextPrepared',
  CAPACITOR_CONFIG_SCAFFOLDED: 'capacitor.configScaffolded',
};

/**
 * Inline source of the WebAppLocalServer compatibility shim injected after <head>.
 * Capacitor doesn't ship Cordova's WebAppLocalServer plugin; without this stub
 * Meteor's Cordova bundle throws at boot. In direct-server livereload mode,
 * this shim also emits a synthetic update-ready signal so web.cordova clients
 * still hard-reload when a client bundle version changes.
 */
export const WEB_APP_LOCAL_SERVER_SHIM = [
  '<script type="text/javascript">',
  'var WebAppLocalServer = (function () {',
  '  var newVersionReadyCallbacks = [];',
  '  function emitNewVersionReady() {',
  '    newVersionReadyCallbacks.slice().forEach(function (callback) {',
  '      callback("direct-server");',
  '    });',
  '  }',
  '  return {',
  '    onError() {},',
  '    onNewVersionReady(callback) {',
  '      if (typeof callback === "function") {',
  '        newVersionReadyCallbacks.push(callback);',
  '      }',
  '    },',
  '    startupDidComplete(callback) {',
  '      if (typeof callback === "function") callback();',
  '    },',
  '    switchToPendingVersion(callback) {',
  '      if (typeof callback === "function") callback();',
  '    },',
  '    checkForUpdates(callback) {',
  '      if (typeof callback === "function") callback();',
  '      setTimeout(emitNewVersionReady, 0);',
  '    }',
  '  };',
  '}());',
  '</script>',
].join('');

export const WEB_APP_LOCAL_SERVER_BUNDLED_SHIM = [
  '<script type="text/javascript">',
  'var WebAppLocalServer = (function () {',
  '  var newVersionReadyCallbacks = [];',
  '  return {',
  '    onError() {},',
  '    onNewVersionReady(callback) {',
  '      if (typeof callback === "function") {',
  '        newVersionReadyCallbacks.push(callback);',
  '      }',
  '    },',
  '    startupDidComplete(callback) {',
  '      if (typeof callback === "function") callback();',
  '    },',
  '    switchToPendingVersion(callback) {',
  '      if (typeof callback === "function") callback();',
  '    },',
  '    checkForUpdates(callback) {',
  '      if (typeof callback === "function") callback();',
  '    }',
  '  };',
  '}());',
  '</script>',
].join('');

export const CORDOVA_JS_STUB = `;(function () {
  window.$RefreshReg$ = window.$RefreshReg$ || function () {};
  window.$RefreshSig$ = window.$RefreshSig$ || function () {
    return function (type) { return type; };
  };
  window.cordova = window.cordova || {};
  window.cordova.platformId = window.Capacitor && window.Capacitor.getPlatform ? window.Capacitor.getPlatform() : "capacitor";
  window.cordova.plugins = window.cordova.plugins || {};
  window.cordova.exec = window.cordova.exec || function () {};
  window.cordova.require = window.cordova.require || function () { return {}; };
  function emitDeviceReady() {
    document.dispatchEvent(new Event("deviceready"));
  }
  document.addEventListener("DOMContentLoaded", function () {
    setTimeout(emitDeviceReady, 0);
  }, false);
  window.addEventListener("load", function () {
    setTimeout(emitDeviceReady, 0);
  }, false);
  setTimeout(emitDeviceReady, 50);
  setTimeout(emitDeviceReady, 250);
}());`;

/**
 * Bridge Cordova's WebAppLocalServer API onto @meteorjs/capacitor's native HCP
 * plugin so initial bundled assets and downloaded HCP assets expose the same
 * API.
 */
export const CAPACITOR_WEB_APP_LOCAL_SERVER_BRIDGE = `<script type="text/javascript">(function() { if (window.WebAppLocalServer) return; var _P; function getPlugin() { if (!_P) _P = ((window.Capacitor || {}).Plugins || {}).CapacitorMeteorWebApp; if (!_P) console.warn("WebAppLocalServer shim: CapacitorMeteorWebApp plugin not available"); return _P; } window.WebAppLocalServer = { startupDidComplete(callback) { var P = getPlugin(); if (!P) return; P.startupDidComplete().then(function() { if (callback) callback(); }).catch(function(error) { console.error("WebAppLocalServer.startupDidComplete() failed:", error); }); }, checkForUpdates(callback) { var P = getPlugin(); if (!P) return; P.checkForUpdates().then(function() { if (callback) callback(); }).catch(function(error) { console.error("WebAppLocalServer.checkForUpdates() failed:", error); }); }, onNewVersionReady(callback) { var P = getPlugin(); if (!P) return; P.addListener("updateAvailable", function(event) { callback(event.version); }); }, switchToPendingVersion(callback, errorCallback) { var P = getPlugin(); if (!P) return; P.reload().then(function() { if (callback) callback(); }).catch(function(error) { console.error("switchToPendingVersion failed:", error); if (typeof errorCallback === "function") errorCallback(error); }); }, onError(callback) { var P = getPlugin(); if (!P) return; P.addListener("error", function(event) { var error = new Error(event.message || "Unknown CapacitorMeteorWebApp error"); callback(error); }); }, localFileSystemUrl(_fileUrl) { throw new Error("Local filesystem URLs not supported by Capacitor"); } }; })();</script>`;

/**
 * Files emitted in web.cordova/ that must NOT be copied into the Capacitor
 * webDir. HCP webapp mode ships program.json because the native runtime reads
 * it as the initial bundle manifest.
 */
export function getCapacitorExcludedFiles(hcpMode = 'none') {
  const excluded = ['body.html', 'head.html'];
  return hcpMode === 'webapp' ? excluded : ['program.json', ...excluded];
}
