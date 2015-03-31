var CS = ConstraintSolver;
var PV = PackageVersion;

var pvVar = function (p, v) {
  return p + ' ' + v;
};

// The "inner solver".  You construct it with a ConstraintSolver.Input object
// (which specifies the problem) and then call .getAnswer() on it.

CS.Solver = function (input, options) {
  var self = this;
  check(input, CS.Input);

  self.input = input;
  self.errors = []; // [String]

  self.pricer = new CS.VersionPricer();
  self.getConstraintFormula = _.memoize(_getConstraintFormula,
                                         function (p, vConstraint) {
                                           return p + "@" + vConstraint.raw;
                                         });

  self.options = options || {};
  self.Profile = (self.options.Profile || CS.DummyProfile);

  self.steps = [];
  self.stepsByName = {};

  self.analysis = {};

  self.Profile.time("Solver#analyze", function () {
    self.analyze();
  });

  self.logic = null; // Logic.Solver, initialized later
};

CS.Solver.prototype.throwAnyErrors = function () {
  if (this.errors.length) {
    var multiline = _.any(this.errors, function (e) {
      return /\n/.test(e);
    });
    CS.throwConstraintSolverError(this.errors.join(
      multiline ? '\n\n' : '\n'));
  }
};

CS.Solver.prototype.getVersions = function (package) {
  var self = this;
  if (_.has(self.analysis.allowedVersions, package)) {
    return self.analysis.allowedVersions[package];
  } else {
    return self.input.catalogCache.getPackageVersions(package);
  }
};

