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
CS.PackagesResolver.prototype.resolve = function (dependencies, constraints,
                                                  options) {
  var self = this;
  var input = new CS.Input(dependencies, constraints, self.catalogCache,
                           options);
  input.loadFromCatalog(self.catalogLoader);

  return CS.PackagesResolver._resolveWithInput(input, this._options.nudge);
};

// Exposed for tests.
CS.PackagesResolver._resolveWithInput = function (input, _nudge) {
  check(input, CS.Input);

  // Dump the input to the console!  XXX Put this behind a flag.
  //console.log(JSON.stringify(input.toJSONable(), null, 2));

  var resolver = new CS.Resolver({nudge: _nudge});

  // Set up the Resolver using the package versions in the cache.
  var cache = input.catalogCache;
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
  if (input.previousSolution) {
    // Build a list of the UnitVersions that we know about that were
    // mentioned in the previousSolution map.
    // (_.compact drops unknown UnitVersions.)
    previousSolutionUVs = _.compact(
      _.map(input.previousSolution, function (version, packageName) {
        return resolver.getUnitVersion(packageName, version);
      }));
  }

  // Convert upgrade to a map for O(1) access.
  var upgradePackages = {};
  _.each(input.upgrade, function (packageName) {
    upgradePackages[packageName] = true;
  });

  var constraints = _.map(input.constraints, function (c) {
    return resolver.getConstraint(c.name, c.constraintString);
  });

  var resolverOptions = {
    anticipatedPrereleases: input.anticipatedPrereleases
  };
  _.extend(resolverOptions,
           getCostFunction(resolver, {
             rootDependencies: input.dependencies,
             upgrade: upgradePackages,
             previousSolution: previousSolutionUVs
           }));

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
        input.dependencies,
        constraintsWithPreviousSolutionLock, resolverOptions);
    } catch (e) {
      if (!(e.constraintSolverError))
        throw e;
    }
  }

  // Either we didn't have a previous solution, or it doesn't work. Try again
  // without locking in the previous solution as strict equality.
  if (!res) {
    try {
      res = resolver.resolve(input.dependencies, constraints, resolverOptions);
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
    res = resolver.resolve(input.dependencies, constraints, resolverOptions);
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

// Takes options {rootDependencies, previousSolution, upgrade}.
//
// Returns an object containing {costFunction, estimateCostFunction,
// combineCostFunction}.
var getCostFunction = function (resolver, options) {
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

  return {
    costFunction: function (state) {
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
            } else {
              // compatible but possibly newer
              // prefer the version closest to the older solution
              cost[MAJOR] += versionsDistance;
            }
          } else {
            // transitive dependency
            // prefer to have less changed transitive dependencies
            cost[MINOR] += versionsDistance === 0 ? 0 : 1;
          }
        } else {
          var latestDistance =
            PV.versionMagnitude(_.last(resolver.unitsVersions[uv.name]).version) -
            PV.versionMagnitude(uv.version);

          if (isRootDep[uv.name] || _.has(options.upgrade, uv.name)) {
            // preferably latest
            cost[MEDIUM] += latestDistance;
          } else {
            // transitive dependency
            // prefarable earliest possible to be conservative
            // How far is our choice from the most conservative version that
            // also matches our constraints?
            var minimal = state.constraints.getMinimalVersion(uv.name) || '0.0.0';
            cost[MINOR] += PV.versionMagnitude(uv.version) - PV.versionMagnitude(minimal);
          }
        }
      });

      return cost;
    },

    estimateCostFunction: function (state) {
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
    },

    combineCostFunction: function (costA, costB) {
      if (costA.length !== costB.length)
        throw new Error("Different cost types");

      var arr = [];
      _.each(costA, function (l, i) {
        arr.push(l + costB[i]);
      });

      return arr;
    }
  };
};
