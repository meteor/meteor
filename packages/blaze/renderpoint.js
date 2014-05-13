// RenderPoints must support being evaluated and/or createDOMRanged multiple
// times.  They must not contain per-instance state.
Blaze.RenderPoint = JSClass.create({
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

Blaze.Isolate = Blaze.RenderPoint.extend({
  constructor: function (func) {
    if (! (this instanceof Blaze.Isolate))
      // called without new
      return new Blaze.Isolate(func);

    Blaze.Isolate.__super__.constructor.call(this);

    this.func = func;
  },
  render: function () {
    var func = this.func;
    return func();
  },
  createDOMRange: function () {
    return Blaze.render(this.func);
  }
});


Blaze.List = Blaze.RenderPoint.extend({
  constructor: function (funcSequence) {
    var self = this;

    if (! (self instanceof Blaze.List))
      // called without `new`
      return new Blaze.List(funcSequence);

    if (! (funcSequence instanceof Blaze.Sequence))
      throw new Error("Expected a Blaze.Sequence of functions in Blaze.List");

    Blaze.List.__super__.constructor.call(this);

    self.funcSeq = funcSequence;
  },
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
