// This file needs to work in old web browsers and old node versions
// It should not use js features newer than EcmaScript 5.
//
// Handles loading linked code for packages and apps
// Ensures packages and eager requires run in the correct order
// when there is code that uses top level await

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
      // load must always be called for a package's dependencies first.
      // If the package is not pending, then it must have already loaded
      // or is a weak dependency, and the dependency is not being used.
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
      Package._define(name, exports);
    }

    var pendingCallbacks = pending[name] || [];
    delete pending[name];
    pendingCallbacks.forEach(function (callback) {
      callback();
    });
  });
}

let runEagerModulesQueue = Promise.resolve();

function runEagerModules(config, callback) {
  if (!config.eagerModulePaths) {
    return callback();
  }

  var index = -1;
  var mainExports = {};
  var mainModuleAsync = false;

  function evaluateNextModule() {
    index += 1;
    if (index === config.eagerModulePaths.length) {
      if (mainModuleAsync) {
        // Now that the package has loaded, mark the main module as sync
        // This allows other packages and the app to `require` the package
        // and for it to work the same, regardless of if it uses TLA or not
        // XXX: this is a temporary hack until we find a better way to do this
        const reify = config.require('/node_modules/meteor/modules/node_modules/@meteorjs/reify/lib/runtime');
        reify._requireAsSync(config.mainModulePath);
      }

      return callback(mainExports);
    }

    var path = config.eagerModulePaths[index];
    var exports = config.require(path);
    if (checkAsyncModule(exports)) {
      if (path === config.mainModulePath) {
        mainModuleAsync = true;
      }

      // Is an async module
      return exports.then(function (exports) {
        if (path === config.mainModulePath) {
          mainExports = exports;
        }
        return evaluateNextModule();
      });
    } else {
      if (path === config.mainModulePath) {
        mainExports = exports;
      }
      return evaluateNextModule();
    }
  }

  runEagerModulesQueue = runEagerModulesQueue
    .then(evaluateNextModule)
    // This also handles errors in modules and packages loaded sync
    // afterwards since they are run within the `.then`.
    .catch(function (error) {
      if (
        typeof process === 'object' &&
        typeof process.nextTick === 'function'
      ) {
        // Is node.js
        process.nextTick(function () {
          throw error;
        });
      } else {
        // TODO: is there a faster way to throw the error?
        setTimeout(function () {
          throw error;
        }, 0);
      }
    });
}

function checkAsyncModule (exports) {
  var potentiallyAsync = exports && typeof exports === 'object' &&
    hasOwn.call(exports, '__reifyAsyncModule');

  if (!potentiallyAsync) {
    return;
  }

  return typeof exports.then === 'function';
}

// For this to be accurate, all linked files must be queued before calling this
// If all are loaded, returns null. Otherwise, returns a promise
function waitUntilAllLoaded() {
  var pendingNames = Object.keys(pending);

  if (pendingNames.length === 0) {
    // All packages are loaded
    // If there were no async packages, then there might not be a promise
    // polyfill loaded either, so we don't create a promise to return
    return null;
  }

  return new Promise(function (resolve) {
    var pendingCount = pendingNames.length;
    pendingNames.forEach(function (name) {
      pending[name].push(function () {
        pendingCount -= 1;
        if (pendingCount === 0) {
          resolve();
        }
      });
    });
  })
}

// Since the package.js doesn't export load or waitUntilReady
// these will never be globals in packages or apps that depend on core-runtime
Package['core-runtime'] = {
  queue: queue,
  waitUntilAllLoaded: waitUntilAllLoaded
};
