var fs = require('fs');
var path = require('path');
var _ = require('underscore');
var packageClient = require('./package-client.js');
var watch = require('./watch.js');
var archinfo = require('./archinfo.js');
var isopack = require('./isopack.js');
var buildmessage = require('./buildmessage.js');
var tropohouse = require('./tropohouse.js');
var files = require('./files.js');
var utils = require('./utils.js');
var catalog = require('./catalog.js');
var PackageSource = require('./package-source.js');
var VersionParser = require('./package-version-parser.js');

// LocalCatalog represents packages located in the application's
// package directory, other package directories specified via an
// environment variable, and core packages in the repo if meteor is
// being run from a git checkout.
var LocalCatalog = function (options) {
  var self = this;
  options = options || {};

  // Package server data.  Maps package name to a {packageSource, packageRecord,
  // versionRecord} object.
  self.packages = {};

  // We use the initialization design pattern because it makes it easier to use
  // both of our catalogs as singletons.
  self.initialized = false;
  self.containingCatalog = options.containingCatalog || self;

    // Local directories to search for package source trees
  self.localPackageSearchDirs = null;

  // Packagedirs specified by addLocalPackage: added explicitly through a
  // directory. We mainly use this to allow the user to run test-packages
  // against a package in a specific directory.
  self.explicitlyAddedLocalPackageDirs = [];

  // All packages found either by localPackageSearchDirs or
  // explicitlyAddedLocalPackageDirs. There is a hierarchy of packages, as
  // detailed below and there can only be one local version of a package at a
  // time. This refers to the package by the specific package directory that we
  // need to process.
  self.effectiveLocalPackageDirs = [];

  // A WatchSet that detects when the set of packages and their locations
  // changes. ie, the listings of 'packages' directories, and the contents of
  // package.js files underneath.  It does NOT track the rest of the source of
  // the packages: that wouldn't be helpful to the runner since it would be too
  // coarse to tell if a change is client-only or not.  (But any change to the
  // layout of where packages live counts as a non-client-only change.)
  self.packageLocationWatchSet = new watch.WatchSet;

  self.nextVersionId = 1;
};

