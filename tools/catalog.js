var fs = require('fs');
var path = require('path');
var _ = require('underscore');
var util = require('util');
var buildmessage = require('./buildmessage.js');
var tropohouse = require('./tropohouse.js');
var packageCache = require('./package-cache.js');
var localCatalog = require('./catalog-local.js');
var remoteCatalog = require('./catalog-remote.js');
var files = require('./files.js');
var prebuiltBootstrap = require('./catalog-bootstrap-prebuilt.js');
var checkoutBootstrap = require('./catalog-bootstrap-checkout.js');
var project = require('./project.js');
var utils = require('./utils.js');
var config = require('./config.js');
var packageClient = require('./package-client.js');

var LayeredCatalog = function() {
	var self = this;

	self.localCatalog = null;
	self.otherCatalog = null;

  // Constraint solver using this catalog.
  self.resolver = null;

  // See the documentation of the _extraECVs field in ConstraintSolver.Resolver.
  // Maps packageName -> version -> its ECV
  self.forgottenECVs = {};

  // Each complete catalog needs its own package cache.
  self.packageCache = new packageCache.PackageCache(self);
};

_.extend(LayeredCatalog.prototype, {
  setCatalogs: function(local, remote) {
    var self = this;
    self.localCatalog = local;
    self.otherCatalog = remote;
  },

  addLocalPackage: function (directory) {
    var self = this;
    self.localCatalog.addLocalPackage(directory);
  },

  getAllBuilds: function (name, version) {
    var self = this;
    return self._returnFirst("getAllBuilds", arguments, [[], null]);
  },

  getAllPackageNames: function () {
    var self = this;
    return _.union(self.localCatalog.getAllPackageNames(), self.otherCatalog.getAllPackageNames());
  },

  _returnFirst: function(f, args, unacceptableValues) {
    var self = this;
    var splittedArgs = Array.prototype.slice.call(args,0);
    var result = self.localCatalog[f].apply(self.localCatalog, splittedArgs);
    if ( ! (_.contains(unacceptableValues, result) )) {
      return result;
    }
    return self.otherCatalog[f].apply(self.otherCatalog, splittedArgs);
  },

  getBuildsForArches: function (name, version, arches) {
    return this._returnFirst("getBuildsForArches", arguments, [[], null]);
  },

  getBuildWithPreciseBuildArchitectures: function (versionRecord, buildArchitectures) {
    return this._returnFirst("getBuildWithPreciseBuildArchitectures", arguments, [[], null]);
  },

  getForgottenECVs: function (packageName) {
    return this.forgottenECVs[packageName];
  },

  getLoadPathForPackage: function (name, version, constraintSolverOpts) {
    var self = this; //PASCAL check with Ekate
    return self.localCatalog.getLoadPathForPackage(name, version, constraintSolverOpts);
  },

  getLocalPackageNames: function () {
    return this.localCatalog.getLocalPackageNames();
  },

  getPackage: function (name) {
    return this._returnFirst("getPackage", arguments, [[], null]);
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
    return this.otherCatalog.getReleaseTrack(name);
  },

  getReleaseVersion: function (track, version) {
    return this.otherCatalog.getReleaseVersion(track, version);
  },

  getSortedRecommendedReleaseVersions: function (track, laterThanOrderKey) {
    return this.otherCatalog.getSortedRecommendedReleaseVersions(track, laterThanOrderKey);
  },

  getSortedVersions: function (name) {
    return this._returnFirst("getSortedVersions", arguments, [[], null]);
  },

  getVersion: function (name, version) {
    return this._returnFirst("getVersion", arguments, [[], null]);
  },

  initialize: function (options) {
    this.localCatalog.initialize(options);
  },

  isLocalPackage: function (name) {
    return this.localCatalog.isLocalPackage(name);
  },

  rebuildLocalPackages: function (namedPackages) {
    console.log("rebuilding local packages frmo layered catalog");
    self.packageCache.refresh();
    return this.localCatalog.rebuildLocalPackages(namedPackages);
  },

  refreshInProgress: function () {
    var self = this;
    // console.log("refresh in progress the LayeredCatalog");
    //PASCAL Deal with refresh properly
  },

  reset: function () {
    this.localCatalog.reset();
    // console.log("resetting the LayeredCatalog");
    //PASCAL
  },

  // As getVersion, but returns info on the latest version of the
  // package, or null if the package doesn't exist or has no versions.
  // It does not include prereleases (with dashes in the version);
  getLatestMainlineVersion: function (name) {
    var self = this;
    self._requireInitialized();
    buildmessage.assertInCapture();

    var versions = self.getSortedVersions(name);
    versions.reverse();
    var latest = _.find(versions, function (version) {
      return !/-/.test(version);
    });
    if (!latest)
      return null;
    return self.getVersion(name, latest);
  },

    // Throw if the catalog's self.initialized value has not been set to true.
  _requireInitialized: function () {
    var self = this;
    //PASCAL
    // if (! self.initialized)
    //   throw new Error("catalog not initialized yet?");
  },

  resolveConstraints : function (constraints, resolverOpts, opts) {
    var self = this;
    opts = opts || {};
    self._requireInitialized();
    buildmessage.assertInCapture();

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
    // -constr: constraints of form {packageName: String, version: String} with
    //  {type: exact} for exact constraints.
    //
    // Weak dependencies are constraints (they constrain the result), but not
    // dependencies.
    var deps = [];
    var constr = [];
    _.each(constraints, function (constraint) {
      constraint = _.clone(constraint);
      if (!constraint.weak) {
        deps.push(constraint.packageName);
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
        constr.push({packageName: name, version: version, type: 'exactly'});
      });
    }

    // Local packages can only be loaded from the version we have the source
    // for: that's a weak exact constraint.
    _.each(self.packageSources, function (packageSource, name) {
      constr.push({packageName: name, version: packageSource.version,
                   type: 'exactly'});
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
        //PASCAL review
        if (!self._refreshingIsProductive() ||
            exports.official.refreshInProgress()) {
          throw e;
        }
        exports.official.refresh();
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
    console.log("refresh layered catalo");
    self.localCatalog.refresh(options);
    self.otherCatalog.refresh(options);
    self.packageCache.refresh();
    self.resolver = null;
     // options = options || {};
    // buildmessage.assertInCapture();

    // // We need to limit the rate of refresh, or, at least, prevent any sort of
    // // loops. ForceRefresh will override either one.
    // if (!options.forceRefresh && !options.initializing &&
    //     (catalog.official._refreshFutures || self.refreshing)) {

    //   return;
    // }

    // if (options.initializing && !self.forUniload) {
    //   // If we are doing the top level initialization in main.js, everything
    //   // sure had better be in a relaxed state, since we're about to hackily
    //   // steal some data from catalog.official.
    //   if (self.refreshing)
    //     throw Error("initializing catalog.complete re-entrantly?");
    //   if (catalog.official._refreshFutures)
    //     throw Error("initializing catalog.complete during official refresh?");
    // }

    // if (self.refreshing) {
    //   // We're being asked to refresh re-entrantly, maybe because we just
    //   // updated the official catalog.  Let's not do this now, but make the
    //   // outer call do it instead.
    //   // XXX refactoring the catalogs so that the two catalogs share their
    //   //     data and this one is just an overlay would reduce this wackiness
    //   self.needRefresh = true;
    //   return;
    // }

    // self.refreshing = true;

    // try {
    //   self.reset();

    //   if (!self.forUniload) {
    //     if (options.initializing) {
    //       // It's our first time! Everything ought to be at rest. Let's just
    //       // steal data (without even a deep clone!) from catalog.official.
    //       // XXX this is horrible. restructure to have a reference to
    //       // catalog.official instead.
    //       self.packages = _.clone(catalog.official.packages);
    //       self.builds = _.clone(catalog.official.builds);
    //       _.each(catalog.official.versions, function (versions, name) {
    //         self.versions[name] = _.clone(versions);
    //       });
    //     } else {
    //       // Not the first time. Slowly load data from disk.
    //       // XXX restructure this class to just have a reference to
    //       // catalog.official instead of a copy of its data.
    //       var localData = packageClient.loadCachedServerData();
    //       self._insertServerPackages(localData);
    //     }
    //   }

    //   self._recomputeEffectiveLocalPackages();
    //   var allOK = self._addLocalPackageOverrides(
    //     { watchSet: options.watchSet });
    //   self.initialized = true;
    //   // Rebuild the resolver, since packages may have changed.
    //   self.resolver = null;
    // } finally {
    //   self.refreshing = false;
    // }f

    // // If we got a re-entrant refresh request, do it now. (But not if we
    // // encountered build errors building the packages, since in that case
    // // we'd probably just get the same build errors again.)
    // if (self.needRefresh && allOK) {
    //   self.refresh(options);
    // }
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

  watchLocalPackageDirs: function (watchSet) {
    var self = this;
    self.localCatalog.watchLocalPackageDirs(watchSet);
  },

 _refreshingIsProductive: function() {
    //PASCAL REVIEW
    return true;
 }

});

exports.DEFAULT_TRACK = remoteCatalog.DEFAULT_TRACK;

//Instantiate the various catalogs
if (files.inCheckout()) {
  exports.uniload = new checkoutBootstrap.BootstrapCatalogCheckout();
} else {
  exports.uniload = new prebuiltBootstrap.BootstrapCatalogPrebuilt();
}

//The catalog as provided by troposhere (aka atomospherejs.com)
exports.official = new remoteCatalog.RemoteCatalog();

// This is the catalog that's used to actually drive the constraint solver: it
// contains local packages, and since local packages always beat server
// packages, it doesn't contain any information about the server version of
// local packages.
exports.complete = new LayeredCatalog();
exports.complete.setCatalogs(new localCatalog.LocalCatalog({containingCatalog : exports.complete}), exports.official);