// Populates `self.analysis` with various data structures derived from the
// input.  May also throw errors, and may call methods that rely on
// analysis once that particular analysis is done (e.g. `self.getVersions`
// which relies on `self.analysis.allowedVersions`.
CS.Solver.prototype.analyze = function () {
  var self = this;
  var analysis = self.analysis;
  var input = self.input;
  var cache = input.catalogCache;
  var Profile = self.Profile;

  ////////// ANALYZE ALLOWED VERSIONS
  // (An "allowed version" is one that isn't ruled out by a top-level
  // constraint.)

  // package -> array of version strings.  If a package has an entry in
  // this map, then only the versions in the array are allowed for
  // consideration.
  analysis.allowedVersions = {};
  analysis.packagesWithNoAllowedVersions = {}; // package -> [constraints]

  // Process top-level constraints, applying them right now by
  // limiting what package versions we even consider.  This speeds up
  // solving, especially given the equality constraints on core
  // packages.  For versions we don't allow, we get to avoid generating
  // Constraint objects for their constraints, which saves us both
  // clause generation time and solver work up through the point where we
  // determine there are no conflicts between constraints.
  //
  // we can't throw any errors yet, because `input.constraints`
  // doesn't establish any dependencies (so we don't know if it's a
  // problem that some package has no legal versions), but we can
  // track such packages in packagesWithNoAllowedVersions so that we
  // throw a good error later.
  Profile.time("analyze allowed versions", function () {
    _.each(_.groupBy(input.constraints, 'package'), function (cs, p) {
      var versions = cache.getPackageVersions(p);
      if (! versions.length) {
        // deal with wholly unknown packages later
        return;
      }
      _.each(cs, function (constr) {
        versions = _.filter(versions, function (v) {
          return CS.isConstraintSatisfied(p, constr.versionConstraint, v);
        });
      });
      if (! versions.length) {
        analysis.packagesWithNoAllowedVersions[p] = _.filter(cs, function (c) {
          return !! c.constraintString;
        });
      }
      analysis.allowedVersions[p] = versions;
    });
  });

  ////////// ANALYZE ROOT DEPENDENCIES

  // Collect root dependencies that we've never heard of.
  analysis.unknownRootDeps = [];
  // Collect "previous solution" versions of root dependencies.
  analysis.previousRootDepVersions = [];

  Profile.time("analyze root dependencies", function () {
    _.each(input.dependencies, function (p) {
      if (! input.isKnownPackage(p)) {
        analysis.unknownRootDeps.push(p);
      } else if (input.isInPreviousSolution(p) &&
                 ! input.isUpgrading(p)) {
        analysis.previousRootDepVersions.push(new CS.PackageAndVersion(
          p, input.previousSolution[p]));
      }
    });

    // throw if there are unknown packages in root deps
    if (analysis.unknownRootDeps.length) {
      _.each(analysis.unknownRootDeps, function (p) {
        self.errors.push('unknown package in top-level dependencies: ' + p);
      });
      self.throwAnyErrors();
    }
  });

  ////////// ANALYZE REACHABILITY

  // A "reachable" package is one that is either a root dependency or
  // a strong dependency of any "allowed" version of a reachable package.
  // In other words, we walk all strong dependencies starting
  // with the root dependencies, and visiting all allowed versions of each
  // package.
  //
  // This analysis is mainly done for performance, because if there are
  // extraneous packages in the CatalogCache (for whatever reason) we
  // want to spend as little time on them as possible.  It also establishes
  // the universe of possible "known" and "unknown" packages we might
  // come across.
  //
  // A more nuanced reachability analysis that takes versions into account
  // is probably possible.

  // package name -> true
  analysis.reachablePackages = {};
  // package name -> package versions asking for it (in pvVar form)
  analysis.unknownPackages = {};

  var markReachable = function (p) {
    analysis.reachablePackages[p] = true;

    _.each(self.getVersions(p), function (v) {
      _.each(cache.getDependencyMap(p, v), function (dep) {
        // `dep` is a CS.Dependency
        var p2 = dep.packageConstraint.package;
        if (! input.isKnownPackage(p2)) {
          // record this package so we will generate a variable
          // for it.  we'll try not to select it, and ultimately
          // throw an error if we are forced to.
          if (! _.has(analysis.unknownPackages, p2)) {
            analysis.unknownPackages[p2] = [];
          }
          analysis.unknownPackages[p2].push(pvVar(p, v));
        } else {
          if (! dep.isWeak) {
            if (! _.has(analysis.reachablePackages, p2)) {
              markReachable(p2);
            }
          }
        }
      });
    });
  };

  Profile.time("analyze reachability", function () {
    _.each(input.dependencies, markReachable);
  });

  ////////// ANALYZE CONSTRAINTS

  // Array of CS.Solver.Constraint
  analysis.constraints = [];
  // packages `foo` such that there's a simple top-level equality
  // constraint about `foo`.  package name -> true.
  analysis.topLevelEqualityConstrainedPackages = {};

  Profile.time("analyze constraints", function () {
    // top-level constraints
    _.each(input.constraints, function (c) {
      if (c.constraintString) {
        analysis.constraints.push(new CS.Solver.Constraint(
          null, c.package, c.versionConstraint,
          "constraint#" + analysis.constraints.length));

        if (c.versionConstraint.alternatives.length === 1 &&
            c.versionConstraint.alternatives[0].type === 'exactly') {
          analysis.topLevelEqualityConstrainedPackages[c.package] = true;
        }
      }
    });

    // constraints specified in package dependencies
    _.each(_.keys(analysis.reachablePackages), function (p) {
      _.each(self.getVersions(p), function (v) {
        var pv = pvVar(p, v);
        _.each(cache.getDependencyMap(p, v), function (dep) {
          // `dep` is a CS.Dependency
          var p2 = dep.packageConstraint.package;
          if (input.isKnownPackage(p2) &&
              dep.packageConstraint.constraintString) {
            analysis.constraints.push(new CS.Solver.Constraint(
              pv, p2, dep.packageConstraint.versionConstraint,
              "constraint#" + analysis.constraints.length));
          }
        });
      });
    });
  });

  ////////// ANALYZE PRE-RELEASES

  Profile.time("analyze pre-releases", function () {
    var unanticipatedPrereleases = [];
    _.each(_.keys(analysis.reachablePackages), function (p) {
      var anticipatedPrereleases = input.anticipatedPrereleases[p];
      _.each(self.getVersions(p), function (v) {
        if (/-/.test(v) && ! (anticipatedPrereleases &&
                              _.has(anticipatedPrereleases, v))) {
          unanticipatedPrereleases.push(pvVar(p, v));
        }
      });
    });
    analysis.unanticipatedPrereleases = unanticipatedPrereleases;
  });
};

