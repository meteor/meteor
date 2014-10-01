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
var Console = require('./console.js').Console;

// As a work-around for [] !== [], we use a function to check whether values are acceptable
var ACCEPT_NON_EMPTY = function (result) {
  // null, undefined
  if (result === null || result === undefined) {
    return false;
  }
  // []
  if (result.length === 0) {
    return false;
  }
  return true;
};

// The LayeredCatalog provides a way to query multiple catalogs in a uniform way
// A LayeredCatalog typically contains:
//  - a local catalog referencing the packages of the project
//  - a reference to the official catalog
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
  toString: function () {
    var self = this;
    return "LayeredCatalog []";
  },

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
    return self._returnFirst("getAllBuilds", arguments, ACCEPT_NON_EMPTY);
  },

  getAllPackageNames: function () {
    var self = this;
    return _.union(self.localCatalog.getAllPackageNames(), self.otherCatalog.getAllPackageNames());
  },

  _returnFirst: function(f, args, validityOracle) {
    var self = this;
    var splittedArgs = Array.prototype.slice.call(args,0);
    var result = self.localCatalog[f].apply(self.localCatalog, splittedArgs);
    if (validityOracle(result)) {
      return result;
    }
    return self.otherCatalog[f].apply(self.otherCatalog, splittedArgs);
  },

  getBuildsForArches: function (name, version, arches) {
    return this._returnFirst("getBuildsForArches", arguments, ACCEPT_NON_EMPTY);
  },

  getBuildWithPreciseBuildArchitectures: function (versionRecord, buildArchitectures) {
    return this._returnFirst("getBuildWithPreciseBuildArchitectures", arguments, ACCEPT_NON_EMPTY);
  },

  getForgottenECVs: function (packageName) {
    return this.forgottenECVs[packageName];
  },

  getLoadPathForPackage: function (name, version, constraintSolverOpts) {
    var self = this;
    return self.localCatalog.getLoadPathForPackage(name, version, constraintSolverOpts);
  },

  getLocalPackageNames: function () {
    return this.localCatalog.getLocalPackageNames();
  },

  getPackage: function (name) {
    return this._returnFirst("getPackage", arguments, ACCEPT_NON_EMPTY);
  },

  // Find a release that uses the given version of a tool. See: publish-for-arch
  // in command-packages for more explanation.  Returns information about a
  // particular release version, or null if such release version does not exist.
  getReleaseWithTool: function (toolSpec) {
    var self = this;
    buildmessage.assertInCapture();
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
    return this._returnFirst("getSortedVersions", arguments, ACCEPT_NON_EMPTY);
  },

  getVersion: function (name, version) {
    return this._returnFirst("getVersion", arguments, ACCEPT_NON_EMPTY);
  },

  initialize: function (options) {
    this.localCatalog.initialize(options);
  },

  isLocalPackage: function (name) {
    return this.localCatalog.isLocalPackage(name);
  },

  rebuildLocalPackages: function (namedPackages) {
    this.packageCache.refresh();
    return this.localCatalog.rebuildLocalPackages(namedPackages);
  },

  reset: function () {
    this.localCatalog.reset();
  },

  // As getVersion, but returns info on the latest version of the
  // package, or null if the package doesn't exist or has no versions.
  // It does not include prereleases (with dashes in the version);
  getLatestMainlineVersion: function (name) {
    var self = this;
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

  resolveConstraints: function (constraints, resolverOpts, opts) {
    var self = this;
    opts = opts || {};
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

      var ret = buildmessage.enterJob({ title: "Figuring out the best package versions to use." }, function () {
        // Then, call the constraint solver, to get the valid transitive subset of
        // those versions to record for our solution. (We don't just return the
        // original version lock because we want to record the correct transitive
        // dependencies)
        try {
          return self.resolver.resolve(deps, constr, resolverOpts);
        } catch (e) {
          console.log("Got error during resolve; trying refresh", e);
          remoteCatalog.official.refresh();
          self.resolver || self._initializeResolver();
          return self.resolver.resolve(deps, constr, resolverOpts);
        }
      });
      if (ret["usedRCs"]) {
        var expPackages = [];
        _.each(ret.answer, function(version, package) {
          if (version.split('-').length > 1) {
            if (!(resolverOpts.previousSolution &&
              resolverOpts.previousSolution[package] === version)) {
                var oldConstraints = _.where(constr, { name: package } );
                var printMe = true;
                _.each(oldConstraints, function (oC) {
                  _.each(oC.constraints, function (specOC) {
                    if (specOC.version === version) {
                      printMe = false;
                    }
                   });
                });
                if (printMe) {
                  expPackages.push({
                    name: "  " + package + "@" + version,
                    description: self.getVersion(package, version).description
                  });
                };
          }}
        });
        if (!_.isEmpty(expPackages)) {
          // XXX: Couldn't figure out how to word this better for better tenses.
          //
          // XXX: this shouldn't be here. This is library code... it
          // shouldn't be printing.
          // https://github.com/meteor/meteor/wiki/Meteor-Style-Guide#only-user-interface-code-should-engage-with-the-user
          Console.info(
            "\nIn order to resolve constraints, we had to use the following\n"+
            "experimental package versions:");
          Console.info(utils.formatList(expPackages));
        }
      }
      return ret.answer;
  },

  // Refresh the catalogs referenced by this catalog.
  // options:
  // - forceRefresh: even if there is a future in progress, refresh the catalog
  //   anyway. When we are using hot code push, we may be restarting the app
  //   because of a local package change that impacts that catalog. Don't wait
  //   on the official catalog to refresh data.json, in this case.
  // - watchSet: if provided, any files read in reloading packages will be added
  //   to this set.
  refresh: function (options) {
    var self = this;
    self.localCatalog.refresh(options);
    self.otherCatalog.refresh(options);
    self.packageCache.refresh();
    self.resolver = null;
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
          buildmessage.nudge();
        }
      });
  },

  watchLocalPackageDirs: function (watchSet) {
    var self = this;
    self.localCatalog.watchLocalPackageDirs(watchSet);
  }
});

exports.DEFAULT_TRACK = remoteCatalog.DEFAULT_TRACK;
exports.official = remoteCatalog.official;

//Instantiate the various catalogs
if (files.inCheckout()) {
  exports.uniload = new checkoutBootstrap.BootstrapCatalogCheckout();
} else {
  exports.uniload = new prebuiltBootstrap.BootstrapCatalogPrebuilt();
}

// This is the catalog that's used to actually drive the constraint solver: it
// contains local packages, and since local packages always beat server
// packages, it doesn't contain any information about the server version of
// local packages.
exports.complete = new LayeredCatalog();
exports.complete.setCatalogs(new localCatalog.LocalCatalog({containingCatalog : exports.complete}), remoteCatalog.official);
