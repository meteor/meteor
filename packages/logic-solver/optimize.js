var minMax = function (solver, solution, costTerms, costWeights, optFormula, isMin) {
  var curSolution = solution;
  var curCost = curSolution.getWeightedSum(costTerms, costWeights);

  var weightedSum = (optFormula || Logic.weightedSum(costTerms, costWeights));

  solver.require((isMin ? Logic.lessThanOrEqual : Logic.greaterThanOrEqual)(
    weightedSum, Logic.constantBits(curCost)));

  while (isMin ? curCost > 0 : true) {
    var improvement = (isMin ? Logic.lessThan : Logic.greaterThan)(
      weightedSum, Logic.constantBits(curCost));
    var newSolution = solver.solveAssuming(improvement);
    if (! newSolution) {
      return curSolution;
    }
    solver.require(improvement);
    curSolution = newSolution;
    curCost = curSolution.getWeightedSum(costTerms, costWeights);
  }
  return curSolution;
};

// costWeights is an array (of same length as costTerms) or a single WholeNumber.
//
// if the caller passes optFormula, it should be the formula
// Logic.weightedSum(costTerms, costWeights).  The optimizer will use
// this existing formula rather than generating a new one (for efficiency).
// The optimizer still wants to know the terms and weights, because it is
// more efficient for it to evaluate the current cost using them directly
// rather than the formula.

Logic.Solver.prototype.minimize = function (solution, costTerms, costWeights, optFormula) {
  return minMax(this, solution, costTerms, costWeights, optFormula, true);
};

Logic.Solver.prototype.maximize = function (solution, costTerms, costWeights, optFormula) {
  return minMax(this, solution, costTerms, costWeights, optFormula, false);
};
