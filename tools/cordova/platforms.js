import _ from 'underscore';
import main from '../cli/main.js';
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

// Filter out unsupported Cordova platforms, and exit if platform hasn't been
// added to the project yet
export function checkCordovaPlatforms(projectContext, platforms) {
  var cordovaPlatformsInProject = projectContext.platformList.getCordovaPlatforms();
  return _.filter(platforms, function (platform) {
    var inProject = _.contains(cordovaPlatformsInProject, platform);

    if (platform === 'ios' && process.platform !== 'darwin') {
      Console.warn("Currently, it is only possible to build iOS apps on an OS X system.");
      return false;
    }

    if (!inProject) {
      Console.warn("Please add the " + displayNameForPlatform(platform) +
                   " platform to your project first.");
      Console.info("Run: " + Console.command("meteor add-platform " + platform));
      throw new main.ExitWithCode(2);
    }

    return true;
  });
}
