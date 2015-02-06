var CS = ConstraintSolver;
var PV = PackageVersion;

CS.Solver = function (input, options) {
  var self = this;
  check(input, CS.Input);

  self.input = input;
  self.errors = []; // [String]

  self.debugLog = null;
  if (options && options.debugLog) {
    self.debugLog = [];
  }

  self._getVersionInfo = _.memoize(PV.parse);
  self._getConstraintFormula = _.memoize(_getConstraintFormula,
                                         function (p, vConstraint) {
                                           return p + "@" + vConstraint.raw;
                                         });
};

CS.Solver.prototype.getSolution = function () {
  var self = this;

  self.logic = new Logic.Solver;

  self._requireTopLevelDependencies(); // may throw

  // "bar" -> ["foo 1.0.0", ...] if "foo 1.0.0" requires "bar"
  self._requirers = {};
  // package names we come across that aren't in the cache
  self._unknownPackages = {}; // package name -> true
  // populates _requirers and _unknownPackages:
  self._enforceStrongDependencies();

  // if this is greater than 0, we will throw an error later
  // and say what they are, after we run the constraints
  // and the cost function.
  self._numUnknownPackagesNeeded = self._minimizeUnknownPackages();

  self._constraintSatisfactionOptions = {
    anticipatedPrereleases: self.input.anticipatedPrereleases
  };
  self._allConstraints = []; // added to by self._addConstraint(...)
  self._numConflicts = self._enforceConstraints();

  self._costFunction = self._generateCostFunction();
  self._minimizeCostFunction();

  self._solution = self.logic.solve();
  if (! self._solution) {
    // can't get here; should be in a satisfiable state (or have thrown)
    throw new Error("Unexpected unsatisfiability");
  }

  self._throwUnknownPackages();
  self._throwConflicts();

  var versionMap = {};
  _.each(self._solution.getTrueVars(), function (x) {
    if (x.indexOf(' ') >= 0) {
      var pv = CS.PackageAndVersion.fromString(x);
      versionMap[pv.package] = pv.version;
    }
  });

  return {
    neededToUseUnanticipatedPrereleases: false, // XXX
    answer: versionMap
  };
};

CS.Solver.prototype.getCostReport = function () {
  var self = this;
  var solution = self._solution;
  return _.map(self._costFunction.components, function (comp) {
    var total = 0;
    var terms = {};
    _.each(comp.terms, function (t, i) {
      var w = comp.weights[i];
      if (w && solution.evaluate(t)) {
        total += w;
        terms[t] = w;
      }
    });
    return [comp.name, total, terms];
  });
};

var pvVar = function (p, v) {
  return p + ' ' + v;
};

CS.Solver.prototype._requireTopLevelDependencies = function () {
  var self = this;
  var input = self.input;

  _.each(input.dependencies, function (p) {
    if (! input.isKnownPackage(p)) {
      // Unknown package at top level
      self.errors.push('unknown package: ' + p);
    } else {
      self.logic.require(p);
      if (self.debugLog) {
        self.debugLog.push('REQUIRE ' + p);
      }
    }
  });

  self.throwAnyErrors();
};

