import _ from 'underscore';
import assert from 'assert';
import utils from '../utils/utils.js';
import buildmessage from '../utils/buildmessage.js';
import {
  pathJoin,
  statOrNull,
  getDevBundle,
  rm_recursive,
} from '../fs/files';

export const CORDOVA_ARCH = "web.cordova";

export const CORDOVA_PLATFORMS = ['ios', 'android'];

const CORDOVA_ANDROID_VERSION = "12.0.1";

export const CORDOVA_DEV_BUNDLE_VERSIONS = {
  'cordova-lib': '10.0.0',
  'cordova-common': '4.0.2',
  'cordova-create': '2.0.0',
  'cordova-registry-mapper': '1.1.15',
  'cordova-android': CORDOVA_ANDROID_VERSION,
};

export const CORDOVA_PLATFORM_VERSIONS = {
  'android': CORDOVA_ANDROID_VERSION,
  'ios': '7.0.1',
};

export const SWIFT_VERSION = 5;

const PLATFORM_TO_DISPLAY_NAME_MAP = {
  'ios': 'iOS',
  'android': 'Android'
};

export function ensureDevBundleDependencies() {
  buildmessage.enterJob(
    {
      title: 'Installing Cordova in Meteor tool',
    },
    () => {
      require("../cli/dev-bundle-helpers.js")
        .ensureDependencies(CORDOVA_DEV_BUNDLE_VERSIONS);

      const cordovaNodeModulesDir = pathJoin(
        getDevBundle(),
        "lib",
        "node_modules",
        "cordova-lib",
        "node_modules",
      );

      [
        // Remove these bundled packages in preference to
        // dev_bundle/lib/node_modules/<package name>:
        "graceful-fs",
        pathJoin("npm", "node_modules", "graceful-fs"),
      ].forEach(pkg => {
        const path = pathJoin(cordovaNodeModulesDir, pkg);
        const stat = statOrNull(path);
        if (stat && stat.isDirectory()) {
          rm_recursive(path);
        }
      });
    }
  );
}

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
  return _.intersection(platforms, CORDOVA_PLATFORMS);
}

export function splitPluginsAndPackages(packages) {
  let result = {
    plugins: [],
    packages: []
  };

  for (let pkg of packages) {
    const [namespace, ...rest] = pkg.split(':');
    if (namespace === 'cordova') {
      const name = rest.join(':');
      result.plugins.push(name);
    } else {
      result.packages.push(pkg);
    }
  }

  return result;
}

// Returns the cordovaDependencies of the Cordova arch from a star manifest.
export function pluginVersionsFromStarManifest(star) {
  var cordovaProgram = _.findWhere(star.programs, { arch: CORDOVA_ARCH });
  return cordovaProgram ? cordovaProgram.cordovaDependencies : {};
}

export function newPluginId(id) {
  import { oldToNew as oldToNewPluginIds } from 'cordova-registry-mapper';
  return oldToNewPluginIds[id];
}

export function convertPluginVersions(pluginVersions) {
  assert(pluginVersions);
  buildmessage.assertInJob();

  let newPluginVersions = {};

  _.each(pluginVersions, (version, id) => {
    if (utils.isUrlWithSha(version)) {
      version = convertToGitUrl(version);
      if (!version) {
        // convertToGitUrl will add an error to buildmessage messages
        return;
      }
    }

    const newId = newPluginId(id);

    if (newId) {
      // If the plugin has already been added using the new ID, we do not
      // overwrite the version.
      if (!_.has(pluginVersions, newId)) {
        newPluginVersions[newId] = version;
      }
    } else {
      newPluginVersions[id] = version;
    }
  });

  return newPluginVersions;
}

// Convert old-style GitHub tarball URLs to new Git URLs, and check if other
// Git URLs contain a SHA reference.
export function convertToGitUrl(url) {
  buildmessage.assertInJob();

  // Matches GitHub tarball URLs, like:
  // https://github.com/meteor/com.meteor.cordova-update/tarball/92fe99b7248075318f6446b288995d4381d24cd2
  const match =
    url.match(/^https?:\/\/github.com\/(.+?)\/(.+?)\/tarball\/([0-9a-f]{40})/);
  if (match) {
      const [, organization, repository, sha] = match;
    // Convert them to a Git URL
    return `https://github.com/${organization}/${repository}.git#${sha}`;
  // We only support Git URLs with a SHA reference to guarantee repeatability
  // of builds
  } else if (/\.git#[0-9a-f]{40}/.test(url)) {
    return url;
  } else {
    buildmessage.error(`Meteor no longer supports installing Cordova plugins \
from arbitrary tarball URLs. You can either add a plugin from a Git URL with \
a SHA reference, or from a local path. (Attempting to install from ${url}.)`);
    return null;
  }
}

function displayNameForHostPlatform(platform = process.platform) {
  switch (platform) {
    case 'darwin':
      return "Mac";
    case 'linux':
      return "Linux";
    case 'win32':
      return "Windows";
  }
}
