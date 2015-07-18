import _ from 'underscore';
import { Console } from '../console.js';
import { PlatformList } from '../project-context.js';

export const AVAILABLE_PLATFORMS = PlatformList.DEFAULT_PLATFORMS.concat(
  ['android', 'ios']);

const PLATFORM_TO_DISPLAY_NAME_MAP = {
  'ios': 'iOS',
  'android': 'Android'
};

export function displayNameForPlatform(platform) {
  return PLATFORM_TO_DISPLAY_NAME_MAP[platform] || platform;
};

export function platformsForTargets(targets) {
  targets = _.uniq(targets);

  var platforms = [];
  // Find the platforms that correspond to the targets
  // ie. ["ios", "android", "ios-device"] will produce ["ios", "android"]
  _.each(targets, function (targetName) {
    var platform = targetName.split('-')[0];
    if (!_.contains(platforms, platform)) {
      platforms.push(platform);
    }
  });

  return platforms;
};

// Ensures that the Cordova platforms are synchronized with the app-level
// platforms.
export function ensureCordovaPlatformsAreSynchronized(cordovaProject, projectContext) {
  Console.debug('Ensuring that platforms in cordova build project are in sync');
  var platforms = projectContext.platformList.getCordovaPlatforms();
  var installedPlatforms = cordovaProject.getInstalledPlatforms();

  _.each(platforms, function (platform) {
    if (_.contains(installedPlatforms, platform))
      return;
    Console.debug(`The platform is not in the Cordova project: ${platform}'`);
    Console.debug(`Adding a platform: ${platform}`);
    Promise.await(cordovaProject.addPlatform(platform));
  });

  _.each(installedPlatforms, function (platform) {
    if (!_.contains(platforms, platform) &&
        _.contains(AVAILABLE_PLATFORMS, platform)) {
      Console.debug(`Removing a platform: ${platform}`);
      Promise.await(cordovaProject.removePlatform(platform));
    }
  });
};
