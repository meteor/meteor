var CS = ConstraintSolver;
var PV = PackageVersion;

CS.Solver = function (input, options) {
  var self = this;
  check(input, CS.Input);

  self.input = input;
  self.errors = []; // [String]

  self.constraintSatisfactionOptions = {
    anticipatedPrereleases: self.input.anticipatedPrereleases
  };

  self.getVersionInfo = _.memoize(PV.parse);
  self.getConstraintFormula = _.memoize(_getConstraintFormula,
                                         function (p, vConstraint) {
                                           return p + "@" + vConstraint.raw;
                                         });

  self.options = options;

  self.steps = [];
  self.stepsByName = {};

  self.analysis = {};
};

// A Step consists of a name, an array of terms, and an array of weights.
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
  this.zeroGoal = false; // you can set this
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
  if ((typeof weight !== 'number') || (weight < 0) ||
      (weight !== (weight | 0))) {
    throw new Error("Bad weight: " + weight);
  }
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
// * minimize(step)
// * minimize([step1, step2, ...])
// * minimize(stepName, costTerms, costWeights)
//
// If you omit costWeights or pass null, it is set to 1 and the
// step will gain the "zeroGoal" flag, which means the optimizer
// will try to hit a cost of 0 before trying anything else.
CS.Solver.prototype.minimize = function (step, costTerms_, costWeights_) {
  var self = this;

  if (_.isArray(step)) {
    _.each(step, function (st) {
      self.minimize(st);
    });
  } else if (typeof step === 'string') {
    var theStep = new CS.Solver.Step(
      step, costTerms_, (costWeights_ == null ? 1 : costWeights_));
    if (costWeights_ == null) {
      theStep.zeroGoal = true;
    }
    self.minimize(theStep);
  } else {
    var logic = self.logic;

    self.steps.push(step);
    self.stepsByName[step.name] = step;

    if (DEBUG) {
      console.log("--- MINIMIZING " + step.name);
    }

    var costWeights = step.weights;
    var costTerms = step.terms;
    var hitZero = false;
    if (step.zeroGoal) {
      costWeights = 1;

      // omitting costWeights puts us in a mode where we try to hit 0 right
      // off the bat, as an optimization
      if (costTerms.length) {
        var zeroSolution = logic.solveAssuming(Logic.not(Logic.or(costTerms)));
        if (zeroSolution) {
          self.solution = zeroSolution;
          logic.forbid(costTerms);
          hitZero = true;
        }
      } else {
        hitZero = true;
      }
    }

    if (! hitZero) {
      var anyWeight =
            (typeof costWeights === 'number') ? costWeights :
            _.any(costWeights);

      if (anyWeight) {
        self.solution = logic.minimize(
          self.solution, costTerms, costWeights, {
            progress: function (status, cost) {
              if (status === 'improving') {
                if (DEBUG) {
                  console.log(cost + " ... trying to improve ...");
                }
              }
            }
          });

        if (! self.solution) {
          // Optimizing shouldn't change satisfiability
          throw new Error("Unexpected unsatisfiability");
        }
      }
    }

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
  }
};

CS.Solver.prototype.analyzeReachability = function () {
  var self = this;
  var input = self.input;
  var cache = input.catalogCache;
  // package name -> true
  var reachablePackages = self.analysis.reachablePackages = {};
  // package name -> package versions asking for it (in pvVar form)
  var unknownPackages = self.analysis.unknownPackages = {};

  var visit = function (p) {
    reachablePackages[p] = true;

    _.each(cache.getPackageVersions(p), function (v) {
      _.each(cache.getDependencyMap(p, v), function (dep) {
        // `dep` is a CS.Dependency
        var p2 = dep.packageConstraint.package;
        if (! input.isKnownPackage(p2)) {
          // record this package so we will generate a variable
          // for it.  we'll try not to select it, and ultimately
          // throw an error if we are forced to.
          if (! _.has(unknownPackages, p2)) {
            unknownPackages[p2] = [];
          }
          unknownPackages[p2].push(pvVar(p, v));
        } else {
          if (! dep.isWeak) {
            if (reachablePackages[p2] !== true) {
              visit(p2);
            }
          }
        }
      });
    });
  };

  _.each(input.dependencies, visit);
};

