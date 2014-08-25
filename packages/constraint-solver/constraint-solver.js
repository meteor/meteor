var semver = Npm.require('semver');

// Copied from archinfo.matches() in tools/
var archMatches = function (arch, baseArch) {
  return arch.substr(0, baseArch.length) === baseArch &&
    (arch.length === baseArch.length ||
     arch.substr(baseArch.length, 1) === ".");
};

ConstraintSolver = {};

// catalog is a catalog.Catalog object. We have to pass this in because
// we're in a package and can't require('release.js'). If this code
// moves to the tool, or if all of the tool code moves to a star, we
// should get cat from release.current.catalog rather than passing it
// in.
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

  // XXX in theory there might be different archs but in practice they are
  // always "os", "web.browser" and "web.cordova". Fix this once we
  // actually have different archs used.
  var allArchs = ["os", "web.browser", "web.cordova"];

  // We rely on sortedness in the constraint solver, since one of the cost
  // functions wants to be able to quickly find the earliest or latest version.
  var sortedVersions = self.catalog.getSortedVersions(packageName);
  _.each(sortedVersions, function (version) {
    var versionDef = self.catalog.getVersion(packageName, version);

    var unibuilds = {};

    _.each(allArchs, function (arch) {
      var unitName = packageName + "#" + arch;
      unibuilds[unitName] = new ConstraintSolver.UnitVersion(
        unitName, version, versionDef.earliestCompatibleVersion);
      self.resolver.addUnitVersion(unibuilds[unitName]);
    });

    _.each(versionDef.dependencies, function (dep, depName) {
      self._ensurePackageInfoLoaded(depName);

      _.each(dep.references, function (ref) {
        _.each(allArchs, function (arch) {
          if (archMatches(arch, ref.arch)) {
            var unitName = packageName + "#" + arch;
            var unitVersion = unibuilds[unitName];

            if (! unitVersion)
              throw new Error("A non-standard arch " + arch + " for package " + packageName);

            var targetUnitName = depName + "#" + arch;

            // Add the dependency if needed
            if (! ref.weak)
              unitVersion.addDependency(targetUnitName);

            // Add a constraint if such exists
            if (dep.constraint && dep.constraint !== "none") {
              var constraint =
                self.resolver.getConstraint(targetUnitName, dep.constraint);
              unitVersion.addConstraint(constraint);
            }
          }
        });
      });
    });

    // Every unibuild implies that if it is picked, other unibuilds are
    // constrained to the same version.
    _.each(unibuilds, function (unibuild, unibuildName) {
      _.each(unibuilds, function (other, otherUnibuildName) {
        if (unibuild === other)
          return;

        // Constraint is the exact same version of a unibuild
        var constraintStr = "=" + version;
        var constraint =
          self.resolver.getConstraint(otherUnibuildName, constraintStr);
        unibuild.addConstraint(constraint);
      });
    });
  });

  // We need to be aware of the earliestCompatibleVersion values for any
  // packages that are overridden by local packages, in order to evaluate
  // 'compatible-with' constraints that name that version.
  // (Some of the test fixtures don't bother to implement this method.)
  if (self.catalog.getForgottenECVs) {
    _.each(self.catalog.getForgottenECVs(packageName), function (ecv, version) {
      _.each(allArchs, function (arch) {
        var unitName = packageName + '#' + arch;
        self.resolver.addExtraECV(unitName, version, ecv);
      });
    });
  }
};

