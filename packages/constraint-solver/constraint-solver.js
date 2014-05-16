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

  // XXX for now we convert builds to unit versions as "deps#os"

  var forEveryVersion = function (iter) {
    _.each(catalog.getAllPackageNames(), function (packageName) {
      _.each(catalog.getSortedVersions(packageName), function (version) {
        var versionDef = catalog.getVersion(packageName, version);
        iter(packageName, version, versionDef);
      });
    });
  };

  // Create a unit version for every package
  // Set constraints and dependencies between units
  forEveryVersion(function (packageName, version, versionDef) {
    var builds = {};
    _.each(versionDef.dependencies, function (dep, depName) {
      _.each(dep.references, function (ref) {
        var unitName = packageName + "#" + ref.arch;
        var unitVersion = builds[unitName];
        if (! unitVersion) {
          // if it is first time we met the build of this version, register it
          // in resolver.
          builds[unitName] = new ConstraintSolver.UnitVersion(
            unitName, version, versionDef.earliestCompatibleVersion);
          unitVersion = builds[unitName];
          self.resolver.addUnitVersion(unitVersion);
        }

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

    if (_.isEmpty(builds)) {
      // XXX this is a hack to temporary solve the problem with packages w/o
      // dependencies. Right now in order to understand what are builds of
      // package, we look into its dependencies build-wise. W/o dependencies we
      // would need to do something else, like see what builds other builds
      // depend on. Also if depending builds of other packages don't specify the
      // version, there is no way we can resolve what builds different versions
      // have as different versions of the same package can in theory have
      // diverging sets of builds.
      //
      // But in practive we always have main + os builds. So we
      // will just hardcode two most improtant builds at the moment. Fix it
      // later.
      _.each(["os", "browser"], function (arch) {
        var unitName = packageName + "#" + arch;
        var unitVersion = builds[unitName];
        if (! unitVersion) {
          builds[unitName] = new ConstraintSolver.UnitVersion(
            unitName, version, versionDef.earliestCompatibleVersion);
          unitVersion = builds[unitName];
          self.resolver.addUnitVersion(unitVersion);
        }
      });
    }

    // Every build implies that if it is picked, other builds are constrained to
    // the same version.
    _.each(builds, function (build, buildName) {
      _.each(builds, function (other, otherBuildName) {
        if (build === other)
          return;

        // Constraint is the exact same version of a build
        var constraintStr = "=" + version;
        var constraint =
          self.resolver.getConstraint(otherBuildName, constraintStr);
        build.addConstraint(constraint);
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
//  - upgrade - set this flag to true if upgrading direct dependencies is more
//  prioritized than keeping old versions the same
//  - previousSolution - mapping from package name to a version that was used in
//  the previous constraint solver run
ConstraintSolver.PackagesResolver.prototype.resolve =
  function (dependencies, constraints, options) {
  var self = this;

  options = _.defaults(options || {}, {
    _testing: false,
    breaking: false,
    upgrade: false
  });

  check(dependencies, [String]);
  check(constraints, [{ packageName: String, version: String, type: String }]);
  check(options, {
    _testing: Match.Optional(Boolean),
    breaking: Match.Optional(Boolean),
    upgrade: Match.Optional(Boolean),
    previousSolution: Match.Optional(Object)
  });

  if (options.previousSolution) {
    // XXX glasser and ekate added this filter to strip some undefineds that
    // were causing crashes, but maybe the real answer is that there shouldn't
    // have been undefineds?
    options.previousSolution = _.filter(_.flatten(_.map(options.previousSolution, function (version, packageName) {
      return _.map(self._buildsForPackage(packageName), function (unitName) {
        return self.resolver._unitsVersionsMap[unitName + "@" + version];
      });
    })), _.identity);
  }

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
      new ConstraintSolver.Constraint(uv.name, constrType + uv.version));
  });

  options.rootDependencies = dc.dependencies;


  var resolverOptions = self._getResolverOptions(options, dc);

  // XXX resolver.resolve can throw an error, should have error handling with
  // proper error translation.
  var res = self.resolver.resolve(dc.dependencies, dc.constraints, [],
                                  resolverOptions);

  var resultChoices = {};
  _.each(res, function (uv) {
    // Since we don't yet define the interface for a an app to depend only on
    // certain builds of the packages (like only browser builds) and we know
    // that each build weakly depends on other sibling builds of the same
    // version, we can safely output the whole package for each build in the
    // result.
    resultChoices[uv.name.split('#')[0]] = uv.version;
  });

  return resultChoices;
};

ConstraintSolver.PackagesResolver.prototype.propagateExactDeps =
  function (dependencies, constraints) {
  var self = this;

  check(dependencies, [String]);
  check(constraints, [{ packageName: String, version: String, type: String }]);

  var dc = self._splitDepsToConstraints(dependencies, constraints);

  // XXX resolver.resolve can throw an error, should have error handling with
  // proper error translation.
  var res = self.resolver.resolve(dc.dependencies, dc.constraints, null,
                                  { stopAfterFirstPropagation: true });

  var resultChoices = {};
  _.each(res, function (uv) {
    resultChoices[uv.name.split('#')[0]] = uv.version;
  });

  return resultChoices;
};

// takes dependencies and constraints and rewrites the names from "foo" to
// "foo#os" and "foo#browser"
// XXX right now creates a dependency for every build it can find
ConstraintSolver.PackagesResolver.prototype._splitDepsToConstraints =
  function (inputDeps, inputConstraints) {
  var self = this;
  var dependencies = [];
  var constraints = [];

  _.each(inputDeps, function (packageName) {
    _.each(self._buildsForPackage(packageName), function (buildName) {
      dependencies.push(buildName);
    });
  });

  _.each(inputConstraints, function (constraint) {
    var operator = "";
    if (constraint.type === "exactly")
      operator = "=";
    if (constraint.type === "at-least")
      operator = ">=";
    var constraintStr = operator + constraint.version;

    _.each(self._buildsForPackage(constraint.packageName), function (buildName) {
      constraints.push(self.resolver.getConstraint(buildName, constraintStr));
    });
  });

  return { dependencies: dependencies, constraints: constraints };
};

ConstraintSolver.PackagesResolver.prototype._buildsForPackage =
  function (packageName) {
  var self = this;
  var buildPrefix = packageName + "#";
  var builds = [];
  // XXX hardcode os and browser
  _.each(["os", "browser"], function (arch) {
    if (self.resolver.unitsVersions[buildPrefix + arch])
      builds.push(buildPrefix + arch);
  });

  if (_.isEmpty(builds))
    throw new Error("Cannot find anything about package -- " + packageName);

  return builds;
};

ConstraintSolver.PackagesResolver.prototype._getResolverOptions =
  function (options, dc) {
  var self = this;

  var semverToNum = function (version) {
    version = version.split("+")[0];
    var v = _.map(version.split('.'), function (x) {
      return parseInt(x);
    });

    return v[0] * 10000 + v[1] * 100 + v[2];
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
    if (! options.upgrade)
      _.each(prevSol, function (uv) { prevSolMapping[uv.name] = uv; });

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
            semver.gte(prev.version, uv.earliestCompatibleVersion) ||
            semver.gte(uv.version, prev.earliestCompatibleVersion);

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
            _.isEmpty(constraints.violatedConstraints(prev));

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
