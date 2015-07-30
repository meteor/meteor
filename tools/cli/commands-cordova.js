import _ from 'underscore';
import main from './main.js';
import { Console } from '../console.js';
import catalog from '../catalog.js';
import { ProjectContext, PlatformList } from '../project-context.js';
import buildmessage from '../buildmessage.js';
import files from '../files.js';

import { AVAILABLE_PLATFORMS, ensureCordovaPlatformsAreSynchronized } from './platforms.js';
import { createCordovaProjectIfNecessary } from './project.js';

function createProjectContext(appDir) {
  const projectContext = new ProjectContext({
    projectDir: appDir
  });
  main.captureAndExit('=> Errors while initializing project:', function () {
    // We're just reading metadata here; we don't need to resolve constraints.
    projectContext.readProjectMetadata();
  });
  return projectContext;
}

// Add one or more Cordova platforms
main.registerCommand({
  name: 'add-platform',
  options: {
    verbose: { type: Boolean, short: "v" }
  },
  minArgs: 1,
  maxArgs: Infinity,
  requiresApp: true,
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  Console.setVerbose(!!options.verbose);

  const projectContext = createProjectContext(options.appDir);

  var platforms = options.args;
  var currentPlatforms = projectContext.platformList.getPlatforms();

  main.captureAndExit('', 'adding platforms', function () {
    _.each(platforms, function (platform) {
      if (_.contains(currentPlatforms, platform)) {
        buildmessage.error(`${platform}: platform is already added`);
      } else if (!_.contains(AVAILABLE_PLATFORMS, platform)) {
        buildmessage.error(`${platform}: no such platform`);
      }
    });
  });

  buildmessage.enterJob({ title: 'adding platforms' }, function () {
    projectContext.platformList.write(currentPlatforms.concat(platforms));

    const cordovaProject = createCordovaProjectIfNecessary(projectContext);
    ensureCordovaPlatformsAreSynchronized(cordovaProject, projectContext);
  });

  // If this was the first Cordova platform, we may need to rebuild all of the
  // local packages to add the web.cordova unibuild to the IsopackCache.
  main.captureAndExit('=> Errors while initializing project:', function () {
    projectContext.prepareProjectForBuild();
  });

  _.each(platforms, function (platform) {
    Console.info(`${platform}: added platform`);
  });
});

// Remove one or more Cordova platforms
main.registerCommand({
  name: 'remove-platform',
  minArgs: 1,
  maxArgs: Infinity,
  requiresApp: true,
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  const projectContext = createProjectContext(options.appDir);

  var platforms = projectContext.platformList.getPlatforms();
  var changed = false;
  _.each(options.args, function (platform) {
    // Explain why we can't remove server or browser platforms
    if (_.contains(PlatformList.DEFAULT_PLATFORMS, platform)) {
      Console.warn(`${platform}: cannot remove platform in this version of Meteor`);
      return;
    }

    if (_.contains(platforms, platform)) {
      Console.info(`${platform}: removed platform`);
      platforms = _.without(platforms, platform);
      changed = true;
      return;
    }

    Console.error(`${platform}: platform is not in this project`);
  });

  if (!changed) {
    return;
  }
  projectContext.platformList.write(platforms);

  const cordovaProject = createCordovaProjectIfNecessary(projectContext);
  ensureCordovaPlatformsAreSynchronized(cordovaProject, projectContext);

  // If this was the last Cordova platform, we may need to rebuild all of the
  // local packages to remove the web.cordova unibuild from the IsopackCache.
  main.captureAndExit('=> Errors while initializing project:', function () {
    projectContext.prepareProjectForBuild();
  });
});

main.registerCommand({
  name: 'list-platforms',
  requiresApp: true,
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  const projectContext = createProjectContext(options.appDir);

  var platforms = projectContext.platformList.getPlatforms();

  Console.rawInfo(platforms.join('\n') + '\n');
});

main.registerCommand({
  name: 'install-sdk',
  options: {
    verbose: { type: Boolean, short: "v" }
  },
  minArgs: 1,
  maxArgs: 1,
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  Console.setVerbose(!!options.verbose);

  var platform = options.args[0];
  platform = platform.trim().toLowerCase();

  if (platform != "android" && platform != "ios") {
    Console.warn(`Unknown platform: ${platform}`);
    Console.info("Valid platforms are: android, ios");
    return 1;
  }

  return 0;
});

main.registerCommand({
  name: 'configure-android',
  options: {
    verbose: { type: Boolean, short: "v" }
  },
  minArgs: 0,
  maxArgs: Infinity,
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  Console.setVerbose(!!options.verbose);

  return 0;
});

main.registerCommand({
  name: 'android-launch',
  options: {
    verbose: { type: Boolean, short: "v" }
  },
  minArgs: 0,
  maxArgs: 1,
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {

  return 0;
});
