ConstraintSolver = {};

// `catalog` has the following method:
//
// * getSortedVersionRecords(packageName) ->
//     [{packageName, version, dependencies}]
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

  self.catalog = catalog;

  // The main resolver
  self.resolver = new ConstraintSolver.Resolver({
    nudge: options.nudge
  });

  self._packageInfoLoadQueue = [];
  self._packagesEverEnqueued = {};
  self._loadingPackageInfo = false;
};

ConstraintSolver.PackagesResolver.prototype._ensurePackageInfoLoaded = function (
    packageName) {
  var self = this;
  if (_.has(self._packagesEverEnqueued, packageName))
    return;
  self._packagesEverEnqueued[packageName] = true;
  self._packageInfoLoadQueue.push(packageName);

  // Is there already an instance of _ensurePackageInfoLoaded up the stack?
  // Great, it'll get this.
  // XXX does this work correctly with multiple fibers?
  if (self._loadingPackageInfo)
    return;

  self._loadingPackageInfo = true;
  try {
    while (self._packageInfoLoadQueue.length) {
      var nextPackageName = self._packageInfoLoadQueue.shift();
      self._loadPackageInfo(nextPackageName);
    }
  } finally {
    self._loadingPackageInfo = false;
  }
};

ConstraintSolver.PackagesResolver.prototype._loadPackageInfo = function (
    packageName) {
  var self = this;

  // We rely on sortedness in the constraint solver, since one of the cost
  // functions wants to be able to quickly find the earliest or latest version.
  var sortedVersionRecords = self.catalog.getSortedVersionRecords(packageName);
  _.each(sortedVersionRecords, function (versionDef) {
    var version = versionDef.version;

    var unitVersion = new ConstraintSolver.UnitVersion(packageName, version);
    self.resolver.addUnitVersion(unitVersion);

    _.each(versionDef.dependencies, function (dep, depName) {
      self._ensurePackageInfoLoaded(depName);

      // "dep" contains a list of references, which describes which unibuilds of
      // this unitVersion depend on depName, as well as a constraint, which
      // constraints the versions it depends on.

      // The package->package dependency is weak if ALL of the underlying
      // unibuild->unibuild dependencies are weak.  ie,
      //     api.use('dep', 'server', { weak: true });
      //     api.use('dep', 'client');
      // is not weak at the package->package level.
      var createsDependency = _.any(dep.references, function (ref) {
        return !ref.weak;
      });

      // Add the dependency if needed.
      if (createsDependency)
        unitVersion.addDependency(depName);

      // Add a constraint if needed.
      if (dep.constraint && dep.constraint !== "none") {
        var constraint = self.resolver.getConstraint(depName, dep.constraint);
        unitVersion.addConstraint(constraint);
      }
    });
  });
};

// dependencies - an array of string names of packages (not slices)
// constraints - an array of objects:
//  (almost, but not quite, what PackageVersion.parseConstraint returns)
//  - packageName - string name
//  - version - string constraint
//  - type - constraint type
// options:
//  - upgrade - list of dependencies for which upgrade is prioritized higher
//    than keeping the old version
//  - previousSolution - mapping from package name to a version that was used in
//    the previous constraint solver run
//  - anticipatedPrereleases: mapping from package name to version to true;
//    included versions are the only pre-releases that are allowed to match
//    constraints that don't specifically name them during the "try not to
//    use unanticipated pre-releases" pass
ConstraintSolver.PackagesResolver.prototype.resolve = function (
    dependencies, constraints, options) {
  var self = this;
  // clone because we mutate options
  options = _.extend({
    _testing: false,
    upgrade: [],
    anticipatedPrereleases: {}
  }, options || {});

  check(dependencies, [String]);

  check(constraints, [{
    name: String,
    constraintString: Match.Optional(Match.OneOf(String, undefined)),
    constraints: [{
      version: Match.OneOf(String, null),
      type: String }]
  }]);

  check(options, {
    _testing: Match.Optional(Boolean),
    upgrade: [String],
    previousSolution: Match.Optional(Object),
    anticipatedPrereleases: Match.Optional(
      Match.ObjectWithValues(Match.ObjectWithValues(Boolean)))
  });

  _.each(dependencies, function (packageName) {
    self._ensurePackageInfoLoaded(packageName);
  });
  _.each(constraints, function (constraint) {
    self._ensurePackageInfoLoaded(constraint.name);
  });
  _.each(options.previousSolution, function (version, packageName) {
    self._ensurePackageInfoLoaded(packageName);
  });

  if (options.previousSolution) {
    // Replace previousSolution map with a list of the UnitVersions that we know
    // about that were mentioned.  (_.compact drops unknown UnitVersions.)
    options.previousSolution = _.compact(
      _.map(options.previousSolution, function (version, packageName) {
        return self.resolver.getUnitVersion(packageName, version);
      }));
  }

  // Convert options.upgrade to a map for O(1) access.
  // XXX we should probably just change the API so it's passed in this way
  var upgradePackages = {};
  _.each(options.upgrade, function (packageName) {
    upgradePackages[packageName] = true;
  });
  options.upgrade = upgradePackages;

  constraints = self._makeConstraintObjects(constraints);

  options.rootDependencies = dependencies;
  var resolverOptions = self._getResolverOptions(options);
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
  if (!_.isEmpty(options.previousSolution) && _.isEmpty(options.upgrade)) {
    var constraintsWithPreviousSolutionLock = _.clone(constraints);
    _.each(options.previousSolution, function (uv) {
      constraintsWithPreviousSolutionLock.push(
        self.resolver.getConstraint(uv.name, '=' + uv.version));
    });
    try {
      // Try running the resolver. If it fails to resolve, that's OK, we'll keep
      // working.
      res = self.resolver.resolve(
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
      res = self.resolver.resolve(dependencies, constraints, resolverOptions);
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
    res = self.resolver.resolve(dependencies, constraints, resolverOptions);
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


ConstraintSolver.PackagesResolver.prototype._makeConstraintObjects = function (
    inputConstraints) {
  var self = this;
  return _.map(inputConstraints, function (constraint) {
    return self.resolver.getConstraint(
      constraint.name, constraint.constraintString);
  });
};

ConstraintSolver.PackagesResolver.prototype._getResolverOptions =
  function (options) {
  var self = this;

  var resolverOptions = {
    anticipatedPrereleases: options.anticipatedPrereleases
  };

  if (options._testing) {
    resolverOptions.costFunction = function (state) {
      return mori.reduce(mori.sum, 0, mori.map(function (nameAndUv) {
        return PackageVersion.versionMagnitude(mori.last(nameAndUv).version);
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
            PackageVersion.versionMagnitude(uv.version) -
            PackageVersion.versionMagnitude(prev.version);

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
            PackageVersion.versionMagnitude(_.last(self.resolver.unitsVersions[uv.name]).version) -
            PackageVersion.versionMagnitude(uv.version);

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
            cost[MINOR] += PackageVersion.versionMagnitude(uv.version) - PackageVersion.versionMagnitude(minimal);
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
            PackageVersion.versionMagnitude(earliestMatching.version) -
            PackageVersion.versionMagnitude(prev.version);
          if (versionsDistance < 0) {
            cost[VMAJOR]++;
            return;
          }

          cost[MAJOR] += versionsDistance;
        } else {
          var versions = self.resolver.unitsVersions[dep];
          var latestMatching = mori.last(alternatives);

          var latestDistance =
            PackageVersion.versionMagnitude(
              _.last(self.resolver.unitsVersions[dep]).version) -
            PackageVersion.versionMagnitude(latestMatching.version);

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
