Logic = {};

// WholeNumber: a non-negative integer (0 is allowed)
Logic.WholeNumber = Match.Where(function (x) {
  check(x, Match.Integer);
  return x >= 0;
});

// Term: a variable name or variable number, optionally
// negated (meaning "boolean not").  For example,
// `1`, `-1`, `"foo"`, or `"-foo"`.  All variables have
// internal numbers that start at 1, so "foo" might be
// variable number 1, for example.  Any number of leading
// "-" will be parsed in the string form, but we try to
// keep it to either one or zero of them.
Logic.Term = Match.Where(function (x) {
  if (typeof x === 'number') {
    check(x, Match.Integer);
    return (x !== 0);
  } else {
    check(x, String);
    return !! x;
  }
});

// A Term that is represented as a number, not a name.
// (Subtype of Term.)
Logic._NTerm = Match.Where(function (x) {
  check(x, Match.Integer);
  return (x !== 0);
});

Logic.not = function (term) {
  check(term, Logic.Term);
  if (typeof term === 'number') {
    return -term;
  } else if (term.charAt(0) === '-') {
    return term.slice(1);
  } else {
    return '-' + term;
  }
};

Logic.Formula = function () {};
// Returns a list of clauses that together require the
// Formula to be true.  (Does not add them to the solver.)
Logic.Formula.prototype._genTrue = function (solver) { return []; };
// Returns a list of clauses that together require the
// Formula to be false.
Logic.Formula.prototype._genFalse = function (solver) { return []; };

// Like `formula._genTrue(solver)` but works on Terms too (in effect
// promoting them to formulas).
Logic.Formula._genTrue = function (formula, solver) {
  if (formula instanceof Logic.Formula) {
    return formula._genTrue(solver);
  } else if (Match.test(formula, Logic.Term)) {
    var t = solver._toN(formula);
    return [new Logic.Clause([t])];
  } else {
    throw new Error("Expected a Formula or Term");
  }
};

Logic.Formula._genFalse = function (formula, solver) {
  if (formula instanceof Logic.Formula) {
    return formula._genFalse(solver);
  } else if (Match.test(formula, Logic.Term)) {
    var t = solver._toN(formula);
    return [new Logic.Clause([-t])];
  } else {
    throw new Error("Expected a Formula or Term");
  }
};

Logic.Clause = function (termOrArray/*, ...*/) {
  var terms = _.flatten(arguments);
  check(terms, [Logic._NTerm]);
  this.terms = terms; // immutable [_NTerm]
};

Logic.Solver = function () {
  this.clauses = []; // mutable [Clause]
  this._num2name = [null]; // no 0th var
  this._name2num = {}; // (' '+vname) -> vnum

  // true and false
  this._F = this.getVarNum("`F", true); // 1
  this._T = this.getVarNum("`T", true); // 2
  this._F_used = false;
  this._T_used = false;
  // (it's important that these clauses are elements 0 and 1
  // of the clauses array)
  this.clauses.push(new Logic.Clause(-this._F));
  this.clauses.push(new Logic.Clause(this._T));
};

// Get a var number for vname, assigning it a number if it is new.
Logic.Solver.prototype.getVarNum = function (vname, _internal) {
  var key = ' '+vname;
  if (_.has(this._name2num, key)) {
    return this._name2num[key];
  } else {
    if (vname.charAt(0) === "`" && ! _internal) {
      throw new Error("Only generated variable names can start with `");
    }
    var vnum = this._num2name.length;
    this._name2num[key] = vnum;
    this._num2name.push(vname);
    return vnum;
  }
};

// Converts Terms to _NTerms
Logic.Solver.prototype._toN = function (t) {
  var self = this;

  if (_.isArray(t)) {
    return _.map(t, function (tt) {
      return self._toN(tt);
    });
  }

  if (typeof t === 'number') {
    return t;
  } else if (typeof t === 'string') {
    var not = false;
    while (t.charAt(0) === '-') {
      t = t.slice(1);
      not = ! not;
    }
    var n = self.getVarNum(t);
    return (not ? -n : n);
  } else {
    throw new Error("Expected number or string");
  }
};

Logic.Solver.prototype._addClause = function (cls) {
  check(cls, Logic.Clause);

  if (_.contains(cls.terms, 1)) {
    this._F_used = true;
  }
  if (_.contains(cls.terms, 2)) {
    this._T_used = true;
  }
  this.clauses.push(cls);
};

Logic.Solver.prototype._addClauses = function (array) {
  check(array, [Logic.Clause]);
  var self = this;
  _.each(array, function (cls) { self._addClause(cls); });
};

Logic.Solver.prototype.require = function (formulaOrArray/*, ...*/) {
  var self = this;
  _.each(_.flatten(arguments), function (f) {
    self._addClauses(Logic.Formula._genTrue(f, self));
  });
};

Logic.Solver.prototype.forbid = function (formulaOrArray/*, ...*/) {
  var self = this;
  _.each(_.flatten(arguments), function (f) {
    self._addClauses(Logic.Formula._genFalse(f, self));
  });
};

Logic.Solver.prototype._clauseData = function () {
  var clauses = _.pluck(this.clauses, 'terms');
  if (! this._T_used) {
    clauses.splice(1, 1);
  }
  if (! this._F_used) {
    clauses.splice(0, 1);
  }
  return clauses;
};

Logic.or = function (termOrArray/*, ...*/) {
  return new Logic.OrFormula(_.flatten(arguments));
};
Logic.OrFormula = function (terms) {
  check(terms, [Logic.Term]);
  this.terms = terms;
};
Meteor._inherits(Logic.OrFormula, Logic.Formula);
Logic.OrFormula.prototype._genTrue = function (solver) {
  return [new Logic.Clause(solver._toN(this.terms))];
};
//Logic.OrFormula.prototype._genFalse = function (solver) {
  // XXX
//};
