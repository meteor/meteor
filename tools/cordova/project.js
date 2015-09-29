import _ from 'underscore';
import util from 'util';
import path from 'path';
import assert from 'assert';
import chalk from 'chalk';
import semver from 'semver';

import isopackets from '../tool-env/isopackets.js';
import files from '../fs/files.js';
import utils from '../utils/utils.js';
import { Console } from '../console/console.js';
import buildmessage from '../utils/buildmessage.js';
import main from '../cli/main.js';
import httpHelpers from '../utils/http-helpers.js';
import { execFileSync, execFileAsync } from '../utils/processes.js';

import './protect-string-proto.js'; // must always come before 'cordova-lib'
import { cordova as cordova_lib, events as cordova_events, CordovaError }
  from 'cordova-lib';
import cordova_util from 'cordova-lib/src/cordova/util.js';
import superspawn from 'cordova-lib/src/cordova/superspawn.js';
import PluginInfoProvider from 'cordova-lib/src/PluginInfoProvider.js';

import { AVAILABLE_PLATFORMS, displayNameForPlatform, displayNamesForPlatforms,
  newPluginId, convertPluginVersions, convertToGitUrl,
  installationInstructionsUrlForPlatform } from './index.js';
import { CordovaBuilder } from './builder.js';

cordova_events.on('results', logIfVerbose);
cordova_events.on('log', logIfVerbose);
cordova_events.on('warn', log);

function logIfVerbose(...args) {
  if (Console.verbose) {
    log(...args);
  }
};

function log(...args) {
  Console.rawInfo(`%% ${util.format.apply(null, args)}\n`);
}

export class CordovaProject {
  constructor(projectContext, options = {}) {
    if (process.platform === 'win32') {
      Console.warn(`Building mobile apps on a Windows system is not \
yet supported.`);
      throw new main.ExitWithCode(1);
    }

    this.projectContext = projectContext;

    this.projectRoot = projectContext.getProjectLocalDirectory('cordova-build');
    this.options = options;

    this.pluginsDir = files.pathJoin(this.projectRoot, 'plugins');

    this.createIfNeeded();
  }

