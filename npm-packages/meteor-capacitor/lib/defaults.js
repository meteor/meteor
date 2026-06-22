/**
 * @module defaults
 * @description Meteor-required and Meteor-recommended capacitor.config
 * defaults. Layered under the user's factory output via deepMerge, except
 * RESERVED_PATHS, which are re-enforced after the merge so Meteor can
 * guarantee the integration works.
 */

function toCordovaUrl(baseUrl) {
  try {
    const url = new URL(baseUrl);
    const basePath = url.pathname.replace(/\/$/, '');
    url.pathname = `${basePath}/__cordova/`;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch (_) {
    return baseUrl;
  }
}

function getDefaultServer(Meteor) {
  const defaults = {
    androidScheme: 'http',
    ...(
      Meteor.isRun || String(Meteor.rootUrl || '').startsWith('http://')
        ? { cleartext: true }
        : {}
    ),
  };

  if (Meteor.isBundled) return defaults;

  const baseUrl = Meteor.isLivereload && Meteor.rootUrl
    ? Meteor.rootUrl
    : `http://${Meteor.localIp}:${Meteor.port}`;
  const url = toCordovaUrl(baseUrl);
  return {
    ...defaults,
    url,
    ...(url.startsWith('http://') ? { cleartext: true } : {}),
  };
}

/**
 * @param {object} Meteor - the context object built by meteor-context.js
 * @returns {object} default capacitor.config fragment
 */
function getDefaults(Meteor) {
  const defaults = {
    bundledWebRuntime: false,
    webDir: Meteor.webDir,
    plugins: {
      SplashScreen: { launchAutoHide: true },
    },
  };

  const server = getDefaultServer(Meteor);
  if (server) {
    defaults.server = server;
  }

  return defaults;
}

/**
 * Top-level keys Meteor needs end-to-end control of. User values are
 * warned and ignored. Keep this list small; prefer deep-merge for
 * everything else.
 */
const RESERVED_PATHS = ['bundledWebRuntime'];

module.exports = { getDefaults, RESERVED_PATHS };
