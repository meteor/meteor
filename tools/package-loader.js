var fs = require('fs');
var path = require('path');
var _ = require('underscore');
var packageCache = require('./package-cache.js');
var catalog = require('./catalog.js');
var utils = require('./utils.js');
var buildmessage = require('./buildmessage.js');
var unipackage = require('./unipackage.js');

// options:
//  - versions: a map from package name to the version to use.  or null to only
//    use local packages and ignore the package versions.
//  - uniloadDir: if specified, versions should be null, and this loader will
//    *only* load packages that are already unipackages and are in this
//    directory
exports.PackageLoader = function (options) {
  var self = this;
  self.versions = options.versions || null;
  self.uniloadDir = options.uniloadDir;
  self.constraintSolverOpts= options.constraintSolverOpts;
};

_.extend(exports.PackageLoader.prototype, {
  // Given the name of a package, return a Unipackage object, or throw an
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
      var pkg = new unipackage.Unipackage;
      pkg.initEmpty(name);
      return pkg;
    }

    return packageCache.packageCache.loadPackageAtPath(name, loadPath);
  },

  containsPlugins: function (name) {
    var self = this;

    // We don't want to ever look at the catalog in the uniload case. We
    // shouldn't ever care about plugins anyway, since uniload should never
    // compile real packages from source (it sorta compiles the wrapper "load"
    // package, which should avoid calling this function).
    if (self.uniloadDir)
      throw Error("called containsPlugins for uniload?");

    var versionRecord;
    if (self.versions === null) {
      versionRecord = catalog.complete.getLatestVersion(name);
    } else if (_.has(self.versions, name)) {
      versionRecord = catalog.complete.getVersion(name, self.versions[name]);
    } else {
      throw new Error("no version specified for package " + name);
    }

    return versionRecord.containsPlugins;
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

    if (self.uniloadDir) {
      var packagePath = path.join(self.uniloadDir, name);
      if (!fs.existsSync(path.join(packagePath, 'unipackage.json'))) {
        return null;
      }
      return packagePath;
    }

    if (self.versions && ! _.has(self.versions, name)) {
      throw new Error("no version chosen for package " + name + "?");
    }

    var version;
    if (self.versions) {
      version = self.versions[name];
    } else {
      version = null;
    }

    return catalog.complete.getLoadPathForPackage(name,
      version,
      self.constraintSolverOpts);
  },

  // Given a package name like "ddp" and an architecture, get the unibuild of
  // that package at the right architecture.
  getUnibuild: function (packageName, arch) {
    var self = this;

    var pkg = self.getPackage(packageName, { throwOnError: true });
    return pkg.getUnibuildAtArch(arch);
  }
});
