var fs = require('fs');
var path = require('path');
var _ = require('underscore');
var catalog = require('./catalog.js');
var utils = require('./utils.js');
var buildmessage = require('./buildmessage.js');
var isopack = require('./isopack.js');
var tropohouse = require('./tropohouse.js');

// options:
//  - versions: a map from package name to the version to use.  or null to only
//    use local packages and ignore the package versions.
exports.PackageLoader = function (options) {
  var self = this;
  if (!options.catalog)
    throw Error("Must specify a catalog");

  self.versions = null;
  // Really, the only PackageLoader we should be using while building isopackets
  // is the one we create right next to creating the isopacket building catalog
  // (in isopackets.js or _writeTool). But since we haven't yet eliminated the
  // constraint solver calls in compiler.js and their own PackageLoader,
  // sometimes we might end up with another PackageLoader here. Pretend that it
  // didn't tell us versions.
  // XXX Delete this code once compiler no longer makes its own PackageLoaders.
  if (options.versions && ! options.catalog.isopacketBuildingCatalog)
    self.versions = options.versions;

  self.constraintSolverOpts = options.constraintSolverOpts;
  self.catalog = options.catalog;
};

_.extend(exports.PackageLoader.prototype, {
  // Given the name of a package, return a Isopack object, or throw an
  // error if the package wasn't included in the 'versions' passed on
  // initalization or isn't available (for example, hasn't been
  // downloaded yet).
  //
  // Options are:
  //  - throwOnError: if true (the default), throw an error if the
  //    package can't be found. (If false is passed for throwOnError,
  //    then return null if the package can't be found.) When called
  //    inside buildmessage.enterJob, however, instead of throwing an
  //    error it will record a build error and return a dummy (empty)
  //    package.
  //    XXX rename to throwOnNotFound
  getPackage: function (name, options) {
    var self = this;
    buildmessage.assertInCapture();

    options = options || {};
    if (options.throwOnError === undefined) {
      options.throwOnError = true;
    }
    var loadPath = self.getLoadPathForPackage(name);
    if (! loadPath) {
      if (options.throwOnError === false)
        return null;
      buildmessage.error("package not available: " + name);
      // recover by returning a dummy (empty) package
      var pkg = new isopack.Isopack;
      pkg.initEmpty(name);
      return pkg;
    }

    return self.catalog.packageCache.loadPackageAtPath(
      name, loadPath, self.constraintSolverOpts);
  },

  // As getPackage, but returns the path of the package that would be
  // loaded rather than loading the package, and does not take any
  // options. Returns null if the package is not available.
  //
  // XXX it's a little unfortunate that we have two functions called
  // getLoadPathForPackage, one on this object (which does not take a
  // version) and one on Catalog (which does). Maybe rename them to
  // getPackageLoadPath / getPackageVersionLoadPath?
  getLoadPathForPackage: function (name) {
    var self = this;
    buildmessage.assertInCapture();

    if (self.versions && ! _.has(self.versions, name)) {
      throw new Error("no version chosen for package " + name + "?");
    }

    var version;
    if (self.versions) {
      version = self.versions[name];
    } else {
      version = null;
    }

    return self.catalog.getLoadPathForPackage(
      name, version, self.constraintSolverOpts);
  },

  // Given a package name like "ddp" and an architecture, get the unibuild of
  // that package at the right architecture.
  getUnibuild: function (packageName, arch) {
    var self = this;
    buildmessage.assertInCapture();

    var pkg = self.getPackage(packageName, { throwOnError: true });
    return pkg.getUnibuildAtArch(arch);
  },

  downloadMissingPackages: function (options) {
    var self = this;
    options = options || {};
    // We can only download packages if we know what versions they are.
    if (!self.versions)
      return;

    tropohouse.default.downloadMissingPackages(self.versions, {
      serverArch: options.serverArch
    });
  }
});
