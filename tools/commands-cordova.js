var main = require('./main.js');
var path = require('path');
var _ = require('underscore');
var fs = require('fs');
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

var cordova = exports;

var supportedPlatforms = ['ios', 'android', 'firefoxos'];

var localCordova = path.join(files.getCurrentToolsDir(),
  "scripts", "cordova.sh");

var localAdb = path.join(files.getCurrentToolsDir(),
  "android_bundle", "android-sdk", "platform-tools", "adb");

var execFileAsyncOrThrow = function (file, args, opts) {
  var execFileAsync = require('./utils.js').execFileAsync;
  if (_.contains([localCordova, localAdb], file))
    ensureAndroidBundle();

  var p = execFileAsync(file, args, opts);
  p.on('close', function (code) {
    if (code)
      throw new Error(file + ' ' + args.join(' ') +
                      ' exited with non-zero code: ' + code);
  });
};

var execFileSyncOrThrow = function (file, args, opts) {
  var execFileSync = require('./utils.js').execFileSync;
  if (_.contains([localCordova, localAdb], file))
    ensureAndroidBundle();

  var process = execFileSync(file, args, opts);
  if (! process.success)
    throw new Error(process.stderr + '\n\n' + process.stdout);
  return process;
};

var ensureAndroidBundle = function () {
  execFileSyncOrThrow('sh',
    [path.join(files.getCurrentToolsDir(), 'scripts', 'ensure_android_bundle.sh')]);
};

var getLoadedPackages = _.once(function () {
  var uniload = require('./uniload.js');
  return uniload.load({
    packages: [ 'boilerplate-generator', 'logging' ]
  });
});

