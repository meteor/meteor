MiniSat = function () {
  var C = this._C = cMinisat();
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
};

MiniSat.prototype.addClause = function (terms) {
  check(terms, [Logic.NumTerm]);
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
  return this._C.solve() ? true : false;
};
