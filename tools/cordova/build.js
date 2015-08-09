import _ from 'underscore';
import util from 'util';
import { Console } from '../console.js';
import buildmessage from '../buildmessage.js';
import files from '../fs/files.js';
import bundler from '../isobuild/bundler.js';
import archinfo from '../archinfo.js';
import release from '../packaging/release.js';
import isopackets from '../tool-env/isopackets.js'

import { createCordovaProjectIfNecessary } from './project.js';
import { AVAILABLE_PLATFORMS, ensureCordovaPlatformsAreSynchronized,
  checkCordovaPlatforms } from './platforms.js';
import { ensureCordovaPluginsAreSynchronized } from './plugins.js';
import { processMobileControlFile } from './mobile-control-file.js';

const WEB_ARCH_NAME = "web.cordova";

// Returns the cordovaDependencies of the Cordova arch from a star json.
export function getCordovaDependenciesFromStar(star) {
  var cordovaProgram = _.findWhere(star.programs, { arch: WEB_ARCH_NAME });
  if (cordovaProgram) {
    return cordovaProgram.cordovaDependencies;
  } else {
    return {};
  }
}

// Build a Cordova project, creating it if necessary.
export function buildCordovaProject(projectContext, platforms, options) {
  if (_.isEmpty(platforms)) return;

  Console.debug('Building the Cordova project');

  platforms = checkCordovaPlatforms(projectContext, platforms);

  // Make sure there is a project, as all other operations depend on that
  const cordovaProject = createCordovaProjectIfNecessary(projectContext);

  buildmessage.enterJob({ title: 'building for mobile devices' }, function () {
    const bundlePath =
      projectContext.getProjectLocalDirectory('build-cordova-temp');

    Console.debug('Bundling the web.cordova program of the app');
    const bundle = getBundle(projectContext, bundlePath, options);

    // Check and consume the control file
    const controlFilePath =
      files.pathJoin(projectContext.projectDir, 'mobile-config.js');

    processMobileControlFile(
      controlFilePath,
      projectContext,
      cordovaProject,
      options.host);

    ensureCordovaPlatformsAreSynchronized(cordovaProject,
      projectContext.platformList.getPlatforms());

    ensureCordovaPluginsAreSynchronized(cordovaProject, getCordovaDependenciesFromStar(
      bundle.starManifest));

    const wwwPath = files.pathJoin(cordovaProject.projectRoot, 'www');

    Console.debug('Removing the www folder');
    files.rm_recursive(wwwPath);

    const applicationPath = files.pathJoin(wwwPath, 'application');
    const programPath = files.pathJoin(bundlePath, 'programs', WEB_ARCH_NAME);

    Console.debug('Writing www/application folder');
    files.mkdir_p(applicationPath);
    files.cp_r(programPath, applicationPath);

    // Clean up the temporary bundle directory
    files.rm_recursive(bundlePath);

    Console.debug('Writing index.html');

    // Generate index.html
    var indexHtml = generateCordovaBoilerplate(
      projectContext, applicationPath, options);
    files.writeFile(files.pathJoin(applicationPath, 'index.html'), indexHtml, 'utf8');

    // Write the cordova loader
    Console.debug('Writing meteor_cordova_loader');
    var loaderPath = files.pathJoin(__dirname, 'client', 'meteor_cordova_loader.js');
    var loaderCode = files.readFile(loaderPath);
    files.writeFile(files.pathJoin(wwwPath, 'meteor_cordova_loader.js'), loaderCode);

    Console.debug('Writing a default index.html for cordova app');
    var indexPath = files.pathJoin(__dirname, 'client', 'cordova_index.html');
    var indexContent = files.readFile(indexPath);
    files.writeFile(files.pathJoin(wwwPath, 'index.html'), indexContent);

    // Cordova Build Override feature (c)
    var buildOverridePath =
      files.pathJoin(projectContext.projectDir, 'cordova-build-override');

    if (files.exists(buildOverridePath) &&
      files.stat(buildOverridePath).isDirectory()) {
      Console.debug('Copying over the cordova-build-override');
      files.cp_r(buildOverridePath, cordovaProject.projectRoot);
    }

    // Run the actual build
    Console.debug('Running the build command');

    buildmessage.enterJob({ title: 'building mobile project' }, () => {
      const buildOptions = options.debug ? [] : ['release'];
      Promise.await(cordovaProject.build({ platforms: platforms, options: buildOptions }));
    });
  });

  Console.debug('Done building the cordova build project');

  return cordovaProject;
};

// options
//  - debug
function getBundle(projectContext, bundlePath, options) {
  var bundleResult = bundler.bundle({
    projectContext: projectContext,
    outputPath: bundlePath,
    buildOptions: {
      minifyMode: options.debug ? 'development' : 'production',
      // XXX can we ask it not to create the server arch?
      serverArch: archinfo.host(),
      webArchs: [WEB_ARCH_NAME],
      includeDebug: !!options.debug
    }
  });

  if (bundleResult.errors) {
    // XXX better error handling?
    throw new Error("Errors prevented bundling:\n" +
                    bundleResult.errors.formatMessages());
  }

  return bundleResult;
};

function generateCordovaBoilerplate(projectContext, clientDir, options) {
  var clientJsonPath = files.convertToOSPath(files.pathJoin(clientDir, 'program.json'));
  var clientJson = JSON.parse(files.readFile(clientJsonPath, 'utf8'));
  var manifest = clientJson.manifest;
  var settings = options.settings ?
    JSON.parse(files.readFile(options.settings, 'utf8')) : {};
  var publicSettings = settings['public'];

  var meteorRelease =
    release.current.isCheckout() ? "none" : release.current.name;

  var configDummy = {};
  if (publicSettings) configDummy.PUBLIC_SETTINGS = publicSettings;

  const { WebAppHashing } = isopackets.load('cordova-support')['webapp-hashing'];
  var calculatedHash =
    WebAppHashing.calculateClientHash(manifest, null, configDummy);

  // XXX partially copied from autoupdate package
  var version = process.env.AUTOUPDATE_VERSION || calculatedHash;

  var mobileServer = options.protocol + options.host;
  if (options.port) {
    mobileServer = mobileServer + ":" + options.port;
  }

  var runtimeConfig = {
    meteorRelease: meteorRelease,
    ROOT_URL: mobileServer + "/",
    // XXX propagate it from options?
    ROOT_URL_PATH_PREFIX: '',
    DDP_DEFAULT_CONNECTION_URL: mobileServer,
    autoupdateVersionCordova: version,
    appId: projectContext.appIdentifier
  };

  if (publicSettings)
    runtimeConfig.PUBLIC_SETTINGS = publicSettings;

  const { Boilerplate } = isopackets.load('cordova-support')['boilerplate-generator'];
  var boilerplate = new Boilerplate(WEB_ARCH_NAME, manifest, {
    urlMapper: _.identity,
    pathMapper: (path) => files.convertToOSPath(files.pathJoin(clientDir, path)),
    baseDataExtension: {
      meteorRuntimeConfig: JSON.stringify(
        encodeURIComponent(JSON.stringify(runtimeConfig)))
    }
  });
  return boilerplate.toHTML();
};
