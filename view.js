
Blaze.View = function (kind, render) {
  if (! (this instanceof Blaze.View))
    // called without `new`
    return new Blaze.View(kind, render);

  if (typeof kind === 'function') {
    // omitted "kind" argument
    render = kind;
    kind = '';
  }
  this.kind = kind;
  this.render = render;

  this._callbacks = {
    created: null,
    materialized: null,
    rendered: null,
    destroyed: null
  };

  // Setting all properties here is good for readability,
  // and also may help Chrome optimize the code by keeping
  // the View object from changing shape too much.
  this.isCreated = false;
  this.isCreatedForExpansion = false;
  this.isDestroyed = false;
  this.isInRender = false;
  this.parentView = null;
  this.domrange = null;
};

Blaze.View.prototype.render = function () { return null; };

Blaze.View.prototype.onCreated = function (cb) {
  this._callbacks.created = this._callbacks.created || [];
  this._callbacks.created.push(cb);
};
Blaze.View.prototype.onMaterialized = function (cb) {
  this._callbacks.materialized = this._callbacks.materialized || [];
  this._callbacks.materialized.push(cb);
};
Blaze.View.prototype.onRendered = function (cb) {
  this._callbacks.rendered = this._callbacks.rendered || [];
  this._callbacks.rendered.push(cb);
};
Blaze.View.prototype.onDestroyed = function (cb) {
  this._callbacks.destroyed = this._callbacks.destroyed || [];
  this._callbacks.destroyed.push(cb);
};

Blaze.View.prototype.autorun = function (f, _inViewScope) {
  var self = this;

  // The restrictions on when View#autorun can be called are in order
  // to avoid bad patterns, like creating a Blaze.View and immediately
  // calling autorun on it.  A freshly created View is not ready to
  // have logic run on it; it doesn't have a parentView, for example.
  // It's when the View is materialized or expanded that the onCreated
  // handlers are fired and the View starts up.
  //
  // Letting the render() method call `this.autorun()` is problematic
  // because of re-render.  The best we can do is to stop the old
  // autorun and start a new one for each render, but that's a pattern
  // we try to avoid internally because it leads to helpers being
  // called extra times, in the case where the autorun causes the
  // view to re-render (and thus the autorun to be torn down and a
  // new one established).
  //
  // We could lift these restrictions in various ways.  One interesting
  // idea is to allow you to call `view.autorun` after instantiating
  // `view`, and automatically wrap it in `view.onCreated`, deferring
  // the autorun so that it starts at an appropriate time.  However,
  // then we can't return the Computation object to the caller, because
  // it doesn't exist yet.
  if (! self.isCreated) {
    throw new Error("View#autorun must be called from the created callback at the earliest");
  }
  if (this.isInRender) {
    throw new Error("Can't call View#autorun from inside render(); try calling it from the created or rendered callback");
  }
  if (Deps.active) {
    throw new Error("Can't call View#autorun from a Deps Computation; try calling it from the created or rendered callback");
  }

  var c = Deps.autorun(function viewAutorun(c) {
    return Blaze.withCurrentView(_inViewScope || self, function () {
      return f.call(self, c);
    });
  });
  self.onDestroyed(function () { c.stop(); });

  return c;
};

Blaze._fireCallbacks = function (view, which) {
  Blaze.withCurrentView(view, function () {
    Deps.nonreactive(function fireCallbacks() {
      var cbs = view._callbacks[which];
      for (var i = 0, N = (cbs && cbs.length); i < N; i++)
        cbs[i].call(view);
    });
  });
};

