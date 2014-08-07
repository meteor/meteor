var main = require('./main.js');
var path = require('path');
var _ = require('underscore');
var fs = require('fs');
var child_process = require('child_process');
var files = require('./files.js');
var buildmessage = require('./buildmessage.js');
var project = require('./project.js').project;
var auth = require('./auth.js');
var config = require('./config.js');
var release = require('./release.js');
var Future = require('fibers/future');
var runLog = require('./run-log.js');
var packageClient = require('./package-client.js');
var utils = require('./utils.js');
var archinfo = require('./archinfo.js');
var tropohouse = require('./tropohouse.js');
var packageCache = require('./package-cache.js');
var packageLoader = require('./package-loader.js');
var PackageSource = require('./package-source.js');
var compiler = require('./compiler.js');
var unipackage = require('./unipackage.js');
var execFileSync = require('./utils.js').execFileSync;

var cordova = exports;

var getLoadedPackages = _.once(function () {
  var uniload = require('./uniload.js');
  return uniload.load({
    packages: [ 'boilerplate-generator' ]
  });
});

var generateCordovaBoilerplate = function (clientDir, options) {
  var clientJsonPath = path.join(clientDir, 'program.json');
  var clientJson = JSON.parse(fs.readFileSync(clientJsonPath, 'utf8'));

  var manifest = _.map(clientJson.manifest, function (item) {
    if (item.type === 'js')
      return _.extend(item, { url: ('/js' + item.url) });
    return item;
  });

  var meteorRelease = project.getMeteorReleaseVersion();
  var Boilerplate = getLoadedPackages()['boilerplate-generator'].Boilerplate;
  var boilerplate = new Boilerplate('web.cordova', manifest, {
    urlMapper: function (url) { return url ? url.substr(1) : ''; },
    pathMapper: function (p) { return path.join(clientDir, p); },
    baseDataExtension: {
      includeCordova: true,
      meteorRuntimeConfig: JSON.stringify({
        meteorRelease: meteorRelease,
        ROOT_URL: 'http://' + options.host + ':' + options.port + '/',
        // XXX propagate it from options?
        ROOT_URL_PATH_PREFIX: '',
        DDP_DEFAULT_CONNECTION_URL: 'http://' + options.host + ':' + options.port
      })
    }
  });
  return boilerplate.toHTML();
};

var fetchCordovaPluginFromShaUrl =
  function (urlWithSha, localPluginsDir, pluginName) {
  var pluginPath = path.join(localPluginsDir, pluginName);
  var pluginTarballPath = pluginPath + '.tgz';
  var curlProcess =
    execFileSync('curl', ['-L', urlWithSha, '-o', pluginTarballPath]);

  if (! curlProcess.success)
    throw new Error("Failed to fetch the tarball from " + urlWithSha + ": " +
                    curlProcess.stderr);

  files.mkdir_p(pluginPath);
  var tarProcess = execFileSync('tar',
    ['xf', pluginTarballPath, '-C', pluginPath, '--strip-components=1']);
  if (! tarProcess.success)
    throw new Error("Failed to untar the tarball from " + urlWithSha + ": " +
                    tarProcess.stderr);
  files.rm_recursive(pluginTarballPath);
  return pluginPath;
};

var ensureCordovaPlatforms = function (platforms, cordovaPath) {
  var platformsOutput = execFileSync('cordova', ['platform', 'list'],
                                     { cwd: cordovaPath }).stdout;

  var installedPlatforms = _.map(platformsOutput.split('\n')[0].match(/Installed platforms: (.*)/)[1].split(', '), function (s) { return s.split(' ')[0]; });

  _.each(platforms, function (platform) {
    if (! _.contains(installedPlatforms, platform))
      execFileSync('cordova', ['platform', 'add', platform], { cwd: cordovaPath });
  });

  _.each(installedPlatforms, function (platform) {
    if (! _.contains(platforms, platform))
      execFileSync('cordova', ['platform', 'rm', platform], { cwd: cordovaPath });
  });

  return true;
};

