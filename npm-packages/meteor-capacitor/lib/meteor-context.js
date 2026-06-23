/**
 * @module meteor-context
 * @description Builds the `Meteor` flag object handed to the user's
 * defineConfig factory. Reads process.env (set by the Meteor `capacitor`
 * build plugin) and falls back to NODE_ENV / sensible defaults when `cap`
 * is invoked standalone (no Meteor in the loop).
 */

function asBool(name) {
  return process.env[name] === 'true';
}

function detectMode() {
  const explicit = process.env.METEOR_CAPACITOR_MODE;
  if (explicit === 'livereload') return 'livereload';
  if (explicit === 'development') return 'livereload';
  if (explicit === 'bundled') return 'bundled';
  if (asBool('METEOR_CAPACITOR_LIVERELOAD')) return 'livereload';
  if (process.env.NODE_ENV === 'production') return 'bundled';
  return 'bundled';
}

function detectLocalIp() {
  const explicit = process.env.METEOR_CAPACITOR_LOCAL_IP;
  if (explicit) return explicit;
  try {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const info of interfaces[name] || []) {
        if (info.family === 'IPv4' && !info.internal) return info.address;
      }
    }
  } catch (_) {}
  return '127.0.0.1';
}

/**
 * Builds the typed flag object handed to the user's defineConfig factory.
 * Includes env state (isDevelopment / isProduction / isDebug / ...),
 * command flags (isRun / isBuild), platform flags (isNativeAndroid /
 * isNativeIos), and Capacitor-mode connection details (mode, rootUrl,
 * localIp, port, isLivereload).
 */
function buildMeteorContext() {
  const mode = detectMode();
  const isProduction = process.env.NODE_ENV === 'production' || mode === 'bundled';
  const isDevelopment = !isProduction;
  const platform = process.env.METEOR_CAPACITOR_PLATFORM || ''; // 'android' | 'ios' | ''
  const isNativeAndroid = asBool('METEOR_NATIVE_ANDROID') || platform === 'android';
  const isNativeIos = asBool('METEOR_NATIVE_IOS') || platform === 'ios';

  // buildContext resolution: METEOR_BUILD_CONTEXT > RSPACK_BUILD_CONTEXT
  // > CAPACITOR_BUILD_CONTEXT > '_build'. webDir is a per-env subfolder
  // underneath it so dev and prod outputs don't clobber each other.
  const buildContext =
    process.env.METEOR_BUILD_CONTEXT ||
    process.env.RSPACK_BUILD_CONTEXT ||
    process.env.CAPACITOR_BUILD_CONTEXT ||
    '_build';
  const webDir =
    process.env.METEOR_CAPACITOR_WEB_DIR ||
    `${buildContext}/native-${isDevelopment ? 'dev' : 'prod'}`;

  return {
    // env flags
    isDevelopment,
    isProduction,
    isDebug: asBool('METEOR_DEBUG'),
    isVerbose: asBool('METEOR_VERBOSE'),
    // command flags
    isRun: asBool('METEOR_RUN'),
    isBuild: asBool('METEOR_BUILD'),
    // platform flags
    isCapacitor: true,
    isNative: true,
    isNativeAndroid,
    isNativeIos,
    platform: platform || (isNativeAndroid ? 'android' : isNativeIos ? 'ios' : ''),
    // capacitor-mode + connection details
    mode,
    isLivereload: mode === 'livereload',
    isBundled: mode === 'bundled',
    rootUrl: process.env.ROOT_URL || '',
    localIp: detectLocalIp(),
    port: process.env.PORT || '3000',
    // build context paths
    buildContext,
    webDir,
  };
}

module.exports = { buildMeteorContext };
