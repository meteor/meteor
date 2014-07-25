var semver = Npm.require('semver');

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
  self.resolver = new ConstraintSolver.Resolver();

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
  // XXX is sortedness actually relevant? is there a minor optimization here
  //     where we can only talk to self.catalog once?
  var sortedVersions = self.catalog.getSortedVersions(packageName);
  // XXX throw error if the package doesn't exist?
  _.each(sortedVersions, function (version) {
    var versionDef = self.catalog.getVersion(packageName, version);

    var unibuilds = {};

    // XXX in theory there might be different archs but in practice they are
    // always "os" and "browser". Fix this once we actually have different
    // archs used.
    _.each(["os", "browser"], function (arch) {
      var unitName = packageName + "#" + arch;
      unibuilds[unitName] = new ConstraintSolver.UnitVersion(
        unitName, version, versionDef.earliestCompatibleVersion);
      self.resolver.addUnitVersion(unibuilds[unitName]);
    });

    _.each(versionDef.dependencies, function (dep, depName) {
      self._ensurePackageInfoLoaded(depName);

      _.each(dep.references, function (ref) {
        var unitName = packageName + "#" + ref.arch;
        var unitVersion = unibuilds[unitName];

        if (! unitVersion)
          throw new Error("A non-standard arch " + ref.arch + " for package " + packageName);

        var targetUnitName = depName + "#" + ref.arch;

        // Add the dependency if needed
        if (! ref.weak)
          unitVersion.addDependency(targetUnitName);

        // Add a constraint if such exists
        if (dep.constraint && dep.constraint !== "none") {
          var constraint =
            self.resolver.getConstraint(targetUnitName, dep.constraint);
          unitVersion.addConstraint(constraint);
        }
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
};

// dependencies - an array of string names of packages (not slices)
// constraints - an array of objects:
//  - packageName - string name
//  - version - string constraint (ex.: "1.2.3", ">=2.3.4", "=3.3.3")
// options:
//  - breaking - set this flag to true if breaking upgrades are allowed
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
    breaking: false,
    upgrade: []
  }, options || {});

  check(dependencies, [String]);

  check(constraints, [{
    packageName: String, version: String, type: String,
    constraintString: Match.Optional(Match.OneOf(String, null))
  }]);

  check(options, {
    _testing: Match.Optional(Boolean),
    breaking: Match.Optional(Boolean),
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
      return _.map(self._unibuildsForPackage(packageName, true), function (unitName) {
        return self.resolver._unitsVersionsMap[unitName + "@" + version];
      });
    })), _.identity);
  }

  // split every package name to one or more archs belonging to that package
  // (["foobar"] => ["foobar#os", "foobar#browser"])
  // XXX for now just put #os and #browser
  options.upgrade = _.filter(_.flatten(_.map(options.upgrade, function (packageName) {
    return [packageName + "#os", packageName + "#browser"];
  })), _.identity);

  var dc = self._splitDepsToConstraints(dependencies, constraints);

  // Never allow to downgrade a version of a direct dependency in regards to the
  // previous solution.
  // Depending on whether the option `breaking` is set or not, allow only
  // compatible upgrades or any upgrades.
  _.each(options.previousSolution, function (uv) {
    // if not a root dependency, there is no 'no-upgrade' constraint
    if (! _.contains(dependencies, uv.name))
      return;

    var constrType = options.breaking ? ">=" : "";
    dc.constraints.push(
      self.resolver.getConstraint(uv.name, constrType + uv.version));
  });

  options.rootDependencies = dc.dependencies;


  var resolverOptions = self._getResolverOptions(options, dc);

  // XXX resolver.resolve can throw an error, should have error handling with
  // proper error translation.
  var res = self.resolver.resolve(dc.dependencies, dc.constraints, resolverOptions);

  var resultChoices = {};
  _.each(res, function (uv) {
    // Since we don't yet define the interface for a an app to depend only on
    // certain unibuilds of the packages (like only browser unibuilds) and we know
    // that each unibuild weakly depends on other sibling unibuilds of the same
    // version, we can safely output the whole package for each unibuild in the
    // result.
    resultChoices[uv.name.split('#')[0]] = uv.version;
  });

  return resultChoices;
};

// This method, along with the stopAfterFirstPropagation, are designed for
// tests; they allow us to test Resolver._propagateExactTransDeps but with an
// interface that's a little more like PackagesResolver.resolver.
ConstraintSolver.PackagesResolver.prototype.propagateExactDeps =
  function (dependencies, constraints) {
  var self = this;

  check(dependencies, [String]);
  check(constraints, [{ packageName: String, version: String, type: String }]);

  _.each(dependencies, function (packageName) {
    self._ensurePackageInfoLoaded(packageName);
  });
  _.each(constraints, function (constraint) {
    self._ensurePackageInfoLoaded(constraint.packageName);
  });

  var dc = self._splitDepsToConstraints(dependencies, constraints);

  // XXX resolver.resolve can throw an error, should have error handling with
  // proper error translation.
  var res = self.resolver.resolve(dc.dependencies, dc.constraints,
                                  { stopAfterFirstPropagation: true });

  var resultChoices = {};
  _.each(res, function (uv) {
    resultChoices[uv.name.split('#')[0]] = uv.version;
  });

  return resultChoices;
};

