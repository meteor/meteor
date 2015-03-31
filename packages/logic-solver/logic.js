Logic = {};

// Disabling type checks speeds things up a LOT (several times faster).
// Type checks are disabled when `_check` is set to a no-op function
// instead of `check`.
_check = check;
Logic._disablingTypeChecks = function (f) {
  var oldCheck = _check;
  try {
    _check = function () {};
    return f();
  } finally {
    _check = oldCheck;
  }
};

Logic._MiniSat = MiniSat; // Expose for testing and poking around

////////// Type Declarations

// All variables have a name and a number.  The number is mainly used
// internally, and it's what's given to MiniSat.  Names and numbers
// are interchangeable, which is convenient for doing manipulation
// of terms in a way that works before or after variable names are
// converted to numbers.

// Term: a variable name or variable number, optionally
// negated (meaning "boolean not").  For example,
// `1`, `-1`, `"foo"`, or `"-foo"`.  All variables have
// internal numbers that start at 1, so "foo" might be
// variable number 1, for example.  Any number of leading
// "-" will be parsed in the string form, but we try to
// keep it to either one or zero of them.

Logic.NumTerm = Match.Where(function (x) {
  return Match.test(x, Match.Integer) && x !== 0;
});

Logic.NameTerm = Match.Where(function (x) {
  // NameTerm must not be empty, or just `-` characters, or
  // look like a number.  Specifically, it can't be zero or
  // more `-` followed by zero or more digits.
  return (typeof x === 'string') &&
    ! /^-*[0-9]*$/.test(x);
});

Logic.Term = Match.OneOf(Logic.NameTerm, Logic.NumTerm);

// WholeNumber: a non-negative integer (0 is allowed)
Logic.WholeNumber = Match.Where(function (x) {
  return Match.test(x, Match.Integer) && x >= 0;
});

// Abstract base class.  Subclasses are created using _defineFormula.
Logic.Formula = function () {};

Logic.FormulaOrTerm = Match.OneOf(Logic.Formula, Logic.Term);

////////// End Type Declarations


