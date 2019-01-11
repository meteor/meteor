import _ from 'underscore';
import util from 'util';
import assert from 'assert';
import chalk from 'chalk';
import semver from 'semver';

import files from '../fs/files.js';
import utils from '../utils/utils.js';
import { Console } from '../console/console.js';
import { Profile } from '../tool-env/profile.js';
import buildmessage from '../utils/buildmessage.js';
import main from '../cli/main.js';
import httpHelpers from '../utils/http-helpers.js';
import { execFileSync, execFileAsync } from '../utils/processes.js';

import './protect-string-proto.js'; // must always come before 'cordova-lib'
import { cordova as cordova_lib, events as cordova_events, CordovaError }
  from 'cordova-lib';
import cordova_util from 'cordova-lib/src/cordova/util.js';
import superspawn from 'cordova-common/src/superspawn.js';
import PluginInfoProvider from 'cordova-common/src/PluginInfo/PluginInfoProvider.js';

import { CORDOVA_PLATFORMS, CORDOVA_PLATFORM_VERSIONS, displayNameForPlatform, displayNamesForPlatforms,
  newPluginId, convertPluginVersions, convertToGitUrl } from './index.js';
import { CordovaBuilder } from './builder.js';

cordova_events.on('verbose', logIfVerbose);
cordova_events.on('log', logIfVerbose);
cordova_events.on('info', logIfVerbose);
cordova_events.on('warn', log);
cordova_events.on('error', log);

cordova_events.on('results', logIfVerbose);

function logIfVerbose(...args) {
  if (Console.verbose) {
    log(...args);
  }
};

function log(...args) {
  Console.rawInfo(`%% ${util.format.apply(null, args)}\n`);
}

// We pin platform versions ourselves instead of relying on cordova-lib
// so we we can update them independently (e.g. use Cordova iOS 4.0.1
// with Cordova 5.4.1)
const pinnedPlatformVersions = CORDOVA_PLATFORM_VERSIONS;

// We pin plugin versions to make sure we do not install versions that are
// incompatible with the current platform versions.
// Versions are taken from cordova-lib's package.json and should be updated
// when we update to a newer version of cordova-lib.
const pinnedPluginVersions = {
  "cordova-plugin-battery-status": "1.2.4",
  "cordova-plugin-camera": "2.4.1",
  "cordova-plugin-console": "1.1.0", // Deprecated, remove in future
  "cordova-plugin-contacts": "2.3.1",
  "cordova-plugin-device": "1.1.6",
  "cordova-plugin-device-motion": "2.0.0", // Deprecated, remove in future
  "cordova-plugin-device-orientation": "2.0.0", // Deprecated, remove in future
  "cordova-plugin-dialogs": "1.3.3",
  "cordova-plugin-file": "4.3.3",
  "cordova-plugin-file-transfer": "1.6.3",
  "cordova-plugin-geolocation": "2.4.3",
  "cordova-plugin-globalization": "1.0.7",
  "cordova-plugin-inappbrowser": "1.7.1",
  "cordova-plugin-legacy-whitelist": "1.1.2",
  "cordova-plugin-media": "3.0.1",
  "cordova-plugin-media-capture": "1.4.3",
  "cordova-plugin-network-information": "1.3.3",
  "cordova-plugin-splashscreen": "4.1.0",
  "cordova-plugin-statusbar": "2.3.0",
  "cordova-plugin-test-framework": "1.1.5",
  "cordova-plugin-vibration": "2.1.5",
  "cordova-plugin-whitelist": "1.3.2",
  "cordova-plugin-wkwebview-engine": "1.1.3"
}

export class CordovaProject {
  constructor(projectContext, options = {}) {

    this.projectContext = projectContext;

    this.projectRoot = projectContext.getProjectLocalDirectory('cordova-build');
    this.options = options;

    this.pluginsDir = files.pathJoin(this.projectRoot, 'plugins');

    this.buildJsonPath = files.convertToOSPath(
      files.pathJoin(this.projectRoot, 'build.json'));

    this.createIfNeeded();
  }

