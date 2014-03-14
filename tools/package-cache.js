var fs = require("fs");
var path = require("path");
var packageLoader = require("./package-loader.js");
var packages = require("./packages.js");
var archinfo = require("./archinfo.js");
var _ = require('underscore');

// both map from package load path to:
// - pkg: cached Package object
// - packageDir: directory from which it was loaded
var PackageCache = function () {
  var self = this;

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
  // object. Options are:
  //  - forceRebuild: see documentation in PackageLoader.getPackage
  //
  // loadPackageAtPath() caches the packages it returns, meaning if
  // you call loadPackageAtPath('/foo/bar') and later /foo/bar changes
  // on disk, you won't see the changes. To flush the package cache
  // and force all of the packages to be reloaded the next time
  // loadPackageAtPath() is called for them, see refresh().
  loadPackageAtPath: function (name, loadPath, options) {
    var self = this;

    options = options || {};

    // Packages cached from previous calls
    if (! options.forceRebuild && _.has(self.loadedPackages, loadPath)) {
      return self.loadedPackages[loadPath].pkg;
    }

    // See if we can reuse a package that we have cached from before
    // the last soft refresh.
    if (! options.forceRebuild && _.has(self.softReloadCache, loadPath)) {
      var entry = self.softReloadCache[loadPath];

      // Either we will decide that the cache is invalid, or we will "upgrade"
      // this entry into loadedPackages. Either way, it's not needed in
      // softReloadCache any more.
      delete self.softReloadCache[loadPath];

      if (entry.pkg.checkUpToDate()) {
        // Cache hit
        self.loadedPackages[loadedPackages] = entry;
        return entry.pkg;
      }
    }

    // Load package from disk
    var pkg = new packages.Package(loadPath);
    if (fs.existsSync(path.join(loadPath, 'unipackage.json'))) {
      // It's an already-built package
      if (options.forceRebuild) {
        throw new Error('Cannot rebuild from a unipackage directory.');
      }
      pkg.initFromUnipackage(name, loadPath);
      self.loadedPackages[loadPath] = {pkg: pkg, packageDir: loadPath};
    } else {
      // It's a source tree. Does it have a built unipackage inside it?
      var buildDir = path.join(loadPath, '.build');
      // XXX XXX onlyIfUpToDate flag was removed. call
      // compiler.checkUpToDate instead
      if (! options.forceRebuild &&
          fs.existsSync(buildDir) &&
          pkg.initFromUnipackage(name, buildDir,
                                 { onlyIfUpToDate: true,
                                   buildOfPath: loadPath })) {
        // We already had a build and it was up to date.
        self.loadedPackages[loadPath] = {pkg: pkg, packageDir: loadPath};
      } else {
        // Either we didn't have a build, or it was out of date, or the
        // caller wanted us to rebuild no matter what. Build the
        // package.
        buildmessage.enterJob({
          title: "building package `" + name + "`",
          rootPath: loadPath
        }, function () {
          // This has to be done in the right sequence: initialize
          // (which loads the dependency list but does not get() those
          // packages), then put the package into the package list,
          // then call build() to get() the dependencies and finish
          // the build. If you called build() before putting the
          // package in the package list then you'd recurse
          // forever. (build() needs the dependencies because it needs
          // to look at the handlers registered by any plugins in the
          // packages that we use.)
          pkg.initFromPackageDir(name, loadPath);
          self.loadedPackages[loadPath] = {pkg: pkg, packageDir: loadPath};
          pkg.build();

          if (! buildmessage.jobHasMessages()) {
            // Save it, for a fast load next time
            try {
              files.addToGitignore(loadPath, '.build*');
              pkg.saveAsUnipackage(buildDir, { buildOfPath: loadPath });
            } catch (e) {
              // If we can't write to this directory, we don't get to cache our
              // output, but otherwise life is good.
              if (!(e && (e.code === 'EACCES' || e.code === 'EPERM')))
                throw e;
            }
          }
        });
      }
    }

    return pkg;
  },

  // Get a package that represents an app. (ignoreFiles is optional
  // and if given, it should be an array of regexps for filenames to
  // ignore when scanning for source files.)
  // XXX formerly called getForApp
  loadAppAtPath: function (appDir, ignoreFiles) {
    var self = this;

    var pkg = new packages.Package;
    pkg.initFromAppDir(appDir, ignoreFiles || []);
    pkg.build();
    return pkg;
  }
});

module.exports = new PackageCache();