CS.Solver.prototype._enforceStrongDependencies = function () {
  var self = this;
  var input = self.input;
  var cache = input.catalogCache;

  var unknownPackages = self._unknownPackages;
  var requirers = self._requirers;

  cache.eachPackage(function (p, versions) {
    // it's important that every package have a key in `requirers`,
    // because we iterate over it.
    requirers[p] = (requirers[p] || []);

    // ["foo 1.0.0", "foo 1.0.1", ...] for a given "foo"
    var packageAndVersions = _.map(versions, function (v) {
      return pvVar(p, v);
    });
    // At most one of ["foo 1.0.0", "foo 1.0.1", ...] is true.
    self.logic.require(Logic.atMostOne(packageAndVersions));
    if (self.debugLog) {
      self.debugLog.push("AT MOST ONE: " +
                         (packageAndVersions.join(', ') || '[]'));
    }
    // The variable "foo" is true if and only if at least one of the
    // variables ["foo 1.0.0", "foo 1.0.1", ...] is true.
    // Note that this doesn't apply to unknown packages (packages
    // that aren't in the cache), which aren't visited here.
    // We will forbid them later, and generate a good error message
    // if that leads to unsatisfiability.
    self.logic.require(Logic.equiv(p, Logic.or(packageAndVersions)));
    if (self.debugLog) {
      self.debugLog.push(p + ' IFF ONE OF: ' +
                         (packageAndVersions.join(', ') || '[]'));
    }

    _.each(versions, function (v) {
      var pv = pvVar(p, v);
      _.each(cache.getDependencyMap(p, v), function (dep) {
        // `dep` is a CS.Dependency
        var p2 = dep.packageConstraint.package;
        if (! input.isKnownPackage(p2)) {
          unknownPackages[p2] = true;
        }
        if (! dep.isWeak) {
          requirers[p2] = (requirers[p2] || []);
          requirers[p2].push(pv);
          self.logic.require(Logic.implies(pv, p2));
        }
      });
    });
  });

  // the keys of `requirers` are the union of the packages in the cache
  // (whether or not anyone requires them) and the packages mentioned
  // as dependencies (whether or not they exist in the catalog)
//  _.each(requirers, function (pvs, p) {
//    // pvs are all the package-versions that require p.
//    // We want to select p if-and-only-if we select one of the pvs
//    // (except when p is a root dependency, in which case
//    // we've already required it).
//    if (! input.isRootDependency(p)) {
//      self.logic.require(Logic.equiv(p, Logic.or(pvs)));
//      if (self.debugLog) {
//        self.debugLog.push(p + ' IFF ONE OF: ' +
//                           (pvs.join(', ') || '[]'));
//      }
//    }
//  });
};

CS.Solver.prototype.throwAnyErrors = function () {
  if (this.errors.length) {
    CS.throwConstraintSolverError(this.errors.join('\n'));
  }
};

CS.Solver.prototype._minimizeUnknownPackages = function () {
  var self = this;
  var unknownPackages = _.keys(self._unknownPackages);
  var useAnyUnknown = Logic.or(unknownPackages);

  var sol = self.logic.solve();
  if (! sol) {
    // so far we have no version constraints, and it's a valid solution
    // to just select some version of every package, and also select
    // all the non-existent packages that are mentioned, since we haven't
    // forbid them yet.
    throw new Error("Unexpected unsatisfiability");
  }

  if (self.logic.solveAssuming(Logic.not(useAnyUnknown))) {
    if (self.debugLog) {
      self.debugLog.push('FORBID: ' +
                         (unknownPackages.join(', ') || '[]'));
    }
    self.logic.forbid(unknownPackages);
    return [];
  } else {
    // apparently we can't ignore some of the unknown packages;
    // we have to use at least one.  this will become an error,
    // but we don't want to throw it yet so that we can run
    // the cost function so that we are showing realistic versions
    // in the error.
    sol = self.logic.minimize(sol, unknownPackages, 1);
    var result = sol.getWeightedSum(unknownPackages, 1);
    if (self.debugLog) {
      self.debugLog.push('AT MOST ' + result + ' OF: ' +
                         (unknownPackages.join(', ') || '[]'));
    }
    return result;
  }
};