// A Step consists of a name, an array of terms, and an array of weights.
// Steps are optimized one by one.  Optimizing a Step means to find
// the minimum whole number value for the weighted sum of the terms,
// and then to enforce in the solver that the weighted sum be that number.
// Thus, when the Steps are optimized in sequence, earlier Steps take
// precedence and will stay minimized while later Steps are optimized.
//
// A term can be a package name, a package version, or any other variable
// name or Logic formula.
//
// A weight is a non-negative integer.  The weights array can be a single
// weight (which is used for all terms).
//
// The terms and weights arguments each default to [].  You can add terms
// with weights using addTerm.
//
// options is optional.
CS.Solver.Step = function (name, terms, weights) {
  check(name, String);
  terms = terms || [];
  check(terms, [String]);
  weights = (weights == null ? [] : weights);
  check(weights, Match.OneOf([Logic.WholeNumber], Logic.WholeNumber));

  this.name = name;

  // mutable:
  this.terms = terms;
  this.weights = weights;
  this.optimum = null; // set when optimized
};

// If weights is a single number, you can omit the weight argument.
// Adds a term.  If weight is 0, addTerm may skip it.
CS.Solver.Step.prototype.addTerm = function (term, weight) {
  if (weight == null) {
    if (typeof this.weights !== 'number') {
      throw new Error("Must specify a weight");
    }
    weight = this.weights;
  }
  check(weight, Logic.WholeNumber);
  if (weight !== 0) {
    this.terms.push(term);
    if (typeof this.weights === 'number') {
      if (weight !== this.weights) {
        throw new Error("Can't specify a different weight now: " +
                        weight + " != " + this.weights);
      }
    } else {
      this.weights.push(weight);
    }
  }
};

var DEBUG = false;

// Call as one of:
// * minimize(step, options)
// * minimize([step1, step2, ...], options)
// * minimize(stepName, costTerms, costWeights, options)
CS.Solver.prototype.minimize = function (step, options) {
  var self = this;

  if (_.isArray(step)) {
    // minimize([steps...], options)
    _.each(step, function (st) {
      self.minimize(st, options);
    });
    return;
  }

  if (typeof step === 'string') {
    // minimize(stepName, costTerms, costWeights, options)
    var stepName_ = arguments[0];
    var costTerms_ = arguments[1];
    var costWeights_ = arguments[2];
    var options_ = arguments[3];
    if (costWeights_ && typeof costWeights_ === 'object' &&
        ! _.isArray(costWeights_)) {
      options_ = costWeights_;
      costWeights_ = null;
    }
    var theStep = new CS.Solver.Step(
      stepName_, costTerms_, (costWeights_ == null ? 1 : costWeights_));
    self.minimize(theStep, options_);
    return;
  }

  // minimize(step, options);

  self.Profile.time("minimize " + step.name, function () {

    var logic = self.logic;

    self.steps.push(step);
    self.stepsByName[step.name] = step;

    if (DEBUG) {
      console.log("--- MINIMIZING " + step.name);
    }

    var costWeights = step.weights;
    var costTerms = step.terms;

    self.setSolution(logic.minimize(
      self.solution, costTerms, costWeights, {
        progress: function (status, cost) {
          if (self.options.nudge) {
            self.options.nudge();
          }
          if (DEBUG) {
            if (status === 'improving') {
              console.log(cost + " ... trying to improve ...");
            }
          }
        },
        strategy: (options && options.strategy)
      }));

    step.optimum = self.solution.getWeightedSum(costTerms, costWeights);
    if (DEBUG) {
      console.log(step.optimum + " is optimal");

      if (step.optimum) {
        _.each(costTerms, function (t, i) {
          var w = (typeof costWeights === 'number' ? costWeights :
                   costWeights[i]);
          if (w && self.solution.evaluate(t)) {
            console.log("    " + w + ": " + t);
          }
        });
      }
    }
  });
};

// Determine the non-zero contributions to the cost function in `step`
// based on the current solution, returning a map from term (usually
// the name of a package or package version) to positive integer cost.
CS.Solver.prototype.getStepContributions = function (step) {
  var self = this;
  var solution = self.solution;
  var contributions = {};
  var weights = step.weights;
  _.each(step.terms, function (t, i) {
    var w = (typeof weights === 'number' ? weights : weights[i]);
    if (w && self.solution.evaluate(t)) {
      contributions[t] = w;
    }
  });
  return contributions;
};

var addCostsToSteps = function (package, versions, costs, steps) {
  var pvs = _.map(versions, function (v) {
    return pvVar(package, v);
  });
  for (var j = 0; j < steps.length; j++) {
    var step = steps[j];
    var costList = costs[j];
    if (costList.length !== versions.length) {
      throw new Error("Assertion failure: Bad lengths in addCostsToSteps");
    }
    for (var i = 0; i < versions.length; i++) {
      step.addTerm(pvs[i], costList[i]);
    }
  }
};

