var main = require('./main.js');
var path = require('path');
var _ = require('underscore');
var fs = require('fs');
var util = require('util');
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

// XXX hard-coded the use of default tropohouse
var tropo = tropohouse.default;
var webArchName = "web.cordova";

// android is available on all supported architectures
var availablePlatforms =
  project.getDefaultPlatforms().concat(["android", "firefoxos"]);

// ios is only available on OSX
if (process.platform === 'darwin') {
  availablePlatforms.push("ios");
}

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

var isValidPlatform = function (name) {
  if (name.match(/ios/i) && process.platform !== 'darwin') {
    throw new Error(name + ': not available on your system');
  }

  if (! _.contains(availablePlatforms, name)) {
    throw new Error(name + ': no such platform');
  }
};

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

var cordova = exports;

// --- the public interface ---

// Builds a Cordova project that targets the list of 'platforms'
// options:
//   - appName: the target path of the build
//   - host
//   - port
cordova.buildPlatforms = function (localPath, platforms, options) {
  verboseLog('Running build for platforms:', platforms);
  checkRequestedPlatforms(platforms);

  _.each(platforms, function (platform) {
    requirePlatformReady(platform);
  });

  buildCordova(localPath, 'build', options);
};

cordova.buildPlatformRunners = function (localPath, platforms, options) {
  var runners = [];
  _.each(platforms, function (platformName) {
    runners.push(new CordovaRunner(localPath, platformName, options));
  });
  return runners;
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
  ensureAndroidBundle(file);

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
  ensureAndroidBundle(file);

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

var cordovaScriptExecutionCache = {};

var runCordovaScript = function (name, cache) {
  var scriptPath =
    path.join(files.getCurrentToolsDir(), 'tools', 'cordova-scripts', name);

  if (cache && cordovaScriptExecutionCache[scriptPath]) {
    verboseLog('Script already checked: ' + name);
    return;
  }

  verboseLog('Running script ' + name);
  execFileSyncOrThrow('bash', [scriptPath], { pipeOutput: true });
  if (cache) {
    cordovaScriptExecutionCache[scriptPath] = true;
  }
};

var ensureAndroidBundle = function (command) {
  if (command && ! _.contains([localAdb, localAndroid], command)) {
    if (command !== localCordova ||
        ! _.contains(project.getCordovaPlatforms(), 'android'))
      return;
  }

  try {
    runCordovaScript('ensure_android_bundle.sh', true);
  } catch (err) {
    verboseLog('Failed to install android_bundle ', err.stack);
    Console.warn("Failed to install android_bundle");
    throw new main.ExitWithCode(2);
  }
};

var generateCordovaBoilerplate = function (clientDir, options) {
  var clientJsonPath = path.join(clientDir, 'program.json');
  var clientJson = JSON.parse(fs.readFileSync(clientJsonPath, 'utf8'));
  var manifest = clientJson.manifest;
  var settings = options.settings ?
    JSON.parse(fs.readFileSync(options.settings, 'utf8')) : {};
  var publicSettings = settings['public'];

  var meteorRelease = project.getMeteorReleaseVersion();
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
    urlMapper: function (url) { return url ? url.substr(1) : ''; },
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
        { cwd: path.dirname(cordovaPath) });

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
    localCordova, ['platform', 'list'], { cwd: cordovaPath });

  // skip iOS platform if not on darwin
  if (process.platform !== 'darwin') {
   platforms = _.difference(platforms, ['ios']);
  }

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
    if (! _.contains(installedPlatforms, platform) &&
        _.contains(availablePlatforms, platform)) {
      verboseLog('Adding a platform', platform);
      execFileSyncOrThrow(localCordova, ['platform', 'add', platform],
                          { cwd: cordovaPath });
    }
  });

  _.each(installedPlatforms, function (platform) {
    if (! _.contains(platforms, platform) &&
        _.contains(availablePlatforms, platform)) {
      verboseLog('Removing a platform', platform);
      execFileSyncOrThrow(localCordova, ['platform', 'rm', platform],
                          { cwd: cordovaPath });
    }
  });

  return true;
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
": platform is not added to the project.\n" +
"Try 'meteor add-platform " + platform + "' to add it or\n" +
"'meteor help add-platform' for help.");
  });
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
    additionalArgs.push(variable + '=' + JSON.stringify(value));
  });

  var execRes = execFileSyncOrThrow(localCordova,
     ['plugin', 'add', pluginInstallCommand].concat(additionalArgs),
     { cwd: cordovaPath });
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
      { cwd: cordovaPath });

    if (isFromTarballUrl) {
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
                                   { cwd: cordovaPath }).stdout;

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

