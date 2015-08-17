import _ from 'underscore';
import main from './main.js';
import { Console } from '../console/console.js';
import catalog from '../packaging/catalog/catalog.js';
import { ProjectContext, PlatformList } from '../project-context.js';
import buildmessage from '../utils/buildmessage.js';
import files from '../fs/files.js';

import * as cordova from '../cordova';
import { CordovaProject } from '../cordova/project.js';

function createProjectContext(appDir) {
  const projectContext = new ProjectContext({
    projectDir: appDir
  });
  main.captureAndExit('=> Errors while initializing project:', () => {
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

  const platformsToAdd = options.args;
  let installedPlatforms = projectContext.platformList.getPlatforms();

  main.captureAndExit('', 'adding platforms', () => {
    for (platform of platformsToAdd) {
      if (_.contains(installedPlatforms, platform)) {
        buildmessage.error(`${platform}: platform is already added`);
      } else if (!_.contains(cordova.AVAILABLE_PLATFORMS, platform)) {
        buildmessage.error(`${platform}: no such platform`);
      }
    }

    if (buildmessage.jobHasMessages()) return;

    const cordovaProject = new CordovaProject(projectContext);

    installedPlatforms = installedPlatforms.concat(platformsToAdd)
    const cordovaPlatforms = cordova.filterPlatforms(installedPlatforms);
    cordovaProject.ensurePlatformsAreSynchronized(cordovaPlatforms);

    if (buildmessage.jobHasMessages()) return;

    projectContext.platformList.write(installedPlatforms);

    for (platform of platformsToAdd) {
      Console.info(`${platform}: added platform`);
      cordovaProject.checkPlatformRequirements(platform);
    }
  });

  // If this was the first Cordova platform, we may need to rebuild all of the
  // local packages to add the web.cordova unibuild to the IsopackCache.
  main.captureAndExit('=> Errors while initializing project:', () => {
    projectContext.prepareProjectForBuild();
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

  const platformsToRemove = options.args;
  let installedPlatforms = projectContext.platformList.getPlatforms();

  main.captureAndExit('', 'removing platforms', () => {
    for (platform of platformsToRemove) {
      // Explain why we can't remove server or browser platforms
      if (_.contains(PlatformList.DEFAULT_PLATFORMS, platform)) {
        buildmessage.error(`${platform}: cannot remove platform in this version of Meteor`);
      } else if (!_.contains(installedPlatforms, platform)) {
        buildmessage.error(`${platform}: platform is not in this project`);
      }
    }

    if (buildmessage.jobHasMessages()) return;

    const cordovaProject = new CordovaProject(projectContext);

    installedPlatforms = _.without(installedPlatforms, ...platformsToRemove);
    const cordovaPlatforms = cordova.filterPlatforms(installedPlatforms);
    cordovaProject.ensurePlatformsAreSynchronized(cordovaPlatforms);

    if (buildmessage.jobHasMessages()) return;

    projectContext.platformList.write(installedPlatforms);

    for (platform of platformsToRemove) {
      Console.info(`${platform}: removed platform`);
    }
  });

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

  const installedPlatforms = projectContext.platformList.getPlatforms();

  Console.rawInfo(installedPlatforms.join('\n') + '\n');
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
