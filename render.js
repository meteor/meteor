// RenderPoints must support being evaluated and/or createDOMRanged multiple
// times.  They must not contain per-instance state.
Blaze.RenderPoint = function () {};

_.extend(Blaze.RenderPoint.prototype, {
  render: function () {
    return null;
  },
  // Subclasses can override evaluate, toText, toHTML, and createDOMRange
  // as they see fit.
  evaluate: function () {
    return Blaze.evaluate(this.render());
  },
  toText: function (textMode) {
    return Blaze.toText(this.evaluate(), textMode);
  },
  toHTML: function () {
    return Blaze.toHTML(this.evaluate());
  },
  createDOMRange: function () {
    return new Blaze.DOMRange(Blaze.toDOM(this.render()));
  }
});

Blaze.Isolate = function (func) {
  if (! (this instanceof Blaze.Isolate))
    // called without new
    return new Blaze.Isolate(func);

  this.func = func;
};
__extends(Blaze.Isolate, Blaze.RenderPoint);

_.extend(Blaze.Isolate.prototype, {
  render: function () {
    var func = this.func;
    return func();
  },
  createDOMRange: function () {
    return Blaze.render(this.func);
  }
});


Blaze.List = function (funcSequence) {
  var self = this;

  if (! (self instanceof Blaze.List))
    // called without `new`
    return new Blaze.List(funcSequence);

  if (! (funcSequence instanceof Blaze.Sequence))
    throw new Error("Expected a Blaze.Sequence of functions in Blaze.List");

  self.funcSeq = funcSequence;
};
__extends(Blaze.List, Blaze.RenderPoint);

_.extend(Blaze.List.prototype, {
  render: function () {
    var funcSeq = this.funcSeq;
    this.funcSeq.depend();

    var size = funcSeq.size();
    var result = new Array(size);
    for (var i = 0; i < size; i++) {
      var f = funcSeq.get(i);
      result[i] = f();
    }
    return result;
  },
  createDOMRange: function () {
    return Blaze.renderList(this.funcSeq);
  }
});



// generic stopped method for a range with a single computation attached to it
var _onstopForRender = function () {
  this.computation.stop();
};

Blaze.render = function (func) {
  var range = new Blaze.DOMRange;
  var controller = Blaze.currentController;
  range.computation = Deps.autorun(function () {
    Blaze.withCurrentController(controller, function () {
      var content = func();
      range.setMembers(Blaze.toDOM(content));
    });
  });
  Blaze._onAutorun(range.computation);
  range.onstop(_onstopForRender);
  // XXX figure how the autorun gets stopped
  // (like a Blaze.finalize call)
  return range;
};

Blaze.renderList = function (funcSequence) {
  if (! (funcSequence instanceof Blaze.Sequence))
    throw new Error("Expected a Blaze.Sequence of functions in " +
                    "Blaze.renderList");

  var initialMembers;
  var computation = Deps.autorun(function (c) {
    if (! c.firstRun)
      return; // can't get here

    var initialCount = funcSequence.size();
    initialMembers = new Array(initialCount);
    for (var i = 0; i < initialCount; i++) {
      var func = funcSequence.get(i);
      if (typeof func !== 'function')
        throw new Error("Expected a Blaze.Sequence of functions in " +
                        "Blaze.renderList");
      initialMembers[i] = Blaze.render(func);
    }
  });
  Blaze._onAutorun(computation);

  var range = new Blaze.DOMRange(initialMembers);
  range.computation = computation;
  range.onstop(_onstopForRender);

  funcSequence.observeMutations({
    addItem: function (func, k) {
      if (typeof func !== 'function')
        throw new Error("Expected function in Blaze.renderList");
      Deps.nonreactive(function () {
        var newMember = Blaze.render(func);
        range.computation.onInvalidate(function () {
          newMember.stop();
        });
        range.addMember(newMember, k);
      });
    },
    removeItem: function (k) {
      Deps.nonreactive(function () {
        range.getMember(k).stop();
        range.removeMember(k);
      });
    }
  });

  return range;
};
