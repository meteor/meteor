var semver = Npm.require('semver');

mori = Npm.require('mori');

BREAK = {};  // used by our 'each' functions

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
ConstraintSolver.Resolver = function (options) {
  var self = this;
  options = options || {};

  self._nudge = options.nudge;

  // Maps unit name string to a sorted array of version definitions
  self.unitsVersions = {};
  // Maps name@version string to a unit version
  self._unitsVersionsMap = {};

  // Refs to all constraints. Mapping String -> instance
  self._constraints = {};

  // Let's say that we that package P is available from source at version X.Y.Z.
  // Then that's the only version that can actually be chosen by the resolver,
  // and so it's the only version included as a UnitVersion.  But let's say
  // another unit depends on it with a 'compatible-with' dependency "@A.B.C". We
  // need to be able to figure out the earliestCompatibleVersion of A.B.C, even
  // though A.B.C is not a valid (selectable) UnitVersion. We store them here.
  //
  // Maps String unitName -> String version -> String earliestCompatibleVersion
  self._extraECVs = {};
};

ConstraintSolver.Resolver.prototype.addUnitVersion = function (unitVersion) {
  var self = this;

  check(unitVersion, ConstraintSolver.UnitVersion);

  if (_.has(self._unitsVersionsMap, unitVersion.toString())) {
    throw Error("duplicate uv " + unitVersion.toString() + "?");
  }

  if (! _.has(self.unitsVersions, unitVersion.name)) {
    self.unitsVersions[unitVersion.name] = [];
  } else {
    var latest = _.last(self.unitsVersions[unitVersion.name]).version;
    if (!semver.lt(latest, unitVersion.version)) {
      throw Error("adding uv out of order: " + latest + " vs "
                  + unitVersion.version);
    }
  }

  self.unitsVersions[unitVersion.name].push(unitVersion);
  self._unitsVersionsMap[unitVersion.toString()] = unitVersion;
};



