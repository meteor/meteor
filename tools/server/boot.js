var Fiber = require("fibers");
var fs = require("fs");
var path = require("path");
var Future = require(path.join("fibers", "future"));
var _ = require('underscore');
var sourcemap_support = require('source-map-support');

// This code is duplicated in tools/main.js.
var MIN_NODE_VERSION = 'v0.10.33';

if (require('semver').lt(process.version, MIN_NODE_VERSION)) {
  process.stderr.write(
    'Meteor requires Node ' + MIN_NODE_VERSION + ' or later.\n');
  process.exit(1);
}

// read our control files
var serverJsonPath = path.resolve(process.argv[2]);
var serverDir = path.dirname(serverJsonPath);
var serverJson = JSON.parse(fs.readFileSync(serverJsonPath, 'utf8'));
var configJson =
  JSON.parse(fs.readFileSync(path.resolve(serverDir, 'config.json'), 'utf8'));

// Set up environment
__meteor_bootstrap__ = {
  startupHooks: [],
  serverDir: serverDir,
  configJson: configJson };
__meteor_runtime_config__ = { meteorRelease: configJson.meteorRelease };


// connect (and some other NPM modules) use $NODE_ENV to make some decisions;
// eg, if $NODE_ENV is not production, they send stack traces on error. connect
// considers 'development' to be the default mode, but that's less safe than
// assuming 'production' to be the default. If you really want development mode,
// set it in your wrapper script (eg, run-app.js).
if (!process.env.NODE_ENV)
  process.env.NODE_ENV = 'production';

// Map from load path to its source map.
var parsedSourceMaps = {};

// Read all the source maps into memory once.
_.each(serverJson.load, function (fileInfo) {
  if (fileInfo.sourceMap) {
    var rawSourceMap = fs.readFileSync(
      path.resolve(serverDir, fileInfo.sourceMap), 'utf8');
    // Parse the source map only once, not each time it's needed. Also remove
    // the anti-XSSI header if it's there.
    var parsedSourceMap = JSON.parse(rawSourceMap.replace(/^\)\]\}'/, ''));
    // source-map-support doesn't ever look at the sourcesContent field, so
    // there's no point in keeping it in memory.
    delete parsedSourceMap.sourcesContent;
    var url;
    if (fileInfo.sourceMapRoot) {
      // Add the specified root to any root that may be in the file.
      parsedSourceMap.sourceRoot = path.join(
        fileInfo.sourceMapRoot, parsedSourceMap.sourceRoot || '');
    }
    parsedSourceMaps[path.resolve(__dirname, fileInfo.path)] = parsedSourceMap;
  }
});

var retrieveSourceMap = function (pathForSourceMap) {
  if (_.has(parsedSourceMaps, pathForSourceMap))
    return { map: parsedSourceMaps[pathForSourceMap] };
  return null;
};

sourcemap_support.install({
  // Use the source maps specified in program.json instead of parsing source
  // code for them.
  retrieveSourceMap: retrieveSourceMap,
  // For now, don't fix the source line in uncaught exceptions, because we
  // haven't fixed handleUncaughtExceptions in source-map-support to properly
  // locate the source files.
  handleUncaughtExceptions: false
});

// Only enabled by default in development.
if (process.env.ENABLE_METEOR_SHELL) {
  require('./shell.js').listen();
}

Fiber(function () {
  _.each(serverJson.load, function (fileInfo) {
    var code = fs.readFileSync(path.resolve(serverDir, fileInfo.path));

    var Npm = {
      /**
       * @summary Require a package that was specified using
       * `Npm.depends()`.
       * @param  {String} name The name of the package to require.
       * @locus Server
       * @memberOf Npm
       */
      require: function (name) {
        if (! fileInfo.node_modules) {
          return require(name);
        }

        var nodeModuleDir =
          path.resolve(serverDir, fileInfo.node_modules, name);

        if (fs.existsSync(nodeModuleDir)) {
          return require(nodeModuleDir);
          }
        try {
          return require(name);
        } catch (e) {
          // Try to guess the package name so we can print a nice
          // error message
          var filePathParts = fileInfo.path.split(path.sep);
          var packageName = filePathParts[1].replace(/\.js$/, '');

          // XXX better message
          throw new Error(
            "Can't find npm module '" + name +
              "'. Did you forget to call 'Npm.depends' in package.js " +
              "within the '" + packageName + "' package?");
          }
      }
    };
    var getAsset = function (assetPath, encoding, callback) {
      var fut;
      if (! callback) {
        fut = new Future();
        callback = fut.resolver();
      }
      // This assumes that we've already loaded the meteor package, so meteor
      // itself (and weird special cases like js-analyze) can't call
      // Assets.get*. (We could change this function so that it doesn't call
      // bindEnvironment if you don't pass a callback if we need to.)
      var _callback = Package.meteor.Meteor.bindEnvironment(function (err, result) {
        if (result && ! encoding)
          // Sadly, this copies in Node 0.10.
          result = new Uint8Array(result);
        callback(err, result);
      }, function (e) {
        console.log("Exception in callback of getAsset", e.stack);
      });

      if (!fileInfo.assets || !_.has(fileInfo.assets, assetPath)) {
        _callback(new Error("Unknown asset: " + assetPath));
      } else {
        var filePath = path.join(serverDir, fileInfo.assets[assetPath]);
        fs.readFile(filePath, encoding, _callback);
      }
      if (fut)
        return fut.wait();
    };

    var Assets = {
      getText: function (assetPath, callback) {
        return getAsset(assetPath, "utf8", callback);
      },
      getBinary: function (assetPath, callback) {
        return getAsset(assetPath, undefined, callback);
      }
    };

    // \n is necessary in case final line is a //-comment
    var wrapped = "(function(Npm, Assets){" + code + "\n})";

    // It is safer to use the absolute path when source map is present as
    // different tooling, such as node-inspector, can get confused on relative
    // urls.
    var absoluteFilePath = path.resolve(__dirname, fileInfo.path);
    var scriptPath =
      parsedSourceMaps[absoluteFilePath] ? absoluteFilePath : fileInfo.path;
    // The final 'true' is an undocumented argument to runIn[Foo]Context that
    // causes it to print out a descriptive error message on parse error. It's
    // what require() uses to generate its errors.
    var func = require('vm').runInThisContext(wrapped, scriptPath, true);
    func.call(global, Npm, Assets); // Coffeescript
  });

  // run the user startup hooks.  other calls to startup() during this can still
  // add hooks to the end.
  while (__meteor_bootstrap__.startupHooks.length) {
    var hook = __meteor_bootstrap__.startupHooks.shift();
    hook();
  }
  // Setting this to null tells Meteor.startup to call hooks immediately.
  __meteor_bootstrap__.startupHooks = null;

  // find and run main()
  // XXX hack. we should know the package that contains main.
  var mains = [];
  var globalMain;
  if ('main' in global) {
    mains.push(main);
    globalMain = main;
  }
  typeof Package !== 'undefined' && _.each(Package, function (p, n) {
    if ('main' in p && p.main !== globalMain) {
      mains.push(p.main);
    }
  });
  if (! mains.length) {
    process.stderr.write("Program has no main() function.\n");
    process.exit(1);
  }
  if (mains.length > 1) {
    process.stderr.write("Program has more than one main() function?\n");
    process.exit(1);
  }
  var exitCode = mains[0].call({}, process.argv.slice(3));
  // XXX hack, needs a better way to keep alive
  if (exitCode !== 'DAEMON')
    process.exit(exitCode);
}).run();