CS.Solver.prototype.analyzeConstraints = function () {
  var self = this;
  var input = self.input;
  var cache = input.catalogCache;
  var constraints = self.analysis.constraints = [];

  // top-level constraints
  _.each(input.constraints, function (c) {
    constraints.push(new CS.Solver.Constraint(
      null, c.package, c.versionConstraint,
      "constraint#" + constraints.length));
  });

  // constraints specified by package versions
  _.each(_.keys(self.analysis.reachablePackages), function (p) {
    _.each(cache.getPackageVersions(p), function (v) {
      var pv = pvVar(p, v);
      _.each(cache.getDependencyMap(p, v), function (dep) {
        // `dep` is a CS.Dependency
        var p2 = dep.packageConstraint.package;
        if (input.isKnownPackage(p2)) {
          constraints.push(new CS.Solver.Constraint(
            pv, p2, dep.packageConstraint.versionConstraint,
            "constraint#" + constraints.length));
        }
      });
    });
  });
};

CS.Solver.prototype.getAllVersions = function (package) {
  var self = this;
  return _.map(self.input.catalogCache.getPackageVersions(package),
               function (v) {
                 return pvVar(package, v);
               });
};

// mode is 'update' or 'gravity'
// optLaterVersion, if provided, is a version that is not in the array
// but is newer and should be used in initial comparisons.
var scanVersions = function (self, versions, mode, optLaterVersion) {
  if (mode !== 'update' && mode !== 'gravity') {
    throw new Error("Bad mode: " + mode);
  }
  var oldnessMajor = 0;
  var oldnessMinor = 0;
  var oldnessPatch = 0;
  var oldnessRest = 0;
  var lastVInfo = null;
  if (optLaterVersion) {
    lastVInfo = self.getVersionInfo(optLaterVersion);
  }
  var versionsOut = [];
  var major = [];
  var minor = [];
  var patch = [];
  var rest = [];
  var countOfSameMajor = 0;
  for (var i = versions.length - 1; i >= 0; i--) {
    var v = versions[i];
    var vInfo = self.getVersionInfo(v);
    if (lastVInfo) {
      if (vInfo.major !== lastVInfo.major) {
        oldnessMajor++;
        if (mode === 'gravity') {
          // flip the last countOfSameMajor minor weights
          var maxMinorOldness = oldnessMinor;
          var last = minor.length - 1;
          for (var i = 0; i < countOfSameMajor; i++) {
            minor[last - i] = maxMinorOldness - minor[last - i];
          }
        }
        countOfSameMajor = 0;
        oldnessMinor = oldnessPatch = oldnessRest = 0;
      } else if (vInfo.minor !== lastVInfo.minor) {
        oldnessMinor++;
        oldnessPatch = oldnessRest = 0;
      } else if (vInfo.patch !== lastVInfo.patch) {
        oldnessPatch++;
        oldnessRest = 0;
      } else {
        oldnessRest++;
      }
    }
    versionsOut.push(v);
    major.push(oldnessMajor);
    minor.push(oldnessMinor);
    patch.push(oldnessPatch);
    rest.push(oldnessRest);
    countOfSameMajor++;
    lastVInfo = vInfo;
  }
  if (mode === 'gravity') {
    // flip the last countOfSameMajor minor weights
    var maxMinorOldness = oldnessMinor;
    var last = minor.length - 1;
    for (var i = 0; i < countOfSameMajor; i++) {
      minor[last - i] = maxMinorOldness - minor[last - i];
    }

    // flip major weights
    var maxMajorOldness = oldnessMajor;
    major = _.map(major, function (w) {
      return maxMajorOldness - w;
    });
  }

  return {
    versions: versionsOut,
    major: major,
    minor: minor,
    patch: patch,
    rest: rest
  };
};

