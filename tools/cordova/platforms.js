import _ from 'underscore';
import chalk from 'chalk';
import main from '../cli/main.js';
import { Console } from '../console.js';
import { ProjectContext, PlatformList } from '../project-context.js';
import buildmessage from '../buildmessage.js';

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
export function ensureCordovaPlatformsAreSynchronized(cordovaProject, platforms) {
  // Filter out the default platforms, leaving the Cordova platforms
  platforms = _.difference(platforms, PlatformList.DEFAULT_PLATFORMS);
  const installedPlatforms = cordovaProject.getInstalledPlatforms();

  for (platform of platforms) {
    if (_.contains(installedPlatforms, platform)) continue;

    buildmessage.enterJob(`Adding platform: ${platform}`, () => {
      Promise.await(cordovaProject.addPlatform(platform));
    });
  }

  for (platform of installedPlatforms) {
    if (!_.contains(platforms, platform) &&
        _.contains(AVAILABLE_PLATFORMS, platform)) {
      buildmessage.enterJob(`Removing platform: ${platform}`, () => {
        Promise.await(cordovaProject.removePlatform(platform));
      });
    }
  }
};

export function checkPlatformRequirements(cordovaProject, platform) {
  const requirements = Promise.await(cordovaProject.checkRequirements([platform]));
  let platformRequirements = requirements[platform];

  if (!platformRequirements) {
    Console.warn("Could not check platform requirements");
    return;
  }

  // We don't use ios-deploy, but open Xcode to run on a device instead
  platformRequirements = _.reject(platformRequirements, requirement => requirement.id === 'ios-deploy');

  const satisifed = _.every(platformRequirements, requirement => requirement.installed);

  if (!satisifed) {
    Console.info(`Make sure all installation requirements are satisfied
  before running or building for ${displayNameForPlatform(platform)}:`);
    for (requirement of platformRequirements) {
      const name = requirement.name;
      if (requirement.installed) {
        Console.success(name);
      } else {
        const reason = requirement.metadata && requirement.metadata.reason;
        if (reason) {
          Console.failInfo(`${name}: ${reason}`);
        } else {
          Console.failInfo(name);
        }
      }
    }
  }

  return satisifed;
}

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
