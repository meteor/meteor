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
          dependencies: deps
        };
      }
    });
  });
};

// The propagation of exact dependencies
ConstraintSolver.Resolver.prototype._propagateExactDeps =
  function (depsStack, exactDepsStack) {
  var self = this;
  var picks = {};

  _.each(exactDepsStack, function (dep) { picks[dep.packageName] = dep.version; });
  var willConsider = {};
  _.each(depsStack, function (dep) { willConsider[dep.packageName] = true; });

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

    _.each(rejectExactDeps(currentPick.dependencies), function (dep) {
      if (! _.has(willConsider, dep.packageName)) {
        willConsider[dep.packageName] = true;
        depsStack.push(dep);
      }
    });
  };

  return picks;
};

ConstraintSolver.Resolver.prototype._resolve = function (dependencies) {
  check(dependencies, [ConstraintSolver.Dependency]);

  var self = this;

  var depsStack = rejectExactDeps(dependencies);
  var exactDepsStack = pickExactDeps(dependencies);

  // xcxc: check that all deps in depsStack satisfy first, then try doing
  // something smart and then backtracking.
  return self._propagateExactDeps(depsStack, exactDepsStack);
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

