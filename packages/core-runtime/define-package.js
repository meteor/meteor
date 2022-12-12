function PackageRegistry() {
  this._promiseInfoMap = Object.create(null);
  this._packageQueue = [];
  this._running = false;
}

var PRp = PackageRegistry.prototype;

var ASYNC_MAIN_MODULE = {};

// If potentialPromise is a promise, calls callback with the resolved value
// Otherwise, synchronously calls the callback with the value
PRp._waitForModule = function (potentialPromise, callback) {
  if (
    isThenable(potentialPromise) &&
    potentialPromise.asyncMainModule === ASYNC_MAIN_MODULE
  ) {
    potentialPromise.then((results) => {
      callback(results);
    });
  } else {
    callback(potentialPromise);
  }
}

// Set global.Package[name] = pkg || {}. If additional arguments are
// supplied, their keys will be copied into pkg if not already present.
// This method is defined on the prototype of global.Package so that it
// will not be included in Object.keys(Package).
PRp._define = function definePackage(name, pkg) {
  pkg = pkg || {};

  var argc = arguments.length;
  for (var i = 2; i < argc; ++i) {
    var arg = arguments[i];
    for (var s in arg) {
      if (! (s in pkg)) {
        pkg[s] = arg[s];
      }
    }
  }

  this[name] = pkg;

  var info = this._promiseInfoMap[name];
  if (info) {
    info.resolve(pkg);
  }

  // if (this._packageQueue.length > 0) {
  //   this._packageQueue.unshift().load();
  // } else {
  //   this._running = false;
  // }

  return pkg;
};

PRp._has = function has(name) {
  return Object.prototype.hasOwnProperty.call(this, name);
};

// Returns a Promise that will resolve to the exports of the named
// package, or be rejected if the package is not installed.
PRp._promise = function promise(name) {
  var self = this;
  var info = self._promiseInfoMap[name];

  if (! info) {
    info = self._promiseInfoMap[name] = {};
    info.promise = new Promise(function (resolve, reject) {
      info.resolve = resolve;
      if (self._has(name)) {
        resolve(self[name]);
      } else {
        Meteor.startup(function () {
          if (! self._has(name)) {
            reject(new Error("Package " + name + " not installed"));
          }
        });
      }
    });
  }

  return info.promise;
};

// On the server, load is run immediately
// If it has async modules that are eagerly evaluated, it will return a
// promise that resolves after the package has been fully loaded.
PRp.load = function (name, deps, load) {
  // console.log('start load', name);
  var self = this;

  if (typeof Meteor === 'undefined' || Meteor.isServer) {
    var result = load() || {};

    var mainModule = result.mainModule;
    var exports = result.exports;

    if (mainModule && mainModule.asyncMainModule === ASYNC_MAIN_MODULE) {
      return mainModule.then(function (mainExports) {
        console.log('defineAsync', name, mainModule, exports);
        self._define(name, mainExports, exports);
      });
    }

    self._define(name, mainModule, exports);
    // console.log('define', name, mainModule, exports);
    return;
    // this._packageQueue.push({
    //   name: name,
    //   load: load,
    //   deps: deps
    // });

    // if (!this._running) {
    //   this._running = true;
    //   this._packageQueue.unshift().load();
    // }
  }

  // TODO: implement

}

function isThenable(value) {
  return typeof value === 'object' && value !== null &&
    typeof value.then === 'function';
}

PRp._evaluateEagerModules = function(require, paths, mainModuleIndex) {
  let index = -1;
  let result;
  let promise;
  let resolve;

  function evaluateNext() {
    index += 1;

    if (index === paths.length) {
      if (resolve) {
        resolve(result);
      }
      return;
    }

    let path = paths[index];
    let exports = require(path);

    if (isThenable(exports)) {
      if (!promise) {
        promise = new Promise(_resolve => resolve = _resolve);
        promise.asyncMainModule = ASYNC_MAIN_MODULE;
      }

      exports.then(resolvedExports => {
        if (index === mainModuleIndex) {
          result = resolvedExports;
        }
        evaluateNext();
      });
      // TODO: handle error
    } else {
      if (index === mainModuleIndex) {
        result = exports;
      }
      evaluateNext();
    }
  }

  evaluateNext();

  return promise ? promise : result;
}

// Initialize the Package namespace used by all Meteor packages.
global.Package = new PackageRegistry();

if (typeof exports === "object") {
  // This code is also used by meteor/tools/isobuild/bundler.js.
  exports.PackageRegistry = PackageRegistry;
}