_.extend(LocalCatalog.prototype, {
  toString: function () {
    var self = this;
    return "LocalCatalog [localPackageSearchDirs="
      + self.localPackageSearchDirs + "]";
  },

  // Initialize the Catalog. This must be called before any other
  // Catalog function.

  // options:
  //  - localPackageSearchDirs: an array of paths on local disk, that contain
  //    subdirectories, that each contain a source tree for a package that
  //    should override the packages on the package server. For example, if
  //    there is a package 'foo' that we find through localPackageSearchDirs,
  //    then we will ignore all versions of 'foo' that we find through the
  //    package server. Directories that don't exist (or paths that aren't
  //    directories) will be silently ignored.
  initialize: function (options) {
    var self = this;
    buildmessage.assertInCapture();

    options = options || {};

    self.localPackageSearchDirs = _.map(
      options.localPackageSearchDirs, function (p) {
        return path.resolve(p);
      });

    self._recomputeEffectiveLocalPackages();
    self._loadLocalPackages();
    self.initialized = true;
  },

  // Throw if the catalog's self.initialized value has not been set to true.
  _requireInitialized: function () {
    var self = this;

    if (! self.initialized)
      throw new Error("catalog not initialized yet?");
  },

  // Return an array with the names of all of the packages that we
  // know about, in no particular order.
  getAllPackageNames: function () {
    var self = this;
    self._requireInitialized();

    return _.keys(self.packages);
  },

  // Returns general (non-version-specific) information about a
  // package, or null if there is no such package.
  getPackage: function (name, options) {
    var self = this;
    self._requireInitialized();
    options = options || {};

    if (!_.has(self.packages, name))
      return null;
    return self.packages[name].packageRecord;
  },

  // Given a package, returns an array of the versions available (ie, the one
  // version we have, or an empty array).
  getSortedVersions: function (name) {
    var self = this;
    self._requireInitialized();

    if (!_.has(self.packages, name))
      return [];
    return [self.packages[name].versionRecord.version];
  },

  // Return information about a particular version of a package, or
  // null if there is no such package or version.
  getVersion: function (name, version) {
    var self = this;
    self._requireInitialized();

    if (!_.has(self.packages, name))
      return null;
    var versionRecord = self.packages[name].versionRecord;
    if (versionRecord.version !== version)
      return null;
    return versionRecord;
  },

  // As getVersion, but returns info on the latest version of the
  // package, or null if the package doesn't exist or has no versions.
  getLatestVersion: function (name) {
    var self = this;

    if (!_.has(self.packages, name))
      return null;
    return self.packages[name].versionRecord;
  },

  // Compute self.effectiveLocalPackageDirs from self.localPackageSearchDirs and
  // self.explicitlyAddedLocalPackageDirs.
  _recomputeEffectiveLocalPackages: function () {
    var self = this;
    self.effectiveLocalPackageDirs = _.clone(
      self.explicitlyAddedLocalPackageDirs);

    _.each(self.localPackageSearchDirs, function (searchDir) {
      var possiblePackageDirs = watch.readAndWatchDirectory(
        self.packageLocationWatchSet, {
          absPath: searchDir,
          include: [/\/$/]
        });
      // Not a directory? Ignore.
      if (possiblePackageDirs === null)
        return;

      _.each(possiblePackageDirs, function (subdir) {
        // readAndWatchDirectory adds a slash to the end of directory names to
        // differentiate them from filenames. Remove it.
        subdir = subdir.substr(0, subdir.length - 1);
        var absPackageDir = path.join(searchDir, subdir);

        // Consider a directory to be a package source tree if it contains
        // 'package.js'. (We used to support isopacks in localPackageSearchDirs,
        // but no longer.)
        var packageJs = watch.readAndWatchFile(
          self.packageLocationWatchSet,
          path.join(absPackageDir, 'package.js'));
        if (packageJs !== null) {
          // Let earlier package directories override later package
          // directories.

          // We don't know the name of the package, so we can't deal with
          // duplicates yet. We are going to have to rely on the fact that we
          // are putting these in in order, to be processed in order.
          self.effectiveLocalPackageDirs.push(absPackageDir);
        }
      });
    });
  },

  _loadLocalPackages: function (options) {
    var self = this;
    options = options || {};
    buildmessage.assertInCapture();

    // Load the package source from a directory. We don't know the names of our
    // local packages until we do this.
    //
    // THIS MUST BE RUN IN LOAD ORDER. Let's say that we have two directories
    // for mongo-livedata. The first one processed by this function will be
    // canonical.  The second one will be ignored.
    //
    // (note: this is the behavior that we want for overriding things in
    //  checkout.  It is not clear that you get good UX if you have two packages
    //  with the same name in your app. We don't check that.)
    var initSourceFromDir = function (packageDir, definiteName) {
      var packageSource = new PackageSource(self.containingCatalog);
      buildmessage.enterJob({
        title: "reading package from `" + packageDir + "`",
        rootPath: packageDir
      }, function () {
        // All packages in the catalog must have versions. Though, for local
        // packages without version, we can be kind and set it to
        // 0.0.0. Anything requiring any version above that will not be
        // compatible, which is fine.
        var opts = {
          requireVersion: true,
          defaultVersion: "0.0.0"
        };
        // If we specified a name, then we know what we want to get and should
        // pass that into the options. Otherwise, we will use the 'name'
        // attribute from package-source.js.
        if (definiteName) {
          opts["name"] = definiteName;
        }
        packageSource.initFromPackageDir(packageDir, opts);
        if (buildmessage.jobHasMessages())
          return;  // recover by ignoring

        // Now that we have initialized the package from package.js, we know its
        // name.
        var name = packageSource.name;

        // We should only have one package dir for each name; in this case, we
        // are going to take the first one we get (since we preserved the order
        // in which we loaded local package dirs when running this function.)
        if (_.has(self.packages, name))
          return;

        self.packages[name] = {
          packageSource: packageSource,
          packageRecord: {
            name: name,
            maintainers: null,
            lastUpdated: null
          },
          versionRecord: {
            _id: "VID" + self.nextVersionId++,
            packageName: name,
            testName: packageSource.testName,
            version: packageSource.version,
            publishedBy: null,
            description: packageSource.metadata.summary,
            dependencies: packageSource.getDependencyMetadata(),
            source: null,
            lastUpdated: null,
            published: null,
            isTest: packageSource.isTest,
            debugOnly: packageSource.debugOnly,
            containsPlugins: packageSource.containsPlugins()
          }
        };

        // If this is NOT a test package AND it has tests (tests will be
        // marked as test packages by package source, so we will not recurse
        // infinitely), then process that too.
        if (!packageSource.isTest && packageSource.testName) {
          initSourceFromDir(packageSource.sourceRoot, packageSource.testName);
        }
      });
    };

    // Load the package sources for packages and their tests into
    // self.packages.
    //
    // XXX We should make this work with parallel: true; right now it seems to
    // hit node problems.
    buildmessage.forkJoin(
      { 'title': 'Initializing packages', parallel: false },
      self.effectiveLocalPackageDirs,
      function (dir) {
        initSourceFromDir(dir);
      });
  },

  // True if `name` is a local package (is to be loaded via
  // localPackageSearchDirs or addLocalPackage rather than from the package
  // server)
  isLocalPackage: function (name) {
    var self = this;
    self._requireInitialized();

    return _.has(self.packages, name);
  },

  // Add a local package to the catalog. `name` is the name to use for
  // the package and `directory` is the directory that contains the
  // source tree for the package.
  //
  // If a package named `name` exists on the package server, it will
  // be overridden (it will be as if that package doesn't exist on the
  // package server at all). And for now, it's an error to call this
  // function twice with the same `name`.
  // XXX #3006 rewrite this
  addLocalPackage: function (directory) {
    var self = this;
    buildmessage.assertInCapture();
    self._requireInitialized();

    var resolvedPath = path.resolve(directory);
    self.explicitlyAddedLocalPackageDirs.push(resolvedPath);

    // If we were making lots of calls to addLocalPackage, we would
    // want to coalesce the calls to refresh somehow, but I don't
    // think we'll actually be doing that so this should be fine.
    // #CallingRefreshEveryTimeLocalPackagesChange
    self.refresh();
  },

  getPackageSource: function (name) {
    var self = this;
    if (! _.has(self.packages, name))
      return null;
    return self.packages[name].packageSource;
  }
});

exports.LocalCatalog = LocalCatalog;
