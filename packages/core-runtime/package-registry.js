// Set global.Package[name] = pkg || {}. If additional arguments are
// supplied, their keys will be copied into pkg if not already present.
// Methods are on the prototype so they won't appear in Object.keys(Package).
class PackageRegistry {
  _define(name, pkg = {}, ...extras) {
    for (const extra of extras) {
      for (const key of Object.keys(extra)) {
        if (!Object.hasOwn(pkg, key)) {
          pkg[key] = extra[key];
        }
      }
    }

    this[name] = pkg;
    return pkg;
  }

  _has(name) {
    return Object.hasOwn(this, name);
  }
}

// Initialize the Package namespace used by all Meteor packages.
const global = this;
global.Package = new PackageRegistry();

if (typeof exports === "object") {
  // This code is also used by meteor/tools/isobuild/bundler.js.
  exports.PackageRegistry = PackageRegistry;
}
