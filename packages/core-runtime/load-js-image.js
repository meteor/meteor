// This file needs to work in old web browsers and old node versions
// It should not use new js syntax.
//
// Handles loading linked code for packages and apps
// Ensures packages and eager requires run in the correct order
// when there the code uses top level await

var pending = Object.create(null);
var hasOwn = Object.prototype.hasOwnProperty;

function queue(name, deps, runImage) {
  pending[name] = [];

  var pendingDepsCount = 0;

  function onDepLoaded() {
    pendingDepsCount -= 1;

    if (pendingDepsCount === 0) {
      load(name, runImage);
    }
  }
  
  deps.forEach(function (dep) {
    if (hasOwn.call(pending, dep)) {
      pendingDepsCount += 1;
      pending[dep].push(onDepLoaded);
    } else {
      // load must always be called for a package's dependencies first
      // If the package is not pending, then it must have already loaded
      // or is a weak dependency, and the dependency is not being used
    }
  });

  if (pendingDepsCount === 0) {
    load(name, runImage);
  }
}

function load(name, runImage) {
  var config = runImage();

  runEagerModules(config, function (mainModuleExports) {
    // Get the exports after the eager code has been run
    var exports = config.export ? config.export() : {};
    if (config.mainModulePath) {
      Package._define(name, mainModuleExports, exports);
    } else {
      // TODO: need default value?
      Package._define(name, exports);
    }

    var pendingCallbacks = pending[name]; 
    delete pending[name];
    pendingCallbacks.forEach(function (callback) {
      callback();
    });
  });
}

function runEagerModules(config, callback) {
  if (!config.eagerModulePaths) {
    return callback();
  }
  
  var index = -1;
  var mainExports = {};

  function evaluateNextModule() {
    index += 1;
    if (index === config.eagerModulePaths.length) {
      return callback(mainExports);
    }

    var path = config.eagerModulePaths[index];
    var exports = config.require(path);

    // TODO: create better way to detect to avoid including sync modules that export a promise
    if (exports && typeof exports === 'object' && typeof exports.then === 'function') {
      // Is an async module
      exports.then(function (exports) {
        if (path === config.mainModulePath) {
          mainExports = exports;
          try {
            var ReifyEntry = config.require('/node_modules/meteor/modules/node_modules/@meteorjs/reify/lib/runtime/entry.js');
            var entry = ReifyEntry.getOrCreate(path);
            // XXX hack so you can require a package and it won't return
            // a promise. This hopefully is temporary until the module system
            // supports a different entry point for commonjs.
            // At this point the module is already loaded, so it shouldn't
            // mater as much
            entry.asyncEvaluation = false;
          } catch (e) {
            console.log(e);
          }
        }
        evaluateNextModule();
      });
    } else {
      if (path === config.mainModulePath) {
        mainExports = exports;
      }
      evaluateNextModule();
    }
  }

  evaluateNextModule();
}

function waitUntilAllLoaded() {

}

// Since the package.js doesn't export load or waitUntilReady
// these will never be globals in packages or apps that depend on core-runtime
Package['core-runtime'] = {
  queue: queue,
  waitUntilAllLoaded: waitUntilAllLoaded
};
