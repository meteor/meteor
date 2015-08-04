import _ from 'underscore';
import { Console } from '../console.js';
import buildmessage from '../buildmessage.js';
import files from '../fs/files.js';
import utils from '../utils/utils.js';

// packages - list of strings
export function filterCordovaPackages(packages) {
// We hard-code the 'cordova' namespace
  var ret = {
    rest: [],
    plugins: []
  };

  _.each(packages, function (p) {
    var namespace = p.split(':')[0];
    var name = p.split(':').slice(1).join(':');
    if (namespace === 'cordova') {
      ret.plugins.push(name);
    } else {
      ret.rest.push(p); // leave it the same
    }
  });
  return ret;
}

// Ensures that the Cordova plugins are synchronized with the app-level
// plugins.
export function ensureCordovaPluginsAreSynchronized(cordovaProject, plugins,
  pluginsConfiguration = {}) {
  Console.debug('Ensuring that the Cordova plugins are synchronized with the app-level plugins', plugins);

  var installedPlugins = Promise.await(cordovaProject.getInstalledPlugins());

  // Due to the dependency structure of Cordova plugins, it is impossible to
  // upgrade the version on an individual Cordova plugin. Instead, whenever a
  // new Cordova plugin is added or removed, or its version is changed,
  // we just reinstall all of the plugins.
  var shouldReinstallPlugins = false;

  // Iterate through all of the plugins and find if any of them have a new
  // version. Additionally check if we have plugins installed from local path.
  var pluginsFromLocalPath = {};
  _.each(plugins, function (version, name) {
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
  _.each(installedPlugins, function (version, name) {
    if (!_.has(plugins, name)) {
      shouldReinstallPlugins = true;
    }
  });

  if (shouldReinstallPlugins || !_.isEmpty(pluginsFromLocalPath)) {
    buildmessage.enterJob({ title: "installing Cordova plugins"}, function () {
      installedPlugins = Promise.await(cordovaProject.getInstalledPlugins());

      if (shouldReinstallPlugins) {
        cordovaProject.removePlugins(installedPlugins);
      } else {
        cordovaProject.removePlugins(pluginsFromLocalPath);
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
      _.each(pluginsToInstall, function (version, name) {
        Promise.await(cordovaProject.addPlugin(name, version, pluginsConfiguration[name]));

        buildmessage.reportProgress({
          current: ++pluginsInstalled,
          end: pluginsCount
        });
      });
    });
  }
};