CS.Solver.prototype._generateCostFunction = function () {
  var self = this;
  // classify packages into categories, which determine what we
  // are supposed to be optimizing about the version and with what
  // priority.
  var costFunc = new CS.Solver.CostFunction();
  // 1 if we change the major version of a root dep with previous version
  costFunc.addComponent('previous_root_major');
  // 1 if we move a root dep backwards in the same major version
  costFunc.addComponent('previous_root_incompat');
  // 1 if we change a root dep from previous version
  costFunc.addComponent('previous_root_change');
  // number of versions forward or backward we move a root dep
  costFunc.addComponent('previous_root_distance');

  costFunc.addComponent('previous_indirect_major');
  costFunc.addComponent('previous_indirect_incompat');
  costFunc.addComponent('previous_indirect_change');
  costFunc.addComponent('previous_indirect_distance');

  // XXX probably need some more nuance here.
  // In general, we want packages we're upgrading and new root dependencies
  // (just added or in case of no previous solution) to be as new as possible,
  // so we penalize oldness.  New indirect dependencies should be as old as
  // possible, so we penalize newness.
  costFunc.addComponent('upgrade_oldness');
  costFunc.addComponent('new_root_oldness');
  costFunc.addComponent('new_indirect_major_newness');
  costFunc.addComponent('new_indirect_minor_newness');
  costFunc.addComponent('new_indirect_patch_newness');
  costFunc.addComponent('new_indirect_newness');

  // This is purely to forbid packages that aren't really required, so it
  // comes last.  We don't want to base any real choices on how many
  // packages they require.
  costFunc.addComponent('total_packages');

  var input = self.input;
  input.catalogCache.eachPackage(function (p, versions) {
    costFunc.addToComponent('total_packages', p, 1);

    if (input.isUpgrading(p)) {
      _.each(versions, function (v, i) {
        var pv = pvVar(p, v);
        costFunc.addToComponent('upgrade_oldness', pv,
                                versions.length - 1 - i);
      });
    } else if (input.isInPreviousSolution(p)) {
      var previous = input.previousSolution[p];
      var previousVInfo = self._getVersionInfo(previous);
      if (input.isRootDependency(p)) {
        // previous_root

        var firstGteIndex = versions.length;
        // previous version should be in versions array, but we don't
        // want to assume that
        var previousFound = false;
        _.each(versions, function (v, i) {
          var vInfo = self._getVersionInfo(v);
          var pv = pvVar(p, v);
          if (vInfo.major !== previousVInfo.major) {
            costFunc.addToComponent('previous_root_major', pv, 1);
          } else if (PV.lessThan(vInfo, previousVInfo)) {
            costFunc.addToComponent('previous_root_incompat', pv, 1);
          }
          if (v !== previous) {
            costFunc.addToComponent('previous_root_change', pv, 1);
          }
          if (firstGteIndex === versions.length &&
              ! PV.lessThan(vInfo, previousVInfo)) {
            firstGteIndex = i;
            if (v === previous) {
              previousFound = true;
            }
          }
        });
        _.each(versions, function (v, i) {
          var pv = pvVar(p, v);
          if (i < firstGteIndex) {
            costFunc.addToComponent('previous_root_distance', pv,
                                    firstGteIndex - i);
          } else {
            costFunc.addToComponent('previous_root_distance', pv,
                                    i - firstGteIndex +
                                    (previousFound ? 0 : 1));
          }
        });

      } else {
        // previous_indirect

        var firstGteIndex = versions.length;
        // previous version should be in versions array, but we don't
        // want to assume that
        var previousFound = false;
        _.each(versions, function (v, i) {
          var vInfo = self._getVersionInfo(v);
          var pv = pvVar(p, v);
          if (vInfo.major !== previousVInfo.major) {
            costFunc.addToComponent('previous_indirect_major', pv, 1);
          } else if (PV.lessThan(vInfo, previousVInfo)) {
            costFunc.addToComponent('previous_indirect_incompat', pv, 1);
          }
          if (v !== previous) {
            costFunc.addToComponent('previous_indirect_change', pv, 1);
          }
          if (firstGteIndex === versions.length &&
              ! PV.lessThan(vInfo, previousVInfo)) {
            firstGteIndex = i;
            if (v === previous) {
              previousFound = true;
            }
          }
        });
        _.each(versions, function (v, i) {
          var pv = pvVar(p, v);
          if (i < firstGteIndex) {
            costFunc.addToComponent('previous_indirect_distance', pv,
                                    firstGteIndex - i);
          } else {
            costFunc.addToComponent('previous_indirect_distance', pv,
                                    i - firstGteIndex +
                                    (previousFound ? 0 : 1));
          }
        });
      }
    } else {
      if (input.isRootDependency(p)) {
        // new_root
        _.each(versions, function (v, i) {
          var pv = pvVar(p, v);
          costFunc.addToComponent('new_root_oldness', pv,
                                  versions.length - 1 - i);
        });
      } else {
        // new_indirect
        _.each(versions, function (v, i) {
          var pv = pvVar(p, v);
          var vInfo = self._getVersionInfo(v);
          costFunc.addToComponent('new_indirect_major_newness', pv,
                                  vInfo.major);
          costFunc.addToComponent('new_indirect_minor_newness', pv,
                                  vInfo.minor);
          costFunc.addToComponent('new_indirect_patch_newness', pv,
                                  vInfo.patch);
          costFunc.addToComponent('new_indirect_newness', pv, i);
        });
      }
    }
  });

  return costFunc;
};

