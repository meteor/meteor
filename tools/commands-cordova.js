var main = require('./main.js');
var path = require('path');
var _ = require('underscore');
var fs = require('fs');
var util = require('util');
var chalk = require('chalk');
var files = require('./files.js');
var buildmessage = require('./buildmessage.js');
var project = require('./project.js').project;
var Future = require('fibers/future');
var utils = require('./utils.js');
var archinfo = require('./archinfo.js');
var tropohouse = require('./tropohouse.js');
var httpHelpers = require('./http-helpers.js');
var Console = require('./console.js').Console;
var processes = require('./processes.js');
var catalog = require('./catalog.js');

// XXX hard-coded the use of default tropohouse
var tropo = tropohouse.default;
var webArchName = "web.cordova";

var DEFAULT_AVD_NAME = "meteor";

// android is available on all supported architectures
var availablePlatforms =
  project.getDefaultPlatforms().concat(["android", "firefoxos", "ios"]);

// Borrowed from tropohouse
// The version in warehouse fails when run from a checkout.
// XXX: Rationalize
var cordovaWarehouseDir = function () {
  if (process.env.METEOR_WAREHOUSE_DIR)
    return process.env.METEOR_WAREHOUSE_DIR;

  var warehouseBase = files.inCheckout()
    ? files.getCurrentToolsDir() : process.env.HOME;
  return path.join(warehouseBase, ".meteor", "cordova");
};

var MESSAGE_IOS_ONLY_ON_MAC = "Currently, it is only possible to build iOS apps on an OS X system.";

var splitN = function (s, split, n) {
  if (n <= 1) {
    return s;
  }
  var tokens = s.split(split);
  if (tokens.length <= n) {
    return tokens;
  }
  var firstN = tokens.slice(0, n - 1);
  var tail = tokens.slice(n).join(split);
  firstN.push(tail);
  return firstN;
};

var platformToHuman = function (platform) {
  var platformToHumanMap = {
    'ios': "iOS",
    'android': "Android"
  };

  return platformToHumanMap[platform] || platform;
};

var cordova = exports;

// --- the public interface ---

// Builds a Cordova project that targets the list of 'platforms'
// options:
//   - appName: the target path of the build
//   - host
//   - port
//   - skipIfNoSDK: don't throw an error when SDK is not installed
cordova.buildTargets = function (localPath, targets, options) {
  var platforms = targetsToPlatforms(targets);

  verboseLog('Running build for platforms:', platforms);

  var cordovaPlatforms = project.getCordovaPlatforms();
  platforms = _.filter(platforms, function (platform) {
    var inProject = _.contains(cordovaPlatforms, platform);
    var hasSdk = checkPlatformRequirements(platform).acceptable;
    var supported = !Host.isLinux() || platform !== "ios";

    var displayPlatform = platformToHuman(platform);

    if (! inProject) {
      if (! supported) {
        Console.warn(Console.fail(MESSAGE_IOS_ONLY_ON_MAC));
      } else {
        Console.warn("Please add the " + displayPlatform +
                     " platform to your project first.");
        if (! hasSdk) {
          Console.info("First install the SDK by running: " +
                       Console.bold("meteor install-sdk " + platform));
          Console.info("Then run: " +
                       Console.bold("meteor add-platform " + platform));
        } else {
          Console.info("Run: " + Console.bold("meteor add-platform " + platform));
        }
      }
      throw new main.ExitWithCode(2);
    }
    if (! hasSdk) {
      if (options.skipIfNoSDK) {
        Console.warn("The " + displayPlatform + " platform is not installed;" +
                     " skipping build for it.");
        return false;
      }

      if (supported)
        Console.warn("The " + displayPlatform + " platform is not installed;" +
                     " please run: " +
                     Console.bold("meteor install-sdk " + platform));
      else
        Console.warn(Console.fail(MESSAGE_IOS_ONLY_ON_MAC));

      throw new main.ExitWithCode(2);
    }

    return true;
  });

  buildCordova(localPath, platforms, options);
  return platforms;
};

cordova.buildPlatformRunners = function (localPath, platforms, options) {
  var runners = [];
  _.each(platforms, function (platformName) {
    runners.push(new CordovaRunner(localPath, platformName, options));
  });
  return runners;
};

// Returns the cordovaDependencies of the Cordova arch from a star json.
cordova.getCordovaDependenciesFromStar = function (star) {
  var cordovaProgram = _.findWhere(star.programs, { arch: webArchName });
  if (cordovaProgram) {
    return cordovaProgram.cordovaDependencies;
  } else {
    return {};
  }
};

// packages - list of strings
cordova.filterPackages = function (packages) {
// We hard-code the 'cordova' and 'platform' namespaces
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
};

// used by packages commands
cordova.checkIsValidPlugin = function (name) {
  var pluginHash = {};
  pluginHash[name.split('@')[0]] = name.split('@')[1];

  // check that every plugin is specifying either an exact constraint or a
  // tarball url with sha
  utils.ensureOnlyExactVersions(pluginHash);
};

// --- helpers ---

var localCordova = path.join(files.getCurrentToolsDir(),
  "tools", "cordova-scripts", "cordova.sh");

var localAdb = path.join(files.getCurrentToolsDir(),
  "tools", "cordova-scripts", "adb.sh");

var localAndroid = path.join(files.getCurrentToolsDir(),
  "tools", "cordova-scripts", "android.sh");

var verboseness = false;
var setVerboseness = cordova.setVerboseness = function (v) {
  verboseness = !!v;
};
var verboseLog = cordova.verboseLog = function (/* args */) {
  if (verboseness)
    Console.stderr.write('%% ' + util.format.apply(null, arguments) + '\n');
};


var execFileAsyncOrThrow = function (file, args, opts, cb) {
  verboseLog('Running asynchronously: ', file, args);
  if (_.isFunction(opts)) {
    cb = opts;
    opts = undefined;
  }

  // XXX a hack to always tell the scripts where warehouse is
  opts = opts || {};
  opts.env = _.extend({ "USE_GLOBAL_ADK": "" },
                      { "METEOR_WAREHOUSE_DIR": tropo.root },
                      process.env,
                      opts.env || {});

  var execFileAsync = require('./utils.js').execFileAsync;

  var p = execFileAsync(file, args, opts);
  p.on('close', function (code) {
    var err = null;
    if (code)
      err = new Error(file + ' ' + args.join(' ') +
                      ' exited with non-zero code: ' + code + '. Use -v for' +
                      ' more logs.');

    if (cb) cb(err, code);
    else if (err) throw err;
  });
};

var execFileSyncOrThrow = function (file, args, opts) {
  var execFileSync = require('./utils.js').execFileSync;

  verboseLog('Running synchronously: ', file, args);

  // XXX a hack to always tell the scripts where warehouse is
  opts = opts || {};
  opts.env = _.extend({ "USE_GLOBAL_ADK": "" },
                      { "METEOR_WAREHOUSE_DIR": tropo.root },
                      process.env,
                      opts.env || {});

  var childProcess = execFileSync(file, args, opts);
  if (! childProcess.success) {
    // XXX: Include args
    var message = 'Error running ' + file;
    if (childProcess.stderr) {
      message = message + "\n" + childProcess.stderr + "\n";
    }
    if (childProcess.stdout) {
      message = message + "\n" + childProcess.stdout + "\n";
    }

    // XXX special case if Cordova complains about Xcode
    var errorMatch =
      message.match(/Cordova can only run in Xcode version/gm);

    if (file === localCordova && errorMatch) {
      Console.error(
        'Xcode 4.6 or greater is required to run iOS commands.\n');
      process.exit(2);
    }

    // XXX special case if Cordova complains about Xcode license
    errorMatch =
      message.match(/Xcode\/iOS license/gm);

    if (file === localCordova && errorMatch) {
      Console.error(
        'Please open Xcode and activate it by agreeing to the license.\n');
      process.exit(2);
    }

    throw new Error(message);
  }

  return childProcess;
};

var getLoadedPackages = _.once(function () {
  var uniload = require('./uniload.js');
  return uniload.load({
    packages: [ 'boilerplate-generator', 'logging', 'webapp-hashing', 'xmlbuilder' ]
  });
});



// --- Cordova routines ---

var generateCordovaBoilerplate = function (clientDir, options) {
  var clientJsonPath = path.join(clientDir, 'program.json');
  var clientJson = JSON.parse(fs.readFileSync(clientJsonPath, 'utf8'));
  var manifest = clientJson.manifest;
  var settings = options.settings ?
    JSON.parse(fs.readFileSync(options.settings, 'utf8')) : {};
  var publicSettings = settings['public'];

  var meteorRelease = project.getNormalizedMeteorReleaseVersion();
  var Boilerplate = getLoadedPackages()['boilerplate-generator'].Boilerplate;
  var WebAppHashing = getLoadedPackages()['webapp-hashing'].WebAppHashing;

  var configDummy = {};
  if (publicSettings) configDummy.PUBLIC_SETTINGS = publicSettings;

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
    cleanCache: options.clean,
    httpProxyPort: options.httpProxyPort,
    appId: project.appId
  };

  if (publicSettings)
    runtimeConfig.PUBLIC_SETTINGS = publicSettings;

  var boilerplate = new Boilerplate(webArchName, manifest, {
    urlMapper: _.identity,
    pathMapper: function (p) { return path.join(clientDir, p); },
    baseDataExtension: {
      meteorRuntimeConfig: JSON.stringify(runtimeConfig)
    }
  });
  return boilerplate.toHTML();
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

// Creates a Cordova project if necessary.
var ensureCordovaProject = function (localPath, appName) {
  verboseLog('Ensuring the cordova build project');
  var cordovaPath = path.join(localPath, 'cordova-build');
  var localPluginsPath = localPluginsPathFromCordovaPath(cordovaPath);
  if (! fs.existsSync(cordovaPath)) {
    verboseLog('Cordova build project doesn\'t exist, creating one');
    try {
      var creation = execFileSyncOrThrow(localCordova,
        ['create', path.basename(cordovaPath), 'com.meteor.' + appName, appName.replace(/\s/g, '')],
        { cwd: path.dirname(cordovaPath), env: buildCordovaEnv() });

      // create a folder for storing local plugins
      // XXX cache them there
      files.mkdir_p(localPluginsPath);
    } catch (err) {
      if (err instanceof main.ExitWithCode) {
        process.exit(err.code);
      }
      Console.stderr.write("Error creating Cordova project: " +
        err.message + "\n" + err.stack + "\n");
    }
  }
};

// --- Cordova platforms ---