  createIfNeeded() {
    buildmessage.assertInJob();

    // Check if we have an existing Cordova project directory with outdated
    // platforms. In that case, we remove the whole directory to avoid issues.
    if (files.exists(this.projectRoot)) {
      const installedPlatforms = this.listInstalledPlatforms();

      const outdated = _.some(pinnedPlatformVersions, (pinnedVersion, platform) => {
        // If the platform is not installed, it cannot be outdated
        if (!_.contains(installedPlatforms, platform)) {
          return false;
        }

        const installedVersion = this.installedVersionForPlatform(platform);
        // If we cannot establish the installed version, we consider it outdated
        if (!installedVersion) {
          return true;
        }

        if (! semver.valid(pinnedVersion)) {
          // If pinnedVersion is not a semantic version but instead
          // something like a GitHub tarball URL, assume not outdated.
          return false;
        }

        return semver.lt(installedVersion, pinnedVersion);
      });

      if (outdated) {
        Console.debug(`Removing Cordova project directory to avoid issues with
outdated platforms`);
        // Remove Cordova project directory to start afresh
        // and avoid a broken project
        files.rm_recursive(this.projectRoot);
      }
    }

    if (!files.exists(this.projectRoot)) {
      // We create a temporary directory with a generated config.xml
      // to use as a template for creating the Cordova project
      // This way, we are not dependent on the contents of
      // cordova-app-hello-world but we base our initial project state on
      // our own defaults and optionally a mobile-config.js

      const templatePath = files.mkdtemp('cordova-template-');

      // If we don't create an empty hooks directory, cordova-lib will attempt
      // to install one from a hardcoded path to cordova-app-hello-world
      files.mkdir_p(files.pathJoin(templatePath, 'hooks'));

      // If we don't create an empty www directory, cordova-lib will get
      // confused
      files.mkdir_p(files.pathJoin(templatePath, 'www'));

      const builder = new CordovaBuilder(
        this.projectContext,
        templatePath,
        { mobileServerUrl: this.options.mobileServerUrl,
          settingsFile: this.options.settingsFile }
      );

      builder.processControlFile();

      if (buildmessage.jobHasMessages()) {
        return;
      }

      // Don't copy resources (they will be copied as part of the prepare)
      builder.writeConfigXmlAndCopyResources(false);

      // Create the Cordova project root directory
      files.mkdir_p(files.pathDirname(this.projectRoot));

      const config = {
        lib: {
          www: {
            url: files.convertToOSPath(templatePath),
            template: true
          }
        }
      };

      // Don't set cwd to project root in runCommands because it doesn't
      // exist yet
      this.runCommands('creating Cordova project', async () => {
        // No need to pass in appName and appId because these are set from
        // the generated config.xml
        await cordova_lib.create(files.convertToOSPath(this.projectRoot),
          undefined, undefined, config);
      }, undefined, null);
    }

    this.writeBuildJson();
  }

  writeBuildJson() {
    if (files.exists(this.buildJsonPath)) {
      return;
    }

    const iosCommonOptions = {
      // See https://github.com/apache/cordova-ios/issues/407:
      buildFlag: [
        "-UseModernBuildSystem=0"
      ]
    };

    files.writeFile(
      this.buildJsonPath,
      JSON.stringify({
        ios: {
          debug: iosCommonOptions,
          release: iosCommonOptions,
        }
      }, null, 2) + "\n",
    );
  }

  // Preparing

