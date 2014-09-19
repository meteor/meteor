var fs = require('fs');
var path = require('path');
var _ = require('underscore');
var util = require('util');
var packageClient = require('./package-client.js');
var archinfo = require('./archinfo.js');
var packageCache = require('./package-cache.js');
var PackageSource = require('./package-source.js');
var unipackage = require('./unipackage.js');
var compiler = require('./compiler.js');
var buildmessage = require('./buildmessage.js');
var tropohouse = require('./tropohouse.js');
var watch = require('./watch.js');
var files = require('./files.js');
var utils = require('./utils.js');
var BaseCatalog = require('./catalog-base.js').BaseCatalog;
var fiberHelpers = require('./fiber-helpers.js');
var project = require('./project.js');
var Future = require('fibers/future');
var Fiber = require('fibers');

var catalog = exports;

catalog.DEFAULT_TRACK = 'METEOR';


/////////////////////////////////////////////////////////////////////////////////////
//  Official Catalog
/////////////////////////////////////////////////////////////////////////////////////

// The official catalog syncs up with the package server. It doesn't care about
// local packages. When the user wants information about the state of the
// package world (ex: search), we should use this catalog first.
var OfficialCatalog = function () {
  var self = this;

  // We inherit from the BaseCatalog class.
  BaseCatalog.call(self);

  // Set this to true if we are not going to connect to the remote package
  // server, and will only use the cached data.json file for our package
  // information. This means that the catalog might be out of date on the latest
  // developments.
  self.offline = null;

  // The official catalog is the only one with release metadata.
  self.releaseTracks = null;
  self.releaseVersions = null;
};

util.inherits(OfficialCatalog, BaseCatalog);

