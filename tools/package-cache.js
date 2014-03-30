var fs = require("fs");
var path = require("path");
var files = require("./files.js");
var archinfo = require("./archinfo.js");
var compiler = require("./compiler.js");
var buildmessage = require("./buildmessage.js");
var PackageSource = require("./package-source.js");
var _ = require('underscore');
var Unipackage = require("./unipackage.js");

var packageCache = exports;

var PackageCache = function () {
  var self = this;

  // both map from package load path to:
  // - pkg: cached Unipackage object
  // - sourceDir: directory that contained its source code, or null
  // - buildDir: directory from which the built package was loaded
  self.softReloadCache = {};
  self.loadedPackages = {};
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

  // Given a path to a package on disk, retrieve a Package
  // object.
  //
  // loadPackageAtPath() caches the packages it returns, meaning if
  // you call loadPackageAtPath('/foo/bar') and later /foo/bar changes
  // on disk, you won't see the changes. To flush the package cache
  // and force all of the packages to be reloaded the next time
  // loadPackageAtPath() is called for them, see refresh().
  loadPackageAtPath: function (name, loadPath) {
    var self = this;

    // Packages cached from previous calls
    if (_.has(self.loadedPackages, loadPath)) {
      return self.loadedPackages[loadPath].pkg;
    }

    // See if we can reuse a package that we have cached from before
    // the last soft refresh.
    // XXX XXX this is not very efficient. refactor
    if (_.has(self.softReloadCache, loadPath)) {
      var entry = self.softReloadCache[loadPath];

      // Either we will decide that the cache is invalid, or we will "upgrade"
      // this entry into loadedPackages. Either way, it's not needed in
      // softReloadCache any more.
      delete self.softReloadCache[loadPath];

      var isUpToDate;
      var unipackage;
      if (fs.existsSync(path.join(loadPath, 'unipackage.json'))) {
        // We don't even have the source to this package, so it must
        // be up to date.
        isUpToDate = true;
      } else {
        var packageSource = new PackageSource;
        packageSource.initFromPackageDir(name, loadPath);
        unipackage = new Unipackage;
        unipackage.initFromPath(name, entry.buildDir);
        isUpToDate = compiler.checkUpToDate(packageSource, entry.pkg);
      }

      if (isUpToDate) {
        // Cache hit
        self.loadedPackages[loadPath] = entry;
        return entry.pkg;
      }
    }

    // Load package from disk

    // Does loadPath point directly at a unipackage (rather than a
    // source tree?)
    if (fs.existsSync(path.join(loadPath, 'unipackage.json'))) {
      unipackage = new Unipackage;
      unipackage.initFromPath(name, loadPath);
      self.loadedPackages[loadPath] = {
        pkg: unipackage,
        sourceDir: null,
        buildDir: loadPath
      };
      return unipackage;
    };

    // It's a source tree. Load it.
    var packageSource = new PackageSource;
    packageSource.initFromPackageDir(name, loadPath);

    // Does it have an up-to-date build?
    var buildDir = path.join(loadPath, '.build');
    if (fs.existsSync(buildDir)) {
      unipackage = new Unipackage;
      unipackage.initFromPath(name, buildDir);
      if (compiler.checkUpToDate(packageSource, unipackage)) {
        self.loadedPackages[loadPath] = { pkg: unipackage,
                                          sourceDir: loadPath,
                                          buildDir: buildDir
                                        };
        return unipackage;
      }
    }

    // Either we didn't have a build, or it was out of date, or the
    // caller wanted us to rebuild no matter what. Build the package.
    return buildmessage.enterJob({
      title: "building package `" + name + "`",
      rootPath: loadPath
    }, function () {
      // We used to take great care to first put a
      // loaded-but-not-built package object (the equivalent of a
      // PackageSource) into self.loadedPackages before calling
      // build() as a hacky way of dealing with build-time
      // dependencies.
      //
      // We don't do that anymore and ..
      // XXX at the moment, rely on catalog to initalize ahead of us
      // and swoop in and build all of the local packages informed by
      // a topological sort
      var unipackage = compiler.compile(packageSource).unipackage;
      self.loadedPackages[loadPath] = {
        pkg: unipackage,
        sourceDir: null,
        buildDir: loadPath
      };

      if (! buildmessage.jobHasMessages()) {
        // Save it, for a fast load next time
        try {
          files.addToGitignore(loadPath, '.build*');
          unipackage.saveToPath(buildDir, { buildOfPath: loadPath });
        } catch (e) {
          // If we can't write to this directory, we don't get to cache our
          // output, but otherwise life is good.
          if (!(e && (e.code === 'EACCES' || e.code === 'EPERM')))
            throw e;
        }
      }

      return unipackage;
    });
  },

  // Get a package that represents an app. (ignoreFiles is optional
  // and if given, it should be an array of regexps for filenames to
  // ignore when scanning for source files.)
  loadAppAtPath: function (appDir, ignoreFiles) {
    var self = this;

    var packageSource = new PackageSource;
    packageSource.initFromAppDir(appDir, ignoreFiles);
    return compiler.compile(packageSource).unipackage;
  }
});

packageCache.packageCache = new PackageCache;