// Creates a Cordova project if necessary and makes sure added Cordova
// platforms and Cordova plugins are up to date with the project's
// definition.
cordova.ensureCordovaProject = function (options, cordovaPath, bundlePath) {
  if (! options.platforms) {
    throw new Error("Must pass platforms to a Cordova project.");
  }

  var bundler = require(path.join(__dirname, 'bundler.js'));

  var webArchName = 'web.cordova';

  var bundleResult = bundler.bundle({
    outputPath: bundlePath,
    buildOptions: {
      minify: false, // XXX ! options.debug,
      arch: archinfo.host(),
      webArchs: [webArchName]
    }
  });

  if (bundleResult.errors) {
    throw new Error("Errors prevented bundling:\n" +
                    bundleResult.errors.formatMessages());
  }

  var programPath = path.join(bundlePath, 'programs');
  var localPluginsPath = path.join(cordovaPath, 'local-plugins');
  var newSettings = options.settings || {};

  if (! fs.existsSync(cordovaPath)) {
    execFileSync('cordova', ['create', path.basename(cordovaPath),
                             'com.meteor.' + options.appName,
                             options.appName.replace(/\s/g, '')],
                 { cwd: path.dirname(cordovaPath) });

    // XXX a hack as platforms management is not implemented yet
    var platforms = options.platforms || "firefoxos";
    _.each(platforms, function (platform) {
      execFileSync('cordova', ['platforms', 'add', platform],
        { cwd: cordovaPath });
    });


    // create a folder for storing local plugins
    // XXX cache them there
    files.mkdir_p(localPluginsPath);
  }

  var oldSettings = {};
  try {
    fs.readFileSync(path.join(cordovaPath, 'cordova-settings.json'), "utf8");
  } catch(err) {
    if (err.code !== "ENOENT")
      throw err;
  }

  var wwwPath = path.join(cordovaPath, "www");

  var cordovaProgramPath = path.join(programPath, webArchName);
  var cordovaProgramAppPath = path.join(cordovaProgramPath, 'app');

  // XXX hack, copy files from app folder one level up
  if (fs.existsSync(cordovaProgramAppPath)) {
    files.cp_r(cordovaProgramAppPath, cordovaProgramPath);
    files.rm_recursive(cordovaProgramAppPath);
  }

  // rewrite the www folder
  files.rm_recursive(wwwPath);
  files.cp_r(cordovaProgramPath, wwwPath);

  // clean up the temporary bundle directory
  files.rm_recursive(bundlePath);

  // generate index.html
  var indexHtml = generateCordovaBoilerplate(wwwPath, options);
  fs.writeFileSync(path.join(wwwPath, 'index.html'), indexHtml, 'utf8');

  var loaderPath = path.join(__dirname, 'client', 'meteor_cordova_loader.js');
  var loaderCode = fs.readFileSync(loaderPath);
  fs.writeFileSync(path.join(wwwPath, 'meteor_cordova_loader.js'), loaderCode);

  ensureCordovaPlatforms(options.platforms, cordovaPath);

  // Compare the state of plugins in the Cordova project and the required by the
  // Meteor project.
  // XXX compare the latest used sha's with the currently required sha's for
  // plugins fetched from a github/tarball url.
  var pluginsOutput = execFileSync('cordova', ['plugin', 'list'],
                                   { cwd: cordovaPath }).stdout;

  var installedPlugins = {};
  // Check if there are any plugins
  if (! pluginsOutput.match(/No plugins added/)) {
    _.each(pluginsOutput.split('\n'), function (line) {
      line = line.trim();
      if (line === '')
        return;
      var plugin = line.split(' ')[0];
      var version = line.split(' ')[1];
      installedPlugins[plugin] = version;
    });
  }

  var requiredPlugins = bundleResult.starManifest.cordovaDependencies;
  // XXX the project-level cordova plugins deps override the package-level ones
  _.extend(requiredPlugins, options.plugins || {});

  _.each(requiredPlugins, function (version, name) {
    // no-op if this plugin is already installed
    if (_.has(installedPlugins, name)
        && installedPlugins[name] === version
        && _.isEqual(oldSettings[name], newSettings[name]))
      return;

    if (_.has(installedPlugins, name))
      execFileSync('cordova', ['plugin', 'rm', name], { cwd: cordovaPath });

    // XXX do something different for plugins fetched from a url.
    var pluginInstallCommand = version ? name + '@' + version : name;

    if (version && utils.isUrlWithSha(version)) {
      pluginInstallCommand =
        fetchCordovaPluginFromShaUrl(version, localPluginsPath, name);
    }

    var additionalArgs = [];
    if (newSettings[name]) {
      if (! _.isObject(newSettings[name]))
        throw new Error("Meteor.settings.cordova." + name + " is expected to be an object");
      _.each(newSettings[name], function (value, variable) {
        additionalArgs.push("--variable");
        additionalArgs.push(variable + "=" + JSON.stringify(value));
      });
    }

    var execRes = execFileSync('cordova',
       ['plugin', 'add', pluginInstallCommand].concat(additionalArgs), { cwd: cordovaPath });
    if (! execRes.success)
      throw new Error("Failed to install plugin " + name + ": " + execRes.stderr);
  });

  _.each(installedPlugins, function (version, name) {
    if (! _.has(requiredPlugins, name))
      execFileSync('cordova', ['plugin', 'rm', name], { cwd: cordovaPath });
  });

  execFileSync('cordova', ['build'], { cwd: cordovaPath });
};