// Takes a Formula or Term, returns a Formula or Term.
// Unlike other operators, if you give it a Term,
// you will get a Term back (of the same type, NameTerm
// or NumTerm).
Logic.not = function (operand) {
  _check(operand, Logic.FormulaOrTerm);
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

Logic.NAME_FALSE = "$F";
Logic.NAME_TRUE = "$T";
Logic.NUM_FALSE = 1;
Logic.NUM_TRUE = 2;

Logic.TRUE = Logic.NAME_TRUE;
Logic.FALSE = Logic.NAME_FALSE;

Logic._defineFormula = function (constructor, typeName, methods) {
  _check(constructor, Function);
  _check(typeName, String);
  Meteor._inherits(constructor, Logic.Formula);
  constructor.prototype.type = typeName;
  if (methods) {
    _.extend(constructor.prototype, methods);
  }
};

// Returns a list of Clauses that together require the Formula to be
// true, or false (depending on isTrue; both cases must be
// implemented).  A single Clause may also be returned.  The
// implementation should call the termifier to convert terms and
// formulas to NumTerms specific to a solver instance, and use them to
// construct a Logic.Clause.
Logic.Formula.prototype.generateClauses = function (isTrue, termifier) {
  throw new Error("Cannot generate this Formula; it must be expanded");
};
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

// A "clause" is a disjunction of terms, e.g. "A or B or (not C)",
// which we write "A v B v -C".  Logic.Clause is mainly an internal
// Solver data structure, which is the final result of formula
// generation and mapping variable names to numbers, before passing
// the clauses to MiniSat.
Logic.Clause = function (/*formulaOrArray, ...*/) {
  var terms = _.flatten(arguments);
  _check(terms, [Logic.NumTerm]);
  this.terms = terms; // immutable [NumTerm]
};

// Returns a new Clause with the extra term or terms appended
Logic.Clause.prototype.append = function (/*formulaOrArray, ...*/) {
  return new Logic.Clause(this.terms.concat(_.flatten(arguments)));
};

var FormulaInfo = function () {
  // We generate a variable when a Formula is used.
  this.varName = null; // string name of variable
  this.varNum = null; // number of variable (always positive)

  // A formula variable that is used only in the positive or only
  // in the negative doesn't need the full set of clauses that
  // establish a bidirectional implication between the formula and the
  // variable.  For example, in the formula `Logic.or("A", "B")`, with the
  // formula variable `$or1`, the full set of clauses is `A v B v
  // -$or1; -A v $or1; -B v $or1`.  If both `$or1` and `-$or1` appear
  // elsewhere in the set of clauses, then all three of these clauses
  // are required.  However, somewhat surprisingly, if only `$or1` appears,
  // then only the first is necessary.  If only `-$or1` appears, then only
  // the second and third are necessary.
  //
  // Suppose the formula A v B is represented by the variable $or1,
  // and $or1 is only used positively. It's important that A v B being
  // false forces $or1 to be false, so that when $or1 is used it has
  // the appropriate effect. For example, if we have the clause $or1 v
  // C, then A v B being false should force $or1 to be false, which
  // forces C to be true. So we generate the clause A v B v
  // -$or1. (The implications of this clause are: If A v B is false,
  // $or1 must be false. If $or1 is true, A v B must be true.)
  //
  // However, in the case where A v B is true, we don't actually
  // need to insist that the solver set $or1 to true, as long as we
  // are ok with relaxing the relationship between A v B and $or1
  // and getting a "wrong" value for $or1 in the solution. Suppose
  // the solver goes to work and at some point determines A v B to
  // be true. It could set $or1 to true, satisfying all the clauses
  // where it appears, or it could set $or1 to false, which only
  // constrains the solution space and doesn't open up any new
  // solutions for other variables. If the solver happens to find a
  // solution where A v B is true and $or1 is false, we know there
  // is a similar solution that makes all the same assignments
  // except it assigns $or1 to true.
  //
  // If a formula is used only negatively, a similar argument applies
  // but with signs flipped, and if it is used both positively and
  // negatively, both kinds of clauses must be generated.
  //
  // See the mention of "polarity" in the MiniSat+ paper
  // (http://minisat.se/downloads/MiniSat+.pdf).
  //
  // These flags are set when generation has been done for the positive
  // case or the negative case, so that we only generate each one once.
  this.occursPositively = false;
  this.occursNegatively = false;

  // If a Formula has been directly required or forbidden, we can
  // replace it by TRUE or FALSE in subsequent clauses.  Track the
  // information here.
  this.isRequired = false;
  this.isForbidden = false;
};


// The "termifier" interface is provided to a Formula's
// generateClauses method, which must use it to generate Clause
// objects.
//
// The reason for this approach is that it gives the Formula control
// over the clauses returned, but it gives the Solver control over
// Formula generation.
Logic.Termifier = function (solver) {
  this.solver = solver;
};

// The main entry point, the `clause` method takes a list of
// FormulaOrTerms and converts it to a Clause containing NumTerms, *by
// replacing Formulas with their variables*, creating the variable if
// necessary.  For example, if an OrFormula is represented by the
// variable `$or1`, it will be replaced by the numeric version of
// `$or1` to make the Clause.  When the Clause is actually used, it
// will trigger generation of the clauses that relate `$or1` to the
// operands of the OrFormula.
Logic.Termifier.prototype.clause = function (/*args*/) {
  var self = this;
  var formulas = _.flatten(arguments);
  _check(formulas, [Logic.FormulaOrTerm]);
  return new Logic.Clause(_.map(formulas, function (f) {
    return self.term(f);
  }));
};

// The `term` method performs the mapping from FormulaOrTerm to
// NumTerm.  It's called by `clause` and could be called directly
// from a Formula's generateClauses if it was useful for some
// reason.
Logic.Termifier.prototype.term = function (formula) {
  return this.solver._formulaToTerm(formula);
};

// The `generate` method generates clauses for a Formula (or
// Term).  It should be used carefully, because it works quite
// differently from passing a Formula into `clause`, which is the
// normal way for one Formula to refer to another.  When you use a
// Formula in `clause`, it is replaced by the Formula's variable,
// and the Solver handles generating the Formula's clauses once.
// When you use `generate`, this system is bypassed, and the
// Formula's generateClauses method is called pretty much directly,
// returning the array of Clauses.
Logic.Termifier.prototype.generate = function (isTrue, formula) {
  return this.solver._generateFormula(isTrue, formula, this);
};


Logic.Solver = function () {
  var self = this;

  self.clauses = []; // mutable [Clause]
  self._num2name = [null]; // no 0th var
  self._name2num = {}; // (' '+vname) -> vnum

  // true and false
  var F = self.getVarNum(Logic.NAME_FALSE, true); // 1
  var T = self.getVarNum(Logic.NAME_TRUE, true); // 2
  if (F !== Logic.NUM_FALSE || T !== Logic.NUM_TRUE) {
    throw new Error("Assertion failure: $T and $F have wrong numeric value");
  }
  self._F_used = false;
  self._T_used = false;
  // It's important that these clauses are elements 0 and 1
  // of the clauses array, so that they can optionally be stripped
  // off.  For example, _clauseData takes advantage of this fact.
  self.clauses.push(new Logic.Clause(-Logic.NUM_FALSE));
  self.clauses.push(new Logic.Clause(Logic.NUM_TRUE));

  self._formulaInfo = {}; // Formula guid -> FormulaInfo
  // For generating formula variables like "$or1", "$or2", "$and1", "$and2"
  self._nextFormulaNumByType = {}; // Formula type -> next var id
  // Map of Formulas whose info has `false` for either
  // `occursPositively` or `occursNegatively`
  self._ungeneratedFormulas = {}; // varNum -> Formula

  self._numClausesAddedToMiniSat = 0;
  self._unsat = false; // once true, no solution henceforth
  self._minisat = new MiniSat(); // this takes some time

  self._termifier = new Logic.Termifier(self);
};

// Get a var number for vname, assigning it a number if it is new.
// Setting "_createInternals" to true grants the ability to create $ variables.
// Setting "_noCreate" to true causes the function to return 0 instead of
// creating a new variable.
Logic.Solver.prototype.getVarNum = function (vname, _createInternals, _noCreate) {
  var key = ' '+vname;
  if (_.has(this._name2num, key)) {
    return this._name2num[key];
  } else if (_noCreate) {
    return 0;
  } else {
    if (vname.charAt(0) === "$" && ! _createInternals) {
      throw new Error("Only generated variable names can start with $");
    }
    var vnum = this._num2name.length;
    this._name2num[key] = vnum;
    this._num2name.push(vname);
    return vnum;
  }
};

Logic.Solver.prototype.getVarName = function (vnum) {
  _check(vnum, Match.Integer);
  var num2name = this._num2name;
  if (vnum < 1 || vnum >= num2name.length) {
    throw new Error("Bad variable num: " + vnum);
  } else {
    return num2name[vnum];
  }
};

// Converts a Term to a NumTerm (if it isn't already).  This is done
// when a Formula creates Clauses for a Solver, since Clauses require
// NumTerms.  NumTerms stay the same, while a NameTerm like "-foo"
// might become (say) the number -3.  If a NameTerm names a variable
// that doesn't exist, it is automatically created, unless noCreate
// is passed, in which case 0 is returned instead.
Logic.Solver.prototype.toNumTerm = function (t, noCreate) {
  var self = this;

  _check(t, Logic.Term);

  if (typeof t === 'number') {
    return t;
  } else { // string
    var not = false;
    while (t.charAt(0) === '-') {
      t = t.slice(1);
      not = ! not;
    }
    var n = self.getVarNum(t, false, noCreate);
    if (! n) {
      return 0; // must be the noCreate case
    } else {
      return (not ? -n : n);
    }
  }
};

// Converts a Term to a NameTerm (if it isn't already).
Logic.Solver.prototype.toNameTerm = function (t) {
  var self = this;

  _check(t, Logic.Term);

  if (typeof t === 'string') {
    // canonicalize, removing leading "--"
    while (t.slice(0, 2) === '--') {
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

Logic.Solver.prototype._addClause = function (cls, _extraTerms,
                                              _useTermOverride) {
  var self = this;

  _check(cls, Logic.Clause);

  var extraTerms = null;
  if (_extraTerms) {
    extraTerms = _extraTerms;
    _check(extraTerms, [Logic.NumTerm]);
  }

  var usedF = false;
  var usedT = false;

  var numRealTerms = cls.terms.length;
  if (extraTerms) {
    // extraTerms are added to the clause as is.  Formula variables in
    // extraTerms do not cause Formula clause generation, which is
    // necessary to implement Formula clause generation.
    cls = cls.append(extraTerms);
  }

  for (var i = 0; i < cls.terms.length; i++) {
    var t = cls.terms[i];
    var v = (t < 0) ? -t : t;
    if (v === Logic.NUM_FALSE) {
      usedF = true;
    } else if (v === Logic.NUM_TRUE) {
      usedT = true;
    } else if (v < 1 || v >= self._num2name.length) {
      throw new Error("Bad variable number: " + v);
    } else if (i < numRealTerms) {
      if (_useTermOverride) {
        _useTermOverride(t);
      } else {
        self._useFormulaTerm(t);
      }
    }
  }

  this._F_used = (this._F_used || usedF);
  this._T_used = (this._T_used || usedT);

  this.clauses.push(cls);
};

// When we actually use a Formula variable, generate clauses for it,
// based on whether the usage is positive or negative.  For example,
// if the Formula `Logic.or("X", "Y")` is represented by `$or1`, which
// is variable number 5, then when you actually use 5 or -5 in a clause,
// the clauses "X v Y v -5" (when you use 5) or "-X v 5; -Y v 5"
// (when you use -5) will be generated.  The clause "X v Y v -5"
// is equivalent to "5 => X v Y" (or -(X v Y) => -5), while the clauses
// "-X v 5; -Y v 5" are equivalent to "-5 => -X; -5 => -Y" (or
// "X => 5; Y => 5").

Logic.Solver.prototype._useFormulaTerm = function (t, _addClausesOverride) {
  var self = this;
  _check(t, Logic.NumTerm);
  var v = (t < 0) ? -t : t;

  if (! _.has(self._ungeneratedFormulas, v)) {
    return;
  }

  // using a Formula's var; maybe have to generate clauses
  // for the Formula
  var formula = self._ungeneratedFormulas[v];
  var info = self._getFormulaInfo(formula);
  var positive = t > 0;

  // To avoid overflowing the JS stack, defer calls to addClause.
  // The way we get overflows is when Formulas are deeply nested
  // (which happens naturally when you call Logic.sum or
  // Logic.weightedSum on a long list of terms), which causes
  // addClause to call useFormulaTerm to call addClause, and so
  // on.  Approach:  The outermost useFormulaTerm keeps a list
  // of clauses to add, and then adds them in a loop using a
  // special argument to addClause that passes a special argument
  // to useFormulaTerm that causes those clauses to go into the
  // list too.  Code outside of `_useFormulaTerm` and `_addClause(s)`
  // does not have to pass these special arguments to call them.
  var deferredAddClauses = null;
  var addClauses;
  if (! _addClausesOverride) {
    deferredAddClauses = [];
    addClauses = function (clauses, extraTerms) {
      deferredAddClauses.push({clauses: clauses,
                               extraTerms: extraTerms});
    };
  } else {
    addClauses = _addClausesOverride;
  }

  if (positive && ! info.occursPositively) {
    // generate clauses for the formula.
    // Eg, if we use variable `X` which represents the formula
    // `A v B`, add the clause `A v B v -X`.
    // By using the extraTerms argument to addClauses, we avoid
    // treating this as a negative occurrence of X.
    info.occursPositively = true;
    var clauses = self._generateFormula(true, formula);
    addClauses(clauses, [-v]);
  } else if ((! positive) && ! info.occursNegatively) {
    // Eg, if we have the term `-X` where `X` represents the
    // formula `A v B`, add the clauses `-A v X` and `-B v X`.
    // By using the extraTerms argument to addClauses, we avoid
    // treating this as a positive occurrence of X.
    info.occursNegatively = true;
    var clauses = self._generateFormula(false, formula);
    addClauses(clauses, [v]);
  }
  if (info.occursPositively && info.occursNegatively) {
    delete self._ungeneratedFormulas[v];
  }

  if (! (deferredAddClauses && deferredAddClauses.length)) {
    return;
  }

  var useTerm = function (t) {
    self._useFormulaTerm(t, addClauses);
  };
  // This is the loop that turns recursion into iteration.
  // When addClauses calls useTerm, which calls useFormulaTerm,
  // the nested useFormulaTerm will add any clauses to our
  // own deferredAddClauses list.
  while (deferredAddClauses.length) {
    var next = deferredAddClauses.pop();
    self._addClauses(next.clauses, next.extraTerms, useTerm);
  }
};

Logic.Solver.prototype._addClauses = function (array, _extraTerms,
                                               _useTermOverride) {
  _check(array, [Logic.Clause]);
  var self = this;
  _.each(array, function (cls) {
    self._addClause(cls, _extraTerms, _useTermOverride);
  });
};

Logic.Solver.prototype.require = function (/*formulaOrArray, ...*/) {
  this._requireForbidImpl(true, _.flatten(arguments));
};

Logic.Solver.prototype.forbid = function (/*formulaOrArray, ...*/) {
  this._requireForbidImpl(false, _.flatten(arguments));
};

Logic.Solver.prototype._requireForbidImpl = function (isRequire, formulas) {
  var self = this;
  _check(formulas, [Logic.FormulaOrTerm]);
  _.each(formulas, function (f) {
    if (f instanceof Logic.NotFormula) {
      self._requireForbidImpl(!isRequire, [f.operand]);
    } else if (f instanceof Logic.Formula) {
      var info = self._getFormulaInfo(f);
      if (info.varNum !== null) {
        var sign = isRequire ? 1 : -1;
        self._addClause(new Logic.Clause(sign*info.varNum));
      } else {
        self._addClauses(self._generateFormula(isRequire, f));
      }
      if (isRequire) {
        info.isRequired = true;
      } else {
        info.isForbidden = true;
      }
    } else {
      self._addClauses(self._generateFormula(isRequire, f));
    }
  });
};

Logic.Solver.prototype._generateFormula = function (isTrue, formula, _termifier) {
  var self = this;
  _check(formula, Logic.FormulaOrTerm);

  if (formula instanceof Logic.NotFormula) {
    return self._generateFormula(!isTrue, formula.operand);
  } else if (formula instanceof Logic.Formula) {
    var info = self._getFormulaInfo(formula);
    if ((isTrue && info.isRequired) ||
        (!isTrue && info.isForbidden)) {
      return [];
      } else if ((isTrue && info.isForbidden) ||
                 (!isTrue && info.isRequired)) {
        return [new Logic.Clause()]; // never satisfied clause
      } else {
        var ret = formula.generateClauses(isTrue,
                                          _termifier || self._termifier);
        return _.isArray(ret) ? ret : [ret];
      }
  } else { // Term
    var t = self.toNumTerm(formula);
    var sign = isTrue ? 1 : -1;
    if (t === sign*Logic.NUM_TRUE || t === -sign*Logic.NUM_FALSE) {
      return [];
    } else if (t === sign*Logic.NUM_FALSE || t === -sign*Logic.NUM_TRUE) {
      return [new Logic.Clause()]; // never satisfied clause
    } else {
      return [new Logic.Clause(sign*t)];
    }
  }
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

Logic.Solver.prototype._getFormulaInfo = function (formula, _noCreate) {
  var self = this;
  var guid = formula.guid();
  if (! self._formulaInfo[guid]) {
    if (_noCreate) {
      return null;
    }
    self._formulaInfo[guid] = new FormulaInfo();
  }
  return self._formulaInfo[guid];
};

// Takes a Formula or an array of Formulas, returns a NumTerm or
// array of NumTerms.
Logic.Solver.prototype._formulaToTerm = function (formula) {
  var self = this;

  if (_.isArray(formula)) {
    _check(formula, [Logic.FormulaOrTerm]);
    return _.map(formula, _.bind(self._formulaToTerm, self));
  } else {
    _check(formula, Logic.FormulaOrTerm);
  }

  if (formula instanceof Logic.NotFormula) {
    // shortcut that avoids creating a variable called
    // something like "$not1" when you use Logic.not(formula).
    return Logic.not(self._formulaToTerm(formula.operand));
  } else if (formula instanceof Logic.Formula) {
    var info = this._getFormulaInfo(formula);
    if (info.isRequired) {
      return Logic.NUM_TRUE;
    } else if (info.isForbidden) {
      return Logic.NUM_FALSE;
    } else if (info.varNum === null) {
      // generate a Solver-local formula variable like "$or1"
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

Logic.or = function (/*formulaOrArray, ...*/) {
  var args = _.flatten(arguments);
  if (args.length === 0) {
    return Logic.FALSE;
  } else if (args.length === 1) {
    _check(args[0], Logic.FormulaOrTerm);
    return args[0];
  } else {
    return new Logic.OrFormula(args);
  }
};

Logic.OrFormula = function (operands) {
  _check(operands, [Logic.FormulaOrTerm]);
  this.operands = operands;
};

Logic._defineFormula(Logic.OrFormula, 'or', {
  generateClauses: function (isTrue, t) {
    if (isTrue) {
      // eg A v B v C
      return t.clause(this.operands);
    } else {
      // eg -A; -B; -C
      var result = [];
      _.each(this.operands, function (o) {
        result.push.apply(result, t.generate(false, o));
      });
      return result;
    }
  }
});

Logic.NotFormula = function (operand) {
  _check(operand, Logic.FormulaOrTerm);
  this.operand = operand;
};

// No generation or simplification for 'not'; it is
// simplified away by the solver itself.
Logic._defineFormula(Logic.NotFormula, 'not');

Logic.and = function (/*formulaOrArray, ...*/) {
  var args = _.flatten(arguments);
  if (args.length === 0) {
    return Logic.TRUE;
  } else if (args.length === 1) {
    _check(args[0], Logic.FormulaOrTerm);
    return args[0];
  } else {
    return new Logic.AndFormula(args);
  }
};

Logic.AndFormula = function (operands) {
  _check(operands, [Logic.FormulaOrTerm]);
  this.operands = operands;
};

Logic._defineFormula(Logic.AndFormula, 'and', {
  generateClauses: function (isTrue, t) {
    if (isTrue) {
      // eg A; B; C
      var result = [];
      _.each(this.operands, function (o) {
        result.push.apply(result, t.generate(true, o));
      });
      return result;
    } else {
      // eg -A v -B v -C
      return t.clause(_.map(this.operands, Logic.not));
    }
  }
});

// Group `array` into groups of N, where the last group
// may be shorter than N.  group([a,b,c,d,e], 3) => [[a,b,c],[d,e]]
var group = function (array, N) {
  var ret = [];
  for (var i = 0; i < array.length; i += N) {
    ret.push(array.slice(i, i+N));
  }
  return ret;
};

Logic.xor = function (/*formulaOrArray, ...*/) {
  var args = _.flatten(arguments);
  if (args.length === 0) {
    return Logic.FALSE;
  } else if (args.length === 1) {
    _check(args[0], Logic.FormulaOrTerm);
    return args[0];
  } else {
    return new Logic.XorFormula(args);
  }
};

Logic.XorFormula = function (operands) {
  _check(operands, [Logic.FormulaOrTerm]);
  this.operands = operands;
};

Logic._defineFormula(Logic.XorFormula, 'xor', {
  generateClauses: function (isTrue, t) {
    var args = this.operands;
    var not = Logic.not;
    if (args.length > 3) {
      return t.generate(
        isTrue,
        Logic.xor(
          _.map(group(this.operands, 3), function (group) {
            return Logic.xor(group);
          })));
    } else if (isTrue) { // args.length <= 3
      if (args.length === 0) {
        return t.clause(); // always fail
      } else if (args.length === 1) {
        return t.clause(args[0]);
      } else if (args.length === 2) {
        var A = args[0], B = args[1];
        return [t.clause(A, B), // A v B
                t.clause(not(A), not(B))]; // -A v -B
      } else if (args.length === 3) {
        var A = args[0], B = args[1], C = args[2];
        return [t.clause(A, B, C), // A v B v C
                t.clause(A, not(B), not(C)), // A v -B v -C
                t.clause(not(A), B, not(C)), // -A v B v -C
                t.clause(not(A), not(B), C)]; // -A v -B v C
      }
    } else { // !isTrue, args.length <= 3
      if (args.length === 0) {
        return []; // always succeed
      } else if (args.length === 1) {
        return t.clause(not(args[0]));
      } else if (args.length === 2) {
        var A = args[0], B = args[1];
        return [t.clause(A, not(B)), // A v -B
                t.clause(not(A), B)]; // -A v B
      } else if (args.length === 3) {
        var A = args[0], B = args[1], C = args[2];
        return [t.clause(not(A), not(B), not(C)), // -A v -B v -C
                t.clause(not(A), B, C), // -A v B v C
                t.clause(A, not(B), C), // A v -B v C
                t.clause(A, B, not(C))]; // A v B v -C
      }
    }
  }
});

Logic.atMostOne = function (/*formulaOrArray, ...*/) {
  var args = _.flatten(arguments);
  if (args.length <= 1) {
    return Logic.TRUE;
  } else {
    return new Logic.AtMostOneFormula(args);
  }
};

Logic.AtMostOneFormula = function (operands) {
  _check(operands, [Logic.FormulaOrTerm]);
  this.operands = operands;
};

Logic._defineFormula(Logic.AtMostOneFormula, 'atMostOne', {
  generateClauses: function (isTrue, t) {
     var args = this.operands;
     var not = Logic.not;
     if (args.length <= 1) {
       return []; // always succeed
     } else if (args.length === 2) {
       return t.generate(isTrue, Logic.not(Logic.and(args)));
     } else if (isTrue && args.length === 3) {
       // Pick any two args; at least one is false (they aren't
       // both true).  This strategy would also work for
       // N>3, and could provide a speed-up by having more clauses
       // (N^2) but fewer propagation steps.  No speed-up was
       // observed on the Sudoku test from using this strategy
       // up to N=10.
       var clauses = [];
       for (var i = 0; i < args.length; i++) {
         for (var j = i+1; j < args.length; j++) {
           clauses.push(t.clause(not(args[i]), not(args[j])));
         }
       }
       return clauses;
     } else if ((! isTrue) && args.length === 3) {
       var A = args[0], B = args[1], C = args[2];
       // Pick any two args; at least one is true (they aren't
       // both false).  This only works for N=3.
       return [t.clause(A, B), t.clause(A, C), t.clause(B, C)];
     } else {
       // See the "commander variables" technique from:
       // http://www.cs.cmu.edu/~wklieber/papers/2007_efficient-cnf-encoding-for-selecting-1.pdf
       // But in short: At most one group has at least one "true",
       // and each group has at most one "true".  Formula generation
       // automatically generates the right implications.
       var groups = group(args, 3);
       var ors = _.map(groups, function (g) { return Logic.or(g); });
       if (groups[groups.length - 1].length < 2) {
         // Remove final group of length 1 so we don't generate
         // no-op clauses of one sort or another
         groups.pop();
       }
       var atMostOnes = _.map(groups, function (g) {
         return Logic.atMostOne(g);
       });
       return t.generate(isTrue, Logic.and(Logic.atMostOne(ors), atMostOnes));
     }
  }
});

Logic.implies = function (A, B) {
  _check(arguments.length, 2);
  return new Logic.ImpliesFormula(A, B);
};

Logic.ImpliesFormula = function (A, B) {
  _check(A, Logic.FormulaOrTerm);
  _check(B, Logic.FormulaOrTerm);
  _check(arguments.length, 2);
  this.A = A;
  this.B = B;
};

Logic._defineFormula(Logic.ImpliesFormula, 'implies', {
  generateClauses: function (isTrue, t) {
    return t.generate(isTrue, Logic.or(Logic.not(this.A), this.B));
  }
});

Logic.equiv = function (A, B) {
  _check(arguments.length, 2);
  return new Logic.EquivFormula(A, B);
};

Logic.EquivFormula = function (A, B) {
  _check(A, Logic.FormulaOrTerm);
  _check(B, Logic.FormulaOrTerm);
  _check(arguments.length, 2);
  this.A = A;
  this.B = B;
};

Logic._defineFormula(Logic.EquivFormula, 'equiv', {
  generateClauses: function (isTrue, t) {
    return t.generate(!isTrue, Logic.xor(this.A, this.B));
  }
});

Logic.exactlyOne = function (/*formulaOrArray, ...*/) {
  var args = _.flatten(arguments);
  if (args.length === 0) {
    return Logic.FALSE;
  } else if (args.length === 1) {
    _check(args[0], Logic.FormulaOrTerm);
    return args[0];
  } else {
    return new Logic.ExactlyOneFormula(args);
  }
};

Logic.ExactlyOneFormula = function (operands) {
  _check(operands, [Logic.FormulaOrTerm]);
  this.operands = operands;
};

Logic._defineFormula(Logic.ExactlyOneFormula, 'exactlyOne', {
  generateClauses: function (isTrue, t) {
    var args = this.operands;
    if (args.length < 3) {
      return t.generate(isTrue, Logic.xor(args));
    } else {
      return t.generate(isTrue, Logic.and(Logic.atMostOne(args),
                                          Logic.or(args)));
    }
  }
});

// List of 0 or more formulas or terms, which together represent
// a non-negative integer.  Least significant bit is first.  That is,
// the kth array element has a place value of 2^k.
Logic.Bits = function (formulaArray) {
  _check(formulaArray, [Logic.FormulaOrTerm]);
  this.bits = formulaArray; // public, immutable
};

Logic.constantBits = function (wholeNumber) {
  _check(wholeNumber, Logic.WholeNumber);
  var result = [];
  while (wholeNumber) {
    result.push((wholeNumber & 1) ? Logic.TRUE : Logic.FALSE);
    wholeNumber >>>= 1;
  }
  return new Logic.Bits(result);
};

Logic.variableBits = function (baseName, nbits) {
  var result = [];
  for (var i = 0; i < nbits; i++) {
    result.push(baseName + i);
  }
  return new Logic.Bits(result);
};

// bits1 <= bits2
Logic.lessThanOrEqual = function (bits1, bits2) {
  return new Logic.LessThanOrEqualFormula(bits1, bits2);
};

Logic.LessThanOrEqualFormula = function (bits1, bits2) {
  _check(bits1, Logic.Bits);
  _check(bits2, Logic.Bits);
  _check(arguments.length, 2);
  this.bits1 = bits1;
  this.bits2 = bits2;
};

var genLTE = function (bits1, bits2, t, notEqual) {
  var ret = [];
  // clone so we can mutate them in place
  var A = bits1.bits.slice();
  var B = bits2.bits.slice();
  if (notEqual && ! bits2.bits.length) {
    // can't be less than 0
    return t.clause();
  }
  // if A is longer than B, the extra (high) bits
  // must be 0.
  while (A.length > B.length) {
    var hi = A.pop();
    ret.push(t.clause(Logic.not(hi)));
  }
  // now B.length >= A.length
  // Let xors[i] be (A[i] xor B[i]), or just
  // B[i] if A is too short.
  var xors = _.map(B, function (b, i) {
    if (i < A.length) {
      return Logic.xor(A[i], b);
    } else {
      return b;
    }
  });

  // Suppose we are comparing 3-bit numbers, requiring
  // that ABC <= XYZ.  Here is what we require:
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
  // the xors from the right.
  //
  // If we have ABC <= VWXYZ, then we still have three clauses,
  // but each one is prefixed with "V or W or", because V and W
  // are at the end of the xors array.  This is equivalent to
  // padding ABC with two zeros.

  for (var i = A.length-1; i >= 0; i--) {
    ret.push(t.clause(xors.slice(i+1), Logic.not(A[i]), B[i]));
  }
  if (notEqual) {
    ret.push.apply(ret, t.generate(true, Logic.or(xors)));
  }
  return ret;
};

Logic._defineFormula(Logic.LessThanOrEqualFormula, 'lte', {
  generateClauses: function (isTrue, t) {
    if (isTrue) {
      // bits1 <= bits2
      return genLTE(this.bits1, this.bits2, t, false);
    } else {
      // bits2 < bits1
      return genLTE(this.bits2, this.bits1, t, true);
    }
  }
});

// bits1 < bits2
Logic.lessThan = function (bits1, bits2) {
  return new Logic.LessThanFormula(bits1, bits2);
};

Logic.LessThanFormula = function (bits1, bits2) {
  _check(bits1, Logic.Bits);
  _check(bits2, Logic.Bits);
  _check(arguments.length, 2);
  this.bits1 = bits1;
  this.bits2 = bits2;
};

Logic._defineFormula(Logic.LessThanFormula, 'lt', {
  generateClauses: function (isTrue, t) {
    if (isTrue) {
      // bits1 < bits2
      return genLTE(this.bits1, this.bits2, t, true);
    } else {
      // bits2 <= bits1
      return genLTE(this.bits2, this.bits1, t, false);
    }
  }
});

Logic.greaterThan = function (bits1, bits2) {
  return Logic.lessThan(bits2, bits1);
};

Logic.greaterThanOrEqual = function (bits1, bits2) {
  return Logic.lessThanOrEqual(bits2, bits1);
};

Logic.equalBits = function (bits1, bits2) {
  return new Logic.EqualBitsFormula(bits1, bits2);
};

Logic.EqualBitsFormula = function (bits1, bits2) {
  _check(bits1, Logic.Bits);
  _check(bits2, Logic.Bits);
  _check(arguments.length, 2);
  this.bits1 = bits1;
  this.bits2 = bits2;
};

Logic._defineFormula(Logic.EqualBitsFormula, 'equalBits', {
  generateClauses: function (isTrue, t) {
    var A = this.bits1.bits;
    var B = this.bits2.bits;
    var nbits = Math.max(A.length, B.length);
    var facts = [];
    for (var i = 0; i < nbits; i++) {
      if (i >= A.length) {
        facts.push(Logic.not(B[i]));
      } else if (i >= B.length) {
        facts.push(Logic.not(A[i]));
      } else {
        facts.push(Logic.equiv(A[i], B[i]));
      }
    }
    return t.generate(isTrue, Logic.and(facts));
  }
});

// Definition of full-adder and half-adder:
//
// A full-adder is a 3-input, 2-output gate producing the sum of its
// inputs as a 2-bit binary number. The most significant bit is called
// "carry", the least significant "sum". A half-adder does the same
// thing, but has only 2 inputs (and can therefore never output a
// "3").
//
// The half-adder sum bit is really just an XOR, and the carry bit
// is really just an AND.  However, they get their own formula types
// here to enhance readability of the generated clauses.

Logic.HalfAdderSum = function (formula1, formula2) {
  _check(formula1, Logic.FormulaOrTerm);
  _check(formula2, Logic.FormulaOrTerm);
  _check(arguments.length, 2);
  this.a = formula1;
  this.b = formula2;
};

Logic._defineFormula(Logic.HalfAdderSum, 'hsum', {
  generateClauses: function (isTrue, t) {
    return t.generate(isTrue, Logic.xor(this.a, this.b));
  }
});

Logic.HalfAdderCarry = function (formula1, formula2) {
  _check(formula1, Logic.FormulaOrTerm);
  _check(formula2, Logic.FormulaOrTerm);
  _check(arguments.length, 2);
  this.a = formula1;
  this.b = formula2;
};

Logic._defineFormula(Logic.HalfAdderCarry, 'hcarry', {
  generateClauses: function (isTrue, t) {
    return t.generate(isTrue, Logic.and(this.a, this.b));
  }
});

Logic.FullAdderSum = function (formula1, formula2, formula3) {
  _check(formula1, Logic.FormulaOrTerm);
  _check(formula2, Logic.FormulaOrTerm);
  _check(formula3, Logic.FormulaOrTerm);
  _check(arguments.length, 3);
  this.a = formula1;
  this.b = formula2;
  this.c = formula3;
};

Logic._defineFormula(Logic.FullAdderSum, 'fsum', {
  generateClauses: function (isTrue, t) {
    return t.generate(isTrue, Logic.xor(this.a, this.b, this.c));
  }
});

Logic.FullAdderCarry = function (formula1, formula2, formula3) {
  _check(formula1, Logic.FormulaOrTerm);
  _check(formula2, Logic.FormulaOrTerm);
  _check(formula3, Logic.FormulaOrTerm);
  _check(arguments.length, 3);
  this.a = formula1;
  this.b = formula2;
  this.c = formula3;
};

Logic._defineFormula(Logic.FullAdderCarry, 'fcarry', {
  generateClauses: function (isTrue, t) {
    return t.generate(! isTrue,
                      Logic.atMostOne(this.a, this.b, this.c));
  }
});

// Implements the Adder strategy from the MiniSat+ paper:
// http://minisat.se/downloads/MiniSat+.pdf
// "Translating Pseudo-boolean Constraints into SAT"
//
// Takes a list of list of Formulas.  The first list is bits
// to give weight 1; the second is bits to give weight 2;
// the third is bits to give weight 4; and so on.
//
// Returns an array of Logic.FormulaOrTerm.
var binaryWeightedSum = function (varsByWeight) {
  _check(varsByWeight, [[Logic.FormulaOrTerm]]);
  // initialize buckets to a two-level clone of varsByWeight
  var buckets = _.map(varsByWeight, _.clone);
  var lowestWeight = 0; // index of the first non-empty array
  var output = [];
  while (lowestWeight < buckets.length) {
    var bucket = buckets[lowestWeight];
    if (! bucket.length) {
      output.push(Logic.FALSE);
      lowestWeight++;
    } else if (bucket.length === 1) {
      output.push(bucket[0]);
      lowestWeight++;
    } else if (bucket.length === 2) {
      var sum = new Logic.HalfAdderSum(bucket[0], bucket[1]);
      var carry = new Logic.HalfAdderCarry(bucket[0], bucket[1]);
      bucket.length = 0;
      bucket.push(sum);
      pushToNth(buckets, lowestWeight+1, carry);
    } else {
      // Whether we take variables from the start or end of the
      // bucket (i.e. `pop` or `shift`) determines the shape of the tree.
      // Empirically, some logic problems are faster with `shift` (2x or so),
      // but `pop` gives an order-of-magnitude speed-up on the Meteor Version
      // Solver "benchmark-tests" suite (Slava's benchmarks based on data from
      // Rails).  So, `pop` it is.
      var c = bucket.pop();
      var b = bucket.pop();
      var a = bucket.pop();
      var sum = new Logic.FullAdderSum(a, b, c);
      var carry = new Logic.FullAdderCarry(a, b, c);
      bucket.push(sum);
      pushToNth(buckets, lowestWeight+1, carry);
    }
  }
  return output;
};

// Push `newItem` onto the array at arrayOfArrays[n],
// first ensuring that it exists by pushing empty
// arrays onto arrayOfArrays.
var pushToNth = function (arrayOfArrays, n, newItem) {
  while (n >= arrayOfArrays.length) {
    arrayOfArrays.push([]);
  }
  arrayOfArrays[n].push(newItem);
};

Logic.weightedSum = function (formulas, weights) {
  _check(formulas, [Logic.FormulaOrTerm]);
  if (typeof weights === 'number') {
    _check(weights, Logic.WholeNumber);
    weights = _.map(formulas, function () { return weights; });
  }
  _check(weights, [Logic.WholeNumber]);
  if (formulas.length !== weights.length) {
    throw new Error("Formula array and weight array must be same length" +
                    "; they are " + formulas.length + " and " + weights.length);
  }

  if (formulas.length === 0) {
    return new Logic.Bits([]);
  }

  var binaryWeighted = [];
  _.each(formulas, function (f, i) {
    var w = weights[i];
    var whichBit = 0;
    while (w) {
      if (w & 1) {
        pushToNth(binaryWeighted, whichBit, f);
      }
      w >>>= 1;
      whichBit++;
    }
  });

  return new Logic.Bits(binaryWeightedSum(binaryWeighted));
};

Logic.sum = function (/*formulaOrBitsOrArray, ...*/) {
  var things = _.flatten(arguments);
  _check(things, [Match.OneOf(Logic.FormulaOrTerm, Logic.Bits)]);

  var binaryWeighted = [];
  _.each(things, function (x) {
    if (x instanceof Logic.Bits) {
      _.each(x.bits, function (b, i) {
        pushToNth(binaryWeighted, i, b);
      });
    } else {
      pushToNth(binaryWeighted, 0, x);
    }
  });

  return new Logic.Bits(binaryWeightedSum(binaryWeighted));
};

////////////////////////////////////////

Logic.Solver.prototype.solve = function (_assumpVar) {
  var self = this;
  if (_assumpVar !== undefined) {
    if (! (_assumpVar >= 1)) {
      throw new Error("_assumpVar must be a variable number");
    }
  }

  if (self._unsat) {
    return null;
  }

  while (self._numClausesAddedToMiniSat < self.clauses.length) {
    var i = self._numClausesAddedToMiniSat;
    var stillSat = self._minisat.addClause(self.clauses[i].terms);
    self._numClausesAddedToMiniSat++;
    if (! stillSat) {
      self._unsat = true;
      return null;
    }
  }
  self._minisat.ensureVar(this._num2name.length - 1);

  var stillSat = (_assumpVar ?
                  self._minisat.solveAssuming(_assumpVar) :
                  self._minisat.solve());
  if (! stillSat) {
    if (! _assumpVar) {
      self._unsat = true;
    }
    return null;
  }

  return new Logic.Solution(self, self._minisat.getSolution());
};

Logic.Solver.prototype.solveAssuming = function (formula) {
  _check(formula, Logic.FormulaOrTerm);

  // Wrap the formula in a formula of type Assumption, so that
  // we always generate a var like `$assump123`, regardless
  // of whether `formula` is a Term, a NotFormula, an already
  // required or forbidden Formula, etc.
  var assump = new Logic.Assumption(formula);
  var assumpVar = this._formulaToTerm(assump);
  if (! (typeof assumpVar === 'number' && assumpVar > 0)) {
    throw new Error("Assertion failure: not a positive numeric term");
  }

  // Generate clauses as if we used the assumption variable in a
  // clause, in the positive.  So if we assume "A v B", we might get a
  // clause like "A v B v -$assump123" (or actually, "$or1 v
  // -$assump123"), as if we had used $assump123 in a clause.  Instead
  // of using it in a clause, though, we temporarily assume it to be
  // true.
  this._useFormulaTerm(assumpVar);

  var result = this.solve(assumpVar);
  // Tell MiniSat that we will never use assumpVar again.
  // The formula may be used again, however.  (For example, you
  // can solve assuming a formula F, and if it works, require F.)
  this._minisat.retireVar(assumpVar);

  return result;
};

Logic.Assumption = function (formula) {
  _check(formula, Logic.FormulaOrTerm);
  this.formula = formula;
};

Logic._defineFormula(Logic.Assumption, 'assump', {
  generateClauses: function (isTrue, t) {
    if (isTrue) {
      return t.clause(this.formula);
    } else {
      return t.clause(Logic.not(this.formula));
    }
  }
});

Logic.Solution = function (_solver, _assignment) {
  var self = this;
  self._solver = _solver;
  self._assignment = _assignment;

  // save a snapshot of which formulas have variables designated
  // for them, but where we haven't generated clauses that constrain
  // those variables in both the positive and the negative direction.
  self._ungeneratedFormulas = _.clone(_solver._ungeneratedFormulas);

  self._formulaValueCache = {};
  self._termifier = new Logic.Termifier(self._solver);
  // Normally, when a Formula uses a Termifier to generate clauses that
  // refer to other Formulas, the Termifier replaces the Formulas with
  // their variables.  We hijack this mechanism to replace the Formulas
  // with their truth variables instead, leading to recursive evaluation.
  // Note that we cache the evaluated truth values of Formulas to avoid
  // redundant evaluation.
  self._termifier.term = function (formula) {
    return self.evaluate(formula) ? Logic.NUM_TRUE : Logic.NUM_FALSE;
  };

  // Read/write.  When true, evaluation doesn't throw errors when
  // `evaluate` or `getWeightedSum` encounter named variables that are
  // unknown or variables that weren't present when this Solution was
  // generated.  Instead, the unknown variables are assumed to be false.
  self.ignoreUnknownVariables = false;
};

// Get a map of variables to their assignments,
// such as `{A: true, B: false, C: true}`.
// Internal variables are excluded.
Logic.Solution.prototype.getMap = function () {
  var solver = this._solver;
  var assignment = this._assignment;
  var result = {};
  for (var i = 1; i < assignment.length; i++) {
    var name = solver.getVarName(i);
    if (name && name.charAt(0) !== '$') {
      result[name] = assignment[i];
    }
  }
  return result;
};

// Get an array of variables that are assigned
// `true` by this solution, sorted by name.
// Internal variables are excluded.
Logic.Solution.prototype.getTrueVars = function () {
  var solver = this._solver;
  var assignment = this._assignment;
  var result = [];
  for (var i = 1; i < assignment.length; i++) {
    if (assignment[i]) {
      var name = solver.getVarName(i);
      if (name && name.charAt(0) !== '$') {
        result.push(name);
      }
    }
  }
  result.sort();
  return result;
};

// Get a Formula that says that the variables are assigned
// according to this solution.  (Internal variables are
// excluded.)  By forbidding this Formula and solving again,
// you can see if there are other solutions.
Logic.Solution.prototype.getFormula = function () {
  var solver = this._solver;
  var assignment = this._assignment;
  var terms = [];
  for (var i = 1; i < assignment.length; i++) {
    var name = solver.getVarName(i);
    if (name && name.charAt(0) !== '$') {
      terms.push(assignment[i] ? i : -i);
    }
  }
  return Logic.and(terms);
};

// Returns a boolean if the argument is a Formula (or Term), and an integer
// if the argument is a Logic.Bits.
Logic.Solution.prototype.evaluate = function (formulaOrBits) {
  var self = this;
  _check(formulaOrBits, Match.OneOf(Logic.FormulaOrTerm, Logic.Bits));

  if (formulaOrBits instanceof Logic.Bits) {
    // Evaluate to an integer
    var ret = 0;
    _.each(formulaOrBits.bits, function (f, i) {
      if (self.evaluate(f)) {
        ret += 1 << i;
      }
    });
    return ret;
  }

  var solver = self._solver;
  var ignoreUnknownVariables = self.ignoreUnknownVariables;
  var assignment = self._assignment;
  var formula = formulaOrBits;
  if (formula instanceof Logic.NotFormula) {
    return ! self.evaluate(formula.operand);
  } else if (formula instanceof Logic.Formula) {
    var cachedResult = self._formulaValueCache[formula.guid()];
    if (typeof cachedResult === 'boolean') {
      return cachedResult;
    } else {
      var value;
      var info = solver._getFormulaInfo(formula, true);
      if (info && info.varNum && info.varNum < assignment.length &&
          ! _.has(self._ungeneratedFormulas, info.varNum)) {
        // as an optimization, read the value of the formula directly
        // from a variable if the formula's clauses were completely
        // generated at the time of solving.  (We must be careful,
        // because if we didn't generate both the positive and the
        // negative polarity clauses for the formula, then the formula
        // variable is not actually constrained to have the right
        // value.)
        value = assignment[info.varNum];
      } else {
        var clauses = solver._generateFormula(true, formula, self._termifier);
        var value = _.all(clauses, function (cls) {
          return _.any(cls.terms, function (t) {
            return self.evaluate(t);
          });
        });
      }
      self._formulaValueCache[formula.guid()] = value;
      return value;
    }
  } else {
    // Term; convert to numeric (possibly negative), but throw
    // an error if the name is not found.  If `ignoreUnknownVariables`
    // is set, return false instead.
    var numTerm = solver.toNumTerm(formula, true);
    if (! numTerm) {
      if (ignoreUnknownVariables) {
        return false;
      } else {
        // formula must be a NameTerm naming a variable that doesn't exist
        var vname = String(formula).replace(/^-*/, '');
        throw new Error("No such variable: " + vname);
      }
    }
    var v = numTerm;
    var isNot = false;
    if (numTerm < 0) {
      v = -v;
      isNot = true;
    }
    if (v < 1 || v >= assignment.length) {
      var vname = v;
      if (v >= 1 && v < solver._num2name.length) {
        vname = solver._num2name[v];
      }
      if (ignoreUnknownVariables) {
        return false;
      } else {
        throw new Error("Variable not part of solution: " + vname);
      }
    }
    var ret = assignment[v];
    if (isNot) {
      ret = ! ret;
    }
    return ret;
  }
};

Logic.Solution.prototype.getWeightedSum = function (formulas, weights) {
  _check(formulas, [Logic.FormulaOrTerm]);
  if (typeof weights === 'number') {
    _check(weights, Logic.WholeNumber);
    weights = _.map(formulas, function () { return weights; });
  }
  _check(weights, [Logic.WholeNumber]);
  var total = 0;
  if (formulas.length !== weights.length) {
    throw new Error("formulas and weights arrays must be same length");
  }
  for (var i = 0; i < formulas.length; i++) {
    total += weights[i] * (this.evaluate(formulas[i]) ? 1 : 0);
  }
  return total;
};
