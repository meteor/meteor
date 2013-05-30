var Fiber = require("fibers");
var fs = require("fs");
var path = require("path");
var _ = require('underscore');

// This code is duplicated in tools/server/server.js.
var MIN_NODE_VERSION = 'v0.8.18';
if (require('semver').lt(process.version, MIN_NODE_VERSION)) {
  process.stderr.write(
    'Meteor requires Node ' + MIN_NODE_VERSION + ' or later.\n');
  process.exit(1);
}

// read our control files
var serverJson =
  JSON.parse(fs.readFileSync(path.join(__dirname, process.argv[2]), 'utf8'));
var configJson =
  JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

// Set up environment
__meteor_bootstrap__ = {
  startup_hooks: [],
  postStartupHooks: [],
  serverDir: __dirname,
  configJson: configJson };
__meteor_runtime_config__ = { meteorRelease: configJson.release };


// connect (and some other NPM modules) use $NODE_ENV to make some decisions;
// eg, if $NODE_ENV is not production, they send stack traces on error. connect
// considers 'development' to be the default mode, but that's less safe than
// assuming 'production' to be the default. If you really want development mode,
// set it in your wrapper script (eg, run.js).
if (!process.env.NODE_ENV)
  process.env.NODE_ENV = 'production';


Fiber(function () {
  _.each(serverJson.load, function (fileInfo) {
    var code = fs.readFileSync(path.join(__dirname, fileInfo.path));

    var Npm = {
      require: function (name) {
        if (! fileInfo.node_modules) {
          return require(name);
        }

        var nodeModuleDir =
          path.join(__dirname, fileInfo.node_modules, name);

        if (fs.existsSync(nodeModuleDir)) {
          return require(nodeModuleDir);
          }
        try {
          return require(name);
        } catch (e) {
          // Try to guess the package name so we can print a nice
          // error message
          var filePathParts = fileInfo.path.split(path.sep);
          var packageName = filePathParts[2].replace(/\.js$/, '');

          // XXX better message
          throw new Error(
            "Can't find npm module '" + name +
              "'. Did you forget to call 'Npm.depends' in package.js " +
              "within the '" + packageName + "' package?");
          }
      }
    };
    // \n is necessary in case final line is a //-comment
    var wrapped = "(function(Npm){" + code + "\n})";

    var func = require('vm').runInThisContext(wrapped, fileInfo.path, true);
    func.call(global, Npm); // Coffeescript
  });

  // run the user startup hooks.
  _.each(__meteor_bootstrap__.startup_hooks, function (x) { x(); });

  // find and run main()
  // XXX hack. we should know the package that contains main.
  var mains = [];
  var globalMain;
  if ('main' in global) {
    mains.push(main);
    globalMain = main;
  }
  _.each(Package, function (p, n) {
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
