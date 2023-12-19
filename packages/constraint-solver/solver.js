const has = Npm.require('lodash.has');
const zip = Npm.require('lodash.zip');
const memoize = Npm.require('lodash.memoize');
const groupBy = Npm.require('lodash.groupby');

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
  self.getConstraintFormula = memoize(_getConstraintFormula,
    function (p, vConstraint) {
      return p + "@" + vConstraint.raw;
    });

  self.options = options || {};
  self.Profile = (self.options.Profile || CS.DummyProfile);

  self.steps = [];
  self.stepsByName = {};

  self.analysis = {};
};

CS.Solver.prototype.init = async function() {
  const self = this;
  await self.Profile.time("Solver#analyze", function () {
    return self.analyze();
  });

  self.logic = null; // Logic.Solver, initialized later
};

CS.Solver.prototype.throwAnyErrors = function () {
  if (this.errors.length) {
    var multiline = this.errors.some(function (e) {
      return /\n/.test(e);
    });
    CS.throwConstraintSolverError(this.errors.join(
      multiline ? '\n\n' : '\n'));
  }
};

CS.Solver.prototype.getVersions = function (pkg) {
  var self = this;
  if (has(self.analysis.allowedVersions, pkg)) {
    return self.analysis.allowedVersions[pkg];
  } else {
    return self.input.catalogCache.getPackageVersions(pkg);
  }
};

