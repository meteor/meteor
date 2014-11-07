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
var project = require('./project.js');
var utils = require('./utils.js');
var config = require('./config.js');
var packageClient = require('./package-client.js');
var Console = require('./console.js').Console;

var catalog = exports;

catalog.refreshFailed = undefined;

catalog.Refresh = {};

// Refresh strategy: once at program start
catalog.Refresh.OnceAtStart = function (options) {
  var self = this;
  self.options = _.extend({}, options);
};

catalog.Refresh.OnceAtStart.prototype.beforeCommand = function () {
  var self = this;
  if (!catalog.refreshOrWarn(self.options)) {
    if (self.options.ignoreErrors) {
      Console.debug("Failed to update package catalog, but will continue.");
    } else {
      Console.printError(catalog.refreshError);
      Console.error("This command requires an up-to-date package catalog.  Exiting.");
      // Avoid circular dependency.
      throw new (require('./main.js').ExitWithCode)(1);
    }
  }
};

// Refresh strategy: never (we don't use the package catalog)
catalog.Refresh.Never = function (options) {
  var self = this;
  self.options = _.extend({}, options);
  self.doesNotUsePackages = true;
};

// Refreshes the catalog. Returns true on success.
// On network error, warns and returns false.
// Throws other errors (ie, programming errors in the tool).
//
// THIS IS A HIGH-LEVEL UI COMMAND. DO NOT CALL IT FROM LOW-LEVEL CODE (ie, call
// it only from main.js or command implementations).
catalog.refreshOrWarn = function (options) {
  try {
    catalog.complete.refreshOfficialCatalog(options);
    catalog.refreshFailed = false;
    return true;
  } catch (err) {
    // Example errors:

    // Offline, with name-based host:
    //   Network error: ws://packages.meteor.com/websocket: getaddrinfo ENOTFOUND

    // Offline, with IP-based host:
    //   Network error: ws://8.8.8.8/websocket: connect ENETUNREACH

    // Online, bad port:
    //    Network error: wss://packages.meteor.com:8888/websocket: connect ECONNREFUSED

    // Online, socket hangup:
    //   Network error: wss://packages.meteor.com:80/websocket: socket hang up

    if (err.errorType !== 'DDP.ConnectionError')
      throw err;

    // XXX is throwing correct for SQLite errors too? probably.

    Console.warn("Unable to update package catalog (are you offline?)");

    // XXX: Make this Console.debug(err)
    if (Console.isDebugEnabled()) {
      Console.printError(err);
    }

    Console.warn();

    catalog.refreshFailed = true;
    catalog.refreshError = err;
    return false;
  }
};


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

  getLatestVersion: function (name) {
    var self = this;
    return self._returnFirst("getLatestVersion", arguments, ACCEPT_NON_EMPTY);
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

  // Doesn't download packages. Downloading should be done at the time
  // that .meteor/versions is updated.
  getLoadPathForPackage: function (name, version, constraintSolverOpts) {
    var self = this;
    var loadPath = self.localCatalog.getLoadPathForPackage(
      name, version, constraintSolverOpts);
    if (loadPath)
      return loadPath;

    if (! version) {
      throw new Error(name + " not a local package, and no version specified?");
    }

    return self.otherCatalog.getLoadPathForPackage(
      name, version, constraintSolverOpts);
  },

  getLocalPackageNames: function () {
    return this.localCatalog.getAllPackageNames();
  },

  getPackage: function (name) {
    return this._returnFirst("getPackage", arguments, ACCEPT_NON_EMPTY);
  },

  getSortedVersions: function (name) {
    return this._returnFirst("getSortedVersions", arguments, ACCEPT_NON_EMPTY);
  },

  getVersion: function (name, version) {
    var self = this;
    var result = self.localCatalog.getVersion(name, version);
    if (!result) {
      if (/\+/.test(version)) {
        return null;
      }
      result = self.otherCatalog.getVersion(name, version);
    }
    return result;
  },

  initialize: function (options) {
    this.localCatalog.initialize(options);
  },

  isLocalPackage: function (name) {
    return this.localCatalog.isLocalPackage(name);
  },

  reset: function () {
    this.localCatalog.reset();
  },

  // As getVersion, but returns info on the latest version of the
  // package, or null if the package doesn't exist or has no versions.
  // It does not include prereleases (with dashes in the version);
  getLatestMainlineVersion: function (name) {
    var self = this;

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
    // OK, since we are the complete catalog, isopackets must be fully
    // initialized, so it's safe to load a resolver if we didn't
    // already. (Putting this off until the first call to resolveConstraints
    // also helps with performance: no need to build this package and load the
    // large mori module unless we actually need it.)
    self.resolver = self.resolver || self._buildResolver();

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

    var ret = buildmessage.enterJob({
        title: "Selecting package versions" },
      function () {
        // Then, call the constraint solver, to get the valid transitive
        // subset of those versions to record for our solution. (We don't just
        // return the original version lock because we want to record the
        // correct transitive dependencies)
        return self.resolver.resolve(deps, constr, resolverOpts);
      });
    if (ret["usedRCs"]) {
      var expPackages = [];
      _.each(ret.answer, function(version, package) {
        if (self.isLocalPackage(package))
          return;
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
        utils.printPackageList(expPackages);
      }
    }
    return ret.answer;
  },

  // Refresh the catalogs referenced by this catalog.
  // options:
  // - watchSet: if provided, any files read in reloading packages will be added
  //   to this set.
  refreshLocalPackages: function (options) {
    var self = this;
    self.localCatalog.refresh(options);
    //// Note that otherCatalog can throw, if we fail to connect
    //// XXX: Order of refreshes?  Continue on error?
    //self.otherCatalog.refresh(options);
    self.packageCache.refresh();
    self.resolver = null;
  },

  // Refresh the official catalog referenced by this catalog.
  refreshOfficialCatalog: function (options) {
    var self = this;

    //self.localCatalog.refresh(options);
    // Note that otherCatalog can throw, if we fail to connect
    // XXX: Order of refreshes?  Continue on error?
    self.otherCatalog.refresh(options);

    self.packageCache.refresh();
    self.resolver = null;
  },


  _buildResolver: function () {
    var self = this;
    var isopackets = require("./isopackets.js");

    var constraintSolverPackage =
          isopackets.load('constraint-solver')['constraint-solver'];
    var resolver =
      new constraintSolverPackage.ConstraintSolver.PackagesResolver(self, {
        nudge: function () {
          Console.nudge(true);
        }
      });
    return resolver;
  },

  watchLocalPackageDirs: function (watchSet) {
    var self = this;
    self.localCatalog.watchLocalPackageDirs(watchSet);
  }
});

exports.DEFAULT_TRACK = remoteCatalog.DEFAULT_TRACK;
exports.official = remoteCatalog.official;

// This is the catalog that's used to actually drive the constraint solver: it
// contains local packages, and since local packages always beat server
// packages, it doesn't contain any information about the server version of
// local packages.
exports.complete = new LayeredCatalog();
exports.complete.setCatalogs(new localCatalog.LocalCatalog({containingCatalog : exports.complete}), remoteCatalog.official);
