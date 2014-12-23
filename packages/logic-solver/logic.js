Logic = {};

// WholeNumber: a non-negative integer (0 is allowed)
Logic.WholeNumber = Match.Where(function (x) {
  return Match.test(x, Match.Integer) && x >= 0;
});

Logic.NumTerm = Match.Where(function (x) {
  return Match.test(x, Match.Integer) && x !== 0;
});

Logic.NameTerm = Match.Where(function (x) {
  return (typeof x === 'string') && (!! x);
});

// Term: a variable name or variable number, optionally
// negated (meaning "boolean not").  For example,
// `1`, `-1`, `"foo"`, or `"-foo"`.  All variables have
// internal numbers that start at 1, so "foo" might be
// variable number 1, for example.  Any number of leading
// "-" will be parsed in the string form, but we try to
// keep it to either one or zero of them.
Logic.Term = Match.OneOf(Logic.NameTerm, Logic.NumTerm);

// Takes a Formula or Term, returns a Formula or Term.
// Unlike other operators, if you give it a Term,
// you will get a Term back (of the same type, NameTerm
// or NumTerm).
Logic.not = function (operand) {
  check(operand, Logic.FormulaOrTerm);
  if (operand instanceof Logic.Formula) {
    return new Logic.NotFormula(operand);
  } else {
    // Term
    if (typeof operand === 'number') {
      return -operand;
    } else if (operand.charAt(0) === '-') {
      return operand.slice(1);
    } else {
      return '-' + operand;
    }
  }
};

Logic.TRUE = "$T";
Logic.FALSE = "$F";

Logic.Formula = function () {};
// Returns a list of clauses that together require the
// Formula to be true.  (Does not add them to the solver.)
Logic.Formula.prototype._genTrue = function (makeClause) { return []; };
// Returns a list of clauses that together require the
// Formula to be false.
Logic.Formula.prototype._genFalse = function (makeClause) { return []; };
// All Formulas have a globally-unique id so that Solvers can track them.
// It is assigned lazily.
Logic.Formula._nextGuid = 1;
Logic.Formula.prototype._guid = null;
Logic.Formula.prototype.guid = function () {
  if (this._guid === null) {
    this._guid = Logic.Formula._nextGuid++;
  }
  return this._guid;
};

Logic.FormulaOrTerm = Match.OneOf(Logic.Formula, Logic.Term);

Logic.Clause = function (termOrArray/*, ...*/) {
  var terms = _.flatten(arguments);
  check(terms, [Logic.NumTerm]);
  this.terms = terms; // immutable [NumTerm]
};

// Returns a new Clause with the extra term or terms appended
Logic.Clause.prototype.append = function (termOrArray/*, ...*/) {
  return new Logic.Clause(this.terms.concat(_.flatten(arguments)));
};

Logic.Solver = function () {
  this.clauses = []; // mutable [Clause]
  this._num2name = [null]; // no 0th var
  this._name2num = {}; // (' '+vname) -> vnum

  // true and false
  this._F = this.getVarNum("$F", true); // 1
  this._T = this.getVarNum("$T", true); // 2
  this._F_used = false;
  this._T_used = false;
  // (it's important that these clauses are elements 0 and 1
  // of the clauses array)
  this.clauses.push(new Logic.Clause(-this._F));
  this.clauses.push(new Logic.Clause(this._T));

  this._formulaInfo = {}; // Formula guid -> info object
  // For generating formula names like "or1", "or2", "and1", "and2"
  this._nextFormulaNumByType = {}; // Formula type -> next var id
  // Map of Formulas whose info has `false` for either
  // `occursPositively` or `occursNegatively`
  this._ungeneratedFormulas = {}; // varNum -> Formula
};

// Get a var number for vname, assigning it a number if it is new.
Logic.Solver.prototype.getVarNum = function (vname, _internal) {
  var key = ' '+vname;
  if (_.has(this._name2num, key)) {
    return this._name2num[key];
  } else {
    if (vname.charAt(0) === "$" && ! _internal) {
      throw new Error("Only generated variable names can start with $");
    }
    var vnum = this._num2name.length;
    this._name2num[key] = vnum;
    this._num2name.push(vname);
    return vnum;
  }
};

Logic.Solver.prototype.getVarName = function (vnum) {
  check(vnum, Match.Integer);
  var num2name = this._num2name;
  if (vnum < 1 || vnum >= num2name.length) {
    throw new Error("Bad variable num: " + vnum);
  } else {
    return num2name[vnum];
  }
};

