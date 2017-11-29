function PackageRegistry() {}

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

  return this[name] = pkg;
};

// Initialize the Package namespace used by all Meteor packages.
global.Package = new PackageRegistry();

if (typeof exports === "object") {
  // This code is also used by meteor/tools/isobuild/bundler.js.
  exports.PackageRegistry = PackageRegistry;
}
