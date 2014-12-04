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
    },
    anticipatedPrereleases: {}
  }, options);

  var resolveContext = new ResolveContext(options.anticipatedPrereleases);

  // Mapping that assigns every package an integer priority. We compute this
  // dynamically and in the process of resolution we try to resolve packages
  // with higher priority first. This helps the resolver a lot because if some
  // package has a higher weight to the solution (like a direct dependency) or
  // is more likely to break our solution in the future than others, it would be
  // great to try out and evaluate all versions early in the decision tree.
  // XXX this could go on ResolveContext
  var resolutionPriority = {};

  var startState = new ResolverState(self, resolveContext);

  _.each(constraints, function (constraint) {
    startState = startState.addConstraint(constraint, mori.list());
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

ConstraintSolver.UnitVersion = function (name, unitVersion) {
  var self = this;

  check(name, String);
  check(unitVersion, String);
  check(self, ConstraintSolver.UnitVersion);

  self.name = name;
  // Things with different build IDs should represent the same code, so ignore
  // them. (Notably: depending on @=1.3.1 should allow 1.3.1+local!)
  // XXX we no longer automatically add build IDs to things as part of our build
  // process, but this still reflects semver semantics.
  self.version = PackageVersion.removeBuildID(unitVersion);
  self.dependencies = [];
  self.constraints = new ConstraintSolver.ConstraintsList();
  // integer like 1 or 2
  self.majorVersion = PackageVersion.majorVersion(unitVersion);
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
ConstraintSolver.Constraint = function (name, constraintString) {
  var self = this;
  if (constraintString) {
    name = name + "@" + constraintString;
  }

  // See comment in UnitVersion constructor. We want to strip out build IDs
  // because the code they represent is considered equivalent.
  var parsed = PackageVersion.parseConstraint(name, {
    removeBuildIDs: true
  });

  self.name = parsed.name;
  self.constraintString = parsed.constraintString;
  // The results of parsing are a disjunction (`||`) of simple
  // constraints like `1.0.0` or `=1.0.1`, which have been parsed into
  // objects with a `type` and `version` property.
  self.disjunction = parsed.constraints;
};

ConstraintSolver.Constraint.prototype.toString = function (options) {
  var self = this;
  return self.name + "@" + self.constraintString;
};


ConstraintSolver.Constraint.prototype.isSatisfied = function (
  candidateUV, resolver, resolveContext) {
  var self = this;
  check(candidateUV, ConstraintSolver.UnitVersion);

  if (self.name !== candidateUV.name) {
    throw Error("asking constraint on " + self.name + " about " +
                candidateUV.name);
  }

  var prereleaseNeedingLicense = false;

  // We try not to allow "pre-release" versions (versions with a '-') unless
  // they are explicitly mentioned.  If the `anticipatedPrereleases` option is
  // `true` set, all pre-release versions are allowed.  Otherwise,
  // anticipatedPrereleases lists pre-release versions that are always allow
  // (this corresponds to pre-release versions mentioned explicitly in
  // *top-level* constraints).
  //
  // Otherwise, if `candidateUV` is a pre-release, it needs to be "licensed" by
  // being mentioned by name in *this* constraint or matched by an inexact
  // constraint whose version also has a '-'.
  //
  // Note that a constraint "@2.0.0" can never match a version "2.0.1-rc.1"
  // unless anticipatedPrereleases allows it, even if another constraint found
  // in the graph (but not at the top level) explicitly mentions "2.0.1-rc.1".
  // Why? The constraint solver assumes that adding a constraint to the resolver
  // state can't make previously impossible choices now possible.  If
  // pre-releases mentioned anywhere worked, then applying the constraint
  // "@2.0.0" followed by "@=2.0.1-rc.1" would result in "2.0.1-rc.1" ruled
  // first impossible and then possible again. That will break this algorith, so
  // we have to fix the meaning based on something known at the start of the
  // search.  (We could try to apply our prerelease-avoidance tactics solely in
  // the cost functions, but then it becomes a much less strict rule.)
  if (resolveContext.anticipatedPrereleases !== true
      && /-/.test(candidateUV.version)) {
    var isAnticipatedPrerelease = (
      _.has(resolveContext.anticipatedPrereleases, self.name) &&
        _.has(resolveContext.anticipatedPrereleases[self.name],
              candidateUV.version));
    if (! isAnticipatedPrerelease) {
      prereleaseNeedingLicense = true;
    }
  }

  return _.some(self.disjunction, function (simpleConstraint) {
    var type = simpleConstraint.type;

    if (type === "any-reasonable") {
      return ! prereleaseNeedingLicense;
    } else if (type === "exactly") {
      var version = simpleConstraint.version;
      return (version === candidateUV.version);
    } else if (type === 'compatible-with') {
      var version = simpleConstraint.version;

      if (prereleaseNeedingLicense && ! /-/.test(version)) {
        return false;
      }

      // If the candidate version is less than the version named in the
      // constraint, we are not satisfied.
      if (PackageVersion.lessThan(candidateUV.version, version)) {
        return false;
      }

      // To be compatible, the two versions must have the same major version
      // number.
      if (candidateUV.majorVersion !== PackageVersion.majorVersion(version)) {
        return false;
      }

      return true;
    } else {
      throw Error("Unknown constraint type: " + type);
    }
  });
};

// An object that records the general context of a resolve call. It can be
// different for different resolve calls on the same Resolver, but is the same
// for every ResolverState in a given call.
var ResolveContext = function (anticipatedPrereleases) {
  var self = this;
  // EITHER: "true", in which case all prereleases are anticipated, or a map
  //         unitName -> version string -> true
  self.anticipatedPrereleases = anticipatedPrereleases;
};
