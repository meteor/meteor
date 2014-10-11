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
    if (!PackageVersion.lessThan(latest, unitVersion.version)) {
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

  var resolveContext = new ResolveContext;

  // Mapping that assigns every package an integer priority. We compute this
  // dynamically and in the process of resolution we try to resolve packages
  // with higher priority first. This helps the resolver a lot because if some
  // package has a higher weight to the solution (like a direct dependency) or
  // is more likely to break our solution in the future than others, it would be
  // great to try out and evaluate all versions early in the decision tree.
  // XXX this could go on ResolveContext
  var resolutionPriority = {};

  var startState = new ResolverState(self, resolveContext);

  if (options.useRCs) {
    resolveContext.useRCsOK = true;
  }

  _.each(constraints, function (constraint) {
    startState = startState.addConstraint(constraint, mori.list());

    // Keep track of any top-level constraints that mention a pre-release.
    // These will be the only pre-release versions that count as "reasonable"
    // for "any-reasonable" (ie, unconstrained) constraints.
    //
    // Why only top-level mentions, and not mentions we find while walking the
    // graph? The constraint solver assumes that adding a constraint to the
    // resolver state can't make previously impossible choices now possible.  If
    // pre-releases mentioned anywhere worked, then applying the constraints
    // "any reasonable" followed by "1.2.3-rc1" would result in "1.2.3-rc1"
    // ruled first impossible and then possible again. That's no good, so we
    // have to fix the meaning based on something at the start.  (We could try
    // to apply our prerelease-avoidance tactics solely in the cost functions,
    // but then it becomes a much less strict rule.)
    if (constraint.version && /-/.test(constraint.version)) {
      if (!_.has(resolveContext.topLevelPrereleases, constraint.name)) {
        resolveContext.topLevelPrereleases[constraint.name] = {};
      }
      resolveContext.topLevelPrereleases[constraint.name][constraint.version]
        = true;
    }
  });

  _.each(dependencies, function (unitName) {
    startState = startState.addDependency(unitName, mori.list());
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

  var pathway = state.somePathwayForUnitName(candidateName);

  var neighbors = [];
  var firstError = null;
  mori.each(candidateVersions, function (unitVersion) {
    var neighborState = state.addChoice(unitVersion, pathway);
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
  self.version = PackageVersion.removeBuildID(unitVersion);
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

  toString: function (options) {
    var self = this;
    options = options || {};
    var name = options.removeUnibuild ? removeUnibuild(self.name) : self.name;
    return name + "@" + self.version;
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
    name = name + "@" + versionString;
  }

  // See comment in UnitVersion constructor. We want to strip out build IDs
  // because the code they represent is considered equivalent.
  _.extend(self, PackageVersion.parseConstraint(name, {
    removeBuildIDs: true,
    archesOK: true
  }));

};

ConstraintSolver.Constraint.prototype.toString = function (options) {
  var self = this;
  options = options || {};
  var name = options.removeUnibuild ? removeUnibuild(self.name) : self.name;
  return name + "@" + self.constraintString;
};


ConstraintSolver.Constraint.prototype.isSatisfied = function (
  candidateUV, resolver, resolveContext) {
  var self = this;
  check(candidateUV, ConstraintSolver.UnitVersion);

  if (self.name !== candidateUV.name) {
    throw Error("asking constraint on " + self.name + " about " +
                candidateUV.name);
  }

  return _.some(self.constraints, function (currConstraint) {
     if (currConstraint.type === "any-reasonable") {
      // Non-prerelease versions are always reasonable, and if we are OK with
      // using RCs all the time, then they are reasonable too.
      if (!/-/.test(candidateUV.version) ||
          resolveContext.useRCsOK)
        return true;

      // Is it a pre-release version that was explicitly mentioned at the top
      // level?
      if (_.has(resolveContext.topLevelPrereleases, self.name) &&
          _.has(resolveContext.topLevelPrereleases[self.name],
                candidateUV.version)) {
        return true;
      }

      // Otherwise, not this pre-release!
      return false;
    }

    if (currConstraint.type === "exactly") {
      return currConstraint.version === candidateUV.version;
    }

    if (currConstraint.type !== "compatible-with") {
      throw Error("Unknown constraint type: " + currConstraint.type);
    }

    // If you're not asking for a pre-release (and you are not in pre-releases-OK
    // mode), you'll only get it if it was a top level explicit mention (eg, in
    // the release).
    if (!/-/.test(currConstraint.version) &&
        /-/.test(candidateUV.version) && !resolveContext.useRCsOK) {
      if (currConstraint.version === candidateUV.version)
        return true;
      if (!_.has(resolveContext.topLevelPrereleases, self.name) ||
          !_.has(resolveContext.topLevelPrereleases[self.name],
                 candidateUV.version)) {
        return false;
      }
    }

    // If the candidate version is less than the version named in the constraint,
    // we are not satisfied.
    if (PackageVersion.lessThan(candidateUV.version, currConstraint.version))
      return false;

    var myECV = resolver.getEarliestCompatibleVersion(
      self.name, currConstraint.version);
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
  });

};

// An object that records the general context of a resolve call. It can be
// different for different resolve calls on the same Resolver, but is the same
// for every ResolverState in a given call.
var ResolveContext = function () {
  var self = this;
  // unitName -> version string -> true
  self.topLevelPrereleases = {};
  self.useRCsOK = false;
};
