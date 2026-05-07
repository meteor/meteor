/**
 * @module defaults
 * @description Meteor-required and Meteor-recommended capacitor.config
 * defaults. Layered under the user's factory output via deepMerge, except
 * RESERVED_PATHS, which are re-enforced after the merge so Meteor can
 * guarantee the integration works.
 */

/**
 * @param {object} Meteor - the context object built by meteor-context.js
 * @returns {object} default capacitor.config fragment
 */
function getDefaults(Meteor) {
  return {
    bundledWebRuntime: false,
    webDir: Meteor.webDir,
    plugins: {
      SplashScreen: { launchAutoHide: true },
    },
  };
}

/**
 * Top-level keys Meteor needs end-to-end control of. User values are
 * warned and ignored. Keep this list small; prefer deep-merge for
 * everything else.
 */
const RESERVED_PATHS = ['bundledWebRuntime'];

module.exports = { getDefaults, RESERVED_PATHS };