// dependencies - an array of string names of packages (not slices)
// constraints - an array of objects:
//  - packageName - string name
//  - version - string constraint (ex.: "1.2.3", ">=2.3.4", "=3.3.3")
// options:
//  - upgrade - list of dependencies for which upgrade is prioritized higher
//  than keeping the old version
//  - previousSolution - mapping from package name to a version that was used in
//  the previous constraint solver run
ConstraintSolver.PackagesResolver.prototype.resolve = function (
    dependencies, constraints, options) {
  var self = this;

  // clone because we mutate options
  options = _.extend({
    _testing: false,
    upgrade: []
  }, options || {});

  check(dependencies, [String]);

  check(constraints, [{
    packageName: String, version: String, type: String,
    constraintString: Match.Optional(Match.OneOf(String, null))
  }]);

  check(options, {
    _testing: Match.Optional(Boolean),
    upgrade: [String],
    previousSolution: Match.Optional(Object)
  });

  _.each(dependencies, function (packageName) {
    self._ensurePackageInfoLoaded(packageName);
  });
  _.each(constraints, function (constraint) {
    self._ensurePackageInfoLoaded(constraint.packageName);
  });
  _.each(options.previousSolution, function (version, packageName) {
    self._ensurePackageInfoLoaded(packageName);
  });

  // XXX glasser and ekate added this filter to strip some undefineds that
  // were causing crashes, but maybe the real answer is that there shouldn't
  // have been undefineds?
  if (options.previousSolution) {
    options.previousSolution = _.filter(_.flatten(_.map(options.previousSolution, function (version, packageName) {
      return _.map(self._unibuildsForPackage(packageName), function (unitName) {
        return self.resolver._unitsVersionsMap[unitName + "@" + version];
      });
    })), _.identity);
  }

  // split every package name to one or more archs belonging to that package
  // (["foobar"] => ["foobar#os", "foobar#web.browser", ...])
  // XXX for now just hardcode in all of the known architectures
  var upgradeUnibuilds = {};
  _.each(options.upgrade, function (packageName) {
    _.each(self._unibuildsForPackage(packageName), function (unibuildName) {
      upgradeUnibuilds[unibuildName] = true;
    });
  });
  options.upgrade = upgradeUnibuilds;

  var dc = self._splitDepsToConstraints(dependencies, constraints);

  options.rootDependencies = dc.dependencies;
  var resolverOptions = self._getResolverOptions(options);

  var res = null;
  // If a previous solution existed, try resolving with additional (weak)
  // equality constraints on all the versions from the previous solution (except
  // those we've explicitly been asked to update). If it's possible to solve the
  // constraints without changing any of the previous versions (though we may
  // add more choices in addition, or remove some now-unnecessary choices) then
  // that's our first try.
  if (!_.isEmpty(options.previousSolution)) {
    var constraintsWithPreviousSolutionLock = _.clone(dc.constraints);
    _.each(options.previousSolution, function (uv) {
      if (!_.has(options.upgrade, uv.name)) {
        constraintsWithPreviousSolutionLock.push(
          self.resolver.getConstraint(uv.name, '=' + uv.version));
      }
    });
    try {
      // Try running the resolver. If it fails to resolve, that's OK, we'll keep
      // working.
      res = self.resolver.resolve(
        dc.dependencies, constraintsWithPreviousSolutionLock, resolverOptions);
    } catch (e) {
      if (!(e.constraintSolverError))
        throw e;
    }
  }

  if (!res) {
    // Either we didn't have a previous solution, or it doesn't work. Try again
    // without locking in the previous solution as strict equality.

    res = self.resolver.resolve(
      dc.dependencies, dc.constraints, resolverOptions);
  }

  return resolverResultToPackageMap(res);
};

var removeUnibuild = function (unitName) {
  return unitName.split('#')[0];
};

var resolverResultToPackageMap = function (choices) {
  var packageMap = {};
  mori.each(choices, function (nameAndUv) {
    var name = mori.first(nameAndUv);
    var uv = mori.last(nameAndUv);
    // Since we don't yet define the interface for a an app to depend only on
    // certain unibuilds of the packages (like only web unibuilds) and we know
    // that each unibuild weakly depends on other sibling unibuilds of the same
    // version, we can safely output the whole package for each unibuild in the
    // result.
    packageMap[removeUnibuild(name)] = uv.version;
  });
  return packageMap;
};