// Get an array of "Steps" that, when minimized in order, optimizes
// the package version costs of `packages` (an array of String package
// names) according to `pricerMode`, which may be
// `CS.VersionPricer.MODE_UPDATE` or a similar mode constant.
// Wraps `VersionPricer#priceVersions`, which is tasked with calculating
// the cost of every version of every package.  This function iterates
// over `packages` and puts the result into `Step` objects.
CS.Solver.prototype.getVersionCostSteps = function (stepBaseName, packages,
                                                    pricerMode) {
  var self = this;
  var major = new CS.Solver.Step(stepBaseName + '_major');
  var minor = new CS.Solver.Step(stepBaseName + '_minor');
  var patch = new CS.Solver.Step(stepBaseName + '_patch');
  var rest = new CS.Solver.Step(stepBaseName + '_rest');

  self.Profile.time(
    "calculate " + stepBaseName + " version costs",
    function () {
      _.each(packages, function (p) {
        var versions = self.getVersions(p);
        var costs = self.pricer.priceVersions(versions, pricerMode);
        addCostsToSteps(p, versions, costs, [major, minor, patch, rest]);
      });
    });

  return [major, minor, patch, rest];
};

// Like `getVersionCostSteps`, but wraps
// `VersionPricer#priceVersionsWithPrevious` instead of `#priceVersions`.
// The cost function is "distance" from the previous versions passed in
// as `packageAndVersion`.  (Actually it's a complicated function of the
// previous and new version.)
CS.Solver.prototype.getVersionDistanceSteps = function (stepBaseName,
                                                        packageAndVersions,
                                                        takePatches) {
  var self = this;

  var incompat = new CS.Solver.Step(stepBaseName + '_incompat');
  var major = new CS.Solver.Step(stepBaseName + '_major');
  var minor = new CS.Solver.Step(stepBaseName + '_minor');
  var patch = new CS.Solver.Step(stepBaseName + '_patch');
  var rest = new CS.Solver.Step(stepBaseName + '_rest');

  self.Profile.time(
    "calculate " + stepBaseName + " distance costs",
    function () {
      _.each(packageAndVersions, function (pvArg) {
        var package = pvArg.package;
        var previousVersion = pvArg.version;
        var versions = self.getVersions(package);
        var costs = self.pricer.priceVersionsWithPrevious(
          versions, previousVersion, takePatches);
        addCostsToSteps(package, versions, costs,
                        [incompat, major, minor, patch, rest]);
      });
    });

  return [incompat, major, minor, patch, rest];
};

CS.Solver.prototype.currentVersionMap = function () {
  var self = this;
  var pvs = [];
  _.each(self.solution.getTrueVars(), function (x) {
    if (x.indexOf(' ') >= 0) {
      // all variables with spaces in them are PackageAndVersions
      var pv = CS.PackageAndVersion.fromString(x);
      pvs.push(pv);
    }
  });

  var versionMap = {};
  _.each(pvs, function (pv) {
    if (_.has(versionMap, pv.package)) {
      throw new Error("Assertion failure: Selected two versions of " +
                      pv.package + ", " +versionMap[pv.package] +
                      " and " + pv.version);
    }
    versionMap[pv.package] = pv.version;
  });

  return versionMap;
};

// Called to re-assign `self.solution` after a call to `self.logic.solve()`,
// `solveAssuming`, or `minimize`.
CS.Solver.prototype.setSolution = function (solution) {
  var self = this;
  self.solution = solution;
  if (! self.solution) {
    throw new Error("Unexpected unsatisfiability");
  }
  self.solution.ignoreUnknownVariables = true;
};

CS.Solver.prototype.getAnswer = function (options) {
  var self = this;
  return self.Profile.time("Solver#getAnswer", function () {
    return self._getAnswer(options);
  });
};