// Ensures that the Cordova platforms are synchronized with the app-level
// platforms.
var ensureCordovaPlatforms = function (localPath) {
  verboseLog('Ensuring that platforms in cordova build project are in sync');
  var cordovaPath = path.join(localPath, 'cordova-build');
  var platforms = project.getCordovaPlatforms();
  var platformsList = execFileSyncOrThrow(
    localCordova, ['platform', 'list'], { cwd: cordovaPath, env: buildCordovaEnv() });

  verboseLog('The output of `cordova platforms list`:', platformsList.stdout);

  // eg. ['android 3.5.0', 'ios 3.5.0']
  var platformsOutput = platformsList.stdout.split('\n')[0];
  var platformsStrings = platformsOutput.match(/Installed platforms: (.*)/)[1];

  if (platformsStrings === undefined)
    throw new Error('Failed to parse the output of `cordova platform list`: ' +
                     platformsList.stdout);

  var installedPlatforms = _.map(platformsStrings.split(', '), function (s) {
    return s.split(' ')[0];
  });

  _.each(platforms, function (platform) {
    if (_.contains(installedPlatforms, platform))
      return;
    verboseLog('The platform is not in the Cordova project: ' + platform);
    if (checkPlatformRequirements(platform).acceptable) {
      verboseLog('Adding a platform', platform);
      execFileSyncOrThrow(localCordova, ['platform', 'add', platform],
                          { cwd: cordovaPath, env: buildCordovaEnv() });
    }
  });

  _.each(installedPlatforms, function (platform) {
    if (! _.contains(platforms, platform) &&
        _.contains(availablePlatforms, platform)) {
      verboseLog('Removing a platform', platform);
      execFileSyncOrThrow(localCordova, ['platform', 'rm', platform],
                          { cwd: cordovaPath, env: buildCordovaEnv() });
    }
  });

  return true;
};

var targetsToPlatforms = function (targets) {
  targets = _.uniq(targets);

  var platforms = [];
  // Find the required platforms.
  // ie. ["ios", "android", "ios-device"] will produce ["ios", "android"]
  _.each(targets, function (targetName) {
    var platform = targetName.split('-')[0];
    if (! _.contains(platforms, platform)) {
      platforms.push(platform);
    }
  });

  return platforms;
};


// --- Cordova plugins ---

var installPlugin = function (cordovaPath, name, version, conf) {
  verboseLog('Installing a plugin', name, version);

  // XXX do something different for plugins fetched from a url.
  var pluginInstallCommand = version ? name + '@' + version : name;
  var localPluginsPath = localPluginsPathFromCordovaPath(cordovaPath);

  if (version && utils.isUrlWithSha(version)) {
    pluginInstallCommand =
      fetchCordovaPluginFromShaUrl(version, localPluginsPath, name);
  }

  var additionalArgs = [];

  _.each(conf || {}, function (value, variable) {
    additionalArgs.push('--variable');
    additionalArgs.push(variable + '=' + value);
  });

  var execRes = execFileSyncOrThrow(localCordova,
     ['plugin', 'add', pluginInstallCommand].concat(additionalArgs),
     { cwd: cordovaPath, env: buildCordovaEnv() });
  if (! execRes.success)
    throw new Error("Failed to install plugin " + name + ": " + execRes.stderr);

  if (utils.isUrlWithSha(version)) {
    var lock = getTarballPluginsLock(cordovaPath);
    lock[name] = version;
    writeTarballPluginsLock(cordovaPath, lock);
  }
};

var uninstallPlugin = function (cordovaPath, name, isFromTarballUrl) {
  verboseLog('Uninstalling a plugin', name);
  try {
    execFileSyncOrThrow(localCordova, ['plugin', 'rm', name],
      { cwd: cordovaPath, env: buildCordovaEnv() });

    if (isFromTarballUrl) {
      verboseLog('Removing plugin from the tarball plugins lock', name);
      // also remove from tarball-url-based plugins lock
      var lock = getTarballPluginsLock(cordovaPath);
      delete lock[name];
      writeTarballPluginsLock(cordovaPath, lock);
    }
  } catch (err) {
    // Catch when an uninstall fails, because it might just be a dependency
    // issue. For example, plugin A depends on plugin B and we try to remove
    // plugin B. In this case, we will loop and remove plugin A first.
    verboseLog('Plugin removal threw an error:', err.message);
  }
};

var getTarballPluginsLock = function (cordovaPath) {
  verboseLog('Will check for cordova-tarball-plugins.json' +
             ' for tarball-url-based plugins previously installed.');

  var tarballPluginsLockPath =
    path.join(cordovaPath, 'cordova-tarball-plugins.json');

  var tarballPluginsLock;
  try {
    var text = fs.readFileSync(tarballPluginsLockPath, 'utf8');
    tarballPluginsLock = JSON.parse(text);

    verboseLog('The tarball plugins lock:', tarballPluginsLock);
  } catch (err) {
    if (err.code !== 'ENOENT')
      throw err;

    verboseLog('The tarball plugins file was not found.');
    tarballPluginsLock = {};
  }

  return tarballPluginsLock;
};

var writeTarballPluginsLock = function (cordovaPath, tarballPluginsLock) {
  verboseLog('Will write cordova-tarball-plugins.json');

  var tarballPluginsLockPath =
    path.join(cordovaPath, 'cordova-tarball-plugins.json');

  fs.writeFileSync(
    tarballPluginsLockPath,
    JSON.stringify(tarballPluginsLock),
    'utf8'
  );
};

// Returns the list of installed plugins as a hash from plugin name to version.
var getInstalledPlugins = function (cordovaPath) {
  verboseLog('Getting installed plugins for project');
  var installedPlugins = {};

  var pluginsOutput = execFileSyncOrThrow(localCordova, ['plugin', 'list'],
                                   { cwd: cordovaPath, env: buildCordovaEnv() }).stdout;

  verboseLog('The output of `cordova plugins list`:', pluginsOutput);

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

  // override the values of the plugins installed from tarballs
  _.each(getTarballPluginsLock(cordovaPath), function (url, name) {
    installedPlugins[name] = url;
  });

  return installedPlugins;
};

// Ensures that the Cordova plugins are synchronized with the app-level
// plugins.

var ensureCordovaPlugins = function (localPath, options) {
  options = options || {};
  var plugins = options.packagePlugins;

  verboseLog('Ensuring plugins in the cordova build project are in sync',
             plugins);

  if (! plugins) {
    // Bundle to gather the plugin dependencies from packages.
    // XXX slow - perhaps we should only do this lazily
    // XXX code copied from buildCordova
    var bundlePath = path.join(localPath, 'build-tar');
    var bundle = getBundle(bundlePath, [webArchName], options);
    plugins = cordova.getCordovaDependenciesFromStar(bundle.starManifest);
    files.rm_recursive(bundlePath);
  }

  var cordovaPath = path.join(localPath, 'cordova-build');

  var installedPlugins = getInstalledPlugins(cordovaPath);

  // Due to the dependency structure of Cordova plugins, it is impossible to
  // upgrade the version on an individual Cordova plugin. Instead, whenever a
  // new Cordova plugin is added or removed, or its version is changed,
  // we just reinstall all of the plugins.

  var shouldReinstallPlugins = false;

  // Iterate through all of the plugin and find if any of them have a new
  // version.
  _.each(plugins, function (version, name) {
    // XXX there is a hack here that never updates a package if you are
    // trying to install it from a URL, because we can't determine if
    // it's the right version or not
    if (! _.has(installedPlugins, name) || installedPlugins[name] !== version) {
      // The version of the plugin has changed, or we do not contain a plugin.
      shouldReinstallPlugins = true;
    }
  });

  // Check to see if we have any installed plugins that are not in the current
  // set of plugins.
  _.each(installedPlugins, function (version, name) {
    if (! _.has(plugins, name)) {
      shouldReinstallPlugins = true;
    }
  });

  if (shouldReinstallPlugins) {
    // Loop through all of the current plugins and remove them one by one until
    // we have no plugins. It's necessary to loop because we might have
    // dependencies between plugins.
    var uninstallAllPlugins = function () {
      installedPlugins = getInstalledPlugins(cordovaPath);
      while (_.size(installedPlugins)) {
        _.each(installedPlugins, function (version, name) {
          uninstallPlugin(cordovaPath, name, utils.isUrlWithSha(version));
        });
        installedPlugins = getInstalledPlugins(cordovaPath);
      }
      // XXX HACK, because Cordova doesn't properly clear its plugins on `rm`.
      // This will completely destroy the project state. We should work with
      // Cordova to fix the bug in their system, because it doesn't seem
      // like there's a way around this.
      files.rm_recursive(path.join(cordovaPath, 'platforms'));
      ensureCordovaPlatforms(localPath);
    };

    buildmessage.enterJob({ title: "Installing Cordova plugins..."}, function () {
      uninstallAllPlugins();

      // Now install all of the plugins.
      try {
        // XXX: forkJoin with parallel false?
        var pluginsInstalled = 0;

        var pluginsCount = _.size(plugins);
        buildmessage.reportProgress({ current: 0, end: pluginsCount });
        _.each(plugins, function (version, name) {
          installPlugin(cordovaPath, name, version, pluginsConfiguration[name]);

          buildmessage.reportProgress({
            current: ++pluginsInstalled,
            end: pluginsCount
          });
        });
      } catch (err) {
        // If a plugin fails to install, then remove all plugins and throw the
        // error. Cordova doesn't remove the plugin by default for some reason.
        // XXX don't throw and improve this error message.
        uninstallAllPlugins();
        throw err;
      }
    });
  }
};

var fetchCordovaPluginFromShaUrl =
    function (urlWithSha, localPluginsDir, pluginName) {
  verboseLog('Fetching a tarball from url:', urlWithSha);
  var pluginPath = path.join(localPluginsDir, pluginName);
  var pluginTarballPath = pluginPath + '.tgz';

  var execFileSync = require('./utils.js').execFileSync;
  var whichCurl = execFileSync('which', ['curl']);

  var downloadProcess = null;

  if (whichCurl.success) {
    verboseLog('Downloading with curl');
    downloadProcess =
      execFileSyncOrThrow('curl', ['-L', urlWithSha, '-o', pluginTarballPath]);
  } else {
    verboseLog('Downloading with wget');
    downloadProcess =
      execFileSyncOrThrow('wget', ['-O', pluginTarballPath, urlWithSha]);
  }

  if (! downloadProcess.success)
    throw new Error("Failed to fetch the tarball from " + urlWithSha + ": " +
                    downloadProcess.stderr);

  verboseLog('Create a folder for the plugin', pluginPath);
  files.mkdir_p(pluginPath);

  verboseLog('Untarring the tarball with plugin');
  var tarProcess = execFileSyncOrThrow('tar',
    ['xf', pluginTarballPath, '-C', pluginPath, '--strip-components=1']);
  if (! tarProcess.success)
    throw new Error("Failed to untar the tarball from " + urlWithSha + ": " +
                    tarProcess.stderr);
  verboseLog('Untarring succeeded, removing the tarball');
  files.rm_recursive(pluginTarballPath);
  return pluginPath;
};

var localPluginsPathFromCordovaPath = function (cordovaPath) {
  return path.join(cordovaPath, 'local-plugins');
};



// --- Cordova from project ---


// XXX a hack: make this variable global to reduce the interface of
// consumeControlFile and make more side-effects for simplicity.
// This is populated only in consumeControlFile.
var pluginsConfiguration = {};

