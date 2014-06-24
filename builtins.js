


Blaze._conditionVar = function (conditionFunc, not) {
  return Blaze.Var(function () {
    var cond = conditionFunc();
    // empty array is considered falsy
    if (cond instanceof Array && cond.length === 0)
      cond = false;

    return not ? (! cond) : (!! cond);
  });
};

var StoppingIsolate = Blaze.Isolate.extend({
  constructor: function (v, func)  {
    Blaze.Isolate.call(this, func);
    this._varToStop = v;
  },
  createDOMRange: function () {
    var v = this._varToStop;
    var range = Blaze.Isolate.prototype.createDOMRange.call(this);
    range.addDOMAugmenter(new Blaze.TeardownWatcher);
    range.onstop(function () {
      v.stop();
    });
    return range;
  }
});

Blaze.If = function (conditionFunc, contentFunc, elseFunc) {
  var v = Blaze._conditionVar(conditionFunc);
  return new StoppingIsolate(v, function () {
    return v.get() ? contentFunc() : (elseFunc ? elseFunc() : null);
  });
};

Blaze.Unless = function (conditionFunc, contentFunc, elseFunc) {
  var v = Blaze._conditionVar(conditionFunc, 'not');
  return new StoppingIsolate(v, function () {
    return v.get() ? contentFunc() : (elseFunc ? elseFunc() : null);
  });
};

Blaze.With = Blaze.Controller.extend({
  constructor: function (data, func) {
    if (! (this instanceof Blaze.With))
      // called without new
      return new Blaze.With(data, func);

    Blaze.With.__super__.constructor.call(this);

    if (data instanceof Blaze.Var) {
      this.dataVar = data;
    } else {
      this.dataVar = Blaze.Var(data);
      this._madeDataVar = true;
    }
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
    if (this._madeDataVar) {
      range.addDOMAugmenter(new Blaze.TeardownWatcher);
      range.onstop(function () {
        self.dataVar.stop();
      });
    }
    return range;
  }
});
