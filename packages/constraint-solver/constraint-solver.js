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

  var architecture = options.architecture || "all";

  self.packageDeps = {};

  // Extract all dependencies for every package version if a build for the
  // required architecture is available.
  Packages.find().forEach(function (packageDef) {
    self.packageDeps[packageDef.name] = {};
    Versions.find({ name: packageDef.name }).forEach(function (versionDef) {
      // XXX somehow use earliestCompatibleVersion and warning
      var build = Builds.findOne({packageName: packageDef.name,
                                  version: versionDef.version,
                                  $or: [{architecture: architecture},
                                        {architecture: "all"}]});

      if (build) {
        var deps = build.dependencies.map(function (dep) {
          return _.extend({}, dep, PackageVersion.parseVersion(dep.version));
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

ConstraintSolver.Resolver.prototype.resolve = function (dependencies) {
  check(dependencies, [ConstraintSolver.Dependency]);

  // XXX write some algorithm here
};

