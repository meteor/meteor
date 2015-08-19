import _ from 'underscore';

export const CORDOVA_ARCH = "web.cordova";

export const AVAILABLE_PLATFORMS = ['ios', 'android'];

const PLATFORM_TO_DISPLAY_NAME_MAP = {
  'ios': 'iOS',
  'android': 'Android'
};

export function displayNameForPlatform(platform) {
  return PLATFORM_TO_DISPLAY_NAME_MAP[platform] || platform;
};

export function displayNamesForPlatforms(platforms) {
  return platforms.map((platform) =>
    displayNameForPlatform(platform)).join(', ');
}

// This filters the Cordova platforms from a list of app-level platforms.
// Right now, the only other platforms are the default browser and server
// platforms.
export function filterPlatforms(platforms) {
  return _.intersection(platforms, AVAILABLE_PLATFORMS);
}

export function splitPluginsAndPackages(packages) {
  let result = {
    plugins: [],
    packages: []
  };

  for (package of packages) {
    const [namespace, ...rest] = package.split(':');
    if (namespace === 'cordova') {
      const name = rest.join(':');
      result.plugins.push(name);
    } else {
      result.packages.push(package);
    }
  }

  return result;
}

// Returns the cordovaDependencies of the Cordova arch from a star manifest.
export function pluginsFromStarManifest(star) {
  var cordovaProgram = _.findWhere(star.programs, { arch: CORDOVA_ARCH });
  return cordovaProgram ? cordovaProgram.cordovaDependencies : {};
}
