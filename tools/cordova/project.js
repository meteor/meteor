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

import { AVAILABLE_PLATFORMS, displayNameForPlatform } from './index.js';
import { CordovaBuilder } from './builder.js';

function loadDependenciesFromCordovaPackageIfNeeded() {
  if (typeof Cordova !== 'undefined') return;

  ({ Cordova } = isopackets.load('cordova-support').cordova);
  ({ cordova, events, CordovaError, superspawn, cordova_util, PluginInfoProvider } = Cordova);

  events.on('results', logIfVerbose);
  events.on('log', logIfVerbose);
  events.on('warn', log);
  events.on('verbose', logIfVerbose);
}

function logIfVerbose(...args) {
  if (Console.verbose) {
    log(...args);
  }
};

function log(...args) {
  Console.rawInfo(`%% ${util.format.apply(null, args)}\n`);
}

export class CordovaProject {
  constructor(projectContext, appName = files.pathBasename(projectContext.projectDir)) {
    loadDependenciesFromCordovaPackageIfNeeded();

    this.projectContext = projectContext;

    this.projectRoot = projectContext.getProjectLocalDirectory('cordova-build');
    this.appName = appName;

    this.pluginsDir = files.pathJoin(this.projectRoot, 'plugins');
    this.localPluginsDir = files.pathJoin(this.projectRoot, 'local-plugins');
    this.tarballPluginsLockPath = files.pathJoin(this.projectRoot, 'cordova-tarball-plugins.json');

    this.createIfNeeded();
  }

  // Creating

  createIfNeeded() {
    buildmessage.assertInCapture();

    if (!files.exists(this.projectRoot)) {
      buildmessage.enterJob({ title: "creating Cordova project" }, () => {
        files.mkdir_p(files.pathDirname(this.projectRoot));
        // Cordova app identifiers have to look like Java namespaces.
        // Change weird characters (especially hyphens) into underscores.
        const appId = 'com.meteor.userapps.' + this.appName.replace(/[^a-zA-Z\d_$.]/g, '_');

        // Don't set cwd to project root in runCommands because it doesn't exist yet
        this.runCommands(async () => {
          await cordova.raw.create(files.convertToOSPath(this.projectRoot), appId, this.appName);
        }, this.defaultEnvWithPathsAdded(), null);
      });
    }
  }

  // Preparing

  prepare(bundlePath, plugins, options = {}) {
    assert(bundlePath);
    assert(plugins);

    Console.debug('Preparing Cordova project');

    const builder = new CordovaBuilder(this, bundlePath, plugins, options);
    builder.start();
  }

  // Building

  build(platforms = this.installedPlatforms, options = [], extraPaths) {
    const env = this.defaultEnvWithPathsAdded(...extraPaths);
    const commandOptions = _.extend(this.defaultOptions,
      { platforms: platforms, options: options });

    Console.debug('Building Cordova project', commandOptions);

    this.runCommands(async () => {
      await cordova.raw.build(commandOptions);
    });
  }

  // Running

  async run(platform, isDevice, options = [], extraPaths) {
    const env = this.defaultEnvWithPathsAdded(...extraPaths);
    const commandOptions = _.extend(this.defaultOptions,
      { platforms: [platform], options: options });

    Console.debug('Running Cordova project', commandOptions);


    this.runCommands(async () => {
      if (isDevice) {
        await cordova.raw.run(commandOptions);
      } else {
        await cordova.raw.emulate(commandOptions);
      }
    }, env);
  }

  // Platforms