// Converts Terms to NumTerms (if they aren't already).  This is done
// when a Formula creates Clauses for a Solver, since Clauses require
// NumTerms.  Takes a Term or an array.  For example, [-3, "-foo"] might
// become [-3, -4].
Logic.Solver.prototype.toNumTerm = function (t) {
  var self = this;

  if (_.isArray(t)) {
    check(t, [Logic.Term]);
    return _.map(t, _.bind(self.toNumTerm, self));
  } else {
    check(t, Logic.Term);
  }

  if (typeof t === 'number') {
    return t;
  } else { // string
    var not = false;
    while (t.charAt(0) === '-') {
      t = t.slice(1);
      not = ! not;
    }
    var n = self.getVarNum(t);
    return (not ? -n : n);
  }
};

// Converts Terms to NameTerms (if they aren't already).
// Takes a Term or an array.
Logic.Solver.prototype.toNameTerm = function (t) {
  var self = this;

  if (_.isArray(t)) {
    check(t, [Logic.Term]);
    return _.map(t, _.bind(self.toNameTerm, self));
  } else {
    check(t, Logic.Term);
  }

  if (typeof t === 'string') {
    // canonicalize, removing leading "--"
    while (t.slice(0, 2) == '--') {
      t = t.slice(2);
    }
    return t;
  } else { // number
    var not = false;
    if (t < 0) {
      not = true;
      t = -t;
    }
    t = self.getVarName(t);
    if (not) {
      t = '-' + t;
    }
    return t;
  }
};

Logic.Solver.prototype._addClause = function (cls, _internal) {
  var self = this;

  check(cls, Logic.Clause);

  if (! _internal) {
    var usedF = false;
    var usedT = false;

    _.each(cls.terms, function (t) {
      var v = (t < 0) ? -t : t;
      if (v === 1) {
        usedF = true;
      } else if (v === 2) {
        usedT = true;
      } else if (v < 1 || v >= self._num2name.length) {
        throw new Error("Bad variable number: " + v);
      } else if (_.has(self._ungeneratedFormulas, v)) {
        // using a Formula's var, maybe have to generate clauses
        // for the Formula
        var formula = self._ungeneratedFormulas[v];
        var info = self._getFormulaInfo(formula);
        var positive = t > 0;
        if (positive && ! info.occursPositively) {
          // generate clauses for the formula.
          // Eg, if we use variable `X` which represents the formula
          // `A v B`, add the clause `A v B v -X`.
          info.occursPositively = true;
          var clauses = formula._genTrue(_.bind(self._makeClause, self));
          self._addClauses(_.map(clauses, function (clause) {
            return clause.append(-v);
          }), true);
        } else if ((! positive) && ! info.occursNegatively) {
          // Eg, if we have the term `-X` where `X` represents the
          // formula `A v B`, add the clauses `-A v X` and `-B v X`.
          info.occursNegatively = true;
          var clauses = formula._genFalse(_.bind(self._makeClause, self));
          self._addClauses(_.map(clauses, function (clause) {
            return clause.append(v);
          }), true);
        }
        if (info.occursPositively && info.occursNegatively) {
          delete self._ungeneratedFormulas[v];
        }
      }
    });

    this._F_used = (this._F_used || usedF);
    this._T_used = (this._T_used || usedT);
  }

  this.clauses.push(cls);
};

Logic.Solver.prototype._addClauses = function (array, _internal) {
  check(array, [Logic.Clause]);
  var self = this;
  _.each(array, function (cls) { self._addClause(cls, _internal); });
};

Logic.Solver.prototype.require = function (formulaOrArray/*, ...*/) {
  var self = this;
  var formulas = _.flatten(arguments);
  check(formulas, [Logic.FormulaOrTerm]);
  _.each(_.flatten(arguments), function (f) {
    if (f instanceof Logic.NotFormula) {
      self.forbid(f.operand);
    } else if (f instanceof Logic.Formula) {
      var info = self._getFormulaInfo(f);
      if (info.varNum !== null) {
        self._addClause(new Logic.Clause(info.varNum));
      } else {
        self._addClauses(f._genTrue(_.bind(self._makeClause, self)));
      }
    } else if (Match.test(f, Logic.Term)) {
      self._addClause(new Logic.Clause(self.toNumTerm(f)));
    }
  });
};

Logic.Solver.prototype.forbid = function (formulaOrArray/*, ...*/) {
  var self = this;
  var formulas = _.flatten(arguments);
  check(formulas, [Logic.FormulaOrTerm]);
  _.each(_.flatten(arguments), function (f) {
    if (f instanceof Logic.NotFormula) {
      self.require(f.operand);
    } else if (f instanceof Logic.Formula) {
      var info = self._getFormulaInfo(f);
      if (info.varNum !== null) {
        self._addClause(new Logic.Clause(-info.varNum));
      } else {
        self._addClauses(f._genFalse(_.bind(self._makeClause, self)));
      }
    } else if (Match.test(f, Logic.Term)) {
      self._addClause(new Logic.Clause(-self.toNumTerm(f)));
    }
  });
};

