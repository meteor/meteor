function PackageRegistry() {
  this._promiseInfoMap = Object.create(null);
}

var PRp = PackageRegistry.prototype;

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

// Initialize the Package namespace used by all Meteor packages.
var global = this;
global.Package = new PackageRegistry();

if (typeof exports === "object") {
  // This code is also used by meteor/tools/isobuild/bundler.js.
  exports.PackageRegistry = PackageRegistry;
}
