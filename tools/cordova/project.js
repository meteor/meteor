import _ from 'underscore';
import chalk from 'chalk';
import files from '../files.js';
import utils from '../utils.js';
import { Console } from '../console.js';
import buildmessage from '../buildmessage.js';
import httpHelpers from '../http-helpers.js';

import { cordova, events, CordovaError } from 'cordova-lib';
import cordova_util from 'cordova-lib/src/cordova/util.js';
import PluginInfoProvider from 'cordova-lib/src/PluginInfoProvider.js';

const logIfVerbose = (...args) => {
  if (Console.verbose) {
    console.log(args);
  }
};

events.on('results', logIfVerbose);
events.on('log', logIfVerbose);
events.on('warn', console.warn);
events.on('verbose', logIfVerbose);

// Creates a Cordova project if necessary.
export function createCordovaProjectIfNecessary(projectContext) {
  const cordovaPath = projectContext.getProjectLocalDirectory('cordova-build');
  const appName = files.pathBasename(projectContext.projectDir);
  const cordovaProject = new CordovaProject(cordovaPath, appName);

  if (!files.exists(cordovaPath)) {
    Console.debug('Cordova project doesn\'t exist, creating one');
    files.mkdir_p(files.pathDirname(cordovaPath));
    Promise.await(cordovaProject.create());
  }

  return cordovaProject;
};

export default class CordovaProject {
  constructor(projectRoot, appName) {
    this.projectRoot = projectRoot;
    this.appName = appName;

    this.pluginsDir = files.pathJoin(this.projectRoot, 'plugins');
    this.localPluginsDir = files.pathJoin(this.projectRoot, 'local-plugins');
    this.tarballPluginsLockPath = files.pathJoin(this.projectRoot, 'cordova-tarball-plugins.json');
  }

  async create() {
    // Cordova app identifiers have to look like Java namespaces.
    // Change weird characters (especially hyphens) into underscores.
    const appId = 'com.meteor.userapps.' + this.appName.replace(/[^a-zA-Z\d_$.]/g, '_');
    return await cordova.raw.create(this.projectRoot, appId, this.appName);
  }

  chdirToProjectRoot() {
    process.chdir(this.projectRoot);
  }

  get defaultOptions() {
    return { silent: !Console.verbose, verbose: Console.verbose };
  }

  env(...extraPaths) {
    let paths = (this.defaultPaths || []);
    paths.unshift(...extraPaths);
    const env = files.currentEnvWithPathsAdded(paths);
    return env;
  }

  get defaultPaths() {
    const nodeBinDir = files.convertToOSPath(files.getCurrentNodeBinDir());
    return [nodeBinDir];
  }

  // Platforms

  getInstalledPlatforms() {
    return cordova_util.listPlatforms(this.projectRoot);
  }

  async addPlatform(platform) {
    this.chdirToProjectRoot();
    const options = _.extend(this.defaultOptions, { env: this.env() });
    return await cordova.raw.platform('add', platform, options);
  }

  async removePlatform(platform) {
    this.chdirToProjectRoot();
    const options = _.extend(this.defaultOptions, { env: this.env() });
    return await cordova.raw.platform('rm', platform, options);
  }

  // Plugins

  getInstalledPlugins() {
    let pluginInfoProvider = new PluginInfoProvider();
    return _.object(_.map(pluginInfoProvider.getAllWithinSearchPath(this.pluginsDir), plugin => {
      return [ plugin.id, plugin.version ];
    }));
  }

  async addPlugin(name, version, config) {
    let pluginTarget;
    if (version && utils.isUrlWithSha(version)) {
      pluginTarget = this.fetchCordovaPluginFromShaUrl(version, name);
    } else if (version && utils.isUrlWithFileScheme(version)) {
      // Strip file:// and compute the relative path from plugin to corodova-build
      pluginTarget = this.getCordovaLocalPluginPath(version);
    } else {
      pluginTarget = version ? `${name}@${version}` : name;
    }

    let additionalArgs = [];
    _.each(config || {}, (value, variable) => {
      additionalArgs.push('--variable');
      additionalArgs.push(variable + '=' + value);
    });
    pluginTarget.concat(additionalArgs)

    this.chdirToProjectRoot();
    const options = _.extend(this.defaultOptions, { env: this.env() });
    return await cordova.raw.plugin('add', pluginTarget, options);
  }

  async removePlugin(plugin, isFromTarballUrl = false) {
    verboseLog('Removing a plugin', name);

    this.chdirToProjectRoot();
    const options = _.extend(this.defaultOptions, { env: this.env() });
    await cordova.raw.plugin('rm', plugin, options);

    if (isFromTarballUrl) {
      Console.debug('Removing plugin from the tarball plugins lock', name);
      // also remove from tarball-url-based plugins lock
      var lock = getTarballPluginsLock(this.projectRoot);
      delete lock[name];
      writeTarballPluginsLock(this.projectRoot, lock);
    }
  }

  async removePlugins(pluginsToRemove) {
    Console.debug('Removing plugins', pluginsToRemove);

    // Loop through all of the plugins to remove and remove them one by one until
    // we have deleted proper amount of plugins. It's necessary to loop because
    // we might have dependencies between plugins.
    while (pluginsToRemove.length > 0) {
      await Promise.all(_.map(pluginsToRemove, (version, name) => {
        removePlugin(name, utils.isUrlWithSha(version));
      }));
      let installedPlugins = await this.installedPlugins();

      uninstalledPlugins = _.difference(
        Object.keys(pluginsToRemove), Object.keys(installedPlugins)
      );
      plugins = _.omit(pluginsToRemove, uninstalledPlugins);
    };
  }

  getTarballPluginsLock() {
    Console.debug('Will check for cordova-tarball-plugins.json' +
               ' for tarball-url-based plugins previously installed.');

    var tarballPluginsLock;
    try {
      var text = files.readFile(this.tarballPluginsLockPath, 'utf8');
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
    Console.debug('Fetching a tarball from url:', urlWithSha);
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
      return path.relative(this.projectRoot, path.resolve(projectDir, pluginPath));
    } else {
      return pluginPath;
    }
  }

  // Build the project
  async build(options) {
    this.chdirToProjectRoot();

    const env = this.env(options.extraPaths);
    options = _.extend(this.defaultOptions, options, { env: env });

    return await cordova.raw.build(options);
  }

  // Run the project
  async run(platform, isDevice, options) {
    this.chdirToProjectRoot();

    const env = this.env(options.extraPaths);
    options = _.extend(this.defaultOptions, options, { env: env },
      { platforms: [platform] });

    if (isDevice) {
      return await cordova.raw.run(options);
    } else {
      return await cordova.raw.emulate(options);
    }
  }
}