Blaze.materializeView = function (view, parentView) {
  view.parentView = (parentView || null);

  if (view.isCreated)
    throw new Error("Can't render the same View twice");
  view.isCreated = true;

  Blaze._fireCallbacks(view, 'created');

  var domrange;

  var needsRenderedCallback = false;
  var scheduleRenderedCallback = function () {
    if (needsRenderedCallback && ! view.isDestroyed &&
        view._callbacks.rendered && view._callbacks.rendered.length) {
      Deps.afterFlush(function callRendered() {
        if (needsRenderedCallback && ! view.isDestroyed) {
          needsRenderedCallback = false;
          Blaze._fireCallbacks(view, 'rendered');
        }
      });
    }
  };

  var lastHtmljs;
  // We don't expect to be called in a Computation, but just in case,
  // wrap in Deps.nonreactive.
  Deps.nonreactive(function () {
    view.autorun(function doRender(c) {
      // `view.autorun` sets the current view.
      // Any dependencies that should invalidate this Computation come
      // from this line:
      view.isInRender = true;
      var htmljs = view.render();
      view.isInRender = false;

      Deps.nonreactive(function doMaterialize() {
        var materializer = new Blaze.DOMMaterializer({parentView: view});
        var rangesAndNodes = materializer.visit(htmljs, []);
        if (c.firstRun || ! Blaze._isContentEqual(lastHtmljs, htmljs)) {
          if (c.firstRun) {
            domrange = new Blaze.DOMRange(rangesAndNodes);
            view.domrange = domrange;
            domrange.view = view;
          } else {
            domrange.setMembers(rangesAndNodes);
          }
          Blaze._fireCallbacks(view, 'materialized');
          needsRenderedCallback = true;
          if (! c.firstRun)
            scheduleRenderedCallback();
        }
      });
      lastHtmljs = htmljs;

      // Causes any nested views to stop immediately, not when we call
      // `setMembers` the next time around the autorun.  Otherwise,
      // helpers in the DOM tree to be replaced might be scheduled
      // to re-run before we have a chance to stop them.
      Deps.onInvalidate(function () {
        domrange.destroyMembers();
      });
    });

    domrange.onAttached(function attached(range, element) {
      Blaze.DOMBackend.Teardown.onElementTeardown(
        element, function teardown() {
          Blaze.destroyView(view, true /* _skipNodes */);
        });

      scheduleRenderedCallback();
    });
  });

  return domrange;
};

// Expands a View to HTMLjs, calling `render` recursively on all
// Views and evaluating any dynamic attributes.  Calls the `created`
// callback, but not the `materialized` or `rendered` callbacks.
// Destroys the view immediately, unless called in a Deps Computation,
// in which case the view will be destroyed when the Computation is
// invalidated.  If called in a Deps Computation, the result is a
// reactive string; that is, the Computation will be invalidated
// if any changes are made to the view or subviews that might affect
// the HTML.
Blaze._expandView = function (view, parentView) {
  view.parentView = (parentView || null);

  if (view.isCreated)
    throw new Error("Can't render the same View twice");
  view.isCreated = true;
  view.isCreatedForExpansion = true;

  Blaze._fireCallbacks(view, 'created');

  view.isInRender = true;
  var htmljs = Blaze.withCurrentView(view, function () {
    return view.render();
  });
  view.isInRender = false;

  var result = Blaze._expand(htmljs, view);

  if (Deps.active) {
    Deps.onInvalidate(function () {
      Blaze.destroyView(view);
    });
  } else {
    Blaze.destroyView(view);
  }

  return result;
};

// Options: `parentView`
Blaze.HTMLJSExpander = HTML.TransformingVisitor.extend();
Blaze.HTMLJSExpander.def({
  visitObject: function (x) {
    if (Blaze.isTemplate(x))
      x = Blaze.runTemplate(x);
    if (x instanceof Blaze.View)
      return Blaze._expandView(x, this.parentView);

    // this will throw an error; other objects are not allowed!
    return HTML.TransformingVisitor.prototype.visitObject.call(this, x);
  },
  visitAttributes: function (attrs) {
    // expand dynamic attributes
    if (typeof attrs === 'function')
      attrs = Blaze.withCurrentView(this.parentView, attrs);

    // call super (e.g. for case where `attrs` is an array)
    return HTML.TransformingVisitor.prototype.visitAttributes.call(this, attrs);
  },
  visitAttribute: function (name, value, tag) {
    // expand attribute values that are functions.  Any attribute value
    // that contains Views must be wrapped in a function.
    if (typeof value === 'function')
      value = Blaze.withCurrentView(this.parentView, value);

    return HTML.TransformingVisitor.prototype.visitAttribute.call(
      this, name, value, tag);
  }
});

Blaze._expand = function (htmljs, parentView) {
  parentView = parentView || Blaze.currentView;
  return (new Blaze.HTMLJSExpander(
    {parentView: parentView})).visit(htmljs);
};

Blaze._expandAttributes = function (attrs, parentView) {
  parentView = parentView || Blaze.currentView;
  return (new Blaze.HTMLJSExpander(
    {parentView: parentView})).visitAttributes(attrs);
};

Blaze.destroyView = function (view, _skipNodes) {
  if (view.isDestroyed)
    return;
  view.isDestroyed = true;

  Blaze._fireCallbacks(view, 'destroyed');

  // Destroy views and elements recursively.  If _skipNodes,
  // only recurse up to views, not elements, for the case where
  // the backend (jQuery) is recursing over the elements already.

  if (view.domrange)
    view.domrange.destroyMembers();
};

Blaze.destroyNode = function (node) {
  if (node.nodeType === 1)
    Blaze.DOMBackend.Teardown.tearDownElement(node);
};

