var packageLoader = exports;

// options:
//   catalog: the Catalog used to locate the packages on disk
//   versions: a map from package name to the version to use
//   packageCache: the PackageCache used to load packages and cache them
//     in memory
packageLoader.PackageLoader = function (options) {
  var self = this;
  self.catalog = options.catalog;
  self.versions = options.versions;
  self.packageCache = options.packageCache;
};

_.extend(packageLoader.PackageLoader, {
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
  //  - forceRebuild: defaults to false. If true, we will initialize the
  //    package from the source and ignore a built unipackage if it
  //    exists. This option is ignored if you pass `name` as a Package.
  //
  //    XXX rename to throwOnNotFound
  getPackage: function (name, options) {
    var self = this;

    options = options || {};
    if (options.throwOnError === undefined) {
      options.throwOnError = true;
    }

    if (! _.has(self.versions, name))
      throw new Error("no version chosen for package?");

    var loadPath = self.catalog.getLoadPathForPackage(name,
                                                      self.versions[name]);
    if (! loadPath) {
      if (options.throwOnError === false)
        return null;
      buildmessage.error("package not available: " + name);
      // recover by returning a dummy (empty) package
      var pkg = new packages.Package;
      pkg.initEmpty(name);
      return pkg;
    }

    return self.packageCache.loadPackageAtPath(name, loadPath, {
      forceRebuild: options.forceRebuild
    });
  },

  // Given a slice set spec -- either a package name like "ddp", or a particular
  // slice within the package like "ddp/client", or a parsed object like
  // {package: "ddp", slice: "client"} -- return the list of matching slices (as
  // an array of Slice objects) for a given architecture.
  getSlices: function (spec, arch) {
    var self = this;

    if (typeof spec === "string")
      spec = packages.parseSpec(spec);

    var pkg = self.getPackage(spec.package, { throwOnError: true });
    if (spec.slice)
      return [pkg.getSingleSlice(spec.slice, arch)];
    else
      return pkg.getDefaultSlices(arch);
  },

  // Return the PackageCache that backs this loader.
  getPackageCache: function () {
    var self = this;
    return self.packageCache;
  }

});