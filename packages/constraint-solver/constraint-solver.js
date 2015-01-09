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

// PackageConstraints and VersionConstraints passed in from the tool
// to us (where we are a uniloaded package) will have constructors
// that we don't recognize because they come from a different copy of
// package-version-parser!  In addition, objects with constructors
// can't be checked by "check" in the same way as plain objects, so we
// have to resort to examining the fields explicitly.
var VersionConstraintType = Match.OneOf(
  PV.VersionConstraint,
  Match.Where(function (vc) {
    check(vc.raw, String);
    check(vc.alternatives, [{
      versionString: Match.OneOf(String, null),
      type: String
    }]);
    return true;
  }));

var PackageConstraintType = Match.OneOf(
  PV.PackageConstraint,
  Match.Where(function (c) {
    check(c.name, String);
    check(c.constraintString, String);
    check(c.vConstraint, VersionConstraintType);
    return true;
  }));

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
CS.PackagesResolver.prototype.resolve = function (
    dependencies, constraints, options) {
  var self = this;
  options = _.extend({
    _testing: false,
    upgrade: [],
    anticipatedPrereleases: {}
  }, options || {});

  check(dependencies, [String]);

  check(constraints, [PackageConstraintType]);

  check(options, {
    _testing: Match.Optional(Boolean),
    upgrade: [String],
    previousSolution: Match.Optional(Object),
    anticipatedPrereleases: Match.Optional(
      Match.ObjectWithValues(Match.ObjectWithValues(Boolean)))
  });

  var packagesToLoad = {}; // package -> true

  _.each(dependencies, function (package) {
    packagesToLoad[package] = true;
  });
  _.each(constraints, function (constraint) {
    packagesToLoad[constraint.name] = true;
  });
  _.each(options.previousSolution, function (version, package) {
    packagesToLoad[package] = true;
  });

  // Load packages into the cache (if they aren't loaded already).
  self.catalogLoader.loadAllVersionsRecursive(_.keys(packagesToLoad));

  var resolver = new CS.Resolver({
    nudge: self._options.nudge
  });

  // Set up the Resolver using the package versions in the cache.
  var cache = self.catalogCache;
  cache.eachPackage(function (p, versions) {
    versions = _.clone(versions).sort(PV.compare);
    _.each(versions, function (v) {
      var uv = new CS.UnitVersion(p, v);
      resolver.addUnitVersion(uv);
      _.each(cache.getDependencyMap(p, v), function (dep) {
        // `dep` is a CS.Dependency
        var p2 = dep.pConstraint.name;
        var constr = dep.pConstraint.constraintString;
        if (! dep.isWeak) {
          uv.addDependency(p2);
        }
        if (constr) {
          uv.addConstraint(resolver.getConstraint(p2, constr));
        }
      });
    });
  });

  var previousSolutionUVs = null;
  if (options.previousSolution) {
    // Build a list of the UnitVersions that we know about that were
    // mentioned in the previousSolution map.
    // (_.compact drops unknown UnitVersions.)
    previousSolutionUVs = _.compact(
      _.map(options.previousSolution, function (version, packageName) {
        return resolver.getUnitVersion(packageName, version);
      }));
  }

  // Convert options.upgrade to a map for O(1) access.
  // XXX we should probably just change the API so it's passed in this way
  var upgradePackages = {};
  _.each(options.upgrade, function (packageName) {
    upgradePackages[packageName] = true;
  });

  constraints = _.map(constraints, function (c) {
    return resolver.getConstraint(c.name, c.constraintString);
  });

  options.rootDependencies = dependencies;
  var resolverOptions = self._getResolverOptions(resolver, {
    anticipatedPrereleases: options.anticipatedPrereleases,
    rootDependencies: dependencies,
    upgrade: upgradePackages,
    previousSolution: previousSolutionUVs,
    _testing: options._testing,
    debug: options.debug
  });
  var res = null;
  var neededToUseUnanticipatedPrereleases = false;

  // If a previous solution existed, try resolving with additional (weak)
  // equality constraints on all the versions from the previous solution (except
  // those we've explicitly been asked to update). If it's possible to solve the
  // constraints without changing any of the previous versions (though we may
  // add more choices in addition, or remove some now-unnecessary choices) then
  // that's our first try.
  //
  // If we're intentionally trying to upgrade some or all packages, we just skip
  // this step. We used to try to do this step but just leaving off pins from
  // the packages we're trying to upgrade, but this tended to not lead to actual
  // upgrades since we were still pinning things that the to-upgrade package
  // depended on.  (We still use the specific contents of options.upgrade to
  // guide which things are encouraged to be upgraded vs stay the same in the
  // heuristic.)
  if (!_.isEmpty(previousSolutionUVs) && _.isEmpty(upgradePackages)) {
    var constraintsWithPreviousSolutionLock = _.clone(constraints);
    _.each(previousSolutionUVs, function (uv) {
      constraintsWithPreviousSolutionLock.push(
        resolver.getConstraint(uv.name, '=' + uv.version));
    });
    try {
      // Try running the resolver. If it fails to resolve, that's OK, we'll keep
      // working.
      res = resolver.resolve(
        dependencies, constraintsWithPreviousSolutionLock, resolverOptions);
    } catch (e) {
      if (!(e.constraintSolverError))
        throw e;
    }
  }

  // Either we didn't have a previous solution, or it doesn't work. Try again
  // without locking in the previous solution as strict equality.
  if (!res) {
    try {
      res = resolver.resolve(dependencies, constraints, resolverOptions);
    } catch (e) {
      if (!(e.constraintSolverError))
        throw e;
    }
  }

  // As a last-ditch effort, let's allow ANY pre-release version found in the
  // catalog, not only those that are asked for at some level.
  if (!res) {
    resolverOptions.anticipatedPrereleases = true;
    neededToUseUnanticipatedPrereleases = true;
    // Unlike the previous calls, this one throws a constraintSolverError on
    // failure.
    res = resolver.resolve(dependencies, constraints, resolverOptions);
  }
  return {
    answer:  resolverResultToPackageMap(res),
    neededToUseUnanticipatedPrereleases: neededToUseUnanticipatedPrereleases
  };
};

