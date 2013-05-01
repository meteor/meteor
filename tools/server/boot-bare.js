// XXX this file is copied from boot.js. They should be unified one day.

var Fiber = require("fibers");
var fs = require("fs");
var path = require("path");
var _ = require('underscore');

// read our control files
var serverJson =
  JSON.parse(fs.readFileSync(path.join(__dirname, process.argv[2]), 'utf8'));
var configJson =
  JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

// Set up environment
__meteor_bootstrap__ = { startup_hooks: [] };
__meteor_runtime_config__ = { meteorRelease: configJson.release };

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
  if ('main' in global)
    mains.push(main);
  _.each(Package, function (p) {
    if ('main' in p)
      mains.push(p.main);
  });
  if (! mains.length) {
    process.stderr.write("Program has no main() function.\n");
    process.exit(1);
  }
  if (mains.length > 1) {
    process.stderr.write("Program has more than one main() function?\n");
    process.exit(1);
  }
  process.exit(mains[0].call({}, process.argv.slice(3)));
}).run();
