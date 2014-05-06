


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
