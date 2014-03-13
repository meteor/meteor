var fs = require('fs');
var path = require('path');
var semver = require('semver');
var _ = require('underscore');
var packageClient = require('./package-client.js');
var archinfo = require('./archinfo.js');
var packageCache = require('./package-cache.js');
var tropohouse = require('./tropohouse.js');

var isDirectory = function (dir) {
  try {
    // use stat rather than lstat since symlink to dir is OK
    var stats = fs.statSync(dir);
  } catch (e) {
    return false;
  }
  return stats.isDirectory();
};

// Use this class to query the metadata for all of the packages that
// we know about (including packages on the package server that we
// haven't actually download yet).
//
var Catalog = function () {
  var self = this;

  // The catalog cannot be used until it is initialized by calling
  // initialize(). We use this pattern, rather than expecting
  // arguments to the constructor, to make it easier to use catalog as
  // a singleton.
  self.initialized = false;

  // Package server data. Arrays of objects.
  self.packages = null;
  self.versions = null;
  self.builds = null;

  // Local directories to search for packages
  self.localPackageDirs = null;

  // Packages specified by addLocalPackage
  self.localPackages = {}; // package name to package directory

  // All packages found either by localPackageDirs or localPackages
  self.effectiveLocalPackages = {}; // package name to package directory
};

