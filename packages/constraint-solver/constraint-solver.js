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
    nudge: options && options.nudge
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
//  - missingPreviousVersionIsError - throw an error if a package version in
//    previousSolution is not found in the catalog
CS.PackagesResolver.prototype.resolve = function (dependencies, constraints,
                                                  options) {
  var self = this;
  options = options || {};
  var input = new CS.Input(dependencies, constraints, self.catalogCache,
                           _.pick(options, 'upgrade', 'anticipatedPrereleases',
                                  'previousSolution',
                                  'allowIncompatibleUpdate'));
  input.loadFromCatalog(self.catalogLoader);

  if (options.previousSolution && options.missingPreviousVersionIsError) {
    _.each(options.previousSolution, function (version, package) {
      if (! input.catalogCache.hasPackageVersion(package, version)) {
        CS.throwConstraintSolverError(
          "Package version not in catalog: " + package + " " + version);
      }
    });
  }

  return CS.PackagesResolver._resolveWithInput(input, {
    nudge: this._options.nudge
  });
};

// Exposed for tests.
//
// Options:
// - nudge (function to be called when possible to "nudge" the progress spinner)
// - allAnswers (for testing, calculate all possible answers and put an extra
//   property named "allAnswers" on the result)
CS.PackagesResolver._resolveWithInput = function (input, options) {
  options = options || {};

  var solver = new CS.Solver(input, {
    nudge: options.nudge
  });

  // Disable runtime type checks (they slow things down by a factor of 3)
  return Logic._disablingTypeChecks(function () {
    var result = solver.getSolution({
      allAnswers: (options && options.allAnswers)
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
CS.isConstraintSatisfied = function (package, vConstraint, version) {
  return _.some(vConstraint.alternatives, function (simpleConstraint) {
    var type = simpleConstraint.type;

    if (type === "any-reasonable") {
      return true;
    } else if (type === "exactly") {
      var cVersion = simpleConstraint.versionString;
      return (cVersion === version);
    } else if (type === 'compatible-with') {
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
