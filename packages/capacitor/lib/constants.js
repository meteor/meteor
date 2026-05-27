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

export const DEFAULT_CAPACITOR_VERSION = '7.4.3';
export const DEFAULT_METEOR_CAPACITOR_VERSION = '0.1.0-alpha.0';

export const GLOBAL_STATE_KEYS = {
  CAPACITOR_INSTALLATION_CHECKED: 'capacitor.installationChecked',
  CAPACITOR_BUILD_CONTEXT_PREPARED: 'capacitor.buildContextPrepared',
  CAPACITOR_CONFIG_SCAFFOLDED: 'capacitor.configScaffolded',
};

/**
 * Inline source of the WebAppLocalServer no-op shim injected after <head>.
 * Capacitor doesn't ship Cordova's WebAppLocalServer plugin; without this stub
 * Meteor's Cordova bundle throws at boot.
 */
export const WEB_APP_LOCAL_SERVER_SHIM = `<script type="text/javascript">var WebAppLocalServer = { onError() {}, onNewVersionReady() {}, startupDidComplete() {}, switchToPendingVersion() {}, checkForUpdates() {} };</script>`;

/**
 * Files emitted in web.cordova/ that must NOT be copied into the Capacitor
 * webDir (they are Meteor server-side artefacts).
 */
export const CAPACITOR_EXCLUDED_FILES = ['program.json', 'body.html', 'head.html'];
