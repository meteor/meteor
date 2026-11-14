/**
 * @module command
 * @description Predicates that detect which Meteor command is running and
 * decide whether each branch in capacitor_plugin.js should fire. The plugin
 * only activates when the `capacitor` package is added AND the current
 * command is one we handle.
 */

import {
  isMeteorAppRun,
  isMeteorAppBuild,
  isMeteorAppAddPlatform,
  isMeteorAppNative,
  getMeteorAppPlatforms,
} from 'meteor/tools-core/lib/meteor';

import { CAPACITOR_PLATFORMS } from './constants';
export { CAPACITOR_PLATFORMS };

/**
 * `meteor run android|ios|*-device`: Cordova runner is bypassed via
 * METEOR_CORDOVA_DISABLE, reusing the existing positional args.
 */
export function isCapacitorRunOptIn() {
  return isMeteorAppRun() && isMeteorAppNative();
}

/**
 * `meteor build`: web.cordova arch is emitted whenever android/ios are
 * listed in .meteor/platforms.
 */
export function isCapacitorBuildOptIn() {
  const command = Package?.meteor?.global?.currentCommand || {};
  const options = command.options || {};
  if (!isMeteorAppBuild() || command.name !== 'build' || options['server-only'] || options._bundleOnly) {
    return false;
  }
  const platforms = options.platforms
    ? String(options.platforms).split(',')
    : getMeteorAppPlatforms();
  return platforms.some(platform => CAPACITOR_PLATFORMS.includes(platform.replace(/^capacitor:/, '')));
}

/**
 * `meteor add-platform android|ios`: the CLI triggers a compile on the
 * capacitor branch so this build plugin loads and runs `npx cap add`
 * against the requested platforms.
 */
export function isCapacitorAddPlatformOptIn() {
  return isMeteorAppAddPlatform();
}

export function isCapacitorOptIn() {
  return (
    isCapacitorRunOptIn() ||
    isCapacitorBuildOptIn() ||
    isCapacitorAddPlatformOptIn()
  );
}
