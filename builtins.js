


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

Blaze.With = function (data, func) {
  if (! (this instanceof Blaze.With))
    // called without new
    return new Blaze.With(data, func);

  Blaze.Controller.call(this);

  this.data = (data instanceof Blaze.Var) ? data : Blaze.Var(data);
  this.func = func;
};
Blaze.__extends(Blaze.With, Blaze.Controller);
_.extend(Blaze.With.prototype, {
  render: function () {
    var func = this.func;
    return func();
  }
});