CS.Solver.prototype._getAnswer = function (options) {
  var self = this;
  var input = self.input;
  var analysis = self.analysis;
  var cache = input.catalogCache;
  var allAnswers = (options && options.allAnswers); // for tests
  var Profile = self.Profile;

  var logic;
  Profile.time("new Logic.Solver (MiniSat start-up)", function () {
    logic = self.logic = new Logic.Solver();
  });

  // require root dependencies
  Profile.time("require root dependencies", function () {
    _.each(input.dependencies, function (p) {
      logic.require(p);
    });
  });

  // generate package version variables for known, reachable packages
  Profile.time("generate package variables", function () {
    _.each(_.keys(analysis.reachablePackages), function (p) {
      if (! _.has(analysis.packagesWithNoAllowedVersions, p)) {
        var versionVars = _.map(self.getVersions(p),
                                function (v) {
                                  return pvVar(p, v);
                                });
        // At most one of ["foo 1.0.0", "foo 1.0.1", ...] is true.
        logic.require(Logic.atMostOne(versionVars));
        // The variable "foo" is true if and only if at least one of the
        // variables ["foo 1.0.0", "foo 1.0.1", ...] is true.
        logic.require(Logic.equiv(p, Logic.or(versionVars)));
      }
    });
  });

  // generate strong dependency requirements
  Profile.time("generate dependency requirements", function () {
    _.each(_.keys(analysis.reachablePackages), function (p) {
      _.each(self.getVersions(p), function (v) {
        _.each(cache.getDependencyMap(p, v), function (dep) {
          // `dep` is a CS.Dependency
          if (! dep.isWeak) {
            var p2 = dep.packageConstraint.package;
            logic.require(Logic.implies(pvVar(p, v), p2));
          }
        });
      });
    });
  });

  // generate constraints -- but technically don't enforce them, because
  // we haven't forced the conflictVars to be false
  Profile.time("generate constraints", function () {
    _.each(analysis.constraints, function (c) {
      // We logically require that EITHER a constraint is marked as a
      // conflict OR it comes from a package version that is not selected
      // OR its constraint formula must be true.
      // (The constraint formula says that if toPackage is selected,
      // then a version of it that satisfies our constraint must be true.)
      logic.require(
        Logic.or(c.conflictVar,
                 c.fromVar ? Logic.not(c.fromVar) : [],
                 self.getConstraintFormula(c.toPackage, c.vConstraint)));
    });
  });

  // Establish the invariant of self.solution being a valid solution.
  // From now on, if we add some new logical requirement to the solver
  // that isn't necessarily true of `self.solution`, we must
  // recalculate `self.solution` and pass the new value to
  // self.setSolution.  It is our job to obtain the new solution in a
  // way that ensures the solution exists and doesn't put the solver
  // in an unsatisfiable state.  There are several ways to do this:
  //
  // * Calling `logic.solve()` and immediately throwing a fatal error
  //   if there's no solution (not calling `setSolution` at all)
  // * Calling `logic.solve()` in a situation where we know we have
  //   not made the problem unsatisfiable
  // * Calling `logic.solveAssuming(...)` and checking the result, only
  //   using the solution if it exists
  // * Calling `minimize()`, which always maintains satisfiability

  Profile.time("pre-solve", function () {
    self.setSolution(logic.solve());
  });
  // There is always a solution at this point, namely,
  // select all packages (including unknown packages), select
  // any version of each known package (excluding packages with
  // "no allowed versions"), and set all conflictVars
  // to true.

  // Forbid packages with no versions allowed by top-level constraints,
  // which we didn't do earlier because we needed to establish an
  // initial solution before asking the solver if it's possible to
  // not use these packages.
  Profile.time("forbid packages with no matching versions", function () {
    _.each(analysis.packagesWithNoAllowedVersions, function (constrs, p) {
      var newSolution = logic.solveAssuming(Logic.not(p));
      if (newSolution) {
        self.setSolution(newSolution);
        logic.forbid(p);
      } else {
        self.errors.push(
          'No version of ' + p + ' satisfies all constraints: ' +
            _.map(constrs, function (constr) {
              return '@' + constr.constraintString;
            }).join(', '));
      }
    });
    self.throwAnyErrors();
  });

  // try not to use any unknown packages.  If the minimum is greater
  // than 0, we'll throw an error later, after we apply the constraints
  // and the cost function, so that we can explain the problem to the
  // user in a convincing way.
  self.minimize('unknown_packages', _.keys(analysis.unknownPackages));

  // try not to set the conflictVar on any constraint.  If the minimum
  // is greater than 0, we'll throw an error later, after we've run the
  // cost function, so we can show a better error.
  // If there are conflicts, this minimization can be time-consuming
  // (several seconds or more).  The strategy 'bottom-up' helps by
  // looking for solutions with few conflicts first.
  self.minimize('conflicts', _.pluck(analysis.constraints, 'conflictVar'),
                { strategy: 'bottom-up' });

  // Try not to use "unanticipated" prerelease versions
  self.minimize('unanticipated_prereleases',
                analysis.unanticipatedPrereleases);

  var previousRootSteps = self.getVersionDistanceSteps(
    'previous_root', analysis.previousRootDepVersions);
  // the "previous_root_incompat" step
  var previousRootIncompat = previousRootSteps[0];
  // the "previous_root_major", "previous_root_minor", etc. steps
  var previousRootVersionParts = previousRootSteps.slice(1);

  var toUpdate = _.filter(input.upgrade, function (p) {
    return analysis.reachablePackages[p] === true;
  });

  if (! input.allowIncompatibleUpdate) {
    // make sure packages that are being updated can still count as
    // a previous_root for the purposes of previous_root_incompat
    Profile.time("add terms to previous_root_incompat", function () {
      _.each(toUpdate, function (p) {
        if (input.isRootDependency(p) && input.isInPreviousSolution(p)) {
          var parts = self.pricer.partitionVersions(
            self.getVersions(p), input.previousSolution[p]);
          _.each(parts.older.concat(parts.higherMajor), function (v) {
            previousRootIncompat.addTerm(pvVar(p, v), 1);
          });
        }
      });
    });

    // Enforce that we don't make breaking changes to your root dependencies,
    // unless you pass --allow-incompatible-update.  It will actually be enforced
    // farther down, but for now, we want to apply this constraint before handling
    // updates.
    self.minimize(previousRootIncompat);
  }

  self.minimize(self.getVersionCostSteps(
    'update', toUpdate, CS.VersionPricer.MODE_UPDATE));

  if (input.allowIncompatibleUpdate) {
    // If you pass `--allow-incompatible-update`, we will still try to minimize
    // version changes to root deps that break compatibility, but with a lower
    // priority than taking as-new-as-possible versions for `meteor update`.
    self.minimize(previousRootIncompat);
  }

  self.minimize(previousRootVersionParts);

  var otherPrevious = _.filter(_.map(input.previousSolution, function (v, p) {
    return new CS.PackageAndVersion(p, v);
  }), function (pv) {
    var p = pv.package;
    return analysis.reachablePackages[p] === true &&
      ! input.isRootDependency(p);
  });

  self.minimize(self.getVersionDistanceSteps(
    'previous_indirect', otherPrevious,
    input.upgradeIndirectDepPatchVersions));

  var newRootDeps = _.filter(input.dependencies, function (p) {
    return ! input.isInPreviousSolution(p);
  });

  self.minimize(self.getVersionCostSteps(
    'new_root', newRootDeps, CS.VersionPricer.MODE_UPDATE));

  // Lock down versions of all root, previous, and updating packages that
  // are currently selected.  The reason to do this is to save the solver
  // a bunch of work (i.e. improve performance) by not asking it to
  // optimize the "unimportant" packages while also twiddling the versions
  // of the "important" packages, which would just multiply the search space.
  //
  // The important packages are root deps, packages in the previous solution,
  // and packages being upgraded.  At this point, we either have unique
  // versions for them, or else there is some kind of trade-off, like a
  // situation where raising the version of one package and lowering the
  // version of another produces the same cost -- a tie between two solutions.
  // If we have a tie, it probably won't be broken by the unimportant
  // packages, so we'll end up going with whatever we picked anyway.  (Note
  // that we have already taken the unimportant packages into account in that
  // we are only considering solutions where SOME versions can be chosen for
  // them.)  Even if optimizing the unimportant packages (coming up next)
  // was able to break a tie in the important packages, we care so little
  // about the versions of the unimportant packages that it's a very weak
  // signal.  In other words, the user might be better off with some tie-breaker
  // that looks only at the important packages anyway.
  Profile.time("lock down important versions", function () {
    _.each(self.currentVersionMap(), function (v, package) {
      if (input.isRootDependency(package) ||
          input.isInPreviousSolution(package) ||
          input.isUpgrading(package)) {
        logic.require(Logic.implies(package, pvVar(package, v)));
      }
    });
  });

  // new, indirect packages are the lowest priority
  var otherPackages = [];
  _.each(_.keys(analysis.reachablePackages), function (p) {
    if (! (input.isRootDependency(p) ||
           input.isInPreviousSolution(p) ||
           input.isUpgrading(p))) {
      otherPackages.push(p);
    }
  });

  self.minimize(self.getVersionCostSteps(
    'new_indirect', otherPackages,
    CS.VersionPricer.MODE_GRAVITY_WITH_PATCHES));

  self.minimize('total_packages', _.keys(analysis.reachablePackages));

  // throw errors about unknown packages
  if (self.stepsByName['unknown_packages'].optimum > 0) {
    Profile.time("generate error for unknown packages", function () {
      var unknownPackages = _.keys(analysis.unknownPackages);
      var unknownPackagesNeeded = _.filter(unknownPackages, function (p) {
        return self.solution.evaluate(p);
      });
      _.each(unknownPackagesNeeded, function (p) {
        var requirers = _.filter(analysis.unknownPackages[p], function (pv) {
          return self.solution.evaluate(pv);
        });
        var errorStr = 'unknown package: ' + p;
        _.each(requirers, function (pv) {
          errorStr += '\nRequired by: ' + pv;
        });
        self.errors.push(errorStr);
      });
    });
    self.throwAnyErrors();
  }

  // throw errors about conflicts
  if (self.stepsByName['conflicts'].optimum > 0) {
    self.throwConflicts();
  }

  if ((! input.allowIncompatibleUpdate) &&
      self.stepsByName['previous_root_incompat'].optimum > 0) {
    // we have some "incompatible root changes", where we needed to change a
    // version of a root dependency to a new version incompatible with the
    // original, but --allow-incompatible-update hasn't been passed in.
    // these are in the form of PackageAndVersion strings that we need.
    var incompatRootChanges = _.keys(self.getStepContributions(
      self.stepsByName['previous_root_incompat']));

    Profile.time("generate errors for incompatible root change", function () {
      var numActualErrors = 0;
      _.each(incompatRootChanges, function (pvStr) {
        var pv = CS.PackageAndVersion.fromString(pvStr);
        // exclude packages with top-level equality constraints (added by user
        // or by the tool pinning a version)
        if (! _.has(analysis.topLevelEqualityConstrainedPackages, pv.package)) {
          var prevVersion = input.previousSolution[pv.package];
          self.errors.push(
            'Potentially incompatible change required to ' +
              'top-level dependency: ' +
              pvStr + ', was ' + prevVersion + '.\n' +
              self.listConstraintsOnPackage(pv.package));
          numActualErrors++;
        }
      });
      if (numActualErrors) {
        self.errors.push(
          'To allow potentially incompatible changes to top-level ' +
            'dependencies, you must pass --allow-incompatible-update ' +
            'on the command line.');
      }
    });
    self.throwAnyErrors();
  }

  var result = {
    neededToUseUnanticipatedPrereleases: (
      self.stepsByName['unanticipated_prereleases'].optimum > 0),
    answer: Profile.time("generate version map", function () {
      return self.currentVersionMap();
    })
  };

  if (allAnswers) {
    Profile.time("generate all answers", function () {
      var allAnswersList = [result.answer];
      var nextAnswer = function () {
        var formula = self.solution.getFormula();
        var newSolution = logic.solveAssuming(Logic.not(formula));
        if (newSolution) {
          self.setSolution(newSolution);
          logic.forbid(formula);
        }
        return newSolution;
      };
      while (nextAnswer()) {
        allAnswersList.push(self.currentVersionMap());
      }
      result.allAnswers = allAnswersList;
    });
  };

  return result;
};