_.extend(Catalog.prototype, {
  // Initialize the Catalog. This must be called before any other
  // Catalog function.
  //
  // It will try to talk to the network to synchronize our package
  // list with the package server.
  //
  // options:
  //  - localPackageDirs: an array of paths on local disk, that
  //    contain subdirectories, that each contain a package that
  //    should override the packages on the package server. For
  //    example, if there is a package 'foo' that we find through
  //    localPackageDirs, then we will ignore all versions of 'foo'
  //    that we find through the package server. Directories that
  //    don't exist (or paths that aren't directories) will be
  //    silently ignored.
  initialize: function (options) {
    var self = this;

    options = options || {};

    // Trim down localPackageDirs to just those that actually exist
    // (and that are actually directories)
    self.localPackageDirs = _.filter(options.localPackageDirs || [],
                                     isDirectory);
    self._recomputeEffectiveLocalPackages();

    // First, initialize the catalog with just the local
    // packages. This is just enough (at least if we're running from a
    // checkout) that we're able to call unipackage.load to load the
    // packages that we need to talk to the server.
    self.packages = [];
    self.versions = [];
    self.builds = [];
    self._addLocalPackageOverrides();
    self.initialized = true;

    // OK, now initialize the catalog for real, with both local and
    // package server packages.
    self._refresh(true);
  },

  // Set sync to true to try to synchronize from the package server.
  _refresh: function (sync) {
    var self = this;
    self._requireInitialized();

    var serverPackageData = packageClient.loadPackageData(sync);

    self.initialized = false;
    self.packages = [];
    self.versions = [];
    self.builds = [];
    self._insertServerPackages(serverPackageData);
    self._addLocalPackageOverrides();
    self.initialized = true;
  },

  // Compute self.effectiveLocalPackages from self.localPackageDirs
  // and self.localPackageDirs.
  _recomputeEffectiveLocalPackages: function () {
    var self = this;

    self.effectiveLocalPackages = {};

    _.each(self.localPackageDirs, function (localPackageDir) {
      if (! isDirectory(localPackageDir))
        return;
      var contents = fs.readdirSync(localPackageDir);
      _.each(contents, function (item) {
        var packageDir = path.resolve(path.join(localPackageDir, item));
        if (! isDirectory(packageDir))
          return;

        // Consider a directory to be a package source tree if it
        // contains 'package.js'. (We used to support unipackages in
        // localPackageDirs, but no longer.)
        if (fs.existsSync(path.join(packageDir, 'package.js'))) {
          // Let earlier package directories override later package
          // directories.

          // XXX XXX for now, get the package name from the
          // directory. in a future refactor, should instead build the
          // package right here and get the name from the (not yet
          // added) 'name' attribute in package.js.
          if (! _.has(self.effectiveLocalPackages, item))
            self.effectiveLocalPackages[item] = packageDir;
        }
      });
    });

    _.extend(self.effectiveLocalPackages, self.localPackages);
  },

  // Add all packages in self.effectiveLocalPackages to the catalog,
  // first removing any existing packages that have the same name.
  _addLocalPackageOverrides: function () {
    var self = this;

    // Remove all packages from the catalog that have the same name as
    // a local package, along with all of their versions and builds.
    var removedVersionIds = {};
    self.versions = _.filter(self.versions, function (version) {
      if (_.has(self.effectiveLocalPackages, version.packageName)) {
        // Remove this one
        removedVersionIds[version._id] = true;
        return false;
      }
      return true;
    });

    self.builds = _.filter(self.builds, function (build) {
      return ! _.has(removedVersionIds, build.versionId);
    });

    self.packages = _.filter(self.packages, function (pkg) {
      return ! _.has(self.effectiveLocalPackages, pkg.name);
    });

    // Now add our local packages to the catalog.
    _.each(self.effectiveLocalPackages, function (packageDir, name) {
      // Load the package.
      var pkg = packageCache.loadPackageAtPath(name, packageDir);

      // Synthesize records based on it and insert them in the
      // catalog.
      self.packages.push({
        name: name,
        maintainers: null,
        lastUpdated: null
      });

      // This doesn't have great birthday-paradox properties, but we
      // don't have Random.id() here (since it comes from a
      // unipackage), and making an index so we can see if a value is
      // already in use would complicated the code. Let's take the bet
      // that by the time we have enough local packages that this is a
      // problem, we either will have made tools into a star, or we'll
      // have made Catalog be backed by a real database.
      var versionId = "local-" + Math.floor(Math.random() * 1000000000);

      self.versions.push({
        _id: versionId,
        packageName: name,
        version: pkg.version,
        publishedBy: null,
        earliestCompatibleVersion: pkg.earliestCompatibleVersion,
        changelog: null, // XXX get actual changelog when we have it?
        description: pkg.metadata.summary,
        dependencies: pkg.getDependencyMetadata(),
        source: null,
        lastUpdated: null,
        published: null
      });

      self.builds.push({
        packageName: name,
        architecture: pkg.architectures().join('+'),
        builtBy: null,
        build: null, // this would be the URL and hash
        versionId: versionId,
        lastUpdated: null,
        buildPublished: null
      });
    });
  },

  // serverPackageData is a description of the packages available from
  // the package server, as returned by
  // packageClient.loadPackageData. Add all of those packages to the
  // catalog without checking for duplicates.
  _insertServerPackages: function (serverPackageData) {
    var self = this;

    self.packages.push.apply(self.packages, serverPackageData.packages);
    self.versions.push.apply(self.versions, serverPackageData.versions);
    self.builds.push.apply(self.builds, serverPackageData.builds);
  },

  _requireInitialized: function () {
    var self = this;

    if (! self.initialized)
      throw new Error("catalog not initialized yet?");
  },

  // Add a local package to the catalog. `name` is the name to use for
  // the package and `directory` is the directory that contains either
  // its source or an unpacked unipackage.
  //
  // If a package named `name` exists on the package server, it will
  // be overridden (it will be as if that package doesn't exist on the
  // package server at all). And for now, it's an error to call this
  // function twice with the same `name`.
  addLocalPackage: function (name, directory) {
    var self = this;
    self._requireInitialized();

    var resolvedPath = path.resolve(directory);
    if (_.has(self.localPackages, name) &&
        self.localPackages[name] !== resolvedPath) {
      throw new Error("Duplicate local package '" + name + "'");
    }
    self.localPackages[name] = resolvedPath;

    // If we were making lots of calls to addLocalPackage, we would
    // want to coalesce the calls to _refresh somehow, but I don't
    // think we'll actually be doing that so this should be fine.
    // #CallingRefreshEveryTimeLocalPackagesChange
    self._recomputeEffectiveLocalPackages();
    self._refresh(false /* sync */);
  },

  // Reverse the effect of addLocalPackage.
  removeLocalPackage: function (name) {
    var self = this;
    self._requireInitialized();

    if (! _.has(self.localPackages, name))
      throw new Error("no such local package?");
    delete self.localPackages[name];

    // see #CallingRefreshEveryTimeLocalPackagesChange
    self._recomputeEffectiveLocalPackages();
    self._refresh(false /* sync */);
  },

  // True if `name` is a local package (is to be loaded via
  // localPackageDirs or addLocalPackage rather than from the package
  // server)
  isLocalPackage: function (name) {
    var self = this;
    self._requireInitialized();

    return _.has(self.effectiveLocalPackages, name);
  },

  // Register local package directories with a watchSet. We want to know if a
  // package is created or deleted, which includes both its top-level source
  // directory and its main package metadata file.
  //
  // This will watch the local package directories that are in effect when the
  // function is called.  (As set by the most recent call to
  // setLocalPackageDirs.)
  watchLocalPackageDirs: function (watchSet) {
    var self = this;
    self._requireInitialized();

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

  // Rebuild all source packages in our search paths. If two packages
  // have the same name only the one that we would load will get
  // rebuilt.
  //
  // Returns a count of packages rebuilt.
  rebuildLocalPackages: function () {
    var self = this;
    self._requireInitialized();

    // Clear any cached builds in the package cache.
    packageCache.refresh();

    // Delete any that are source packages with builds.
    var count = 0;
    _.each(self.effectiveLocalPackages, function (loadPath, name) {
      var buildDir = path.join(loadPath, '.build');
      files.rm_recursive(loadPath);
    });

    // Now reload them, forcing a rebuild. We have to do this in two
    // passes because otherwise we might end up rebuilding a package
    // and then immediately deleting it.
    _.each(self.effectiveLocalPackages, function (loadPath, name) {
      packageCache.loadPackageAtPath(name, loadPath, { throwOnError: false });
      count ++;
    });

    return count;
  },

  // Given a name and a version of a package, return a path on disk
  // from which we can load it. If we don't have it on disk (we
  // haven't downloaded it, or it just plain doesn't exist in the
  // catalog) return null.
  //
  // Doesn't download packages. Downloading should be done at the time
  // that .meteor/versions is updated.
  //
  // HACK: Version can be null if you are certain that the package is to be
  // loaded from local packages. In the future, version should always be
  // required and we should confirm that the version on disk is the version that
  // we asked for. This is to support unipackage loader not having a version
  // manifest.
  getLoadPathForPackage: function (name, version) {
    var self = this;
    self._requireInitialized();

    if (_.has(self.effectiveLocalPackages, name)) {
      return self.effectiveLocalPackages[name];
    }

    if (! version)
      throw new Error(name + " not a local package, and no version specified?");

    return tropohouse.packagePath(name, version);
  },

  // Return an array with the names of all of the packages that we
  // know about, in no particular order.
  getAllPackageNames: function () {
    var self = this;
    self._requireInitialized();

    return _.pluck(self.packages, 'name');
  },

  // Returns general (non-version-specific) information about a
  // package, or null if there is no such package.
  getPackage: function (name) {
    var self = this;
    self._requireInitialized();
    return _.findWhere(self.packages, { name: name });
  },

  // Given a package, returns an array of the versions available for
  // this package (for any architecture), sorted from oldest to newest
  // (according to the version string, not according to their
  // publication date). Returns the empty array if the package doesn't
  // exist or doesn't have any versions.
  getSortedVersions: function (name) {
    var self = this;
    self._requireInitialized();

    var ret = _.where(self.versions, { packageName: name }).pluck('version');
    ret.sort(semver.compare);
    return ret;
  },

  // Return information about a particular version of a package, or
  // null if there is no such package or version.
  getVersion: function (name, version) {
    var self = this;
    self._ensureLoaded();
    return _.findWhere(self.versions, { packageName: name,
                                        version: version });
  },

  // As getVersion, but returns info on the latest version of the
  // package, or null if the package doesn't exist or has no versions.
  getLatestVersion: function (name) {
    var self = this;
    self._requireInitialized();

    var versions = self.getSortedVersions(name);
    if (versions.length === 0)
      return null;
    return self.getVersion(name, versions[versions.length - 1]);
  },

  // If this package has any builds at this version, return an array of builds
  // which cover all of the required arches, or null if it is impossible to
  // cover them all (or if the version does not exist).
  getBuildsForArches: function (name, version, arches) {
    var self = this;
    self._requireInitialized();

    var versionInfo = self.getVersion(name, version);
    if (! versionInfo)
      return null;

    // XXX this uses a greedy algorithm that might decide, when we're looking
    // for ["browser", "os.mac"] that we should download browser+os.linux to
    // satisfy browser and browser+os.mac to satisfy os.mac.  This is not
    // optimal, but on the other hand you might want the linux one later anyway
    // for deployment.
    // XXX if we have a choice between os and os.mac, this returns a random one.
    //     so in practice we don't really support "maybe-platform-specific"
    //     packages

    var neededArches = {};
    _.each(arches, function (arch) {
      neededArches[arch] = true;
    });

    var buildsToUse = [];
    var allBuilds = _.where(self.builds, { versionId: versionInfo._id });
    for (var i = 0; i < allBuilds.length && !_.isEmpty(neededArches); ++i) {
      var build = allBuilds[i];
      // XXX why isn't this a list in the DB?  I guess because of the unique
      // index?
      var buildArches = build.architecture.split('+');
      var usingThisBuild = false;
      _.each(neededArches, function (ignored, neededArch) {
        if (archinfo.mostSpecificMatch(neededArch, buildArches)) {
          // This build gives us something we need! We don't need it any
          // more. (It is safe to delete keys of something you are each'ing over
          // because _.each internally is doing an iteration over _.keys.)
          delete neededArches[neededArch];
          if (! usingThisBuild) {
            usingThisBuild = true;
            buildsToUse.push(build);
            // XXX this should probably be denormalized in the DB
            build.version = version;
          }
        }
      });
    }

    if (_.isEmpty(neededArches))
      return buildsToUse;
    // We couldn't satisfy it!
    return null;
  }
});

module.exports = new Catalog();