var resolverResultToPackageMap = function (choices) {
  var packageMap = {};
  mori.each(choices, function (nameAndUv) {
    var name = mori.first(nameAndUv);
    var uv = mori.last(nameAndUv);
    packageMap[name] = uv.version;
  });
  return packageMap;
};

// Takes options {anticipatedPrereleases, _testing, rootDependencies,
// previousSolution, debug, upgrade}.
//
// Returns options {anticipatedPrereleases, costFunction,
// estimateCostFunction, combineCostFunction}.
CS.PackagesResolver.prototype._getResolverOptions =
  function (resolver, options) {
  var self = this;

  var resolverOptions = {
    anticipatedPrereleases: options.anticipatedPrereleases
  };

  if (options._testing) {
    resolverOptions.costFunction = function (state) {
      return mori.reduce(mori.sum, 0, mori.map(function (nameAndUv) {
        return PV.versionMagnitude(mori.last(nameAndUv).version);
      }, state.choices));
    };
  } else {
    // Poorman's enum
    var VMAJOR = 0, MAJOR = 1, MEDIUM = 2, MINOR = 3;
    var rootDeps = options.rootDependencies || [];
    var prevSol = options.previousSolution || [];

    var isRootDep = {};
    var prevSolMapping = {};

    _.each(rootDeps, function (dep) { isRootDep[dep] = true; });

    // if the upgrade is preferred over preserving previous solution, pretend
    // there are no previous solution
    _.each(prevSol, function (uv) {
      if (! _.has(options.upgrade, uv.name))
        prevSolMapping[uv.name] = uv;
    });

    resolverOptions.costFunction = function (state, options) {
      options = options || {};
      // very major, major, medium, minor costs
      // XXX maybe these can be calculated lazily?
      var cost = [0, 0, 0, 0];

      mori.each(state.choices, function (nameAndUv) {
        var uv = mori.last(nameAndUv);
        if (_.has(prevSolMapping, uv.name)) {
          // The package was present in the previous solution
          var prev = prevSolMapping[uv.name];
          var versionsDistance =
            PV.versionMagnitude(uv.version) -
            PV.versionMagnitude(prev.version);

          var isCompatible = prev.majorVersion === uv.majorVersion;

          if (isRootDep[uv.name]) {
            // root dependency
            if (versionsDistance < 0 || ! isCompatible) {
              // the new pick is older or is incompatible with the prev. solution
              // i.e. can have breaking changes, prefer not to do this
              // XXX in fact we want to avoid downgrades to the direct
              // dependencies at all cost.
              cost[VMAJOR]++;
              options.debug && console.log("root & *not* compatible: ", uv.name, prev.version, "=>", uv.version);
            } else {
              // compatible but possibly newer
              // prefer the version closest to the older solution
              cost[MAJOR] += versionsDistance;
              options.debug && console.log("root & compatible: ", uv.name, prev.version, "=>", uv.version);
            }
          } else {
            // transitive dependency
            // prefer to have less changed transitive dependencies
            cost[MINOR] += versionsDistance === 0 ? 0 : 1;
            options.debug && console.log("transitive: ", uv.name, prev.version, "=>", uv.version);
          }
        } else {
          var latestDistance =
            PV.versionMagnitude(_.last(resolver.unitsVersions[uv.name]).version) -
            PV.versionMagnitude(uv.version);

          if (isRootDep[uv.name]) {
            // root dependency
            // preferably latest
            cost[MEDIUM] += latestDistance;
            options.debug && console.log("root: ", uv.name, "=>", uv.version);
          } else {
            // transitive dependency
            // prefarable earliest possible to be conservative
            // How far is our choice from the most conservative version that
            // also matches our constraints?
            var minimal = state.constraints.getMinimalVersion(uv.name) || '0.0.0';
            cost[MINOR] += PV.versionMagnitude(uv.version) - PV.versionMagnitude(minimal);
            options.debug && console.log("transitive: ", uv.name, "=>", uv.version);
          }
        }
      });

      return cost;
    };

    resolverOptions.estimateCostFunction = function (state, options) {
      options = options || {};

      var cost = [0, 0, 0, 0];

      state.eachDependency(function (dep, alternatives) {
        // XXX don't try to estimate transitive dependencies
        if (! isRootDep[dep]) {
          cost[MINOR] += 10000000;
          return;
        }

        if (_.has(prevSolMapping, dep)) {
          var prev = prevSolMapping[dep];
          var prevVersionMatches = state.isSatisfied(prev);

          // if it matches, assume we would pick it and the cost doesn't
          // increase
          if (prevVersionMatches)
            return;

          // Get earliest matching version.
          var earliestMatching = mori.first(alternatives);

          var isCompatible =
                prev.majorVersion === earliestMatching.majorVersion;
          if (! isCompatible) {
            cost[VMAJOR]++;
            return;
          }

          var versionsDistance =
            PV.versionMagnitude(earliestMatching.version) -
            PV.versionMagnitude(prev.version);
          if (versionsDistance < 0) {
            cost[VMAJOR]++;
            return;
          }

          cost[MAJOR] += versionsDistance;
        } else {
          var versions = resolver.unitsVersions[dep];
          var latestMatching = mori.last(alternatives);

          var latestDistance =
            PV.versionMagnitude(
              _.last(resolver.unitsVersions[dep]).version) -
            PV.versionMagnitude(latestMatching.version);

          cost[MEDIUM] += latestDistance;
        }
      });

      return cost;
    };

    resolverOptions.combineCostFunction = function (costA, costB) {
      if (costA.length !== costB.length)
        throw new Error("Different cost types");

      var arr = [];
      _.each(costA, function (l, i) {
        arr.push(l + costB[i]);
      });

      return arr;
    };
  }

  return resolverOptions;
};
