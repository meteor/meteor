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
} from 'meteor/tools-core/lib/meteor';

export { CAPACITOR_PLATFORMS } from './constants';

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
  return isMeteorAppBuild();
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
