/**
 * @meteorjs/capacitor
 *
 * `defineConfig` accepts a factory `(Meteor) => config` where `Meteor` is a
 * typed flag object the consumer uses to switch the `server` block per
 * environment.
 *
 * Layering (later wins, except for RESERVED_PATHS):
 *   1. Meteor defaults from getDefaults(Meteor)               (lib/defaults.js)
 *   2. User config returned by the factory
 *   3. Re-enforce RESERVED_PATHS (Meteor needs end-to-end control over them)
 *
 * Nested objects (plugins, ios, android, server, …) are deep-merged via
 * lib/merge.js, so users can add their own `plugins.Camera` block without
 * losing Meteor's `plugins.SplashScreen` defaults.
 *
 * The `Meteor` flags are populated from process.env, which the Meteor
 * `capacitor` build plugin sets before spawning the Capacitor CLI. When
 * `cap` is invoked standalone, the flags fall back to NODE_ENV. See
 * lib/meteor-context.js.
 */

const { buildMeteorContext } = require('./lib/meteor-context');
const { deepMerge } = require('./lib/merge');
const {
  appendUserAgentToken,
  getDefaults,
  RESERVED_PATHS,
} = require('./lib/defaults');

const MeteorWebAppError = Object.freeze({
  DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  BLACKLISTED_VERSION: 'BLACKLISTED_VERSION',
  STARTUP_TIMEOUT: 'STARTUP_TIMEOUT',
  FILE_SYSTEM_ERROR: 'FILE_SYSTEM_ERROR',
});

function createWebFallbackPlugin() {
  return {
    async startupDidComplete() {},
    async checkForUpdates() {},
    async getCurrentVersion() {
      return { version: 'web' };
    },
    async isUpdateAvailable() {
      return { available: false };
    },
    async reload() {
      if (typeof window !== 'undefined' && window.location) {
        window.location.reload();
      }
    },
    async addListener() {
      return { remove() {} };
    },
    async removeAllListeners() {},
  };
}

function createCapacitorMeteorWebApp() {
  const fallback = createWebFallbackPlugin();
  try {
    const { registerPlugin } = require('@capacitor/core');
    return registerPlugin('CapacitorMeteorWebApp', {
      web: () => Promise.resolve(fallback),
    });
  } catch (_) {
    return fallback;
  }
}

const CapacitorMeteorWebApp = createCapacitorMeteorWebApp();

function defineConfig(input) {
  const Meteor = buildMeteorContext();
  const userConfig = typeof input === 'function' ? input(Meteor) : input;
  if (!userConfig || typeof userConfig !== 'object') {
    throw new Error('@meteorjs/capacitor: defineConfig must return an object');
  }

  const defaults = getDefaults(Meteor);
  const merged = deepMerge(defaults, userConfig);

  for (const key of RESERVED_PATHS) {
    if (key in userConfig && userConfig[key] !== defaults[key]) {
      console.warn(`[@meteorjs/capacitor] "${key}" is reserved for Meteor integration; user value ignored.`);
    }
    merged[key] = defaults[key];
  }

  if (Meteor.isLivereload) {
    merged.appendUserAgent = appendUserAgentToken(merged.appendUserAgent);
  }

  // Drop a falsy `server` so Capacitor falls back to webDir.
  if (!merged.server) {
    delete merged.server;
  }

  return merged;
}

async function bootCapacitor({
  hideSplash = true,
  defineCustomElements: doDefineCustomElements = true,
  hcpAutoReload = true,
} = {}) {
  let Capacitor;
  try {
    ({ Capacitor } = require('@capacitor/core'));
  } catch (_) {
    return;
  }

  if (!Capacitor?.isNativePlatform?.()) {
    return;
  }

  const hcpAvailable = typeof Capacitor.isPluginAvailable === 'function'
    ? Capacitor.isPluginAvailable('CapacitorMeteorWebApp')
    : true;

  if (hcpAvailable && hcpAutoReload) {
    try {
      await CapacitorMeteorWebApp.addListener('updateAvailable', () => {
        void CapacitorMeteorWebApp.reload();
      });
    } catch (err) {
      console.warn('[bootCapacitor] failed to register updateAvailable listener:', err);
    }
  }

  if (hcpAvailable) {
    await Promise.resolve();
    try {
      await CapacitorMeteorWebApp.startupDidComplete();
    } catch (err) {
      console.warn('[bootCapacitor] startupDidComplete failed:', err);
    }
  }

  if (hideSplash) {
    try {
      require('@capacitor/splash-screen').SplashScreen.hide();
    } catch (_) {}
  }

  if (doDefineCustomElements && typeof window !== 'undefined') {
    try {
      require('@ionic/pwa-elements/loader').defineCustomElements(window);
    } catch (_) {}
  }
}

module.exports = defineConfig;
module.exports.defineConfig = defineConfig;
module.exports.CapacitorMeteorWebApp = CapacitorMeteorWebApp;
module.exports.MeteorWebAppError = MeteorWebAppError;
module.exports.bootCapacitor = bootCapacitor;
