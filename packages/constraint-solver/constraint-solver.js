var PV = PackageVersion;
var CS = ConstraintSolver;

// This is the entry point for the constraint-solver package.  The tool
// creates a ConstraintSolver.PackagesResolver and calls .resolve on it.

CS.PackagesResolver = function (catalog, options) {
  var self = this;

  self.catalog = catalog;
  self.catalogCache = new CS.CatalogCache();
  self.catalogLoader = new CS.CatalogLoader(self.catalog, self.catalogCache);

  self._options = {
    nudge: options && options.nudge,
    Profile: options && options.Profile,
    // For resultCache, pass in an empty object `{}`, and PackagesResolver
    // will put data on it.  Pass in the same object again to allow reusing
    // the result from the previous run.
    resultCache: options && options.resultCache
  };
};

// dependencies - an array of string names of packages (not slices)
// constraints - an array of PV.PackageConstraints
// options:
//  - upgrade - list of dependencies for which upgrade is prioritized higher
//    than keeping the old version
//  - previousSolution - mapping from package name to a version that was used in
//    the previous constraint solver run
//  - anticipatedPrereleases: mapping from package name to version to true;
//    included versions are the only pre-releases that are allowed to match
//    constraints that don't specifically name them during the "try not to
//    use unanticipated pre-releases" pass
//  - allowIncompatibleUpdate: allows choosing versions of
//    root dependencies that are incompatible with the previous solution,
//    if necessary to satisfy all constraints
//  - upgradeIndirectDepPatchVersions: also upgrade indirect dependencies
//    to newer patch versions, proactively
//  - missingPreviousVersionIsError - throw an error if a package version in
//    previousSolution is not found in the catalog
//  - supportedIsobuildFeaturePackages - map from package name to list of
//    version strings of isobuild feature packages that are available in the
//    catalog
CS.PackagesResolver.prototype.resolve = function (dependencies, constraints,
                                                  options) {
  var self = this;
  options = options || {};
  var Profile = (self._options.Profile || CS.DummyProfile);

  var input;
  Profile.time("new CS.Input", function () {
    input = new CS.Input(dependencies, constraints, self.catalogCache,
                         _.pick(options,
                                'upgrade',
                                'anticipatedPrereleases',
                                'previousSolution',
                                'allowIncompatibleUpdate',
                                'upgradeIndirectDepPatchVersions'));
  });

  var resultCache = self._options.resultCache;
  if (resultCache &&
      resultCache.lastInput &&
      _.isEqual(resultCache.lastInput,
                input.toJSONable(true))) {
    return resultCache.lastOutput;
  }

  if (options.supportedIsobuildFeaturePackages) {
    _.each(options.supportedIsobuildFeaturePackages, function (versions, pkg) {
      _.each(versions, function (version) {
        input.catalogCache.addPackageVersion(pkg, version, []);
      });
    });
  }

  Profile.time(
    "Input#loadOnlyPreviousSolution",
    function () {
      input.loadOnlyPreviousSolution(self.catalogLoader);
    });

  if (options.previousSolution && options.missingPreviousVersionIsError) {
    // see comment where missingPreviousVersionIsError is passed in
    Profile.time("check for previous versions in catalog", function () {
      _.each(options.previousSolution, function (version, pkg) {
        if (! input.catalogCache.hasPackageVersion(pkg, version)) {
          CS.throwConstraintSolverError(
            "Package version not in catalog: " + pkg + " " + version);
        }
      });
    });
  }

  var resolveOptions = {
    nudge: self._options.nudge,
    Profile: self._options.Profile
  };

  var output = null;
  if (options.previousSolution && !input.upgrade && !input.upgradeIndirectDepPatchVersions) {
    // Try solving first with just the versions from previousSolution in
    // the catalogCache, so that we don't have to solve the big problem
    // if we don't have to. But don't do this if we're attempting to upgrade
    // packages, because that would always result in just using the current
    // version, hence disabling upgrades.
    try {
      output = CS.PackagesResolver._resolveWithInput(input, resolveOptions);
    } catch (e) {
      if (e.constraintSolverError) {
        output = null;
      } else {
        throw e;
      }
    }
  }

  if (! output) {
    // do a solve with all package versions available in the catalog.
    Profile.time(
      "Input#loadFromCatalog",
      function () {
        input.loadFromCatalog(self.catalogLoader);
      });

    // if we fail to find a solution this time, this will throw.
    output = CS.PackagesResolver._resolveWithInput(input, resolveOptions);
  }

  if (resultCache) {
    resultCache.lastInput = input.toJSONable(true);
    resultCache.lastOutput = output;
  }

  return output;
};

// Exposed for tests.
//
// Options (all optional):
// - nudge (function to be called when possible to "nudge" the progress spinner)
// - allAnswers (for testing, calculate all possible answers and put an extra
//   property named "allAnswers" on the result)
// - Profile (the profiler interface in `tools/profile.js`)
CS.PackagesResolver._resolveWithInput = function (input, options) {
  options = options || {};

  if (Meteor.isServer &&
      process.env['METEOR_PRINT_CONSTRAINT_SOLVER_INPUT']) {
    console.log("CONSTRAINT_SOLVER_INPUT = ");
    console.log(JSON.stringify(input.toJSONable(), null, 2));
  }

  var solver;
  (options.Profile || CS.DummyProfile).time("new CS.Solver", function () {
    solver = new CS.Solver(input, {
      nudge: options.nudge,
      Profile: options.Profile
    });
  });

  // Disable runtime type checks (they slow things down a bunch)
  return Logic.disablingAssertions(function () {
    var result = solver.getAnswer({
      allAnswers: options.allAnswers
    });
    // if we're here, no conflicts were found (or an error would have
    // been thrown)
    return result;
  });
};


// - package: String package name
// - vConstraint: a PackageVersion.VersionConstraint, or an object
//   with an `alternatives` property lifted from one.
// - version: version String
CS.isConstraintSatisfied = function (pkg, vConstraint, version) {
  return _.some(vConstraint.alternatives, function (simpleConstraint) {
    var type = simpleConstraint.type;

    if (type === "any-reasonable") {
      return true;
    } else if (type === "exactly") {
      var cVersion = simpleConstraint.versionString;
      return (cVersion === version);
    } else if (type === 'compatible-with') {
      if (typeof simpleConstraint.test === "function") {
        return simpleConstraint.test(version);
      }

      var cv = PV.parse(simpleConstraint.versionString);
      var v = PV.parse(version);

      // If the candidate version is less than the version named in the
      // constraint, we are not satisfied.
      if (PV.lessThan(v, cv)) {
        return false;
      }

      // To be compatible, the two versions must have the same major version
      // number.
      if (v.major !== cv.major) {
        return false;
      }

      return true;
    } else {
      throw Error("Unknown constraint type: " + type);
    }
  });
};

CS.throwConstraintSolverError = function (message) {
  var e = new Error(message);
  e.constraintSolverError = true;
  throw e;
};

// This function is duplicated in tools/compiler.js.
CS.isIsobuildFeaturePackage = function (packageName) {
  return /^isobuild:/.test(packageName);
};


// Implements the Profile interface (as we use it) but doesn't do
// anything.
CS.DummyProfile = function (bucket, f) {
  return f;
};
CS.DummyProfile.time = function (bucket, f) {
  return f();
};
