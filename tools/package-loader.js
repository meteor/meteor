var _ = require('underscore');
var packageCache = require('./package-cache.js');
var catalog = require('./catalog.js');
var utils = require('./utils.js');
var buildmessage = require('./buildmessage.js');
var Unipackage = require('./unipackage.js');

// options:
//  - versions: a map from package name to the version to use.  or null to only
//    use local packages and ignore the package versions.
var PackageLoader = function (options) {
  var self = this;
  self.versions = options.versions;
};

_.extend(PackageLoader.prototype, {
  // Given the name of a package, return a Package object, or throw an
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
      var pkg = new Unipackage;
      pkg.initEmpty(name);
      return pkg;
    }

    return packageCache.packageCache.loadPackageAtPath(name, loadPath);
  },

  containsPlugins: function (name) {
    var self = this;

    var versionRecord;
    if (self.versions === null) {
      versionRecord = catalog.catalog.getLatestVersion(name);
    } else if (_.has(self.versions, name)) {
      versionRecord = catalog.catalog.getVersion(name, self.versions[name]);
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

    if (self.versions && ! _.has(self.versions, name)) {
      throw new Error("no version chosen for package " + name + "?");
   }

    var version;
    if (self.versions) {
      version = self.versions[name].version;
    } else {
      version = null;
    }

    return catalog.catalog.getLoadPathForPackage(name, version);
  },

  // Given a slice set spec -- either a package name like "ddp", or a particular
  // slice within the package like "ddp/client", or a parsed object like
  // {package: "ddp", slice: "client"} -- return the list of matching slices (as
  // an array of Slice objects) for a given architecture.
  getSlices: function (spec, arch) {
    var self = this;

    if (typeof spec === "string")
      spec = utils.parseSpec(spec);

    var pkg = self.getPackage(spec.package, { throwOnError: true });
    if (spec.slice)
      return [pkg.getSingleSlice(spec.slice, arch)];
    else
      return pkg.getDefaultSlices(arch);
  }
});

module.exports = PackageLoader;