_.extend(OfficialCatalog.prototype, {
  initialize: function (options) {
    var self = this;
    options = options || {};

    // We should to figure out if we are intending to connect to the package
    // server.
    self.offline = options.offline ? options.offline : false;

    // This is set to an array while refresh() is running; if another refresh()
    // call happens during a yield, instead of doing a second refresh it just
    // waits for the first to finish.
    self._refreshFutures = null;

    // We de-dup overlapping refreshes.  We want to print our Patience message
    // if *any* of the refresh calls are non-silent.
    self._currentRefreshIsLoud = false;

    self._refresh(true);

    self.initialized = true;
  },

  reset: function () {
    var self = this;
    BaseCatalog.prototype.reset.call(self);
    self.releaseTracks = [];
    self.releaseVersions = [];
  },

  _insertServerPackages: function (serverPackageData) {
    var self = this;
    // Insert packages/versions/builds.
    BaseCatalog.prototype._insertServerPackages.call(self, serverPackageData);

    // Now insert release metadata.
    var collections = serverPackageData.collections;

    if (!collections)
      return;

    _.each(
      ['releaseTracks', 'releaseVersions'],
      function (field) {
        self[field].push.apply(self[field], collections[field]);
      });
  },


  _refreshingIsProductive: function () {
    return true;
  },

  refreshInProgress: function () {
    var self = this;
    return self._refreshFiber === Fiber.current;
  },

  // Refresh the packages in the catalog. Print a warning if we cannot connect
  // to the package server.
  //
  // If a refresh is already in progress (which is yielding), it just waits for
  // the in-progress refresh to finish.
  refresh: function (options) {
    var self = this;
    // note: this only needs to be in a capture because it refreshes the
    // complete catalog (which actually uses the build system).  if
    // catalog.complete was refactored to not require a rebuild whenever
    // catalog.official changes, this function wouldn't need
    // buildmessage.assertInCapture any more.
    buildmessage.assertInCapture();
    self._requireInitialized();
    options = options || {};

    if (self._refreshFutures) {
      var f = new Future;
      self._refreshFutures.push(f);
      if (!options.silent) {
        self._currentRefreshIsLoud = true;
      }
      f.wait();
      return;
    }

    self._refreshFutures = [];
    self._refreshFiber = Fiber.current;
    self._currentRefreshIsLoud = !options.silent;

    var patience = new utils.Patience({
      messageAfterMs: 2000,
      message: function () {
        if (self._currentRefreshIsLoud) {
          console.log("Refreshing package metadata. This may take a moment.");
        }
      }
    });
    try {
      var thrownError = null;
      try {
        self._refresh();
        // Force the complete catalog (which is layered on top of our data) to
        // refresh as well.
        catalog.complete.refresh({ forceRefresh: true });
      } catch (e) {
        thrownError = e;
      }
    } finally {
      patience.stop();
    }

    while (self._refreshFutures.length) {
      var fut = self._refreshFutures.pop();
      if (thrownError) {
        // XXX is it really right to throw the same error multiple times?
        fut.throw(thrownError);
      } else {
        fut.return();
      }
    }

    self._refreshFutures = null;
    self._refreshFiber = null;

    if (thrownError)
      throw thrownError;
  },

  // Refresh the packages in the catalog. Prints a warning if we cannot connect
  // to the package server, and intend to.
  _refresh: function (overrideOffline) {
    var self = this;

    var localData = packageClient.loadCachedServerData();
    var allPackageData;
    if (! (self.offline || overrideOffline)) {
      var updateResult = packageClient.updateServerPackageData(localData);
      allPackageData = updateResult.data;
      if (!allPackageData) {
        // If we couldn't contact the package server, use our local data.
        allPackageData = localData;
        // XXX should do some nicer error handling here (return error to
        // caller and let them handle it?)
        process.stderr.write("Warning: could not connect to package server\n");
      }
      if (updateResult.resetData) {
        // Did we reset the data from scratch? Delete packages, which may be
        // bogus.
        //
        // XXX We should actually mark "reset data please" in data.json and not
        // remove it until the wipe step happens, and re-attempt the wipe on
        // program startup, so that killing in the middle of a resync (a slow
        // operation!!!) still wipes packages.
        tropohouse.default.wipeAllPackages();
      }
    } else {
      allPackageData = localData;
    }

    // Reset all collections back to their original state.
    self.reset();

    // Insert the server packages into the catalog.
    if (allPackageData && allPackageData.collections) {
      self._insertServerPackages(allPackageData);
    }
  },

  // Find a release that uses the given version of a tool. See: publish-for-arch
  // in command-packages for more explanation.  Returns information about a
  // particular release version, or null if such release version does not exist.
  getReleaseWithTool: function (toolSpec) {
    var self = this;
    buildmessage.assertInCapture();
    self._requireInitialized();
    return self._recordOrRefresh(function () {
      return _.findWhere(self.releaseVersions, { tool: toolSpec });
    });
  },

  // Returns general (non-version-specific) information about a
  // release track, or null if there is no such release track.
  getReleaseTrack: function (name) {
    var self = this;
    buildmessage.assertInCapture();
    self._requireInitialized();
    return self._recordOrRefresh(function () {
      return _.findWhere(self.releaseTracks, { name: name });
    });
  },

  // Return information about a particular release version, or null if such
  // release version does not exist.
  getReleaseVersion: function (track, version) {
    var self = this;
    buildmessage.assertInCapture();
    self._requireInitialized();
    return self._recordOrRefresh(function () {
      return _.findWhere(self.releaseVersions,
                         { track: track,  version: version });
    });
  },

  // Return an array with the names of all of the release tracks that we know
  // about, in no particular order.
  getAllReleaseTracks: function () {
    var self = this;
    self._requireInitialized();
    return _.pluck(self.releaseTracks, 'name');
  },

  // Given a release track, return all recommended versions for this track, sorted
  // by their orderKey. Returns the empty array if the release track does not
  // exist or does not have any recommended versions.
  getSortedRecommendedReleaseVersions: function (track, laterThanOrderKey) {
    var self = this;
    self._requireInitialized();

    var recommended = _.filter(self.releaseVersions, function (v) {
      if (v.track !== track || !v.recommended)
        return false;
      return !laterThanOrderKey || v.orderKey > laterThanOrderKey;
    });

    var recSort = _.sortBy(recommended, function (rec) {
      return rec.orderKey;
    });
    recSort.reverse();
    return _.pluck(recSort, "version");
  },

  // Returns the default release version: the latest recommended version on the
  // default track. Returns null if no such thing exists (even after syncing
  // with the server, which it only does if there is no eligible release
  // version).
  getDefaultReleaseVersion: function (track) {
    var self = this;
    buildmessage.assertInCapture();
    self._requireInitialized();

    if (!track)
      track = catalog.DEFAULT_TRACK;

    var getDef = function () {
      var versions = self.getSortedRecommendedReleaseVersions(track);
      if (!versions.length)
        return null;
      return {track: track, version: versions[0]};
    };

    return self._recordOrRefresh(getDef);
  }
});