// Get a list of package-version variables that satisfy a given constraint.
var getOkVersions = function (toPackage, vConstraint, targetVersions) {
  return _.compact(_.map(targetVersions, function (v) {
    if (CS.isConstraintSatisfied(toPackage, vConstraint, v)) {
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

  var targetVersions = self.getVersions(toPackage);
  var okVersions = getOkVersions(toPackage, vConstraint, targetVersions);

  if (okVersions.length === targetVersions.length) {
    return Logic.TRUE;
  } else {
    return Logic.or(Logic.not(toPackage), okVersions);
  }
};

CS.Solver.prototype.listConstraintsOnPackage = function (package) {
  var self = this;
  var constraints = self.analysis.constraints;

  var result = 'Constraints on package "' + package + '":';

  _.each(constraints, function (c) {
    if (c.toPackage === package) {
      var paths;
      if (c.fromVar) {
        paths = self.getPathsToPackageVersion(
          CS.PackageAndVersion.fromString(c.fromVar));
      } else {
        paths = [['top level']];
      }
      _.each(paths, function (path) {
        result += '\n* ' + (new PV.PackageConstraint(
          package, c.vConstraint.raw)) + ' <- ' + path.join(' <- ');
      });
    }
  });

  return result;
};

CS.Solver.prototype.throwConflicts = function () {
  var self = this;

  var solution = self.solution;
  var constraints = self.analysis.constraints;

  self.Profile.time("generate error about conflicts", function () {
    _.each(constraints, function (c) {
      // c is a CS.Solver.Constraint
      if (solution.evaluate(c.conflictVar)) {
        // skipped this constraint
        var possibleVersions = self.getVersions(c.toPackage);
        var chosenVersion = _.find(possibleVersions, function (v) {
          return solution.evaluate(pvVar(c.toPackage, v));
        });
        if (! chosenVersion) {
          // this can't happen, because for a constraint to be a problem,
          // we must have chosen some version of the package it applies to!
          throw new Error("Internal error: Version not found");
        }
        var error = (
          'Conflict: Constraint ' + (new PV.PackageConstraint(
            c.toPackage, c.vConstraint)) +
            ' is not satisfied by ' + c.toPackage + ' ' + chosenVersion + '.');

        error += '\n' + self.listConstraintsOnPackage(c.toPackage);

        self.errors.push(error);
      }
    });
  });

  // always throws, never returns
  self.throwAnyErrors();

  throw new Error("Internal error: conflicts could not be explained");
};

// Takes a PackageVersion and returns an array of arrays of PackageVersions.
// If the `packageVersion` is not selected in `self.solution`, returns
// an empty array.  Otherwise, returns an array of all paths from
// root dependencies to the package, in reverse order.  In other words,
// the first element of each path is `packageVersion`,
// and the last element is the selected version of a root dependency.
//
// Ok, it isn't all paths.  Because that would be crazy (combinatorial
// explosion).  It stops at root dependencies and tries to filter out
// ones that are definitely longer than another.
CS.Solver.prototype.getPathsToPackageVersion = function (packageAndVersion) {
  check(packageAndVersion, CS.PackageAndVersion);
  var self = this;
  var input = self.input;
  var cache = input.catalogCache;
  var solution = self.solution;

  var versionMap = self.currentVersionMap();
  var hasDep = function (p1, p2) {
    // Include weak dependencies, because their constraints matter.
    return _.has(cache.getDependencyMap(p1, versionMap[p1]), p2);
  };
  var allPackages = _.keys(versionMap);

  var getPaths = function (pv, _ignorePackageSet) {
    if (! solution.evaluate(pv.toString())) {
      return [];
    }
    var package = pv.package;

    if (input.isRootDependency(package)) {
      return [[pv]];
    }

    var newIgnorePackageSet = _.clone(_ignorePackageSet);
    newIgnorePackageSet[package] = true;

    var paths = [];
    var shortestLength = null;

    _.each(allPackages, function (p) {
      if ((! _.has(newIgnorePackageSet, p)) &&
          solution.evaluate(p) &&
          hasDep(p, package)) {
        var newPV = new CS.PackageAndVersion(p, versionMap[p]);
        _.each(getPaths(newPV, newIgnorePackageSet), function (path) {
          var newPath = [pv].concat(path);
          if ((! paths.length) || newPath.length < shortestLength) {
            paths.push(newPath);
            shortestLength = newPath.length;
          }
        });
      }
    });

    return paths;
  };

  return getPaths(packageAndVersion, {});
};


CS.Solver.Constraint = function (fromVar, toPackage, vConstraint, conflictVar) {
  this.fromVar = fromVar;
  this.toPackage = toPackage;
  this.vConstraint = vConstraint;
  this.conflictVar = conflictVar;

  // this.fromVar is a return value of pvVar(p, v), or null for a
  // top-level constraint
  check(this.fromVar, Match.OneOf(String, null));
  check(this.toPackage, String); // package name
  check(this.vConstraint, PV.VersionConstraint);
  check(this.conflictVar, String);
};
