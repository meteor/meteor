// TODO
//
// - DOMRange
//   - kill DOMAugmenter
//   - consider moving to _callbacks (including memberOut)
// - port attributes
// - EACH untested as far as:
//   - toHTML
//   - cleanup
//   - most things really...
// - Do you get access to the DOMRange from "destroyed"?

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
    destroyed: null };
};

Blaze.View.prototype.render = function () { return null; };

Blaze.View.prototype.isCreated = false;
Blaze.View.prototype.isDestroyed = false;

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

  if (! self.isCreated)
    throw new Error("View#autorun must be called from the created callback at the earliest");

  var c = Deps.nonreactive(function () {
    return Deps.autorun(function viewAutorun(c) {
      return Blaze.withCurrentView(_inViewScope || self, function () {
        return f.call(self, c);
      });
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

  var domrange = new Blaze.DOMRange;
  view.domrange = domrange;
  domrange.view = view;

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
  view.autorun(function doRender(c) {
    // `view.autorun` sets the current view.
    // Any dependencies that should invalidate this Computation come
    // from this line:
    var htmljs = view.render();

    Deps.nonreactive(function doMaterialize() {
      var materializer = new Blaze.DOMMaterializer({parentView: view});
      var rangesAndNodes = materializer.visit(htmljs, []);
      if (c.firstRun || ! Blaze._isContentEqual(lastHtmljs, htmljs)) {
        domrange.setMembers(rangesAndNodes);
        Blaze._fireCallbacks(view, 'materialized');
        needsRenderedCallback = true;
        if (! c.firstRun)
          scheduleRenderedCallback();
      }
    });
    lastHtmljs = htmljs;
  });

  domrange.onAttached(function attached(range, element) {
    Blaze.DOMBackend.Teardown.onElementTeardown(element, function teardown() {
      Blaze.destroyView(view, true /* _viaTeardown */);
    });

    scheduleRenderedCallback();
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
  view.isBeingExpanded = true;

  Blaze._fireCallbacks(view, 'created');

  var htmljs = Blaze.withCurrentView(view, function () {
    return view.render();
  });

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

Blaze.destroyView = function (view, _viaTeardown) {
  if (view.isDestroyed)
    return;
  view.isDestroyed = true;

  // Destroy views and elements recursively.  If _viaTeardown,
  // only recurse up to views, not elements, because we assume
  // the backend (jQuery) is recursing over the elements already.
  if (view.domrange) {
    var members = view.domrange.members;
    for (var i = 0; i < members.length; i++) {
      var m = members[i];
      if (m instanceof Blaze.DOMRange) {
        if (m.view)
          Blaze.destroyView(m.view, _viaTeardown);
      } else if (! _viaTeardown && m.nodeType === 1) {
        Blaze.destroyNode(m);
      }
    }
  }

  Blaze._fireCallbacks(view, 'destroyed');
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

Blaze.render = function (contentFunc) {
  return Blaze.materializeView(Blaze.View('render', contentFunc));
};

Blaze.toHTML = function (htmljs, parentView) {
  parentView = parentView || Blaze.currentView;
  return HTML.toHTML(Blaze._expand(htmljs, parentView));
};

Blaze.toText = function (htmljs, parentView, textMode) {
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

Blaze.getParentView = function (view, kind) {
  var v = view.parentView;

  if (kind) {
    while (v && v.kind !== kind)
      v = v.parentView;
  }

  return v || null;
};

Blaze._calculateCondition = function (cond) {
  if (cond instanceof Array && cond.length === 0)
    cond = false;
  return !! cond;
};

Blaze.With = function (data, contentFunc) {
  var view = Blaze.View('with', contentFunc);

  view.dataVar = new Blaze.ReactiveVar;

  view.onCreated(function () {
    if (typeof data === 'function') {
      view.autorun(function () {
        view.dataVar.set(data());
      }, view.parentView);
    } else {
        view.dataVar.set(data);
    }
  });

  return view;
};

Blaze.If = function (conditionFunc, contentFunc, elseFunc, _not) {
  var conditionVar = new Blaze.ReactiveVar;

  var view = Blaze.View(_not ? 'unless' : 'if', function () {
    this.autorun(function () {
      var cond = Blaze._calculateCondition(conditionFunc());
      conditionVar.set(_not ? (! cond) : cond);
    }, this.parentView);
    return conditionVar.get() ? contentFunc() :
      (elseFunc ? elseFunc() : null);
  });
  view.__conditionVar = conditionVar;

  return view;
};

Blaze.Unless = function (conditionFunc, contentFunc, elseFunc) {
  return Blaze.If(conditionFunc, contentFunc, elseFunc, true /*_not*/);
};

Blaze.Each = function (argFunc, contentFunc, elseFunc) {
  var eachView = Blaze.View('each', function () {
    var subviews = this.initialSubviews;
    this.initialSubviews = null;
    if (this.isBeingExpanded)
      this.expandedValueDep = new Deps.Dependency;
    return subviews;
  });
  eachView.initialSubviews = [];
  eachView.numItems = 0;
  eachView.inElseMode = false;
  eachView.stopHandle = null;
  eachView.contentFunc = contentFunc;
  eachView.elseFunc = elseFunc;
  eachView.argVar = new Blaze.ReactiveVar;

  eachView.onCreated(function () {
    // We evaluate argFunc in an autorun to make sure
    // Blaze.currentView is always set when it runs (rather than
    // passing argFunc straight to ObserveSequence).
    eachView.autorun(function () {
      eachView.argVar.set(argFunc());
    }, eachView.parentView);

    eachView.stopHandle = ObserveSequence.observe(function () {
      return eachView.argVar.get();
    }, {
      addedAt: function (id, item, index) {
        var newItemView = Blaze.With(item, eachView.contentFunc);
        eachView.numItems++;

        if (eachView.expandedValueDep) {
          eachView.expandedValueDep.changed();
        } else if (eachView.domrange) {
          if (eachView.inElseMode) {
            eachView.domrange.removeMember(0);
            eachView.inElseMode = false;
          }

          var range = Blaze.materializeView(newItemView, eachView);
          eachView.domrange.addMember(range, index);
        } else {
          eachView.initialSubviews.splice(index, 0, newItemView);
        }
      },
      removedAt: function (id, item, index) {
        eachView.numItems--;
        if (eachView.expandedValueDep) {
          eachView.expandedValueDep.changed();
        } else if (eachView.domrange) {
          eachView.domrange.removeMember(index);
          if (eachView.elseFunc && eachView.numItems === 0) {
            eachView.inElseMode = true;
            eachView.domrange.addMember(
              Blaze.materializeView(
                Blaze.View('each_else',eachView.elseFunc),
                eachView));
        }
        } else {
          eachView.initialSubviews.splice(index, 1);
        }
      },
      changedAt: function (id, newItem, oldItem, index) {
        var itemView;
        if (eachView.expandedValueDep) {
          eachView.expandedValueDep.changed();
        } else if (eachView.domrange) {
          itemView = eachView.domrange.getMember(index).view;
        } else {
          itemView = eachView.initialSubviews[index];
        }
        itemView.dataVar.set(newItem);
      },
      movedTo: function (id, item, fromIndex, toIndex) {
        if (eachView.expandedValueDep) {
          eachView.expandedValueDep.changed();
        } else if (eachView.domrange) {
          eachView.domrange.moveMember(fromIndex, toIndex);
        } else {
          var subviews = eachView.initialSubviews;
          var itemView = subviews[fromIndex];
          subviews.splice(fromIndex, 1);
          subviews.splice(toIndex, 0, itemView);
        }
      }
    });

    if (eachView.elseFunc && eachView.numItems === 0) {
      eachView.inElseMode = true;
      eachView.initialSubviews[0] =
        Blaze.View('each_else', eachView.elseFunc);
    }
  });

  eachView.onDestroyed(function () {
    if (eachView.stopHandle)
      eachView.stopHandle.stop();
  });

  return eachView;
};
