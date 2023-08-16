import _ from 'underscore';
import main from './main.js';
import { Console } from '../console/console.js';
import catalog from '../packaging/catalog/catalog.js';
import buildmessage from '../utils/buildmessage.js';
var files = require('../fs/files');
import {
  CORDOVA_PLATFORMS,
  ensureDevBundleDependencies,
  filterPlatforms,
} from '../cordova/index.js';
import {PlatformList} from "../project-context";

async function createProjectContext(appDir) {
  import { ProjectContext } from '../project-context.js';

  const projectContext = new ProjectContext({
    projectDir: appDir
  });
  await main.captureAndExit('=> Errors while initializing project:', async () => {
    // We're just reading metadata here; we don't need to resolve constraints.
    await projectContext.readProjectMetadata();
  });
  return projectContext;
}

async function doAddPlatform(options) {
  import { CordovaProject } from '../cordova/project.js';

  Console.setVerbose(!!options.verbose);

  const projectContext = await createProjectContext(options.appDir);

  const platformsToAdd = options.args;
  let installedPlatforms = projectContext.platformList.getPlatforms();

  await main.captureAndExit('', 'adding platforms', async () => {
    for (var platform of platformsToAdd) {
      if (installedPlatforms.includes(platform)) {
        buildmessage.error(`${platform}: platform is already added`);
      } else if (!CORDOVA_PLATFORMS.includes(platform)) {
        buildmessage.error(`${platform}: no such platform`);
      }
    }

    if (buildmessage.jobHasMessages()) {
      return;
    }

    const cordovaProject = new CordovaProject(projectContext);
    await cordovaProject.init();

    if (buildmessage.jobHasMessages()) return;

    installedPlatforms = installedPlatforms.concat(platformsToAdd);
    const cordovaPlatforms = filterPlatforms(installedPlatforms);
    await cordovaProject.ensurePlatformsAreSynchronized(cordovaPlatforms);

    if (buildmessage.jobHasMessages()) {
      return;
    }

    // Only write the new platform list when we have successfully synchronized.
    await projectContext.platformList.write(installedPlatforms);

    for (var platform of platformsToAdd) {
      Console.info(`${platform}: added platform`);
      if (cordovaPlatforms.includes(platform)) {
        await cordovaProject.checkPlatformRequirements(platform);
      }
    }
  });
}

async function doRemovePlatform(options) {
  import { CordovaProject } from '../cordova/project.js';
  import { PlatformList } from '../project-context.js';

  const projectContext = await createProjectContext(options.appDir);

  const platformsToRemove = options.args;
  let installedPlatforms = projectContext.platformList.getPlatforms();

  await main.captureAndExit('', 'removing platforms', async () => {
    for (platform of platformsToRemove) {
      // Explain why we can't remove server or browser platforms
      if (PlatformList.DEFAULT_PLATFORMS.includes(platform)) {
        buildmessage.error(`${platform}: cannot remove platform in this \
version of Meteor`);
      } else if (!installedPlatforms.includes(platform)) {
        buildmessage.error(`${platform}: platform is not in this project`);
      }
    }

    if (buildmessage.jobHasMessages()) {
      return;
    }

    installedPlatforms = _.without(installedPlatforms, ...platformsToRemove);
    projectContext.platformList.write(installedPlatforms);

    for (platform of platformsToRemove) {
      Console.info(`${platform}: removed platform`);
    }

    if (process.platform !== 'win32') {
      const cordovaProject = new CordovaProject(projectContext);
      await cordovaProject.init();
      if (buildmessage.jobHasMessages()) return;
      const cordovaPlatforms = filterPlatforms(installedPlatforms);
      await cordovaProject.ensurePlatformsAreSynchronized(cordovaPlatforms);
    }
  });
}

// Add one or more Cordova platforms
main.registerCommand(
  {
    name: 'add-platform',
    options: {
      verbose: { type: Boolean, short: 'v' },
    },
    minArgs: 1,
    maxArgs: Infinity,
    requiresApp: true,
    catalogRefresh: new catalog.Refresh.Never(),
    notOnWindows: false,
  },
  async function(options) {
    await ensureDevBundleDependencies();
    await doAddPlatform(options);
  }
);

// Remove one or more Cordova platforms
main.registerCommand({
  name: 'remove-platform',
  minArgs: 1,
  maxArgs: Infinity,
  requiresApp: true,
  catalogRefresh: new catalog.Refresh.Never()
}, async function (options) {
  await ensureDevBundleDependencies();
  await doRemovePlatform(options);
});

main.registerCommand({
  name: 'list-platforms',
  requiresApp: true,
  catalogRefresh: new catalog.Refresh.Never()
}, async function (options) {
  const projectContext = await createProjectContext(options.appDir);

  const installedPlatforms = projectContext.platformList.getPlatforms();

  Console.rawInfo(installedPlatforms.join('\n') + '\n');
});

main.registerCommand({
  name: 'install-sdk',
  options: {
    verbose: { type: Boolean, short: "v" }
  },
  minArgs: 0,
  maxArgs: Infinity,
  catalogRefresh: new catalog.Refresh.Never(),
  hidden: true,
  notOnWindows: true
}, function (options) {
  Console.setVerbose(!!options.verbose);

  Console.info("Please follow the installation instructions in the mobile guide:");
  Console.info(Console.url("http://guide.meteor.com/cordova.html#installing-prerequisites"));

  return 0;
});

main.registerCommand({
  name: 'configure-android',
  options: {
    verbose: { type: Boolean, short: "v" }
  },
  minArgs: 0,
  maxArgs: Infinity,
  catalogRefresh: new catalog.Refresh.Never(),
  hidden: true,
  notOnWindows: true
}, function (options) {
  Console.setVerbose(!!options.verbose);

  Console.info(`You can launch the Android SDK Manager from within Android \
Studio.
See`, Console.url("http://developer.android.com/tools/help/sdk-manager.html"), `
Alternatively, you can launch it by running the 'android' command.
(This requires that you have set ANDROID_HOME and added ANDROID_HOME/tools \
to your PATH.)`);

  return 0;
});

main.registerCommand({
  name: 'ensure-cordova-dependencies',
  options: {
    verbose: { type: Boolean, short: "v" }
  },
  minArgs: 0,
  maxArgs: Infinity,
  requiresApp: true,
  catalogRefresh: new catalog.Refresh.Never(),
}, async function (options) {
  Console.setVerbose(!!options.verbose);

  await ensureDevBundleDependencies();
  Console.info("Cordova dependencies are installed.");
});
