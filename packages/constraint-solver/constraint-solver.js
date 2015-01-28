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

  return newResolveWithInput(input, this._options.nudge);
};

var newResolveWithInput = function (input, _nudge) {
  if (input.previousSolution || input.upgrade.length) {
    // XXX Bail out to the old solver for now.
    console.log("Bailing to old solver...");
    return CS.PackagesResolver._resolveWithInput(input, _nudge);
  }
  console.log("Using new solver...");

  var cache = input.catalogCache;

  // Packages that are mentioned but aren't found in the CatalogCache
  var unknownPackages = {}; // package name -> true
  var packageVersionsRequiringPackage = {}; // package -> [package-and-version]
  var rootDeps = {}; // package name -> true
  _.each(input.dependencies, function (p) {
    if (! cache.hasPackage(p)) {
      unknownPackages[p] = true;
    }
    rootDeps[p] = true;
  });

  var solver = new Logic.Solver;

  var resolverOptions = {
    anticipatedPrereleases: input.anticipatedPrereleases
  };

  var allConstraints = [];

  var addConstraint = function (pv, p2, vConstraint) {
    var p2Versions = cache.getPackageVersions(p2);
    var okVersions = _.filter(p2Versions, function (v2) {
      return CS.isConstraintSatisfied(p2, vConstraint,
                                      v2, resolverOptions);
    });
    var okPVersions = _.map(okVersions, function (v2) {
      return p2 + ' ' + v2;
    });
    // If we select this version of `p` and we select some version
    // of `p2`, we must select an "ok" version.
    var constraintName = "constraint#" + allConstraints.length;
    allConstraints.push([pv, p2, vConstraint]);
    if (pv !== null) {
      solver.require(Logic.implies(constraintName,
                                   Logic.or(Logic.not(pv),
                                            Logic.not(p2),
                                            okPVersions)));
    } else {
      solver.require(Logic.implies(constraintName,
                                   Logic.or(Logic.not(p2),
                                            okPVersions)));
    }
  };

  cache.eachPackage(function (p, versions) {
    // ["foo 1.0.0", "foo 1.0.1", ...] for a given "foo"
    var packageAndVersions = _.map(versions, function (v) {
      return p + ' ' + v;
    });
    // At most one of ["foo 1.0.0", "foo 1.0.1", ...] is true.
    solver.require(Logic.atMostOne(packageAndVersions));
    // The variable "foo" is true if and only if at least one of the
    // variables ["foo 1.0.0", "foo 1.0.1", ...] is true.
    solver.require(Logic.equiv(p, Logic.or(packageAndVersions)));

    _.each(versions, function (v) {
      var pv = p + ' ' + v;
      _.each(cache.getDependencyMap(p, v), function (dep) {
        // `dep` is a CS.Dependency
        var p2 = dep.pConstraint.name;
        if (! cache.hasPackage(p2)) {
          unknownPackages[p2] = true;
        }
        var constr = dep.pConstraint.constraintString;
        if (! dep.isWeak) {
          packageVersionsRequiringPackage[p2] =
            (packageVersionsRequiringPackage[p2] || []);
          packageVersionsRequiringPackage[p2].push(pv);
        }
        if (constr) {
          addConstraint(pv, p2, dep.pConstraint.vConstraint);
        }
      });
    });
  });

  _.each(packageVersionsRequiringPackage, function (pvs, p) {
    // pvs are all the package-and-versions that require p.
    // We want to select p if-and-only-if we select one of the pvs
    // (except for top-level dependencies).
    if (! _.has(rootDeps, p)) {
      solver.require(Logic.equiv(p, Logic.or(pvs)));
    }
  });

  // For good measure, disallow any packages that were mentioned in
  // dependencies or constraints but aren't available in the catalog.
  solver.forbid(_.keys(unknownPackages));

  solver.require(input.dependencies);

  _.each(input.constraints, function (c) {
    addConstraint(null, c.name, c.vConstraint);
  });

  var allConstraintVars = _.map(allConstraints, function (c, i) {
      return "constraint#" + i;
  });
  var allConstraintsOn = Logic.and(allConstraintVars);

  var solution = solver.solveAssuming(allConstraintsOn);

  if (! solution) {
    var errorMessage;
    var looseSolution = solver.solve();
    if (! looseSolution) {
      errorMessage = 'unknown package';
    } else {
      // try to use as many constraints as possible
      looseSolution = solver.maximize(looseSolution, allConstraintVars, 1);
      var numConstraintsOn = looseSolution.getWeightedSum(allConstraintVars, 1);
      console.log(">>> Needed to remove " + (allConstraints.length -
                                             numConstraintsOn) + " constraints" +
                  " to get a solution.");
      for (var i = 0; i < allConstraints.length; i++) {
        if (! looseSolution.evaluate("constraint#" + i)) {
          console.log("Skipped: " + JSON.stringify(allConstraints[i]));
        }
      }
      errorMessage = 'conflict';
    }
    var e = new Error(errorMessage);
    e.constraintSolverError = true;
    throw e;
  }

  solver.require(allConstraintsOn);

  // optimize
  _.each(solution.getTrueVars(), function (x) {
    if (x.indexOf(' ') >= 0) {
      var pv = CS.PackageAndVersion.fromString(x);
      var package = pv.package;
      var version = pv.version;
      var otherVersions = cache.getPackageVersions(package); // sorted

      if (_.has(rootDeps, package)) {
        // try to make newer
        _.find(otherVersions, function (v) {
          var trialPV = package + ' ' + v;
          if (PV.lessThan(v, version)) {
            solver.forbid(trialPV);
          } else {
            var newSolution = solver.solveAssuming(Logic.not(trialPV));
            if (newSolution) {
              solution = newSolution;
              solver.forbid(trialPV);
            } else {
              return true;
            }
          }
          return false;
        });
      }
    }
  });
  _.each(solution.getTrueVars(), function (x) {
    if (x.indexOf(' ') >= 0) {
      var pv = CS.PackageAndVersion.fromString(x);
      var package = pv.package;
      var version = pv.version;
      var otherVersions = cache.getPackageVersions(package); // sorted

      if (! _.has(rootDeps, package)) {
        // try to make older
        otherVersions = _.clone(otherVersions);
        otherVersions.reverse();
        _.find(otherVersions, function (v) {
          var trialPV = package + ' ' + v;
          if (PV.lessThan(version, v)) {
            solver.forbid(trialPV);
          } else {
            var newSolution = solver.solveAssuming(Logic.not(trialPV));
            if (newSolution) {
              solution = newSolution;
              solver.forbid(trialPV);
            } else {
              return true;
            }
          }
          return false;
        });
      }
    }
  });

  // read out solution
  var versionMap = {};
  _.each(solution.getTrueVars(), function (x) {
    if (x.indexOf(' ') >= 0) {
      var pv = CS.PackageAndVersion.fromString(x);
      versionMap[pv.package] = pv.version;
    }
  });

  return {
    neededToUseUnanticipatedPrereleases: false, // XXX
    answer: versionMap
  };
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

// - package: String package name
// - vConstraint: a PackageVersion.VersionConstraint, or an object
//   with an `alternatives` property lifted from one.
// - version: version String
// - options: any object with an "anticipatedPrereleases" property.
CS.isConstraintSatisfied = function (package, vConstraint, version, options) {

  var prereleaseNeedingLicense = false;

  // We try not to allow "pre-release" versions (versions with a '-') unless
  // they are explicitly mentioned.  If the `anticipatedPrereleases` option is
  // `true` set, all pre-release versions are allowed.  Otherwise,
  // anticipatedPrereleases lists pre-release versions that are always allow
  // (this corresponds to pre-release versions mentioned explicitly in
  // *top-level* constraints).
  //
  // Otherwise, if `candidateUV` is a pre-release, it needs to be "licensed" by
  // being mentioned by name in *this* constraint or matched by an inexact
  // constraint whose version also has a '-'.
  //
  // Note that a constraint "@2.0.0" can never match a version "2.0.1-rc.1"
  // unless anticipatedPrereleases allows it, even if another constraint found
  // in the graph (but not at the top level) explicitly mentions "2.0.1-rc.1".
  // Why? The constraint solver assumes that adding a constraint to the resolver
  // state can't make previously impossible choices now possible.  If
  // pre-releases mentioned anywhere worked, then applying the constraint
  // "@2.0.0" followed by "@=2.0.1-rc.1" would result in "2.0.1-rc.1" ruled
  // first impossible and then possible again. That will break this algorith, so
  // we have to fix the meaning based on something known at the start of the
  // search.  (We could try to apply our prerelease-avoidance tactics solely in
  // the cost functions, but then it becomes a much less strict rule.)
  if (options.anticipatedPrereleases !== true
      && /-/.test(version)) {
    var isAnticipatedPrerelease = (
      _.has(options.anticipatedPrereleases, package) &&
        _.has(options.anticipatedPrereleases[package], version));
    if (! isAnticipatedPrerelease) {
      prereleaseNeedingLicense = true;
    }
  }

  return _.some(vConstraint.alternatives, function (simpleConstraint) {
    var type = simpleConstraint.type;

    if (type === "any-reasonable") {
      return ! prereleaseNeedingLicense;
    } else if (type === "exactly") {
      var cVersion = simpleConstraint.versionString;
      return (cVersion === version);
    } else if (type === 'compatible-with') {
      var cv = PV.parse(simpleConstraint.versionString);
      var v = PV.parse(version);

      if (prereleaseNeedingLicense && ! /-/.test(cv.raw)) {
        return false;
      }

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
