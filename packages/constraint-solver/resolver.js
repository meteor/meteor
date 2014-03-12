////////////////////////////////////////////////////////////////////////////////
// Resolver
////////////////////////////////////////////////////////////////////////////////

ConstraintSolver.Resolver2 = function () {
  var self = this;

  // Maps unit name string to an array of version definitions
  self.unitsVersions = {};

  // Refs to all constraints. Mapping String -> instance
  self._constraints = {};
};

ConstraintSolver.Resolver2.prototype.addUnitVersion = function (unitVersion) {
  var self = this;

  check(unitVersion, ConstraintSolver.UnitVersion);

  if (! _.has(self.unitsVersions, unitVersion.name))
    self.unitsVersions[unitVersion.name] = [];

  self.unitsVersions[unitVersion.name].push(unitVersion);
};

// name - String - "someUnit"
// versionConstraint - String - "=1.2.3" or "2.1.0"
ConstraintSolver.Resolver2.prototype.getConstraint =
  function (name, versionConstraint) {
  var self = this;

  check(name, String);
  check(versionConstraint, String);

  var idString = JSON.stringify([name, versionConstraint]);

  if (_.has(self._constraints, idString))
    return self._constraints[idString];

  return self._constraints[idString] =
    new ConstraintSolver.Constraint(name, versionConstraint);
};

////////////////////////////////////////////////////////////////////////////////
// UnitVersion
////////////////////////////////////////////////////////////////////////////////

ConstraintSolver.UnitVersion = function (name, unitVersion, ecv) {
  var self = this;

  check(name, String);
  check(unitVersion, String);
  check(ecv, String);
  check(self, ConstraintSolver.UnitVersion);

  self.name = name;
  self.version = unitVersion;
  // array of Strings - names of dependencies
  self.dependencies = [];
  // array of ConstraintSolver.Constraint's
  self.constraints = [];
  // a string in a form of "1.2.0"
  self.ecv = ecv;
};

_.extend(ConstraintSolver.UnitVersion.prototype, {
  addDependency: function (name) {
    var self = this;

    check(name, String);
    if (_.contains(self.dependencies, name))
      throw new Error("Dependency already exists -- " + name);
    self.dependencies.push(name);
  },
  addConstraint: function (constraint) {
    var self = this;

    check(constraint, ConstraintSolver.Constraint);
    if (_.contains(self.constraints, constraint))
      throw new Error("Constraint already exists -- " + constraint.toString());

    self.constraints.push(constraint);
  },
  exactConstraits: function () {
    var self = this;
    return _.filter(self.constraints, function (c) { return c.exact; });
  },
  looseConstraints: function () {
    var self = this;
    return _.filter(self.constraints, function (c) { return !c.exact; });
  },

  // Returns a list of transitive exact constraints, those could be found as
  // transitive dependencies.
  _exactTransitiveConstraints: function (resolver) {
    var self = this;

    // Get all dependencies we depend on and have constraints to pick an exact
    // version simultaneously as constraints.
    var exactDeps = _.filter(self.exactConstraits(), function (c) {
      return _.contains(self.dependencies, c.name);
    });

    // Merge all their's transitive exact dependencies
    var exactTransitiveConstraints = _.clone(exactDeps);

    _.each(exactDeps, function (c) {
      var unitVersion = c.getSatisfyingUnitVersion(resolver);
      // TODO: error handling in case a satisfying dependency wasn't found

      // Collect the transitive dependencies of the direct exact dependencies.
      exactTransitiveConstraints = _.union(exactTransitiveConstraints,
                unitVersion._exactTransitiveConstraints(resolver));
    });

    return exactTransitiveConstraints;
  },

  exactTransitiveDependenciesVersions: function (resolver) {
    var self = this;
    return _.map(self._exactTransitiveConstraints(resolver), function (c) {
      return c.getSatisfyingUnitVersion(resolver);
    });
  },
  inexactTransitiveDependencies: function (resolver) {
    var self = this;
    var exactTransitiveConstraints = self._exactTransitiveConstraints(resolver);
    return _.chain(exactTransitiveConstraints).map(function (c) {
      var unitVersion = c.getSatisfyingUnitVersion(resolver);
      // TODO: error handling in case unitVersion wasn't found

      return unitVersion.dependencies;
    }).flatten().uniq()
      .difference(_.pluck(exactTransitiveConstraints, "name")).value();
  }
});

////////////////////////////////////////////////////////////////////////////////
// Constraint
////////////////////////////////////////////////////////////////////////////////

// Can be called either:
//    new PackageVersion.Constraint("packageA", "=2.1.0")
// or:
//    new PackageVersion.Constraint("pacakgeA@=2.1.0")
ConstraintSolver.Constraint = function (name, versionString) {
  var self = this;

  if (versionString) {
    _.extend(self, PackageVersion.parseVersionConstraint(versionString));
    self.name = name;
  } else {
    _.extend(self, PackageVersion.parseConstraint(name));
  }
};

ConstraintSolver.Constraint.prototype.toString = function () {
  var self = this;
  return self.name + "@" + (self.exact ? "=" : "") + self.version;
};

var semver = Npm.require('semver');

ConstraintSolver.Constraint.prototype.isSatisfied = function (unitVersion) {
  var self = this;
  check(unitVersion, ConstraintSolver.UnitVersion);

  if (self.exact)
    return self.version === unitVersion.version;

  return semver.lte(self.version, unitVersion.version) &&
    semver.lte(unitVersion.ecv, self.version);
};

// Returns any unit version satisfying the constraint in the resolver
ConstraintSolver.Constraint.prototype.getSatisfyingUnitVersion =
  function (resolver) {
  var self = this;
  var unitVersion = _.find(resolver.unitsVersions[self.name],
                           _.bind(self.isSatisfied, self));
  return unitVersion;
};



