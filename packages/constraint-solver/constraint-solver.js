// `catalog` has the following methods:
//
// * getSortedVersions(packageName) -> [String]
// * getVersion(packageName, version) -> {
//     packageName, version, dependencies }
//
// Where `dependencies` is a map from packageName to
// an object of the form `{ constraint: String,
// references: [{arch: String, optional "weak": true}] }`.
//
// TODO: Abstract away the catalog by pulling out the code that
// interfaces with it.  We shouldn't have to stub the catalog in
// tests or conform to its format anywhere in order to, say,
// run the solver with a real cost function.
ConstraintSolver.PackagesResolver = function (catalog, options) {
  var self = this;

  options = options || {};
  self._options = _.clone(options);

  self.catalog = catalog;
  self.catalogCache = new CatalogCache();
  self.catalogLoader = new CatalogLoader(catalog, self.catalogCache);
};

// dependencies - an array of string names of packages (not slices)
// constraints - an array of objects:
//  (almost, but not quite, what PVP.parseConstraint returns)
//  - packageName - string name
//  - version - string constraint
//  - type - constraint type
// options:
//  - upgrade - list of dependencies for which upgrade is prioritized higher
//  than keeping the old version
//  - previousSolution - mapping from package name to a version that was used in
//  the previous constraint solver run
ConstraintSolver.PackagesResolver.prototype.resolve = function (
    dependencies, constraints, options) {
  var self = this;

  var resolver = new ConstraintSolver.Resolver({
    nudge: self._options.nudge
  });

  // clone because we mutate options
  options = _.extend({
    _testing: false,
    upgrade: []
  }, options || {});

  check(dependencies, [String]);

  check(constraints, [{
    name: String,
    constraintString: Match.Optional(Match.OneOf(String, undefined)),
    alternatives: [{
      version: Match.OneOf(String, null),
      type: String }]
  }]);

  check(options, {
    _testing: Match.Optional(Boolean),
    _testCostFunction: Match.Optional(String),
    upgrade: [String],
    previousSolution: Match.Optional(Object)
  });

  // Get rid of "any-reasonable" constraints, which are no-ops
  constraints = _.compact(_.map(constraints, function (c) {
    if (_.any(c.alternatives,
              function (x) { return x.type === 'any-reasonable'; })) {
      var newAlternatives = _.filter(c.alternatives, function (x) {
        return x.type !== 'any-reasonable';
      });
      if (! newAlternatives.length) {
        return null;
      } else {
        return _.extend({}, c, { alternatives: newAlternatives });
      }
    } else {
      return c;
    }
  }));

  var packagesToLoad = {}; // package -> true

  _.each(dependencies, function (packageName) {
    packagesToLoad[packageName] = true;
  });
  _.each(constraints, function (constraint) {
    packagesToLoad[constraint.name] = true;
  });
  _.each(options.previousSolution, function (version, packageName) {
    packagesToLoad[packageName] = true;
  });

  self.catalogLoader.loadAllVersionsRecursive(_.keys(packagesToLoad));

  self.catalogCache.eachPackageVersion(function (pv, depsMap) {
    var uv = new ConstraintSolver.UnitVersion(pv.package, pv.version);
    // XXX technically, we should ensure that UnitVersions are added in
    // version order, but in practice, they already are as long as
    // the CatalogCache was populated in version order (and JavaScript
    // key order is preserved).  The new solver will make this code
    // obsolete.
    resolver.addUnitVersion(uv);

    _.each(depsMap, function (dep) {
      // `dep` is a ConstraintSolver.Dependency object
      if (! dep.weak) {
        uv.addDependency(dep.package);
      }

      if (dep.constraint) {
        uv.addConstraint(resolver.getConstraint(dep.package,
                                                dep.constraint.toString()));
      }
    });
  });

  if (options.previousSolution) {
    // Replace previousSolution map with a list of the UnitVersions that we know
    // about that were mentioned.  (_.compact drops unknown UnitVersions.)
    options.previousSolution = _.compact(
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
  options.upgrade = upgradePackages;

  constraints = _.map(constraints, function (c) {
    return resolver.getConstraint(c.name, c.constraintString);
  });

  options.rootDependencies = dependencies;
  var resolverOptions = self._getResolverOptions(resolver, options);
  var res = null;
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
  if (!_.isEmpty(options.previousSolution) && _.isEmpty(options.upgrade)) {
    var constraintsWithPreviousSolutionLock = _.clone(constraints);
    _.each(options.previousSolution, function (uv) {
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

  // As a last-ditch effort, let's take a look at all the prerelease
  // versions. Is it possible that a pre-release version will satisfy our
  // constraints?
  if (!res) {
    resolverOptions["useRCs"] = true;
    res = resolver.resolve(dependencies, constraints, resolverOptions);
  }
  var ret = { answer:  resolverResultToPackageMap(res) };
  if (resolverOptions.useRCs)
    ret.usedRCs = true;
  return ret;
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

ConstraintSolver.PackagesResolver.prototype._getResolverOptions =
  function (resolver, options) {
  var self = this;

  var resolverOptions = {};

  if (options._testing) {
    var costFunc = (options._testCostFunction || 'earlierBetter');
    if (costFunc === 'earlierBetter') {
      resolverOptions.costFunction = function (state) {
        return mori.reduce(mori.sum, 0, mori.map(function (nameAndUv) {
          return PVP.versionMagnitude(mori.last(nameAndUv).version);
        }, state.choices));
      };
    } else if (costFunc === 'laterBetter') {
      resolverOptions.costFunction = function (state) {
        return - mori.reduce(mori.sum, 0, mori.map(function (nameAndUv) {
          return PVP.versionMagnitude(mori.last(nameAndUv).version);
        }, state.choices));
      };
    } else {
      throw new Error("Unknown _testCostFunction: " + costFunc);
    }
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
            PVP.versionMagnitude(uv.version) -
            PVP.versionMagnitude(prev.version);

          var isCompatible = prev.majorVersion === uv.majorVersion;

          if (isRootDep[uv.name]) {
            // root dependency
            if (versionsDistance < 0 || ! isCompatible) {
              // the new pick is older or is incompatible with the prev. solution
              // i.e. can have breaking changes, prefer not to do this
              // XXX in fact we want to avoid downgrades to the direct
              // dependencies at all cost.
              cost[VMAJOR]++;
              options.debug && console.log("root & *not* compatible: ", uv.name, prev.version, "=>", uv.version)
            } else {
              // compatible but possibly newer
              // prefer the version closest to the older solution
              cost[MAJOR] += versionsDistance;
              options.debug && console.log("root & compatible: ", uv.name, prev.version, "=>", uv.version)
            }
          } else {
            // transitive dependency
            // prefer to have less changed transitive dependencies
            cost[MINOR] += versionsDistance === 0 ? 0 : 1;
            options.debug && console.log("transitive: ", uv.name, prev.version, "=>", uv.version)
          }
        } else {
          var latestDistance =
            PVP.versionMagnitude(_.last(resolver.unitsVersions[uv.name]).version) -
            PVP.versionMagnitude(uv.version);

          if (isRootDep[uv.name]) {
            // root dependency
            // preferably latest
            cost[MEDIUM] += latestDistance;
            options.debug && console.log("root: ", uv.name, "=>", uv.version)
          } else {
            // transitive dependency
            // prefarable earliest possible to be conservative
            // How far is our choice from the most conservative version that
            // also matches our constraints?
            var minimal = state.constraints.getMinimalVersion(uv.name) || '0.0.0';
            cost[MINOR] += PVP.versionMagnitude(uv.version) - PVP.versionMagnitude(minimal);
            options.debug && console.log("transitive: ", uv.name, "=>", uv.version)
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
            PVP.versionMagnitude(earliestMatching.version) -
            PVP.versionMagnitude(prev.version);
          if (versionsDistance < 0) {
            cost[VMAJOR]++;
            return;
          }

          cost[MAJOR] += versionsDistance;
        } else {
          var versions = resolver.unitsVersions[dep];
          var latestMatching = mori.last(alternatives);

          var latestDistance =
            PVP.versionMagnitude(
              _.last(resolver.unitsVersions[dep]).version) -
            PVP.versionMagnitude(latestMatching.version);

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