var getDebugLogForWeightedSum = function (solution, terms, weights) {
  if (typeof weights === 'number') {
    weights = _.map(terms, function () { return weights; });
  }
  return 'REQUIRE ' + (_.map(terms, function (t, i) {
    return weights[i] + '*(' + t + ')';
  }).join(' + ') || '0')+ ' = ' + solution.getWeightedSum(terms, weights);
};

CS.Solver.prototype._minimizeCostFunction = function () {
  var self = this;
  var sol = self.logic.solve();
  if (! sol) {
    // we've already been checking as we go along that the
    // problem is still solvable
    throw new Error("Unexpected unsatisfiability");
  }

  var costFunc = self._costFunction;
  _.each(costFunc.components, function (comp) {
    sol = self.logic.minimize(sol, comp.terms, comp.weights);
    if (self.debugLog) {
      self.debugLog.push(getDebugLogForWeightedSum(
        sol, comp.terms, comp.weights));
    }
  });
};

CS.Solver.prototype._getOkVersions = function (toPackage, vConstraint,
                                               targetVersions) {
  var self = this;
  return _.compact(_.map(targetVersions, function (v) {
    if (CS.isConstraintSatisfied(
      toPackage, vConstraint, v, self._constraintSatisfactionOptions)) {
      return pvVar(toPackage, v);
    } else {
      return null;
    }
  }));
};

// The CS.Solver constructor turns this into a memoized method.
// Memoizing the Formula object reduces clause generation a lot.
var _getConstraintFormula = function (toPackage, vConstraint) {
  var self = this;

  var targetVersions = self.input.catalogCache.getPackageVersions(toPackage);
  var okVersions = self._getOkVersions(toPackage, vConstraint, targetVersions);

  if (okVersions.length === targetVersions.length) {
    return Logic.TRUE;
  } else {
    return Logic.or(Logic.not(toPackage), okVersions);
  }
};