// Build a Cordova project, creating a Cordova project if necessary.
var buildCordova = function (localPath, platforms, options) {
  verboseLog('Building the cordova build project');
  if (_.isEmpty(platforms))
    return;

  buildmessage.enterJob({ title: 'Building for mobile devices' }, function () {
    var bundlePath = path.join(localPath, 'build-cordova-temp');
    var programPath = path.join(bundlePath, 'programs');

    var cordovaPath = path.join(localPath, 'cordova-build');
    var wwwPath = path.join(cordovaPath, 'www');
    var applicationPath = path.join(wwwPath, 'application');
    var cordovaProgramPath = path.join(programPath, webArchName);
    var cordovaProgramAppPath = path.join(cordovaProgramPath, 'app');

    verboseLog('Bundling the web.cordova program of the app');
    var bundle = getBundle(bundlePath, [webArchName], options);

    // Make there is a project as all other operations depend on that
    ensureCordovaProject(localPath, options.appName);

    // Check and consume the control file
    var controlFilePath = path.join(project.rootDir, 'mobile-config.js');
    consumeControlFile(controlFilePath, cordovaPath);

    ensureCordovaPlatforms(localPath);
    ensureCordovaPlugins(localPath, _.extend({}, options, {
      packagePlugins: cordova.getCordovaDependenciesFromStar(
        bundle.starManifest)
    }));

    // XXX hack, copy files from app folder one level up
    if (fs.existsSync(cordovaProgramAppPath)) {
      verboseLog('Copying the JS/CSS files one level up');
      files.cp_r(cordovaProgramAppPath, cordovaProgramPath);
      files.rm_recursive(cordovaProgramAppPath);
    }

    verboseLog('Removing the www folder');
    // rewrite the www folder
    files.rm_recursive(wwwPath);

    files.mkdir_p(applicationPath);
    verboseLog('Writing www/application folder');
    files.cp_r(cordovaProgramPath, applicationPath);

    // clean up the temporary bundle directory
    files.rm_recursive(bundlePath);

    verboseLog('Writing index.html');

    // generate index.html
    var indexHtml = generateCordovaBoilerplate(applicationPath, options);
    fs.writeFileSync(path.join(applicationPath, 'index.html'), indexHtml, 'utf8');

    // write the cordova loader
    verboseLog('Writing meteor_cordova_loader');
    var loaderPath = path.join(__dirname, 'client', 'meteor_cordova_loader.js');
    var loaderCode = fs.readFileSync(loaderPath);
    fs.writeFileSync(path.join(wwwPath, 'meteor_cordova_loader.js'), loaderCode);

    verboseLog('Writing a default index.html for cordova app');
    var indexPath = path.join(__dirname, 'client', 'cordova_index.html');
    var indexContent = fs.readFileSync(indexPath);
    fs.writeFileSync(path.join(wwwPath, 'index.html'), indexContent);


    // Cordova Build Override feature (c)
    var buildOverridePath = path.join(project.rootDir, 'cordova-build-override');

    if (fs.existsSync(buildOverridePath) &&
      fs.statSync(buildOverridePath).isDirectory()) {
      verboseLog('Copying over the cordova-build-override');
      files.cp_r(buildOverridePath, cordovaPath);
    }

    // Run the actual build
    verboseLog('Running the build command');
    // Give the buffer more space as the output of the build is really huge
    try {
      var args = ['build'].concat(platforms);

      if (verboseness) {
        args = ['--verbose'].concat(args);
      }

      // depending on the debug mode build the android part in different modes
      if (_.contains(project.getPlatforms(), 'android') &&
          _.contains(platforms, 'android')) {
        var androidBuildPath = path.join(cordovaPath, 'platforms', 'android');
        var manifestPath = path.join(androidBuildPath, 'AndroidManifest.xml');

        // XXX a hack to reset the debuggable mode
        var manifest = fs.readFileSync(manifestPath, 'utf8');
        manifest = manifest.replace(/android:debuggable=.(true|false)./g, '');
        manifest = manifest.replace(/<application /g, '<application android:debuggable="' + !!options.debug + '" ');
        fs.writeFileSync(manifestPath, manifest, 'utf8');

        // XXX workaround the problem of cached apk invalidation
        files.rm_recursive(path.join(androidBuildPath, 'ant-build'));
      }

      if (!options.debug) {
        args.push('--release');
      }

      buildmessage.enterJob({ title: 'Building mobile project' }, function () {
        execFileSyncOrThrow(localCordova, args,
                            { cwd: cordovaPath,
                              env: buildCordovaEnv(),
                              maxBuffer: 2000 * 1024});
      });
    } catch (err) {
      // "ld: 100000 duplicate symbols for architecture i386" is a common error
      // message that occurs when you run an iOS project compilation from /tmp or
      // whenever there is a symbolic link cycle reachable for ld to multiple
      // object files.
      if (err.message.match(/ld: \d+ duplicate symbols/g)) {
        // XXX a better message
        var message = "Can't build an iOS project from the /tmp directory.";

        if (verboseness)
          message = err.message + '\n' + message;

        throw new Error(message);
      } else {
        throw err;
      }
    }
  });

  verboseLog('Done building the cordova build project');
};

var platformDisplayName = function (name) {
  return name === 'ios' ? 'iOS Simulator' :
         name === 'ios-device' ? 'iOS Device' :
         name === 'android' ? 'Android Emulator':
         'Android Device';
};

// This is a runner, that we pass to Runner (run-all.js)
var CordovaRunner = function (localPath, platformName, options) {
  var self = this;

  self.localPath = localPath;
  self.platformName = platformName;
  self.options = options;

  self.title = 'app on ' + platformDisplayName(platformName);
};

_.extend(CordovaRunner.prototype, {
  start: function () {
    var self = this;

    // android, not android-device
    if (self.platformName === 'android') {
      Android.waitForEmulator();
    }

    // OAuth2 packages don't work so well with any mobile platform
    // except the iOS simulator. Print a warning and direct users to the
    // wiki page for help.
    if (self.platformName !== "ios") {
      buildmessage.capture(function () {
        var versions = project.getVersions({ dontRunConstraintSolver: true });
        if (versions.oauth2) {
          Console.warn(
"\n" +
"WARNING: It looks like you are using OAuth2 login in your app.\n" +
"         Meteor's OAuth2 implementation does not currently work with\n" +
"         mobile apps in local development mode, except in the iOS\n" +
"         simulator. You can run the iOS simulator with 'meteor run ios'.\n" +
"         For additional workarounds, see\n" +
"         https://github.com/meteor/meteor/wiki/OAuth-for-mobile-Meteor-clients.\n");
        }
      });
    }

    if (self.platformName === 'ios') {
      // Kill the running simulator before starting one to avoid a black-screen
      // bug that happens when you deploy an app to emulator while it is running
      // a previous version of it.
      IOS.killSimulator();
    }

    try {
      execCordovaOnPlatform(self.localPath,
                            self.platformName,
                            self.options);
    } catch (err) {
      Console.error(self.platformName + ': failed to start the app.\n' +
                    err.message);
    }
  },

  prestart: function () {
    var self = this;

    // android, not android-device
    if (self.platformName == 'android') {
      if (!Android.isEmulatorRunning()) {
        Console.info("Starting android emulator");
        Android.startEmulator();
      }
    }
  },

  stop: function () {
    var self = this;

    // XXX: A no-op for now (we leave it running because it's slow!)
  }
});

var buildAndroidEnv = function () {
  var env = _.extend({}, process.env);

  var androidSdk = Android.findAndroidSdk();

  // common-env.sh does a lot of this for us, but we might be running
  // a tool directly.

  // Put Android build tool-chain into path
  var envPath = env.PATH || '.';
  envPath += ":" + path.join(androidSdk, 'tools');
  envPath += ":" + path.join(androidSdk, 'platform-tools');
  env['PATH'] = envPath;

  if (!Android.useGlobalAdk()) {
    env['ANDROID_SDK_HOME'] = Android.getAndroidSdkHome();
  }

  return env;
};

var buildCordovaEnv = function () {
  // XXX: Only for Android?
  var env = buildAndroidEnv();

  // For global ADK, currently we require ant to be in the path;
  // but we could do this:
  // ANT_HOME="${ANDROID_BUNDLE}/apache-ant-1.9.4"
  // PATH="${ANT_HOME}/bin:${PATH}"

  return env;
};


