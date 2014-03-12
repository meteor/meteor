var fs = require('fs');
var path = require('path');
var semver = require('semver');
var _ = require('underscore');
var packageClient = require('./package-client.js');
var archinfo = require('./archinfo.js');
var packageCache = require('./package-cache.js');

// Use this class to query the metadata for all of the packages that
// we know about (including packages on the package server that we
// haven't actually download yet).
//
var Catalog = function () {
  var self = this;

  self.loaded = false; //#CatalogLazyLoading

  // Package server data
  self.packages = null;
  self.versions = null;
  self.builds = null;

  // Trim down localPackageDirs to just those that actually exist (and
  // that are actually directories)
  self.localPackageDirs = [];

  // Packages specified by addLocalPackage
  self.localPackages = {}; // package name to package directory

  // All packages found either by localPackageDirs or localPackages
  self.effectiveLocalPackages = {}; // package name to package directory
};

_.extend(Catalog.prototype, {

  // Set the list of directories to scan for local pacakges. This will override
  // any packages by the same name found in the package server catalog at any
  // version.
  //
  // 'localPackageDirs' is an array of paths on local disk, that contain
  // subdirectories, that each contain a package that should override the
  // packages on the package server. For example, if there is a package 'foo'
  // that we find through localPackageDirs, then we will ignore all versions of
  // 'foo' that we find through the package server. Directories that don't exist
  // (or paths that aren't directories) will be silently ignored.
  setLocalPackageDirs: function (localPackageDirs) {
    var self = this;
    self.localPackageDirs = _.filter(localPackageDirs, isDirectory);
    self.refresh();
  },

  // #CatalogLazyLoading
  // Currently, packageClient.loadPackageData() talks to the network
  // (because it implicitly syncs). Since Catalog is part of the
  // release, we create it very early, before the release is set up
  // and therefore before we can load unipackages, which is necessary
  // to talk to the network. So defer actually calling loadPackageData
  // until we actually begin using the catalog.
  //
  // In the future, a better solution might be to make syncing
  // explicit rather than a side effect of loadPackageData?
  _ensureLoaded: function () {
    var self = this;
    if (self.loaded)
      return;
    self.refresh();
  },

  // XXX refresh() needs to be called by at least some of the
  // callsites that call library.refresh()
  refresh: function () {
    var self = this;

    // Get packages from package server
    // XXX this syncs with the network. probably should rethink that
    // so that every time a file changes in development mode we don't resync
    var collections = packageClient.loadPackageData();
    self.packages = collections.packages;
    self.versions = collections.versions;
    self.builds = collections.builds;

    // Find local packages that override packages from the package server
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

    // Construct metadata for the local packages and load them into
    // the collections, shadowing any versions of those packages from
    // the package server.
    _.each(self.effectiveLocalPackages, function (packageDir, name) {
      // Load the package
      var pkg = packageCache.loadPackageAtPath(name, packageDir);

      // Hide any versions from the package server
      self.versions.find({ packageName: name }).forEach(function (versionInfo) {
        self.builds.remove({ versionId: versionInfo._id });
      });
      self.versions.remove({ packageName: name });
      self.packages.remove({ name: name });

      // Insert our local version
      self.packages.insert({
        name: name,
        maintainers: null,
        lastUpdated: null
      });
      var versionId = self.versions.insert({
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
      self.builds.insert({
        packageName: name,
        architecture: pkg.architectures().join('+'),
        builtBy: null,
        build: null, // this would be the URL and hash
        versionId: versionId,
        lastUpdated: null,
        buildPublished: null
      });
    });

    // Done!
    self.loaded = true;
  },

  // Add a local package to the catalog. `name` is the name to use for
  // the package and `directory` is the directory that contains either
  // its source or an unpacked unipackage.
  //
  // If a package named `name` exists on the package server, it will
  // be overridden (it will be as if that package doesn't exist on the
  // package server at all). And for now, it's an error to call this
  // function twice with the same `name`.
  //
  // IMPORTANT: This will not take effect until the next call to
  // refresh().
  addLocalPackage: function (name, directory) {
    var self = this;

    var resolvedPath = path.resolve(directory);
    if (_.has(self.localPackages, name) &&
        self.localPackages[name] !== resolvedPath) {
      throw new Error("Duplicate override for package '" + name + "'");
    }
    self.localPackages[name] = resolvedPath;
  },

  // XXX implement removeLocalPackage
  // XXX make callers of override/removeOverride call
  // addLocalPackage/removeLocalPackage, and remember to call refresh()

  // True if `name` is a local package (is to be loaded via
  // localPackageDirs or addLocalPackage rather than from the package
  // server)
  isLocalPackage: function (name) {
    var self = this;
    self._ensureLoaded();

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
  getLoadPathForPackage: function (name, version) {
    var self = this;

    if (_.has(self.effectiveLocalPackages, name)) {
      // XXX should confirm that the version on disk actually matches
      // the requested version
      return self.effectiveLocalPackages[name];
    }

    return tropohouse.packagePath(name, version);
  },

  // Return an array with the names of all of the packages that we
  // know about, in no particular order.
  getAllPackageNames: function () {
    var self = this;
    self._ensureLoaded();

    var ret = [];
    self.packages.find().forEach(function (packageInfo) {
      ret.push(packageInfo.name);
    });
    return ret;
  },

  // Returns general (non-version-specific) information about a
  // package, or null if there is no such package.
  getPackage: function (name) {
    var self = this;
    self._ensureLoaded();
    return self.packages.findOne({ name: name });
  },

  // Given a package, returns an array of the versions available for
  // this package (for any architecture), sorted from oldest to newest
  // (according to the version string, not according to their
  // publication date). Returns the empty array if the package doesn't
  // exist or doesn't have any versions.
  getSortedVersions: function (name) {
    var self = this;
    self._ensureLoaded();

    var cursor = self.versions.find({ packageName: name },
                                    { fields: { version: 1 }});
    var ret = _.pluck(cursor.fetch(), 'version');
    ret.sort(semver.compare);
    return ret;
  },

  // Return information about a particular version of a package, or
  // null if there is no such package or version.
  getVersion: function (name, version) {
    var self = this;
    self._ensureLoaded();
    return self.versions.findOne({ packageName: name,
                                   version: version });
  },

  // As getVersion, but returns info on the latest version of the
  // package, or null if the package doesn't exist or has no versions.
  getLatestVersion: function (name) {
    var self = this;
    self._ensureLoaded();

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
    self._ensureLoaded();

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
    var allBuilds = self.builds.find({ versionId: versionInfo._id }).fetch();
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
          if (!usingThisBuild) {
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

// XXX copied from library.js
var isDirectory = function (dir) {
  try {
    // use stat rather than lstat since symlink to dir is OK
    var stats = fs.statSync(dir);
  } catch (e) {
    return false;
  }
  return stats.isDirectory();
};

module.exports = new Catalog();