// Start the simulator or physical device for a specific platform.
// platformName is of the form ios/ios-device/android/android-device
cordova.execCordovaOnPlatform = function (platformName, cordovaPath, options) {
  // XXX error if an invalid platform
  var platform = platformName.split('-')[0];
  var isDevice = platformName.split('-')[1] === 'device';

  var args = [ isDevice ? 'run' : 'emulate',
               platform ];

  // XXX error if not a Cordova project
  var cordovaProcess = execFileSync('cordova', args, { cwd: cordovaPath });
  if (cordovaProcess.success) {
    if (options.verbose)
      console.log(cordovaProcess.stdout);
    return 0;
  } else {
    process.stderr.write(cordovaProcess.stderr);
    return 1;
  }
};

// packages - list of strings
cordova.filterPackages = function (packages) {
  var supportedPlatforms = ['ios', 'android'];
  // We hard-code the 'cordova' and 'platform' namespaces
  var ret = {
    rest: [],
    platforms: [],
    plugins: []
  };

  _.each(packages, function (p) {
    var namespace = p.split(':')[0];
    var name = p.split(':')[1];
    if (namespace === 'cordova')
      ret.plugins.push(name);
    else if (namespace === 'platform') {
      if (! _.contains(supportedPlatforms, name))
        throw new Error(name + ": no such platform");
      ret.platforms.push(name);
    } else
      ret.rest.push(p); // leave it the same
  });
  return ret;
};

main.registerCommand({
  name: 'cordova',
  minArgs: 1,
  maxArgs: 10,
  requiresApp: true,
  options: {
    settings: { type: String },
    port: { type: String, short: 'p', default: '3000' },
    host: { type: String, short: 'h', default: 'localhost' },
    verbose: { type: Boolean, short: 'v', default: false }
    // XX
  },
}, function (options) {
  var localDir = path.join(options.appDir, '.meteor', 'local');
  var cordovaPath = path.join(localDir, 'cordova-build');
  var bundleDir = path.join(localDir, 'bundle-tar');
  var appName = path.basename(options.appDir);

  var cordovaCommand = options.args[0];
  var cordovaArgs = options.args.slice(1);
  var cordovaSettings = {};

  if (options.settings) {
    cordovaSettings = JSON.parse(fs.readFileSync(options.settings, "utf8")).cordova;
  }

  if (cordovaCommand === 'plugin' || cordovaCommand === 'plugins') {
    var pluginsCommand = cordovaArgs[0];
    var pluginsArgs = cordovaArgs.slice(1);
    var plugins = _.map(pluginsArgs, function (str) { return str.split('@')[0]; });

    if (pluginsCommand === 'add') {
      var pluginsHash = _.object(_.map(pluginsArgs, function (str) {
        return str.split('@');
      }));

      // check that every plugin is specifying either an exact constraint or a
      // tarball url with sha
      utils.ensureOnlyExactVersions(pluginsHash);

      project.addCordovaPlugins(pluginsHash);
      console.log("=> Added", plugins.join(' '));
      return 0;
    } else if (pluginsCommand === 'remove' || pluginsCommand === 'rm') {
      project.removeCordovaPlugins(pluginsArgs);
      console.log("=> Removed", plugins.join(' '));
      return 0;
    }

    options.verbose = true;
  }

  var projectOptions = _.pick(options, 'port', 'host');
  projectOptions.appName = appName;
  projectOptions.cordovaSettings = cordovaSettings;
  projectOptions.plugins = project.getCordovaPlugins();
  projectOptions.platforms = project.getCordovaPlatforms();

  // XXX in Android simulators you can't access localhost and the correct way is
  // to use "10.0.2.2" instead.
  if (cordovaCommand === 'emulate' && cordovaArgs[0] === 'android' &&
      options.host === 'localhost')
    projectOptions.host = '10.0.2.2';

  if (_.contains(['emulate', 'build', 'prepare', 'compile', 'serve', 'create'], cordovaCommand)) {
    try {
      cordova.ensureCordovaProject(projectOptions, cordovaPath, bundleDir);
    } catch (e) {
      process.stderr.write('Errors preventing the Cordova project from build:\n');
      process.stderr.write(e.stack);
      return 1;
    }
  }

  // XXX error if not a Cordova project
  var cordovaProcess = execFileSync('cordova', options.args, { cwd: cordovaPath });
  if (cordovaProcess.success) {
    if (options.verbose)
      console.log(cordovaProcess.stdout);
    return 0;
  } else {
    process.stderr.write(cordovaProcess.stderr);
    return 1;
  }
});