  prepareFromAppBundle(bundlePath, pluginVersions) {
    assert(bundlePath);
    assert(pluginVersions);

    buildmessage.assertInJob();

    Console.debug('Preparing Cordova project from app bundle');

    const builder = new CordovaBuilder(
      this.projectContext,
      this.projectRoot,
      { mobileServerUrl: this.options.mobileServerUrl,
        settingsFile: this.options.settingsFile }
    );

    builder.processControlFile();

    if (buildmessage.jobHasMessages()) {
      return;
    }

    builder.writeConfigXmlAndCopyResources();
    builder.copyWWW(bundlePath);

    this.ensurePlatformsAreSynchronized();
    this.ensurePluginsAreSynchronized(pluginVersions,
      builder.pluginsConfiguration);

    // Temporary workaround for Cordova iOS bug until
    // https://issues.apache.org/jira/browse/CB-10885 is fixed
    const iosBuildExtrasPath =
      files.pathJoin(
        this.projectRoot,
        'platforms/ios/cordova/build-extras.xcconfig');

    if (files.exists(iosBuildExtrasPath)) {
      files.writeFile(
        iosBuildExtrasPath,
        'LD_RUNPATH_SEARCH_PATHS = @executable_path/Frameworks;');
    }

    builder.copyBuildOverride();
  }

  prepareForPlatform(platform) {
    assert(platform);

    // Temporary workaround for Cordova iOS bug until
    // https://issues.apache.org/jira/browse/CB-11731 has been released
    delete require.cache[files.pathJoin(this.projectRoot,
      'platforms/ios/cordova/lib/configMunger.js')];
    delete require.cache[files.pathJoin(this.projectRoot,
      'platforms/ios/cordova/lib/prepare.js')];

    const commandOptions = {
      ...this.defaultOptions,
      platforms: [platform],
    };

    this.runCommands(`preparing Cordova project for platform \
${displayNameForPlatform(platform)}`, async () => {
      await cordova_lib.prepare(commandOptions);
    });
  }

  // Building (includes prepare)

  buildForPlatform(platform, options = {}, extraPaths) {
    assert(platform);

    const commandOptions = {
      ...this.defaultOptions,
      platforms: [platform],
      options,
    };

    this.runCommands(`building Cordova app for platform \
${displayNameForPlatform(platform)}`, async () => {
      await cordova_lib.build(commandOptions);
    });
  }

  // Running

  async run(platform, isDevice, options = [], extraPaths = []) {
    options.push('--buildConfig', this.buildJsonPath);
    options.push(isDevice ? '--device' : '--emulator');

    let env = this.defaultEnvWithPathsAdded(...extraPaths);

    let command = files.convertToOSPath(files.pathJoin(
      this.projectRoot, 'platforms', platform, 'cordova', 'run'));

    this.runCommands(`running Cordova app for platform \
${displayNameForPlatform(platform)} with options ${options}`,
    execFileAsync(command, options, {
      env: env,
      cwd: this.projectRoot,
      stdio: Console.verbose ? 'inherit' : 'pipe',
      waitForClose: false
    }), null, null);
  }

  // Platforms