// takes dependencies and constraints and rewrites the names from "foo" to
// "foo#os" and "foo#web.browser" and "foo#web.cordova"
// XXX right now creates a dependency for every unibuild it can find
ConstraintSolver.PackagesResolver.prototype._splitDepsToConstraints =
  function (inputDeps, inputConstraints) {
  var self = this;
  var dependencies = [];
  var constraints = [];

  _.each(inputDeps, function (packageName) {
    _.each(self._unibuildsForPackage(packageName), function (unibuildName) {
      dependencies.push(unibuildName);
    });
  });

  _.each(inputConstraints, function (constraint) {
    if (!semver.valid(constraint.version))
      throw Error("Bad semver: " + constraint.version);
    var operator = "";
    if (constraint.type === "exactly")
      operator = "=";
    if (constraint.type === "at-least")
      operator = ">=";
    var constraintStr = operator + constraint.version;

    _.each(self._unibuildsForPackage(constraint.packageName), function (unibuildName) {
      constraints.push(self.resolver.getConstraint(unibuildName, constraintStr));
    });
  });

  return { dependencies: dependencies, constraints: constraints };
};

ConstraintSolver.PackagesResolver.prototype._unibuildsForPackage =
  function (packageName) {
  var self = this;
  var unibuildPrefix = packageName + "#";
  var unibuilds = [];
  // XXX hardcode all common architectures assuming that every package has the
  // same set of architectures.
  _.each(["os", "web.browser", "web.cordova"], function (arch) {
    unibuilds.push(unibuildPrefix + arch);
  });

  return unibuilds;
};

ConstraintSolver.PackagesResolver.prototype._getResolverOptions =
  function (options) {
  var self = this;

  var semverToNum = function (version) {
    var v = semver.parse(version);
    return v.major * 10000 + v.minor * 100 + v.patch;
  };

  var resolverOptions = {};

  if (options._testing) {
    resolverOptions.costFunction = function (state) {
      return mori.reduce(mori.sum, 0, mori.map(function (nameAndUv) {
        return semverToNum(mori.last(nameAndUv).version);
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
            semverToNum(uv.version) -
            semverToNum(prev.version);

          var isCompatible =
                prev.earliestCompatibleVersion === uv.earliestCompatibleVersion;

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
            semverToNum(_.last(self.resolver.unitsVersions[uv.name]).version) -
            semverToNum(uv.version);

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
            cost[MINOR] += semverToNum(uv.version) - semverToNum(minimal);
            options.debug && console.log("transitive: ", uv.name, "=>", uv.version)
          }
        }
      });

      return cost;
    };

    resolverOptions.estimateCostFunction = function (state, options) {
      options = options || {};

      var constraints = state.constraints;
      var cost = [0, 0, 0, 0];

      state.eachDependency(function (dep, alternatives) {
        // XXX don't try to estimate transitive dependencies
        if (! isRootDep[dep]) {
          cost[MINOR] += 10000000;
          return;
        }

        if (_.has(prevSolMapping, dep)) {
          var prev = prevSolMapping[dep];
          var prevVersionMatches = constraints.isSatisfied(prev, self.resolver);

          // if it matches, assume we would pick it and the cost doesn't
          // increase
          if (prevVersionMatches)
            return;

          // Get earliest matching version.
          var earliestMatching = mori.first(alternatives);

          var isCompatible =
                prev.earliestCompatibleVersion === earliestMatching.earliestCompatibleVersion;
          if (! isCompatible) {
            cost[VMAJOR]++;
            return;
          }

          var versionsDistance =
            semverToNum(earliestMatching.version) -
            semverToNum(prev.version);
          if (versionsDistance < 0) {
            cost[VMAJOR]++;
            return;
          }

          cost[MAJOR] += versionsDistance;
        } else {
          var versions = self.resolver.unitsVersions[dep];
          var latestMatching = mori.last(alternatives);

          var latestDistance =
            semverToNum(_.last(self.resolver.unitsVersions[dep]).version) -
            semverToNum(latestMatching.version);

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