CS.Solver.prototype._addConstraint = function (fromVar, toPackage, vConstraint) {
  // fromVar is a return value of pvVar(p, v), or null for a top-level constraint
  check(fromVar, Match.OneOf(String, null));
  check(toPackage, String); // package name
  check(vConstraint, CS.Input.VersionConstraintType);

  var self = this;
  var allConstraints = self._allConstraints;

  var newConstraint = new CS.Solver.Constraint(
    "constraint#" + allConstraints.length, fromVar, toPackage, vConstraint);
  allConstraints.push(newConstraint);

  // We logically require that IF:
  //
  // - the constraint var is true, meaning the constraint is active and not
  // being skipped for conflict-detection purposes; and
  // - fromVar is true, meaning we have selected the package version having
  // the constraint, or is non-existent, meaning this is a top-level
  // constraint; and
  // - toPackage is true, meaning we have selected the package that the
  // constraint is about
  //
  // ... then one of the versions of toPackage that satisfies the constraint
  // must be selected.
  self.logic.require(
    Logic.implies(newConstraint.varName,
                  Logic.or(fromVar ? Logic.not(fromVar) : [],
                           self._getConstraintFormula(toPackage, vConstraint))));

  if (self.debugLog) {
    var conditions = [newConstraint.varName];
    if (fromVar) {
      conditions.push('(' + fromVar + ')');
    }
    conditions.push(toPackage);
    self.debugLog.push(
      'IF ' + conditions.join(' AND ') + ' THEN ONE OF: ' +
        (self._getOkVersions(
          toPackage, vConstraint,
          self.input.catalogCache.getPackageVersions(toPackage)
        ).join(', ') || '[]'));
  }
};

// Register the constraints with the logic solver, but don't actually
// enforce them yet (so we can do conflict detection).
CS.Solver.prototype._enforceConstraints = function () {
  var self = this;
  var cache = self.input.catalogCache;

  // top-level constraints
  _.each(self.input.constraints, function (c) {
    self._addConstraint(null, c.package, c.versionConstraint);
  });

  // constraints specified by package versions
  cache.eachPackage(function (p, versions) {
    _.each(versions, function (v) {
      var pv = pvVar(p, v);
      _.each(cache.getDependencyMap(p, v), function (dep) {
        // `dep` is a CS.Dependency
        var p2 = dep.packageConstraint.package;
        if (self.input.isKnownPackage(p2)) {
          self._addConstraint(pv, p2,
                              dep.packageConstraint.versionConstraint);
        }
      });
    });
  });

  // minimize conflicts
  var allConstraints = self._allConstraints;
  var allConstraintVars = _.pluck(allConstraints, 'varName');
  var allConstraintsActive = Logic.and(allConstraintVars);

  var sol = self.logic.solveAssuming(allConstraintsActive);
  if (sol) {
    self.logic.require(allConstraintVars);
    if (self.debugLog) {
      self.debugLog.push('REQUIRE: ' +
                         (allConstraintVars.join(', ') || '[]'));
    }
    return 0; // no conflicts
  }

  // Couldn't solve with all constraints.  Figure out how many constraints
  // we need to skip to achieve satisfiability, and later we will report
  // them as conflicts to the user.

  // First solve with no constraints necessarily active (as a sanity check
  // and as a starting point for optimization).
  sol = self.logic.solve();
  if (! sol) {
    // We should either still be satisfiable or have thrown an error.
    throw new Error("Unexpected unsatisfiability");
  }

  sol = self.logic.maximize(sol, allConstraintVars, 1);
  if (self.debugLog) {
    self.debugLog.push(getDebugLogForWeightedSum(
      sol, allConstraintVars, 1));
  }

  return allConstraintVars.length - sol.getWeightedSum(allConstraintVars, 1);
};

CS.Solver.prototype._throwUnknownPackages = function () {
  var self = this;

  if (! self._numUnknownPackagesNeeded) {
    return;
  }

  var solution = self._solution;
  var unknownPackages = _.keys(self._unknownPackages);
  var unknownPackagesNeeded = _.filter(unknownPackages, function (p) {
    return solution.evaluate(p);
  });
  _.each(unknownPackagesNeeded, function (p) {
    self.errors.push('unknown package: ' + p);
  });
  self.throwAnyErrors();
};

