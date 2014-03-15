////////////////////////////////////////////////////////////////////////////////
// Resolver
////////////////////////////////////////////////////////////////////////////////

// XXX the whole resolver heavily relies on these statements to be true:
// - every unit version ever used was added to the resolver with addUnitVersion
// - every constraint ever used was instantiated with getConstraint
// - every constraint was added exactly once
// - every unit version was added exactly once
// - if two unit versions are the same, their refs point at the same object
// - if two constraints are the same, their refs point at the same object
ConstraintSolver.Resolver = function () {
  var self = this;

  // Maps unit name string to an array of version definitions
  self.unitsVersions = {};

  // Refs to all constraints. Mapping String -> instance
  self._constraints = {};
};

ConstraintSolver.Resolver.prototype.addUnitVersion = function (unitVersion) {
  var self = this;

  check(unitVersion, ConstraintSolver.UnitVersion);

  if (! _.has(self.unitsVersions, unitVersion.name))
    self.unitsVersions[unitVersion.name] = [];

  self.unitsVersions[unitVersion.name].push(unitVersion);
};

// name - String - "someUnit"
// versionConstraint - String - "=1.2.3" or "2.1.0"
ConstraintSolver.Resolver.prototype.getConstraint =
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

ConstraintSolver.Resolver.prototype.resolve =
  function (dependencies, constraints, choices, options) {
  var self = this;

  constraints = constraints || [];
  choices = choices || [];
  options = options || {};

  dependencies = _.uniq(dependencies);
  constraints = _.uniq(constraints);

  var exactDepsConstraints = _.filter(constraints, function (c) {
    return c.exact && _.contains(dependencies, c.name);
  });

  var exactDepsVersions = _.map(exactDepsConstraints, function (c) {
    return c.getSatisfyingUnitVersion(self);
  });

  var exactDepsNames = _.pluck(exactDepsVersions, "name");

  // Pick these versions as we have no choice but take them.
  choices = _.union(choices, exactDepsVersions);

  // Remove them from dependencies.
  dependencies = _.difference(dependencies, exactDepsNames);

  // Take exact dependencies and propagate them.
  _.each(exactDepsVersions, function (uv) {
    var propagatedExactTransDeps = self._propagateExactTransDeps(uv);
    dependencies = _.union(dependencies, propagatedExactTransDeps.dependencies);
    constraints = _.union(constraints, propagatedExactTransDeps.constraints);
    choices = _.union(choices, propagatedExactTransDeps.choices);
  });

  var result = self._resolve(dependencies, constraints, choices, options);

  if (! result.success)
    throw new Error(result.failureMsg);

  return result.choices;
};

// dependencies: [String] - remaining dependencies
// constraints: [ConstraintSolver.Constraint] - constraints to satisfy
// choices: [ConstraintSolver.UnitVersion] - current fixed set of choices
//
// returns {
//   success: Boolean,
//   failureMsg: String,
//   choices: [ConstraintSolver.UnitVersion]
// }
//
// NOTE: assumes that exact dependencies are already propagated
ConstraintSolver.Resolver.prototype._resolve =
  function (dependencies, constraints, choices, options) {
  var self = this;

  if (! choicesDontValidateConstraints(choices, constraints))
    return { success: false,
             failureMsg: "initial choices are validating constraints" };

  if (_.isEmpty(dependencies) || options.stopAfterFirstPropagation)
    return { success: true, choices: choices };

  var candidateName = dependencies[0];
  dependencies = dependencies.slice(1);

  var candidateVersions =
    _.filter(self.unitsVersions[candidateName], function (uv) {
      return unitVersionDoesntValidateConstraints(uv, constraints);
    });

  if (_.isEmpty(candidateVersions))
    return { success: false,
             failureMsg: "package constraint cannot be satisfied -- "
                         + candidateName };

  var winningChoices = null;
  _.each(candidateVersions, function (uv) {
    var nDependencies = _.clone(dependencies);
    var nConstraints = _.clone(constraints);
    var nChoices = _.clone(choices);

    nChoices.push(uv);
    var propagatedExactTransDeps =
      self._propagateExactTransDeps(uv);

    nDependencies = _.union(nDependencies, propagatedExactTransDeps.dependencies);
    nConstraints = _.union(nConstraints, propagatedExactTransDeps.constraints);
    nChoices = _.union(nChoices, propagatedExactTransDeps.choices);
    nDependencies = _.difference(nDependencies, _.pluck(nChoices, 'name'));

    var result = self._resolve(nDependencies, nConstraints, nChoices, options);

    if (result.success) {
      winningChoices = result.choices;
      return false;
    }
  });

  if (winningChoices)
    return { success: true, choices: winningChoices };
  return { success: false,
           failureMsg: "cannot find a satisfying version for package "
                       + candidateName };
};

ConstraintSolver.Resolver.prototype._propagateExactTransDeps = function (uv) {
  var self = this;

  var exactTransitiveDepsVersions = uv.exactTransitiveDependenciesVersions(self);
  var inexactTransitiveDeps = uv.inexactTransitiveDependencies(self);
  var transitiveContraints = _.chain(exactTransitiveDepsVersions)
                              .map(function (uv) {
                                return uv.constraints;
                              }).flatten().uniq().value();

  // Since exact transitive deps are put into choices, there is no need to keep
  // them in dependencies. So only inexact deps are put to dependencies.
  return {
    dependencies: inexactTransitiveDeps,
    constraints: transitiveContraints,
    choices: exactTransitiveDepsVersions
  };
};

var unitVersionDoesntValidateConstraints = function (uv, constraints) {
  return _.all(constraints, function (c) {
    return c.name !== uv.name || c.isSatisfied(uv);
  });
};

var choicesDontValidateConstraints = function (choices, constraints) {
  return _.all(choices, function (uv) {
    return unitVersionDoesntValidateConstraints(uv, constraints);
  });
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



