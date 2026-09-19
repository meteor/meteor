// Handles loading linked code for packages and apps
// Ensures packages and eager requires run in the correct order
// when there is code that uses top level await

const pending = [];
let pendingIndex = 0;
let isProcessing = false;

const queue = (name, runImage) => {
  pending.push({ name, runImage });
  processNext();
};

const processNext = () => {
  if (isProcessing) {
    return;
  }

  if (pendingIndex >= pending.length) {
    return;
  }

  const { name, runImage } = pending[pendingIndex++];
  isProcessing = true;

  // runImage must be called as a standalone function (not a method) so that
  // `this` inside the linked package code is the global object (sloppy mode).
  // Package code like meteor/global.js does `global = this` and propagates
  // `this` via .call(this) to each file wrapper.
  const config = runImage();
  runEagerModules(config, (mainModuleExports) => {
    const exports = config.export ? config.export() : {};
    if (config.mainModulePath) {
      Package._define(name, mainModuleExports, exports);
    } else {
      Package._define(name, exports);
    }

    isProcessing = false;
    processNext();
  });
};

const runEagerModules = (config, callback) => {
  if (!config.eagerModulePaths) {
    return callback();
  }

  const { eagerModulePaths, mainModulePath } = config;
  let mainExports = {};
  let mainModuleAsync = false;
  let i = 0;

  const resumeFromAsync = () => {
    // Continue the loop after an async module resolves
    while (i < eagerModulePaths.length) {
      const path = eagerModulePaths[i];
      const exports = config.require(path);
      i++;

      if (checkAsyncModule(exports)) {
        if (path === mainModulePath) {
          mainModuleAsync = true;
        }

        exports.then((resolved) => {
          if (path === mainModulePath) {
            mainExports = resolved;
          }
          resumeFromAsync();
        })
        // This also handles errors in modules and packages loaded sync
        // afterwards since they are run within the `.then`.
        .catch((error) => {
          queueMicrotask(() => { throw error; });
        });
        return;
      }

      if (path === mainModulePath) {
        mainExports = exports;
      }
    }

    if (mainModuleAsync) {
      // Mark the main module as sync so other packages can `require` it
      // normally, regardless of whether it uses TLA.
      // TODO: This reaches into reify internals. The proper fix is to change
      // reify's patched require guard from `!handleAsSync[path]` to
      // `entry.status !== 'evaluated'`, making async wrapping self-limiting.
      // That would eliminate _requireAsSync entirely. See @meteorjs/reify.
      const reify = config.require('/node_modules/meteor/modules/node_modules/@meteorjs/reify/lib/runtime');
      reify._requireAsSync(mainModulePath);
    }

    callback(mainExports);
  };

  resumeFromAsync();
};

const checkAsyncModule = (exports) =>
  exports && typeof exports === 'object' &&
  Object.hasOwn(exports, '__reifyAsyncModule') &&
  typeof exports.then === 'function';

// For this to be accurate, all linked files must be queued before calling this
// If all are loaded, returns null. Otherwise, returns a promise
const waitUntilAllLoaded = () => {
  if (pendingIndex >= pending.length && !isProcessing) {
    // All packages are loaded
    // If there were no async packages, then there might not be a promise
    // polyfill loaded either, so we don't create a promise to return
    return null;
  }

  return new Promise((resolve) => {
    queue(null, () => {
      resolve();
      return {};
    });
  });
};

// Since the package.js doesn't export load or waitUntilReady
// these will never be globals in packages or apps that depend on core-runtime
Package['core-runtime'] = { queue, waitUntilAllLoaded };