var generateCordovaBoilerplate = function (clientDir, options) {
  var clientJsonPath = path.join(clientDir, 'program.json');
  var clientJson = JSON.parse(fs.readFileSync(clientJsonPath, 'utf8'));

  var meteorRelease = project.getMeteorReleaseVersion();
  var Boilerplate = getLoadedPackages()['boilerplate-generator'].Boilerplate;
  var boilerplate = new Boilerplate('web.cordova', clientJson.manifest, {
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
    execFileSyncOrThrow('curl', ['-L', urlWithSha, '-o', pluginTarballPath]);

  if (! curlProcess.success)
    throw new Error("Failed to fetch the tarball from " + urlWithSha + ": " +
                    curlProcess.stderr);

  files.mkdir_p(pluginPath);
  var tarProcess = execFileSyncOrThrow('tar',
    ['xf', pluginTarballPath, '-C', pluginPath, '--strip-components=1']);
  if (! tarProcess.success)
    throw new Error("Failed to untar the tarball from " + urlWithSha + ": " +
                    tarProcess.stderr);
  files.rm_recursive(pluginTarballPath);
  return pluginPath;
};

cordova.checkIsValidPlatform = function (name) {
  if (! _.contains(supportedPlatforms, name))
    throw new Error(name + ": no such platform");
};

cordova.checkIsValidPlugin = function (name) {
  var pluginHash = {};
  pluginHash[name.split('@')[0]] = name.split('@')[1];

  // check that every plugin is specifying either an exact constraint or a
  // tarball url with sha
  utils.ensureOnlyExactVersions(pluginHash);
};

// options
//  - debug
var getBundle = function (bundlePath, webArchs, options) {
  var bundler = require(path.join(__dirname, 'bundler.js'));

  var bundleResult = bundler.bundle({
    outputPath: bundlePath,
    buildOptions: {
      minify: ! options.debug,
      arch: archinfo.host(),
      webArchs: webArchs
    }
  });

  if (bundleResult.errors) {
    throw new Error("Errors prevented bundling:\n" +
                    bundleResult.errors.formatMessages());
  }

  return bundleResult;
};

var localPluginsPathFromCordovaPath = function (cordovaPath) {
  return path.join(cordovaPath, 'local-plugins');
};

////////////////////////////////////////////////////////////////////////////////
// ensureCordova
////////////////////////////////////////////////////////////////////////////////

// Creates a Cordova project if necessary.
cordova.ensureCordovaProject = function (localPath, appName) {
  var cordovaPath = path.join(localPath, 'cordova-build');
  var localPluginsPath = localPluginsPathFromCordovaPath(cordovaPath);
  if (! fs.existsSync(cordovaPath)) {
    try {
      var creation = execFileSyncOrThrow(localCordova,
        ['create', path.basename(cordovaPath), 'com.meteor.' + appName, appName.replace(/\s/g, '')],
        { cwd: path.dirname(cordovaPath) });

      // create a folder for storing local plugins
      // XXX cache them there
      files.mkdir_p(localPluginsPath);
    } catch (err) {
      process.stderr.write("Error creating Cordova project: " +
        err.message + "\n");
    }
  }
};

// Ensures that the Cordova platforms are synchronized with the app-level
// platforms.
cordova.ensureCordovaPlatforms = function (localPath) {
  var cordovaPath = path.join(localPath, 'cordova-build');
  var platforms = project.getCordovaPlatforms();
  var platformsList = execFileSyncOrThrow(localCordova, ['platform', 'list'],
                                   { cwd: cordovaPath });

  // eg. ['android 3.5.0', 'ios 3.5.0']
  var platformsOutput = platformsList.stdout.split('\n')[0];
  var platformsStrings = platformsOutput.match(/Installed platforms: (.*)/)[1];

  if (! platformsStrings)
    throw new Error('Failed to parse the output of `cordova platform list`: ' +
                    platofrmsList.stdout);

  var installedPlatforms = _.map(platformsStrings.split(', '), function (s) {
    return s.split(' ')[0];
  });

  _.each(platforms, function (platform) {
    if (! _.contains(installedPlatforms, platform) &&
          _.contains(supportedPlatforms, platform))
      execFileSyncOrThrow(localCordova, ['platform', 'add', platform], { cwd: cordovaPath });
  });

  _.each(installedPlatforms, function (platform) {
    if (! _.contains(platforms, platform) &&
          _.contains(supportedPlatforms, platform))
      execFileSyncOrThrow(localCordova, ['platform', 'rm', platform], { cwd: cordovaPath });
  });

  return true;
};

// Ensures that the Cordova platforms are synchronized with the app-level
// platforms.
// options
//   - packagePlugins: the list of plugins required by packages. If not defined,
//                     we bundle the app to find the required plugins.

cordova.ensureCordovaPlugins = function (localPath, options) {
  options = options || {};
  var plugins = options.packagePlugins;
  if (! plugins) {
    // Bundle to gather the plugin dependencies from packages.
    // XXX slow - perhaps we should only do this lazily
    // XXX code copied from buildCordova
    var bundlePath = path.join(localPath, 'build-tar');
    var webArchName = 'web.cordova';
    plugins =
      getBundle(bundlePath, [webArchName], options).starManifest.cordovaDependencies;
    files.rm_recursive(bundlePath);
  }
  // XXX the project-level cordova plugins deps override the package-level ones
  _.extend(plugins, project.getCordovaPlugins());

  var cordovaPath = path.join(localPath, 'cordova-build');
  var localPluginsPath = localPluginsPathFromCordovaPath(cordovaPath);
  var newSettings = null;

  if (options.settings) {
    newSettings =
      JSON.parse(fs.readFileSync(options.settings, "utf8")).cordova;
  }


  // XXX compare the latest used sha's with the currently required sha's for
  // plugins fetched from a github/tarball url.
  var pluginsOutput = execFileSyncOrThrow(localCordova, ['plugin', 'list'],
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

  var oldSettings;
  var settingsFile = path.join(cordovaPath, 'cordova-settings.json');
  try {
    oldSettings = JSON.parse(
      fs.readFileSync(settingsFile, 'utf8'));
  } catch(err) {
    if (err.code !== 'ENOENT')
      throw err;
    oldSettings = {};
  } finally {
    if (newSettings) {
      fs.writeFileSync(settingsFile, JSON.stringify(newSettings, null, 2),
        'utf8');
    }
  }

  // This block checks to see if we should install or reinstall a plugin.
  _.each(plugins, function (version, name) {
    // no-op if this plugin is already installed
    if (_.has(installedPlugins, name)
        && installedPlugins[name] === version) {

      if (newSettings && newSettings[name] &&
          ! _.isEqual(oldSettings[name], newSettings[name])) {
        // If we have newSettings and they are different, then continue.
      } else {
        return;
      }
    }

    if (_.has(installedPlugins, name))
      execFileSyncOrThrow(localCordova, ['plugin', 'rm', name], { cwd: cordovaPath });

    // XXX do something different for plugins fetched from a url.
    var pluginInstallCommand = version ? name + '@' + version : name;

    if (version && utils.isUrlWithSha(version)) {
      pluginInstallCommand =
        fetchCordovaPluginFromShaUrl(version, localPluginsPath, name);
    }

    var additionalArgs = [];
    // XXX how do we get settings to work now? Do we require settings to be
    // passed every time we add a plugin?
    if (newSettings && newSettings[name]) {
      if (! _.isObject(newSettings[name]))
        throw new Error('Meteor.settings.cordova.' + name + ' is expected to be an object');
      _.each(newSettings[name], function (value, variable) {
        additionalArgs.push('--variable');
        additionalArgs.push(variable + '=' + JSON.stringify(value));
      });
    }
    process.stdout.write('Installing ' + pluginInstallCommand + '\n');
    var execRes = execFileSyncOrThrow(localCordova,
       ['plugin', 'add', pluginInstallCommand].concat(additionalArgs), { cwd: cordovaPath });
    if (! execRes.success)
      throw new Error("Failed to install plugin " + name + ": " + execRes.stderr);
  });

  _.each(installedPlugins, function (version, name) {
    if (! _.has(plugins, name))
      execFileSyncOrThrow(localCordova, ['plugin', 'rm', name], { cwd: cordovaPath });
  });
};

// Build a Cordova project, creating a Cordova project if necessary.
var buildCordova = function (localPath, buildCommand, options) {
  var webArchName = "web.cordova";

  var bundlePath = path.join(localPath, 'build-cordova-temp');
  var programPath = path.join(bundlePath, 'programs');

  var cordovaPath = path.join(localPath, 'cordova-build');
  var wwwPath = path.join(cordovaPath, "www");
  var cordovaProgramPath = path.join(programPath, webArchName);
  var cordovaProgramAppPath = path.join(cordovaProgramPath, 'app');

  var bundle = getBundle(bundlePath, [webArchName], options);

  cordova.ensureCordovaProject(localPath, options.appName);
  cordova.ensureCordovaPlatforms(localPath);
  cordova.ensureCordovaPlugins(localPath, _.extend({}, options, {
    packagePlugins: bundle.starManifest.cordovaDependencies
  }));

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

  // Give the buffer more space as the output of the build is really huge
  execFileSyncOrThrow(localCordova, [buildCommand],
               { cwd: cordovaPath, maxBuffer: 2000*1024 });
};

// checks that every requested platform such as 'android' or 'ios' is already
// added to the project
var checkRequestedPlatforms = function (platforms) {
  platforms = _.uniq(platforms);

  var requestedPlatforms = [];
  // Find the required platforms.
  // ie. ["ios", "android", "ios-device"] will produce ["ios", "android"]
  _.each(platforms, function (platformName) {
    var platform = platformName.split('-')[0];
    if (! _.contains(requestedPlatforms, platform)) {
      requestedPlatforms.push(platform);
    }
  });

  var cordovaPlatforms = project.getCordovaPlatforms();
  _.each(requestedPlatforms, function (platform) {
    if (! _.contains(cordovaPlatforms, platform))
      throw new Error(platform +
        ": platform is not added to the project. Try 'meteor add platform:" +
        platform + "' to add it or 'meteor help add' for help.");
  });
};

// Builds a Cordova project that targets the list of 'platforms'
// options:
//   - appName: the target path of the build
//   - host
//   - port
cordova.buildPlatforms = function (localPath, platforms, options) {
  checkRequestedPlatforms(platforms);
  buildCordova(localPath, 'build', options);
};

cordova.preparePlatforms = function (localPath, platforms, options) {
  checkRequestedPlatforms(platforms);
  buildCordova(localPath, 'prepare', options);
};


// Start the simulator or physical device for a specific platform.
// platformName is of the form ios/ios-device/android/android-device
var execCordovaOnPlatform = function (localPath, platformName) {
  var cordovaPath = path.join(localPath, 'cordova-build');

  // XXX error if an invalid platform
  var platform = platformName.split('-')[0];
  var isDevice = platformName.split('-')[1] === 'device';

  var args = [ 'run',
               isDevice ? '--device' : '--emulator',
               platform ];

  // XXX error if not a Cordova project
  execFileAsyncOrThrow(localCordova, args, { cwd: cordovaPath });
  var Log = getLoadedPackages().logging.Log;

  var androidMapper = function (line) {
    // remove the annoying prefix
    line = line.replace(/^.\/CordovaLog\(\s*\d+\s*\):\s+/, '');
    // remove a part of file url we don't like
    line = line.replace(/^file:\/\/\/android_asset\/www\//, '');
    // filename.js?hashsha1: Line 123 : message goes here
    var parsedLine = line.match(/^([^?]+)(\?[a-zA-Z0-9]+)?: Line (\d+) : (.*)$/);

    if (! parsedLine)
      return Log.format(Log.objFromText(line), { color: true });

    var output = {
      time: new Date,
      level: 'info',
      file: parsedLine[1],
      line: parsedLine[3],
      message: parsedLine[4],
      program: 'android'
    };
    return Log.format(output, {
      metaColor: 'green',
      color: true
    });
  };

  var iosMapper = function (line) {
    // remove the prefix
    line = line.replace(/^\S+\s\S+\s\S+\s/, '');
    return Log.format(Log.objFromText(line, { program: 'ios' }), {
      metaColor: 'cyan',
      color: true
    });
  };

  if (platform === 'ios') {
    var logFilePath =
      path.join(cordovaPath, 'platforms', 'ios', 'cordova', 'console.log');

    // overwrite the file so we don't have to print the old logs
    fs.writeFileSync(logFilePath, '');
    // print the log file
    execFileAsyncOrThrow('tail', ['-f', logFilePath], { lineMapper: iosMapper });
  } else if (platform === 'android') {
    // clear the logcat logs from the previous run
    execFileSyncOrThrow(localAdb, ['logcat', '-c']);
    execFileAsyncOrThrow(localAdb, ['logcat', '-s', 'CordovaLog'], {
      lineMapper: androidMapper,
    });
  }
  return 0;
};

// Start the simulator or physical device for a list of platforms
cordova.runPlatforms = function (localPath, platforms) {
  _.each(platforms, function (platformName) {
    execCordovaOnPlatform(localPath, platformName);
  });
};

// packages - list of strings
cordova.filterPackages = function (packages) {
// We hard-code the 'cordova' and 'platform' namespaces
  var ret = {
    rest: [],
    platforms: [],
    plugins: []
  };

  _.each(packages, function (p) {
    var namespace = p.split(':')[0];
    var name = p.split(':').slice(1).join(':');
    if (namespace === 'cordova') {
      ret.plugins.push(name);
    } else if (namespace === 'platform') {
      ret.platforms.push(name);
    } else
      ret.rest.push(p); // leave it the same
  });
  return ret;
};

