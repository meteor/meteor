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

ConstraintSolver.Resolver.prototype._resolve = function (dependencies) {
  check(dependencies, [ConstraintSolver.Dependency]);

  var self = this;

  var picks = {};
  var isExact = function (dep) { return dep.exact; }
  var pickExactDeps = function (deps) { return _.filter(deps, isExact); };
  var rejectExactDeps = function (deps) { return _.reject(deps, isExact); };

  var depsStack = rejectExactDeps(dependencies);
  var exactDepsStack = pickExactDeps(dependencies);

  _.each(exactDepsStack, function (dep) { picks[dep.packageName] = dep.version; });
  var willConsider = {};
  _.each(depsStack, function (dep) { willConsider[dep.packageName] = true; });

  while (exactDepsStack.length > 0) {
    var currentPick = exactDepsStack.pop();
    // XXX if there is no info of such package or no version for this
    // architecture, throw a meaningful error
    var currentDependencies =
      self.packageDeps[currentPick.packageName][currentPick.version].dependencies;

    _.each(pickExactDeps(currentDependencies), function (dep) {
      if (_.has(picks, dep.packageName)) {
        // XXX this error message should be improved so you can get a lot more
        // context, like what are initial exact dependencies (those user
        // specified) and what is the eventual conflict.
        if (pick[dep.packageName] !== dep.version)
          throw new Error("Unresolvable: two exact dependencies conflict: " +
                          dep.packageName + " versions: " +
                          [pick[dep.packageName], dep.version]);
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

  // xcxc: check that all deps in depsStack satisfy first, then try doing
  // something smart and then backtracking.
  return picks;
};

// accepts dependencies in simpler format
ConstraintSolver.Resolver.prototype.resolve = function (dependencies) {
  var self = this;

  var structuredDeps = [];
  _.each(dependencies, function (details, packageName) {
    if (typeof details === "string") {
      structuredDeps.push(_.extend({ packageName: packageName }, PackageVersion.parseVersionConstraint(details)));
    } else {
      structuredDeps.push(_.extend({ packageName: packageName }, details));
    }
  });

  return self._resolve(structuredDeps);
};