// Are the HTMLjs entities `a` and `b` the same?  We could be
// more elaborate here but the point is to catch the most basic
// cases.
Blaze._isContentEqual = function (a, b) {
  if (a instanceof HTML.Raw) {
    return (b instanceof HTML.Raw) && (a.value === b.value);
  } else if (a == null) {
    return (b == null);
  } else {
    return (a === b) &&
      ((typeof a === 'number') || (typeof a === 'boolean') ||
       (typeof a === 'string'));
  }
};

Blaze.currentView = null;

Blaze.withCurrentView = function (view, func) {
  var oldView = Blaze.currentView;
  try {
    Blaze.currentView = view;
    return func();
  } finally {
    Blaze.currentView = oldView;
  }
};

Blaze.isTemplate = function (t) {
  return t && (typeof t.__makeView === 'function');
};

Blaze.runTemplate = function (t/*, args*/) {
  if (! Blaze.isTemplate(t))
    throw new Error("Not a template: " + t);
  var restArgs = Array.prototype.slice.call(arguments, 1);
  return t.__makeView.apply(t, restArgs);
};

Blaze.render = function (content, parentView) {
  parentView = parentView || Blaze.currentView;

  var view;
  if (typeof content === 'function') {
    view = Blaze.View('render', content);
  } else if (Blaze.isTemplate(content)) {
    view = Blaze.runTemplate(content);
  } else {
    if (! (content instanceof Blaze.View))
      throw new Error("Expected a function, template, or View in Blaze.render");
    view = content;
  }
  return Blaze.materializeView(view, parentView);
};

Blaze.toHTML = function (htmljs, parentView) {
  if (typeof htmljs === 'function')
    throw new Error("Blaze.toHTML doesn't take a function, just HTMLjs");
  parentView = parentView || Blaze.currentView;
  return HTML.toHTML(Blaze._expand(htmljs, parentView));
};

Blaze.toText = function (htmljs, parentView, textMode) {
  if (typeof htmljs === 'function')
    throw new Error("Blaze.toText doesn't take a function, just HTMLjs");

  if ((parentView != null) && ! (parentView instanceof Blaze.View)) {
    // omitted parentView argument
    textMode = parentView;
    parentView = null;
  }
  parentView = parentView || Blaze.currentView;

  if (! textMode)
    throw new Error("textMode required");
  if (! (textMode === HTML.TEXTMODE.STRING ||
         textMode === HTML.TEXTMODE.RCDATA ||
         textMode === HTML.TEXTMODE.ATTRIBUTE))
    throw new Error("Unknown textMode: " + textMode);

  return HTML.toText(Blaze._expand(htmljs, parentView), textMode);
};

Blaze.getCurrentData = function () {
  var theWith = Blaze.getCurrentView('with');
  return theWith ? theWith.dataVar.get() : null;
};

// Gets the current view or its nearest ancestor of kind
// `kind`.
Blaze.getCurrentView = function (kind) {
  var view = Blaze.currentView;
  // Better to fail in cases where it doesn't make sense
  // to use Blaze.getCurrentView().  There will be a current
  // view anywhere it does.  You can check Blaze.currentView
  // if you want to know whether there is one or not.
  if (! view)
    throw new Error("There is no current view");

  if (kind) {
    while (view && view.kind !== kind)
      view = view.parentView;
    return view || null;
  } else {
    // Blaze.getCurrentView() with no arguments just returns
    // Blaze.currentView.
    return view;
  }
};

// Gets the nearest ancestor view that corresponds to a template
Blaze.getCurrentTemplateView = function () {
  var view = Blaze.getCurrentView();

  while (view && ! view.template)
    view = view.parentView;

  return view || null;
};

Blaze.getParentView = function (view, kind) {
  var v = view.parentView;

  if (kind) {
    while (v && v.kind !== kind)
      v = v.parentView;
  }

  return v || null;
};

Blaze.getElementView = function (elem, kind) {
  var range = Blaze.DOMRange.forElement(elem);
  var view = null;
  while (range && ! view) {
    view = (range.view || null);
    if (! view) {
      if (range.parentRange)
        range = range.parentRange;
      else
        range = Blaze.DOMRange.forElement(range.parentElement);
    }
  }

  if (kind) {
    while (view && view.kind !== kind)
      view = view.parentView;
    return view || null;
  } else {
    return view;
  }
};

Blaze.getElementData = function (elem) {
  var theWith = Blaze.getElementView(elem, 'with');
  return theWith ? theWith.dataVar.get() : null;
};

Blaze.getViewData = function (view) {
  var theWith = Blaze.getParentView(view, 'with');
  return theWith ? theWith.dataVar.get() : null;
};
