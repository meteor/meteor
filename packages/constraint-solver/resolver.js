var semver = Npm.require('semver');

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
  // Maps name@version string to a unit version
  self._unitsVersionsMap = {};

  // Maps unit name string to the greatest version string we have
  self._latestVersion = {};

  // Refs to all constraints. Mapping String -> instance
  self._constraints = {};
};

ConstraintSolver.Resolver.prototype.addUnitVersion = function (unitVersion) {
  var self = this;

  check(unitVersion, ConstraintSolver.UnitVersion);

  if (! _.has(self.unitsVersions, unitVersion.name)) {
    self.unitsVersions[unitVersion.name] = [];
    self._latestVersion[unitVersion.name] = unitVersion.version;
  }

  if (! _.has(self._unitsVersionsMap, unitVersion.toString())) {
    self.unitsVersions[unitVersion.name].push(unitVersion);
    self._unitsVersionsMap[unitVersion.toString()] = unitVersion;
  }

  if (semver.lt(self._latestVersion[unitVersion.name], unitVersion.version))
    self._latestVersion[unitVersion.name] = unitVersion.version;
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

// options: Object:
// - costFunction: function (state, options) - given a state evaluates its cost
// - estimateCostFunction: function (state) - given a state, evaluates the
// estimated cost of the best path from state to a final state
// - combineCostFunction: function (cost, cost) - given two costs (obtained by
// evaluating states with costFunction and estimateCostFunction)
ConstraintSolver.Resolver.prototype.resolve =
  function (dependencies, constraints, options) {
  var self = this;

  constraints = constraints || [];
  var choices = [];
  options = _.extend({
    costFunction: function (state) { return 0; },
    estimateCostFunction: function (state) {
      return 0;
    },
    combineCostFunction: function (cost, anotherCost) {
      return cost + anotherCost;
    }
  }, options);

  // required for error reporting later
  var constraintAncestor = {};
  _.each(constraints, function (c) {
    constraintAncestor[c.toString()] = c.name;
  });

  dependencies = ConstraintSolver.DependenciesList.fromArray(dependencies);
  constraints = ConstraintSolver.ConstraintsList.fromArray(constraints);

  // create a fake unit version to represnt the app or the build target
  var appUV = new ConstraintSolver.UnitVersion("###TARGET###", "1.0.0", "0.0.0");
  appUV.dependencies = dependencies;
  appUV.constraints = constraints;

  // state is an object:
  // - dependencies: DependenciesList
  // - constraints: ConstraintsList
  // - choices: array of UnitVersion
  // - constraintAncestor: mapping Constraint.toString() -> Constraint
  var startState = self._propagateExactTransDeps(appUV, dependencies, constraints, choices, constraintAncestor);
  startState.choices = _.filter(startState.choices, function (uv) { return uv.name !== "###TARGET###"; });

  if (options.stopAfterFirstPropagation)
    return startState.choices;

  var pq = new PriorityQueue();
  var costFunction = options.costFunction;
  var estimateCostFunction = options.estimateCostFunction;
  var combineCostFunction = options.combineCostFunction;

  var estimatedStartingCost =
    combineCostFunction(costFunction(startState),
                        estimateCostFunction(startState));

  pq.push(startState, [estimatedStartingCost, 0]);

  // Mapping that assigns every package an integer priority. We compute this
  // dynamically and in the process of resolution we try to resolve packages
  // with higher priority first. This helps the resolver a lot because if some
  // package has a higher weight to the solution (like a direct dependency) or
  // is more likely to break our solution in the future than others, it would be
  // great to try out and evaluate all versions early in the decision tree.
  var resolutionPriority = {};

  // put direct dependencies on higher priority
  dependencies.each(function (dep) {
    resolutionPriority[dep] = 100;
  });

  var someError = null;
  var solution = null;
  while (! pq.empty()) {
    var currentState = pq.pop();

    if (currentState.dependencies.isEmpty()) {
      solution = currentState.choices;
      break;
    }

    var neighborsObj = self._stateNeighbors(currentState, resolutionPriority);

    if (! neighborsObj.success) {
      someError = someError || neighborsObj.failureMsg;
      resolutionPriority[neighborsObj.conflictingUnit] = (resolutionPriority[neighborsObj.conflictingUnit] || 0) + 1;
    } else {
      _.each(neighborsObj.neighbors, function (state) {
        var tentativeCost =
          combineCostFunction(costFunction(state),
                              estimateCostFunction(state));

        pq.push(state, [tentativeCost, -state.choices.length]);
      });
    }
  }

  if (solution)
    return solution;

  // XXX should be much much better
  if (someError)
    throw new Error(someError);

  throw new Error("Couldn't resolve, I am sorry");
};

// state is an object:
// - dependencies: DependenciesList - remaining dependencies
// - constraints: ConstraintsList - constraints to satisfy
// - choices: array of UnitVersion - current fixed set of choices
// - constraintAncestor: Constraint (string representation) ->
//   Dependency name. Used for error reporting to indicate which direct
//   dependencies have caused a failure. For every constraint, this is
//   the list of direct dependencies which led to this constraint being
//   present.
//
// returns {
//   success: Boolean,
//   failureMsg: String,
//   neighbors: [state]
// }
//
// NOTE: assumes that exact dependencies are already propagated
ConstraintSolver.Resolver.prototype._stateNeighbors =
  function (state, resolutionPriority) {
  var self = this;

  var dependencies = state.dependencies;
  var constraints = state.constraints;
  var choices = state.choices;
  var constraintAncestor = state.constraintAncestor;

  var candidateName = dependencies.peek();
  var currentNaughtiness = resolutionPriority[candidateName] || 0;

  dependencies.each(function (d) {
    var r = resolutionPriority[d] || 0;
    if (r > currentNaughtiness) {
      currentNaughtiness = r;
      candidateName = d;
    }
  });

  dependencies = dependencies.remove(candidateName);

  var edgeVersions = constraints.edgeMatchingVersionsFor(candidateName, self);

  edgeVersions.earliest = edgeVersions.earliest || { version: "1000.1000.1000" };
  edgeVersions.latest = edgeVersions.latest || { version: "0.0.0" };

  var candidateVersions =
    _.filter(self.unitsVersions[candidateName], function (uv) {
       // reject immideately if not in acceptable range
      return semver.lte(edgeVersions.earliest.version, uv.version) && semver.lte(uv.version, edgeVersions.latest.version);
    });

  var generateError = function (uv, violatedConstraints) {
    var directDepsString = "";

    _.each(violatedConstraints, function (c) {
      if (directDepsString !== "")
        directDepsString += ", ";
      directDepsString += constraintAncestor[c.toString()] +
        "(" + c.toString() + ")";
    });

    return {
      success: false,
      // XXX We really want to say "directDep1 depends on X@1.0 and
      // directDep2 depends on X@2.0"
      failureMsg: "Direct dependencies " + directDepsString + " conflict on " + uv.name,
      conflictingUnit: candidateName
    };
  };

  if (_.isEmpty(candidateVersions)) {
    var uv = self.unitsVersions[candidateName][0];

    if (! uv)
      return { success: false, failureMsg: "Cannot find anything about package -- " + candidateName, conflictingUnit: candidateName };

    return generateError(uv, constraints.constraintsForPackage(uv.name));
  }

  var firstError = null;

  var neighbors = _.chain(candidateVersions).map(function (uv) {
    var nChoices = _.clone(choices);
    var nConstraintAncestors = _.clone(constraintAncestor);
    nChoices.push(uv);

    return self._propagateExactTransDeps(uv, dependencies, constraints, nChoices, nConstraintAncestors);
  }).filter(function (state) {
    var vcfc =
      violatedConstraintsForSomeChoice(state.choices, state.constraints);

    if (! vcfc)
      return true;

    if (! firstError) {
      firstError = generateError(vcfc.choice, constraints.constraintsForPackage(vcfc.choice.name));
    }
    return false;
  }).value();

  if (firstError && ! neighbors.length)
    return firstError;

  // Should never be true as !!firstError === !neighbors.length but still check
  // just in case.
  if (! neighbors.length)
    return { success: false,
             failureMsg: "None of the versions unit produces a sensible result -- "
               + candidateName,
             conflictingUnit: candidateName };

  return { success: true, neighbors: neighbors };
};

// Propagates exact dependencies (which have exact constraints) from
// the given unit version taking into account the existing set of dependencies
// and constraints.
// Assumes that the unit versions graph without passed unit version is already
// propagated (i.e. doesn't try to propagate anything not related to the passed
// unit version).
ConstraintSolver.Resolver.prototype._propagateExactTransDeps =
  function (uv, dependencies, constraints, choices, constraintAncestor) {
  var self = this;

  // XXX representing a queue as an array with push/shift operations is not
  // efficient as Array.shift is O(N). Replace if it becomes a problem.
  var queue = [];
  // Boolean map to avoid adding the same stuff to queue over and over again.
  // Keeps the time complexity the same but can save some memory.
  var isEnqueued = {};
  // For keeping track of new choices in this iteration
  var oldChoice = {};
  _.each(choices, function (uv) { oldChoice[uv.name] = uv; });

  // Keeps track of the exact constraint that led to a choice
  var exactConstrForChoice = {};

  queue.push(uv);
  isEnqueued[uv.name] = true;

  while (queue.length > 0) {
    uv = queue[0];
    queue.shift();

    choices = _.clone(choices);
    choices.push(uv);

    var exactTransitiveDepsVersions =
      uv.exactTransitiveDependenciesVersions(self);
    var inexactTransitiveDeps = uv.inexactTransitiveDependencies(self);
    var transitiveConstraints = new ConstraintSolver.ConstraintsList();
    _.each(_.union(exactTransitiveDepsVersions, [uv]), function (uv) {
      transitiveConstraints = transitiveConstraints.union(uv.constraints);
    });

    var newChoices = exactTransitiveDepsVersions;

    dependencies = dependencies.union(inexactTransitiveDeps);
    constraints = constraints.union(transitiveConstraints);
    choices = _.union(choices, newChoices);

    // Since exact transitive deps are put into choices, there is no need to
    // keep them in dependencies.
    _.each(choices, function (uv) {
      dependencies = dependencies.remove(uv.name);
    });

    // There could be new combination of exact constraint/dependency outgoing
    // from existing state and the new node.
    // We don't need to look for all previously considered combinations.
    // Looking for newNode.dependencies+exact constraints and
    // newNode.exactConstraints+dependencies is enough.
    var newExactConstraintsList = uv.dependencies
      .exactConstraintsIntersection(constraints)
      .union(uv.constraints.exactDependenciesIntersection(uv.dependencies));

    newExactConstraintsList.each(function (c) {
      var dep = c.getSatisfyingUnitVersion(self);
      if (! dep)
        throw new Error("No unit version was found for the constraint -- " + c.toString());

      // Enqueue all new exact dependencies.
      if (_.has(isEnqueued, dep.name))
        return;
      queue.push(dep);
      isEnqueued[dep.name] = true;
      exactConstrForChoice[dep.name] = c;
    });

    var constr = exactConstrForChoice[uv.name];
    if (! constr) {
      // likely the uv passed to this propagation in a first place
      constraints.forPackage(uv.name, function (c) { constr = c; });
    }
    // for error reporting
    uv.constraints.each(function (c) {
      if (! constraintAncestor[c.toString()])
        constraintAncestor[c.toString()] = constr ? constraintAncestor[constr.toString()] : uv.name;
    });
  }

  // Update the constraintAncestor table
  _.each(choices, function (uv) {
    if (oldChoice[uv.name])
      return;

    var relevantConstraint = null;
    constraints.forPackage(uv.name, function (c) { relevantConstraint = c; });

    var rootAnc = null;
    if (relevantConstraint) {
      rootAnc = constraintAncestor[relevantConstraint.toString()];
    } else {
      // XXX this probably only works correctly when uv was a root dependency
      // w/o a constraint or dependency of one of the root deps.
      _.each(choices, function (choice) {
        if (rootAnc)
          return;

        if (choice.dependencies.contains(uv.name))
          rootAnc = choice.name;
      });

      if (! rootAnc)
        rootAnc = uv.name;
    }

    uv.constraints.each(function (c) {
      if (! constraintAncestor[c.toString()])
        constraintAncestor[c.toString()] = rootAnc;
    });
  });

  return {
    dependencies: dependencies,
    constraints: constraints,
    choices: choices,
    constraintAncestor: constraintAncestor
  };
};

var violatedConstraintsForSomeChoice = function (choices, constraints) {
  var ret = null;
  _.each(choices, function (choice) {
    if (ret)
      return;

    var violatedConstraints = constraints.violatedConstraints(choice);
    if (! _.isEmpty(violatedConstraints))
      ret = { constraints: violatedConstraints, choice: choice };
  });

  return ret;
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
  // Things with different build IDs should represent the same code, so ignore
  // them. (Notably: depending on @=1.3.1 should allow 1.3.1+local!)
  self.version = unitVersion.replace(/\+.*$/, '');
  self.dependencies = new ConstraintSolver.DependenciesList();
  self.constraints = new ConstraintSolver.ConstraintsList();
  // a string in a form of "1.2.0"
  self.earliestCompatibleVersion = ecv;
};

_.extend(ConstraintSolver.UnitVersion.prototype, {
  addDependency: function (name) {
    var self = this;

    check(name, String);
    if (self.dependencies.contains(name)) {
      return;
      // XXX may also throw if it is unexpected
      throw new Error("Dependency already exists -- " + name);
    }
    self.dependencies = self.dependencies.push(name);
  },
  addConstraint: function (constraint) {
    var self = this;

    check(constraint, ConstraintSolver.Constraint);
    if (self.constraints.contains(constraint)) {
      return;
      // XXX may also throw if it is unexpected
      throw new Error("Constraint already exists -- " + constraint.toString());
    }

    self.constraints = self.constraints.push(constraint);
  },

  // Returns a list of transitive exact constraints, those could be found as
  // transitive dependencies.
  _exactTransitiveConstraints: function (resolver) {
    var self = this;

    var exactTransitiveConstraints =
      self.dependencies.exactConstraintsIntersection(self.constraints);

    exactTransitiveConstraints.each(function (c) {
      var unitVersion = c.getSatisfyingUnitVersion(resolver);
      if (! unitVersion)
        throw new Error("No unit version was found for the constraint -- " + c.toString());

      // Collect the transitive dependencies of the direct exact dependencies.
      exactTransitiveConstraints = exactTransitiveConstraints.union(
                unitVersion._exactTransitiveConstraints(resolver));
    });

    return exactTransitiveConstraints;
  },

  // XXX weirdly returns an array as opposed to some UVCollection
  exactTransitiveDependenciesVersions: function (resolver) {
    var self = this;
    var uvs = [];
    self._exactTransitiveConstraints(resolver).each(function (c) {
      var unitVersion = c.getSatisfyingUnitVersion(resolver);
      if (! unitVersion)
        throw new Error("No unit version was found for the constraint -- " + c.toString());

      uvs.push(unitVersion);
    });

    return uvs;
  },

  inexactTransitiveDependencies: function (resolver) {
    var self = this;
    var exactTransitiveConstraints = self._exactTransitiveConstraints(resolver);
    var deps = self.dependencies;

    exactTransitiveConstraints.each(function (c) {
      var unitVersion = c.getSatisfyingUnitVersion(resolver);
      if (! unitVersion)
        throw new Error("No unit version was found for the constraint -- " + c.toString());

      deps = deps.union(unitVersion.dependencies);
    });

    // remove the the exact constraints
    exactTransitiveConstraints.each(function (c) {
      deps = deps.remove(c.name);
    });

    return deps;
  },

  toString: function () {
    var self = this;
    return self.name + "@" + self.version;
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
    // borrows the structure from the parseVersionConstraint format:
    // - type - String [compatibl-with|exactly|at-least]
    // - version - String - semver string
    _.extend(self, PackageVersion.parseConstraint(name));
  }
  // See comment in UnitVersion constructor.
  self.version = self.version.replace(/\+.*$/, '');
};

ConstraintSolver.Constraint.prototype.toString = function () {
  var self = this;
  var operator = "";
  if (self.type === "exactly")
    operator = "=";
  if (self.type === "at-least")
    operator = ">=";
  return self.name + "@" + operator + self.version;
};


ConstraintSolver.Constraint.prototype.isSatisfied = function (unitVersion) {
  var self = this;
  check(unitVersion, ConstraintSolver.UnitVersion);

  if (self.type === "exactly")
    return self.version === unitVersion.version;
  if (self.type === "at-least")
    return semver.lte(self.version, unitVersion.version);

  return semver.lte(self.version, unitVersion.version) &&
    semver.lte(unitVersion.earliestCompatibleVersion, self.version);
};

// Returns any unit version satisfying the constraint in the resolver
ConstraintSolver.Constraint.prototype.getSatisfyingUnitVersion =
  function (resolver) {
  var self = this;

  if (self.type === "exactly")
    return resolver._unitsVersionsMap[self.toString().replace("=", "")];

  var unitVersion = _.find(resolver.unitsVersions[self.name],
                           _.bind(self.isSatisfied, self));
  return unitVersion;
};