  checkPlatformRequirements(platform) {
    if (platform === 'ios' && process.platform !== 'darwin') {
      Console.warn("Currently, it is only possible to build iOS apps on an OS X system.");
      return false;
    }

    const installedPlatforms = this.installedPlatforms;
    const inProject = _.contains(installedPlatforms, platform);
    if (!inProject) {
      Console.warn(`Please add the ${displayNameForPlatform(platform)} \
platform to your project first.`);
      Console.info(`Run: ${Console.command(`meteor add-platform ${platform}`)}`);
      return false;
    }

    const allRequirements = this.runCommands(
      async () => {
        return await cordova.raw.requirements([platform], this.defaultOptions);
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
    requirements = _.reject(requirements, requirement => requirement.id === 'ios-deploy');

    const satisfied = _.every(requirements, requirement => requirement.installed);
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

  get installedPlatforms() {
    return cordova_util.listPlatforms(files.convertToOSPath(this.projectRoot));
  }

  updatePlatforms(platforms = this.installedPlatforms) {
    this.runCommands(async () => {
      await cordova.raw.platform('update', platforms, this.defaultOptions);
    });
  }

  addPlatform(platform) {
    this.runCommands(async () => {
      await cordova.raw.platform('add', platform, this.defaultOptions);
    });
  }

  removePlatform(platform) {
    this.runCommands(async () => {
      await cordova.raw.platform('rm', platform, this.defaultOptions);
    });
  }

  get cordovaPlatformsInApp() {
    return this.projectContext.platformList.getCordovaPlatforms();
  }

  // Ensures that the Cordova platforms are synchronized with the app-level
  // platforms.
  ensurePlatformsAreSynchronized(platforms = this.cordovaPlatformsInApp) {
    const installedPlatforms = this.installedPlatforms;

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

  get installedPlugins() {
    const pluginInfoProvider = new PluginInfoProvider();
    const plugins = pluginInfoProvider.getAllWithinSearchPath(
      files.convertToOSPath(this.pluginsDir));
    return _.object(plugins.map(plugin => {
      return [ plugin.id, plugin.version ];
    }));
  }

  addPlugin(name, version, config) {
    let pluginTarget;
    if (version && utils.isUrlWithSha(version)) {
      pluginTarget = files.convertToOSPath(this.fetchCordovaPluginFromShaUrl(version, name));
    } else if (version && utils.isUrlWithFileScheme(version)) {
      // Strip file:// and compute the relative path from plugin to corodova-build
      pluginTarget = files.convertToOSPath(this.getCordovaLocalPluginPath(version));
    } else {
      pluginTarget = version ? `${name}@${version}` : name;
    }

    Console.debug('Adding a Cordova plugin', pluginTarget);

    let additionalArgs = [];
    _.each(config || {}, (value, variable) => {
      additionalArgs.push('--variable');
      additionalArgs.push(variable + '=' + value);
    });
    pluginTarget.concat(additionalArgs)

    this.runCommands(async () => {
      await cordova.raw.plugin('add', pluginTarget, this.defaultOptions);
    });

    if (utils.isUrlWithSha(version)) {
      Console.debug('Adding plugin to the tarball plugins lock', name);
      let lock = this.getTarballPluginsLock(this.projectRoot);
      lock[name] = version;
      this.writeTarballPluginsLock(this.projectRoot, lock);
    }
  }

  removePlugin(plugin, isFromTarballUrl = false) {
    Console.debug('Removing a Cordova plugin', plugin);

    this.runCommands(async () => {
      await cordova.raw.plugin('rm', plugin, this.defaultOptions);
    });

    if (isFromTarballUrl) {
      Console.debug('Removing plugin from the tarball plugins lock', plugin);
      // also remove from tarball-url-based plugins lock
      let lock = getTarballPluginsLock(this.projectRoot);
      delete lock[name];
      writeTarballPluginsLock(this.projectRoot, lock);
    }
  }

  removePlugins(pluginsToRemove) {
    Console.debug('Removing Cordova plugins', pluginsToRemove);

    if (_.isEmpty(pluginsToRemove)) return;

    this.runCommands(async () => {
      await cordova.raw.plugin('rm', Object.keys(pluginsToRemove), this.defaultOptions);
    });
  }

  getTarballPluginsLock() {
    Console.debug('Will check for cordova-tarball-plugins.json' +
               ' for tarball-url-based plugins previously installed.');

    var tarballPluginsLock;
    try {
      var text = files.readFile(files.convertToOSPath(this.tarballPluginsLockPath), 'utf8');
      tarballPluginsLock = JSON.parse(text);

      Console.debug('The tarball plugins lock:', tarballPluginsLock);
    } catch (err) {
      if (err.code !== 'ENOENT')
        throw err;

      Console.debug('The tarball plugins file was not found.');
      tarballPluginsLock = {};
    }

    return tarballPluginsLock;
  }

  writeTarballPluginsLock(tarballPluginsLock) {
    Console.debug('Will write cordova-tarball-plugins.json');

    var tarballPluginsLockPath =
      files.pathJoin(this.projectRoot, 'cordova-tarball-plugins.json');

    files.writeFile(
      tarballPluginsLockPath,
      JSON.stringify(tarballPluginsLock),
      'utf8'
    );
  }

  fetchCordovaPluginFromShaUrl(urlWithSha, pluginName) {
    Console.debug('Fetching a Cordova plugin tarball from url:', urlWithSha);
    var pluginPath = files.pathJoin(this.localPluginsDir, pluginName);

    var pluginTarball = buildmessage.enterJob("downloading Cordova plugin", () => {
      return httpHelpers.getUrl({
        url: urlWithSha,
        encoding: null,
        // Needed to follow GitHub tarball redirect
        followAllRedirects: true,
        progress: buildmessage.getCurrentProgressTracker()
      });
    });

    Console.debug('Create a folder for the plugin', pluginPath);
    files.rm_recursive(pluginPath);
    files.extractTarGz(pluginTarball, pluginPath);

    var actualPluginName = '';
    try {
      var xmlPath = files.pathJoin(pluginPath, 'plugin.xml');
      var xmlContent = files.readFile(xmlPath, 'utf8');

      actualPluginName = xmlContent.match(/<plugin[^>]+>/)[0].match(/\sid="([^"]+)"/)[1];
    } catch (err) {
      throw new Error(
        pluginName + ': Failed to parse the plugin from tarball');
    }

    if (actualPluginName !== pluginName)
      throw new Error(pluginName +
                      ': The plugin from tarball has a different name - ' +
                      actualPluginName);

    return pluginPath;
  }

  // Strips the file:// from the path and if a relative path was used, it translates it to a relative path to the
  // cordova-build directory instead of meteor project directory.
  getCordovaLocalPluginPath(pluginPath) {
    pluginPath = pluginPath.substr("file://".length);
    if (utils.isPathRelative(pluginPath)) {
      return path.relative(
        this.projectRoot,
        path.resolve(this.projectContext.projectDir, pluginPath));
    } else {
      return pluginPath;
    }
  }

  // Ensures that the Cordova plugins are synchronized with the app-level
  // plugins.
  ensurePluginsAreSynchronized(plugins, pluginsConfiguration = {}) {
    buildmessage.assertInCapture();

    Console.debug('Ensuring Cordova plugins are synchronized', plugins,
      pluginsConfiguration);

    var installedPlugins = this.installedPlugins;

    // Due to the dependency structure of Cordova plugins, it is impossible to
    // upgrade the version on an individual Cordova plugin. Instead, whenever a
    // new Cordova plugin is added or removed, or its version is changed,
    // we just reinstall all of the plugins.
    var shouldReinstallPlugins = false;

    // Iterate through all of the plugins and find if any of them have a new
    // version. Additionally check if we have plugins installed from local path.
    var pluginsFromLocalPath = {};
    _.each(plugins, (version, name) => {
      // Check if plugin is installed from local path
      let pluginFromLocalPath = utils.isUrlWithFileScheme(version);
      if (pluginFromLocalPath) {
        pluginsFromLocalPath[name] = version;
      }

      // XXX there is a hack here that never updates a package if you are
      // trying to install it from a URL, because we can't determine if
      // it's the right version or not
      if (!_.has(installedPlugins, name) ||
        (installedPlugins[name] !== version && !pluginFromLocalPath)) {
        // The version of the plugin has changed, or we do not contain a plugin.
        shouldReinstallPlugins = true;
      }
    });

    if (!_.isEmpty(pluginsFromLocalPath)) {
      Console.debug('Reinstalling Cordova plugins added from the local path');
    }

    // Check to see if we have any installed plugins that are not in the current
    // set of plugins.
    _.each(installedPlugins, (version, name) => {
      if (!_.has(plugins, name)) {
        shouldReinstallPlugins = true;
      }
    });

    if (shouldReinstallPlugins || !_.isEmpty(pluginsFromLocalPath)) {
      buildmessage.enterJob({ title: "installing Cordova plugins"}, () => {
        installedPlugins = this.installedPlugins;

        if (shouldReinstallPlugins) {
          this.removePlugins(installedPlugins);
        } else {
          this.removePlugins(pluginsFromLocalPath);
        }

        // Now install necessary plugins.
        var pluginsInstalled, pluginsToInstall;

        if (shouldReinstallPlugins) {
          pluginsInstalled = 0;
          pluginsToInstall = plugins;
        } else {
          pluginsInstalled = _.size(installedPlugins);
          pluginsToInstall = pluginsFromLocalPath;
        }

        var pluginsCount = _.size(plugins);

        buildmessage.reportProgress({ current: 0, end: pluginsCount });
        _.each(pluginsToInstall, (version, name) => {
          this.addPlugin(name, version, pluginsConfiguration[name]);

          buildmessage.reportProgress({
            current: ++pluginsInstalled,
            end: pluginsCount
          });
        });
      });
    }
  };

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
    return [nodeBinDir];
  }

  runCommands(asyncFunc, env = this.defaultEnvWithPathsAdded(),
    cwd = this.projectRoot) {
    const oldCwd = process.cwd();
    if (cwd) {
      process.chdir(files.convertToOSPath(cwd));
    }

    superspawn.setEnv(env);

    try {
      return Promise.await(asyncFunc());
    } catch (error) {
      if (error instanceof CordovaError) {
        Console.error(`cordova: ${error.message}`);
        Console.error(chalk.green("Try running again with the --verbose option \
to help diagnose the issue."));
        throw new main.ExitWithCode(1);
      } else {
        throw error;
      }
    } finally {
      if (oldCwd) {
        process.chdir(oldCwd);
      }
    }
  }
}
