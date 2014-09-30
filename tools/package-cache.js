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

  // both map from package load path to:
  // - pkg: cached Isopack object
  // - sourceDir: directory that contained its source code, or null
  // - buildDir: directory from which the built package was loaded
  self.softReloadCache = {};
  self.loadedPackages = {};

  if (!whichCatalog)
    throw Error("must provide catalog");
  self.catalog = whichCatalog;
};

_.extend(PackageCache.prototype, {
  // Force reload of changed packages. See description at loadPackageAtPath().
  //
  // If soft is false, the default, the cache is totally flushed and
  // all packages are reloaded unconditionally.
  //
  // If soft is true, then built packages without dependency info (such as those
  // from the warehouse) aren't reloaded (there's no way to rebuild them, after
  // all), and if we loaded a built package with dependency info, we won't
  // reload it if the dependency info says that its source files are still up to
  // date. The ideas is that assuming the user is "following the rules", this
  // will correctly reload any changed packages while in most cases avoiding
  // nearly all reloading.
  refresh: function (soft) {
    var self = this;
    soft = soft || false;

    self.softReloadCache = soft ? self.loadedPackages : {};
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
    var buildDir = path.join(loadPath, '.build.'+  name);

    self.loadedPackages[key] = {
        pkg: isop,
        sourceDir: loadPath,
        buildDir: buildDir
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

    var isop;

    // See if we can reuse a package that we have cached from before
    // the last soft refresh.
    // XXX XXX this is not very efficient. refactor
    if (_.has(self.softReloadCache, key)) {
      var entry = self.softReloadCache[key];

      // Either we will decide that the cache is invalid, or we will "upgrade"
      // this entry into loadedPackages. Either way, it's not needed in
      // softReloadCache any more.
      delete self.softReloadCache[key];

      var isUpToDate;
      if (isopack.isopackExistsAtPath(loadPath)) {
        // We don't even have the source to this package, so it must
        // be up to date.
        isUpToDate = true;
      } else {

        buildmessage.enterJob({
          title: "Initializing package `" + name + "`",
          rootPath: loadPath
        }, function () {
          var packageSource = new PackageSource(self.catalog);
          // We know exactly what package we want at this point, so let's make
          // sure to pass in a name.
          packageSource.initFromPackageDir(loadPath, {
            name: name
          });
          isop = new isopack.Isopack();
          isop.initFromPath(name, entry.buildDir);
          isUpToDate = compiler.checkUpToDate(
            packageSource, entry.pkg, {
              ignoreProjectDeps: constraintSolverOpts.ignoreProjectDeps
            });
        });
      }
      if (isUpToDate) {
        // Cache it
        self.loadedPackages[key] = entry;
        return entry.pkg;
      }
    }

    // Load package from disk

    // Does loadPath point directly at a isopack (rather than a
    // source tree?)
    if (isopack.isopackExistsAtPath(loadPath)) {
      isop = new isopack.Isopack();

      isop.initFromPath(name, loadPath);
      self.loadedPackages[key] = {
        pkg: isop,
        sourceDir: null,
        buildDir: loadPath
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
    var buildDir = path.join(loadPath, '.build.'+  name);
    if (fs.existsSync(buildDir)) {
      isop = new isopack.Isopack();
      var maybeUpToDate = true;
      try {
        isop.initFromPath(name, buildDir);
      } catch (e) {
        if (!(e instanceof isopack.OldIsopackFormatError))
          throw e;
        maybeUpToDate = false;
      }
      if (maybeUpToDate &&
          compiler.checkUpToDate(
            packageSource, isop,
            { ignoreProjectDeps: constraintSolverOpts.ignoreProjectDeps })) {
        self.loadedPackages[key] = { pkg: isop,
                                     sourceDir: loadPath,
                                     buildDir: buildDir
                                   };
        return isop;
      }
    }

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
      var isop = compiler.compile(packageSource, {
        ignoreProjectDeps: constraintSolverOpts.ignoreProjectDeps
      }).isopack;
      self.loadedPackages[key] = {
        pkg: isop,
        sourceDir: null,
        buildDir: buildDir
      };

      if (! buildmessage.jobHasMessages()) {
        // Save it, for a fast load next time
        try {
          files.addToGitignore(loadPath, '.build*');
          isop.saveToPath(buildDir, {
            buildOfPath: loadPath,
            catalog: self.catalog
          });
        } catch (e) {
          // If we can't write to this directory, we don't get to cache our
          // output, but otherwise life is good.
          if (!(e && (e.code === 'EACCES' || e.code === 'EPERM')))
            throw e;
        }
      }
      return isop;
    });
  }
});

exports.PackageCache = PackageCache;
