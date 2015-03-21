var getNonZeroWeightedTerms = function (costTerms, costWeights) {
  if (typeof costWeights === 'number') {
    return costWeights ? costTerms : [];
  } else {
    var terms = [];
    for (var i = 0; i < costTerms.length; i++) {
      if (costWeights[i]) {
        terms.push(costTerms[i]);
      }
    }
    return terms;
  }
};

// See comments on minimize and maximize.
var minMax = function (solver, solution, costTerms, costWeights, options, isMin) {
  var curSolution = solution;
  var curCost = curSolution.getWeightedSum(costTerms, costWeights);

  var optFormula = options && options.formula;
  var weightedSum = (optFormula || Logic.weightedSum(costTerms, costWeights));

  var progress = options && options.progress;
  var strategy = options && options.strategy;

  // array of terms with non-zero weights, populated on demand
  var nonZeroTerms = null;

  if (isMin && curCost > 0) {
    // try to skip straight to 0 cost, because if it works, it could
    // save us some time
    if (progress) {
      progress('trying', 0);
    }
    var zeroSolution = null;
    nonZeroTerms = getNonZeroWeightedTerms(costTerms, costWeights);
    var zeroSolution = solver.solveAssuming(Logic.not(Logic.or(nonZeroTerms)));
    if (zeroSolution) {
      curSolution = zeroSolution;
      curCost = 0;
    }
  }

  if (isMin && strategy === 'bottom-up') {
    for (var trialCost = 1; trialCost < curCost; trialCost++) {
      if (progress) {
        progress('trying', trialCost);
      }
      var costIsTrialCost = Logic.equalBits(
        weightedSum, Logic.constantBits(trialCost));
      var newSolution = solver.solveAssuming(costIsTrialCost);
      if (newSolution) {
        curSolution = newSolution;
        curCost = trialCost;
        break;
      }
    }
  } else if (strategy && strategy !== 'default') {
    throw new Error("Bad strategy: " + strategy);
  } else {
    strategy = 'default';
  }

  if (strategy === 'default') {
    // for minimization, count down from current cost. for maximization,
    // count up.
    while (isMin ? curCost > 0 : true) {
      if (progress) {
        progress('improving', curCost);
      }
      var improvement = (isMin ? Logic.lessThan : Logic.greaterThan)(
        weightedSum, Logic.constantBits(curCost));
      var newSolution = solver.solveAssuming(improvement);
      if (! newSolution) {
        break;
      }
      solver.require(improvement);
      curSolution = newSolution;
      curCost = curSolution.getWeightedSum(costTerms, costWeights);
    }
  }

  if (isMin && curCost === 0) {
    // express the requirement that the weighted sum be 0 in an efficient
    // way for the solver (all terms with non-zero weights must be 0)
    if (! nonZeroTerms) {
      nonZeroTerms = getNonZeroWeightedTerms(costTerms, costWeights);
    }
    solver.forbid(nonZeroTerms);
  } else {
    solver.require(Logic.equalBits(weightedSum, Logic.constantBits(curCost)));
  }

  if (progress) {
    progress('finished', curCost);
  }

  return curSolution;
};

// Minimize (or maximize) the dot product of costTerms and
// costWeights, and further, require (as in solver.require) that the
// value of the dot product be equal to the optimum found.  Returns a
// valid solution where this optimum is achieved.
//
// `solution` must be a current valid solution as returned from
// `solve` or `solveAssuming`.  It is used as a starting point (to
// evaluate the current cost).
//
// costWeights is an array (of same length as costTerms) or a single
// WholeNumber.
//
// if the caller passes options.formula, it should be the formula
// Logic.weightedSum(costTerms, costWeights).  The optimizer will use
// this existing formula rather than generating a new one (for
// efficiency).  The optimizer still wants to know the terms and
// weights, because it is more efficient for it to evaluate the
// current cost using them directly rather than the formula.
//
// options.progress: a function that takes two arguments, to call at
// particular times during optimization.  Called with arguments
// ('improving', cost) when about to search for a way to improve on
// `cost`, and called with arguments ('finished', cost) when the
// optimum is reached.  There's also ('trying', cost) when a cost
// is tried directly (which is usually done with 0 right off the bat).
//
// options.strategy: a string hinting how to go about the optimization.
// the default strategy (option absent or 'default') is to work down
// from the current cost for minimization or up from the current cost
// for maximization, and iteratively insist that the cost be made lower
// if possible.  For minimization, the alternate strategy 'bottom-up' is
// available, which starts at 0 and tries ever higher costs until one
// works.  All strategies first try and see if a cost of 0 is possible.

Logic.Solver.prototype.minimize = function (solution, costTerms, costWeights,
                                            options) {
  return minMax(this, solution, costTerms, costWeights, options, true);
};

Logic.Solver.prototype.maximize = function (solution, costTerms, costWeights,
                                            options) {
  return minMax(this, solution, costTerms, costWeights, options, false);
};
