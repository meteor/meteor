const isEqual = require('lodash.isequal');

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
    yield: options && options.yield,
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
CS.PackagesResolver.prototype.resolve = async function (dependencies, constraints,
                                                  options) {
  var self = this;
  options = options || {};
  var Profile = (self._options.Profile || CS.DummyProfile);

  var input = await Profile.time("new CS.Input", function () {
    const { upgrade,
    anticipatedPrereleases,
    previousSolution,
    allowIncompatibleUpdate,
    upgradeIndirectDepPatchVersions } = options;
    return new CS.Input(dependencies, constraints, self.catalogCache,
      { upgrade,
        anticipatedPrereleases,
        previousSolution,
        allowIncompatibleUpdate,
        upgradeIndirectDepPatchVersions });
  });

  // The constraint solver avoids re-solving everything from scratch on
  // rebuilds if the current input of top-level constraints matches the
  // previously solved input (also just top-level constraints). This is
  // slightly unsound, because non-top-level dependency constraints might
  // have changed, but it's important for performance, and relatively
  // harmless in practice (if there's a version conflict, you'll find out
  // about it the next time you do a full restart of the development
  // server). The unsoundness can cause problems for tests, however, so it
  // may be a good idea to set this environment variable to "true" to
  // disable the caching entirely.
  const disableCaching = !! JSON.parse(
    process.env.METEOR_DISABLE_CONSTRAINT_SOLVER_CACHING || "false"
  );

  let resultCache = self._options.resultCache;
  if (disableCaching) {
    resultCache = null;
  } else if (resultCache &&
             resultCache.lastInput &&
             isEqual(resultCache.lastInput,
                       input.toJSONable(true))) {
    return resultCache.lastOutput;
  }

  if (options.supportedIsobuildFeaturePackages) {
    Object.entries(options.supportedIsobuildFeaturePackages).forEach(function ([pkg, versions]) {
      versions.forEach(function (version) {
        input.catalogCache.addPackageVersion(pkg, version, []);
      });
    });
  }

  await Profile.time(
    "Input#loadOnlyPreviousSolution",
    function () {
      return input.loadOnlyPreviousSolution(self.catalogLoader);
    });

  if (options.previousSolution && options.missingPreviousVersionIsError) {
    // see comment where missingPreviousVersionIsError is passed in
    await Profile.time("check for previous versions in catalog", function () {
      Object.entries(options.previousSolution).forEach(function ([pkg, version]) {
        if (! input.catalogCache.hasPackageVersion(pkg, version)) {
          CS.throwConstraintSolverError(
            "Package version not in catalog: " + pkg + " " + version);
        }
      });
    });
  }

  var resolveOptions = {
    nudge: self._options.nudge,
    yield: self._options.yield,
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
      output = await CS.PackagesResolver._resolveWithInput(input, resolveOptions);
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
    await Profile.time(
      "Input#loadFromCatalog",
      function () {
        return input.loadFromCatalog(self.catalogLoader);
      });

    // if we fail to find a solution this time, this will throw.
    output = await CS.PackagesResolver._resolveWithInput(input, resolveOptions);
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
CS.PackagesResolver._resolveWithInput = async function (input, options) {
  options = options || {};

  if (Meteor.isServer &&
      process.env['METEOR_PRINT_CONSTRAINT_SOLVER_INPUT']) {
    console.log("CONSTRAINT_SOLVER_INPUT = ");
    console.log(JSON.stringify(input.toJSONable(), null, 2));
  }

  var solver = await (options.Profile || CS.DummyProfile).time("new CS.Solver", async function () {
    const _solver = new CS.Solver(input, {
      nudge: options.nudge,
      yield: options.yield,
      Profile: options.Profile
    });
    await _solver.init();

    return _solver;
  });

  // Disable runtime type checks (they slow things down a bunch)
  return await Logic.disablingAssertions(function () {
    // if we're here, no conflicts were found (or an error would have
    // been thrown)
    return solver.getAnswer({
      allAnswers: options.allAnswers
    });
  });
};


// - package: String package name
// - vConstraint: a PackageVersion.VersionConstraint, or an object
//   with an `alternatives` property lifted from one.
// - version: version String
CS.isConstraintSatisfied = function (pkg, vConstraint, version) {
  return vConstraint.alternatives.some(function (simpleConstraint) {
    var type = simpleConstraint.type;

    if (type === "any-reasonable") {
      return true;
    }

    // If any top-level constraints use the @x.y.z! override syntax, all
    // other constraints on the same package will be marked with the
    // weakMinimum property, which means they constrain nothing other than
    // the minimum version of the package. Look for weakMinimum in the
    // CS.Solver#analyze method for related logic.
    if (vConstraint.weakMinimum) {
      return ! PV.lessThan(
        PV.parse(version),
        PV.parse(simpleConstraint.versionString)
      );
    }

    if (type === "exactly") {
      var cVersion = simpleConstraint.versionString;
      return (cVersion === version);
    }

    if (type === 'compatible-with') {
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
    }

    throw Error("Unknown constraint type: " + type);
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
