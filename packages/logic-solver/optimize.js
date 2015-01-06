var minMax = function (solver, solution, costTerms, costWeights, optFormula, isMin) {
  var curSolution = solution;
  var curCost = curSolution.getWeightedSum(costTerms, costWeights);

  var weightedSum = (optFormula || Logic.weightedSum(costTerms, costWeights));
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

Logic.Solver.prototype.minimize = function (solution, costTerms, costWeights, optFormula) {
  return minMax(this, solution, costTerms, costWeights, optFormula, true);
};

Logic.Solver.prototype.maximize = function (solution, costTerms, costWeights, optFormula) {
  return minMax(this, solution, costTerms, costWeights, optFormula, false);
};
