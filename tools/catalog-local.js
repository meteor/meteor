var fs = require('fs');
var path = require('path');
var _ = require('underscore');
var packageClient = require('./package-client.js');
var watch = require('./watch.js');
var archinfo = require('./archinfo.js');
var isopack = require('./isopack.js');
var compiler = require('./compiler.js');
var buildmessage = require('./buildmessage.js');
var tropohouse = require('./tropohouse.js');
var files = require('./files.js');
var utils = require('./utils.js');
var catalog = require('./catalog.js');
var packageCache = require('./package-cache.js');
var PackageSource = require('./package-source.js');
var VersionParser = require('./package-version-parser.js');

// LocalCatalog represents the packages located into an application folder
// A default instance of this catalog is created in catalog.js
var LocalCatalog = function (options) {
  var self = this;

  // Package server data. Mostly arrays of objects.
  self.packages = null;
  self.versions = null;  // package name -> version -> object
  self.builds = null;

  // We use the initialization design pattern because it makes it easier to use
  // both of our catalogs as singletons.
  self.initialized = false;
  self.containingCatalog = options ? options.containingCatalog : self;

    // Local directories to search for package source trees
  self.localPackageDirs = null;

  // Packagedirs specified by addLocalPackage: added explicitly through a
  // directory. We mainly use this to allow the user to run test-packages against a
  // package in a specific directory.
  self.localPackages = [];

  // All packages found either by localPackageDirs or localPackages. There is a
  // hierarghy of packages, as detailed below and there can only be one local
  // version of a package at a time. This refers to the package by the specific
  // package directory that we need to process.
  self.effectiveLocalPackages = [];

   // Each catalog needs its own package cache.
  self.packageCache = new packageCache.PackageCache(self.containingCatalog);

  self.packageSources = null;
  self.built = null;
};

