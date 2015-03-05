MiniSat = function () {
  // C is the "module" object created by Emscripten.  We wrap the
  // output of Emscripten in a closure, so each call to C_MINISAT()
  // actually instantiates a separate C environment, including
  // the "native" heap.
  //
  // The methods available on `C` include the global functions we
  // define in `logic-solver.cc`, each prefixed with `_`, and a varied
  // assortment of helpers put there by Emscripten, some of which are
  // documented here:
  // http://kripken.github.io/emscripten-site/docs/porting/connecting_cpp_and_javascript/Interacting-with-code.html
  //
  // See the README in the meteor/minisat repo for more notes about
  // our build of MiniSat.
  var C = this._C = C_MINISAT();

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
      try {
        return func(this, C);
      } finally {
        this.setStackPointer(SP);
      }
    }
  };

  C._createTheSolver();

  // useful log for debugging and testing
  this._clauses = [];
};

// Make sure MiniSat has allocated space in its model for v,
// even if v is unused.  If we have variables A,B,C,D which
// are numbers 1,2,3,4, for example, but we never actually use
// C and D, calling ensureVar(4) will make MiniSat give us
// solution values for them anyway.
MiniSat.prototype.ensureVar = function (v) {
  this._C._ensureVar(v);
};

MiniSat.prototype.addClause = function (terms) {
  _check(terms, [Logic.NumTerm]);
  this._clauses.push(terms);
  return this._native.savingStack(function (native, C) {
    var termsPtr = C.allocate((terms.length+1)*4, 'i32', C.ALLOC_STACK);
    _.each(terms, function (t, i) {
      C.setValue(termsPtr + i*4, t, 'i32');
    });
    C.setValue(termsPtr + terms.length*4, 0, 'i32'); // 0-terminate
    return C._addClause(termsPtr) ? true : false;
  });
};

MiniSat.prototype.solve = function () {
  return this._C._solve() ? true : false;
};

MiniSat.prototype.solveAssuming = function (v) {
  return this._C._solveAssuming(v) ? true : false;
};

MiniSat.prototype.getSolution = function () {
  var solution = [null]; // no 0th var
  var C = this._C;
  var numVars = C._getNumVars();
  var solPtr = C._getSolution();
  for (var i = 0; i < numVars; i++) {
    // 0 is Minisat::l_True (lifted "true")
    solution[i+1] = (C.getValue(solPtr+i, 'i8') === 0);
  }
  return solution;
};

MiniSat.prototype.retireVar = function (v) {
  this._C._retireVar(v);
};

MiniSat.prototype.getConflictClause = function () {
  var C = this._C;
  var numTerms = C._getConflictClauseSize();
  var clausePtr = C._getConflictClause();
  var terms = [];
  for (var i = 0; i < numTerms; i++) {
    var t = C.getValue(clausePtr + i*4, 'i32');
    var v = (t >>> 1) + 1;
    var s = (t & 1) ? -1 : 1;
    terms[i] = v * s;
  }
  return terms;
};
