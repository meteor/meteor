var path = require('path');
var _ = require('underscore');
var files = require('./files.js');
var packages = require('./packages.js');
var warehouse = require('./warehouse.js');
var bundler = require('./bundler.js');
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
  // null if the package can't be found.)
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
    var packageDir, fromWarehouse = false;

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
      throw new Error("Package not available: " + name);
    }

    // Load package from disk
    var pkg = new packages.Package(self);
    pkg.initFromPackageDir(name, packageDir);
    pkg.inWarehouse = fromWarehouse;
    self.loadedPackages[name] = pkg;

    return pkg;
  },

  // Get a package that represents an app. (ignoreFiles is optional
  // and if given, it should be an array of regexps for filenames to
  // ignore when scanning for source files.)
  getForApp: function (appDir, ignoreFiles) {
    var self = this;
    var pkg = new packages.Package(self);
    pkg.initFromAppDir(appDir, ignoreFiles || []);
    return pkg;
  },

  // Get all packages available. Returns a map from the package name
  // to a Package object.
  list: function () {
    var self = this;
    var names = [];

    names = _.keys(self.overrides);

    _.each(self.localPackageDirs, function (dir) {
      names = _.union(names, fs.readdirSync(dir));
    });

    if (self.releaseManifest) {
      names = _.union(names, _.keys(self.releaseManifest.packages));
    }

    var ret = {};
    _.each(names, function (name) {
      var pkg = self.get(name, false);
      if (pkg)
        ret[name] = pkg;
    });

    return ret;
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