  createIfNeeded() {
    buildmessage.assertInJob();

    // Check if we have an existing Cordova project directory with outdated
    // platforms. In that case, we remove the whole directory to avoid issues.
    if (files.exists(this.projectRoot)) {
      const installedPlatforms = this.listInstalledPlatforms();

      // XXX Decide whether to update these if we update cordova-lib.
      // If we can guarantee there are no issues going forward, we may want to
      // use updatePlatforms instead of removing the whole directory.
      const minPlatformVersions = {
        'android': '4.1.0',
        'ios': '3.9.0'
      }

      const outdated = _.some(minPlatformVersions, (minVersion, platform) => {
        // If the platform is not installed, it cannot be outdated
        if (!_.contains(installedPlatforms, platform)) return false;

        const installedVersion = this.installedVersionForPlatform(platform);
        // If we cannot establish the installed version, we consider it outdated
        if (!installedVersion) return true;

        return semver.lt(installedVersion, minVersion);
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

      const builder = new CordovaBuilder(this.projectContext, templatePath,
        { mobileServerUrl, settingsFile } = this.options);

      builder.processControlFile();

      if (buildmessage.jobHasMessages()) return;

      // Don't copy resources (they will be copied as part of the prepare)
      builder.writeConfigXmlAndCopyResources(false);

      // Create the Cordova project root directory
      files.mkdir_p(files.pathDirname(this.projectRoot));

      const config = { lib:
        { www: { url: files.convertToOSPath(templatePath) } } };

      // Don't set cwd to project root in runCommands because it doesn't
      // exist yet
      this.runCommands('creating Cordova project', async () => {
        // No need to pass in appName and appId because these are set from
        // the generated config.xml
        await cordova_lib.raw.create(files.convertToOSPath(this.projectRoot),
          undefined, undefined, config);
      }, undefined, null);
    }
  }

  // Preparing

  prepareFromAppBundle(bundlePath, pluginVersions) {
    assert(bundlePath);
    assert(pluginVersions);

    buildmessage.assertInJob();

    Console.debug('Preparing Cordova project from app bundle');

    const builder = new CordovaBuilder(this.projectContext, this.projectRoot,
      { mobileServerUrl, settingsFile } = this.options);

    builder.processControlFile();

    if (buildmessage.jobHasMessages()) return;

    builder.writeConfigXmlAndCopyResources();
    builder.copyWWW(bundlePath);
    builder.copyBuildOverride();

    this.ensurePlatformsAreSynchronized();
    this.ensurePluginsAreSynchronized(pluginVersions,
      builder.pluginsConfiguration);
  }

  prepareForPlatform(platform) {
    assert(platform);

    const commandOptions = _.extend(this.defaultOptions,
      { platforms: [platform] });

    this.runCommands(`preparing Cordova project for platform \
${displayNameForPlatform(platform)}`, async () => {
      await cordova_lib.raw.prepare(commandOptions);
    });
  }

  // Building (includes prepare)

  buildForPlatform(platform, options = [], extraPaths) {
    assert(platform);

    const commandOptions = _.extend(this.defaultOptions,
      { platforms: [platform], options: options });

    this.runCommands(`building Cordova app for platform \
${displayNameForPlatform(platform)}`, async () => {
      await cordova_lib.raw.build(commandOptions);
    });
  }

  // Running

  async run(platform, isDevice, options = [], extraPaths) {
    options.push(isDevice ? '--device' : '--emulator');

    const env = this.defaultEnvWithPathsAdded(...extraPaths);

    const command = files.convertToOSPath(files.pathJoin(
      this.projectRoot, 'platforms', platform, 'cordova', 'run'));

    this.runCommands(`running Cordova app for platform \
${displayNameForPlatform(platform)} with options ${options}`,
    execFileAsync(command, options, {
      env: env,
      cwd: this.projectRoot,
      stdio: Console.verbose ? 'inherit' : 'pipe',
      waitForClose: false })
    ), null, null;
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
        return await cordova_lib.raw.requirements([platform],
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

      const url = installationInstructionsUrlForPlatform(platform);
      if (url) {
        Console.info();
        Console.info("Please follow the installation instructions here:");
        Console.info(Console.url(url));
      }

      Console.info();

      if (!Console.verbose) {
        Console.info("Specify the --verbose option to see more details about \
the status of individual requirements.");
        return false;
      }

      Console.info("Status of the requirements:");
      for (requirement of requirements) {
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
      await cordova_lib.raw.platform('update', platforms, this.defaultOptions);
    });
  }

  addPlatform(platform) {
    this.runCommands(`adding platform ${displayNameForPlatform(platform)} \
to Cordova project`, async () => {
      await cordova_lib.raw.platform('add', platform, this.defaultOptions);
    });
  }

  removePlatform(platform) {
    this.runCommands(`removing platform ${displayNameForPlatform(platform)} \
from Cordova project`, async () => {
      await cordova_lib.raw.platform('rm', platform, this.defaultOptions);
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

    for (platform of platforms) {
      if (_.contains(installedPlatforms, platform)) continue;

      this.addPlatform(platform);
    }

    for (platform of installedPlatforms) {
      if (!_.contains(platforms, platform) &&
        _.contains(AVAILABLE_PLATFORMS, platform)) {
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
  listInstalledPluginVersions() {
    const pluginInfoProvider = new PluginInfoProvider();
    const installedPluginVersions = pluginInfoProvider.getAllWithinSearchPath(
      files.convertToOSPath(this.pluginsDir));
    const fetchedPluginVersions = this.listFetchedPluginVersions();
    return _.object(installedPluginVersions.map(pluginInfo => {
      const id = pluginInfo.id;
      const version = fetchedPluginVersions[id] || pluginInfo.version;
      return [id, version];
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
    return _.object(_.map(fetchedPluginsMetadata, (metadata, id) => {
      const source = metadata.source;
      let version;
      if (source.type === 'registry') {
        version = source.id.split('@')[1];
      } else if (source.type === 'git') {
        version = `${source.url}#${source.ref}`;
      } else if (source.type === 'local') {
        version = `file://${source.path}`;
      }
      return [id, version];
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
      if (!cordova_util.isDirectory(pluginPath)) {
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
      return path.resolve(this.projectContext.projectDir, pluginPath);
    } else {
      return pluginPath;
    }
  }

  addPlugin(id, version, config = {}) {
    const target = this.targetForPlugin(id, version);
    if (target) {
      const commandOptions = _.extend(this.defaultOptions,
        { cli_variables: config });

      this.runCommands(`adding plugin ${target} \
to Cordova project`, async () => {
        await cordova_lib.raw.plugin('add', [target], commandOptions);
      });
    }
  }

  // plugins is an array of plugin IDs.
  removePlugins(plugins) {
    if (_.isEmpty(plugins)) return;

    this.runCommands(`removing plugins ${plugins} \
from Cordova project`, async () => {
      await cordova_lib.raw.plugin('rm', plugins, this.defaultOptions);
    });
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

      if (buildmessage.jobHasMessages()) return;

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
          }
        }
      });

      if (!_.isEmpty(pluginsFromLocalPath)) {
        Console.debug('Reinstalling Cordova plugins added from the local path');
      }

      // Check to see if we have any installed plugins that are not in the
      // current set of plugins.
      _.each(installedPluginVersions, (version, id) => {
        if (!_.has(pluginVersions, id)) {
          shouldReinstallAllPlugins = true;
        }
      });

      // We either reinstall all plugins or only those fetched from a local
      // path.
      if (shouldReinstallAllPlugins || !_.isEmpty(pluginsFromLocalPath)) {
        let pluginsToRemove;
        if (shouldReinstallAllPlugins) {
          pluginsToRemove = Object.keys(installedPluginVersions);
        } else {
          // Only try to remove plugins that are currently installed.
          pluginsToRemove = _.intersection(
            Object.keys(pluginsFromLocalPath),
            Object.keys(installedPluginVersions));
        }

        this.removePlugins(pluginsToRemove);

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
      }
    });
  }

  // Cordova commands support

  get defaultOptions() {
    return { silent: !Console.verbose, verbose: Console.verbose };
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
      process.env = env;
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