// Start the simulator or physical device for a specific platform.
// platformName is of the form ios/ios-device/android/android-device
// options:
//    - verbose: print all logs
var execCordovaOnPlatform = function (localPath, platformName, options) {
  verboseLog('Execing cordova for platform', platformName);

  var cordovaPath = path.join(localPath, 'cordova-build');

  // XXX error if an invalid platform
  var platform = platformName.split('-')[0];
  var isDevice = platformName.split('-')[1] === 'device';

  verboseLog('isDevice:', isDevice);

  var args = [ 'run' ];
  if (options.verbose) {
      args.push('--verbose');
  }
  args.push(isDevice ? '--device' : '--emulator');
  args.push(platform);

  // XXX assert we have a valid Cordova project
  if (platform === 'ios' && isDevice) {
    verboseLog('It is ios-device, just opening the Xcode project with `open` command');

    // ios-deploy is super buggy, so we just open xcode and let the user
    // start the app themselves.
    args = ['-c', 'open ' + path.join(localPath, 'cordova-build',
      'platforms', 'ios', '*.xcodeproj')];

    try {
      execFileSyncOrThrow('sh', args);
    } catch (err) {
      Console.stderr.write([
        "",
        chalk.green("Could not open your project in Xcode."),
        chalk.green("Try running again with the --verbose option."),
        chalk.green("Instructions for running your app on an iOS device:"),
        chalk.cyan("https://github.com/meteor/meteor/wiki/How-to-run-your-app-on-an-iOS-device"),
        ""
      ].join("\n"));

      process.exit(2);
    }

    Console.stdout.write([
      "",
      chalk.green([
        "Your project has been opened in Xcode so that you can run your app on ",
        "an iOS device. For further instructions, visit this wiki page:",
      ].join("\n")),
      chalk.cyan(
        "https://github.com/meteor/meteor/wiki/How-to-run-your-app-on-an-iOS-device"
      ),
      ""
    ].join("\n"));

  } else {
    verboseLog('Running emulator:', localCordova, args);
    var emulatorOptions = { verbose: options.verbose, cwd: cordovaPath };
    emulatorOptions.env =  buildCordovaEnv();
    if (options.httpProxyPort) {
      // XXX: Is this Android only?
      // This is odd; the IP address is on the host, not inside the emulator
      emulatorOptions.env['http_proxy'] = '127.0.0.1:' + options.httpProxyPort;
    }

    execFileAsyncOrThrow(
      localCordova, args, emulatorOptions,
      function(err, code) {
        if (err && platform === "android" && isDevice) {
          Console.stderr.write([
            "",
            chalk.green("Could not start the app on your device. Is it plugged in?"),
            chalk.green("Try running again with the --verbose option."),
            chalk.green("Instructions for running your app on an Android device:"),
            chalk.cyan("https://github.com/meteor/meteor/wiki/How-to-run-your-app-on-an-Android-device"),
            ""
          ].join("\n"));
        } else if (err && platform === "android") {
          Console.stderr.write([
            "",
            chalk.green("Could not start the app in the Android emulator."),
            chalk.green("Try running again with the --verbose option."),
            ""
          ].join("\n"));
        } else if (err && platform === "ios") {
          Console.stderr.write([
            "",
            chalk.green("Could not start the app in the iOS simulator."),
            chalk.green("Try running again with the --verbose option."),
            ""
          ].join("\n"));
        } else if (err) {
          Console.stderr.write([
            "",
            chalk.green("Could not start your app."),
            chalk.green("Try running again with the --verbose option."),
            ""
          ].join("\n"));
        }

        // Don't throw an error or print the stack trace, but still exit the
        // program because we have failed to do the expected thing
        if (err) {
          process.exit(2);
        }
      }
    );
  }

  var Log = getLoadedPackages().logging.Log;

  var isDebugOutput = function (line) {
    // Skip the debug output produced by Meteor Core components.
    return /^METEOR CORDOVA DEBUG /.test(line) || /^HTTPD DEBUG /.test(line);
  };

  var androidMapper = function (line) {
    // remove the annoying prefix
    line = line.replace(/^.\/CordovaLog\(\s*\d+\s*\):\s+/, '');
    // remove a part of file url we don't like
    line = line.replace(/^file:\/\/\/android_asset\/www\//, '');
    line = line.replace(/^http:\/\/\d+\.\d+\.\d+\.\d+:\d+\//, '');

    // ignore annoying lines that we see all the time but don't bring any value
    if (line.match(/^--------- beginning of /) ||
        line.match(/^Changing log level to/) ||
        line.match(/^Found start page location: /)) {
      return null;
    }

    // filename.js?hashsha1: Line 123 : message goes here
    var parsedLine =
      line.match(/^([^?]*)(\?[a-zA-Z0-9]+)?: Line (\d+) : (.*)$/);

    if (! parsedLine)
      return Log.format(
        Log.objFromText(line), { metaColor: 'green', color: true });

    if (isDebugOutput(parsedLine[4]) && ! verboseness)
      return null;

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

  // In case of verboseness don't skip any logs. Otherwise skip all the scary
  // stuff that gets printed before the app load.
  var appLogsStarted = false || verboseness;
  var iosMapper = function (line) {
    if (line.match(/^[0-9]+-[0-9]+-[0-9].*/)) {
      // if the line starts with the date, we remove the prefix
      line = line.replace(/^\S+\s\S+\s\S+\s/, '');
    }

    var finishedRegexp =
      /Finished load of: http:\/\/[0-9]+.[0-9]+.[0-9]+.[0-9]+:[0-9]+/g;

    if (finishedRegexp.test(line))
      appLogsStarted = true;

    if (! appLogsStarted)
      return null;

    // Skip the success messages from File Transfer. There are a lot of them on
    // Hot-Code Push, but we are interested only in failures.
    if (/File Transfer Finished with response code 200/.test(line)
        && ! verboseness) {
          return null;
        }

    if (isDebugOutput(line) && ! verboseness)
      return null;

    return Log.format(Log.objFromText(line, { program: 'ios' }), {
      metaColor: 'cyan',
      color: true
    });
  };

  if (platform === 'ios') {
    var logFilePath =
      path.join(cordovaPath, 'platforms', 'ios', 'cordova', 'console.log');
    verboseLog('Printing logs for ios emulator, tailing file', logFilePath);

    // overwrite the file so we don't have to print the old logs
    fs.writeFileSync(logFilePath, '');
    // print the log file
    execFileAsyncOrThrow('tail', ['-f', logFilePath], {
      verbose: true,
      lineMapper: iosMapper
    });
  } else if (platform === 'android') {
    verboseLog('Clearing logs for Android with `adb logcat -c`, should time-out in 5 seconds');

    // clear the logcat logs from the previous run
    // set a timeout for this command for 5s

    // XXX: We need to set the target, otherwise we get this:
    //    - waiting for device -
    //    error: more than one device and emulator
    //    - waiting for device -
    //    error: more than one device and emulator
    //    ...
    // (The timeout saves us here currently)

    // XXX: We should also switch to processes

    // XXX: We should also dump adb.sh

    var future = new Future;
    execFileAsyncOrThrow(localAdb,
                         ['logcat', '-c'],
                         { env: buildCordovaEnv() },
                         function (err, code) {
                           if (!future.isResolved()) {
                             if (err) future['throw'](err);
                             else future['return'](code);
                           }
                         });
    setTimeout(function () {
      if (! future.isResolved()) {
        verboseLog('adb logcat -c timed out');
        future.throw(new Error("clearing logs of Android device timed out: adb logcat -c"));
      }
    }, 5000);

    try {
      future.wait();
    } catch (err) {
      // ignore errors from clearing logs, too much trouble baby-sitting logcat
      verboseLog('Clearing logs failed:', err.stack);
    }
    verboseLog('Done clearing Android logs.');

    // XXX: We need to set the target, otherwise we get the above problem
    verboseLog('Tailing logs for android with `adb logcat -s CordovaLog`');
    execFileAsyncOrThrow(localAdb, ['logcat', '-s', 'CordovaLog'], {
      verbose: true,
      lineMapper: androidMapper,
      env: buildCordovaEnv()
    });
  }

  verboseLog('Done execing cordova for platform', platformName);
  return 0;
};

var getTermsForPlatform = function (platform, name) {
  var url = 'https://warehouse.meteor.com/cordova/license_cordova_' + platform + '.txt';
  var result = httpHelpers.request({
    url: url
  });

  var response = result.response;
  // S3 returns 403 if not found
  if (response.statusCode === 404 || response.statusCode === 403) {
    verboseLog("License URL not found: " + url);
    Console.info("No licensing file found for " + name + ".\n");
    return null;
  }
  if (response.statusCode !== 200) {
    throw new Error("Unexpected response code: " + response.statusCode);
  }
  return response.body;
};

var checkAgreePlatformTerms = function (platform, name) {
  try {
    var terms = getTermsForPlatform(platform);
  } catch (e) {
    verboseLog("Error while downloading license terms: " + e);

    // most likely we don't have a net connection
    Console.warn("Unable to download license terms for " + name + ".\n" +
    "Please make sure you are online.\n")
    throw new main.ExitWithCode(2);
  }

  if (terms === null || terms.trim() === "") {
    // No terms required
    return true;
  }

  Console.stdout.write("The following terms apply to " + name + ":\n\n");
  Console.stdout.write(terms + "\n\n");
  Console.stdout.write("You must agree to the terms to proceed.\n");

  var agreed = false;

  var line = Console.readLine({ prompt: "Do you agree (Y/n)? "});
  line = line.trim().toLowerCase();
  if (line === "") {
    // Default to yes
    line = "y";
  }
  if (line === "y" || line === "yes") {
    agreed = true;
  }

  return agreed;
};

var checkPlatformRequirements = function (platform, options) {
  options = _.extend({log: false, fix: false, fixConsole: false, fixSilent: false}, options);
  if (platform == 'android') {
    return Android.checkRequirements(options);
  } else if (platform == 'ios') {
    return IOS.checkRequirements(options);
  } else {
    Console.debug("Unknown platform ", platform);
    return {acceptable: true};
  }
};

var requirePlatformReady = function (platform) {
  try {
    var installed = checkPlatformRequirements(platform);
    if (!installed.acceptable) {
      Console.warn("The " + platformToHuman(platform) + " platform is not installed; please run: " + Console.bold("meteor install-sdk " + platform));
      throw new main.ExitWithCode(2);
    }
  } catch (err) {
    if (err.message) {
      Console.warn(err.message);
    } else if (err instanceof main.ExitWithCode) {
      throw err;
    } else {
      Console.warn("Unexpected error while checking platform requirements: ", err);
    }
    throw new main.ExitWithCode(2);
  }
}

// --- Mobile Control File parsing ---


// Hard-coded constants
var iconIosSizes = {
  'iphone': '60x60',
  'iphone_2x': '120x120',
  'iphone_3x': '180x180',
  'ipad': '76x76',
  'ipad_2x': '152x152'
};

var iconAndroidSizes = {
  'android_ldpi': '36x36',
  'android_mdpi': '42x42',
  'android_hdpi': '72x72',
  'android_xhdpi': '96x96'
};

var launchIosSizes = {
  'iphone': '320x480',
  'iphone_2x': '640x960',
  'iphone5': '640x1136',
  'iphone6': '750x1334',
  'iphone6p_portrait': '1242x2208',
  'iphone6p_landscape': '2208x1242',
  'ipad_portrait': '768x1004',
  'ipad_portrait_2x': '1536x2008',
  'ipad_landscape': '1024x748',
  'ipad_landscape_2x': '2048x1496'
};

var launchAndroidSizes = {
  'android_ldpi_portrait': '320x426',
  'android_ldpi_landscape': '426x320',
  'android_mdpi_portrait': '320x470',
  'android_mdpi_landscape': '470x320',
  'android_hdpi_portrait': '480x640',
  'android_hdpi_landscape': '640x480',
  'android_xhdpi_portrait': '720x960',
  'android_xhdpi_landscape': '960x720'
};

// Given the mobile control file converts it to the Phongep/Cordova project's
// config.xml file and copies the necessary files (icons and launch screens) to
// the correct build location. Replaces all the old resources.
var consumeControlFile = function (controlFilePath, cordovaPath) {
  verboseLog('Reading the mobile control file');
  // clean up the previous settings and resources
  files.rm_recursive(path.join(cordovaPath, 'resources'));

  var code = '';

  if (fs.existsSync(controlFilePath)) {
    // read the file if it exists
    code = fs.readFileSync(controlFilePath, 'utf8');
  }

  var metadata = {
    id: 'com.id' + project.getAppIdentifier(),
    version: '0.0.1',
    name: path.basename(project.rootDir),
    description: 'New Meteor Mobile App',
    author: 'A Meteor Developer',
    email: 'n/a',
    website: 'n/a'
  };

  // set some defaults different from the Phonegap/Cordova defaults
  var additionalConfiguration = {
    'webviewbounce': false,
    'DisallowOverscroll': true
  };

  if (project.dependencies['launch-screen']) {
    additionalConfiguration.AutoHideSplashScreen = false;
    additionalConfiguration.SplashScreen = 'screen';
    additionalConfiguration.SplashScreenDelay = 10000;
  }

  // Defaults are Meteor meatball images located in tool's directory
  var assetsPath = path.join(__dirname, 'cordova-assets');
  var iconsPath = path.join(assetsPath, 'icons');
  var launchscreensPath = path.join(assetsPath, 'launchscreens');
  var imagePaths = {
    icon: {},
    splash: {}
  };

  var setIcon = function (size, name) {
    imagePaths.icon[name] = path.join(iconsPath, size + '.png');
  };
  var setLaunch = function (size, name) {
    imagePaths.splash[name] = path.join(launchscreensPath, size + '.png');
  };

  _.each(iconIosSizes, setIcon);
  _.each(iconAndroidSizes, setIcon);
  _.each(launchIosSizes, setLaunch);
  _.each(launchAndroidSizes, setLaunch);

  /**
   * @namespace App
   * @global
   * @summary The App configuration object in mobile-config.js
   */
  var App = {
    /**
     * @summary Set your mobile app's core configuration information.
     * @param {Object} options
     * @param {String} [options.id,version,name,description,author,email,website]
     * Each of the options correspond to a key in the app's core configuration
     * as described in the [PhoneGap documentation](http://docs.phonegap.com/en/3.5.0/config_ref_index.md.html#The%20config.xml%20File_core_configuration_elements).
     * @memberOf App
     */
    info: function (options) {
      // check that every key is meaningful
      _.each(options, function (value, key) {
        if (! _.has(metadata, key))
          throw new Error("Unknown key in App.info configuration: " + key);
      });

      _.extend(metadata, options);
    },
    /**
     * @summary Add a preference for your build as described in the
     * [PhoneGap documentation](http://docs.phonegap.com/en/3.5.0/config_ref_index.md.html#The%20config.xml%20File_global_preferences).
     * @param {String} name A preference name supported by Phonegap's
     * `config.xml`.
     * @param {String} value The value for that preference.
     * @memberOf App
     */
    setPreference: function (key, value) {
      additionalConfiguration[key] = value;
    },

    /**
     * @summary Set the build-time configuration for a Phonegap plugin.
     * @param {String} pluginName The identifier of the plugin you want to
     * configure.
     * @param {Object} config A set of key-value pairs which will be passed
     * at build-time to configure the specified plugin.
     * @memberOf App
     */
    configurePlugin: function (pluginName, config) {
      pluginsConfiguration[pluginName] = config;
    },

    /**
     * @summary Set the icons for your mobile app.
     * @param {Object} icons An Object where the keys are different
     * devices and screen sizes, and values are image paths
     * relative to the project root directory.
     *
     * Valid key values:
     * - `iphone`
     * - `iphone_2x`
     * - `iphone_3x`
     * - `ipad`
     * - `ipad_2x`
     * - `android_ldpi`
     * - `android_mdpi`
     * - `android_hdpi`
     * - `android_xhdpi`
     * @memberOf App
     */
    icons: function (icons) {
      var validDevices =
        _.keys(iconIosSizes).concat(_.keys(iconAndroidSizes));
      _.each(icons, function (value, key) {
        if (! _.include(validDevices, key))
          throw new Error(key + ": unknown key in App.icons configuration.");
      });
      _.extend(imagePaths.icon, icons);
    },

    /**
     * @summary Set the launch screen images for your mobile app.
     * @param {Object} launchScreens A dictionary where keys are different
     * devices, screen sizes, and orientations, and the values are image paths
     * relative to the project root directory.
     *
     * For Android, launch screen images should
     * be special "Nine-patch" image files that specify how they should be
     * stretched. See the [Android docs](https://developer.android.com/guide/topics/graphics/2d-graphics.html#nine-patch).
     *
     * Valid key values:
     * - `iphone`
     * - `iphone_2x`
     * - `iphone5`
     * - `iphone6`
     * - `iphone6p_portrait`
     * - `iphone6p_landscape`
     * - `ipad_portrait`
     * - `ipad_portrait_2x`
     * - `ipad_landscape`
     * - `ipad_landscape_2x`
     * - `android_ldpi_portrait`
     * - `android_ldpi_landscape`
     * - `android_mdpi_portrait`
     * - `android_mdpi_landscape`
     * - `android_hdpi_portrait`
     * - `android_hdpi_landscape`
     * - `android_xhdpi_portrait`
     * - `android_xhdpi_landscape`
     *
     * @memberOf App
     */
    launchScreens: function (launchScreens) {
      var validDevices =
        _.keys(launchIosSizes).concat(_.keys(launchAndroidSizes));

      _.each(launchScreens, function (value, key) {
        if (! _.include(validDevices, key))
          throw new Error(key + ": unknown key in App.launchScreens configuration.");
      });
      _.extend(imagePaths.splash, launchScreens);
    }
  };

  try {
    verboseLog('Running the mobile control file');
    files.runJavaScript(code, {
      filename: 'mobile-config.js',
      symbols: { App: App }
    });
  } catch (err) {
    throw new Error('Error reading mobile-config.js:' + err.stack);
  }

  var XmlBuilder = getLoadedPackages().xmlbuilder.XmlBuilder;
  var config = XmlBuilder.create('widget');

  _.each({
    id: metadata.id,
    version: metadata.version,
    xmlns: 'http://www.w3.org/ns/widgets',
    'xmlns:cdv': 'http://cordova.apache.org/ns/1.0'
  }, function (val, key) {
    config.att(key, val);
  });

  // set all the metadata
  config.ele('name').txt(metadata.name);
  config.ele('description').txt(metadata.description);
  config.ele('author', {
    href: metadata.website,
    email: metadata.email
  }).txt(metadata.author);

  // set the additional configuration preferences
  _.each(additionalConfiguration, function (value, key) {
    config.ele('preference', {
      name: key,
      value: value.toString()
    });
  });

  // load from index.html by default
  config.ele('content', { src: 'index.html' });
  // allow cors for the initial file
  config.ele('access', { origin: '*' });

  var iosPlatform = config.ele('platform', { name: 'ios' });
  var androidPlatform = config.ele('platform', { name: 'android' });

  // Prepare the resources folder
  var resourcesPath = path.join(cordovaPath, 'resources');
  files.rm_recursive(resourcesPath);
  files.mkdir_p(resourcesPath);

  verboseLog('Copying resources for mobile apps');

  var imageXmlRec = function (name, width, height, src) {
    var androidMatch = /android_(.?.dpi)_(landscape|portrait)/g.exec(name);
    var xmlRec = {
      src: src,
      width: width,
      height: height
    };

    // XXX special case for Android
    if (androidMatch)
      xmlRec.density = androidMatch[2].substr(0, 4) + '-' + androidMatch[1];

    return xmlRec;
  };
  var setImages = function (sizes, xmlEle, tag) {
    _.each(sizes, function (size, name) {
      var width = size.split('x')[0];
      var height = size.split('x')[1];

      var suppliedPath = imagePaths[tag][name];
      if (! suppliedPath)
        return;

      var suppliedFilename = _.last(suppliedPath.split(path.sep));
      var extension = _.last(suppliedFilename.split('.'));

      // XXX special case for 9-patch png's
      if (suppliedFilename.match(/\.9\.png$/)) {
        extension = '9.png';
      }

      var fileName = name + '.' + tag + '.' + extension;
      var src = path.join('resources', fileName);

      // copy the file to the build folder with a standardized name
      files.copyFile(path.resolve(project.rootDir, suppliedPath),
                     path.join(resourcesPath, fileName));

      // set it to the xml tree
      xmlEle.ele(tag, imageXmlRec(name, width, height, src));

      // XXX reuse one size for other dimensions
      var dups = {
        '60x60': ['29x29', '40x40', '50x50', '57x57', '58x58'],
        '76x76': ['72x72'],
        '152x152': ['144x144'],
        '120x120': ['80x80', '100x100', '114x114'],
        '768x1004': ['768x1024'],
        '1536x2008': ['1536x2048'],
        '1024x748': ['1024x768'],
        '2048x1496': ['2048x1536']
      }[size];

      // just use the same image
      _.each(dups, function (size) {
        width = size.split('x')[0];
        height = size.split('x')[1];
        // XXX this is fine to not supply a name since it is always iOS, but
        // this is a hack right now.
        xmlEle.ele(tag, imageXmlRec('n/a', width, height, src));
      });
    });
  };

  // add icons and launch screens to config and copy the files on fs
  setImages(iconIosSizes, iosPlatform, 'icon');
  setImages(iconAndroidSizes, androidPlatform, 'icon');
  setImages(launchIosSizes, iosPlatform, 'splash');
  setImages(launchAndroidSizes, androidPlatform, 'splash');

  var formattedXmlConfig = config.end({ pretty: true });
  var configPath = path.join(cordovaPath, 'config.xml');

  verboseLog('Writing new config.xml');
  fs.writeFileSync(configPath, formattedXmlConfig, 'utf8');
};

var Host = function () {
  var self = this;

  self._unameCache = {};
};

_.extend(Host.prototype, {
  isMac: function () {
    var self = this;
    return process.platform === 'darwin';
  },

  isLinux: function () {
    var self = this;
    return process.platform === 'linux';
  },

  getName : function () {
    return archinfo.host();
  },

  getProcessor: function () {
    var self = this;
    return self.getUname([ '--processor' ]);
  },

  getUname: function (args) {
    var self = this;

    args = args || [];

    var cacheKey = args.join('::');
    var uname = self._unameCache[cacheKey];
    if (uname === undefined) {
      var cmd = new processes.RunCommand('uname', args);
      var execution = cmd.run();
      uname = execution.stdout.trim();

      self._unameCache[cacheKey] = uname;
    }
    return uname;
  },

  which: function (findCmd) {
    var cmd = new processes.RunCommand('which', [ findCmd ], { checkExitCode: false });
    var execution = cmd.run();
    var location = execution.stdout.trim();
    if (location == "") {
      return null;
    }
    return location;
  },

  hasYum: function () {
    var self = this;
    return !!self.which('yum');
  },

  hasAptGet: function () {
    var self = this;
    return !!self.which('apt-get');
  },

  getHomeDir: function () {
    return process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
  }
});

// (Sneakily) mask Host to make it a singleton
var Host = new Host();

var IOS = function () {

};

_.extend(IOS.prototype, {

  hasXcode: function () {
    var self = this;

    if (!Host.isMac()) {
      return false;
    }

    var stat = files.statOrNull('/Applications/Xcode.app');
    return (stat && stat.isDirectory());
  },

  installXcode: function () {
    if (!Host.isMac()) {
      throw new Error("Can only install Xcode on OSX");
    }

    buildmessage.enterJob({title: 'Installing Xcode'}, function () {
      //Console.info("Launching Xcode installer; please choose 'Get Xcode' to install Xcode");
      //files.run('/usr/bin/xcodebuild', '--install');

      // XXX: Any way to open direct in AppStore (rather than in browser)?
      // Yes: macappstores://itunes.apple.com/us/app/xcode/id497799835
      files.run('open', 'https://itunes.apple.com/us/app/xcode/id497799835?mt=12');
    });
  },

  hasAgreedXcodeLicense: function () {
    var self = this;

    var cmd = new processes.RunCommand('/usr/bin/xcrun', [ 'cc', '--version' ], { checkExitCode: false });
    var execution = cmd.run();
    if (execution.stderr.indexOf('Xcode/iOS license') != -1) {
      return false;
    }
    return true;
  },

  launchXcode: function () {
    var self = this;

    var cmd = new processes.RunCommand('/usr/bin/open', [ '/Applications/Xcode.app/' ]);
    var execution = cmd.run();
  },

  getDirectoryForSdk: function (version) {
    return '/Applications/Xcode.app/Contents/Developer/Platforms/iPhoneOS.platform/Developer/SDKs/iPhoneOS' + version + '.sdk';
  },

  isSdkInstalled: function (version) {
    var self = this;
    var stat = files.statOrNull(self.getDirectoryForSdk(version));
    return stat != null;
  },

  checkRequirements: function (options) {
    var self = this;

    options = options || {};
    var log = !!options.log;
    var fix = !!options.fix;

    if (!Host.isMac()) {
      log && Console.info("You are not running on OSX; we won't be able to install Xcode for local iOS development");
      return { acceptable: false, missing: [ "ios" ] };
    }

    var result = { acceptable: true, missing: [] };

    var okay = true;
    if (self.hasXcode()) {
      log && Console.info(Console.success("Xcode is installed"));
    } else {
      if (fix) {
        log && Console.info("Installing Xcode");

        self.installXcode();
      } else {
        log && Console.info(Console.fail("Xcode is not installed"));

        result.missing.push("xcode");
        result.acceptable = false;
      }
    }

    //Check if the full Xcode package is already installed:
    //
    //  $ xcode-select -p
    //If you see:
    //
    //  /Applications/Xcode.app/Contents/Developer
    //the full Xcode package is already installed.

    if (self.hasXcode()) {
      if (self.hasAgreedXcodeLicense()) {
        log && Console.info(Console.success("Xcode license agreed"));
      } else {
        if (fix) {
          log && Console.info("Please accept the Xcode license");

          self.launchXcode();

          // XXX: Wait?
        } else {
          log && Console.info(Console.fail("You must accept the Xcode license"));

          result.missing.push("xcode-license");
          result.acceptable = false;
        }
      }
    }

    _.each(['5.0', '5.0.1', '5.1', '6.0', '6.1'], function (version) {
      if (self.isSdkInstalled(version)) {
        log && Console.warn("An old version of the iPhone SDK is installed (" + version + "); you should");
        log && Console.warn("probably delete it. With SDK versions prior to 7.0 installed, your apps");
        log && Console.warn("can't be published to the App Store. Moreover, some Cordova plugins are");
        log && Console.warn("incompatible with this SDK.");
        log && Console.info("You can remove it by deleting this directory: ");
        log && Console.info("    " + self.getDirectoryForSdk(version));

        // Not really a failure; just warn...
      }
    });

    return result;
  },

  killSimulator: function () {
    var execFileSync = require('./utils.js').execFileSync;
    execFileSync('killall', ['iOS Simulator']);
    execFileSync('killall', ['iPhone Simulator']);
  }
});

var IOS = new IOS();

var Android = function () {

};

_.extend(Android.prototype, {
  hasAcceleration: function () {
    var self = this;

    if (Host.isMac()) {
      var kexts = files.run('kextstat');
      var found = _.any(kexts.split('\n'), function (line) {
        if (line.indexOf('com.intel.kext.intelhaxm') != -1) {
          Console.debug("Found com.intel.kext.intelhaxm: ", found);
          return true;
        }
      });
      return found;
    }

    if (Host.isLinux()) {
      var stat = files.statOrNull("/dev/kvm");
      if (stat != null) {
        Console.debug("Found /dev/kvm");
      } else {
        Console.debug("/dev/kvm not found");
      }
      return stat != null;
    }

    Console.info("Can't determine acceleration for unknown host: ", archinfo.host());
    return undefined;
  },

  installAcceleration: function () {
    var self = this;

    if (Host.isMac()) {
      // The mpkg is small, so it's OK to buffer it in memory
      var name = 'IntelHAXM_1.0.8.mpkg';
      var mpkg = httpHelpers.getUrl({
        url: 'http://android-bundle.s3.amazonaws.com/haxm/' + name,
        // XXX: https://warehouse.meteor.com/haxm/' + name,
        encoding: null
      });

      var dir = path.join(cordovaWarehouseDir(), 'haxm');
      var filepath = path.join(dir, name);
      files.mkdir_p(dir);
      fs.writeFileSync(filepath, mpkg);

      Console.info("Launching HAXM installer; we recommend allocating 1024MB of RAM (or more)");
      files.run('open', filepath);

      return;
    }

    if (Host.isLinux()) {
      // KVM should be enabled by default, if supported, on most modern distros?
      Console.info("Please enable KVM, for faster Android emulation");

      return;
    }

    throw new Error("Can't install acceleration for unknown host: " + archinfo.host());
  },

  useGlobalAdk: function () {
    return !!process.env.USE_GLOBAL_ADK;
  },

  findAndroidSdk: function (optional) {
    var self = this;
    if (self.useGlobalAdk()) {
      var androidSdkPath;

      // See if USE_GLOBAL_ADK is a path
      var globalAdk = process.env.USE_GLOBAL_ADK;
      if (globalAdk) {
        var stat = files.statOrNull(path.join(globalAdk, "tools", "android"));
        if (stat && stat.isFile()) {
          androidSdkPath = globalAdk;
        }
      }

      if (!androidSdkPath) {
        var whichAndroid = Host.which('android');
        if (whichAndroid) {
          androidSdkPath = path.join(whichAndroid, '../..');
        }
      }

      if (!optional && !androidSdkPath) {
        throw new Error("Cannot find Android SDK; be sure the 'android' tool is on your path");
      }

      Console.debug("Using (global) Android SDK at", androidSdkPath);

      return androidSdkPath;
    } else {
      var androidBundlePath = self.getAndroidBundlePath();
      var androidSdkPath = path.join(androidBundlePath, 'android-sdk');

      Console.debug("Using (built-in) Android SDK at", androidSdkPath);

      return androidSdkPath;
    }
  },

  getAndroidBundlePath: function () {
    // XXX XXX is this right?
    if (files.usesWarehouse())
      return path.join(tropo.root, 'android_bundle');
    else
      return path.join(files.getCurrentToolsDir(), 'android_bundle');
  },

  runAndroidTool: function (args, options) {
    var self = this;
    options = options || {};

    var androidSdk = self.findAndroidSdk();
    var androidToolPath = path.join(androidSdk, 'tools', 'android');

    options.env = _.extend(buildAndroidEnv(), options.env || {});
    if (options.progress) {
      options.onStdout = function (data) {
        // Output looks like: (20%, ...
        var re = /\((.{1,3})%,/;
        var match = re.exec(data);
        if (match) {
          var status = {current: parseInt(match[1]), end: 100};
          options.progress.reportProgress(status);
        }
      };
    }

    var cmd = new processes.RunCommand(androidToolPath, args, options);
    if (options.detached) {
      return cmd.start();
    }

    var execution = cmd.run();

    if (options.progress) {
      options.progress.reportProgressDone();
    }

    if (execution.exitCode !== 0) {
      Console.warn("Unexpected exit code from android process: " + execution.exitCode);
      Console.warn("stdout: " + execution.stdout);
      Console.warn("stderr: " + execution.stderr);

      throw new Error("Error running android tool: exit code " + execution.exitCode);
    }

    return execution.stdout;
  },

  listAvds: function () {
    var self = this;

    var out = self.runAndroidTool(['list', 'avd', '--compact']);
    var avds = [];
    _.each(out.split('\n'), function (line) {
      line = line.trim();
      avds.push(line);
    });
    Console.debug("Found AVDS:", avds);
    return avds;
  },

  hasAvd: function (avd) {
    var self = this;
    return _.contains(self.listAvds(), avd);
  },

  getAvdName: function () {
    var self = this;
    return process.env.METEOR_AVD || DEFAULT_AVD_NAME;
  },

  hasTarget: function (findApi, findArch) {
    var self = this;

    var out = self.runAndroidTool(['list', 'target']);
    var currentApi = null;
    return _.any(out.split('\n'), function (line) {
      line = line.trim();
      if (line.indexOf("API level:") == 0) {
        currentApi = line.substring(line.indexOf(":") + 1).trim();
      } else if (line.indexOf("Tag/ABIs") == 0) {
        var abis = line.substring(line.indexOf(":") + 1).trim();
        return _.any(abis.split(','), function (abi) {
          abi = abi.trim();
          if (currentApi == findApi && abi == findArch) {
            return true;
          }
        });
      }
    });
    return false;
  },

  installTarget: function (target, checkFn) {
    var self = this;

    var stdout;

    buildmessage.enterJob({ title: 'Installing Android target ' + target}, function () {
      var options = {stdin: 'y\n'};
      options.progress = buildmessage.getCurrentProgressTracker();
      stdout = self.runAndroidTool(['update', 'sdk', '-t', target, '--all', '-u'], options);
    });

    // Android tool doesn't set exit code correctly, so we have to check the target is no longer available
    if (checkFn) {
      if (!checkFn()) {
        Console.debug("stdout from sdk install was:", stdout);
        throw new Error("Failed to install android target: " + target);
      }
    } else {
      Console.debug("(No check function; can't verify success of installTarget)");
    }
  },

  isPlatformInstalled: function (name) {
    var self = this;

    var androidSdkPath = self.findAndroidSdk();
    var stat = files.statOrNull(path.join(androidSdkPath, 'platforms', name));
    if (stat == null) {
      return false;
    }
    return true;
  },

  isBuildToolsInstalled: function (version) {
    var self = this;

    var androidSdkPath = self.findAndroidSdk();
    var stat = files.statOrNull(path.join(androidSdkPath, 'build-tools', version));
    if (stat == null) {
      return false;
    }
    return true;
  },

  canRunAapt: function (buildToolsVersion) {
    var self = this;

    var androidSdkPath = self.findAndroidSdk();
    var aaptPath = path.join(androidSdkPath,
                             'build-tools',
                             buildToolsVersion,
                             'aapt');
    var args = [ 'version' ];
    try {
      var options = {};
      options.env = buildAndroidEnv();
      // We'll check the exit code ourselves
      options.checkExitCode = false;

      var cmd = new processes.RunCommand(aaptPath, args, options);

      var execution = cmd.run();

      if (execution.exitCode !== 0) {
        Console.debug("Unable to run aapt." +
                      " (This is normal if 32 bit libraries are not found)");
        Console.debug("  exit code: " + execution.exitCode);
        Console.debug("  stdout: " + execution.stdout);
        Console.debug("  stderr: " + execution.stderr);

        return false;
      }

      // version is in stdout
      return true;
    } catch (err) {
      Console.debug("Error while running aapt", err);
      return false;
    }
  },

  isPlatformToolsInstalled: function () {
    var self = this;

    // XXX: We should check the platform-tools version (though that is not
    // trivial).  If we have an old version, it is possible that some newer
    // packages will fail to install (like an updated x86 image?)
    var androidSdkPath = self.findAndroidSdk();
    var stat = files.statOrNull(path.join(androidSdkPath, 'platform-tools', 'adb'));
    if (stat == null) {
      return false;
    }
    return true;
  },

  startEmulator: function (avd, options) {
    var self = this;

    if (!avd) {
      avd = self.getAvdName();
    }

    if (!self.hasAvd(avd)) {
      Console.error("'" + avd + "' android virtual device (AVD) does not exist");
      throw new Error("AVD not found: " + avd);
    }

    var androidSdk = self.findAndroidSdk();

    // XXX: Use emulator64-x86?  What difference does it make?
    var name = 'emulator';
    var emulatorPath = path.join(androidSdk, 'tools', name);

    var args = ['-avd', avd];

    var runOptions = {};
    runOptions.detached = true;
    runOptions.env = buildAndroidEnv();
    var cmd = new processes.RunCommand(emulatorPath, args, runOptions);
    cmd.start();
  },

  runAdb: function (args, options) {
    var self = this;

    var androidSdk = self.findAndroidSdk();
    var adbPath = path.join(androidSdk, 'platform-tools', "adb");

    var runOptions = options || {};
    runOptions.env = buildAndroidEnv();
    var cmd = new processes.RunCommand(adbPath, args, runOptions);
    return cmd.run();
  },

  // ANDROID_SDK_HOME is the homedir for Android.
  // If we're using a global adk, it is actually the user's home-dir
  // (unless they themeslves repointed it)
  // If we're using our own packaged ADK,
  getAndroidSdkHome: function () {
    var self = this;
    if (self.useGlobalAdk()) {
      return process.env.ANDROID_SDK_HOME || Host.getHomeDir();
    } else {
      return Android.getAndroidBundlePath();
    }
  },

  createAvd: function (avd, options) {
    var self = this;

    buildmessage.enterJob({title: 'Creating AVD'}, function () {
      var abi = "default/x86";

      //# XXX if this command fails, it would be really hard to debug or understand
      //# for the end user. But the output is also very misleading. Later we should
      //# save the output to a log file and tell user where to find it in case of
      //# failure.
      //    echo "
      //  " | "${ANDROID_BUNDLE}/android-sdk/tools/android" create avd --target 1 --name meteor --abi ${ABI} --path "${ANDROID_BUNDLE}/meteor_avd/" > /dev/null 2>&1
      var androidBundlePath = self.getAndroidBundlePath();
      var avdPath;
      if (self.useGlobalAdk()) {
        var home = Host.getHomeDir();
        avdPath = path.join(home, '.android', 'avd', avd + '.avd');
      } else {
        avdPath = path.join(androidBundlePath, avd + '_avd');
      }

      var args = ['create', 'avd',
        '--target', '1',
        '--name', avd,
        '--abi', abi,
        '--path', avdPath];

      // We need to send a new line to bypass the 'custom hardware prompt'
      self.runAndroidTool(args, {stdin: '\n'});

      var config = new files.KeyValueFile(path.join(avdPath, 'config.ini'));

      // Nice keyboard support
      config.set("hw.keyboard", "yes");
      config.set("hw.mainKeys", "no");

      // More RAM than the default
      config.set("hw.ramSize", "1024");
      config.set("vm.heapSize", "64");

      //# These are the settings for a Nexus 4, but it's a bit big for some screens
      //#  (and likely a bit slow without GPU & KVM/HAXM acceleration)
      //  #set_config "skin.dynamic" "yes"
      //#set_config "hw.lcd.density" "320"
      //#set_config "hw.device.name" "Nexus 4"
      //#set_config "hw.device.manufacturer" "Google"

      // XXX: Enable on Linux?
      if (Host.isMac()) {
        config.set("hw.gpu.enabled", "yes");
      }
    });
  },

  hasJava: function () {
    var self = this;

    if (Host.isMac()) {
      return files.statOrNull('/System/Library/Frameworks/JavaVM.framework/Versions/1.6/') != null;
    } else {
      return files.statOrNull('/usr/bin/java') != null;
    }
  },

  hasJdk: function () {
    var self = this;

    if (Host.isMac()) {
      var javaHomes = files.run('/usr/libexec/java_home');

      if (javaHomes) {
        javaHomes = javaHomes.trim();

        // JDK 8
        // /Library/Java/JavaVirtualMachines/jdk1.8.0_20.jdk/Contents/Home
        if (javaHomes.indexOf('/Library/Java/JavaVirtualMachines/jdk') != -1) {
          return true;
        }

        // JDK 6 (which is I think unsupported)
        // /System/Library/Java/JavaVirtualMachines/1.6.0.jdk/Contents/Home

        // XXX: This is a very liberal match
        if (javaHomes.indexOf('.jdk/') != -1) {
          return true;
        }
      }

      //Unable to find any JVMs matching version "(null)".
      //No Java runtime present, try --request to install.
      return false;
    } else {
      return !!Host.which('jarsigner');
    }
  },

  installJava: function () {
    var self = this;

    if (Host.isMac()) {
      // XXX: Find the magic incantation that invokes the JRE 6 installer
      var cmd = new processes.RunCommand('open', [ 'http://support.apple.com/kb/DL1572' ]);


      // Download http://support.apple.com/downloads/DL1572/en_US/JavaForOSX2014-001.dmg
      // Extract dmg

      // This works, but requires some manual steps
      // This installs, but doesn't provide java (?)
      //var cmd = new processes.RunCommand('open', [ 'https://www.java.com/en/download/mac_download.jsp' ]);
      cmd.run();

      return;
    }

    if (Host.isLinux()) {
      var processor = Host.getProcessor();

      if (Host.hasAptGet()) {
        Console.info("You can install the JDK using:");
        Console.info("  sudo apt-get install --yes openjdk-7-jdk");

        // XXX: Technically, these are for Android, not installing Java
        if (processor == "x86_64") {
          Console.info("You will also need some 32-bit libraries:");
          Console.info("  sudo apt-get install --yes lib32z1 lib32stdc++6");
        }
      } else if (Host.hasYum()) {
        Console.info("You can install the JDK using:");
        Console.info("  sudo yum install -y java-1.7.0-openjdk-devel");

        // XXX: Technically, these are for Android, not installing Java
        if (processor == "x86_64") {
          Console.info("You will also need some 32-bit libraries:");
          Console.info("  sudo yum install -y glibc.i686 zlib.i686 libstdc++.i686 ncurses-libs.i686");
        }
      } else {
        Console.warn("You should install the JDK; we don't have instructions for your distribution (sorry!)");
        Console.info("Please do submit the instructions so we can include them.")
      }

      return;
    }

    throw new Error("Cannot automatically install Java on host: " + Host.getName());
  },

  installJdk: function () {
    var self = this;

    throw new Error("Cannot automatically install JDK on host: " + Host.getName());
  },

  hasAndroidBundle: function () {
    var self = this;

    var androidBundlePath = self.getAndroidBundlePath();
    var versionPath = path.join(androidBundlePath, '.bundle_version.txt');

    if (files.statOrNull(versionPath)) {
      var version = fs.readFileSync(versionPath, { encoding: 'utf-8' });
      // XXX: Dry violation with script
      if (version.trim() == '0.1') {
        return true;
      }
    }
    return false;
  },

  installAndroidBundle: function () {
    var self = this;

    // XXX: Replace script
    try {
      buildmessage.enterJob({ title: 'Downloading Android bundle' }, function () {
        var scriptPath = path.join(files.getCurrentToolsDir(), 'tools', 'cordova-scripts', 'ensure_android_bundle.sh');

        verboseLog('Running script ' + scriptPath);

        var runOptions = {};
        runOptions.env = _.extend( { "USE_GLOBAL_ADK": "" },
          { "METEOR_WAREHOUSE_DIR": tropo.root },
          process.env);

        var progress = buildmessage.getCurrentProgressTracker();

        if (progress) {
          runOptions.onStderr = function (data) {
            var s = data.toString();
            // Output looks like: ###   10.3%
            var re = /#+\s*([0-9.]{1,4})%/;
            var match = re.exec(s);
            if (match) {
              var status = {current: parseInt(match[1]), end: 100};
              progress.reportProgress(status);
            }
          };
        }

        var cmd = new processes.RunCommand('bash', [scriptPath], runOptions);
        var execution = cmd.run();

        if (progress) {
          progress.reportProgressDone();
        }

        if (execution.exitCode != 0) {
          Console.warn("Unexpected exit code from script: " + execution.exitCode);
          Console.warn("stdout: " + execution.stdout);
          Console.warn("stderr: " + execution.stderr);
          throw new Error('Could not download Android bundle');
        }
      });
    } catch (err) {
      verboseLog('Failed to install android_bundle ', err.stack);
      Console.warn("Failed to install android bundle");
      throw new main.ExitWithCode(2);
    }
  },

  waitForEmulator: function () {
    var self = this;

    // Five minute default
    var timeLimit = 300 * 1000;

    // Boost timeout if not running HAXM/KVM
    if (self.hasAcceleration() === false) {
      Console.warn("Android emulator acceleration was not installed; the emulator will be very slow.");
      Console.info("You can run '" + Console.command("meteor install-sdk android") + "' for help.")
      timeLimit *= 4;
    }

    var interval = 1000;
    for (var i = 0; i < timeLimit / interval; i++) {
      Console.debug("Waiting for emulator");
      if (self.isEmulatorRunning()) {
        Console.debug("Found emulator");
        return;
      }
      utils.sleepMs(interval);
    }

    // Emulator did not start... encourage HAXM/KVM
    Console.error("The emulator did not start in the expected time.");
    if (self.hasAcceleration() === false) {
      if (Host.isLinux()) {
        Console.info("We highly recommend enabling KVM to speed up the emulator.");
      } else {
        Console.info("We highly recommend installing HAXM to speed up the emulator.");
      }
      Console.info("You can run '" + Console.command("meteor install-sdk android") + "' for help.")
    }

    throw new main.ExitWithCode(1);
  },

  isEmulatorRunning: function () {
    var self = this;

    var devices = self.listAdbDevices();
    return _.any(devices, function (device) {
      if (device.id && device.id.indexOf('emulator-') == 0) {
        if (device.state && device.state == 'device') {
          return true;
        }
      }
      return false;
    });
  },

  listAdbDevices: function () {
    var self = this;
    var execution = self.runAdb(['devices', '-l'], {});
    var devices = [];
    _.each(execution.stdout.split('\n'), function (line) {
      line = line.trim();
      line = line.replace('\t', ' ');
      while (line.indexOf('  ') != -1) {
        line = line.replace('  ', ' ');
      }
      if (line.length == 0) {
        return;
      }
      if (line.indexOf("List of devices") === 0) {
        return;
      }
      var tokens = line.split(' ');
      var device = {};
      device.id = tokens[0];
      device.state = tokens[1];
      for (var i = 2; i < tokens.length; i++) {
        var kv = splitN(tokens[i], ':', 2);
        device[kv[0]] = kv[1];
      }
      devices.push(device);
      Console.debug("Found device", JSON.stringify(device));
    });
    return devices;
  },

  checkRequirements: function (options) {
    var self = this;

    options = options || {};

    var log = !!options.log;
    var fix = !!options.fix;
    var fixConsole = !!options.fixConsole;
    var fixSilent = !!options.fixSilent;

    // fix => fixConsole
    if (fix) {
      fixConsole = true;
    }
    // fixConsole => fixSilent
    if (fixConsole) {
      fixSilent = true;
    }

    var result = { acceptable: true, missing: [] };

    var hasAndroid = false;
    if (!self.useGlobalAdk()) {
      if (self.hasAndroidBundle()) {
        log && Console.info(Console.success("Found Android bundle"));
        hasAndroid = true;
      } else {
        if (fixConsole) {
          log && Console.info("Installing Android bundle");

          self.installAndroidBundle();
          hasAndroid = true;
        } else {
          log && Console.info(Console.fail("Android bundle not found"));

          result.missing.push("android-bundle");
          result.acceptable = false;
        }
      }
    }

    if (self.useGlobalAdk()) {
      var androidSdk = self.findAndroidSdk(true);
      if (androidSdk) {
        log && Console.info(Console.success("Found Android SDK"));

        // XXX: Verify
        hasAndroid = true;
      } else {
        log && Console.info(Console.fail("Android SDK not found"));

        log && Console.info("If you set USE_GLOBAL_ADK, the 'android' tool must be on your path");

        result.missing.push("android-global-sdk");
        result.acceptable = false;
      }

      var hasAnt = !!Host.which("ant");
      if (hasAnt) {
        log && Console.info(Console.success("Found ant on PATH"));
      } else {
        log && Console.info(Console.fail("Ant not found on PATH"));

        result.missing.push("apache-ant");
        result.acceptable = false;
      }
    }

    var hasJava = false;
    if (self.hasJdk()) {
      log && Console.info(Console.success("A JDK is installed"));
      hasJava = true;
    } else {
      if (fix) {
        log && Console.info("Installing JDK");

        self.installJdk();
        hasJava = true;
      } else {
        log && Console.info(Console.fail("A JDK is not installed"));

        result.missing.push("jdk");
        result.acceptable = false;
      }
    }

    if (hasAndroid && hasJava) {
      if (self.isPlatformToolsInstalled()) {
        log && Console.info(Console.success("Found Android Platform tools"));
      } else {
        if (fixSilent) {
          log && Console.info("Installing Android Platform tools");
          self.installTarget('platform-tools', function () {
            return self.isPlatformToolsInstalled();
          });
          log && Console.info(Console.success("Installed Android Platform tools"));
        } else {
          log && Console.info(Console.fail("Android Platform tools not found"));

          result.missing.push("android-platform-tools");
          result.acceptable = false;
        }
      }

      var hasBuildToolsVersion;
      if (self.isBuildToolsInstalled('21.0.0')) {
        log && Console.info(Console.success("Found Android Build Tools"));
        hasBuildToolsVersion = '21.0.0';
      } else {
        if (fixSilent) {
          log && Console.info("Installing Android Build Tools");
          self.installTarget('build-tools-21.0.0', function () {
            return self.isBuildToolsInstalled('21.0.0');
          });
          log && Console.info(Console.success("Installed Android Build Tools"));
          hasBuildToolsVersion = '21.0.0';
        } else {
          log && Console.info(Console.fail("Android Build Tools not found"));

          result.missing.push("android-build-tools");
          result.acceptable = false;
        }
      }

      if (hasBuildToolsVersion) {
        // Check that we can actually run aapt - on 64 bit, we need 32 bit libs
        // We need aapt to be installed to do this!
        if (!self.canRunAapt(hasBuildToolsVersion)) {
          log && Console.info(Console.fail("32-bit libraries not found"));

          result.missing.push("libs32");
          result.acceptable = false;
        }
      }

      if (self.isPlatformInstalled('android-19')) {
        log && Console.info(Console.success("Found Android 19 API"));
      } else {
        if (fixSilent) {
          log && Console.info("Installing Android 19 API");
          self.installTarget('android-19', function () {
            return self.isPlatformInstalled('android-19');
          });
          log && Console.info(Console.success("Installed Android 19 API"));
        } else {
          log && Console.info(Console.fail("Android API 19 not found"));

          result.missing.push("android-api");
          result.acceptable = false;
        }
      }

      // (We could alternatively check for {SDK}/system-images/android-19/default/x86/build.prop)
      if (self.hasTarget('19', 'default/x86')) {
        log && Console.info(Console.success("Found suitable Android x86 image"));
      } else {
        if (fixSilent) {
          // The x86 image will fail to install if dependencies aren't there;
          // we've checked the others by version,but we should double-check
          // platform-tools as we don't check versions there
          log && Console.info("Making sure Android Platform tools are up to date");
          self.installTarget('platform-tools', function () {
            return self.isPlatformToolsInstalled();
          });

          log && Console.info("Installing Android x86 image");
          self.installTarget('sys-img-x86-android-19', function () {
            return self.hasTarget('19', 'default/x86');
          });
          log && Console.info(Console.success("Installed Android x86 image"));
        } else {
          log && Console.info(Console.fail("Suitable Android x86 image not found"));

          result.missing.push("android-sys-img");
          result.acceptable = false;
        }
      }

      var avdName = self.getAvdName();
      if (self.hasAvd(avdName)) {
        log && Console.info(Console.success("'" + avdName + "' android virtual device (AVD) found"));
      } else {
        var isDefaultAvd = avdName === DEFAULT_AVD_NAME;
        if (fixSilent && isDefaultAvd) {
          log && Console.info("Creating android virtual device (AVD): " + avdName);

          var avdOptions = {};
          self.createAvd(avdName, avdOptions);

          log && Console.info(Console.success("'" + avdName + "' android virtual device (AVD) created"));
        } else {
          log && Console.info(Console.fail("'" + avdName + "' android virtual device (AVD) not found"));

          if (!isDefaultAvd) {
            log && Console.info("(Because you specified a custom AVD, we don't create it automatically)");
          }

          result.missing.push("android-avd");
          result.acceptable = false;
        }
      }
    }

    // (hasAcceleration can also be undefined)
    var hasAcceleration = self.hasAcceleration();
    if (hasAcceleration === false) {
      if (fix) {
        self.installAcceleration();
      } else {
        log && Console.info(Console.fail("Android emulator acceleration is not installed"));
        log && Console.info("  (The Android emulator will be very slow without acceleration)");

        result.missing.push("haxm");

        // Not all systems can install the accelerator, so don't block
        // XXX: Maybe we should block the emulator (only); it is unusable without it
        //result.acceptable = false
      }
    } else if (hasAcceleration === true) {
      // (can be undefined)
      log && Console.info(Console.success("Android emulator acceleration is installed"));
    }

    return result;
  }
});

var Android = new Android();

// --- Cordova commands ---

// add one or more Cordova platforms
main.registerCommand({
  name: 'add-platform',
  options: {
    verbose: { type: Boolean, short: "v" }
  },
  minArgs: 1,
  maxArgs: Infinity,
  requiresApp: true,
  pretty: true,
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  cordova.setVerboseness(options.verbose);
  Console.setVerbose(options.verbose);

  var platforms = options.args;
  var currentPlatforms = project.getPlatforms();

  try {
    _.each(platforms, function (platform) {
      if (_.contains(currentPlatforms, platform)) {
        throw new Error(platform + ": platform is already added");
      }

      if (! _.contains(availablePlatforms, platform)) {
        throw new Error(platform + ': no such platform');
      }
    });
  } catch (err) {
    if (err.message) {
      Console.warn(err.message);
    }
    return 1;
  }

  // Check if the platform isn't supported on our OS
  _.each(platforms, function (platform) {
    if (platform === "ios" && !Host.isMac()) {
      Console.warn(MESSAGE_IOS_ONLY_ON_MAC);
      throw new main.ExitWithCode(2);
    }
  });

  // Check that the platform is installed
  _.each(platforms, function (platform) {
    requirePlatformReady(platform);
  });

  try {
    var agreed = _.every(platforms, function (platform) {
      var platformTitle = platformToHuman(platform);
      platformTitle = "the " + platformTitle + " platform";

      return checkAgreePlatformTerms(platform, platformTitle);
    });
    if (!agreed) {
      Console.warn("Could not add platform: you must agree to the terms");
      return 2;
    }
  } catch (err) {
    if (err.message) {
      Console.warn(err.message);
    }
    return 1;
  }

  buildmessage.enterJob({ title: 'Adding platforms' }, function () {
    project.addCordovaPlatforms(platforms);

    if (platforms.length) {
      var localPath = path.join(options.appDir, '.meteor', 'local');
      files.mkdir_p(localPath);

      var appName = path.basename(options.appDir);
      ensureCordovaProject(localPath, appName);
      ensureCordovaPlatforms(localPath);
    }
  });

  _.each(platforms, function (platform) {
    Console.info(platform + ": added platform");
  });
});

// remove one or more Cordova platforms
main.registerCommand({
  name: 'remove-platform',
  minArgs: 1,
  maxArgs: Infinity,
  requiresApp: true,
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  var platforms = options.args;

  _.each(platforms, function (platform) {
    // explain why we can't remove server or browser platforms
    if (_.contains(project.getDefaultPlatforms(), platform)) {
      Console.stdout.write(platform + ": cannot remove platform " +
                           "in this version of Meteor\n");
      return;
    }

    if (_.contains(project.getPlatforms(), platform)) {
      Console.stdout.write(platform + ": removed platform\n");
      return;
    }

    Console.stdout.write(platform + ": platform is not in this project\n");
  });
  project.removeCordovaPlatforms(platforms);

  if (platforms.length) {
    var localPath = path.join(options.appDir, '.meteor', 'local');
    files.mkdir_p(localPath);

    var appName = path.basename(options.appDir);
    ensureCordovaProject(localPath, appName);
    ensureCordovaPlatforms(localPath);
  }

});

main.registerCommand({
  name: 'list-platforms',
  requiresApp: true,
  pretty: true,
  catalogRefresh: new catalog.Refresh.Never()
}, function () {
  var platforms = project.getPlatforms();

  Console.stdout.write(platforms.join("\n"));
});

main.registerCommand({
  name: 'configure-android',
  options: {
    verbose: { type: Boolean, short: "v" }
  },
  minArgs: 0,
  maxArgs: Infinity,
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  cordova.setVerboseness(options.verbose);
  Console.setVerbose(options.verbose);

  requirePlatformReady('android');

  var runOptions = {};
  runOptions.detached = true;
  runOptions.pipeOutput = true;

  var args = options.args || [];
  try {
    Android.runAndroidTool(args, runOptions);
  } catch (err) {
    // this tool can crash for whatever reason, ignore its failures
    Console.debug("Ignoring error from android tool", err);
  }
  return 0;
});

main.registerCommand({
  name: 'android-launch',
  pretty: true,
  options: {
    verbose: { type: Boolean, short: "v" }
  },
  minArgs: 0,
  maxArgs: 1,
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  requirePlatformReady('android');

  var args = options.args;
  var avd = Android.getAvdName();
  if (args.length) {
    avd = args[0];
  }

  if (!Android.hasAvd(avd)) {
    Console.error("'" + avd + "' android virtual device (AVD) does not exist");
    Console.info("The default AVD is called meteor, and will be created automatically for you");
    return 1;
  }

  Android.startEmulator(avd);

  return 0;
});

// XXX: Move to Strings
var capitalize = function (s) {
  if (!s.length) return s;
  return s.substring(0, 1).toUpperCase() + s.substring(1);
};

// XXX: Move to Console (?)
var openUrl = function (url) {
  files.run('open', url);
};

main.registerCommand({
  name: 'install-sdk',
  pretty: true,
  options: {
    verbose: { type: Boolean, short: "v" }
  },
  minArgs: 1,
  maxArgs: 1,
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  cordova.setVerboseness(options.verbose);
  Console.setVerbose(options.verbose);

  var platform = options.args[0];
  platform = platform.trim().toLowerCase();

  if (platform != "android" && platform != "ios") {
    Console.warn("Unknown platform: " + platform);
    Console.info("Valid platforms are: android, ios");
    return 1;
  }

  var installed = checkPlatformRequirements(platform, { log:true, fix: false, fixConsole: true, fixSilent: true } );
  if (!_.isEmpty(installed.missing)) {
    if (Host.isLinux() && platform === "ios") {
      Console.warn(Console.fail(MESSAGE_IOS_ONLY_ON_MAC));
      return 1;
    }

    Console.warn("Platform requirements not yet met");

    var host = null;
    if (Host.isMac()) {
      host = "Mac";
    } else if (Host.isLinux()) {
      host = "Linux";
    }
    if (host) {
      var wikiPage = "Mobile-Dev-Install:-" + capitalize(platform) + "-on-" + host;
      var anchor = installed.missing.length ? installed.missing[0] : null;
      var url = "https://github.com/meteor/meteor/wiki/" + wikiPage; // URL escape?
      if (anchor) {
        url += "#" + anchor;
      }
      openUrl(url);
      Console.info("Please follow the instructions here:\n" + Console.bold(url) + "\n");
    } else {
      Console.info("We don't have installation instructions for your platform");
    }

    if (installed.acceptable)
      return 0;
    else
      return 1;
  }

  //var args = options.args || [];
  //if (args.length) {
  //  var arg = args[0];
  //  if (arg == "adb") {
  //    Android.runAdb(args.slice(1), { pipeOutput: true, detached: true, stdio: 'inherit' });
  //  }
  //}

  return 0;
});
