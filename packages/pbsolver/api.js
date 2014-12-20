PBSolver = function () {
  var C = this._C = cMinisatp();
  this._native = {
    getStackPointer: function () {
      return C.Runtime.stackSave();
    },
    setStackPointer: function (ptr) {
      C.Runtime.stackRestore(ptr);
    },
    allocateBytes: function (len) {
      return C.allocate(len, 'i8', C.ALLOC_STACK);
    },
    pushString: function (str) {
      return this.allocateBytes(C.intArrayFromString(str));
    },
    savingStack: function (func) {
      var SP = this.getStackPointer();
      var ret = func(this, C);
      this.setStackPointer(SP);
      return ret;
    }
  };

  C._createTheSolver();

  // The variable "`0" is reserved for FALSE,
  // and "`1" for TRUE.
  this._nextGenVarNum = 2;

  this._numClausesAdded = 0;
  this._numConstraintsAdded = 0;

  this._usedVars = {}; // var -> true
  this._solved = false;
};

// This is just a test of passing in a string that gets split
// and counted.
PBSolver.prototype._countLines = function (str) {
  return this._native.savingStack(function (native, C) {
    return C._countLines(native.pushString(str));
  });
};

var VariableName = Match.Where(function (x) {
  check(x, String);
  if (x.indexOf('\n') >= 0) {
    return false;
  }
  // Vars starting with backtick have to be numeric.
  if (x.charAt(0) === '`') {
    return /^`[0-9]+$/.test(x);
  }
  return true;
});
var WholeNumber = Match.Where(function (x) {
  check(x, Match.Integer);
  return x >= 0;
});

PBSolver.prototype.validateVar = function (v) {
  var k = ' '+v;
  if (this._solved) {
    // Because of the way variable names are converted to
    // numbers in the solver, we can only do it before the solver
    // has been run.  We could fix this by doing all name mapping
    // in JS.
    if (! _.has(this._usedVars, k)) {
      throw new Error("Can't add new vars after first solve");
    }
  } else {
    this._usedVars[k] = true;
  }
  return v;
};

PBSolver.prototype.validateVars = function (vv) {
  for (var i = 0; i < vv.length; i++) {
    this.validateVar(vv[i]);
  }
  return vv;
};

PBSolver.prototype.addClause = function (positives, negatives) {
  var self = this;
  negatives = negatives || [];
  check(positives, [VariableName]);
  check(negatives, [VariableName]);

  this.validateVars(positives);
  this.validateVars(negatives);

  self._native.savingStack(function (native, C) {
    C._addClause(native.pushString(positives.join('\n')),
                 native.pushString(negatives.join('\n')));
  });

  self._numClausesAdded++;
};

var TYPE_CODES = {
  '<': -2, '<=': -1, '=': 0, '>=': 1, '>': 2
};

PBSolver.prototype.addConstraint = function (vars, coeffs, type, rhs) {
  if (typeof coeffs === 'number') {
    // turn a coeffs of `1` into `[1, 1, 1]`, for example, if there
    // are three vars.
    coeffs = _.map(vars, function () { return coeffs; });
  }
  coeffs.length = vars.length;
  check(vars, [VariableName]);
  check(coeffs, [WholeNumber]);
  check(type, Match.OneOf('<', '<=', '=', '>=', '>'));
  check(rhs, WholeNumber);

  this.validateVars(vars);

  this._native.savingStack(function (native, C) {
    var coeffsPtr = C.allocate(vars.length*4, 'i32', C.ALLOC_STACK);
    _.each(coeffs, function (c, i) {
      C.setValue(coeffsPtr + i*4, c, 'i32');
    });
    var varsPtr = native.pushString(vars.join('\n'));
    C._addConstraint(varsPtr, coeffsPtr, TYPE_CODES[type], rhs);
  });

  this._numConstraintsAdded++;
};


PBSolver.prototype.exactlyOne = function (vars) {
  if (! vars.length) {
    throw new Error("At least one variable required");
  }
  this.atMostOne(vars);
  this.atLeastOne(vars);
};

// Asserts the equivalence x == (A or B or ...)
PBSolver.prototype.equalsOr = function (x, vars) {
  // x implies (A or B or C).  A or B or C or (not x).
  this.addClause(vars, [x]);
  // (A or B or C) implies x, or equivalently,
  // ((not x) implies (not A)) and
  // ((not x) implies (not B)) and ...
  for (var j = 0; j < vars.length; j++) {
    this.implies(vars[j], x);
  }
};

PBSolver.prototype.getWeightedSum = function (vars, weights) {
  check(vars, [VariableName]);
  check(weights, [WholeNumber]);
  if (! (vars.length === weights.length && vars.length)) {
    throw new Error("vars and weights must be same length (> 0)");
  }
  var weightedVars = [];
  for (var i = 0; i < vars.length; i++) {
    var v = vars[i];
    var w = weights[i];
    var whichBit = 0;
    while (w) {
      if (w & 1) {
        weightedVars[whichBit] =
          (weightedVars[whichBit] || []);
        weightedVars[whichBit].push(v);
      }
      w >>>= 1;
      whichBit++;
    }
  }

  return this.getBinaryWeightedSum(weightedVars);
};

// Takes a list of list of vars.  The first list is vars
// to give weight 1; the second is vars to give weight 2;
// and so on.
PBSolver.prototype.getBinaryWeightedSum = function (varsByWeight) {
  check(varsByWeight, [[VariableName]]);
  // deep clone so we can mutate the arrays in place
  var buckets = _.map(varsByWeight, _.clone);
  var lowestWeight = 0; // index of the first non-empty array
  var output = [];
  while (lowestWeight < buckets.length) {
    var i = lowestWeight;
    var bucket = buckets[i];
    if (! bucket.length) {
      output.push(this.getFalse());
      lowestWeight++;
    } else if (bucket.length === 1) {
      output.push(bucket[0]);
      lowestWeight++;
    } else if (bucket.length === 2) {
      var sum = this.getSum(bucket);
      bucket.length = 0;
      bucket.push(sum[0]);
      buckets[i+1] = (buckets[i+1] || []);
      buckets[i+1].push(sum[1]);
    } else {
      // take the first three, not the last three,
      // so that the list operates as a queue.  This
      // produces a different (maybe better) result.
      // It makes a shallower graph.
      var three = buckets[i].splice(0, 3);
      var sum = this.getSum(three);
      bucket.push(sum[0]);
      buckets[i+1] = (buckets[i+1] || []);
      buckets[i+1].push(sum[1]);
    }
  }
  return output;
};

// Takes a list of zero or more boolean vars and
// returns a list of bits of the sum of the vars
// (the number of true bars).  The "list of bits"
// is a list of variable names representing the
// bits, least significant first (i.e. the 1 bit,
// then the 2 bit, then the 4 bit...)
PBSolver.prototype.getSum = function (vars) {
  check(vars, [VariableName]);
  if (! vars.length) {
    throw new Error("At least one variable required");
  }
  if (vars.length === 1) {
    return vars;
  } else if (vars.length === 2) {
    // "Half Adder"
    var A = vars[0];
    var B = vars[1];
    var S = this.genVar();
    var R = this.genVar();
    // S = (A xor B) [sum]
    this._equalsXor2(S, A, B);
    // R = (A and B) [carry]
    this.addClause([R], [A, B]); // -A v -B v R
    this.addClause([A], [R]); // A v -R
    this.addClause([B], [R]); // A v -R
    return [S, R];
  } else if (vars.length === 3) {
    // "Full Adder"
    var A = vars[0];
    var B = vars[1];
    var C = vars[2];
    var S = this.genVar();
    var R = this.genVar();
    // S = xor(A,B,C) [sum]
    this.addClause([A, B, C, S], []); // A v B v C v S
    this.addClause([A, S], [B, C]); // A v -B v -C v S
    this.addClause([B, S], [A, C]); // -A v B v -C v S
    this.addClause([C, S], [A, B]); // -A v -B v C v S
    this.addClause([], [A, B, C, S]); // -A v -B v -C v -S
    this.addClause([B, C], [A, S]); // -A v B v C v -S
    this.addClause([A, C], [B, S]); // A v -B v C v -S
    this.addClause([A, B], [C, S]); // A v B v -C v -S
    // R == (A + B + C >= 2) [carry]
    this.addClause([R], [A, B]); // -A v -B v R
    this.addClause([R], [A, C]); // -A v -C v R
    this.addClause([R], [B, C]); // -B v -C v R
    this.addClause([A, B], [R]); // A v B v -R
    this.addClause([A, C], [R]); // A v C v -R
    this.addClause([B, C], [R]); // B v C v -R
    return [S, R];
  } else {
    return this.getBinaryWeightedSum([vars]);
  }
};

PBSolver.prototype._equalsXor2 = function (S, A, B) {
  // S == (A xor B)
  this.addClause([B, S], [A]); // -A v B v S
  this.addClause([A, S], [B]); // A v -B v S
  this.addClause([], [A, B, S]); // -A v -B v -S
  this.addClause([A, B], [S]); // A v B v -S
};

PBSolver.prototype.lessThanOrEqual = function (A, B) {
  // A <= B, where A and B are arrays of variables representing
  // bit strings, least significant bit first
  check(A, [VariableName]);
  check(B, [VariableName]);
  // clone A and B so we can mutate them in place
  A = A.slice();
  B = B.slice();
  var i = 0;
  // if A is longer than B, the extra (high) bits
  // must be 0.
  while (A.length > B.length) {
    var hi = A.pop();
    this.isFalse(hi);
  }
  // now B.length >= A.length
  // xors[i] is (A[i] xor B[i]), or B[i] if A is too short.
  var xors = new Array(B.length);
  for(var i=0; i < B.length; i++) {
    if (i < A.length) {
      xors[i] = this.genVar();
      this._equalsXor2(xors[i], A[i], B[i]);
    } else {
      xors[i] = B[i];
    }
  }
  // Suppose we are comparing 3-bit numbers, asserting
  // that ABC <= XYZ.  Here is what we assert:
  //
  // * It is false that A=1 and X=0.
  // * It is false that A=X, B=1, and Y=0.
  // * It is false that A=X, B=Y, C=1, and Y=0.
  //
  // Translating these into clauses using DeMorgan's law:
  //
  // * A=0 or X=1
  // * (A xor X) or B=0 or Y=1
  // * (A xor X) or (B xor Y) or C=0 or Y=1
  //
  // Since our arguments are LSB first, in the example
  // we would be given [C, B, A] and [Z, Y, X] as input.
  // We iterate over the first argument starting from
  // the right, and build up a clause by iterating over
  // the xors from the right (note that there may be
  // more xors, because we may have been given [Z, Y, X, W]).
  for(var i = A.length-1; i >= 0; i--) {
    var positive = xors.slice(i+1);
    positive.push(B[i]);
    var negative = [A[i]];
    this.addClause(positive, negative);
  }
};

PBSolver.prototype.atMostOne = function (vars) {
  if (! vars.length) {
    throw new Error("At least one variable required");
  }
  if (vars.length === 1) {
    // do nothing (always satisfied)
  } else if (vars.length <= 5) {
    // Generate O(N^2) clauses of the form:
    // ((not A) or (not B)) and ((not A) or (not C)) and ...
    // This generates a lot of clauses, but it results in fast
    // propagation when solving.  Definitely use it for N <= 5.
    for (var a = 0; a < vars.length; a++) {
      for (var b = a+1; b < vars.length; b++) {
        this.addClause([], [vars[a], vars[b]]);
      }
    }
  } else {
    // Use the "commander variables" technique from:
    // http://www.cs.cmu.edu/~wklieber/papers/2007_efficient-cnf-encoding-for-selecting-1.pdf
    // Group into groups of G (possibly with a short group at the end)
    var G = 3;
    var allCommanders = [];
    for (var i = 0; i < vars.length; i += G) {
      var group = vars.slice(i, i + G);
      this.atMostOne(group);
      var commander = this.genVar();
      this.equalsOr(commander, group);
      allCommanders.push(commander);
    }
    this.atMostOne(allCommanders);
  }
};

PBSolver.prototype.atLeastOne = function (vars) {
  if (! vars.length) {
    throw new Error("At least one variable required");
  }
  this.addClause(vars);
};

PBSolver.prototype.isTrue = function (v) {
  this.addClause([v]);
};

PBSolver.prototype.isFalse = function (v) {
  this.addClause([], [v]);
};

PBSolver.prototype.implies = function (p, q) {
  this.addClause([q], [p]);
};

PBSolver.prototype.impliesNot = function (p, q) {
  this.addClause([], [p, q]);
}

PBSolver.prototype.notPImpliesQ = function (p, q) {
  // (not p) implies q -- same as OR
  this.addClause([p, q]);
};

PBSolver.prototype.notPImpliesNotQ = function (p, q) {
  this.addClause([p], [q]);
};

PBSolver.prototype.getTrue = function () {
  if (! _.has(this._usedVars, "`1")) {
    this.addClause(["`1"]);
  }
  return "`1";
};

PBSolver.prototype.getFalse = function () {
  if (! _.has(this._usedVars, "`0")) {
    this.addClause([], ["`0"]);
  }
  return "`0";
};

var calcSolutionCost = function (solution, costVectorMap, costN) {
  var sum = 0;
  for (var i = 0; i < solution.length; i++) {
    var v = solution[i];
    if (_.has(costVectorMap, v)) {
      sum += (costVectorMap[v][costN] || 0);
    }
  }
  return sum;
};

// Takes a map from variable to an array of costs
// (small non-negative integers).  Among all possible
// solutions, picks the one that minimizes the sum of
// the first elements of the vectors corresponding to
// the "true" variables, and if there are still ties,
// the second elements, and so on.
PBSolver.prototype.optimize = function (costVectorMap) {
  var self = this;

  if (this._solved) {
    throw new Error("Use optimize() instead of solve(), not after it");
  }
  var maxVectorLength = 0;
  var costVars = _.keys(costVectorMap);
  var costVectors = _.values(costVectorMap);
  _.each(costVectors, function (vec) {
    check(vec, [WholeNumber]);
    maxVectorLength = Math.max(maxVectorLength, vec.length);
  });
  // transpose of costVectors.  Length is maxVectorLength.
  var costValues = [];
  for (var i = 0; i < maxVectorLength; i++) {
    var values = [];
    costValues[i] = values;
    for (var j = 0; j < costVectors.length; j++) {
      values[j] = (costVectors[j][i] || 0);
    }
  }

  var solution = this.solve();
  if (! solution) {
    return null;
  }
  if (maxVectorLength === 0) {
    return solution;
  }

  var latestTemporaryVar = null;
  var finalCostVector = new Array(maxVectorLength);
  for (var n = 0; n < maxVectorLength; n++) {
    var solutionCost = calcSolutionCost(solution, costVectorMap, n);
    finalCostVector[n] = solutionCost;
    console.log(finalCostVector);
    var newSolution;
    while ((solutionCost > 0) &&
           (newSolution = this._solveAgainWithConstraint(
             costVars, costValues[n], '<', solutionCost))) {

      solution = newSolution;
      var newCost = calcSolutionCost(solution, costVectorMap, n);
      if (newCost >= solutionCost) {
        /*        var countedVars = [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14, 16, 17, 18, 20, 21, 22, 27, 28, 29, 30, 31, 33, 34, 35, 37, 38, 39, 41, 42, 43, 45, 46, 47, 49, 50, 51, 53, 58, 59, 60, 62, 63, 64, 66, 67, 68, 70, 71, 72, 74, 75, 76, 78, 79, 80, 82, 83, 89, 90, 91, 93, 94, 95, 97, 98, 99, 101, 102, 103, 105, 106, 107, 109, 110, 111, 113, 114, 115, 117, 118, 119, 121, 122, 123, 125, 126, 127, 129, 130, 131, 133, 134, 135, 137, 138, 139, 141, 142, 143, 151, 152, 153, 155, 156, 157, 159, 160, 161, 163, 164, 165, 167, 168, 169, 171, 172, 173, 175, 176, 177, 179, 180, 181, 183, 184, 185, 187, 188, 189, 191, 192, 193, 195, 196, 197, 199, 200, 208, 209, 210, 212, 213, 214, 216, 217, 218, 220, 221, 222, 224, 225, 226, 228, 229, 230, 232, 233, 234, 236, 237, 238, 240, 241, 242, 244, 245, 246, 248, 249, 250, 252, 253, 254, 256, 257, 258, 260, 261, 262, 264, 265, 266, 268, 269, 270, 272, 273, 274, 276, 287, 288, 289, 291, 292, 293, 295, 296, 297, 299, 300, 301, 303, 304, 305, 307, 308, 309, 311, 312, 313, 315, 316, 322, 323, 324, 326, 327, 328, 330, 331, 332, 334, 335, 336, 338, 339, 340, 342, 343, 344, 346, 347, 348, 350, 351, 352, 354, 355, 356, 358, 359, 360, 362, 363, 364, 366, 367, 368, 370, 371, 372, 374, 375, 376, 378, 379, 380, 382, 383, 384, 386, 387, 388, 390, 391, 392, 394, 395, 408, 409, 410, 412, 413, 414, 416, 417, 418, 420, 421, 422, 424, 425, 426, 428, 429, 430, 432, 433, 439, 440, 441, 443, 444, 445, 447, 448, 449, 451, 452, 453, 455, 456, 457, 459, 460, 461, 463, 464, 465, 467, 468, 469, 471, 472, 473, 475, 476, 477, 479, 486, 487, 488, 490, 491, 492, 493, 495, 497, 498, 499, 501, 502, 503, 505, 506, 507, 509, 510, 511, 513, 514, 515, 517, 518, 519, 521, 527, 528, 529, 531, 532, 533, 535, 536, 537, 539, 540, 541, 543, 544, 545, 547, 548, 549, 554, 555, 556, 558, 559, 560, 562, 563, 564, 566, 567, 568, 570, 571, 572, 574, 575, 576, 581, 582, 583, 585, 586, 587, 589, 590, 591, 593, 594, 595, 597, 598, 599, 601, 602, 603, 605, 606, 612, 613, 614, 616, 617, 618, 620, 621, 622, 624, 625, 626, 628, 629, 630, 632, 633, 634, 639, 640, 641, 643, 644, 645, 647, 648, 649, 651, 652, 653, 655, 656, 657, 659, 660, 661, 666, 667, 668, 670, 671, 672, 674, 675, 676, 678, 679, 680, 682, 683, 684, 686, 687, 688, 690, 696, 697, 698, 700, 701, 702, 704, 705, 706, 708, 709, 710, 712, 713, 714, 716, 717, 718, 720, 721, 722, 724, 725, 726, 728, 729, 730, 736, 737, 738, 740, 741, 742, 744, 745, 746, 748, 749, 750, 752, 753, 754, 756, 757, 758, 760, 761, 762, 764, 765, 766, 768, 769, 770, 772, 773, 774, 776, 777, 778, 780, 781, 782, 784, 785, 786, 788, 789, 790, 792, 793, 794, 796, 797, 798, 800, 801, 802, 804, 805, 806, 808, 821, 823, 824, 825, 826, 828, 829, 830, 832, 833, 834, 836, 837, 840, 841, 842, 844, 845, 846, 848, 849, 850, 852, 853, 854, 856, 857, 858, 860, 861, 862, 864, 865, 866, 868, 869, 870, 872, 873, 874, 876, 877, 878, 880, 881, 882, 884, 885, 886, 888, 889, 890, 892, 893, 894, 902, 903, 904, 906, 907, 908, 910, 911, 912, 914, 915, 916, 918, 919, 920, 923, 924, 925, 927, 928, 929, 931, 932, 933, 935, 936, 937, 939, 940, 941, 943, 944, 945, 947, 948, 949, 951, 952, 953, 955, 956, 957, 959, 960, 961, 963, 964, 965, 967, 968, 969, 971, 972, 973, 975, 976, 977, 979, 980, 981, 983, 984, 985, 987, 988, 989, 991, 992, 993, 995, 996, 997, 999, 1000, 1001, 1003];
        var total = 0;
        _.each(countedVars, function (i) {
          if (self._C._getSolutionVariable(i))
            total++;
        });
        console.log("TOTAL:", total);
        var notVars = [80, 82, 83, 89, 90, 91, 93, 94, 95, 97, 98, 99, 101, 102, 103, 105, 106, 107, 109, 110, 111, 113, 114, 115, 117, 118, 119, 121, 122, 123, 125, 126, 127, 129, 130, 131, 133, 134, 135, 137, 138, 139, 141, 142, 143, 151, 152, 153, 155, 156, 157, 159, 160, 161, 163, 164, 165, 167, 168, 169, 171, 172, 173, 175, 176, 177, 179, 180, 181, 183, 184, 185, 187, 188, 189, 191, 192, 193, 195, 196, 197, 199, 200, 208, 209, 210, 212, 213, 214, 216, 217, 218, 220, 221, 222, 224, 225, 226, 228, 229, 230, 232, 233, 234, 236, 237, 238, 240, 241, 242, 244, 245, 246, 248, 249, 250, 252, 253, 254, 256, 257, 258, 260, 261, 262, 264, 265, 266, 268, 269, 270, 272, 273, 274, 276, 287, 288, 289, 291, 292, 293, 295, 296, 297, 299, 300, 301, 303, 304, 305, 307, 308, 309, 311, 312, 313, 315, 316, 322, 323, 324, 326, 327, 328, 330, 331, 332, 334, 335, 336, 338, 339, 340, 342, 343, 344, 346, 347, 348, 350, 351, 352, 354, 355, 356, 358, 359, 360, 362, 363, 364, 366, 367, 368, 370, 371, 372, 374, 375, 376, 378, 379, 380, 382, 383, 384, 386, 387, 388, 390, 391, 392, 394, 395, 408, 409, 410, 412, 413, 414, 416, 417, 418, 420, 421, 422, 424, 425, 426, 428, 429, 430, 432, 433, 439, 440, 441, 443, 444, 445, 447, 448, 449, 451, 452, 455, 456, 457, 459, 460, 461, 463, 464, 465, 467, 468, 469, 471, 472, 473, 475, 476, 477, 479, 486, 487, 488, 490, 491, 492, 493, 495, 498, 499, 501, 502, 503, 505, 506, 507, 509, 510, 511, 513, 515, 517, 518, 519, 521, 603, 605, 606, 688, 690, 696, 713, 714, 716, 717, 718, 720, 721, 722, 724, 725, 726, 728, 729, 730, 796, 797, 798, 800, 801, 802, 804, 821, 823, 825, 826, 828, 829, 830, 832, 833, 834, 836, 837, 840, 841, 842, 844, 845, 846, 848, 849, 850, 852, 853, 854, 856, 857, 858, 860, 861, 862, 864, 865, 866, 868, 869, 870, 872, 873, 874, 876, 877, 878, 880, 881, 882, 884, 885, 886, 888, 889, 890, 892, 893, 894, 902, 903, 904, 906, 907, 908, 910, 911, 912, 914, 915, 916, 918, 919, 920, 948, 949, 951, 952, 953, 956, 957, 959, 960, 961, 963, 964, 965, 967, 968, 969, 971, 972, 973, 975, 976, 977, 979, 980, 981, 983, 984, 985, 987, 988, 989, 991, 992, 993, 995, 996, 997, 999, 1000, 1001, 1003];
        var notTotal = 0;
        _.each(notVars, function (i) {
          if (! self._C._getSolutionVariable(i))
            notTotal++;
        });
        console.log(notTotal, '>= 410 ?');*/
        throw new Error("Assertion failure: cost did not decrease (" +
                        newCost + " >= " + solutionCost + ")");
      }
      solutionCost = newCost;
      finalCostVector[n] = solutionCost;
      console.log(finalCostVector);
    }
    this.addConstraint(costVars, costValues[n], '=', solutionCost);
  }

  return solution;
};

// returns `null` or an array of the variables that are positive,
// in sorted order.
PBSolver.prototype.solve = function () {
  var satisfiable;

  if (! this._solved) {
    satisfiable = this._C._solve();
    this._solved = true;
  } else {
    // already solved; solving again
    satisfiable = this._C._solveAgain(-1);
  }

  if (! satisfiable) {
    return null;
  }

  return this._readOffSolution();
};

PBSolver.prototype._solveAgainWithAssumption = function (v) {
  if (! this._solved) {
    throw new Error("Must already have called solve()");
  }

  var satisfiable = this._native.savingStack(function (native, C) {
    return C._solveAgain(v);
  });

  if (! satisfiable) {
    return null;
  }

  return this._readOffSolution();
};

PBSolver.prototype._dumpClauses = function (withModel, startOffset) {
  startOffset = startOffset || 0;
  var self = this;
  var clauseLogSize = this._C._getClauseLogSize();
  var clauseLogPtr = this._C._getClauseLog();
  var start = (clauseLogPtr>>2) + startOffset;
  var end = (clauseLogPtr>>2) + clauseLogSize;
  var HEAP32 = this._C.HEAP32;
  var clauses = [];
  var newClause = [];
  var numNamedVars = this._C._getNumVariables();
  for (var i = start; i < end; i++) {
    var x = HEAP32[i];
    if (! x) {
      clauses.push(newClause);
      newClause = [];
    } else {
      newClause.push(x);
    }
  }
  var V = function (x) {
    return Math.abs(x) - 1;
  };
  var NOT = function (x) {
    return x < 0;
  };
  var numBad = 0;
  var lines = [];
  _.each(clauses, function (cl) {
    if (withModel) {
      var termTruths = _.map(cl, function (x) {
        var not = NOT(x);
        var v = V(x);
        var t = !! self._C._getSolutionVariable(v);
        if (not) {
          t = ! t;
        }
        return t;
      });
    }
    var stringified = _.map(cl, function (x, i) {
      var not = NOT(x);
      x = V(x);
      if (x < numNamedVars) {
        x = self._C.Pointer_stringify(self._C._getVariableAtIndex(x));
      } else {
        x = '`$' + x;
      }
      var ret = (not?'-':'') + x;
      if (withModel) {
        if (termTruths[i]) {
          ret += "(**)";
        }
      }
      return ret;
    });
    var line = stringified.join(' ');
    if (withModel) {
      var isBad = ! _.any(termTruths);
      if (isBad) {
        numBad++;
      }
      line += ' ' + ((! isBad) ? 'GOOD' : 'BAD');
    }
    lines.push(line);
  });
  console.log(lines.join('\n'));
  console.log(numBad + " bad");
};

PBSolver.prototype._solveAgainWithConstraint =
  function (vars, coeffs, type, rhs) {
    if (! this._solved) {
      throw new Error("Must already have called solve()");
    }

    var conditionalVar = this._C._enterConditional();
    var logOffset = this._C._getClauseLogSize();
    this.addConstraint(vars, coeffs, type, rhs);
    this._C._exitConditional();
    var ret = this._solveAgainWithAssumption(conditionalVar);
//    if (rhs === 24) {
//      this._dumpClauses(true, logOffset);
//    }
    return ret;
  };

PBSolver.prototype._readOffSolution = function () {
  var numVariables = this._C._getNumVariables();
  var trueVariables = [];
  this._native.savingStack(function (native, C) {
    var result = native.allocateBytes(numVariables);
    C._getSolution(result);
    for (var i = 0; i < numVariables; i++) {
//      console.log(i,
//                  C.Pointer_stringify(C._getVariableAtIndex(i)),
//                  C.HEAPU8[result+i]);
      if (C.HEAPU8[result + i]) {
        var varNamePtr = C._getVariableAtIndex(i);
        if (C.HEAPU8[varNamePtr] !== 96) { // Doesn't start with backtick `
          trueVariables.push(C.Pointer_stringify(varNamePtr));
        }
      }
    }
  });

  trueVariables.sort();
  return trueVariables;
};

PBSolver.prototype.genVar = function () {
  return this.validateVar("`" + (this._nextGenVarNum++));
};
