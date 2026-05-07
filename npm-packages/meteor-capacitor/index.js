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
const { getDefaults, RESERVED_PATHS } = require('./lib/defaults');

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

  // Drop a falsy `server` so Capacitor falls back to webDir.
  if (!merged.server) {
    delete merged.server;
  }

  return merged;
}

module.exports = defineConfig;
module.exports.defineConfig = defineConfig;
