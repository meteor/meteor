var semver = Npm.require('semver');

ConstraintSolver = {};

ConstraintSolver.Constraint = {
  name: String,
  version: Match.OneOf(String, null), // XXX 'x.y.z'
  sticky: Boolean,
  constraints: [ConstraintSolver.Constraint] // an array of other constraints
};

ConstraintSolver.Dependency = {
  name: String,
  version: Match.OneOf(String, null), // XXX 'x.y.z'
  sticky: Boolean,
  constraints: [ConstraintSolver.Constraint], // an array of other constraints
  dependencies: [ConstraintSolver.Dependency] // an array of dependencies
};

// deps - Array of Dependency
ConstraintSolver.resolveDependencies = function (deps) {
};