var scanForOldness = function (self, package, versions, MMPR, optLaterVersion) {
  var result = scanVersions(self, versions, 'update', optLaterVersion);
  var versionsOut = result.versions;
  var major = result.major;
  var minor = result.minor;
  var patch = result.patch;
  var rest = result.rest;
  for (var i = 0; i < versionsOut.length; i++) {
    var pv = pvVar(package, versionsOut[i]);
    MMPR[0].addTerm(pv, major[i]);
    MMPR[1].addTerm(pv, minor[i]);
    MMPR[2].addTerm(pv, patch[i]);
    MMPR[3].addTerm(pv, rest[i]);
  }
};

var scanForGravityAndPatches = function (self, package, versions, MMPR) {
  var result = scanVersions(self, versions, 'gravity');
  var versionsOut = result.versions;
  var major = result.major;
  var minor = result.minor;
  var patch = result.patch;
  var rest = result.rest;
  for (var i = 0; i < versionsOut.length; i++) {
    var pv = pvVar(package, versionsOut[i]);
    MMPR[0].addTerm(pv, major[i]);
    MMPR[1].addTerm(pv, minor[i]);
    MMPR[2].addTerm(pv, patch[i]);
    MMPR[3].addTerm(pv, rest[i]);
  }
};

CS.Solver.prototype.getOldnesses = function (stepBaseName, packages) {
  var self = this;
  var major = new CS.Solver.Step(stepBaseName + '_major');
  var minor = new CS.Solver.Step(stepBaseName + '_minor');
  var patch = new CS.Solver.Step(stepBaseName + '_patch');
  var rest = new CS.Solver.Step(stepBaseName + '_rest');

  _.each(packages, function (p) {
    var versions = self.input.catalogCache.getPackageVersions(p);
    scanForOldness(self, p, versions, [major, minor, patch, rest]);
  });

  return [major, minor, patch, rest];
};

CS.Solver.prototype.getGravityPotential = function (stepBaseName, packages) {
  var self = this;
  var major = new CS.Solver.Step(stepBaseName + '_major');
  var minor = new CS.Solver.Step(stepBaseName + '_minor');
  var patch = new CS.Solver.Step(stepBaseName + '_patch');
  var rest = new CS.Solver.Step(stepBaseName + '_rest');

  _.each(packages, function (p) {
    var versions = self.input.catalogCache.getPackageVersions(p);
    scanForGravityAndPatches(self, p, versions, [major, minor, patch, rest]);
  });

  return [major, minor, patch, rest];
};

var versionsBeforeAndAfter = function (self, versions, pivot) {
  var firstGteIndex = versions.length;
  var pivotVInfo = self.getVersionInfo(pivot);
  _.find(versions, function (v, i) {
    var vInfo = self.getVersionInfo(v);
    if (! PV.lessThan(vInfo, pivotVInfo)) {
      firstGteIndex = i;
      return true;
    }
    return false;
  });
  return { before: versions.slice(0, firstGteIndex),
           after: versions.slice(firstGteIndex) };
};

CS.Solver.prototype.getDistances = function (stepBaseName, packageAndVersions) {
  var self = this;

  var incompat = new CS.Solver.Step(stepBaseName + '_incompat');
  var major = new CS.Solver.Step(stepBaseName + '_major');
  var minor = new CS.Solver.Step(stepBaseName + '_minor');
  var patch = new CS.Solver.Step(stepBaseName + '_patch');
  var rest = new CS.Solver.Step(stepBaseName + '_rest');

  incompat.zeroGoal = true;
  major.zeroGoal = true;
  minor.zeroGoal = true;
  patch.zeroGoal = true;
  rest.zeroGoal = true;

  _.each(packageAndVersions, function (pvArg) {
    var package = pvArg.package;
    var previousVersion = pvArg.version;
    var versions = self.input.catalogCache.getPackageVersions(package);
    var beforeAndAfter = versionsBeforeAndAfter(
      self, versions, previousVersion);
    var before = beforeAndAfter.before;
    var after = beforeAndAfter.after;

    scanForOldness(self, package, before, [major, minor, patch, rest],
                   previousVersion);
    _.each(before, function (v) {
      var pv = pvVar(package, v);
      incompat.addTerm(pv, 1);
    });

    scanForGravityAndPatches(self, package, after,
                             [major, minor, patch, rest]);
  });

  return [incompat, major, minor, patch, rest];
};