/////////////////////////////////////////////////////////////////////////////////////
//  Constraint Catalog
/////////////////////////////////////////////////////////////////////////////////////

// Unlike the server catalog, the local catalog knows about local packages. This
// is what we use to resolve dependencies. The local catalog does not contain
// full information about teh server's state, because local packages take
// precedence (and we want to optimize retrieval of relevant data). It also
// doesn't bother to sync up to the server, and just relies on the server
// catalog to provide it with the right information through data.json.
var CompleteCatalog = function (options) {
  var self = this;
  options = options || {};

  // Is this the uniload catalog, while running from checkout? In that case,
  // never load anything from the official catalog, never refresh, etc.
  // XXX This is a hack: we should factor out the common code between the
  //     CompleteCatalog and the ostensible CheckoutUniloadCatalog into
  //     a common base class.
  self.forUniload = !!options.forUniload;

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

  // Constraint solver using this catalog.
  self.resolver = null;

  // Fetching patterns in base catalog rely on the catalog limiting the refresh
  // rate, or at least, never enter a loop on refreshing. The 'official' catalog
  // does this through futures, but for now, we can probably just get away with
  // a boolean.
  // XXX: use a future in the future maybe
  self.refreshing = false;
  self.needRefresh = false;

  // See the documentation of the _extraECVs field in ConstraintSolver.Resolver.
  // Maps packageName -> version -> its ECV
  self.forgottenECVs = {};

  // Each complete catalog needs its own package cache.
  self.packageCache = new packageCache.PackageCache(self);

  self.packageSources = null;
  self.built = null;

  // We inherit from the protolog class, since we are a catalog.
  BaseCatalog.call(self);
};

util.inherits(CompleteCatalog, BaseCatalog);

