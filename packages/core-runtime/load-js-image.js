// This file needs to work in old web browsers and old node versions
// It should not use js features newer than EcmaScript 5.
//
// Handles loading linked code for packages and apps
// Ensures packages and eager requires run in the correct order
// when there is code that uses top level await

var hasOwn = Object.prototype.hasOwnProperty;

var pending = [];
function queue(name, runImage) {
  pending.push({name: name, runImage: runImage});
  processNext();
}

var isProcessing = false;
function processNext() {
  if (isProcessing) {
    return;
  }

  var next = pending.shift();
  if (!next) {
    return;
  }

  isProcessing = true;

  var config = next.runImage.call(this);
  runEagerModules(config, function (mainModuleExports) {
    // Get the exports after the eager code has been run
    var exports = config.export ? config.export() : {};
    if (config.mainModulePath) {
      Package._define(next.name, mainModuleExports, exports);
    } else {
      Package._define(next.name, exports);
    }

    isProcessing = false;
    processNext();
  });
}

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
      exports.then(function (exports) {
        if (path === config.mainModulePath) {
          mainExports = exports;
        }
        evaluateNextModule();
      })
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
    } else {
      if (path === config.mainModulePath) {
        mainExports = exports;
      }
      evaluateNextModule();
    }
  }

  evaluateNextModule();
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
  if (pending.length === 0 && !isProcessing) {
    // All packages are loaded
    // If there were no async packages, then there might not be a promise
    // polyfill loaded either, so we don't create a promise to return
    return null;
  }

  return new Promise(function (resolve) {
    queue(null, function () {
      resolve();
      return {};
    });
  });
}

// Since the package.js doesn't export load or waitUntilReady
// these will never be globals in packages or apps that depend on core-runtime
Package['core-runtime'] = {
  queue: queue,
  waitUntilAllLoaded: waitUntilAllLoaded
};