// Populates `self.analysis` with various data structures derived from the
// input.  May also throw errors, and may call methods that rely on
// analysis once that particular analysis is done (e.g. `self.getVersions`
// which relies on `self.analysis.allowedVersions`.
// TODO -> Check await Profile.time
CS.Solver.prototype.analyze = async function () {
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
  await Profile.time("analyze allowed versions", function () {
    Object.entries(groupBy(input.constraints, 'package')).forEach(function ([p, cs]) {
      var versions = cache.getPackageVersions(p);
      if (!versions.length) {
        // deal with wholly unknown packages later
        return;
      }
      cs.forEach(function (constr) {
        versions = versions.filter(function (v) {
          return CS.isConstraintSatisfied(p, constr.versionConstraint, v);
        });
      });
      if (!versions.length) {
        analysis.packagesWithNoAllowedVersions[p] = cs.filter(function (c) {
          return !!c.constraintString;
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

  await Profile.time("analyze root dependencies", function () {
    input.dependencies.forEach(function (p) {
      if (!input.isKnownPackage(p)) {
        analysis.unknownRootDeps.push(p);
      } else if (input.isInPreviousSolution(p) &&
        !input.isUpgrading(p)) {
        analysis.previousRootDepVersions.push(new CS.PackageAndVersion(
          p, input.previousSolution[p]));
      }
    });

    // throw if there are unknown packages in root deps
    if (analysis.unknownRootDeps.length) {
      analysis.unknownRootDeps.forEach(function (p) {
        if (CS.isIsobuildFeaturePackage(p)) {
          self.errors.push(
            'unsupported Isobuild feature "' + p +
            '" in top-level dependencies; see ' +
            'https://docs.meteor.com/api/packagejs.html#isobuild-features ' +
            'for a list of features and the minimum Meteor release required'
          );
        } else {
          self.errors.push('unknown package in top-level dependencies: ' + p);
        }
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

    self.getVersions(p).forEach(function (v) {
      Object.values(cache.getDependencyMap(p, v)).forEach(function (dep) {
        // `dep` is a CS.Dependency
        var p2 = dep.packageConstraint.package;
        if (!input.isKnownPackage(p2)) {
          // record this package so we will generate a variable
          // for it.  we'll try not to select it, and ultimately
          // throw an error if we are forced to.
          if (!has(analysis.unknownPackages, p2)) {
            analysis.unknownPackages[p2] = [];
          }
          analysis.unknownPackages[p2].push(pvVar(p, v));
        } else {
          if (!dep.isWeak) {
            if (!has(analysis.reachablePackages, p2)) {
              markReachable(p2);
            }
          }
        }
      });
    });
  };

  await Profile.time("analyze reachability", function () {
    input.dependencies.forEach(markReachable);
  });

  ////////// ANALYZE CONSTRAINTS

  // Array of CS.Solver.Constraint
  analysis.constraints = [];
  // packages `foo` such that there's a simple top-level equality
  // constraint about `foo`.  package name -> true.
  analysis.topLevelEqualityConstrainedPackages = {};

  await Profile.time("analyze constraints", function () {
    // Find package names with @x.y.z! overrides. We consider only
    // top-level constraints here, which includes (1) .meteor/packages,
    // (2) local package versions, and (3) Meteor release constraints.
    // Since (2) and (3) are generated programmatically without any
    // override syntax (in tools/project-context.js), the .meteor/packages
    // file is effectively the only place where override syntax has any
    // impact. This limitation is deliberate, since overriding package
    // version constraints is a power-tool that should be used sparingly
    // by application developers, and never abused by package authors.
    var overrides = new Set;
    input.constraints.forEach(function (c) {
      if (c.constraintString &&
        c.versionConstraint.override) {
        overrides.add(c.package);
      }
    });

    // Return c.versionConstraint unless it is overridden, in which case
    // make a copy of it and set vConstraint.weakMinimum = true.
    function getVersionConstraint(c) {
      var vConstraint = c.versionConstraint;

      // The meteor-tool version can never be weakened/overridden.
      if (c.package === "meteor-tool") {
        return vConstraint;
      }

      // Overrides cannot be weakened, so in theory they could conflict
      // with each other, though that's unlikely to be a problem within a
      // single .meteor/packages file.
      if (vConstraint.override) {
        return vConstraint;
      }

      if (overrides.has(c.package)) {
        // Make a defensive shallow copy of vConstraint with the same
        // prototype (that is, PV.VersionConstraint.prototype).
        vConstraint = Object.create(
          Object.getPrototypeOf(vConstraint),
          Object.getOwnPropertyDescriptors(vConstraint)
        );

        // This weakens the constraint so that it matches any version not
        // less than the constraint, regardless of whether the major or
        // minor versions are the same. See CS.isConstraintSatisfied in
        // constraint-solver.js for the implementation of this behavior.
        vConstraint.weakMinimum = true;
      }

      return vConstraint;
    }

    // top-level constraints
    input.constraints.forEach(function (c) {
      if (c.constraintString) {
        analysis.constraints.push(new CS.Solver.Constraint(
          null, c.package, getVersionConstraint(c),
          "constraint#" + analysis.constraints.length));

        if (c.versionConstraint.alternatives.length === 1 &&
          c.versionConstraint.alternatives[0].type === 'exactly') {
          analysis.topLevelEqualityConstrainedPackages[c.package] = true;
        }
      }
    });

    // constraints specified in package dependencies
    Object.keys(analysis.reachablePackages).forEach(function (p) {
      self.getVersions(p).forEach(function (v) {
        var pv = pvVar(p, v);
        Object.values(cache.getDependencyMap(p, v)).forEach(function (dep) {
          // `dep` is a CS.Dependency
          var p2 = dep.packageConstraint.package;
          if (input.isKnownPackage(p2) &&
            dep.packageConstraint.constraintString) {
            analysis.constraints.push(new CS.Solver.Constraint(
              pv, p2, getVersionConstraint(dep.packageConstraint),
              "constraint#" + analysis.constraints.length));
          }
        });
      });
    });
  });

  ////////// ANALYZE PRE-RELEASES

  await Profile.time("analyze pre-releases", function () {
    var unanticipatedPrereleases = [];
    Object.keys(analysis.reachablePackages).forEach(function (p) {
      var anticipatedPrereleases = input.anticipatedPrereleases[p];
      self.getVersions(p).forEach(function (v) {
        if (/-/.test(v) && !(anticipatedPrereleases &&
          has(anticipatedPrereleases, v))) {
          unanticipatedPrereleases.push(pvVar(p, v));
        }
      });
    });
    analysis.unanticipatedPrereleases = unanticipatedPrereleases;
  });
};

var WholeNumber = Match.Where(Logic.isWholeNumber);

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
  check(weights, Match.OneOf([WholeNumber], WholeNumber));

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
  check(weight, WholeNumber);
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
CS.Solver.prototype.minimize = async function (step, options) {
  var self = this;

  if (Array.isArray(step)) {
    // minimize([steps...], options)
    for (const st of step) {
      await self.minimize(st, options)
    }
    return;
  }

  if (typeof step === 'string') {
    // minimize(stepName, costTerms, costWeights, options)
    var stepName_ = arguments[0];
    var costTerms_ = arguments[1];
    var costWeights_ = arguments[2];
    var options_ = arguments[3];
    if (costWeights_ && typeof costWeights_ === 'object' &&
      !Array.isArray(costWeights_)) {
      options_ = costWeights_;
      costWeights_ = null;
    }
    var theStep = new CS.Solver.Step(
      stepName_, costTerms_, (costWeights_ == null ? 1 : costWeights_));
    await self.minimize(theStep, options_);
    return;
  }

  // minimize(step, options);

  await self.Profile.time("minimize " + step.name, async function () {

    var logic = self.logic;

    self.steps.push(step);
    self.stepsByName[step.name] = step;

    if (DEBUG) {
      console.log("--- MINIMIZING " + step.name);
    }

    var costWeights = step.weights;
    var costTerms = step.terms;

    var optimized = groupMutuallyExclusiveTerms(costTerms, costWeights);

    self.setSolution(await logic.minimizeWeightedSum(
      self.solution, optimized.costTerms, optimized.costWeights, {
      progress: async function (status, cost) {
          if (self.options.yield) {
          await self.options.yield();
        }
        if (DEBUG) {
          if (status === 'improving') {
            console.log(cost + " ... trying to improve ...");
          } else if (status === 'trying') {
            console.log("... trying " + cost + " ... ");
          }
        }
      },
      strategy: (options && options.strategy)
    }));

    step.optimum = self.solution.getWeightedSum(costTerms, costWeights);
    if (DEBUG) {
      console.log(step.optimum + " is optimal");

      if (step.optimum) {
        costTerms.forEach(function (t, i) {
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

// This is a correctness-preserving performance optimization.
//
// Cost functions often have many terms where both the package name
// and the weight are the same.  For example, when optimizing major
// version, we might have `(foo 3.0.0)*2 + (foo 3.0.1)*2 ...`.  It's
// more efficient to give the solver `((foo 3.0.0) OR (foo 3.0.1) OR
// ...)*2 + ...`, because it separates the question of whether to use
// ANY `foo 3.x.x` variable from the question of which one.  Other
// constraints already enforce the fact that `foo 3.0.0` and `foo 3.0.1`
// are mutually exclusive variables.  We can use that fact to "relax"
// that relationship for the purposes of the weighted sum.
//
// Note that shuffling up the order of terms unnecessarily seems to
// impact performance, so it's significant that we group by package
// first, then weight, rather than vice versa.
var groupMutuallyExclusiveTerms = function (costTerms, costWeights) {
  // Return a key for a term, such that terms with the same key are
  // guaranteed to be mutually exclusive.  We assume each term is
  // a variable representing either a package or a package version.
  // We take a prefix of the variable name up to and including the
  // first space.  So "foo 1.0.0" becomes "foo " and "foo" stays "foo".
  var getTermKey = function (t) {
    var firstSpace = t.indexOf(' ');
    return firstSpace < 0 ? t : t.slice(0, firstSpace + 1);
  };

  // costWeights, as usual, may be a number or an array
  if (typeof costWeights === 'number') {
    return {
      costTerms: Object.values(groupBy(costTerms, getTermKey)).map(function (group) {
        return Logic.or(group);
      }),
      costWeights: costWeights
    };
  } else if (!costTerms.length) {
    return { costTerms: costTerms, costWeights: costWeights };
  } else {
    var weightedTerms = zip(costWeights, costTerms);
    var newWeightedTerms = Object.values(groupBy(weightedTerms, function (wt) {
      // construct a string from the weight and term key, for grouping
      // purposes.  since the weight comes first, there's no ambiguity
      // and the separator char could be pretty much anything.
      return wt[0] + ' ' + getTermKey(wt[1]);
    })).map(function (wts) {
      return [wts[0][0], Logic.or(wts.map(function(x){
        return x[1]
      }))];
    });
    return {
      costTerms: newWeightedTerms.map(function(x){
        return x[1]
      }),
      costWeights: newWeightedTerms.map(function(x){
        return x[0]
      })
    };
  }

};

// Determine the non-zero contributions to the cost function in `step`
// based on the current solution, returning a map from term (usually
// the name of a package or package version) to positive integer cost.
CS.Solver.prototype.getStepContributions = function (step) {
  var self = this;
  var solution = self.solution;
  var contributions = {};
  var weights = step.weights;
  step.terms.forEach(function (t, i) {
    var w = (typeof weights === 'number' ? weights : weights[i]);
    if (w && self.solution.evaluate(t)) {
      contributions[t] = w;
    }
  });
  return contributions;
};

var addCostsToSteps = function (pkg, versions, costs, steps) {
  var pvs = versions.map(function (v) {
    return pvVar(pkg, v);
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
CS.Solver.prototype.getVersionCostSteps = async function (stepBaseName, packages,
  pricerMode) {
  var self = this;
  var major = new CS.Solver.Step(stepBaseName + '_major');
  var minor = new CS.Solver.Step(stepBaseName + '_minor');
  var patch = new CS.Solver.Step(stepBaseName + '_patch');
  var rest = new CS.Solver.Step(stepBaseName + '_rest');

  await self.Profile.time(
    "calculate " + stepBaseName + " version costs",
    function () {
      packages.forEach(function (p) {
        var versions = self.getVersions(p);
        if (versions.length >= 2) {
          var costs = self.pricer.priceVersions(versions, pricerMode);
          addCostsToSteps(p, versions, costs, [major, minor, patch, rest]);
        }
      });
    });

  return [major, minor, patch, rest];
};

// Like `getVersionCostSteps`, but wraps
// `VersionPricer#priceVersionsWithPrevious` instead of `#priceVersions`.
// The cost function is "distance" from the previous versions passed in
// as `packageAndVersion`.  (Actually it's a complicated function of the
// previous and new version.)
CS.Solver.prototype.getVersionDistanceSteps = async function (stepBaseName,
  packageAndVersions,
  takePatches) {
  var self = this;

  var incompat = new CS.Solver.Step(stepBaseName + '_incompat');
  var major = new CS.Solver.Step(stepBaseName + '_major');
  var minor = new CS.Solver.Step(stepBaseName + '_minor');
  var patch = new CS.Solver.Step(stepBaseName + '_patch');
  var rest = new CS.Solver.Step(stepBaseName + '_rest');

  await self.Profile.time(
    "calculate " + stepBaseName + " distance costs",
    function () {
      packageAndVersions.forEach(function (pvArg) {
        var pkg = pvArg.package;
        var previousVersion = pvArg.version;
        var versions = self.getVersions(pkg);
        if (versions.length >= 2) {
          var costs = self.pricer.priceVersionsWithPrevious(
            versions, previousVersion, takePatches);
          addCostsToSteps(pkg, versions, costs,
            [incompat, major, minor, patch, rest]);
        }
      });
    });

  return [incompat, major, minor, patch, rest];
};

CS.Solver.prototype.currentVersionMap = function () {
  var self = this;
  var pvs = [];
  self.solution.getTrueVars().forEach(function (x) {
    if (x.indexOf(' ') >= 0) {
      // all variables with spaces in them are PackageAndVersions
      var pv = CS.PackageAndVersion.fromString(x);
      pvs.push(pv);
    }
  });

  var versionMap = {};
  pvs.forEach(function (pv) {
    if (has(versionMap, pv.package)) {
      throw new Error("Assertion failure: Selected two versions of " +
        pv.package + ", " + versionMap[pv.package] +
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
  if (!self.solution) {
    throw new Error("Unexpected unsatisfiability");
  }
  // When we query a Solution, we always want to treat unknown variables
  // as "false".  Logic Solver normally throws an error if you ask it
  // to evaluate a formula containing a variable that isn't found in any
  // constraints, as a courtesy to help catch bugs, but we treat
  // variables as an open class of predicates ("foo" means package foo
  // is selected, for example), and we don't ensure that every package
  // or package version we might ask about is registered with the Solver.
  // For example, when we go to explain a conflict or generate an error
  // about an unknown package, we may ask about packages that were
  // forbidden in an early analysis of the problem and never entered
  // into the Solver.
  return self.solution.ignoreUnknownVariables();
};

CS.Solver.prototype.getAnswer = function (options) {
  var self = this;
  return self.Profile.time("Solver#getAnswer", function () {
    return self._getAnswer(options);
  });
};

CS.Solver.prototype._getAnswer = async function (options) {
  var self = this;
  var input = self.input;
  var analysis = self.analysis;
  var cache = input.catalogCache;
  var allAnswers = (options && options.allAnswers); // for tests
  var Profile = self.Profile;

  var logic = await Profile.time("new Logic.Solver (MiniSat start-up)", function () {
    return new Logic.Solver();
  });

  self.logic = logic;

  // require root dependencies
  await Profile.time("require root dependencies", function () {
    input.dependencies.forEach(function (p) {
      logic.require(p);
    });
  });

  // generate package version variables for known, reachable packages
  await Profile.time("generate package variables", function () {
    Object.keys(analysis.reachablePackages).forEach(function (p) {
      if (!has(analysis.packagesWithNoAllowedVersions, p)) {
        var versionVars = self.getVersions(p).map(
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
  await Profile.time("generate dependency requirements", function () {
    Object.keys(analysis.reachablePackages).forEach(function (p) {
      self.getVersions(p).forEach(function (v) {
        Object.values(cache.getDependencyMap(p, v)).forEach(function (dep) {
          // `dep` is a CS.Dependency
          if (!dep.isWeak) {
            var p2 = dep.packageConstraint.package;
            logic.require(Logic.implies(pvVar(p, v), p2));
          }
        });
      });
    });
  });

  // generate constraints -- but technically don't enforce them, because
  // we haven't forced the conflictVars to be false
  await Profile.time("generate constraints", function () {
    analysis.constraints.forEach(function (c) {
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

  await Profile.time("pre-solve", function () {
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
  await Profile.time("forbid packages with no matching versions", async function () {
    for (const [p, constrs] of Object.entries(analysis.packagesWithNoAllowedVersions)) {
      var newSolution = await logic.solveAssuming(Logic.not(p));
      if (newSolution) {
        self.setSolution(newSolution);
        logic.forbid(p);
      } else {
        var error =
          'No version of ' + p + ' satisfies all constraints: ' +
          constrs.map(function (constr) {
            return '@' + constr.constraintString;
          }).join(', ');
        error += '\n' + self.listConstraintsOnPackage(p);
        self.errors.push(error);
      }
    }
    self.throwAnyErrors();
  });

  // try not to use any unknown packages.  If the minimum is greater
  // than 0, we'll throw an error later, after we apply the constraints
  // and the cost function, so that we can explain the problem to the
  // user in a convincing way.
  await self.minimize('unknown_packages', Object.keys(analysis.unknownPackages));

  // try not to set the conflictVar on any constraint.  If the minimum
  // is greater than 0, we'll throw an error later, after we've run the
  // cost function, so we can show a better error.
  // If there are conflicts, this minimization can be time-consuming
  // (several seconds or more).  The strategy 'bottom-up' helps by
  // looking for solutions with few conflicts first.
  await self.minimize('conflicts', analysis.constraints.map(function (constraint) {
    return constraint.conflictVar
  }),
    { strategy: 'bottom-up' });

  // Try not to use "unanticipated" prerelease versions
  await self.minimize('unanticipated_prereleases',
    analysis.unanticipatedPrereleases);

  var previousRootSteps = await self.getVersionDistanceSteps(
    'previous_root', analysis.previousRootDepVersions);
  // the "previous_root_incompat" step
  var previousRootIncompat = previousRootSteps[0];
  // the "previous_root_major", "previous_root_minor", etc. steps
  var previousRootVersionParts = previousRootSteps.slice(1);

  var toUpdate = input.upgrade.filter(function (p) {
    return analysis.reachablePackages[p] === true;
  });

  // make sure packages that are being updated can still count as
  // a previous_root for the purposes of previous_root_incompat
  await Profile.time("add terms to previous_root_incompat", function () {
    toUpdate.forEach(function (p) {
      if (input.isRootDependency(p) && input.isInPreviousSolution(p)) {
        var parts = self.pricer.partitionVersions(
          self.getVersions(p), input.previousSolution[p]);
        parts.older.concat(parts.higherMajor).forEach(function (v) {
          previousRootIncompat.addTerm(pvVar(p, v), 1);
        });
      }
    });
  });

  if (!input.allowIncompatibleUpdate) {
    // Enforce that we don't make breaking changes to your root dependencies,
    // unless you pass --allow-incompatible-update.  It will actually be enforced
    // farther down, but for now, we want to apply this constraint before handling
    // updates.
    await self.minimize(previousRootIncompat);
  }

  await self.minimize(await self.getVersionCostSteps(
    'update', toUpdate, CS.VersionPricer.MODE_UPDATE));

  if (input.allowIncompatibleUpdate) {
    // If you pass `--allow-incompatible-update`, we will still try to minimize
    // version changes to root deps that break compatibility, but with a lower
    // priority than taking as-new-as-possible versions for `meteor update`.
    await self.minimize(previousRootIncompat);
  }

  await self.minimize(previousRootVersionParts);

  var otherPrevious = Object.entries(input.previousSolution || []).map(function ([p, v]) {
    return new CS.PackageAndVersion(p, v);
  }).filter(function (pv) {
    var p = pv.package;
    return analysis.reachablePackages[p] === true &&
      !input.isRootDependency(p);
  });

  await self.minimize(await self.getVersionDistanceSteps(
    'previous_indirect', otherPrevious,
    input.upgradeIndirectDepPatchVersions));

  var newRootDeps = input.dependencies.filter(function (p) {
    return !input.isInPreviousSolution(p);
  });

  await self.minimize(await self.getVersionCostSteps(
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
  await Profile.time("lock down important versions", function () {
    Object.entries(self.currentVersionMap()).forEach(function ([pkg, v]) {
      if (input.isRootDependency(pkg) ||
        input.isInPreviousSolution(pkg) ||
        input.isUpgrading(pkg)) {
        logic.require(Logic.implies(pkg, pvVar(pkg, v)));
      }
    });
  });

  // new, indirect packages are the lowest priority
  var otherPackages = [];
  Object.keys(analysis.reachablePackages).forEach(function (p) {
    if (!(input.isRootDependency(p) ||
      input.isInPreviousSolution(p) ||
      input.isUpgrading(p))) {
      otherPackages.push(p);
    }
  });

  await self.minimize(await self.getVersionCostSteps(
    'new_indirect', otherPackages,
    CS.VersionPricer.MODE_GRAVITY_WITH_PATCHES));

  await self.minimize('total_packages', Object.keys(analysis.reachablePackages));

  // throw errors about unknown packages
  if (self.stepsByName['unknown_packages'].optimum > 0) {
    await Profile.time("generate error for unknown packages", function () {
      var unknownPackages = Object.keys(analysis.unknownPackages);
      var unknownPackagesNeeded = unknownPackages.filter(function (p) {
        return self.solution.evaluate(p);
      });
      unknownPackagesNeeded.forEach(function (p) {
        var requirers = analysis.unknownPackages[p].filter(function (pv) {
          return self.solution.evaluate(pv);
        });
        var errorStr;
        if (CS.isIsobuildFeaturePackage(p)) {
          errorStr = 'unsupported Isobuild feature "' + p + '"; see ' +
            'https://docs.meteor.com/api/packagejs.html#isobuild-features ' +
            'for a list of features and the minimum Meteor release required';
        } else {
          errorStr = 'unknown package: ' + p;
        }
        requirers.forEach(function (pv) {
          errorStr += '\nRequired by: ' + pv;
        });
        self.errors.push(errorStr);
      });
    });
    self.throwAnyErrors();
  }

  // throw errors about conflicts
  if (self.stepsByName['conflicts'].optimum > 0) {
    await self.throwConflicts();
  }

  if ((!input.allowIncompatibleUpdate) &&
    self.stepsByName['previous_root_incompat'].optimum > 0) {
    // we have some "incompatible root changes", where we needed to change a
    // version of a root dependency to a new version incompatible with the
    // original, but --allow-incompatible-update hasn't been passed in.
    // these are in the form of PackageAndVersion strings that we need.
    var incompatRootChanges = Object.keys(self.getStepContributions(
      self.stepsByName['previous_root_incompat']));

    await Profile.time("generate errors for incompatible root change", function () {
      var numActualErrors = 0;
      incompatRootChanges.forEach(function (pvStr) {
        var pv = CS.PackageAndVersion.fromString(pvStr);
        // exclude packages with top-level equality constraints (added by user
        // or by the tool pinning a version)
        if (!has(analysis.topLevelEqualityConstrainedPackages, pv.package)) {
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
    answer: await Profile.time("generate version map", function () {
      return self.currentVersionMap();
    })
  };

  if (allAnswers) {
    await Profile.time("generate all answers", function () {
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
  return (targetVersions.map(function (v) {
    if (CS.isConstraintSatisfied(toPackage, vConstraint, v)) {
      return pvVar(toPackage, v);
    } else {
      return null;
    }
  })).filter(Boolean);
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

CS.Solver.prototype.listConstraintsOnPackage = function (pkg) {
  var self = this;
  var constraints = self.analysis.constraints;

  var result = 'Constraints on package "' + pkg + '":';

  constraints.forEach(function (c) {
    if (c.toPackage === pkg) {
      var paths;
      if (c.fromVar) {
        paths = self.getPathsToPackageVersion(
          CS.PackageAndVersion.fromString(c.fromVar));
      } else {
        paths = [['top level']];
      }
      paths.forEach(function (path) {
        result += '\n* ' + (new PV.PackageConstraint(
          pkg, c.vConstraint.raw)) + ' <- ' + path.join(' <- ');
      });
    }
  });

  return result;
};

CS.Solver.prototype.throwConflicts = async function () {
  var self = this;

  var solution = self.solution;
  var constraints = self.analysis.constraints;

  await self.Profile.time("generate error about conflicts", function () {
    constraints.forEach(function (c) {
      // c is a CS.Solver.Constraint
      if (solution.evaluate(c.conflictVar)) {
        // skipped this constraint
        var possibleVersions = self.getVersions(c.toPackage);
        var chosenVersion = possibleVersions.find(function (v) {
          return solution.evaluate(pvVar(c.toPackage, v));
        });
        if (!chosenVersion) {
          // this can't happen, because for a constraint to be a problem,
          // we must have chosen some version of the package it applies to!
          throw new Error("Internal error: Version not found");
        }
        var error = (
          'Conflict: Constraint ' + (new PV.PackageConstraint(
            c.toPackage, c.vConstraint)) +
          ' is not satisfied by ' + c.toPackage + ' ' + chosenVersion + '.');

        error += '\n' + self.listConstraintsOnPackage(c.toPackage);

        // Avoid printing exactly the same error twice.  eg, if we have two
        // different packages which have the same unsatisfiable constraint.
        if (self.errors.indexOf(error) === -1) {
          self.errors.push(error);
        }
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
    return has(cache.getDependencyMap(p1, versionMap[p1]), p2);
  };
  var allPackages = Object.keys(versionMap);

  var getPaths = function (pv, _ignorePackageSet) {
    if (!solution.evaluate(pv.toString())) {
      return [];
    }
    var pkg = pv.package;

    if (input.isRootDependency(pkg)) {
      return [[pv]];
    }

    var newIgnorePackageSet = Object.assign({}, _ignorePackageSet);
    newIgnorePackageSet[pkg] = true;

    var paths = [];
    var shortestLength = null;

    allPackages.forEach(function (p) {
      if ((!has(newIgnorePackageSet, p)) &&
        solution.evaluate(p) &&
        hasDep(p, pkg)) {
        var newPV = new CS.PackageAndVersion(p, versionMap[p]);
        getPaths(newPV, newIgnorePackageSet).forEach(function (path) {
          var newPath = [pv].concat(path);
          if ((!paths.length) || newPath.length < shortestLength) {
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
