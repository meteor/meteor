var fs = require("fs");
var path = require("path");
var files = require("./files.js");
var archinfo = require("./archinfo.js");
var compiler = require("./compiler.js");
var buildmessage = require("./buildmessage.js");
var PackageSource = require("./package-source.js");
var _ = require('underscore');
var isopack = require("./isopack.js");

var PackageCache = function (whichCatalog) {
  var self = this;

  // map from package load path to:
  // - pkg: cached Isopack object
  // - sourceDir: directory that contained its source code, or null
  // XXX #3006: There used to be the concept of a "soft refresh".
  //     The idea being that "soft refresh" means "keep the Isopack object in
  //     memory but check its watchsets/versions before the next time you use
  //     it", whereas "hard refresh" means "always re-parse from disk".
  //     This was probably a valid optimization; re-implement it later.
  //     But there is no reason to re-implement it unless we can actually
  //     skip the "re-parse from disk" step --- in 0.9.0 it still did reparse.
  self.loadedPackages = {};

  if (!whichCatalog)
    throw Error("must provide catalog");
  self.catalog = whichCatalog;
};

_.extend(PackageCache.prototype, {
  // Force reload of changed packages. See description at loadPackageAtPath().
  refresh: function () {
    var self = this;

    // XXX #3006: "soft refresh" was once here

    if (self.catalog.isopacketBuildingCatalog)
      throw Error("refreshing the isopacket catalog? why?");

    self.loadedPackages = {};
  },

  // Adds a prebuilt package to the package cache.
  //
  // - name: package name
  // - loadPath: path of the source to the package
  // - isopack (prebuilt package)
  cachePackageAtPath : function (name, loadPath, isop) {
    var self = this;
    var key = name + "@" + loadPath;

    self.loadedPackages[key] = {
      pkg: isop,
      sourceDir: loadPath
    };
  },

  // Given a path to a package on disk, retrieve a Isopack
  // object.
  //
  // loadPackageAtPath() caches the packages it returns, meaning if
  // you call loadPackageAtPath('bar', '/foo/bar') and later /foo/bar changes
  // on disk, you won't see the changes. To flush the package cache
  // and force all of the packages to be reloaded the next time
  // loadPackageAtPath() is called for them, see refresh().
  loadPackageAtPath: function (name, loadPath, constraintSolverOpts) {
    var self = this;
    buildmessage.assertInCapture();
    constraintSolverOpts = constraintSolverOpts || {};

    // We need to build and load both the test and normal package, which,
    // frequently means 2 packages per directory/loadPath. Rather than
    // special-casing it with some sort of a test flag, we can just
    // differentiate by name (and extend the interface if it ever comes up).
    var key = name + "@" + loadPath;
    if (_.has(self.loadedPackages, key)) {
       return self.loadedPackages[key].pkg;
    }

    // XXX #3006: We used to look in the soft refresh cache here.

    // Load package from disk

    var isop;

    // Does loadPath point directly at a isopack (rather than a
    // source tree?)
    if (isopack.isopackExistsAtPath(loadPath)) {
      isop = new isopack.Isopack();

      isop.initFromPath(name, loadPath);
      self.loadedPackages[key] = {
        pkg: isop,
        sourceDir: null
      };
      return isop;
    }

    // It's a source tree. Load it.
    var packageSource = new PackageSource(self.catalog);
    buildmessage.enterJob({
      title: "Initializing package `" + name + "`",
      rootPath: loadPath
    }, function () {
      packageSource.initFromPackageDir(loadPath, {
        name: name
      });
    });
    // Does it have an up-to-date build?
    // XXX #3006: We used to look for the .build.* directory here and
    //            check to see if it is up to date.

    // Either we didn't have a build, or it was out of date, or the
    // caller wanted us to rebuild no matter what. Build the package.
    return buildmessage.enterJob({
      title: "Building package `" + name + "`",
      rootPath: loadPath
    }, function () {
      // We used to take great care to first put a
      // loaded-but-not-built package object (the equivalent of a
      // PackageSource) into self.loadedPackages before calling
      // build() as a hacky way of dealing with build-time
      // dependencies.
      //
      // We don't do that anymore and at the moment, we rely on catalog to
      // initalize ahead of us and swoop in and build all of the local packages
      // informed by a topological sort
      // XXX #3006: Make sure that the topological sort does still exist
      //            somewhere!
      var isop = compiler.compile(packageSource, {
        ignoreProjectDeps: constraintSolverOpts.ignoreProjectDeps
      }).isopack;
      self.loadedPackages[key] = {
        pkg: isop,
        sourceDir: null
      };

      // XXX #3006: We used to save the package to the cache at this point (if
      // !buildmessage.jobHasMessages).
      return isop;
    });
  }
});

exports.PackageCache = PackageCache;
