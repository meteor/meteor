
/// RenderPoints are objects that can be included in an HTMLjs tree
/// processed by Blaze alongside the built-in HTMLjs types like Tags,
/// strings, and arrays.  Among the types of RenderPoints are
/// Components, Controllers (including "#with"), and reactivity
/// primitives like Isolate and List.  When Blaze encounters a
/// RenderPoint object while performing one of its four internal
/// operations on HTMLjs trees -- toDOM, toHTML, toText, and evaluate
/// -- it calls upon the RenderPoint to render itself using one of the
/// four public RenderPoint methods corresponding to these operations
/// (createDOMRange, toHTML, toText, and evaluate).
///
/// Blaze.Isolate is an example of a RenderPoint.  Calling Blaze.Isolate
/// with a function argument returns a Blaze.Isolate object, which can be
/// included in an HTMLjs tree to establish a region of DOM that is
/// reactively recalculated:
///
/// ```
/// Blaze.render(function () {
///   return HTML.DIV(Blaze.Isolate(function () {
///     return Session.get('foo');
///   }));
/// });
/// ```
///
/// The RenderPoint base class comes with basic implementations of
/// the four public methods (evaluate, toText, toHTML, and createDOMRange)
/// in terms of a private method called "render," returning the HTMLjs
/// content to render, which is expected to be overridden by subclasses.
///
/// For example, here is a simple RenderPoint subclass which renders
/// some content inside a DIV:
///
/// ```
/// DivWrapper = Blaze.RenderPoint.extend({
///   constructor: function (contentFunc) {
///     DivWrapper.__super__.constructor.call(this);
///     this.contentFunc = contentFunc;
///   },
///   render: function () {
///     var f = this.contentFunc;
///     return HTML.DIV({id:"wrapper"}, f());
///   }
/// });
/// ```
///
/// To use DivWrapper:
///
/// ```
/// Blaze.render(function () {
///   return new DivWrapper(function () {
///     return HTML.SPAN("Hello");
///   });
/// });
/// ```
///
/// RenderPoint subclasses can influence rendering in a variety of ways,
/// such as by running code before and after rendering (e.g. to set a
/// dynamic variable) or by saving a pointer to the DOMRange returned by
/// createDOMRange and updating it reactively.
///
/// RenderPoint instances are meant to be constructed inside Blaze.render
/// and used immediately.  If the Blaze.render re-runs, a new RenderPoint
/// instance will be created.  However, RenderPoints must also support
/// the case where one instance is rendered multiple times; the relationship
/// between RenderPoints and DOMRanges may be one to many.
///
/// When a RenderPoint is used in an HTML attribute value, the same
/// RenderPoint instance may be evaluated multiple times.  For
/// example, take this code which renders a DIV with a reactively
/// updating "id":
///
/// ```
/// Blaze.render(function () {
///   return HTML.DIV({id: Blaze.Isolate(function () {
///     return Session.get('foo');
///   })});
/// });
/// ```
///
/// When a tag like the DIV is rendered, the attributes are evaluated
/// in a Deps computation.  However, Blaze.Isolate is only ever called
/// once here, and the resulting Isolate object (RenderPoint) is
/// evaluated multiple times.
///
/// The class hierarchy rooted at RenderPoint looks like this:
///
/// * RenderPoint
///   * Isolate
///   * List
///   * Controller
///     * With
///     * Component
///
/// Controllers are special because they have a "parent" pointer to the
/// enclosing Controller, and the current Controller is tracked by a
/// dynamic variable.  Controllers may be used in HTML attribute values
/// (where they are rendered as text), but if they are rendered to DOM,
/// bidirectional pointers are set up between the resulting DOMRange
/// (which is assumed to be the only one) and the Controller instance.
///
/// Components have a lifecycle (they get stopped and finalized) and
/// their rendered contents are isolated by default.  They are not
/// meant to be used in attributes.  They may only be rendered once;
/// code that gets re-run (such as the function passed to Blaze.render
/// or Blaze.Isolate) must create a new component instance each time.
/// In other words, you can't create a component instance outside of
/// Blaze.render and then use it from the function passed to
/// Blaze.render.
///
/// Some RenderPoints can be instantiated with or without `new`
/// (notably Isolate, List, and With), but by default, RenderPoints,
/// Controllers, and Components must be created with `new`.

Blaze.RenderPoint = JSClass.create({
  render: function () {
    return null;
  },
  // Subclasses can override evaluate, toText, toHTML, and createDOMRange
  // as they see fit.
  evaluate: function () {
    return Blaze._evaluate(this.render());
  },
  toText: function (textMode) {
    return Blaze._toText(this.evaluate(), textMode);
  },
  toHTML: function () {
    return Blaze._toHTML(this.evaluate());
  },
  createDOMRange: function () {
    return new Blaze.DOMRange(Blaze._toDOM(this.render()));
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
    // Blaze.render does the actual work of setting up a computation
    // and reactively updating the DOMRange.
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
    // Get and call all the functions in funcSeq, taking a dependency
    // on funcSeq.  This is the path taken for toText, toHTML, and
    // evaluate (but not createDOMRange, which is handled specially).
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
    // Blaze.renderList does the actual work.
    return Blaze.renderList(this.funcSeq);
  }
});