  // Checks to see if the requirements for building and running on the
  // specified Cordova platform are satisfied, printing
  // installation instructions when needed.
  checkPlatformRequirements(platform) {
    if (platform === 'ios' && process.platform !== 'darwin') {
      Console.warn("Currently, it is only possible to build iOS apps \
on an OS X system.");
      return false;
    }

    const installedPlatforms = this.listInstalledPlatforms();

    const inProject = _.contains(installedPlatforms, platform);
    if (!inProject) {
      Console.warn(`Please add the ${displayNameForPlatform(platform)} \
platform to your project first.`);
      Console.info(`Run: ${Console.command(`meteor add-platform ${platform}`)}`);
      return false;
    }

    const allRequirements = this.runCommands(`checking Cordova \
requirements for platform ${displayNameForPlatform(platform)}`,
      async () => {
        return await cordova_lib.requirements([platform],
          this.defaultOptions);
      });
    let requirements = allRequirements && allRequirements[platform];
    if (!requirements) {
      Console.error(`Failed to check requirements for platform \
${displayNameForPlatform(platform)}`);
      return false;
    } else if (requirements instanceof CordovaError) {
      Console.error(`Cordova error: ${requirements.message}`);
      return false;
    }

    // We don't use ios-deploy, but open Xcode to run on a device instead
    requirements = _.reject(requirements,
      requirement => requirement.id === 'ios-deploy');

    const satisfied = _.every(requirements,
      requirement => requirement.installed);

    if (!satisfied) {
      Console.info();
      Console.info(`Your system does not yet seem to fulfill all requirements \
to build apps for ${displayNameForPlatform(platform)}.`);

      Console.info();
      Console.info("Please follow the installation instructions in the mobile guide:");
      Console.info(Console.url("http://guide.meteor.com/mobile.html#installing-prerequisites"));

      Console.info();

      Console.info("Status of the individual requirements:");
      for (const requirement of requirements) {
        const name = requirement.name;
        if (requirement.installed) {
          Console.success(name, "installed");
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
    return satisfied;
  }

  listInstalledPlatforms() {
    return cordova_util.listPlatforms(files.convertToOSPath(this.projectRoot));
  }

  installedVersionForPlatform(platform) {
    const command = files.convertToOSPath(files.pathJoin(
      this.projectRoot, 'platforms', platform, 'cordova', 'version'));
    // Make sure the command exists before trying to execute it
    if (files.exists(command)) {
      return this.runCommands(
        `getting installed version for platform ${platform} in Cordova project`,
        execFileSync(command, {
          env: this.defaultEnvWithPathsAdded(),
          cwd: this.projectRoot}), null, null);
    } else {
      return null;
    }
  }

  updatePlatforms(platforms = this.listInstalledPlatforms()) {
    this.runCommands(`updating Cordova project for platforms \
${displayNamesForPlatforms(platforms)}`, async () => {
      await cordova_lib.platform('update', platforms, this.defaultOptions);
    });
  }

  addPlatform(platform) {
    this.runCommands(`adding platform ${displayNameForPlatform(platform)} \
to Cordova project`, async () => {
      let version = pinnedPlatformVersions[platform];
      let platformSpec = version ? `${platform}@${version}` : platform;
      await cordova_lib.platform('add', platformSpec, this.defaultOptions);
    });
  }

  removePlatform(platform) {
    this.runCommands(`removing platform ${displayNameForPlatform(platform)} \
from Cordova project`, async () => {
      await cordova_lib.platform('rm', platform, this.defaultOptions);
    });
  }

  get cordovaPlatformsInApp() {
    return this.projectContext.platformList.getCordovaPlatforms();
  }

  // Ensures that the Cordova platforms are synchronized with the app-level
  // platforms.
  ensurePlatformsAreSynchronized(platforms = this.cordovaPlatformsInApp) {
    buildmessage.assertInCapture();

    const installedPlatforms = this.listInstalledPlatforms();

    for (let platform of platforms) {
      if (_.contains(installedPlatforms, platform)) {
        continue;
      }

      this.addPlatform(platform);
    }

    for (let platform of installedPlatforms) {
      if (!_.contains(platforms, platform) &&
        _.contains(CORDOVA_PLATFORMS, platform)) {
        this.removePlatform(platform);
      }
    }
  }

  // Plugins

  // Because PluginInfoProvider reads in the plugin versions from
  // their plugin.xml, that only gives us the declared version and doesn't
  // tell us if plugins have been fetched from a Git SHA URL or a local path.
  // So we overwrite the declared versions with versions from
  // listFetchedPluginVersions that do contain this information.
  listInstalledPluginVersions(usePluginInfoId = false) {
    const pluginInfoProvider = new PluginInfoProvider();
    const installedPluginVersions = pluginInfoProvider.getAllWithinSearchPath(
      files.convertToOSPath(this.pluginsDir));
    const fetchedPluginVersions = this.listFetchedPluginVersions();
    return _.object(installedPluginVersions.map(pluginInfo => {
      const fetchedPlugin = fetchedPluginVersions[pluginInfo.id];
      const id = fetchedPlugin.id;
      const version = fetchedPlugin.version || pluginInfo.version;
      return [usePluginInfoId ? pluginInfo.id : id, version];
    }));
  }

  // There is no Cordova function to get the fetched plugin versions, so we
  // have to read in fetch.json (a file managed by plugman, a semi-independent
  // part of cordova-lib) and parse the format ourselves into a version
  // string suitable to be passed to targetForPlugin.
  // Note that a plugin can be fetched but not installed, so that's why we
  // still need a separate listInstalledPluginVersions.
  listFetchedPluginVersions() {
    const fetchJsonPath = files.pathJoin(this.pluginsDir, 'fetch.json');

    if (!files.exists(fetchJsonPath)) {
      return {};
    }

    const fetchedPluginsMetadata = JSON.parse(files.readFile(
      fetchJsonPath, 'utf8'));
    return _.object(_.map(fetchedPluginsMetadata, (metadata, name) => {
      const source = metadata.source;

      const idWithVersion = source.id ? source.id : name;
      const scoped = idWithVersion[0] === '@';
      const id = `${scoped ? '@' : ''}${idWithVersion.split('@')[scoped ? 1 : 0]}`;
      let version;
      if (source.type === 'registry') {
        version = idWithVersion.split('@')[scoped ? 2 : 1];
      } else if (source.type === 'git') {
        version = `${source.url}${'ref' in source ? `#${source.ref}` : ''}`;
      } else if (source.type === 'local') {
        version = `file://${source.path}`;
      }
      return [name, { id, version }];
    }));
  }

  // Construct a target suitable for 'cordova plugin add' from an id and
  // version, converting or resolving a URL or path where needed.
  targetForPlugin(id, version) {
    assert(id);
    assert(version);

    buildmessage.assertInJob();

    if (utils.isUrlWithSha(version)) {
      return convertToGitUrl(version);
    } else if (utils.isUrlWithFileScheme(version)) {
      // Strip file:// and resolve the path relative to the cordova-build
      // directory
      const pluginPath = this.resolveLocalPluginPath(version);
      // We need to check if the directory exists ourselves because Cordova
      // will try to install from npm (and fail with an unhelpful error message)
      // if the directory is not found
      const stat = files.statOrNull(pluginPath);
      if (!(stat && stat.isDirectory())) {
        buildmessage.error(`Couldn't find local directory \
'${files.convertToOSPath(pluginPath)}' \
(while attempting to install plugin ${id}).`);
        return null;
      }
      return files.convertToOSPath(pluginPath);
    } else {
      return `${id}@${version}`;
    }
  }

  // Strips file:// and resolves the path relative to the cordova-build
  // directory
  resolveLocalPluginPath(pluginPath) {
    pluginPath = pluginPath.substr("file://".length);
    if (utils.isPathRelative(pluginPath)) {
      return files.pathResolve(this.projectContext.projectDir, pluginPath);
    } else {
      return pluginPath;
    }
  }

  addPlugin(id, version, config = {}) {
    const target = this.targetForPlugin(id, version);
    if (target) {
      const commandOptions = _.extend(this.defaultOptions,
        { cli_variables: config, link: utils.isUrlWithFileScheme(version) });

      this.runCommands(`adding plugin ${target} \
to Cordova project`, cordova_lib.plugin.bind(undefined, 'add', [target], commandOptions));
    }
  }

  // plugins is an array of plugin IDs.
  removePlugins(plugins) {
    if (_.isEmpty(plugins)) {
      return;
    }

    this.runCommands(`removing plugins ${plugins} \
from Cordova project`, cordova_lib.plugin.bind(undefined, 'rm', plugins, this.defaultOptions));
  }

  // Ensures that the Cordova plugins are synchronized with the app-level
  // plugins.
  ensurePluginsAreSynchronized(pluginVersions, pluginsConfiguration = {}) {
    assert(pluginVersions);

    buildmessage.assertInCapture();

    buildmessage.enterJob({ title: "installing Cordova plugins"}, () => {
      // Cordova plugin IDs have changed as part of moving to npm.
      // We convert old plugin IDs to new IDs in the 1.2.0-cordova-changes
      // upgrader and when adding plugins, but packages may still depend on
      // the old IDs.
      // To avoid attempts at duplicate installation, we check for old IDs here
      // and convert them to new IDs when needed. We also convert old-style GitHub
      // tarball URLs to new Git URLs, and check if other Git URLs contain a
      // SHA reference.
      pluginVersions = convertPluginVersions(pluginVersions);

      // To ensure we do not attempt to install plugin versions incompatible
      // with the current platform versions, we compare them against a list of
      // pinned versions and adjust them if necessary.
      this.ensurePinnedPluginVersions(pluginVersions);

      if (buildmessage.jobHasMessages()) {
        return;
      }

      // Also, we warn if any App.configurePlugin calls in mobile-config.js
      // need to be updated (and in the meantime we take care of the
      // conversion of the plugin configuration to the new ID).
      pluginsConfiguration = _.object(_.map(pluginsConfiguration, (config, id) => {
        const newId = newPluginId(id);
        if (newId) {
          Console.warn();
          Console.labelWarn(`Cordova plugin ${id} has been renamed to ${newId} \
as part of moving to npm. Please change the App.configurePlugin call in \
mobile-config.js accordingly.`);
          return [newId, config];
        } else {
          return [id, config];
        }
      }));

      const installedPluginVersions =
        convertPluginVersions(this.listInstalledPluginVersions());

      // Due to the dependency structure of Cordova plugins, it is impossible to
      // upgrade the version on an individual Cordova plugin. Instead, whenever
      // a new Cordova plugin is added or removed, or its version is changed,
      // we just reinstall all of the plugins.
      let shouldReinstallAllPlugins = false;

      // Iterate through all of the plugins and find if any of them have a new
      // version. Additionally, check if we have plugins installed from a local
      // path.
      const pluginsFromLocalPath = {};
      _.each(pluginVersions, (version, id) => {
        // Check if plugin is installed from a local path.
        const isPluginFromLocalPath = utils.isUrlWithFileScheme(version);

        if (isPluginFromLocalPath) {
          pluginsFromLocalPath[id] = version;
        } else {
          if (!_.has(installedPluginVersions, id) ||
            installedPluginVersions[id] !== version) {
            // We do not have the plugin installed or the version has changed.
            shouldReinstallAllPlugins = true;
            Console.debug(`Plugin ${id} version have changed or it was added, will \
perform cordova plugins reinstall`);
          }
        }
      });

      const installedPluginsByName = Object.keys(this.listInstalledPluginVersions(true));

      // Check to see if we have any installed plugins that are not in the
      // current set of plugins.
      if (!shouldReinstallAllPlugins) {
        // We need to know which plugins were installed because they were
        // declared in cordova-plugins and which are just dependencies of others.
        // Luckily for us android.json and ios.json have that information.
        const androidJsonPath = files.pathJoin(this.pluginsDir, 'android.json');
        const iosJsonPath = files.pathJoin(this.pluginsDir, 'ios.json');

        const androidJson = files.exists(androidJsonPath) ? JSON.parse(files.readFile(
          androidJsonPath, 'utf8')) : { installed_plugins: {} };
        const iosJson = files.exists(iosJsonPath) ? JSON.parse(files.readFile(
          iosJsonPath, 'utf8')) : { installed_plugins: {} };

        let previouslyInstalledPlugins = _.union(
          Object.keys(androidJson.installed_plugins), Object.keys(iosJson.installed_plugins));

        // Now the problem is we have a list of names the plugins (name defined in the plugin.xml)
        // while in cordova-plugins we have can have their npm ids. We need to translate the list.
        const fetched = this.listFetchedPluginVersions();
        previouslyInstalledPlugins = previouslyInstalledPlugins.map(name => {
          return fetched[name].id;
        });

        previouslyInstalledPlugins.forEach(id => {
          if (!_.has(pluginVersions, id)) {
            Console.debug(`Plugin ${id} was removed, will \
perform cordova plugins reinstall`);
            shouldReinstallAllPlugins = true;
          }
        });
      }

      if (!_.isEmpty(pluginsFromLocalPath) && !shouldReinstallAllPlugins) {
        Console.debug('Reinstalling Cordova plugins added from the local path');
      }

      // We either reinstall all plugins or only those fetched from a local
      // path.
      if (shouldReinstallAllPlugins || !_.isEmpty(pluginsFromLocalPath)) {
        let pluginsToRemove;
        if (shouldReinstallAllPlugins) {
          pluginsToRemove = installedPluginsByName;
        } else {
          // Only try to remove plugins that are currently installed.
          pluginsToRemove = _.intersection(
            Object.keys(pluginsFromLocalPath),
            Object.keys(installedPluginVersions));
        }

        this.removePlugins(pluginsToRemove);

        let pluginVersionsToInstall;

        // Now install the necessary plugins.
        if (shouldReinstallAllPlugins) {
          pluginVersionsToInstall = pluginVersions;
        } else {
          pluginVersionsToInstall = pluginsFromLocalPath;
        }

        const pluginsToInstallCount = _.size(pluginVersionsToInstall);
        let installedPluginsCount = 0;

        buildmessage.reportProgress({ current: 0, end: pluginsToInstallCount });
        _.each(pluginVersionsToInstall, (version, id) => {
          this.addPlugin(id, version, pluginsConfiguration[id]);

          buildmessage.reportProgress({
            current: ++installedPluginsCount,
            end: pluginsToInstallCount
          });
        });

        this.ensurePluginsWereInstalled(pluginVersionsToInstall, pluginsConfiguration, true);
      }
    });
  }

  // Ensures that the Cordova plugins are installed
  ensurePluginsWereInstalled(requiredPlugins, pluginsConfiguration, retryInstall) {
    // List of all installed plugins. This should work for global / local / scoped cordova plugins.
    // Examples:
    // cordova-plugin-whitelist@1.3.2 => { 'cordova-plugin-whitelist': '1.3.2' }
    // com.cordova.plugin@file://.cordova-plugins/plugin => { 'com.cordova.plugin': 'file://.cordova-plugins/plugin' }
    // @scope/plugin@1.0.0 => { 'com.cordova.plugin': 'scope/plugin' }
    const installed = this.listInstalledPluginVersions();
    const installedPluginsNames = Object.keys(installed);
    const installedPluginsVersions = Object.values(installed);
    const missingPlugins = {};

    Object.keys(requiredPlugins).filter(plugin => {
      if (!installedPluginsNames.includes(plugin)) {
        Console.debug(`Plugin ${plugin} was not installed.`);
        if (retryInstall) {
          Console.debug(`Retrying to install ${plugin}.`);
          this.addPlugin(
            plugin,
            requiredPlugins[plugin],
            pluginsConfiguration[plugin]
          );
        }
        missingPlugins[plugin] = requiredPlugins[plugin];
      }
    });

    // All plugins were installed
    if (Object.keys(missingPlugins).length === 0) {
      return;
    }

    // Check one more time after re-installation.
    if (retryInstall) {
      this.ensurePluginsWereInstalled(missingPlugins, pluginsConfiguration, false);
    } else {
      // Fail, to prevent building and publishing faulty mobile app without at this moment we need to stop.
      throw new Error(`Some Cordova plugins installation failed: (${Object.keys(missingPlugins).join(', ')}).`);
    }
  }

  ensurePinnedPluginVersions(pluginVersions) {
    assert(pluginVersions);

    _.each(pluginVersions, (version, id) => {
      // Skip plugin specs that are not actual versions
      if (utils.isUrlWithSha(version) || utils.isUrlWithFileScheme(version)) {
        return;
      }

      const pinnedVersion = pinnedPluginVersions[id];

      if (pinnedVersion && semver.lt(version, pinnedVersion)) {
        Console.labelWarn(`Attempting to install plugin ${id}@${version}, but \
it should have a minimum version of ${pinnedVersion} to ensure compatibility \
with the current platform versions. Installing the minimum version for \
convenience, but you should adjust your dependencies.`);
        pluginVersions[id] = pinnedVersion;
      }
    });
  }

  // Cordova commands support

  get defaultOptions() {
    return {
      silent: !Console.verbose,
      verbose: Console.verbose,
      buildConfig: this.buildJsonPath,
    };
  }

  defaultEnvWithPathsAdded(...extraPaths) {
    let paths = (this.defaultPaths || []);
    paths.unshift(...extraPaths);
    const env = files.currentEnvWithPathsAdded(...paths);
    return env;
  }

  get defaultPaths() {
    const nodeBinDir = files.getCurrentNodeBinDir();

    // Add the ios-sim bin path so Cordova can find it
    const iosSimBinPath =
      files.pathJoin(files.getDevBundle(),
      'lib/node_modules/ios-sim/bin');

    return [nodeBinDir, iosSimBinPath];
  }

  runCommands(title, promiseOrAsyncFunction, env = this.defaultEnvWithPathsAdded(),
    cwd = this.projectRoot) {
    // Capitalize title for debug output
    Console.debug(title[0].toUpperCase() + title.slice(1));

    const oldCwd = process.cwd();
    if (cwd) {
      process.chdir(files.convertToOSPath(cwd));
    }

    const oldEnv = process.env;
    if (env) {
      // this preserves case insensitivity for PATH on windows
      Object.keys(env).forEach(key => {
        process.env[key] = env[key];
      });
    }

    try {
      const promise = (typeof promiseOrAsyncFunction === 'function') ?
        promiseOrAsyncFunction() : promiseOrAsyncFunction;
      return Promise.await(promise);
    } catch (error) {
      Console.arrowError('Errors executing Cordova commands:');
      Console.error();
      const consoleOptions = Console.options({ indent: 3 });
      Console.error(`While ${title}:`, consoleOptions);

      if (error instanceof CordovaError) {
        // Only print the message for errors thrown by cordova-lib, because
        // these are meant for end-user consumption.
        // But warn that they may not completely apply to our situation.
        // (We do print the stack trace if we are in verbose mode.)
        const errorMessage = Console.verbose ? (error.stack || error.message) :
          error.message;
        Console.error(`Cordova error: ${errorMessage}`, consoleOptions);
        Console.error(chalk.green(`(If the error message contains suggestions \
for a fix, note that this may not apply to the Meteor integration. You can try \
running again with the --verbose option to help diagnose the issue.)`),
          consoleOptions);
      } else {
        // Print stack trace for other errors by default, because the message
        // usually does not give us enough information to know what is going on
        const errorMessage = error && error.stack || error;
        Console.error(errorMessage, consoleOptions);
      };
      throw new main.ExitWithCode(1);
    } finally {
      if (cwd && oldCwd) {
        process.chdir(oldCwd);
      }
      if (env && oldEnv) {
        process.env = oldEnv;
      }
    }
  }
}

const CPp = CordovaProject.prototype;
["prepareFromAppBundle",
 "prepareForPlatform",
 "buildForPlatform",
].forEach(name => {
  CPp[name] = Profile(platform => {
    const prefix = `CordovaProject#${name}`;
    return name.endsWith("ForPlatform") ? `${prefix} for ${
      displayNameForPlatform(platform)
    }` : prefix;
  }, CPp[name]);
});