// Get clause data as an array of arrays of integers,
// for testing and debugging purposes.
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

// Get clause data as an array of human-readable strings,
// for testing and debugging purposes.
// A clause might look like "A v -B" (where "v" represents
// and OR operator).
Logic.Solver.prototype._clauseStrings = function () {
  var self = this;
  var clauseData = self._clauseData();
  return _.map(clauseData, function (clause) {
    return _.map(clause, function (nterm) {
      var str = self.toNameTerm(nterm);
      if (/\s/.test(str)) {
        // write name in quotes for readability.  we don't bother
        // making this string machine-parsable in the general case.
        var sign = '';
        if (str.charAt(0) === '-') {
          // temporarily remove '-'
          sign = '-';
          str = str.slice(1);
        }
        str = sign + '"' + str + '"';
      }
      return str;
    }).join(' v ');
  });
};

Logic.Solver.prototype._getFormulaInfo = function (formula) {
  var self = this;
  var guid = formula.guid();
  if (! self._formulaInfo[guid]) {
    self._formulaInfo[guid] = {
      // We generate a variable when a Formula is used.  If the
      // variable is only used positively or only used negatively, we
      // can generate fewer clauses, using a method that relies on the
      // fact that the generated variable is unobservable so we can
      // get away without a bidirectional implication.
      varName: null,
      varNum: null,
      occursPositively: false,
      occursNegatively: false
    };
  }
  return self._formulaInfo[guid];
};

// Takes a Formula or an array of Formulas, returns a NumTerm.
Logic.Solver.prototype._formulaToTerm = function (formula) {
  var self = this;

  if (_.isArray(formula)) {
    check(formula, [Logic.FormulaOrTerm]);
    return _.map(formula, _.bind(self._formulaToTerm, self));
  } else {
    check(formula, Logic.FormulaOrTerm);
  }

  if (formula instanceof Logic.NotFormula) {
    // shortcut that avoids creating a variable called
    // something like "not1" when you use Logic.not(formula).
    return Logic.not(self._formulaToTerm(formula.operand));
  } else if (formula instanceof Logic.Formula) {
    var info = this._getFormulaInfo(formula);
    if (info.varNum === null) {
      // generate a Solver-local formula name like "or1"
      var type = formula.type;
      if (! this._nextFormulaNumByType[type]) {
        this._nextFormulaNumByType[type] = 1;
      }
      var numForVarName = this._nextFormulaNumByType[type]++;
      info.varName = "$" + formula.type + numForVarName;
      info.varNum = this.getVarNum(info.varName, true);
      this._ungeneratedFormulas[info.varNum] = formula;
    }
    return info.varNum;
  } else {
    // formula is a Term
    return self.toNumTerm(formula);
  }
};

Logic.Solver.prototype._makeClause = function (formulaOrArray/*, ...*/) {
  var formulas = _.flatten(arguments);
  check(formulas, [Logic.FormulaOrTerm]);
  return new Logic.Clause(this._formulaToTerm(formulas));
};

Logic._defineFormula = function (constructor, typeName, methods) {
  check(constructor, Function);
  check(typeName, String);
  Meteor._inherits(constructor, Logic.Formula);
  constructor.prototype.type = typeName;
  if (methods) {
    _.extend(constructor.prototype, methods);
  }
};

Logic.or = function (termOrArray/*, ...*/) {
  return new Logic.OrFormula(_.flatten(arguments));
};

Logic.OrFormula = function (operands) {
  check(operands, [Logic.FormulaOrTerm]);
  this.operands = operands;
};

Logic._defineFormula(Logic.OrFormula, 'or', {
  _genTrue: function (makeClause) {
    // eg A v B v C
    return [makeClause(this.operands)];
  },
  _genFalse: function (makeClause) {
    // eg -A; -B; -C
    return _.map(this.operands, function (formula) {
      return makeClause(Logic.not(formula));
    });
  }
});

Logic.NotFormula = function (operand) {
  check(operand, Logic.FormulaOrTerm);
  this.operand = operand;
};

Logic._defineFormula(Logic.NotFormula, 'not', {
  _genTrue: function (makeClause) {
    throw new Error("'not' is special and doesn't gen");
  },
  _genFalse: function (makeClause) {
    throw new Error("'not' is special and doesn't gen");
  }
});
