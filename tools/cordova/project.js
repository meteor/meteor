import _ from 'underscore';
import util from 'util';
import path from 'path';
import assert from 'assert';
import chalk from 'chalk';

import isopackets from '../tool-env/isopackets.js'
import files from '../fs/files.js';
import utils from '../utils/utils.js';
import { Console } from '../console/console.js';
import buildmessage from '../utils/buildmessage.js';
import main from '../cli/main.js';
import httpHelpers from '../utils/http-helpers.js';

import { cordova as cordova_lib, events as cordova_events, CordovaError }
  from 'cordova-lib';
import cordova_util from 'cordova-lib/src/cordova/util.js';
import superspawn from 'cordova-lib/src/cordova/superspawn.js';
import PluginInfoProvider from 'cordova-lib/src/PluginInfoProvider.js';

import { AVAILABLE_PLATFORMS, displayNameForPlatform } from './index.js';
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
    this.projectContext = projectContext;

    this.projectRoot = projectContext.getProjectLocalDirectory('cordova-build');
    this.options = options;

    this.pluginsDir = files.pathJoin(this.projectRoot, 'plugins');

    this.createIfNeeded();
  }

  createIfNeeded() {
    buildmessage.assertInJob();

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

  prepareFromAppBundle(bundlePath, plugins) {
    assert(bundlePath);
    assert(plugins);

    buildmessage.assertInCapture();

    Console.debug('Preparing Cordova project from app bundle');

    buildmessage.enterJob({ title: `preparing Cordova project` }, () => {
      const builder = new CordovaBuilder(this.projectContext, this.projectRoot,
        { mobileServerUrl, settingsFile } = this.options);

      builder.processControlFile();

      if (buildmessage.jobHasMessages()) return;

      builder.writeConfigXmlAndCopyResources();
      builder.copyWWW(bundlePath);
      builder.copyBuildOverride();

      this.ensurePlatformsAreSynchronized();
      this.ensurePluginsAreSynchronized(plugins,
        builder.pluginsConfiguration);
    })
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

    this.runCommands(`building Cordova project for platform \
${displayNameForPlatform(platform)}`, async () => {
      await cordova_lib.raw.build(commandOptions);
    });
  }

  // Running

  async run(platform, isDevice, options = [], extraPaths) {
    options.push(isDevice ? '--device' : '--emulator');

    const env = this.defaultEnvWithPathsAdded(...extraPaths);

    this.runCommands(`running Cordova project for platform \
${displayNameForPlatform(platform)} with options ${options}`, async () => {
      const command = files.convertToOSPath(files.pathJoin(
        this.projectRoot, 'platforms', platform, 'cordova', 'run'));
      return await superspawn.spawn(command, options, {
          stdio: !Console.verbose ? 'pipe' : 'inherit',
          printCommand: !!Console.verbose,
          chmod: true
      });
    }, env);
  }

  // Platforms

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
      Console.error(`cordova: ${requirements.message}`);
      return false;
    }

    // We don't use ios-deploy, but open Xcode to run on a device instead
    requirements = _.reject(requirements,
      requirement => requirement.id === 'ios-deploy');

    const satisfied = _.every(requirements,
      requirement => requirement.installed);

    if (!satisfied) {
      Console.info();
      Console.info(`Make sure all installation requirements are satisfied \
before running or building for ${displayNameForPlatform(platform)}:`);
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

  updatePlatforms(platforms = this.listInstalledPlatforms()) {
    this.runCommands(`updating Cordova project for platforms \
${displayNamesForPlatforms(platform)}`, async () => {
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

  listInstalledPlugins() {
    const pluginInfoProvider = new PluginInfoProvider();
    const installedPlugins = pluginInfoProvider.getAllWithinSearchPath(
      files.convertToOSPath(this.pluginsDir));
    const fetchedPlugins = this.listFetchedPlugins();
    return _.object(installedPlugins.map(plugin => {
      const id = plugin.id;
      const version = fetchedPlugins[id] || plugin.version;
      return [id, version];
    }));
  }

  listFetchedPlugins() {
    const fetchJsonPath = files.pathJoin(this.pluginsDir, 'fetch.json');

    if (!files.exists(fetchJsonPath)) {
      return {};
    }

    const fetchedPluginsMetadata = JSON.parse(files.readFile(
      fetchJsonPath, 'utf8'));
    return _.object(_.map(fetchedPluginsMetadata, (metadata, name) => {
      const source = metadata.source;
      let version;
      if (source.type === 'registry') {
        version = source.id.split('@')[1];
      } else if (source.type === 'git') {
        version = `${source.url}#${source.ref}`;
      } else if (source.type === 'local') {
        version = source.path;
      }
      return [name, version];
    }));
  }

  targetForPlugin(name, version) {
    if (!version) {
      return name;
    }

    if (utils.isUrlWithSha(version)) {
      return this.convertToGitUrl(version);
    } else if (utils.isUrlWithFileScheme(version)) {
      // Strip file:// and resolve the path relative to the cordova-build
      // directory
      const pluginPath = this.resolveLocalPluginPath(version);
      // We need to check if the directory exists ourselves because Cordova
      // will try to install from npm (and fail with an unhelpful error message)
      // if the directory is not found
      if (!cordova_util.isDirectory(pluginPath)) {
        buildmessage.error(`Couldn't find local directory \
'${files.convertToOSPath(pluginPath)}'. \
(Attempting to install plugin ${name}).`);
        return null;
      }
      return files.convertToOSPath(pluginPath);
    } else {
      return `${name}@${version}`;
    }
  }

  convertToGitUrl(url) {
    // Matches GitHub tarball URLs, like:
    // https://github.com/meteor/com.meteor.cordova-update/tarball/92fe99b7248075318f6446b288995d4381d24cd2
    const match =
      url.match(/^https?:\/\/github.com\/(.+?)\/(.+?)\/tarball\/([0-9a-f]{40})/);
    if (match) {
        const [,organization,repository,sha] = match;
      // Convert them to a Git URL
      return `https://github.com/${organization}/${repository}.git#${sha}`;
    } else if (/\.git#[0-9a-f]{40}/.test(url)) {
      return url;
    } else {
      buildmessage.error(`Meteor no longer supports installing Cordova plugins \
from arbitrary tarball URLs. You can either add a plugin from a Git URL with \
a SHA reference, or from a local path. (Attempting to install from ${url}.)`);
      return null;
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

  addPlugin(name, version, config = {}) {
    const target = this.targetForPlugin(name, version);
    if (target) {
      const commandOptions = _.extend(this.defaultOptions,
        { cli_variables: config });

      this.runCommands(`adding plugin ${target} \
to Cordova project`, async () => {
        await cordova_lib.raw.plugin('add', [target], commandOptions);
      });
    }
  }

  removePlugins(plugins) {
    if (_.isEmpty(plugins)) return;

    this.runCommands(`removing plugins ${plugins} \
from Cordova project`, async () => {
      await cordova_lib.raw.plugin('rm', plugins, this.defaultOptions);
    });
  }

  // Ensures that the Cordova plugins are synchronized with the app-level
  // plugins.
  ensurePluginsAreSynchronized(plugins, pluginsConfiguration = {}) {
    assert(plugins);

    buildmessage.assertInCapture();

    buildmessage.enterJob({ title: "installing Cordova plugins"}, () => {
      const installedPlugins = this.listInstalledPlugins();

      // Due to the dependency structure of Cordova plugins, it is impossible to
      // upgrade the version on an individual Cordova plugin. Instead, whenever a
      // new Cordova plugin is added or removed, or its version is changed,
      // we just reinstall all of the plugins.
      let shouldReinstallAllPlugins = false;

      // Iterate through all of the plugins and find if any of them have a new
      // version. Additionally check if we have plugins installed from local path.
      const pluginsFromLocalPath = {};
      _.each(plugins, (version, name) => {
        // Check if plugin is installed from local path
        const isPluginFromLocalPath = utils.isUrlWithFileScheme(version);

        if (isPluginFromLocalPath) {
          pluginsFromLocalPath[name] = version;
        } else {
          if (utils.isUrlWithSha(version)) {
            version = this.convertToGitUrl(version);
          }

          if (!_.has(installedPlugins, name) ||
            installedPlugins[name] !== version) {
            // We do not have the plugin installed or the version has changed.
            shouldReinstallAllPlugins = true;
          }
        }
      });

      if (!_.isEmpty(pluginsFromLocalPath)) {
        Console.debug('Reinstalling Cordova plugins added from the local path');
      }

      // Check to see if we have any installed plugins that are not in the current
      // set of plugins.
      _.each(installedPlugins, (version, name) => {
        if (!_.has(plugins, name)) {
          shouldReinstallAllPlugins = true;
        }
      });

      if (shouldReinstallAllPlugins || !_.isEmpty(pluginsFromLocalPath)) {
        let pluginsToRemove;
        if (shouldReinstallAllPlugins) {
          pluginsToRemove = Object.keys(installedPlugins);
        } else {
          // Only try to remove plugins that are currently installed
          pluginsToRemove = _.intersection(
            Object.keys(pluginsFromLocalPath),
            Object.keys(installedPlugins));
        }

        this.removePlugins(pluginsToRemove);

        // Now install necessary plugins.

        if (shouldReinstallAllPlugins) {
          pluginsToInstall = plugins;
        } else {
          pluginsToInstall = pluginsFromLocalPath;
        }

        const pluginsCount = _.size(pluginsToInstall);
        let pluginsInstalled = 0;

        buildmessage.reportProgress({ current: 0, end: pluginsCount });
        _.each(pluginsToInstall, (version, name) => {
          this.addPlugin(name, version, pluginsConfiguration[name]);

          if (buildmessage.jobHasMessages()) return;

          buildmessage.reportProgress({
            current: ++pluginsInstalled,
            end: pluginsCount
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

  runCommands(title, asyncFunc, env = this.defaultEnvWithPathsAdded(),
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
      return Promise.await(asyncFunc());
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
        Console.error(errorMessage, consoleOptions);
        Console.error(chalk.green(`(If the error message contains suggestions \
for a fix, note that this may not apply to the Meteor integration. You can try \
running again with the --verbose option to help diagnose the issue.)`),
          consoleOptions);
      } else {
        // Print stack trace for other errors by default, because the message
        // usually does not give us enough information to know what is going on
        Console.error(error && error.stack || error, consoleOptions);
      };
      throw new main.ExitWithCode(1);
    } finally {
      if (oldCwd) {
        process.chdir(oldCwd);
      }
      if (oldEnv) {
        process.env = oldEnv;
      }
    }
  }
}
