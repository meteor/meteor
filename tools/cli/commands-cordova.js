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
var archinfo = require('../utils/archinfo');
var compiler = require('../isobuild/compiler.js');
var PackageSource = require('../isobuild/package-source.js');
var projectContextModule = require('../project-context.js');

// All Capacitor lifecycle work lives in the build plugin
// (packages/capacitor/capacitor_plugin.js). The CLI only needs to know
// whether the project opted in and which platforms are valid; cap add is
// triggered by compiling the app, which loads the build plugin and runs
// its add-platform branch.
const CAPACITOR_PLATFORMS = ['android', 'ios'];
const projectHasCapacitor = (projectContext) =>
  !!projectContext?.projectConstraintsFile?.getConstraint('capacitor');

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

// Forces a full app compile purely so build plugins load and run their
// command-time hooks.
async function compileApp(options) {
  const compileContext = new projectContextModule.ProjectContext({
    projectDir: options.appDir,
    serverArchitectures: [archinfo.host()],
    allowIncompatibleUpdate: options['allow-incompatible-update'],
  });
  await main.captureAndExit('=> Errors prevented the build:', async () => {
    await compileContext.prepareProjectForBuild();
  });
  await buildmessage.capture({ title: 'updating the application' }, async () => {
    const packageSource = new PackageSource();
    packageSource.initFromAppDir(compileContext, [/~$/, /^\.#/, /^(\.meteor\/|\.git\/|Thumbs\.db|\.DS_Store\/?|Icon\r|ehthumbs\.db|\..*\.sw.|#.*#)$/]);
    await compiler.compile(packageSource, {
      packageMap: compileContext.packageMap,
      isopackCache: compileContext.isopackCache,
    });
  });
}

async function doAddPlatform(options) {
  import { CordovaProject } from '../cordova/project.js';

  Console.setVerbose(!!options.verbose);

  const projectContext = await createProjectContext(options.appDir);

  // For Capacitor projects, force a compile so the capacitor build plugin
  // loads. Its add-platform branch runs `npx cap add <platform>` (or
  // `cap sync` if the native dir already exists). We then write
  // .meteor/platforms on success.
  if (projectHasCapacitor(projectContext)) {
    const platformsToAdd = options.args || [];
    const invalid = platformsToAdd.find(p => !CAPACITOR_PLATFORMS.includes(p));
    if (invalid) {
      Console.error(`${invalid}: no such Capacitor platform (expected one of: ${CAPACITOR_PLATFORMS.join(', ')})`);
      return 1;
    }
    await compileApp(options);
    const installedPlatforms = projectContext.platformList.getPlatforms();
    await projectContext.platformList.write(
      Array.from(new Set([...installedPlatforms, ...platformsToAdd]))
    );
    for (const platform of platformsToAdd) {
      Console.info(`${platform}: added platform`);
    }
    return;
  }

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

  // Capacitor: there is no `cap remove`, and we deliberately leave the
  // native folder (./android, ./ios) on disk so user edits aren't lost.
  // All we do is filter `.meteor/platforms` and report.
  if (projectHasCapacitor(projectContext)) {
    const platformsToRemove = options.args || [];
    const invalid = platformsToRemove.find(p => !CAPACITOR_PLATFORMS.includes(p));
    if (invalid) {
      Console.error(`${invalid}: no such Capacitor platform`);
      return 1;
    }
    const installedPlatforms = projectContext.platformList.getPlatforms();
    for (const platform of platformsToRemove) {
      if (!installedPlatforms.includes(platform)) {
        Console.warn(`${platform}: platform is not in this project`);
      }
    }
    await projectContext.platformList.write(
      installedPlatforms.filter(p => !platformsToRemove.includes(p))
    );
    for (const platform of platformsToRemove) {
      Console.info(`${platform}: removed platform`);
      if (files.exists(files.pathJoin(options.appDir, platform))) {
        Console.info(`   Native project at ./${platform}/ left untouched. Delete manually if you want to start fresh.`);
      }
    }
    return;
  }

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
    const projectContext = await createProjectContext(options.appDir);
    if (!projectHasCapacitor(projectContext)) {
      await ensureDevBundleDependencies();
    }
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
  const projectContext = await createProjectContext(options.appDir);
  if (!projectHasCapacitor(projectContext)) {
    await ensureDevBundleDependencies();
  }
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
