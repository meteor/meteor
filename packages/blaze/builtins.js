


Blaze._conditionVar = function (conditionFunc, not) {
  return Blaze.Var(function () {
    var cond = conditionFunc();
    // empty array is considered falsy
    if (cond instanceof Array && cond.length === 0)
      cond = false;

    return not ? (! cond) : (!! cond);
  });
};

Blaze.If = function (conditionFunc, contentFunc, elseFunc) {
  var v = Blaze._conditionVar(conditionFunc);
  return Blaze.Isolate(function () {
    return v.get() ? contentFunc() : (elseFunc ? elseFunc() : null);
  });
};

Blaze.Unless = function (conditionFunc, contentFunc, elseFunc) {
  var v = Blaze._conditionVar(conditionFunc, 'not');
  return Blaze.Isolate(function () {
    return v.get() ? contentFunc() : (elseFunc ? elseFunc() : null);
  });
};

Blaze.With = Blaze.Controller.extend({
  constructor: function (data, func) {
    if (! (this instanceof Blaze.With))
      // called without new
      return new Blaze.With(data, func);

    Blaze.With.__super__.constructor.call(this);

    this.dataVar = (data instanceof Blaze.Var) ? data : Blaze.Var(data);
    this.func = func;
  },
  render: function () {
    var func = this.func;
    return func();
  },
  // XXX think about whether all Controllers (or
  // RenderPoints or something) should have a Computation
  // that is stopped in response to DOM removal.
  createDOMRange: function () {
    var self = this;
    var range = Blaze.With.__super__.createDOMRange.call(self);
    range.addDOMAugmenter(new Blaze.RemovalWatcher);
    range.onstop(function () {
      self.dataVar.stop();
    });
    return range;
  }
});
