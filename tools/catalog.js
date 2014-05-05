var fs = require('fs');
var path = require('path');
var semver = require('semver');
var _ = require('underscore');
var packageClient = require('./package-client.js');
var archinfo = require('./archinfo.js');
var packageCache = require('./package-cache.js');
var PackageSource = require('./package-source.js');
var Unipackage = require('./unipackage.js');
var compiler = require('./compiler.js');
var buildmessage = require('./buildmessage.js');
var tropohouse = require('./tropohouse.js');
var watch = require('./watch.js');
var files = require('./files.js');

var catalog = exports;

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
  self.releaseTracks = null;
  self.releaseVersions = null;

  // Local directories to search for package source trees
  self.localPackageDirs = null;

  // Packages specified by addLocalPackage
  self.localPackages = {}; // package name to source directory

  // All packages found either by localPackageDirs or localPackages
  self.effectiveLocalPackages = {}; // package name to source directory

  // Set this to true if we are not going to connect to the remote package
  // server, and will only use the cached data.json file for our package
  // information. This means that the catalog might be out of date on the latest
  // developments.
  self.offline = null;
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
  //    contain subdirectories, that each contain a source tree for a
  //    package that should override the packages on the package
  //    server. For example, if there is a package 'foo' that we find
  //    through localPackageDirs, then we will ignore all versions of
  //    'foo' that we find through the package server. Directories
  //    that don't exist (or paths that aren't directories) will be
  //    silently ignored.
  // - bootstrapLocalPackageDirs: like 'localPackageDirs', but
  //   containing the packages that we can call 'unipackage.load' to
  //   load the packages that we need to talk to the server. Packages
  //   inside `bootstrapLocalPackageDirs` cannot use troposphere
  //   packages.
  initialize: function (options) {
    var self = this;

    options = options || {};

    var trimPackageDirs = function (packageDirs) {
      // Trim down local package dirs to just those that actually exist
      // (and that are actually directories)
      return _.filter(packageDirs || [], isDirectory);
    };

    var bootstrapPackageDirs = trimPackageDirs(
      options.bootstrapLocalPackageDirs);
    var localPackageDirs = trimPackageDirs(
      options.localPackageDirs);
    var allLocalPackageDirs = bootstrapPackageDirs.concat(localPackageDirs);

    self.localPackageDirs = bootstrapPackageDirs;
    self._recomputeEffectiveLocalPackages();

    // First, initialize the catalog with just the local packages for
    // bootstrapping. This is just enough (at least if we're running
    // from a checkout) that we're able to call unipackage.load to load
    // the packages that we need to talk to the server.
    self.packages = [];
    self.versions = [];
    self.builds = [];
    self.releaseTracks = [];
    self.releaseVersions = [];
    self._addLocalPackageOverrides(true /* setInitialized */);

    // Now we can include options.localPackageDirs. We do this
    // separately from the bootstrapping packages because packages in
    // options.localPackageDirs (app packages, for example) are allowed
    // to use troposphere packages, so we have to be able to talk to the
    // server before we load them.
    self.localPackageDirs = allLocalPackageDirs;
    self._recomputeEffectiveLocalPackages();

    // We don't need to call _addLocalPackageOverrides here; that will
    // be called as part of catalog initialization, which is the next
    // step.

    // OK, now initialize the catalog for real, with both local and
    // package server packages.

    // We should to figure out if we are intending to connect to the package
    // server.
    self.offline = options.offline ? options.offline : false;
    self.refresh(false /* don't load server packages yet */);
  },

  // Refresh the packages in the catalog.
  //
  // If sync is false, this will not synchronize with the remote server, even if
  // the catalog is not in offline mode. (An offline catalog will not sync with
  // the server even if sync is true.) For a lot of meteor commands, we don't
  // need to contact the server. When we do, we can call thsi function manually
  // on the catalog.
  //
  // Prints a warning if `sync` is true and we can't contact the package server.
  refresh: function (sync) {
    var self = this;
    self._requireInitialized();

    var localData = packageClient.loadCachedServerData();
    var allPackageData;
    if (! self.offline && sync) {
      allPackageData = packageClient.updateServerPackageData(localData);
      if (! allPackageData) {
        // If we couldn't contact the package server, use our local data.
        allPackageData = localData.collections;
        // XXX should do some nicer error handling here (return error to
        // caller and let them handle it?)
        process.stderr.write("Warning: could not connect to package server\n");
      }
    } else {
      allPackageData = localData.collections;
    }

    self.initialized = false;
    self.packages = [];
    self.versions = [];
    self.builds = [];
    self.releaseTracks = [];
    self.releaseVersions = [];
    if (allPackageData) {
      self._insertServerPackages(allPackageData);
    }
    self._addLocalPackageOverrides(true /* setInitialized */);
  },

  // Compute self.effectiveLocalPackages from self.localPackageDirs
  // and self.localPackages.
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
  //
  // If _setInitialized is provided and true, then as soon as the
  // metadata for the local packages has been loaded into the catalog,
  // mark the catalog as initialized. This is a bit of a hack.
  //
  // XXX emits buildmessages. are callers expecting that?
  _addLocalPackageOverrides: function (_setInitialized) {
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

    // Load the source code and create Package and Version
    // entries from them. We have to do this before we can run the
    // constraint solver.
    var packageSources = {}; // name to PackageSource

    var initVersionRecordFromSource =  function (packageDir, name) {
      var packageSource = new PackageSource;
      packageSource.initFromPackageDir(name, packageDir);
      packageSources[name] = packageSource;

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

      // Accurate version numbers are of supreme importance, because
      // we use version numbers (of build-time dependencies such as
      // the coffeescript plugin), together with source file hashes
      // and the notion of a repeatable build, to decide when a
      // package build is out of date and trigger a rebuild of the
      // package.
      //
      // The package we have just loaded may declare its version to be
      // 1.2.3, but that doesn't mean it's really the official version
      // 1.2.3 of the package. It only gets that version number
      // officially when it's published to the package server. So what
      // we'd like to do here is give it a version number like
      // '1.2.3+<buildid>', where <buildid> is a hash of everything
      // that's necessary to repeat the build exactly: all of the
      // package's source files, all of the package's build-time
      // dependencies, and the version of the Meteor build tool used
      // to build it.
      //
      // Unfortunately we can't actually compute such a buildid yet
      // since it depends on knowing the build-time dependencies of
      // the package, which requires that we run the constraint
      // solver, which can only be done once we've populated the
      // catalog, which is what we're trying to do right now.
      //
      // So we have a workaround. For local packages we will fake the
      // version in the catalog by setting the buildid to 'local', as
      // in '1.2.3+local'. This is enough for the constraint solver to
      // run, but any code that actually relies on accurate versions
      // (for example, code that checks if a build is up to date)
      // needs to be careful to get the versions not from the catalog
      // but from the actual built Unipackage objects, which will have
      // accurate versions (with precise buildids) even for local
      // packages.
      var version = packageSource.version;
      if (version.indexOf('+') !== -1)
        throw new Error("version already has a buildid?");
      version = version + "+local";

      self.versions.push({
        _id: versionId,
        packageName: name,
        testName: packageSource.testName,
        version: version,
        publishedBy: null,
        earliestCompatibleVersion: packageSource.earliestCompatibleVersion,
        changelog: null, // XXX get actual changelog when we have it?
        description: packageSource.metadata.summary,
        dependencies: packageSource.getDependencyMetadata(),
        source: null,
        lastUpdated: null,
        published: null,
        isTest: packageSource.isTest,
        containsPlugins: packageSource.containsPlugins()
      });

      // Test packages are not allowed to have tests. Any time we recurse into
      // this function, it will be with test marked as true, so recursion
      // will terminate quickly.
      if (!packageSource.isTest && packageSource.testName) {
        self.effectiveLocalPackages[packageSource.testName] = packageSource.sourceRoot;
        initVersionRecordFromSource(packageSource.sourceRoot, packageSource.testName);
      }
    };

    // Add the records for packages and their tests. With underscore, each only
    // runs on the original members of the collection, so it is safe to modify
    // effectiveLocalPackages in initPackageSource (to add test packages).
    _.each(self.effectiveLocalPackages, initVersionRecordFromSource);

    // We have entered records for everything, and we are going to build lazily,
    // so we are done.
    if (_setInitialized)
      self.initialized = true;

    // Save the package sources and the list of all unbuilt packages. We will
    // build them lazily when someone asks for them.
    self.packageSources = packageSources;
    self.unbuilt = _.clone(self.effectiveLocalPackages);
  },

  // Given a version string that may or may not have a build ID, convert it into
  // the catalog's internal format for local versions -- [version
  // number]+local. (for example, 1.0.0+local).
  _getLocalVersion: function (version) {
    return version.split("+")[0] + "+local";
  },

  // Returns the latest unipackage build if the package has already been
  // compiled and built in the directory, and null otherwise.
  _maybeGetUpToDateBuild : function (name) {
    var self = this;
    var sourcePath = self.effectiveLocalPackages[name];
    var buildDir = path.join(sourcePath, '.build.' + name);
    if (fs.existsSync(buildDir)) {
      var unipackage = new Unipackage;
      unipackage.initFromPath(name, buildDir, { buildOfPath: sourcePath });
      if (compiler.checkUpToDate(this.packageSources[name], unipackage)) {
        return unipackage;
      }
    }
    return null;
  },

  // Recursively builds packages, like a boss.
  // It sort of takes in the following:
  //   onStack: stack of packages to be built, to check for circular deps.
  _build : function (name, onStack) {
    var self = this;

    var unipackage = null;

    if (! _.has(self.unbuilt, name)) {
      return;
    }

    delete self.unbuilt[name];


    // Go through the build-time constraints. Make sure that they are built,
    // either because we have built them already, or because we are about to
    // build them.
    var deps = compiler.getBuildOrderConstraints(self.packageSources[name]);
    _.each(deps, function (dep) {

      // Not a local package, so we may assume that it has been built.
      if  (! _.has(self.effectiveLocalPackages, dep.name)) {
        return;
      }

      // Make sure that the version we need for this dependency is actually the
      // right local version. If it is not, then using the local build
      // will not give us the right answer. This should never happen if the
      // constraint solver/catalog are doing their jobs right, but we would
      // rather fail than surprise someone with an incorrect build.
      //
      // The catalog doesn't understand buildID versions and doesn't know about
      // them. We might not even have them yet, so let's strip those out.
      if (self.isLocalPackage(dep.name)) {
        var version = self._getLocalVersion(dep.version);
        var packageVersion =
            self._getLocalVersion(self.packageSources[dep.name].version);
        if (version !== packageVersion) {
          throw new Error("unknown version for local package? " + name);
        }
      }

      // OK, it is a local package. Check to see if this is a circular dependency.
      if (_.has(onStack, dep.name)) {
        // Allow a circular dependency if the other thing is already
        // built and doesn't need to be rebuilt.
        unipackage = self._maybeGetUpToDateBuild(dep.name);
        if (unipackage) {
          return;
        } else {
          buildmessage.error("circular dependency between packages " +
                             name + " and " + dep.name);
          // recover by not enforcing one of the depedencies
          return;
        }
      }

      // Put this on the stack and send recursively into the builder.
      onStack[dep.name] = true;
      self._build(dep.name, onStack);
      delete onStack[dep.name];
    });

    // Now build this package if it needs building
    var sourcePath = self.effectiveLocalPackages[name];
    unipackage = self._maybeGetUpToDateBuild(name);

    if (! unipackage) {
      // Didn't have a build or it wasn't up to date. Build it.
      buildmessage.enterJob({
        title: "building package `" + name + "`",
        rootPath: sourcePath
      }, function () {
        unipackage = compiler.compile(self.packageSources[name]).unipackage;
        if (! buildmessage.jobHasMessages()) {
          // Save the build, for a fast load next time
          try {
            var buildDir = path.join(sourcePath, '.build.'+ name);
            files.addToGitignore(sourcePath, '.build*');
            unipackage.saveToPath(buildDir, { buildOfPath: sourcePath });
          } catch (e) {
            // If we can't write to this directory, we don't get to cache our
            // output, but otherwise life is good.
            if (!(e && (e.code === 'EACCES' || e.code === 'EPERM')))
              throw e;
          }
        }
      });
    }
    // And put a build record for it in the catalog
    var versionId = self.getLatestVersion(name);

    self.builds.push({
      packageName: name,
      architecture: unipackage.architectures().join('+'),
      builtBy: null,
      build: null, // this would be the URL and hash
      versionId: versionId,
      lastUpdated: null,
      buildPublished: null
    });

    // XXX XXX maybe you actually want to, like, save the unipackage
    // in memory into a cache? rather than leaving packageCache to
    // reload it? or maybe packageCache is unified into catalog
    // somehow? sleep on it
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
    self.releaseTracks.push.apply(self.releaseTracks, serverPackageData.releaseTracks);
    self.releaseVersions.push.apply(self.releaseVersions, serverPackageData.releaseVersions);
  },

  _requireInitialized: function () {
    var self = this;

    if (! self.initialized)
      throw new Error("catalog not initialized yet?");
  },

  // Add a local package to the catalog. `name` is the name to use for
  // the package and `directory` is the directory that contains the
  // source tree for the package.
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
    // want to coalesce the calls to refresh somehow, but I don't
    // think we'll actually be doing that so this should be fine.
    // #CallingRefreshEveryTimeLocalPackagesChange
    self._recomputeEffectiveLocalPackages();
    self.refresh(false /* sync */);
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
    self.refresh(false /* sync */);
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
    packageCache.packageCache.refresh();

    // Delete any that are source packages with builds.
    var count = 0;
    _.each(self.effectiveLocalPackages, function (loadPath, name) {
      var buildDir = path.join(loadPath, '.build.' + name);
      files.rm_recursive(buildDir);
    });

    // Now reload them, forcing a rebuild. We have to do this in two
    // passes because otherwise we might end up rebuilding a package
    // and then immediately deleting it.
    _.each(self.effectiveLocalPackages, function (loadPath, name) {
      packageCache.packageCache.loadPackageAtPath(name, loadPath);
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

    // Check local packages first.
    if (_.has(self.effectiveLocalPackages, name)) {

      // If we don't have a build of this package, we need to rebuild it.
      if (_.has(self.unbuilt, name)) {
        self._build(name, {});
      };

      // Return the path.
      return self.effectiveLocalPackages[name];
    }

    if (! version)
      throw new Error(name + " not a local package, and no version specified?");

    var packageDir = tropohouse.packagePath(name, version);
    if (fs.existsSync(packageDir)) {
      return packageDir;
    }
     return null;
  },

  // Returns general (non-version-specific) information about a
  // release track, or null if there is no such release track.
  getReleaseTrack: function (name) {
    var self = this;
    self._requireInitialized();
    return _.findWhere(self.releaseTrack, { name: name });
  },

  // Return information about a particular release version, or null if such
  // release version does not exist.
  getReleaseVersion: function (name, version) {
    var self = this;
    self._requireInitialized();

    var versionRecord =  _.findWhere(self.releaseVersions,
        { name: name,  version: version });

    if (!versionRecord) {
      return null;
    }
    return versionRecord;
  },

  // Return an array with the names of all of the release tracks that we know
  // about, in no particular order.
  getAllReleaseTracks: function () {
    var self = this;
    self._requireInitialized();
    return _.pluck(self.releaseTracks, 'name');
  },

  // Given a release track, returns an array of the versions available for this
  // track, in no particular order. Returns the empty array if the release
  // doesn't exist or doesn't have any versions.
  getReleaseVersions: function (name) {
    var self = this;
    self._requireInitialized();

    var ret = _.pluck(_.where(self.releaseVersions, { name: name }),
                      'version');
    return ret;
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

    var ret = _.pluck(_.where(self.versions, { packageName: name }),
                      'version');
    ret.sort(semver.compare);
    return ret;
  },

  // Return information about a particular version of a package, or
  // null if there is no such package or version.
  getVersion: function (name, version) {
    var self = this;
    self._requireInitialized();

    // The catalog doesn't understand buildID versions and doesn't know about
    // them. Depending on when we build them, we can refer to local packages as
    // 1.0.0+local or 1.0.0+[buildId]. Luckily, we know which packages are
    // local, so just look those up by their local version instead.
    if (self.isLocalPackage(name)) {
      version = self._getLocalVersion(version);
    }

    var versionRecord =  _.findWhere(self.versions, { packageName: name,
                                                      version: version });
    if (!versionRecord) {
      return null;
    }
    return versionRecord;
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

catalog.catalog = new Catalog();