CS.Solver.prototype._throwConflicts = function () {
  var self = this;

  if (! self._numConflicts) {
    return;
  }

  var allConstraints = self._allConstraints;

  var solution = self._solution;

  _.each(allConstraints, function (c) {
    // c is a CS.Solver.Constraint
    if (! solution.evaluate(c.varName)) {
      // skipped this constraint
      var possibleVersions =
            self.input.catalogCache.getPackageVersions(c.toPackage);
      var chosenVersion = _.find(possibleVersions, function (v) {
        return solution.evaluate(pvVar(c.toPackage, v));
      });
      if (! chosenVersion) {
        // this can't happen, because for a constraint to be a problem,
        // we must have chosen some version of the package it applies to!
        throw new Error("Internal error: Version not found");
      }
      var error = (
        'conflict: constraint ' + (new PV.PackageConstraint(
          c.toPackage, c.vConstraint)) +
          ' is not satisfied by ' + c.toPackage + ' ' + chosenVersion + '.');

      error += '\nConstraints:';

      _.each(allConstraints, function (c2) {
        if (c2.toPackage === c.toPackage) {
          var paths;
          if (c2.fromVar) {
            paths = self._getAllPathsToPackageVersion(
              CS.PackageAndVersion.fromString(c2.fromVar));
          } else {
            paths = [['top level']];
          }
          _.each(paths, function (path) {
            error += '\n  ' + (new PV.PackageConstraint(
              c.toPackage, c2.vConstraint)) + ' <- ' + path.join(' <- ');
          });
        }
      });

      self.errors.push(error);
    }
  });

  // always throws, never returns
  self.throwAnyErrors();

  throw new Error("Internal error: conflicts could not be explained");
};

// Takes a PackageVersion and returns an array of arrays of PackageVersions.
// If the `packageVersion` is not selected in `self._solution`, returns
// an empty array.  Otherwise, returns an array of all paths from
// root dependencies to the package, in reverse order.  In other words,
// the first element of each path is `packageVersion`,
// and the last element is the selected version of a root dependency.
CS.Solver.prototype._getAllPathsToPackageVersion = function (packageAndVersion) {
  check(packageAndVersion, CS.PackageAndVersion);
  var self = this;
  var solution = self._solution;
  if (! solution.evaluate(packageAndVersion.toString())) {
    return [];
  } else if (self.input.isRootDependency(packageAndVersion.package)) {
    return [[packageAndVersion]];
  } else {
    var requirers = self._requirers[packageAndVersion.package];
    var paths = [];
    _.each(requirers, function (r) {
      if (solution.evaluate(r)) {
        var pv = CS.PackageAndVersion.fromString(r);
        _.each(self._getAllPathsToPackageVersion(pv), function (path) {
          paths.push([packageAndVersion].concat(path));
        });
      }
    });
    return paths;
  }
};

CS.Solver.CostFunction = function () {
  this.components = [];
  this.componentsByName = {};
};

CS.Solver.CostFunction.prototype.addComponent = function (name, terms, weights) {
  check(name, String);
  terms = terms || [];
  check(terms, [String]);
  weights = weights || [];
  check(weights, [Logic.WholeNumber]);
  var comp = {name: name,
              terms: terms,
              weights: weights};
  this.components.push(comp);
  this.componentsByName[name] = comp;
};

CS.Solver.CostFunction.prototype.addToComponent = function (
  compName, term, weight) {

  check(compName, String);
  check(term, String);
  check(weight, Logic.WholeNumber);
  if (! _.has(this.componentsByName, compName)) {
    throw new Error("No such cost function component: " + compName);
  }
  var comp = this.componentsByName[compName];
  comp.terms.push(term);
  comp.weights.push(weight);
};

CS.Solver.Constraint = function (varName, fromVar, toPackage, vConstraint) {
  this.varName = varName;
  this.fromVar = fromVar;
  this.toPackage = toPackage;
  this.vConstraint = vConstraint;

  check(this.varName, String);
  // this.fromVar is a return value of pvVar(p, v), or null for a
  // top-level constraint
  check(this.fromVar, Match.OneOf(String, null));
  check(this.toPackage, String); // package name
  check(this.vConstraint, CS.Input.VersionConstraintType);
};
