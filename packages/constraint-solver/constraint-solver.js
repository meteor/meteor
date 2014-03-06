var semver = Npm.require('semver');

ConstraintSolver = {};

ConstraintSolver.Dependency = {
  packageName: String,
  version: Match.OneOf(String, null), // XXX 'x.y.z' or 'x.y.z'
  exact: Match.Optional(Boolean),
  weak: Match.Optional(Boolean),
  unordered: Match.Optional(Boolean)
};

// main class
ConstraintSolver.Resolver = function (Packages, Versions, Builds, options) {
  var self = this;

  options = options || {};
  var architecture = options.architecture || "all";

  self.packageDeps = {};

  // Extract all dependencies for every package version if a build for the
  // required architecture is available.
  Packages.find().forEach(function (packageDef) {
    self.packageDeps[packageDef.name] = {};
    Versions.find({ packageName: packageDef.name }).forEach(function (versionDef) {
      // XXX somehow use earliestCompatibleVersion and warning
      var build = Builds.findOne({packageName: packageDef.name,
                                  version: versionDef.version,
                                  $or: [{architecture: architecture},
                                        {architecture: "all"}]});

      if (build) {
        build.dependencies = build.dependencies || [];
        var deps = build.dependencies.map(function (dep) {
          return _.extend({}, dep, PackageVersion.parseVersionConstraint(dep.version));
        });

        // assert the schema
        check(deps, [ConstraintSolver.Dependency]);

        self.packageDeps[packageDef.name][versionDef.version] = {
          dependencies: deps,
          earliestCompatibleVersion: build.earliestCompatibleVersion
        };
      }
    });
  });
};

// The propagation of exact dependencies
// XXX empties the exactDepsStack
// XXX extends the depsDict
// XXX after this depsStack can contain duplicates
ConstraintSolver.Resolver.prototype._propagateExactDeps =
  function (depsDict, exactDepsStack) {
  var self = this;
  var picks = {};

  _.each(exactDepsStack, function (dep) { picks[dep.packageName] = dep.version; });

  while (exactDepsStack.length > 0) {
    var currentPick = exactDepsStack.pop();
    try {
      var currentDependencies =
        self.packageDeps[currentPick.packageName][currentPick.version].dependencies;
    } catch (err) {
      if (! _.has(self.packageDeps, currentPick.packageName))
        throw new Error("There is no required package found: " + currentPick.packageName);
      if (! _.has(self.packageDeps[currentPick.packageName], currentPick.version))
        throw new Error("There is no required package version found for the requested architecture: " + currentPick.packageName + "@" + currentPick.version);
    }

    _.each(pickExactDeps(currentDependencies), function (dep) {
      if (_.has(picks, dep.packageName)) {
        // XXX this error message should be improved so you can get a lot more
        // context, like what are initial exact dependencies (those user
        // specified) and what is the eventual conflict.
        if (picks[dep.packageName] !== dep.version)
          throw new Error("Unresolvable: two exact dependencies conflict: " +
                          dep.packageName + " versions: " +
                          [picks[dep.packageName], dep.version].join(", "));
      } else {
        picks[dep.packageName] = dep.version;
        exactDepsStack.push(dep);
      }
    });

    _.each(rejectExactDeps(currentDependencies), function (dep) {
      depsDict[dep.packageName] = depsDict[dep.packageName] || [];
      depsDict[dep.packageName].push(dep);
    });
  };

  return picks;
};

ConstraintSolver.Resolver.prototype._resolve = function (dependencies, picks) {
  check(dependencies, [ConstraintSolver.Dependency]);

  picks = picks || {};

  var self = this;

  var depsDict = {};
  _.each(rejectExactDeps(dependencies), function (dep) {
    depsDict[dep.packageName] = depsDict[dep.packageName] || [];
    depsDict[dep.packageName].push(dep);
  });

  var exactDepsStack = pickExactDeps(dependencies);

  var exactPicks = self._propagateExactDeps(depsDict, exactDepsStack);

  // add all exact dependencies the propagator picked to the set of picks
  _.each(exactPicks, function (version, packageName) {
    if (_.has(picks, packageName)) {
      if (picks[packageName] !== version)
        throw new Error("Exact dependencies contradict with already picked version for a package: "
                        + packageName + " " + picks[packageName] + ": " + version);
    } else {
      picks[packageName] = version;
    }
  });

  // check if all non-exact dependencies are still satisfied
  _.each(picks, function (version, packageName) {
    _.each(depsDict[packageName], function (dep) {
      if (! self.dependencyIsSatisfied(dep, version))
        throw new Error("Exact dependency contradicts on of the constraints for a package: "
                        + packageName + " " + version + ": " + dep.version);
    });
  });

  if (_.size(depsDict) !== 0) {
    // backtrack here
  }

  return picks;
};

ConstraintSolver.Resolver.prototype.resolve = function (dependencies) {
  var self = this;
  return self._resolve(toStructuredDeps(dependencies));
};

ConstraintSolver.Resolver.prototype.propagatedExactDeps = function (dependencies) {
  var self = this;

  dependencies = toStructuredDeps(dependencies);
  var depsStack = rejectExactDeps(dependencies);
  var exactDepsStack = pickExactDeps(dependencies);
  return self._propagateExactDeps(depsStack, exactDepsStack);
};

ConstraintSolver.Resolver.prototype.dependencyIsSatisfied =
  function (dep, version) {
  var self = this;
  var versionSpec = self.packageDeps[dep.packageName][version];
  return semver.lte(dep.version, version) &&
    semver.lte(versionSpec.earliestCompatibleVersion, dep.version);
};

// helpers
var isExact = function (dep) { return dep.exact; }
var pickExactDeps = function (deps) { return _.filter(deps, isExact); };
var rejectExactDeps = function (deps) { return _.reject(deps, isExact); };

// converts dependencies from simple format to the structured format
var toStructuredDeps = function (dependencies) {
  var structuredDeps = [];
  _.each(dependencies, function (details, packageName) {
    if (typeof details === "string") {
      structuredDeps.push(_.extend({ packageName: packageName }, PackageVersion.parseVersionConstraint(details)));
    } else {
      structuredDeps.push(_.extend({ packageName: packageName }, details));
    }
  });

  return structuredDeps;
};