// takes dependencies and constraints and rewrites the names from "foo" to
// "foo#os" and "foo#browser"
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
  function (packageName, unknownOk) {
  var self = this;
  var unibuildPrefix = packageName + "#";
  var unibuilds = [];
  // XXX hardcode os and browser
  _.each(["os", "browser"], function (arch) {
    if (self.resolver.unitsVersions[unibuildPrefix + arch])
      unibuilds.push(unibuildPrefix + arch);
  });

  if (_.isEmpty(unibuilds) && !unknownOk)
    throw new Error("Cannot find anything about package -- " + packageName);

  return unibuilds;
};

ConstraintSolver.PackagesResolver.prototype._getResolverOptions =
  function (options, dc) {
  var self = this;

  var semverToNum = function (version) {
    var v = semver.parse(version);
    return v.major * 10000 + v.minor * 100 + v.patch;
  };

  var resolverOptions = {};

  if (options._testing) {
    resolverOptions.costFunction = function (state) {
      var choices = state.choices;
      return _.reduce(choices, function (sum, uv) {
        return semverToNum(uv.version) + sum;
      }, 0);
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
      if (! _.contains(options.upgrade, uv.name))
        prevSolMapping[uv.name] = uv;
    });

    resolverOptions.costFunction = function (state, options) {
      options = options || {};
      var choices = state.choices;
      var constraints = state.constraints;
      // very major, major, medium, minor costs
      // XXX maybe these can be calculated lazily?
      var cost = [0, 0, 0, 0];

      var minimalConstraint = {};
      constraints.each(function (c) {
        if (! _.has(minimalConstraint, c.name))
          minimalConstraint[c.name] = c.version;
        else if (semver.lt(c.version, minimalConstraint[c.name]))
          minimalConstraint[c.name] = c.version;
      });

      _.each(choices, function (uv) {
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
            cost[MINOR] += versionsDistance === 0 ? 1 : 0;
            options.debug && console.log("transitive: ", uv.name, prev.version, "=>", uv.version)
          }
        } else {
          var latestDistance =
            semverToNum(self.resolver._latestVersion[uv.name]) -
            semverToNum(uv.version);

          if (isRootDep[uv.name]) {
            // root dependency
            // preferably latest
            cost[MEDIUM] += latestDistance;
            options.debug && console.log("root: ", uv.name, "=>", uv.version)
          } else {
            // transitive dependency
            // prefarable earliest possible to be conservative
            cost[MINOR] += semverToNum(uv.version) -
              semverToNum(minimalConstraint[uv.name] || "0.0.0");
            options.debug && console.log("transitive: ", uv.name, "=>", uv.version)
          }
        }
      });

      return cost;
    };

    resolverOptions.estimateCostFunction = function (state, options) {
      options = options || {};
      var dependencies = state.dependencies;
      var constraints = state.constraints;

      var cost = [0, 0, 0, 0];

      dependencies.each(function (dep) {
        // XXX don't try to estimate transitive dependencies
        if (! isRootDep[dep]) {
          cost[MINOR] += 10000000;
          return;
        }

        if (_.has(prevSolMapping, dep)) {
          var prev = prevSolMapping[dep];
          var prevVersionMatches =
            _.isEmpty(constraints.violatedConstraints(prev, self.resolver));

          // if it matches, assume we would pick it and the cost doesn't
          // increase
          if (prevVersionMatches)
            return;

          var uv =
            constraints.earliestMatchingVersionFor(dep, self.resolver);

          // Cannot find anything compatible
          if (! uv) {
            cost[VMAJOR]++;
            return;
          }

          var versionsDistance =
            semverToNum(uv.version) -
            semverToNum(prev.version);

          var isCompatible =
                prev.earliestCompatibleVersion === uv.earliestCompatibleVersion;
            semver.gte(prev.version, uv.earliestCompatibleVersion) ||
            semver.gte(uv.version, prev.earliestCompatibleVersion);

          if (! isCompatible || versionsDistance < 0) {
            cost[VMAJOR]++;
            return;
          }

          cost[MAJOR] += versionsDistance;
        } else {
          var versions = self.resolver.unitsVersions[dep];
          var latestMatching =
            constraints.latestMatchingVersionFor(dep, self.resolver);

          if (! latestMatching) {
            cost[MEDIUM] = Infinity;
            return;
          }

          var latestDistance =
            semverToNum(self.resolver._latestVersion[dep]) -
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
