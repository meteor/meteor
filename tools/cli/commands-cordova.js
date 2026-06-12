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
import {
  createRegistryForProject,
} from '../tool-extensions/index.js';
var archinfo = require('../utils/archinfo');
var compiler = require('../isobuild/compiler.js');
var PackageSource = require('../isobuild/package-source.js');
var projectContextModule = require('../project-context.js');

async function createProjectContext(appDir, { prepareForBuild = false } = {}) {
  import { ProjectContext } from '../project-context.js';

  const projectContext = new ProjectContext({
    projectDir: appDir
  });
  await main.captureAndExit('=> Errors while initializing project:', async () => {
    if (prepareForBuild) {
      await projectContext.prepareProjectForBuild();
    } else {
      await projectContext.readProjectMetadata();
    }
  });
  return projectContext;
}

// Forces a full app compile so provider package build plugins can run
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

function resolveRequestedPlatforms(registry, platformNames) {
  try {
    return platformNames.map(platformName =>
      registry.resolvePlatform(platformName)
    );
  } catch (e) {
    if (e?.code?.startsWith('TOOL_EXTENSION_')) {
      Console.error(e.message);
      return null;
    }
    throw e;
  }
}

function resolvePlatformsForRemove(registry, platformNames, installedPlatforms) {
  const resolvedPlatforms = [];
  for (const platformName of platformNames) {
    try {
      resolvedPlatforms.push(registry.resolvePlatform(platformName));
    } catch (e) {
      if (
        e?.code === 'TOOL_EXTENSION_UNKNOWN_PLATFORM' &&
        !installedPlatforms.includes(platformName)
      ) {
        Console.error(`${platformName}: platform is not in this project`);
        return null;
      }
      if (e?.code?.startsWith('TOOL_EXTENSION_')) {
        Console.error(e.message);
        return null;
      }
      throw e;
    }
  }
  return resolvedPlatforms;
}

async function addCordovaPlatforms(projectContext, platformsToAdd) {
  let installedPlatforms = projectContext.platformList.getPlatforms();

  await main.captureAndExit('', 'adding platforms', async () => {
    for (const platform of platformsToAdd) {
      if (installedPlatforms.includes(platform)) {
        buildmessage.error(`${platform}: platform is already added`);
      } else if (!CORDOVA_PLATFORMS.includes(platform)) {
        buildmessage.error(`${platform}: no such platform`);
      }
    }

    if (buildmessage.jobHasMessages()) {
      return;
    }

    const { CordovaProject } = require('../cordova/project.js');
    const cordovaProject = new CordovaProject(projectContext);
    await cordovaProject.init();

    if (buildmessage.jobHasMessages()) return;

    installedPlatforms = installedPlatforms.concat(platformsToAdd);
    const cordovaPlatforms = filterPlatforms(installedPlatforms);
    await cordovaProject.ensurePlatformsAreSynchronized(cordovaPlatforms);

    if (buildmessage.jobHasMessages()) {
      return;
    }

    await projectContext.platformList.write(installedPlatforms);

    for (const platform of platformsToAdd) {
      Console.info(`${platform}: added platform`);
      if (cordovaPlatforms.includes(platform)) {
        await cordovaProject.checkPlatformRequirements(platform);
      }
    }
  });
}

async function removeCordovaPlatforms(projectContext, platformsToRemove) {
  const { CordovaProject } = require('../cordova/project.js');
  const { PlatformList } = require('../project-context.js');

  let installedPlatforms = projectContext.platformList.getPlatforms();

  await main.captureAndExit('', 'removing platforms', async () => {
    for (const platform of platformsToRemove) {
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

    for (const platform of platformsToRemove) {
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

async function doAddPlatform(options) {
  Console.setVerbose(!!options.verbose);

  const projectContext = await createProjectContext(options.appDir, {
    prepareForBuild: true,
  });
  const registry = await createRegistryForProject(projectContext);
  const platformsToAdd = options.args || [];
  const resolvedPlatforms = resolveRequestedPlatforms(registry, platformsToAdd);

  if (!resolvedPlatforms) {
    return 1;
  }

  const providerPlatforms = resolvedPlatforms.filter(result => !result.isFallback);
  const cordovaPlatforms = resolvedPlatforms
    .filter(result => result.isFallback)
    .map(result => result.platform.name);

  if (providerPlatforms.length) {
    if (cordovaPlatforms.length) {
      await ensureDevBundleDependencies();
      await addCordovaPlatforms(projectContext, cordovaPlatforms);
    }

    await compileApp(options);
    const installedPlatforms = projectContext.platformList.getPlatforms();
    const providerPlatformNames = providerPlatforms.map(result => result.platform.name);
    await projectContext.platformList.write(
      Array.from(new Set([...installedPlatforms, ...providerPlatformNames]))
    );
    for (const platform of providerPlatformNames) {
      Console.info(`${platform}: added platform`);
    }
    return;
  }

  await ensureDevBundleDependencies();
  await addCordovaPlatforms(projectContext, cordovaPlatforms);
}

async function doRemovePlatform(options) {
  const projectContext = await createProjectContext(options.appDir, {
    prepareForBuild: true,
  });
  const registry = await createRegistryForProject(projectContext);
  const platformsToRemove = options.args || [];
  const installedPlatforms = projectContext.platformList.getPlatforms();
  const resolvedPlatforms = resolvePlatformsForRemove(
    registry,
    platformsToRemove,
    installedPlatforms
  );

  if (!resolvedPlatforms) {
    return 1;
  }

  const providerPlatforms = resolvedPlatforms.filter(result => !result.isFallback);
  const cordovaPlatforms = resolvedPlatforms
    .filter(result => result.isFallback)
    .map(result => result.platform.name);

  if (providerPlatforms.length) {
    if (cordovaPlatforms.length) {
      await ensureDevBundleDependencies();
      await removeCordovaPlatforms(projectContext, cordovaPlatforms);
    }

    const providerPlatformNames = providerPlatforms.map(result => result.platform.name);
    for (const platform of providerPlatformNames) {
      if (!installedPlatforms.includes(platform)) {
        Console.warn(`${platform}: platform is not in this project`);
      }
    }
    await projectContext.platformList.write(
      installedPlatforms.filter(p => !providerPlatformNames.includes(p))
    );
    for (const result of providerPlatforms) {
      const nativeProjectDir = result.platform.nativeProjectDir || result.platform.name;
      Console.info(`${result.platform.name}: removed platform`);
      if (files.exists(files.pathJoin(options.appDir, nativeProjectDir))) {
        Console.info(`   Native project at ./${nativeProjectDir}/ left untouched. Delete manually if you want to start fresh.`);
      }
    }
    return;
  }

  await ensureDevBundleDependencies();
  await removeCordovaPlatforms(projectContext, cordovaPlatforms);
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
    return await doAddPlatform(options);
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
  return await doRemovePlatform(options);
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