_.extend(LocalCatalog.prototype, {
  toString: function () {
    var self = this;
    return "LocalCatalog [localPackageDirs=" + self.localPackageDirs + "]";
  },

  // Initialize the Catalog. This must be called before any other
  // Catalog function.

  // options:
  //  - localPackageDirs: an array of paths on local disk, that
  //    contain subdirectories, that each contain a source tree for a
  //    package that should override the packages on the package
  //    server. For example, if there is a package 'foo' that we find
  //    through localPackageDirs, then we will ignore all versions of
  //    'foo' that we find through the package server. Directories
  //    that don't exist (or paths that aren't directories) will be
  //    silently ignored.
  initialize: function (options) {
    var self = this;
    buildmessage.assertInCapture();

    options = options || {};

    // initializing this here to make it clear that this exists and we have
    // access to it -- a map of names of local packages to their package
    // sources. We call upon this when we compile the package.
    self.packageSources = {};

    // At this point, effectiveLocalPackageDirs is just the local package
    // directories, since we haven't had a chance to add any other local
    // packages. Nonetheless, let's set those.
    self.localPackageDirs =
      _.filter(options.localPackageDirs || [], utils.isDirectory);

    self.refresh({initializing: true});
  },

  // Set all the collections to their initial values, which are mostly
  // blank. This does not set self.initialized -- do that manually in the child
  // class when applicable.
  reset: function () {
    var self = this;

    // Initialize everything to its default version.
    self.packages = [];
    self.versions = {};
    self.builds = [];

    self.packageSources = {};
    self.built = {};
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

    return _.pluck(self.packages, 'name');
  },

  // Returns general (non-version-specific) information about a
  // package, or null if there is no such package.
  getPackage: function (name, options) {
    var self = this;
    buildmessage.assertInCapture();
    self._requireInitialized();
    options = options || {};

    return _.findWhere(self.packages, { name: name });
  },

  // Given a package, returns an array of the versions available for
  // this package (for any architecture), sorted from oldest to newest
  // (according to the version string, not according to their
  // publication date). Returns the empty array if the package doesn't
  // exist or doesn't have any versions.
  //
  // (XXX: If local catalog is just the local overrides, wouldn't this always
  // just return one record?)
  getSortedVersions: function (name) {
    var self = this;
    self._requireInitialized();
    if (!_.has(self.versions, name)) {
      return [];
    }
    var ret = _.keys(self.versions[name]);
    ret.sort(VersionParser.compare);
    return ret;
  },

  // Return information about a particular version of a package, or
  // null if there is no such package or version.
  getVersion: function (name, version) {
    var self = this;
    self._requireInitialized();

    var lookupVersion = function () {
      return _.has(self.versions, name) &&
        _.has(self.versions[name], version) &&
        self.versions[name][version];
    };

    // The catalog doesn't understand buildID versions and doesn't know about
    // them. Depending on when we build them, we can refer to local packages as
    // 1.0.0+local or 1.0.0+[buildId]. Luckily, we know which packages are
    // local, so just look those up by their local version instead.
    // XXX ideally we'd only have isLocalPackage in the complete catalog and
    //     have CompleteCatalog override getVersion, but other things want
    //     to call isLocalPackage, eg maybeDownloadPackageForArchitectures
    //     which has the official package when running make-bootstrap-tarballs
    if (self.isLocalPackage(name)) {
      version = self._getLocalVersion(version);
      // No need to refresh here: if we can't find the local version, refreshing
      // isn't going to help!
      return lookupVersion() || null;
    }

    return lookupVersion() || null;
  },

  // As getVersion, but returns info on the latest version of the
  // package, or null if the package doesn't exist or has no versions.
  getLatestVersion: function (name) {
    var self = this;

    var versions = self.getSortedVersions(name);
    versions.reverse();
    return self.getVersion(name, versions[0]);
  },

  // If this package has any builds at this version, return an array of builds
  // which cover all of the required arches, or null if it is impossible to
  // cover them all (or if the version does not exist).
  getBuildsForArches: function (name, version, arches) {
    var self = this;
    self._requireInitialized();
    buildmessage.assertInCapture();

    var versionInfo = self.getVersion(name, version);
    if (! versionInfo)
      return null;

    // XXX if we have a choice between os and os.mac, this returns a random one.
    //     so in practice we don't really support "maybe-platform-specific"
    //     packages

    var allBuilds = _.where(self.builds, { versionId: versionInfo._id });
    var solution = null;
    utils.generateSubsetsOfIncreasingSize(allBuilds, function (buildSubset) {
      // This build subset works if for all the arches we need, at least one
      // build in the subset satisfies it. It is guaranteed to be minimal,
      // because we look at subsets in increasing order of size.
      var satisfied = _.all(arches, function (neededArch) {
        return _.any(buildSubset, function (build) {
          var buildArches = build.buildArchitectures.split('+');
          return !!archinfo.mostSpecificMatch(neededArch, buildArches);
        });
      });
      if (satisfied) {
        solution = buildSubset;
        return true;  // stop the iteration
      }
      return solution;  // might be null!
    });
  },

  // Unlike the previous, this looks for a build which *precisely* matches the
  // given buildArchitectures string. Also, it takes a versionRecord rather than
  // name/version.
  getBuildWithPreciseBuildArchitectures: function (versionRecord, buildArchitectures) {
    var self = this;
    buildmessage.assertInCapture();
    self._requireInitialized();

    return _.findWhere(self.builds,
                       { versionId: versionRecord._id,
                         buildArchitectures: buildArchitectures });
  },

  getAllBuilds: function (name, version) {
    var self = this;
    self._requireInitialized();
    buildmessage.assertInCapture();

    var versionRecord = self.getVersion(name, version);
    if (!versionRecord)
      return null;

    return _.where(self.builds, { versionId: versionRecord._id });
  },

  // Refresh the packages in the catalog, by re-scanning local packages.
  //
  // options:
  // - watchSet: if provided, any files read in reloading packages will be added
  //   to this set.
  refresh: function (options) {
    var self = this;
    options = options || {};
    buildmessage.assertInCapture();

    self.reset();
    self._recomputeEffectiveLocalPackages();
    var allOK = self._loadLocalPackages({ watchSet: options.watchSet });
    self.initialized = true;
    // Rebuild the resolver, since packages may have changed.
    self.resolver = null;

  },

  // Compute self.effectiveLocalPackages from self.localPackageDirs
  // and self.localPackages.
  _recomputeEffectiveLocalPackages: function () {
    var self = this;

    self.effectiveLocalPackages = _.clone(self.localPackages);

    _.each(self.localPackageDirs, function (localPackageDir) {
      if (! utils.isDirectory(localPackageDir))
        return;
      var contents = fs.readdirSync(localPackageDir);
      _.each(contents, function (item) {
        var packageDir = path.resolve(path.join(localPackageDir, item));
        if (! utils.isDirectory(packageDir))
          return;

        // Consider a directory to be a package source tree if it
        // contains 'package.js'. (We used to support isopacks in
        // localPackageDirs, but no longer.)
        if (fs.existsSync(path.join(packageDir, 'package.js'))) {
          // Let earlier package directories override later package
          // directories.

          // We don't know the name of the package, so we can't deal with
          // duplicates yet. We are going to have to rely on the fact that we
          // are putting these in in order, to be processed in order.
          self.effectiveLocalPackages.push(packageDir);
        }
      });
    });
  },

  _loadLocalPackages: function (options) {
    var self = this;
    options = options || {};
    buildmessage.assertInCapture();

    var allOK = true;

    // Load the package source from a directory. We don't know the names of our
    // local packages until we do this.
    //
    // THIS MUST BE RUN IN LOAD ORDER. Let's say that we have two directories for
    // mongo-livedata. The first one processed by this function will be canonical.
    // The second one will be ignored.
    // XXX: EEP.
    // (note: this is the behavior that we want for overriding things in checkout.
    //  It is not clear that you get good UX if you have two packages with the same
    //  name in your app. We don't check that.)
    var initSourceFromDir =  function (packageDir, definiteName) {
      var packageSource = new PackageSource(self.containingCatalog);
      var broken = false;
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
        if (buildmessage.jobHasMessages()) {
          broken = true;
          allOK = false;
        }
      });

      if (options.watchSet) {
        options.watchSet.merge(packageSource.pluginWatchSet);
        _.each(packageSource.architectures, function (sourceArch) {
          options.watchSet.merge(sourceArch.watchSet);
        });
      }

      // Recover by ignoring, but not until after we've augmented the watchSet
      // (since we want the watchSet to include files with problems that the
      // user may fix!)
      if (broken)
        return;

      // Now that we have initialized the package from package.js, we know its
      // name.
      var name = packageSource.name;

      // We should only have one package dir for each name; in this case, we are
      // going to take the first one we get (since we preserved the order in
      // which we loaded local package dirs when running this function.)
      if (!self.packageSources[name]) {
        self.packageSources[name] = packageSource;

        // If this is NOT a test package AND it has tests (tests will be marked
        // as test packages by package source, so we will not recurse
        // infinitely), then process that too.
        if (!packageSource.isTest && packageSource.testName) {
          initSourceFromDir(packageSource.sourceRoot, packageSource.testName);
        }
      }
    };

    // Given a package-source, create its catalog record.
    var initCatalogRecordsFromSource = function (packageSource) {
      var name = packageSource.name;

      // Create the package record.
      self.packages.push({
        name: name,
        maintainers: null,
        lastUpdated: null
      });

      // This doesn't have great birthday-paradox properties, but we
      // don't have Random.id() here (since it comes from a
      // isopack), and making an index so we can see if a value is
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
      // but from the actual built Isopack objects, which will have
      // accurate versions (with precise buildids) even for local
      // packages.
      var version = packageSource.version;
      if (version.indexOf('+') !== -1)
        throw new Error("version already has a buildid?");
      version = version + "+local";

      self.versions[name] = {};
      self.versions[name][version] = {
        _id: versionId,
        packageName: name,
        testName: packageSource.testName,
        version: version,
        publishedBy: null,
        earliestCompatibleVersion: packageSource.earliestCompatibleVersion,
        description: packageSource.metadata.summary,
        dependencies: packageSource.getDependencyMetadata(),
        source: null,
        lastUpdated: null,
        published: null,
        isTest: packageSource.isTest,
        debugOnly: packageSource.debugOnly,
        containsPlugins: packageSource.containsPlugins()
      };
    };

    // Load the package sources for packages and their tests into packageSources.
    // XXX: We should make this work with parallel: true; right now it seems to hit node problems
    buildmessage.forkJoin({ 'title': 'Initializing packages', parallel: false }, self.effectiveLocalPackages, function (x) {
      initSourceFromDir(x);
    });

    // Go through the packageSources and create a catalog record for each.
    _.each(self.packageSources, initCatalogRecordsFromSource);

    return allOK;
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
  // we asked for. This is to support isopack loader not having a version
  // manifest.
  getLoadPathForPackage: function (name, version, constraintSolverOpts) {
    var self = this;
    self._requireInitialized();
    buildmessage.assertInCapture();
    constraintSolverOpts =  constraintSolverOpts || {};

    // Check local packages first.
    if (_.has(self.packageSources, name)) {

      // If we don't have a build of this package, we need to rebuild it.
      self._build(name, {}, constraintSolverOpts);

      // Return the path.
      return self.packageSources[name].sourceRoot;
    }

    if (! version) {
      throw new Error(name + " not a local package, and no version specified?");
    }

    var packageDir = tropohouse.default.packagePath(name, version);
    if (fs.existsSync(packageDir)) {
      return packageDir;
    }
     return null;
  },

  getLocalPackageNames: function () {
    var self = this;
    self._requireInitialized();
    return _.keys(self.packageSources);
  },

  // Rebuild all source packages in our search paths. If two packages
  // have the same name only the one that we would load will get
  // rebuilt.
  //
  // If namedPackages is provided, it is an array of the only packages that need
  // to be rebuilt.
  //
  // Returns a count of packages rebuilt.
  rebuildLocalPackages: function (namedPackages) {
    var self = this;
    self._requireInitialized();
    buildmessage.assertInCapture();

    // Clear any cached builds in the package cache.
    self.packageCache.refresh();

    if (namedPackages) {
      var bad = false;
      _.each(namedPackages, function (namedPackage) {
        if (!_.has(self.packageSources, namedPackage)) {
          buildmessage.enterJob(
            { title: "rebuilding " + namedPackage }, function () {
              buildmessage.error("unknown package");
            });
          bad = true;
        }
      });
      if (bad)
        return 0;
    }

    // Go through the local packages and remove all of their build
    // directories. Now, no package will be up to date and all of them will have
    // to be rebuilt.
    var count = 0;
    _.each(self.packageSources, function (packageSource, name) {
      var loadPath = packageSource.sourceRoot;
      if (namedPackages && !_.contains(namedPackages, name))
        return;
      var buildDir = path.join(loadPath, '.build.' + name);
      files.rm_recursive(buildDir);
    });

    // Now, go (again) through the local packages and ask the packageCache to
    // load each one of them. Since the packageCache will not find any old
    // builds (and have no cache), it will be forced to recompile them.
    _.each(self.packageSources, function (packageSource, name) {
      var loadPath = packageSource.sourceRoot;
      if (namedPackages && !_.contains(namedPackages, name))
        return;
      self.packageCache.loadPackageAtPath(name, loadPath);
      count ++;
    });

    return count;
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
        watch.readAndWatchFile(watchSet,
                               path.join(packageDir, p, 'isopack.json'));
      });
    });
  },

    // True if `name` is a local package (is to be loaded via
  // localPackageDirs or addLocalPackage rather than from the package
  // server)
  isLocalPackage: function (name) {
    var self = this;
    self._requireInitialized();

    return _.has(self.packageSources, name);
  },

    // Add a local package to the catalog. `name` is the name to use for
  // the package and `directory` is the directory that contains the
  // source tree for the package.
  //
  // If a package named `name` exists on the package server, it will
  // be overridden (it will be as if that package doesn't exist on the
  // package server at all). And for now, it's an error to call this
  // function twice with the same `name`.
  addLocalPackage: function (directory) {
    var self = this;
    buildmessage.assertInCapture();
    self._requireInitialized();

    var resolvedPath = path.resolve(directory);
    self.localPackages.push(resolvedPath);

    // If we were making lots of calls to addLocalPackage, we would
    // want to coalesce the calls to refresh somehow, but I don't
    // think we'll actually be doing that so this should be fine.
    // #CallingRefreshEveryTimeLocalPackagesChange
    self._recomputeEffectiveLocalPackages();
    self.refresh();
  },

  // Recursively builds packages. Takes a package, builds its dependencies, then
  // builds the package. Sends the built package to the package cache, to be
  // pre-cached for future reference. Puts the build record in the built records
  // collection.
  //
  // Takes in the following arguments:
  //
  // - name: name of the package
  // - onStack: stack of packages to be built in this round. Since we are
  //   building packages recursively, we want to pass the stack around to check
  //   for circular dependencies.
  //
  // Why does this happen in the catalog and not, for example, the package
  // cache? If we build in package cache, we need to send the record over to the
  // catalog. If we build in catalog, we need to send the package over to
  // package cache. It could go either way, but since a lot of the information
  // that we use is in the catalog already, we build it here.
  _build: function (name, onStack,  constraintSolverOpts) {
    var self = this;
    buildmessage.assertInCapture();

    var unip = null;

    if (_.has(self.built, name)) {
      return;
    }

    self.built[name] = true;

    // Go through the build-time constraints. Make sure that they are built,
    // either because we have built them already, or because we are about to
    // build them.
    var deps = compiler.getBuildOrderConstraints(
      self.packageSources[name],
      constraintSolverOpts);

    _.each(deps, function (dep) {

      // We don't need to build non-local packages. It has been built. Return.
      if  (!self.isLocalPackage(dep.name)) {
        return;
      }

      // Make sure that the version we need for this dependency is actually the
      // right local version. If it is not, then using the local build will not
      // give us the right answer. This should never happen!... but we would
      // rather fail than surprise someone with an incorrect build.
      //
      // The catalog doesn't understand buildID versions, so let's strip out the
      // buildID.
      var version = self._getLocalVersion(dep.version);
      var packageVersion =
            self._getLocalVersion(self.packageSources[dep.name].version);
      if (version !== packageVersion) {
        throw new Error("unknown version for local package? " + name);
      }

      // We have the right package. Let's make sure that this is not a circular
      // dependency that we can't resolve.
      if (_.has(onStack, dep.name)) {
        // Allow a circular dependency if the other thing is already
        // built and doesn't need to be rebuilt.
        unip = self._maybeGetUpToDateBuild(dep.name, constraintSolverOpts);
        if (unip) {
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
      self._build(dep.name, onStack, constraintSolverOpts);
      delete onStack[dep.name];
    });

    // Now build this package if it needs building
    var sourcePath = self.packageSources[name].sourceRoot;
    unip = self._maybeGetUpToDateBuild(name, constraintSolverOpts);

    if (! unip) {
      // Didn't have a build or it wasn't up to date. Build it.
      buildmessage.enterJob({
        title: "Building package `" + name + "`",
        rootPath: sourcePath
      }, function () {
        unip = compiler.compile(self.packageSources[name], {
          ignoreProjectDeps: constraintSolverOpts.ignoreProjectDeps
        }).isopack;
        if (! buildmessage.jobHasMessages()) {
          // Save the build, for a fast load next time
          try {
            var buildDir = path.join(sourcePath, '.build.'+ name);
            files.addToGitignore(sourcePath, '.build*');
            unip.saveToPath(buildDir, {
              buildOfPath: sourcePath,
              catalog: self
            });
          } catch (e) {
            // If we can't write to this directory, we don't get to cache our
            // output, but otherwise life is good.
            if (!(e && (e.code === 'EACCES' || e.code === 'EPERM')))
              throw e;
          }
        }
      });
    }
    // And put a build record for it in the catalog. There is only one version
    // for this package!
    var versionId = _.values(self.versions[name])._id;

    // XXX why isn't this build just happening through the package cache
    // directly?
    self.packageCache.cachePackageAtPath(name, sourcePath, unip);

    self.builds.push({
      buildArchitectures: unip.buildArchitectures(),
      builtBy: null,
      build: null, // this would be the URL and hash
      versionId: versionId,
      lastUpdated: null,
      buildPublished: null
    });
  },


  // Given a version string that may or may not have a build ID, convert it into
  // the catalog's internal format for local versions -- [version
  // number]+local. (for example, 1.0.0+local).
  _getLocalVersion: function (version) {
    if (version)
      return version.split("+")[0] + "+local";
    return version;
  },

  // Returns the latest isopack build if the package has already been
  // compiled and built in the directory, and null otherwise.
  _maybeGetUpToDateBuild: function (name, constraintSolverOpts) {
    var self = this;
    buildmessage.assertInCapture();

    var sourcePath = self.packageSources[name].sourceRoot;
    var buildDir = path.join(sourcePath, '.build.' + name);
    if (fs.existsSync(buildDir)) {
      var unip = new isopack.Isopack;
      try {
        unip.initFromPath(name, buildDir, { buildOfPath: sourcePath });
      } catch (e) {
        if (!(e instanceof isopack.OldIsopackFormatError))
          throw e;
        // Ignore isopack-pre1 builds
        return null;
      }
      if (compiler.checkUpToDate(
          self.packageSources[name], unip, constraintSolverOpts)) {
        return unip;
      }
    }
    return null;
  }
});

exports.LocalCatalog = LocalCatalog;