// Ensures that the Cordova platforms are synchronized with the app-level
// platforms.

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
    plugins = getCordovaDependenciesFromStar(bundle.starManifest);
    files.rm_recursive(bundlePath);
  }
  // XXX the project-level cordova plugins deps override the package-level ones
  _.extend(plugins, project.getCordovaPlugins());

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
    Console.stdout.write("Initializing Cordova plugins...\n");
    uninstallAllPlugins();

    // Now install all of the plugins.
    try {
      // XXX: forkJoin with parallel false?
      _.each(plugins, function (version, name) {
        buildmessage.enterJob({ title: 'Installing Cordova plugin ' + name}, function () {
          installPlugin(cordovaPath, name, version, pluginsConfiguration[name]);
        });
      });
    } catch (err) {
      // If a plugin fails to install, then remove all plugins and throw the
      // error. Cordova doesn't remove the plugin by default for some reason.
      // XXX don't throw and improve this error message.
      uninstallAllPlugins();
      throw err;
    }
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

// Returns the cordovaDependencies of the Cordova arch from a star json.
var getCordovaDependenciesFromStar = function (star) {
  var cordovaProgram = _.findWhere(star.programs, { arch: webArchName });
  return cordovaProgram.cordovaDependencies;
};

// Build a Cordova project, creating a Cordova project if necessary.
var buildCordova = function (localPath, buildCommand, options) {
  verboseLog('Building the cordova build project');

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
    packagePlugins: getCordovaDependenciesFromStar(bundle.starManifest)
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
  verboseLog('Running the build command:', buildCommand);
  // Give the buffer more space as the output of the build is really huge
  try {
    execFileSyncOrThrow(localCordova, [buildCommand],
                        { cwd: cordovaPath, maxBuffer: 2000*1024 });
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

  verboseLog('Done building the cordova build project');
};


// This is a runner, that we pass to Runner (run-all.js)
var CordovaRunner = function (localPath, platformName, options) {
  var self = this;

  self.localPath = localPath;
  self.platformName = platformName;
  self.options = options;

  self.title = 'Cordova (' + self.platformName + ')';
};

_.extend(CordovaRunner.prototype, {
  start: function () {
    var self = this;

    // android, not android-device
    if (self.platformName == 'android') {
      Android.waitForEmulator();
    }

    execCordovaOnPlatform(self.localPath,
                          self.platformName,
                          self.options);
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
    // start the app themselves. XXX print a message about this?
    execFileSyncOrThrow('sh',
      ['-c', 'open ' + path.join(localPath, 'cordova-build',
             'platforms', 'ios', '*.xcodeproj')]);
  } else {
    verboseLog('Running emulator:', localCordova, args);
    var emulatorOptions = { verbose: options.verbose, cwd: cordovaPath };
    emulatorOptions.env =  _.extend({}, process.env);
    if (options.httpProxyPort) {
      // XXX: Is this Android only?
      // This is odd; the IP address is on the host, not inside the emulator
      emulatorOptions.env['http_proxy'] = '127.0.0.1:' + options.httpProxyPort;
    }
    execFileAsyncOrThrow(
      localCordova, args,
      emulatorOptions);
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
    var future = new Future;
    execFileAsyncOrThrow(localAdb, ['logcat', '-c'], future.resolver());
    setTimeout(function () {
      if (! future.isResolved) {
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

    verboseLog('Tailing logs for android with `adb logcat -s CordovaLog`');
    execFileAsyncOrThrow(localAdb, ['logcat', '-s', 'CordovaLog'], {
      verbose: true,
      lineMapper: androidMapper
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
  Console.stdout.write("Do you agree (Y/n)? ");

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

var checkPlatformRequirements = function (platform) {
  if (platform == 'android') {
    return Android.checkRequirements({ fix: false, log: false });
  }
  if (platform == 'ios') {
    return IOS.checkRequirements({ fix: false, log: false });
  }
  return true;
};

var requirePlatformReady = function (platform) {
  try {
    var ok = checkPlatformRequirements(platform);
    if (!ok) {
      Console.warn("Platform is not installed; please run: 'meteor " + platform + " --getready'");
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
  'iphone-2x': '120x120',
  'iphone-3x': '180x180',
  'ipad': '76x76',
  'ipad-2x': '152x152'
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
  var imagePaths = {
    icon: {},
    splash: {}
  };

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
    set: function (key, value) {
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
     * - `iphone-2x`
     * - `iphone-3x`
     * - `ipad`
     * - `ipad-2x`
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
  var setImages = function (sizes, xmlEle, tag) {
    _.each(sizes, function (size, name) {
      var width = size.split('x')[0];
      var height = size.split('x')[1];

      var suppliedPath = imagePaths[tag][name];
      if (! suppliedPath)
        return;

      var extension = _.last(_.last(suppliedPath.split(path.sep)).split('.'));
      var fileName = name + '.' + tag + '.' + extension;

      // copy the file to the build folder with a standardized name
      files.copyFile(path.join(project.rootDir, suppliedPath),
                     path.join(resourcesPath, fileName));

      // set it to the xml tree
      xmlEle.ele(tag, {
        src: path.join('resources', fileName),
        width: width,
        height: height
      });

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
        xmlEle.ele(tag, {
          src: path.join('resources', fileName),
          width: width,
          height: height
        });
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
    return self.getUname([ '-s' ]) == 'Darwin';
  },

  isLinux: function () {
    var self = this;
    return self.getUname([ '-s' ]) == 'Linux';
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
});

// (Sneakily) mask Host to make it a singelton
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
      return undefined;
    }

    var okay = true;
    if (self.hasXcode()) {
      log && Console.info(Console.success("Xcode is installed"));
    } else {
      log && Console.info(Console.fail("Xcode is not installed"));

      fix && self.installXcode();
      okay = fix;
    }

    if (!okay) return okay;

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
        log && Console.info(Console.fail("You must accept the Xcode license"));

        fix && self.launchXcode();
        okay = fix;
      }
    }

    if (!okay) return okay;

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

    return okay;
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

      return true;
    }

    throw new Error("Can't install acceleration for unknown host: " + archinfo.host());
  },

  getAndroidBundlePath: function () {
    // XXX: Support USE_GLOBAL_ADK
    return path.join(files.getCurrentToolsDir(), 'android_bundle');
  },

  runAndroidTool: function (args, options) {
    var self = this;

    var androidBundlePath = self.getAndroidBundlePath();

    var androidToolPath = path.join(androidBundlePath, 'android-sdk', 'tools', 'android');

    options = options || {};
    options.env = _.extend({}, process.env, options.env || {}, { 'ANDROID_SDK_HOME': androidBundlePath });
    var cmd = new processes.RunCommand(androidToolPath, args, options);
    if (options.detached) {
      return cmd.start();
    }
    var execution = cmd.run();
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
    return avds;
  },

  hasAvd: function (avd) {
    var self = this;
    return _.contains(self.listAvds(), avd);
  },

  getAvdName: function () {
    var self = this;
    return process.env.METEOR_AVD || "meteor";
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

  installTarget: function (target) {
    var self = this;

    buildmessage.enterJob({ title: 'Installing Android API library'}, function () {
      var out = self.runAndroidTool(['update', 'sdk', '-t', target, '--all', '-u'], {stdin: 'y\n'});
    });
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

    var androidBundlePath = self.getAndroidBundlePath();

    // XXX: Use emulator64-x86?  What difference does it make?
    var name = 'emulator';
    var androidToolPath = path.join(androidBundlePath, 'android-sdk', 'tools', name);

    var args = ['-avd', avd];

    var runOptions = {};
    runOptions.detached = true;
    runOptions.env = _.extend({}, process.env, { 'ANDROID_SDK_HOME': androidBundlePath });
    var cmd = new processes.RunCommand(androidToolPath, args, runOptions);
    cmd.start();
  },

  runAdb: function (args, options) {
    var self = this;

    var androidBundlePath = self.getAndroidBundlePath();
    var adbPath = path.join(androidBundlePath, 'android-sdk', 'platform-tools', "adb");

    var runOptions = options || {};
    runOptions.env = _.extend({}, process.env, { 'ANDROID_SDK_HOME': androidBundlePath });
    var cmd = new processes.RunCommand(adbPath, args, runOptions);
    return cmd.run();
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
      var avdPath = path.join(androidBundlePath, 'meteor_avd');
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

  installJava: function () {
    var self = this;

    if (Host.isMac()) {
      // XXX: Find the magic incantation that invokes the JRE 6 installer
      var cmd = new processes.RunCommand('open', [ 'http://support.apple.com/kb/DL1572' ]);
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
      }

      if (Host.hasYum()) {
        Console.info("You can install the JDK using:");
        Console.info("  sudo yum install -y java-1.7.0-openjdk-devel");

        // XXX: Technically, these are for Android, not installing Java
        if (processor == "x86_64") {
          Console.info("You will also need some 32-bit libraries:");
          Console.info("  sudo yum install -y glibc.i686 zlib.i686 libstdc++.i686 ncurses-libs.i686");
        }
      }

      return;
    }

    throw new Error("Cannot automatically install Java on host: " + Host.getName());
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
    ensureAndroidBundle();
  },

  waitForEmulator: function () {
    var self = this;

    var timeLimit = 120 * 1000;
    var interval = 1000;
    for (var i = 0; i < timeLimit / interval; i++) {
      Console.debug("Waiting for emulator");
      if (self.isEmulatorRunning()) {
        Console.debug("Found emulator");
        return;
      }
      utils.sleepMs(interval);
    }
    throw new Error("Emulator did not start in expected time");
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

    var okay = true;

    if (self.hasJava()) {
      log && Console.info(Console.success("Java is installed"));
    } else {
      log && Console.info(Console.fail("Java is not installed"));

      fix && self.installJava();
      okay = fix;
    }

    if (!okay) return okay;

    // (hasAcceleration can also be undefined)
    var hasAcceleration = self.hasAcceleration();
    if (hasAcceleration === false) {
      log && Console.info(Console.fail("Acceleration is not installed; the Android emulator will be very slow without it"));

      fix && self.installAcceleration();
      okay = fix;
    } else if (hasAcceleration === true) {
      log && Console.info(Console.success("HAXM is installed"));
    }

    if (!okay) return okay;

    if (self.hasAndroidBundle()) {
      log && Console.info(Console.success("Found Android bundle"));
    } else {
      log && Console.info(Console.fail("Android bundle not found"));

      fix && self.installAndroidBundle();
      okay = fix;
    }

    if (!okay) return okay;

    if (self.hasTarget('19', 'default/x86')) {
      log && Console.info(Console.success("Found suitable Android API libraries"));
    } else {
      log && Console.info(Console.fail("Suitable Android API libraries not found"));

      fix && self.installTarget('sys-img-x86-android-19');
      okay = fix;
    }

    if (!okay) return okay;

    var avdName = self.getAvdName();
    if (self.hasAvd(avdName)) {
      log && Console.info(Console.success("'" + avdName + "' android virtual device (AVD) found"));
    } else {
      log && Console.info(Console.fail("'" + avdName + "' android virtual device (AVD) not found"));

      var avdOptions = {};
      fix && self.createAvd(avdName, avdOptions);
      okay = fix;

      (fix && log) && Console.info(Console.success("Created android virtual device (AVD): " + avdName));
    }

    return okay;
  }
});

var Android = new Android();

// --- Cordova commands ---

// add one or more Cordova platforms
main.registerCommand({
  name: "add-platform",
  options: {
    verbose: { type: Boolean, short: "v" }
  },
  minArgs: 1,
  maxArgs: Infinity,
  requiresApp: true
}, function (options) {
  cordova.setVerboseness(options.verbose);

  var platforms = options.args;
  var currentPlatforms = project.getPlatforms();

  try {
    _.each(platforms, function (platform) {
      if (_.contains(currentPlatforms, platform)) {
        throw new Error("platform " + platform + " already added");
      }

      isValidPlatform(platform);
    });
  } catch (err) {
    if (err.message) {
      Console.warn(err.message);
    }
    return 1;
  }

  _.each(platforms, function (platform) {
    requirePlatformReady(platform);
  });

  try {
    var agreed = _.every(platforms, function (platform) {
      return checkAgreePlatformTerms(platform, "the " + platform + " platform");
    });
    if (!agreed) {
      return 2;
    }
  } catch (err) {
    if (err.message) {
      Console.warn(err.message);
    }
    return 1;
  }

  project.addCordovaPlatforms(platforms);

  if (platforms.length) {
    var localPath = path.join(options.appDir, '.meteor', 'local');
    files.mkdir_p(localPath);

    var appName = path.basename(options.appDir);
    ensureCordovaProject(localPath, appName);
    ensureCordovaPlatforms(localPath);
  }

  _.each(platforms, function (platform) {
    Console.stdout.write("added platform " + platform + "\n");
  });
});

// remove one or more Cordova platforms
main.registerCommand({
  name: "remove-platform",
  minArgs: 1,
  maxArgs: Infinity,
  requiresApp: true
}, function (options) {
  var platforms = options.args;

  _.each(platforms, function (platform) {
    // explain why we can't remove server or browser platforms
    if (_.contains(project.getDefaultPlatforms(), platform)) {
      Console.stdout.write("cannot remove platform " + platform +
        " in this version of Meteor\n");
      return;
    }

    if (_.contains(project.getPlatforms(), platform)) {
      Console.stdout.write("removed platform " + platform + "\n");
      return;
    }

    Console.stdout.write(platform + " is not in this project\n");
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
  name: "list-platforms",
  requiresApp: true
}, function () {
  var platforms = project.getPlatforms();

  Console.stdout.write(platforms.join("\n"));
});

main.registerCommand({
  name: "configure-android",
  options: {
    verbose: { type: Boolean, short: "v" }
  },
  minArgs: 0,
  maxArgs: Infinity
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
  name: "android-launch",
  pretty: true,
  options: {
    verbose: { type: Boolean, short: "v" }
  },
  minArgs: 0,
  maxArgs: 1
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


main.registerCommand({
  name: "android",
  pretty: true,
  options: {
    verbose: { type: Boolean, short: "v" },
    getready: { type: Boolean }
  },
  minArgs: 0,
  maxArgs: Infinity
}, function (options) {
  Console.setVerbose(options.verbose);
  
  if (options.getready) {
    var okay = Android.checkRequirements({ log: true, fix: true});
    if (!okay) {
      Console.warn("Android requirements not yet met");
    }
  }

  var args = options.args || [];
  if (args.length) {
    var arg = args[0];
    if (arg == "adb") {
      Android.runAdb(args.slice(1), { pipeOutput: true, detached: true, stdio: 'inherit' });
    }
  }

  return 0;
});


main.registerCommand({
  name: "ios",
  pretty: true,
  options: {
    verbose: { type: Boolean, short: "v" },
    getready: { type: Boolean }
  },
  minArgs: 0,
  maxArgs: Infinity
}, function (options) {
  if (options.getready) {
    var okay = IOS.checkRequirements({ log: true, fix: true});
    if (!okay) {
      Console.warn("iOS requirements not yet met");
    }
  }

  return 0;
});
