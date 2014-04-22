// `[new] Blaze.Var(initializer[, equalsFunc])`
//
// A Var is a reactive mutable variable which may be initialized with a
// value or a with a reactive function.  If the initializer is a reactive
// function, a Deps Computation is kicked off from the constructor
// that updates the reactive variable.
Blaze.Var = function (initializer, equalsFunc) {
  var self = this;

  if (! (self instanceof Blaze.Var))
    // called without `new`
    return new Blaze.Var(initializer, equalsFunc);

  self.equalsFunc = equalsFunc;
  self.curValue = null;
  self.inited = false;
  self.dep = new Deps.Dependency;
  self.computation = null;

  if (typeof initializer === 'function') {
    if (! Deps.active)
      throw new Error("Can only create a Blaze.Var(function...) inside a Computation");

    var controller = Blaze.currentController;
    self.computation = Deps.autorun(function (c) {
      Blaze.withCurrentController(controller, function () {
        self.set(initializer());
      });
    });
    Blaze._onAutorun(self.computation);
  } else {
    self.set(initializer);
  }
  self.inited = true;
};

_.extend(Blaze.Var.prototype, {
  get: function () {
    if (Deps.active)
      this.dep.depend();

    return this.curValue;
  },
  set: function (newValue) {
    var equals = this.equalsFunc;
    var oldValue = this.curValue;

    if (this.inited &&
        (equals ? equals(newValue, oldValue) :
         newValue === oldValue)) {
      // value is same as last time
      return;
    }

    this.curValue = newValue;
    this.dep.changed();
  },
  toString: function () {
    return 'Var{' + this.get() + '}';
  }
});