CS.Solver.prototype.currentSelectedPVs = function () {
  var self = this;
  var result = [];
  _.each(self.solution.getTrueVars(), function (x) {
    if (x.indexOf(' ') >= 0) {
      // all variables with spaces in them are PackageAndVersions
      var pv = CS.PackageAndVersion.fromString(x);
      result.push(pv);
    }
  });
  return result;
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
    versionMap[pv.package] = pv.version;
  });

  return versionMap;
};

CS.Solver.prototype.getSolution = function () {
  var self = this;
  var input = self.input;
  var analysis = self.analysis;
  var cache = input.catalogCache;

  // populate `analysis.unknownRootDeps`, `analysis.previousRootDepVersions`
  self.analyzeRootDependencies();

  if (analysis.unknownRootDeps.length) {
    _.each(analysis.unknownRootDeps, function (p) {
      self.errors.push('unknown package in top-level dependencies: ' + p);
    });
    self.throwAnyErrors();
  }

  // populate `analysis.reachablePackages`, `analysis.unknownPackages`
  self.analyzeReachability();

  // populate `analysis.constraints`
  self.analyzeConstraints();

  var logic = self.logic = new Logic.Solver;

  // require root dependencies
  _.each(input.dependencies, function (p) {
    logic.require(p);
  });

  // generate package version variables for known, reachable packages
  _.each(_.keys(analysis.reachablePackages), function (p) {
    var versionVars = self.getAllVersions(p);
    // At most one of ["foo 1.0.0", "foo 1.0.1", ...] is true.
    logic.require(Logic.atMostOne(versionVars));
    // The variable "foo" is true if and only if at least one of the
    // variables ["foo 1.0.0", "foo 1.0.1", ...] is true.
    logic.require(Logic.equiv(p, Logic.or(versionVars)));
  });

  // generate strong dependency requirements
  _.each(_.keys(analysis.reachablePackages), function (p) {
    _.each(cache.getPackageVersions(p), function (v) {
      _.each(cache.getDependencyMap(p, v), function (dep) {
        // `dep` is a CS.Dependency
        if (! dep.isWeak) {
          var p2 = dep.packageConstraint.package;
          logic.require(Logic.implies(pvVar(p, v), p2));
        }
      });
    });
  });

  // generate constraints -- but technically don't enforce them, because
  // they are guarded by variables that haven't been forced to true
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

  // Establish the invariant of self.solution being a valid solution.
  self.solution = logic.solve();
  if (! self.solution) {
    // There is always a solution at this point, namely,
    // select all packages (including unknown packages)!
    throw new Error("Unexpected unsatisfiability");
  }

  // try not to use any unknown packages.  If the minimum is greater
  // than 0, we'll throw an error later, after we apply the constraints
  // and the cost function, so that we can explain the problem to the
  // user in a convincing way.
  self.minimize('unknown_packages', _.keys(analysis.unknownPackages));

  // try not to set the conflictVar on any constraint.  If the minimum
  // is greater than 0, we'll throw an error later, after we've run the
  // cost function, so we can show a better error.
  self.minimize('conflicts', _.pluck(analysis.constraints, 'conflictVar'));

  // XXX This is where we will enforce that we don't make breaking changes
  // to your root dependencies, unless you pass --breaking.

  var toUpdate = _.filter(input.upgrade, function (p) {
    return analysis.reachablePackages[p] === true;
  });

  self.minimize(self.getOldnesses('update', toUpdate));

  var newRootDeps = _.filter(input.dependencies, function (p) {
    return ! input.isInPreviousSolution(p);
  });

  self.minimize(self.getDistances(
    'previous_root', analysis.previousRootDepVersions));

  var otherPrevious = _.filter(_.map(input.previousSolution, function (v, p) {
    return new CS.PackageAndVersion(p, v);
  }), function (pv) {
    var p = pv.p;
    return analysis.reachablePackages[p] === true &&
      ! input.isRootDependency(p);
  });

  self.minimize(self.getDistances('previous_indirect', otherPrevious));

  self.minimize(self.getOldnesses('new_root', newRootDeps));

  // lock down versions of all root, previous, and updating packages that
  // are currently selected
  _.each(self.currentVersionMap(), function (v, package) {
    if (input.isRootDependency(package) ||
        input.isInPreviousSolution(package) ||
        input.isUpgrading(package)) {
      logic.require(pvVar(package, v));
    }
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

  //_.each(otherPackages, function (package) {
  //self.minimize(self.getGravityPotential(
  //'new_indirect(' + package + ')', [package]));
  //});
  self.minimize(self.getGravityPotential('new_indirect', otherPackages));

  self.minimize('total_packages', _.keys(analysis.reachablePackages));

  // throw errors about unknown packages
  if (self.stepsByName.unknown_packages.optimum > 0) {
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
    self.throwAnyErrors();
  }

  // throw errors about conflicts
  if (self.stepsByName.conflicts.optimum > 0) {
    self.throwConflicts();
  }

  var versionMap = self.currentVersionMap();

  return {
    neededToUseUnanticipatedPrereleases: false, // XXX
    answer: versionMap
  };
};

CS.Solver.prototype.analyzeRootDependencies = function () {
  var self = this;
  var unknownRootDeps = self.analysis.unknownRootDeps = [];
  var previousRootDepVersions = self.analysis.previousRootDepVersions = [];
  var input = self.input;

  _.each(input.dependencies, function (p) {
    if (! input.isKnownPackage(p)) {
      unknownRootDeps.push(p);
    } else if (input.isInPreviousSolution(p) &&
               ! input.isUpgrading(p)) {
      previousRootDepVersions.push(new CS.PackageAndVersion(
        p, input.previousSolution[p]));
    }
  });
};

var pvVar = function (p, v) {
  return p + ' ' + v;
};


CS.Solver.prototype.throwAnyErrors = function () {
  if (this.errors.length) {
    CS.throwConstraintSolverError(this.errors.join('\n'));
  }
};

CS.Solver.prototype.getOkVersions = function (toPackage, vConstraint,
                                               targetVersions) {
  var self = this;
  return _.compact(_.map(targetVersions, function (v) {
    if (CS.isConstraintSatisfied(
      toPackage, vConstraint, v, self.constraintSatisfactionOptions)) {
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
  var okVersions = self.getOkVersions(toPackage, vConstraint, targetVersions);

  if (okVersions.length === targetVersions.length) {
    return Logic.TRUE;
  } else {
    return Logic.or(Logic.not(toPackage), okVersions);
  }
};


CS.Solver.prototype.throwConflicts = function () {
  var self = this;

  var solution = self.solution;
  var constraints = self.analysis.constraints;

  _.each(constraints, function (c) {
    // c is a CS.Solver.Constraint
    if (solution.evaluate(c.conflictVar)) {
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

      _.each(constraints, function (c2) {
        if (c2.toPackage === c.toPackage) {
          var paths;
          if (c2.fromVar) {
            paths = self.getPathsToPackageVersion(
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
  // Return list of package names of strong dependencies of `package`
  var getDeps = function (package) {
    var deps = cache.getDependencyMap(package, versionMap[package]);
    return _.map(_.filter(deps, function (dep) {
      return ! dep.isWeak;
    }), function (dep) {
      return dep.packageConstraint.package;
    });
  };
  var hasDep = function (p1, p2) {
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
  check(this.vConstraint, CS.Input.VersionConstraintType);
  check(this.conflictVar, String);
};