ConstraintSolver.Resolver.prototype.getUnitVersion = function (unitName, version) {
  var self = this;
  return self._unitsVersionsMap[unitName + "@" + version];
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

ConstraintSolver.Resolver.prototype.addExtraECV = function (
    unitName, version, earliestCompatibleVersion) {
  var self = this;
  check(unitName, String);
  check(version, String);
  check(earliestCompatibleVersion, String);

  if (!_.has(self._extraECVs, unitName)) {
    self._extraECVs[unitName] = {};
  }
  self._extraECVs[unitName][version] = earliestCompatibleVersion;
};

ConstraintSolver.Resolver.prototype.getEarliestCompatibleVersion = function (
    unitName, version) {
  var self = this;

  var uv = self.getUnitVersion(unitName, version);
  if (uv) {
    return uv.earliestCompatibleVersion;
  }
  if (!_.has(self._extraECVs, unitName)) {
    return null;
  }
  if (!_.has(self._extraECVs[unitName], version)) {
    return null;
  }
  return self._extraECVs[unitName][version];
};

// options: Object:
// - costFunction: function (state, options) - given a state evaluates its cost
// - estimateCostFunction: function (state) - given a state, evaluates the
// estimated cost of the best path from state to a final state
// - combineCostFunction: function (cost, cost) - given two costs (obtained by
// evaluating states with costFunction and estimateCostFunction)
ConstraintSolver.Resolver.prototype.resolve = function (
    dependencies, constraints, options) {
  var self = this;

  constraints = constraints || [];
  var choices = mori.hash_map();  // uv.name -> uv
  options = _.extend({
    costFunction: function (state) { return 0; },
    estimateCostFunction: function (state) {
      return 0;
    },
    combineCostFunction: function (cost, anotherCost) {
      return cost + anotherCost;
    }
  }, options);

  // Mapping that assigns every package an integer priority. We compute this
  // dynamically and in the process of resolution we try to resolve packages
  // with higher priority first. This helps the resolver a lot because if some
  // package has a higher weight to the solution (like a direct dependency) or
  // is more likely to break our solution in the future than others, it would be
  // great to try out and evaluate all versions early in the decision tree.
  var resolutionPriority = {};

  var startState = new ResolverState(self);
  _.each(constraints, function (constraint) {
    startState = startState.addConstraint(constraint);
  });
  _.each(dependencies, function (unitName) {
    startState = startState.addDependency(unitName);
    // Direct dependencies start on higher priority
    resolutionPriority[unitName] = 100;
  });

  if (startState.success()) {
    return startState.choices;
  }

  if (startState.error) {
    throwConstraintSolverError(startState.error);
  }

  var pq = new PriorityQueue();
  var overallCostFunction = function (state) {
    return [
      options.combineCostFunction(
        options.costFunction(state),
        options.estimateCostFunction(state)),
      -mori.count(state.choices)
    ];
  };

  pq.push(startState, overallCostFunction(startState));

  var someError = null;
  var anySucceeded = false;
  while (! pq.empty()) {
    // Since we're in a CPU-bound loop, allow yielding or printing a message or
    // something.
    self._nudge && self._nudge();

    var currentState = pq.pop();

    if (currentState.success()) {
      return currentState.choices;
    }

    var neighborsObj = self._stateNeighbors(currentState, resolutionPriority);

    if (! neighborsObj.success) {
      someError = someError || neighborsObj.failureMsg;
      resolutionPriority[neighborsObj.conflictingUnit] =
        (resolutionPriority[neighborsObj.conflictingUnit] || 0) + 1;
    } else {
      _.each(neighborsObj.neighbors, function (state) {
        // We don't just return the first successful one we find, in case there
        // are multiple successful states (we want to sort by cost function in
        // that case).
        pq.push(state, overallCostFunction(state));
      });
    }
  }

  // XXX should be much much better
  if (someError) {
    throwConstraintSolverError(someError);
  }

  throw new Error("ran out of states without error?");
};

var throwConstraintSolverError = function (message) {
  var e = new Error(message);
  e.constraintSolverError = true;
  throw e;
};

// returns {
//   success: Boolean,
//   failureMsg: String,
//   neighbors: [state]
// }
ConstraintSolver.Resolver.prototype._stateNeighbors = function (
    state, resolutionPriority) {
  var self = this;

  var candidateName = null;
  var candidateVersions = null;
  var currentNaughtiness = -1;

  state.eachDependency(function (unitName, versions) {
    var r = resolutionPriority[unitName] || 0;
    if (r > currentNaughtiness) {
      currentNaughtiness = r;
      candidateName = unitName;
      candidateVersions = versions;
    }
  });

  if (mori.is_empty(candidateVersions))
    throw Error("empty candidate set? should have detected earlier");

  var neighbors = [];
  var firstError = null;
  mori.each(candidateVersions, function (unitVersion) {
    var neighborState = state.addChoice(unitVersion);
    if (!neighborState.error) {
      neighbors.push(neighborState);
    } else if (!firstError) {
      firstError = neighborState.error;
    }
  });

  if (neighbors.length) {
    return { success: true, neighbors: neighbors };
  }
  return {
    success: false,
    failureMsg: firstError,
    conflictingUnit: candidateName
  };
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
  self.dependencies = [];
  self.constraints = new ConstraintSolver.ConstraintsList();
  // a string in a form of "1.2.0"
  self.earliestCompatibleVersion = ecv;
};

_.extend(ConstraintSolver.UnitVersion.prototype, {
  addDependency: function (name) {
    var self = this;

    check(name, String);
    if (_.contains(self.dependencies, name)) {
      return;
    }
    self.dependencies.push(name);
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
    _.extend(self,
             PackageVersion.parseVersionConstraint(
               versionString, {allowAtLeast: true}));
    self.name = name;
  } else {
    // borrows the structure from the parseVersionConstraint format:
    // - type - String [compatibl-with|exactly|at-least]
    // - version - String - semver string
    _.extend(self, PackageVersion.parseConstraint(name, {allowAtLeast: true}));
  }
  // See comment in UnitVersion constructor.
  self.version = self.version.replace(/\+.*$/, '');
};

ConstraintSolver.Constraint.prototype.toString = function (options) {
  var self = this;
  options = options || {};
  var operator = "";
  if (self.type === "exactly")
    operator = "=";
  if (self.type === "at-least")
    operator = ">=";
  var name = options.removeUnibuild ? removeUnibuild(self.name) : self.name;
  return name + "@" + operator + self.version;
};


ConstraintSolver.Constraint.prototype.isSatisfied = function (candidateUV,
                                                              resolver) {
  var self = this;
  check(candidateUV, ConstraintSolver.UnitVersion);

  // Pre-releases only match precisely; @1.2.3-rc1 doesn't necessarily match
  // 1.2.4, and @1.2.3 doesn't necessarily match 1.2.4-rc1.
  if (/-/.test(candidateUV.version) || /-/.test(self.version)) {
    return self.version === candidateUV.version;
  }

  if (self.type === "exactly")
    return self.version === candidateUV.version;

  // If the candidate version is less than the version named in the constraint,
  // we are not satisfied.
  if (semver.lt(candidateUV.version, self.version))
    return false;

  // If we only care about "at-least" and not backwards-incompatible changes in
  // the middle, then candidateUV is good enough.
  if (self.type === "at-least")
    return true;

  var myECV = resolver.getEarliestCompatibleVersion(self.name, self.version);
  // If the constraint is "@1.2.3" and 1.2.3 doesn't exist, then nothing can
  // match. This is because we don't know the ECV (compatibility class) of
  // 1.2.3!
  if (!myECV)
    return false;

  // To be compatible, the two versions must have the same
  // earliestCompatibleVersion. If the earliestCompatibleVersions haven't been
  // overridden from their default, this means that the two versions have the
  // same major version number.
  return myECV === candidateUV.earliestCompatibleVersion;
};

// Returns any unit version satisfying the constraint in the resolver
ConstraintSolver.Constraint.prototype.getSatisfyingUnitVersion = function (
    resolver) {
  var self = this;

  if (self.type === "exactly") {
    return resolver.getUnitVersion(self.name, self.version);
  }

  // XXX this chooses a random UV, not the earliest or latest. Is that OK?
  return _.find(resolver.unitsVersions[self.name], function (uv) {
    return self.isSatisfied(uv, resolver);
  });
};
