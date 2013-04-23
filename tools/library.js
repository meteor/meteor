var path = require('path');
var _ = require('underscore');
var files = require('./files.js');
var packages = require('./packages.js');
var warehouse = require('./warehouse.js');
var bundler = require('./bundler.js');
var buildmessage = require('./buildmessage.js');
var fs = require('fs');

// Under the hood, packages in the library (/package/foo), and user
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
  self.localPackageDirs = _.filter(options.localPackageDirs, function (dir) {
      try {
        // use stat rather than lstat since symlink to dir is OK
        var stats = fs.statSync(dir);
      } catch (e) {
        return false;
      }
      return stats.isDirectory();
    });

  self.loadedPackages = {};
  self.overrides = {}; // package name to package directory
};

_.extend(Library.prototype, {
  // Temporarily add a package to the library (or override a package
  // that actually exists in the library.) `packageName` is the name
  // to use for the package and `packageDir` is the directory that
  // contains its source.
  override: function (packageName, packageDir) {
    var self = this;
    self.overrides[packageName] = packageDir
  },

  // Force reload of all packages. See description at get().
  refresh: function () {
    var self = this;
    self.loadedPackages = {};
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
    var packageDir;
    var fromWarehouse = false;

    // Passed a Package?
    if (name instanceof packages.Package)
      return name;

    // Packages cached from previous calls
    if (name in self.loadedPackages)
      return self.loadedPackages[name];

    // If there's an override for this package, use that without
    // looking at any other options.
    if (name in self.overrides)
      packageDir = self.overrides[name];

    // Try localPackageDirs
    if (! packageDir) {
      for (var i = 0; i < self.localPackageDirs.length; ++i) {
        var packageDir = path.join(self.localPackageDirs[i], name);
        if (fs.existsSync(path.join(packageDir, 'package.js')))
          break;
        packageDir = null;
      }
    }

    // Try the Meteor distribution, if we have one.
    var version = self.releaseManifest && self.releaseManifest.packages[name];
    if (! packageDir && version) {
      var packageDir = path.join(warehouse.getWarehouseDir(),
                                 'packages', name, version);
      if (! fs.existsSync(packageDir))
        throw new Error("Package missing from warehouse: " + name +
                        " version " + version);
      fromWarehouse = true;
    }

    if (! packageDir) {
      if (throwOnError === false)
        return null;
      buildmessage.error("package not available: " + name);
      // recover by returning a dummy (empty) package
      var pkg = new packages.Package(self);
      pkg.initEmpty(name);
      return pkg;
    }

    // Load package from disk
    var pkg = new packages.Package(self);
    if (fs.existsSync(path.join(packageDir, 'unipackage.json'))) {
      // It's an already-built package
      pkg.initFromUnipackage(name, packageDir);
      self.loadedPackages[name] = pkg;
    } else {
      // It's a source tree
      var buildDir = path.join(packageDir, '.build');
      if (fs.existsSync(buildDir) &&
          pkg.initFromUnipackage(name, buildDir,
                                 { onlyIfUpToDate: ! fromWarehouse,
                                   buildOfPath: packageDir })) {
        // We already had a build and it was up to date.
        self.loadedPackages[name] = pkg;
      } else {
        // Either we didn't have a build, or it was out of date (and
        // as a transitional matter until the only thing the warehouse
        // contains is unipackages, we don't do an up-to-date check on
        // warehouse packages, for efficiency.) Build the package.
        //
        // As a temporary, transitional optimization, assume that any
        // source trees in the warehouse have already had their npm
        // dependencies fetched. The 0.6.0 installer does this
        // (rather, it downloads packages that already have their npm
        // dependencies inside of them), and during the transitional
        // period where we still have source trees in the warehouse
        // AND the unipackage format can't handle packages with
        // extensions, this will reduce startup time.
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
          pkg.initFromPackageDir(name, packageDir,
                                 { skipNpmUpdate: fromWarehouse });
          self.loadedPackages[name] = pkg;
          pkg.build();

          if (! buildmessage.jobHasMessages() && // ensure no errors!
              pkg.canBeSavedAsUnipackage()) {
            // Save it, for a fast load next time
            files.add_to_gitignore(packageDir, '.build*');
            pkg.saveAsUnipackage(buildDir, { buildOfPath: packageDir });
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

  // Given a slice set spec -- either a package name like "ddp", or a
  // particular slice within the package like "ddp.client" -- return
  // the list of matching slices (as an array of Slice objects) for a
  // given architecture.
  getSlices: function (spec, arch) {
    var self = this;
    var parts = spec.split('.');

    if (parts.length === 1) {
      var pkg = self.get(parts[0], true);
      return pkg.getDefaultSlices(arch);
    }

    else if (parts.length === 2) {
      var pkg = self.get(parts[0], true);
      return [pkg.getSingleSlice(parts[1], arch)];
    }

    else {
      // XXX figure out if this is user-visible and if so, improve the
      // message
      throw new Error("Bad slice spec");
    }
  },

  // Get all packages available. Returns a map from the package name
  // to a Package object.
  //
  // XXX Hack: If errors occur while generating the list (which could
  // easily happen, since it currently involves building packages)
  // print them to the console and exit(1)! Certainly not ideal but is
  // expedient since, eg, test-packages calls list() before it does
  // anything else.
  list: function () {
    var self = this;
    var names = [];
    var ret = {};

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
          ret[name] = pkg;
      });
    });

    if (messages.hasMessages()) {
      process.stdout.write("=> Errors while scanning packages:\n\n");
      process.stdout.write(messages.formatMessages());
      process.exit(1);
    }

    return ret;
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
  // only the visible one might get rebuilt immediately.)
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

    _.each(self.releaseManifest || {}, function (name, version) {
      var packageDir = path.join(warehouse.getWarehouseDir(),
                                 'packages', name, version);
      all[packageDir] = name;
    });

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
  // an application package.)
  formatList: function (pkgs) {
    var longest = '';
    _.each(pkgs, function (pkg) {
      if (pkg.name.length > longest.length)
        longest = pkg.name;
    });
    var pad = longest.replace(/./g, ' ');
    // it'd be nice to read the actual terminal width, but I tried
    // several methods and none of them work (COLUMNS isn't set in
    // node's environment; `tput cols` returns a constant 80.) maybe
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