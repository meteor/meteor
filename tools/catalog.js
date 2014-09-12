var _ = require('underscore');
var util = require('util');
var buildmessage = require('./buildmessage.js');
var localCatalog = require('./catalog-local.js');
var remoteCatalog = require('./catalog-remote.js');
var files = require('./files.js');
var prebuiltBootstrap = require('./catalog-bootstrap-prebuilt.js');
var checkoutBootstrap = require('./catalog-bootstrap-checkout.js');

var LayeredCatalog = function() {
	var self = this;

	self.localCatalog = null;
	self.otherCatalog = null;

  // Constraint solver using this catalog.
  self.resolver = null;

  // See the documentation of the _extraECVs field in ConstraintSolver.Resolver.
  // Maps packageName -> version -> its ECV
  self.forgottenECVs = {};
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

  getAllReleaseTracks: function () {
    return this._returnFirst("getAllReleaseTracks", arguments, [[]]);
  },

  _returnFirst: function(f, args, unacceptableValues) {
    var self = this;
    var result = self.localCatalog[f](args);
    if ( ! (_.contains(unacceptableValues, result) )) {
      return result;
    }
    return self.otherCatalog[f](args);
  },

  getBuildsForArches: function (name, version, arches) {
    return this._returnFirst("getBuildsForArches", arguements, [[], null]);
  },

  getBuildWithPreciseBuildArchitectures: function (versionRecord, buildArchitectures) {
    return this._returnFirst("getBuildWithPreciseBuildArchitectures", arguements, [[], null]);
  },

  getDefaultReleaseVersion: function (track) {
    return this.otherCatalog.getDefaultReleaseVersion(track);
  },

  getForgottenECVs: function (packageName) {
    return this.forgottenECVs[packageName];
  },

  getLatestMainlineVersion: function (name) {
    return this._returnFirst("getLatestMainlineVersion", arguements, [[], null]);
  },

  getLoadPathForPackage: function (name, version, constraintSolverOpts) {
    var self = this; //PASCAL check with Ekate
    return self.localCatalog.getLoadPathForPackage(name, version, constraintSolverOpts);
  },

  getLocalPackageNames: function () {
    return this.localCatalog.getLocalPackageNames();
  },

  getPackage: function (name, options) {
    return this._returnFirst("getPackage", arguements, [[], null]);
  },

  getReleaseTrack: function (name) {
    return this.otherCatalog.getReleaseTrack(name);
  },

  getReleaseVersion: function (track, version) {
    return this.otherCatalog.getReleaseVersion(track, version);
  },

  getSortedRecommendedReleaseVersions: function (track, laterThanOrderKey) {
    return this.otherCatalog.getSortedRecommendedReleaseVersions(track, version);
  },

  getSortedVersions: function (name) {
    return this._returnFirst("getSortedVersions", arguements, [[], null]);
  },

  getVersion: function (name, version) {
    return this._returnFirst("getVersion", arguements, [[], null]);
  },

  initialize: function (options) {
    this.localCatalog.initialize(options);
  },

  isLocalPackage: function (name) {
    return this.localCatalog.isLocalPackage(name);
  },

  rebuildLocalPackages: function (namedPackages) {
    return this.localCatalog.rebuildLocalPackages(namedPackages);
  },

  refresh: function () {
    var self = this;
    console.log("refreshing the LayeredCatalog");
    //PASCAL Deal with refresh properly
  },

  refreshInProgress: function () {
    var self = this;
    console.log("refresh in progress the LayeredCatalog");
    //PASCAL Deal with refresh properly
  },

  reset: function () {
    this.localCatalog.reset();
    console.log("resetting the LayeredCatalog");
    //PASCAL
  },

  //_requireInitialized
  resolveConstraints : function (constraints, resolverOpts, opts) {
    var self = this;
    opts = opts || {};
    // self._requireInitialized();
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
    try {
      // Then, call the constraint solver, to get the valid transitive subset of
      // those versions to record for our solution. (We don't just return the
      // original version lock because we want to record the correct transitive
      // dependencies)
      try {
        return self.resolver.resolve(deps, constr, resolverOpts);
      } catch (e) {
        // Maybe we only failed because we need to refresh. Try to refresh
        // (unless we already are) and retry.
        if (!self._refreshingIsProductive() ||
            catalog.official.refreshInProgress()) {
          throw e;
        }
        catalog.official.refresh();
        self.resolver || self._initializeResolver();
        return self.resolver.resolve(deps, constr, resolverOpts);
      }
    } finally {
      patience.stop();
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

  watchLocalPackageDirs: function (watchSet) {
    var self = this;
    console.log("watchllocalpackageDirs the LayeredCatalog");
    //PASCAL
  },

});


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
exports.complete.setCatalogs(new localCatalog.LocalCatalog(), exports.official);