_.extend(CompleteCatalog.prototype, {
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

    // Lastly, let's read through the data.json file and then put through the
    // local overrides.
    self.refresh({initializing: true});
  },

  _refreshingIsProductive: function () {
    var self = this;
    // If this is the normal complete catalog, then sure! Refresh away!
    // If it's the CheckoutUniloadCatalog, then we don't use server packages,
    // so it's not worth it.
    return !self.forUniload;
  },

  reset: function () {
    var self = this;
    BaseCatalog.prototype.reset.call(self);

    self.packageSources = {};
    self.built = {};
    self.forgottenECVs = {};
  },

  // Given a set of constraints, returns a det of dependencies that satisfy the
  // constraint.
  //
  // Calls the constraint solver, if one already exists. If the project
  // currently in use has a versions file, that file will be used as a
  // comprehensive version lock: the returned dependencies will be a subset
  // of the project's dependencies, using the same versions.
  //
  // If no constraint solver has been initialized (probably because we are
  // trying to compile its dependencies), return null. (This interacts with the
  // package loader to redirect to only using local packages, which makes sense,
  // since we must be running from checkout).
  //
  // - constraints: a set of constraints that we are trying to resolve.
  //   XXX: In some format!
  // - resolverOpts: options for the constraint solver. See the resolver.resolve
  //   function in the constraint solver package.
  // - opts: (options for this function)
  //   - ignoreProjectDeps: ignore the dependencies of the project, do not
  //     attempt to use them as the previous versions or expect the final answer
  //     to be a subset.
  //
  // Returns an object mapping a package name to a version, or null.
  resolveConstraints : function (constraints, resolverOpts, opts) {
    var self = this;
    opts = opts || {};
    self._requireInitialized();
    buildmessage.assertInCapture();

    if (self.forUniload) {
      // uniload should always ignore the project: it's essentially loading part
      // of the tool, which shouldn't be affected by your app's dependencies.
      if (!opts.ignoreProjectDeps)
        throw Error("whoa, if for uniload, why not ignoring project?");

      // OK, we're building something while uniload
      var ret = {};
      _.each(constraints, function (constraint) {
        if (_.has(constraint, 'version')) {
          if (constraint.version !== null) {
            throw Error("Uniload specifying version? " + JSON.stringify(constraint));
          }
          delete constraint.version;
        }

        // Constraints for uniload should just be packages with no version
        // constraint and one local version (since they should all be in core).
        if (!_.has(constraint, 'name') ||
            constraint.constraints.length > 1 ||
            constraint.constraints[0].type !== 'any-reasonable') {
          throw Error("Surprising constraint: " + JSON.stringify(constraint));
        }
        if (!_.has(self.versions, constraint.name)) {
          throw Error("Trying to resolve unknown package: " +
                      constraint.name);
        }
        if (_.isEmpty(self.versions[constraint.name])) {
          throw Error("Trying to resolve versionless package: " +
                      constraint.name);
        }
        if (_.size(self.versions[constraint.name]) > 1) {
          throw Error("Too many versions for package: " +
                      constraint.name);
        }
        ret[constraint.name] =
          _.keys(self.versions[constraint.name])[0];
      });
      return ret;
    }

    // OK, since we are the complete catalog, the uniload catalog must be fully
    // initialized, so it's safe to load a resolver if we didn't
    // already. (Putting this off until the first call to resolveConstraints
    // also helps with performance: no need to build this package and load the
    // large mori module unless we actually need it.)
    self.resolver || self._initializeResolver();

    // Looks like we are not going to be able to avoid calling the constraint
    // solver, so let's process the input (constraints) into the correct
    // arguments to the constraint solver.
    //
    // -deps: list of package names that we depend on
    // -constr: constraints of the proper form from parseConstraint in utils.js
    //
    // Weak dependencies are constraints (they constrain the result), but not
    // dependencies.
    var deps = [];
    var constr = [];
    _.each(constraints, function (constraint) {
      constraint = _.clone(constraint);
      if (!constraint.weak) {
        deps.push(constraint.name);
      }
      delete constraint.weak;
      constr.push(constraint);
    });

    // If we are called with 'ignore projectDeps', then we don't even look to
    // see what the project thinks and recalculate everything. Similarly, if the
    // project root path has not been initialized, we are probably running
    // outside of a project, and have nothing to look at for guidance.
    if (!opts.ignoreProjectDeps && project.project &&
         project.project.viableDepSource) {
      // Anything in the project's dependencies was calculated based on a
      // previous constraint solver run, and needs to be taken as absolute truth
      // for now: we can't use any packages that are of different versions from
      // what we've already decided from the project!
      _.each(project.project.getVersions(), function (version, name) {
        constr.push(utils.parseConstraint(name + "@=" + version));
     });
    }

    // Local packages can only be loaded from the version we have the source
    // for: that's a weak exact constraint.
    _.each(self.packageSources, function (packageSource, name) {
      constr.push(utils.parseConstraint(name + "@=" + packageSource.version));
    });

    var patience = new utils.Patience({
      messageAfterMs: 1000,
      message: "Figuring out the best package versions to use. This may take a moment."
    });

    var ret;
    try {
      // Then, call the constraint solver, to get the valid transitive subset of
      // those versions to record for our solution. (We don't just return the
      // original version lock because we want to record the correct transitive
      // dependencies)
      try {
        ret = self.resolver.resolve(deps, constr, resolverOpts);
      } catch (e) {
        // Maybe we only failed because we need to refresh. Try to refresh
        // (unless we already are) and retry.
        if (!self._refreshingIsProductive() ||
            catalog.official.refreshInProgress()) {
          throw e;
        }
        catalog.official.refresh();
        self.resolver || self._initializeResolver();
        ret = self.resolver.resolve(deps, constr, resolverOpts);
      }
    } finally {
      patience.stop();
    }
    if (ret["usedRCs"]) {
      var expPackages = [];
      _.each(ret.answer, function(version, package) {
        if (version.split('-').length > 1 &&
            !_.findWhere(constr,
                { packageName: package, version: version })) {
          expPackages.push({
              name: "  " + package + "@" + version,
              description: self.getVersion(package, version).description
            });
        }
      });
      if (!_.isEmpty(expPackages)) {
        // XXX: Couldn't figure out how to word this better for better tenses.
        process.stderr.write(
          "------------------------------------------------------------ \n");
        process.stderr.write(
          "In order to resolve constraints, we had to use the following\n"+
            "experimental package versions:\n");
        process.stderr.write(utils.formatList(expPackages));
        process.stderr.write(
          "------------------------------------------------------------ \n");

        process.stderr.write("\n");
      }
    }
    return ret.answer;
  },

  // Refresh the packages in the catalog.
  //
  // Reread server data from data.json on disk, then load local overrides on top
  // of that information. Sets initialized to true.
  // options:
  // - forceRefresh: even if there is a future in progress, refresh the catalog
  //   anyway. When we are using hot code push, we may be restarting the app
  //   because of a local package change that impacts that catalog. Don't wait
  //   on the official catalog to refresh data.json, in this case.
  // - watchSet: if provided, any files read in reloading packages will be added
  //   to this set.
  refresh: function (options) {
    var self = this;
    options = options || {};
    buildmessage.assertInCapture();

    // We need to limit the rate of refresh, or, at least, prevent any sort of
    // loops. ForceRefresh will override either one.
    if (!options.forceRefresh && !options.initializing &&
        (catalog.official._refreshFutures || self.refreshing)) {

      return;
    }

    if (options.initializing && !self.forUniload) {
      // If we are doing the top level initialization in main.js, everything
      // sure had better be in a relaxed state, since we're about to hackily
      // steal some data from catalog.official.
      if (self.refreshing)
        throw Error("initializing catalog.complete re-entrantly?");
      if (catalog.official._refreshFutures)
        throw Error("initializing catalog.complete during official refresh?");
    }

    if (self.refreshing) {
      // We're being asked to refresh re-entrantly, maybe because we just
      // updated the official catalog.  Let's not do this now, but make the
      // outer call do it instead.
      // XXX refactoring the catalogs so that the two catalogs share their
      //     data and this one is just an overlay would reduce this wackiness
      self.needRefresh = true;
      return;
    }

    self.refreshing = true;

    try {
      self.reset();

      if (!self.forUniload) {
        if (options.initializing) {
          // It's our first time! Everything ought to be at rest. Let's just
          // steal data (without even a deep clone!) from catalog.official.
          // XXX this is horrible. restructure to have a reference to
          // catalog.official instead.
          self.packages = _.clone(catalog.official.packages);
          self.builds = _.clone(catalog.official.builds);
          _.each(catalog.official.versions, function (versions, name) {
            self.versions[name] = _.clone(versions);
          });
        } else {
          // Not the first time. Slowly load data from disk.
          // XXX restructure this class to just have a reference to
          // catalog.official instead of a copy of its data.
          var localData = packageClient.loadCachedServerData();
          self._insertServerPackages(localData);
        }
      }

      self._recomputeEffectiveLocalPackages();
      var allOK = self._addLocalPackageOverrides(
        { watchSet: options.watchSet });
      self.initialized = true;
      // Rebuild the resolver, since packages may have changed.
      self.resolver = null;
    } finally {
      self.refreshing = false;
    }

    // If we got a re-entrant refresh request, do it now. (But not if we
    // encountered build errors building the packages, since in that case
    // we'd probably just get the same build errors again.)
    if (self.needRefresh && allOK) {
      self.refresh(options);
    }
  },

  _initializeResolver: function () {
    var self = this;
    var uniload = require('./uniload.js');
    var constraintSolverPackage =  uniload.load({
      packages: [ 'constraint-solver']
    })['constraint-solver'];
    self.resolver =
      new constraintSolverPackage.ConstraintSolver.PackagesResolver(self, {
        nudge: function () {
          // This may be a singleton, but the resolver is in a package so it
          // doesn't have access to it.
          utils.Patience.nudge();
        }
      });
  },

  // Compute self.effectiveLocalPackages from self.localPackageDirs
  // and self.localPackages.
  _recomputeEffectiveLocalPackages: function () {
    var self = this;

    self.effectiveLocalPackages = _.clone(self.localPackages);

    // XXX If this is the forUniload catalog, we should only consider
    // uniload.ROOT_PACKAGES and their dependencies. Unfortunately, that takes a
    // fair amount of refactoring (since we don't know dependencies until we
    // start reading them).  So for now, the uniload catalog (in checkout mode)
    // does include information about all the packages in the meteor repo, not
    // just the ones that can be uniloaded. (But it doesn't contain information
    // about app packages!)

    _.each(self.localPackageDirs, function (localPackageDir) {
      if (! utils.isDirectory(localPackageDir))
        return;
      var contents = fs.readdirSync(localPackageDir);
      _.each(contents, function (item) {
        var packageDir = path.resolve(path.join(localPackageDir, item));
        if (! utils.isDirectory(packageDir))
          return;

        // Consider a directory to be a package source tree if it
        // contains 'package.js'. (We used to support unipackages in
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

  getForgottenECVs: function (packageName) {
    var self = this;
    return self.forgottenECVs[packageName];
  },

  // Add all packages in self.effectiveLocalPackages to the catalog,
  // first removing any existing packages that have the same name.
  //
  // XXX emits buildmessages. are callers expecting that?
  _addLocalPackageOverrides: function (options) {
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
      var packageSource = new PackageSource(self);
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
        containsPlugins: packageSource.containsPlugins()
      };
    };

    // Load the package sources for packages and their tests into packageSources.
    _.each(self.effectiveLocalPackages, function (x) {
      initSourceFromDir(x);
     });

    // Remove all packages from the catalog that have the same name as
    // a local package, along with all of their versions and builds.
    var removedVersionIds = {};
    _.each(self.packageSources, function (source, name) {
      if (!_.has(self.versions, name))
        return;
      self.forgottenECVs[name] = {};
      _.each(self.versions[name], function (record) {
        self.forgottenECVs[name][record.version] =
          record.earliestCompatibleVersion;
        removedVersionIds[record._id] = true;
      });
      delete self.versions[name];
    });

    self.builds = _.filter(self.builds, function (build) {
      return ! _.has(removedVersionIds, build.versionId);
    });

    self.packages = _.filter(self.packages, function (pkg) {
      return ! _.has(self.packageSources, pkg.name);
    });

    // Go through the packageSources and create a catalog record for each.
    _.each(self.packageSources, initCatalogRecordsFromSource);

    return allOK;
  },

  // Given a version string that may or may not have a build ID, convert it into
  // the catalog's internal format for local versions -- [version
  // number]+local. (for example, 1.0.0+local).
  _getLocalVersion: function (version) {
    if (version)
      return version.split("+")[0] + "+local";
    return version;
  },

  // Returns the latest unipackage build if the package has already been
  // compiled and built in the directory, and null otherwise.
  _maybeGetUpToDateBuild : function (name, constraintSolverOpts) {
    var self = this;
    buildmessage.assertInCapture();

    var sourcePath = self.packageSources[name].sourceRoot;
    var buildDir = path.join(sourcePath, '.build.' + name);
    if (fs.existsSync(buildDir)) {
      var unip = new unipackage.Unipackage;
      try {
        unip.initFromPath(name, buildDir, { buildOfPath: sourcePath });
      } catch (e) {
        if (!(e instanceof unipackage.OldUnipackageFormatError))
          throw e;
        // Ignore unipackage-pre1 builds
        return null;
      }
      if (compiler.checkUpToDate(
          self.packageSources[name], unip, constraintSolverOpts)) {
        return unip;
      }
    }
    return null;
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
  _build : function (name, onStack,  constraintSolverOpts) {
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
        title: "building package `" + name + "`",
        rootPath: sourcePath
      }, function () {
        unip = compiler.compile(self.packageSources[name], {
          ignoreProjectDeps: constraintSolverOpts.ignoreProjectDeps
        }).unipackage;
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

  // True if `name` is a local package (is to be loaded via
  // localPackageDirs or addLocalPackage rather than from the package
  // server)
  isLocalPackage: function (name) {
    var self = this;
    self._requireInitialized();

    return _.has(self.packageSources, name);
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

  getLocalPackageNames: function () {
    var self = this;
    self._requireInitialized();
    return _.keys(self.packageSources);
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
  }
});

var BuiltUniloadCatalog = function (uniloadDir) {
  var self = this;
  BaseCatalog.call(self);

  // The uniload catalog needs its own package cache.
  self.packageCache = new packageCache.PackageCache(self);
};
util.inherits(BuiltUniloadCatalog, BaseCatalog);

_.extend(BuiltUniloadCatalog.prototype, {
  initialize: function (options) {
    var self = this;
    if (!options.uniloadDir)
      throw Error("no uniloadDir?");
    self.uniloadDir = options.uniloadDir;

    // Make empty data structures for all the things.
    self.reset();

    self._knownPackages = {};
    _.each(fs.readdirSync(options.uniloadDir), function (package) {
      if (fs.existsSync(path.join(options.uniloadDir, package,
                                  'unipackage.json'))) {
        self._knownPackages[package] = true;

        // XXX do we have to also put stuff in self.packages/versions/builds?
        //     probably.
      }
    });

    self.initialized = true;
  },

  resolveConstraints: function () {
    throw Error("uniload resolving constraints? that's wrong.");
  },

  // Ignores version (and constraintSolverOpts) because we just have a bunch of
  // precompiled packages.
  getLoadPathForPackage: function (name, version, constraintSolverOpts) {
    var self = this;
    self._requireInitialized();
    if (_.has(self._knownPackages, name)) {
      return path.join(self.uniloadDir, name);
    }
    return null;
  }

});


// This is the catalog that's used to answer the specific question of "so what's
// on the server?".  It does not contain any local catalogs.  Typically, we call
// catalog.official.refresh() to update data.json.
catalog.official = new OfficialCatalog();

// This is the catalog that's used to actually drive the constraint solver: it
// contains local packages, and since local packages always beat server
// packages, it doesn't contain any information about the server version of
// local packages.
catalog.complete = new CompleteCatalog();

if (files.inCheckout()) {
  catalog.uniload = new CompleteCatalog({forUniload: true});
} else {
  catalog.uniload = new BuiltUniloadCatalog();
}
