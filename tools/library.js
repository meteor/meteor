var path = require('path');
var _ = require('underscore');
var files = require('./files.js');
var watch = require('./watch.js');
var packages = require('./packages.js');
var warehouse = require('./warehouse.js');
var bundler = require('./bundler.js');
var buildmessage = require('./buildmessage.js');
var fs = require('fs');

// Under the hood, packages in the library (/packages/foo), and user
// applications, are both Packages -- they are just represented
// differently on disk.

// Options:
// - releaseManifest: a parsed release manifest
// - localPackageDirs: array of directories to search before checking
//   the manifest and the warehouse. Directories that don't exist (or
//   paths that aren't directories) will be silently ignored.
var Library = function (options) {
  var self = this;
  options = options || {};

  self.releaseManifest = options.releaseManifest;

  // Trim down localPackageDirs to just those that actually exist (and
  // that are actually directories)
  self.localPackageDirs = _.filter(options.localPackageDirs, isDirectory);

  self.overrides = {}; // package name to package directory

  // both map from package name to:
  // - pkg: cached Package object
  // - packageDir: directory from which it was loaded
  self.softReloadCache = {};
  self.loadedPackages = {};
};

_.extend(Library.prototype, {
  // Temporarily add a package to the library (or override a package
  // that actually exists in the library). `packageName` is the name
  // to use for the package and `packageDir` is the directory that
  // contains its source. For now, it is an error to try to install
  // two overrides for the same packageName.
  override: function (packageName, packageDir) {
    var self = this;
    if (_.has(self.overrides, packageName))
      throw new Error("Duplicate override for package '" + packageName + "'");
    self.overrides[packageName] = path.resolve(packageDir);
  },

  // Undo an override previously set up with override().
  removeOverride: function (packageName) {
    var self = this;
    if (!_.has(self.overrides, packageName))
      throw new Error("No override present for package '" + packageName + "'");
    delete self.loadedPackages[packageName];
    delete self.overrides[packageName];
    delete self.softReloadCache[packageName];
  },

  // Force reload of changed packages. See description at get().
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

  // Given a package name as a string, returns the absolute path to the package
  // directory (which is the *source* tree in the source-with-built-unipackage
  // case, not the .build directory), or null if not found.
  //
  // Does NOT load the package or make any recursive calls, so can safely be
  // called from Package initialization code. Intended primarily for comparison
  // to the packageDirForBuildInfo field on a Package object; also used
  // internally to implement 'get'.
  //
  // If it finds a directory named name inside one of the localPackageDirs which
  // contains nothing but ".build", it deletes that directory.
  findPackageDirectory: function (name) {
    var self = this;

    // Packages cached from previous calls
    if (_.has(self.loadedPackages, name)) {
      return self.loadedPackages[name].packageDir;
    }

    // If there's an override for this package, use that without
    // looking at any other options.
    if (_.has(self.overrides, name))
      return self.overrides[name];

    for (var i = 0; i < self.localPackageDirs.length; ++i) {
      var packageDir = path.join(self.localPackageDirs[i], name);
      if (!isDirectory(packageDir))
        continue;

      // A directory is a package if it either contains 'package.js' (a package
      // source tree) or 'unipackage.json' (a compiled unipackage). (Actually,
      // for now, unipackages contain a dummy package.js too.)
      //
      // XXX support for putting unipackages in a local package dir is
      // incomplete! They will be properly loaded, but other packages that
      // depend on them have no way of knowing when they change! unipackages
      // that are the .build of a source tree work fine (they have a
      // buildinfo.json and can be rebuilt), and warehouse unipackages work fine
      // too (users are not supposed to edit them (they are read-only on disk),
      // and their pathname specifies a version).  But if you, eg, have a
      // unipackage of coffeescript in a local package directory, build another
      // package dependending on it, and substitute another version of the
      // unipackage in the same location, nothing will ever rebuild your
      // package!
      if (fs.existsSync(path.join(packageDir, 'package.js')) ||
          fs.existsSync(path.join(packageDir, 'unipackage.json'))) {
        return packageDir;
      }

      // Does this package directory just contain a ".build" subdirectory and
      // nothing else? Most likely, this package was created on another branch
      // of meteor, and when you checked this branch out it left around the
      // gitignored .build directory. Clean it up.
      if (_.isEqual(fs.readdirSync(packageDir), ['.build']))
        files.rm_recursive(packageDir);
    }

    // Try the Meteor distribution, if we have one.
    var version = self.releaseManifest && self.releaseManifest.packages[name];
    if (version) {
      packageDir = path.join(warehouse.getWarehouseDir(),
                             'packages', name, version);
      // The warehouse is theoretically constructed carefully enough that the
      // directory really should not exist unless it is complete.
      if (! fs.existsSync(packageDir))
        throw new Error("Package missing from warehouse: " + name +
                        " version " + version);
      return packageDir;
    }

    // Nope!
    return null;
  },

  // Given a package name as a string, retrieve a Package object. If
  // throwOnError is true, the default, throw an error if the package
  // can't be found. (If false is passed for throwOnError, then return
  // null if the package can't be found.) When called inside
  // buildmessage.enterJob, however, instead of throwing an error it
  // will record a build error and return a dummy (empty) package.
  //
  // Searches overrides first, then any localPackageDirs you have
  // provided, then the manifest/warehouse if provided.
  //
  // get() caches the packages it returns, meaning if you call
  // get('foo') and later foo changes on disk, you won't see the
  // changes. To flush the package cache and force all of the packages
  // to be reloaded the next time get() is called for them, see
  // refresh().
  get: function (name, throwOnError) {
    var self = this;

    // Passed a Package?
    if (name instanceof packages.Package)
      return name;

    // Packages cached from previous calls
    if (_.has(self.loadedPackages, name)) {
      return self.loadedPackages[name].pkg;
    }

    // Check for invalid package names. Currently package names can only contain
    // ASCII alphanumerics, dash, and dot, and must contain at least one
    // letter.
    //
    // XXX revisit this later. What about unicode package names?
    if (/[^A-Za-z0-9.\-]/.test(name) || !/[A-Za-z]/.test(name) ) {
      if (throwOnError === false)
        return null;
      throw new Error("Invalid package name: " + name);
    }

    var packageDir = self.findPackageDirectory(name);

    if (! packageDir) {
      if (throwOnError === false)
        return null;
      buildmessage.error("package not available: " + name);
      // recover by returning a dummy (empty) package
      var pkg = new packages.Package(self);
      pkg.initEmpty(name);
      return pkg;
    }

    // See if we can reuse a package that we have cached from before
    // the last soft refresh.
    if (_.has(self.softReloadCache, name)) {
      var entry = self.softReloadCache[name];

      // Either we will decide that the cache is invalid, or we will "upgrade"
      // this entry into loadedPackages. Either way, it's not needed in
      // softReloadCache any more.
      delete self.softReloadCache[name];

      if (entry.packageDir === packageDir && entry.pkg.checkUpToDate()) {
        // Cache hit
        self.loadedPackages[name] = entry;
        return entry.pkg;
      }
    }

    // Load package from disk
    var pkg = new packages.Package(self, packageDir);
    if (fs.existsSync(path.join(packageDir, 'unipackage.json'))) {
      // It's an already-built package
      pkg.initFromUnipackage(name, packageDir);
      self.loadedPackages[name] = {pkg: pkg, packageDir: packageDir};
    } else {
      // It's a source tree. Does it have a built unipackage inside it?
      var buildDir = path.join(packageDir, '.build');
      if (fs.existsSync(buildDir) &&
          pkg.initFromUnipackage(name, buildDir,
                                 { onlyIfUpToDate: true,
                                   buildOfPath: packageDir })) {
        // We already had a build and it was up to date.
        self.loadedPackages[name] = {pkg: pkg, packageDir: packageDir};
      } else {
        // Either we didn't have a build, or it was out of date. Build the
        // package.
        buildmessage.enterJob({
          title: "building package `" + name + "`",
          rootPath: packageDir
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
          pkg.initFromPackageDir(name, packageDir);
          self.loadedPackages[name] = {pkg: pkg, packageDir: packageDir};
          pkg.build();

          if (! buildmessage.jobHasMessages() && // ensure no errors!
              pkg.canBeSavedAsUnipackage()) {
            // Save it, for a fast load next time
            try {
              files.addToGitignore(packageDir, '.build*');
              pkg.saveAsUnipackage(buildDir, { buildOfPath: packageDir });
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
  getForApp: function (appDir, ignoreFiles) {
    var self = this;
    var pkg = new packages.Package(self);
    pkg.initFromAppDir(appDir, ignoreFiles || []);
    pkg.build();
    return pkg;
  },

  // Given a slice set spec -- either a package name like "ddp", or a particular
  // slice within the package like "ddp:client", or a parsed object like
  // {package: "ddp", slice: "client"} -- return the list of matching slices (as
  // an array of Slice objects) for a given architecture.
  getSlices: function (spec, arch) {
    var self = this;

    if (typeof spec === "string")
      spec = packages.parseSpec(spec);

    var pkg = self.get(spec.package, true);
    if (spec.slice)
      return [pkg.getSingleSlice(spec.slice, arch)];
    else
      return pkg.getDefaultSlices(arch);
  },

  // Register local package directories with a watchSet. We want to know if a
  // package is created or deleted, which includes both its top-level source
  // directory and its main package metadata file.
  watchLocalPackageDirs: function (watchSet) {
    var self = this;
    _.each(self.localPackageDirs, function (packageDir) {
      var packages = watch.readAndWatchDirectory(watchSet, {
        absPath: packageDir,
        include: [/\/$/]
      });
      _.each(packages, function (p) {
        watch.readAndWatchFile(watchSet,
                               path.join(packageDir, p, 'package.js'));
        watch.readAndWatchFile(watchSet,
                               path.join(packageDir, p, 'unipackage.json'));
      });
    });
  },

  // Get all packages available and their metadata. This can fail
  // since it currently involves building packages.
  //
  // On success, returns an object with keys:
  // - packages: map from the package name to a Package object for all
  //   available packages
  //
  // On failure, returns an object with keys:
  // - messages: a buildmessage.MessageSet with the errors
  //
  // XXX various callers currently rely on the fact that calling
  // list() forces all of the packages in the library to be built!
  // They shouldn't do that; they should instead call build()
  // themselves if they want the packages
  // built. #ListingPackagesImpliesBuildingThem
  list: function () {
    var self = this;
    var names = [];
    var packages = {};

    var messages = buildmessage.capture(function () {
      names = _.keys(self.overrides);

      _.each(self.localPackageDirs, function (dir) {
        names = _.union(names, fs.readdirSync(dir));
      });

      if (self.releaseManifest) {
        names = _.union(names, _.keys(self.releaseManifest.packages));
      }

      _.each(names, function (name) {
        var pkg = self.get(name, false);
        if (pkg)
          packages[name] = pkg;
      });
    });

    if (messages.hasMessages())
      return { messages: messages };
    else
      return { packages: packages };
  },

  // Rebuild all source packages in our search paths -- even including
  // any source packages in the warehouse. (Perhaps we shouldn't
  // include the warehouse since it's supposed to be immutable.. or
  // maybe if the warehouse wants to be immutable perhaps it shouldn't
  // include source packages. This is intended primarily for
  // convenience when developing the package build code.)
  //
  // This will force the rebuild even of packages that are
  // shadowed. However, for now, it's undefined whether shadowed
  // packages are rebuilt (eg, if you have two packages named 'foo' in
  // your search path, both of them will have their builds deleted but
  // only the visible one might get rebuilt immediately).
  //
  // Returns a count of packages rebuilt.
  rebuildAll: function () {
    var self = this;
    // XXX refactor to combine logic with list()? important difference
    // here is that we want shadowed packages too
    var all = {}; // map from path to name

    // Assemble a list of all packages
    _.each(self.overrides, function (packageDir, name) {
      all[packageDir] = name;
    });

    _.each(self.localPackageDirs, function (dir) {
      var subdirs = fs.readdirSync(dir);
      _.each(subdirs, function (subdir) {
        var packageDir = path.resolve(dir, subdir);
        all[packageDir] = subdir;
      });
    });

    // We *DON'T* look in the warehouse here, because warehouse packages are
    // prebuilt.

    // Delete any that are source packages with builds.
    var count = 0;
    _.each(_.keys(all), function (packageDir) {
      var isRealPackage = true;
      try {
        if (! fs.statSync(packageDir).isDirectory())
          isRealPackage = false;
      } catch (e) {
        // stat failed -- path doesn't exist
        isRealPackage = false;
      }

      if (! isRealPackage) {
        delete all[packageDir];
        return;
      }

      var buildDir = path.join(packageDir, '.build');
      files.rm_recursive(buildDir);
    });

    // Now reload them, forcing a rebuild. We have to do this in two
    // passes because otherwise we might end up rebuilding a package
    // and then immediately deleting it.
    self.refresh();
    _.each(all, function (name, packageDir) {
      // Tolerate missing packages. This can happen because our crude
      // logic above misdetects an empty directory as a package.
      if (self.get(name, /* throwOnError */ false))
        count ++;
    });

    return count;
  }
});

var library = exports;
_.extend(exports, {

  Library: Library,

  // returns a pretty list suitable for showing to the user. input is
  // a list of package objects, each of which must have a name (not be
  // an application package).
  formatList: function (pkgs) {
    var longest = '';
    _.each(pkgs, function (pkg) {
      if (!pkg.metadata.internal && pkg.name.length > longest.length)
        longest = pkg.name;
    });

    var pad = longest.replace(/./g, ' ');
    // it'd be nice to read the actual terminal width, but I tried
    // several methods and none of them work (COLUMNS isn't set in
    // node's environment; `tput cols` returns a constant 80). maybe
    // node is doing something weird with ptys.
    var width = 80;

    var out = '';
    _.each(pkgs, function (pkg) {
      if (pkg.metadata.internal)
        return;
      var name = pkg.name + pad.substr(pkg.name.length);
      var summary = pkg.metadata.summary || 'No description';
      out += (name + "  " +
              summary.substr(0, width - 2 - pad.length) + "\n");
    });

    return out;
  }
});

var isDirectory = function (dir) {
  try {
    // use stat rather than lstat since symlink to dir is OK
    var stats = fs.statSync(dir);
  } catch (e) {
    return false;
  }
  return stats.isDirectory();
};
