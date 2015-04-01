/// [new] Blaze.View([name], renderMethod)
///
/// Blaze.View is the building block of reactive DOM.  Views have
/// the following features:
///
/// * lifecycle callbacks - Views are created, rendered, and destroyed,
///   and callbacks can be registered to fire when these things happen.
///
/// * parent pointer - A View points to its parentView, which is the
///   View that caused it to be rendered.  These pointers form a
///   hierarchy or tree of Views.
///
/// * render() method - A View's render() method specifies the DOM
///   (or HTML) content of the View.  If the method establishes
///   reactive dependencies, it may be re-run.
///
/// * a DOMRange - If a View is rendered to DOM, its position and
///   extent in the DOM are tracked using a DOMRange object.
///
/// When a View is constructed by calling Blaze.View, the View is
/// not yet considered "created."  It doesn't have a parentView yet,
/// and no logic has been run to initialize the View.  All real
/// work is deferred until at least creation time, when the onViewCreated
/// callbacks are fired, which happens when the View is "used" in
/// some way that requires it to be rendered.
///
/// ...more lifecycle stuff
///
/// `name` is an optional string tag identifying the View.  The only
/// time it's used is when looking in the View tree for a View of a
/// particular name; for example, data contexts are stored on Views
/// of name "with".  Names are also useful when debugging, so in
/// general it's good for functions that create Views to set the name.
/// Views associated with templates have names of the form "Template.foo".

/**
 * @class
 * @summary Constructor for a View, which represents a reactive region of DOM.
 * @locus Client
 * @param {String} [name] Optional.  A name for this type of View.  See [`view.name`](#view_name).
 * @param {Function} renderFunction A function that returns [*renderable content*](#renderable_content).  In this function, `this` is bound to the View.
 */
Blaze.View = function (name, render) {
  if (! (this instanceof Blaze.View))
    // called without `new`
    return new Blaze.View(name, render);

  if (typeof name === 'function') {
    // omitted "name" argument
    render = name;
    name = '';
  }
  this.name = name;
  this._render = render;

  this._callbacks = {
    created: null,
    rendered: null,
    destroyed: null
  };

  // Setting all properties here is good for readability,
  // and also may help Chrome optimize the code by keeping
  // the View object from changing shape too much.
  this.isCreated = false;
  this._isCreatedForExpansion = false;
  this.isRendered = false;
  this._isAttached = false;
  this.isDestroyed = false;
  this._isInRender = false;
  this.parentView = null;
  this._domrange = null;
  // This flag is normally set to false except for the cases when view's parent
  // was generated as part of expanding some syntactic sugar expressions or
  // methods.
  // Ex.: Blaze.renderWithData is an equivalent to creating a view with regular
  // Blaze.render and wrapping it into {{#with data}}{{/with}} view. Since the
  // users don't know anything about these generated parent views, Blaze needs
  // this information to be available on views to make smarter decisions. For
  // example: removing the generated parent view with the view on Blaze.remove.
  this._hasGeneratedParent = false;

  this.renderCount = 0;
};

Blaze.View.prototype._render = function () { return null; };

Blaze.View.prototype.onViewCreated = function (cb) {
  this._callbacks.created = this._callbacks.created || [];
  this._callbacks.created.push(cb);
};

Blaze.View.prototype._onViewRendered = function (cb) {
  this._callbacks.rendered = this._callbacks.rendered || [];
  this._callbacks.rendered.push(cb);
};

Blaze.View.prototype.onViewReady = function (cb) {
  var self = this;
  var fire = function () {
    Tracker.afterFlush(function () {
      if (! self.isDestroyed) {
        Blaze._withCurrentView(self, function () {
          cb.call(self);
        });
      }
    });
  };
  self._onViewRendered(function onViewRendered() {
    if (self.isDestroyed)
      return;
    if (! self._domrange.attached)
      self._domrange.onAttached(fire);
    else
      fire();
  });
};

Blaze.View.prototype.onViewDestroyed = function (cb) {
  this._callbacks.destroyed = this._callbacks.destroyed || [];
  this._callbacks.destroyed.push(cb);
};

/// View#autorun(func)
///
/// Sets up a Tracker autorun that is "scoped" to this View in two
/// important ways: 1) Blaze.currentView is automatically set
/// on every re-run, and 2) the autorun is stopped when the
/// View is destroyed.  As with Tracker.autorun, the first run of
/// the function is immediate, and a Computation object that can
/// be used to stop the autorun is returned.
///
/// View#autorun is meant to be called from View callbacks like
/// onViewCreated, or from outside the rendering process.  It may not
/// be called before the onViewCreated callbacks are fired (too early),
/// or from a render() method (too confusing).
///
/// Typically, autoruns that update the state
/// of the View (as in Blaze.With) should be started from an onViewCreated
/// callback.  Autoruns that update the DOM should be started
/// from either onViewCreated (guarded against the absence of
/// view._domrange), or onViewReady.
Blaze.View.prototype.autorun = function (f, _inViewScope, displayName) {
  var self = this;

  // The restrictions on when View#autorun can be called are in order
  // to avoid bad patterns, like creating a Blaze.View and immediately
  // calling autorun on it.  A freshly created View is not ready to
  // have logic run on it; it doesn't have a parentView, for example.
  // It's when the View is materialized or expanded that the onViewCreated
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
  // `view`, and automatically wrap it in `view.onViewCreated`, deferring
  // the autorun so that it starts at an appropriate time.  However,
  // then we can't return the Computation object to the caller, because
  // it doesn't exist yet.
  if (! self.isCreated) {
    throw new Error("View#autorun must be called from the created callback at the earliest");
  }
  if (this._isInRender) {
    throw new Error("Can't call View#autorun from inside render(); try calling it from the created or rendered callback");
  }
  if (Tracker.active) {
    throw new Error("Can't call View#autorun from a Tracker Computation; try calling it from the created or rendered callback");
  }

  // Each local variable allocate additional space on each frame of the
  // execution stack. When too many variables are allocated on stack, you can
  // run out of memory on stack running a deep recursion (which is typical for
  // Blaze functions) and get stackoverlow error. (The size of the stack varies
  // between browsers).
  // The trick we use here is to allocate only one variable on stack `locals`
  // that keeps references to all the rest. Since locals is allocated on heap,
  // we don't take up any space on the stack.
  var locals = {};
  locals.templateInstanceFunc = Blaze.Template._currentTemplateInstanceFunc;

  locals.f = function viewAutorun(c) {
    return Blaze._withCurrentView(_inViewScope || self, function () {
      return Blaze.Template._withTemplateInstanceFunc(locals.templateInstanceFunc, function () {
        return f.call(self, c);
      });
    });
  };

  // Give the autorun function a better name for debugging and profiling.
  // The `displayName` property is not part of the spec but browsers like Chrome
  // and Firefox prefer it in debuggers over the name function was declared by.
  locals.f.displayName =
    (self.name || 'anonymous') + ':' + (displayName || 'anonymous');
  locals.c = Tracker.autorun(locals.f);

  self.onViewDestroyed(function () { locals.c.stop(); });

  return locals.c;
};

Blaze.View.prototype._errorIfShouldntCallSubscribe = function () {
  var self = this;

  if (! self.isCreated) {
    throw new Error("View#subscribe must be called from the created callback at the earliest");
  }
  if (self._isInRender) {
    throw new Error("Can't call View#subscribe from inside render(); try calling it from the created or rendered callback");
  }
  if (self.isDestroyed) {
    throw new Error("Can't call View#subscribe from inside the destroyed callback, try calling it inside created or rendered.");
  }
};

/**
 * Just like Blaze.View#autorun, but with Meteor.subscribe instead of
 * Tracker.autorun. Stop the subscription when the view is destroyed.
 * @return {SubscriptionHandle} A handle to the subscription so that you can
 * see if it is ready, or stop it manually
 */
Blaze.View.prototype.subscribe = function (args, options) {
  var self = this;
  options = {} || options;

  self._errorIfShouldntCallSubscribe();

  var subHandle;
  if (options.connection) {
    subHandle = options.connection.subscribe.apply(options.connection, args);
  } else {
    subHandle = Meteor.subscribe.apply(Meteor, args);
  }

  self.onViewDestroyed(function () {
    subHandle.stop();
  });

  return subHandle;
};

Blaze.View.prototype.firstNode = function () {
  if (! this._isAttached)
    throw new Error("View must be attached before accessing its DOM");

  return this._domrange.firstNode();
};

Blaze.View.prototype.lastNode = function () {
  if (! this._isAttached)
    throw new Error("View must be attached before accessing its DOM");

  return this._domrange.lastNode();
};

Blaze._fireCallbacks = function (view, which) {
  Blaze._withCurrentView(view, function () {
    Tracker.nonreactive(function fireCallbacks() {
      var cbs = view._callbacks[which];
      for (var i = 0, N = (cbs && cbs.length); i < N; i++)
        cbs[i].call(view);
    });
  });
};

Blaze._createView = function (view, parentView, forExpansion) {
  if (view.isCreated)
    throw new Error("Can't render the same View twice");

  view.parentView = (parentView || null);
  view.isCreated = true;
  if (forExpansion)
    view._isCreatedForExpansion = true;

  Blaze._fireCallbacks(view, 'created');
};

var doFirstRender = function (view, initialContent) {
  var domrange = new Blaze._DOMRange(initialContent);
  view._domrange = domrange;
  domrange.view = view;
  view.isRendered = true;
  Blaze._fireCallbacks(view, 'rendered');

  var teardownHook = null;

  domrange.onAttached(function attached(range, element) {
    view._isAttached = true;

    teardownHook = Blaze._DOMBackend.Teardown.onElementTeardown(
      element, function teardown() {
        Blaze._destroyView(view, true /* _skipNodes */);
      });
  });

  // tear down the teardown hook
  view.onViewDestroyed(function () {
    teardownHook && teardownHook.stop();
    teardownHook = null;
  });

  return domrange;
};

// Take an uncreated View `view` and create and render it to DOM,
// setting up the autorun that updates the View.  Returns a new
// DOMRange, which has been associated with the View.
//
// The private arguments `_workStack` and `_intoArray` are passed in
// by Blaze._materializeDOM.  If provided, then we avoid the mutual
// recursion of calling back into Blaze._materializeDOM so that deep
// View hierarchies don't blow the stack.  Instead, we push tasks onto
// workStack for the initial rendering and subsequent setup of the
// View, and they are done after we return.  When there is a
// _workStack, we do not return the new DOMRange, but instead push it
// into _intoArray from a _workStack task.
Blaze._materializeView = function (view, parentView, _workStack, _intoArray) {
  Blaze._createView(view, parentView);

  var domrange;
  var lastHtmljs;
  // We don't expect to be called in a Computation, but just in case,
  // wrap in Tracker.nonreactive.
  Tracker.nonreactive(function () {
    view.autorun(function doRender(c) {
      // `view.autorun` sets the current view.
      view.renderCount++;
      view._isInRender = true;
      // Any dependencies that should invalidate this Computation come
      // from this line:
      var htmljs = view._render();
      view._isInRender = false;

      if (! c.firstRun) {
        Tracker.nonreactive(function doMaterialize() {
          // re-render
          var rangesAndNodes = Blaze._materializeDOM(htmljs, [], view);
          if (! Blaze._isContentEqual(lastHtmljs, htmljs)) {
            domrange.setMembers(rangesAndNodes);
            Blaze._fireCallbacks(view, 'rendered');
          }
        });
      }
      lastHtmljs = htmljs;

      // Causes any nested views to stop immediately, not when we call
      // `setMembers` the next time around the autorun.  Otherwise,
      // helpers in the DOM tree to be replaced might be scheduled
      // to re-run before we have a chance to stop them.
      Tracker.onInvalidate(function () {
        if (domrange) {
          domrange.destroyMembers();
        }
      });
    }, undefined, 'materialize');

    // first render.  lastHtmljs is the first htmljs.
    var initialContents;
    if (! _workStack) {
      initialContents = Blaze._materializeDOM(lastHtmljs, [], view);
      domrange = doFirstRender(view, initialContents);
      initialContents = null; // help GC because we close over this scope a lot
    } else {
      // We're being called from Blaze._materializeDOM, so to avoid
      // recursion and save stack space, provide a description of the
      // work to be done instead of doing it.  Tasks pushed onto
      // _workStack will be done in LIFO order after we return.
      // The work will still be done within a Tracker.nonreactive,
      // because it will be done by some call to Blaze._materializeDOM
      // (which is always called in a Tracker.nonreactive).
      initialContents = [];
      // push this function first so that it happens last
      _workStack.push(function () {
        domrange = doFirstRender(view, initialContents);
        initialContents = null; // help GC because of all the closures here
        _intoArray.push(domrange);
      });
      // now push the task that calculates initialContents
      _workStack.push([lastHtmljs, initialContents, view]);
    }
  });

  if (! _workStack) {
    return domrange;
  } else {
    return null;
  }
};

// Expands a View to HTMLjs, calling `render` recursively on all
// Views and evaluating any dynamic attributes.  Calls the `created`
// callback, but not the `materialized` or `rendered` callbacks.
// Destroys the view immediately, unless called in a Tracker Computation,
// in which case the view will be destroyed when the Computation is
// invalidated.  If called in a Tracker Computation, the result is a
// reactive string; that is, the Computation will be invalidated
// if any changes are made to the view or subviews that might affect
// the HTML.
Blaze._expandView = function (view, parentView) {
  Blaze._createView(view, parentView, true /*forExpansion*/);

  view._isInRender = true;
  var htmljs = Blaze._withCurrentView(view, function () {
    return view._render();
  });
  view._isInRender = false;

  var result = Blaze._expand(htmljs, view);

  if (Tracker.active) {
    Tracker.onInvalidate(function () {
      Blaze._destroyView(view);
    });
  } else {
    Blaze._destroyView(view);
  }

  return result;
};

// Options: `parentView`
Blaze._HTMLJSExpander = HTML.TransformingVisitor.extend();
Blaze._HTMLJSExpander.def({
  visitObject: function (x) {
    if (x instanceof Blaze.Template)
      x = x.constructView();
    if (x instanceof Blaze.View)
      return Blaze._expandView(x, this.parentView);

    // this will throw an error; other objects are not allowed!
    return HTML.TransformingVisitor.prototype.visitObject.call(this, x);
  },
  visitAttributes: function (attrs) {
    // expand dynamic attributes
    if (typeof attrs === 'function')
      attrs = Blaze._withCurrentView(this.parentView, attrs);

    // call super (e.g. for case where `attrs` is an array)
    return HTML.TransformingVisitor.prototype.visitAttributes.call(this, attrs);
  },
  visitAttribute: function (name, value, tag) {
    // expand attribute values that are functions.  Any attribute value
    // that contains Views must be wrapped in a function.
    if (typeof value === 'function')
      value = Blaze._withCurrentView(this.parentView, value);

    return HTML.TransformingVisitor.prototype.visitAttribute.call(
      this, name, value, tag);
  }
});

// Return Blaze.currentView, but only if it is being rendered
// (i.e. we are in its render() method).
var currentViewIfRendering = function () {
  var view = Blaze.currentView;
  return (view && view._isInRender) ? view : null;
};

Blaze._expand = function (htmljs, parentView) {
  parentView = parentView || currentViewIfRendering();
  return (new Blaze._HTMLJSExpander(
    {parentView: parentView})).visit(htmljs);
};

Blaze._expandAttributes = function (attrs, parentView) {
  parentView = parentView || currentViewIfRendering();
  return (new Blaze._HTMLJSExpander(
    {parentView: parentView})).visitAttributes(attrs);
};

Blaze._destroyView = function (view, _skipNodes) {
  if (view.isDestroyed)
    return;
  view.isDestroyed = true;

  Blaze._fireCallbacks(view, 'destroyed');

  // Destroy views and elements recursively.  If _skipNodes,
  // only recurse up to views, not elements, for the case where
  // the backend (jQuery) is recursing over the elements already.

  if (view._domrange)
    view._domrange.destroyMembers(_skipNodes);
};

Blaze._destroyNode = function (node) {
  if (node.nodeType === 1)
    Blaze._DOMBackend.Teardown.tearDownElement(node);
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

/**
 * @summary The View corresponding to the current template helper, event handler, callback, or autorun.  If there isn't one, `null`.
 * @locus Client
 * @type {Blaze.View}
 */
Blaze.currentView = null;

Blaze._withCurrentView = function (view, func) {
  var oldView = Blaze.currentView;
  try {
    Blaze.currentView = view;
    return func();
  } finally {
    Blaze.currentView = oldView;
  }
};

// Blaze.render publicly takes a View or a Template.
// Privately, it takes any HTMLJS (extended with Views and Templates)
// except null or undefined, or a function that returns any extended
// HTMLJS.
var checkRenderContent = function (content) {
  if (content === null)
    throw new Error("Can't render null");
  if (typeof content === 'undefined')
    throw new Error("Can't render undefined");

  if ((content instanceof Blaze.View) ||
      (content instanceof Blaze.Template) ||
      (typeof content === 'function'))
    return;

  try {
    // Throw if content doesn't look like HTMLJS at the top level
    // (i.e. verify that this is an HTML.Tag, or an array,
    // or a primitive, etc.)
    (new HTML.Visitor).visit(content);
  } catch (e) {
    // Make error message suitable for public API
    throw new Error("Expected Template or View");
  }
};

// For Blaze.render and Blaze.toHTML, take content and
// wrap it in a View, unless it's a single View or
// Template already.
var contentAsView = function (content) {
  checkRenderContent(content);

  if (content instanceof Blaze.Template) {
    return content.constructView();
  } else if (content instanceof Blaze.View) {
    return content;
  } else {
    var func = content;
    if (typeof func !== 'function') {
      func = function () {
        return content;
      };
    }
    return Blaze.View('render', func);
  }
};

// For Blaze.renderWithData and Blaze.toHTMLWithData, wrap content
// in a function, if necessary, so it can be a content arg to
// a Blaze.With.
var contentAsFunc = function (content) {
  checkRenderContent(content);

  if (typeof content !== 'function') {
    return function () {
      return content;
    };
  } else {
    return content;
  }
};

/**
 * @summary Renders a template or View to DOM nodes and inserts it into the DOM, returning a rendered [View](#blaze_view) which can be passed to [`Blaze.remove`](#blaze_remove).
 * @locus Client
 * @param {Template|Blaze.View} templateOrView The template (e.g. `Template.myTemplate`) or View object to render.  If a template, a View object is [constructed](#template_constructview).  If a View, it must be an unrendered View, which becomes a rendered View and is returned.
 * @param {DOMNode} parentNode The node that will be the parent of the rendered template.  It must be an Element node.
 * @param {DOMNode} [nextNode] Optional. If provided, must be a child of <em>parentNode</em>; the template will be inserted before this node. If not provided, the template will be inserted as the last child of parentNode.
 * @param {Blaze.View} [parentView] Optional. If provided, it will be set as the rendered View's [`parentView`](#view_parentview).
 */
Blaze.render = function (content, parentElement, nextNode, parentView) {
  if (! parentElement) {
    Blaze._warn("Blaze.render without a parent element is deprecated. " +
                "You must specify where to insert the rendered content.");
  }

  if (nextNode instanceof Blaze.View) {
    // handle omitted nextNode
    parentView = nextNode;
    nextNode = null;
  }

  // parentElement must be a DOM node. in particular, can't be the
  // result of a call to `$`. Can't check if `parentElement instanceof
  // Node` since 'Node' is undefined in IE8.
  if (parentElement && typeof parentElement.nodeType !== 'number')
    throw new Error("'parentElement' must be a DOM node");
  if (nextNode && typeof nextNode.nodeType !== 'number') // 'nextNode' is optional
    throw new Error("'nextNode' must be a DOM node");

  parentView = parentView || currentViewIfRendering();

  var view = contentAsView(content);
  Blaze._materializeView(view, parentView);

  if (parentElement) {
    view._domrange.attach(parentElement, nextNode);
  }

  return view;
};

Blaze.insert = function (view, parentElement, nextNode) {
  Blaze._warn("Blaze.insert has been deprecated.  Specify where to insert the " +
              "rendered content in the call to Blaze.render.");

  if (! (view && (view._domrange instanceof Blaze._DOMRange)))
    throw new Error("Expected template rendered with Blaze.render");

  view._domrange.attach(parentElement, nextNode);
};

/**
 * @summary Renders a template or View to DOM nodes with a data context.  Otherwise identical to `Blaze.render`.
 * @locus Client
 * @param {Template|Blaze.View} templateOrView The template (e.g. `Template.myTemplate`) or View object to render.
 * @param {Object|Function} data The data context to use, or a function returning a data context.  If a function is provided, it will be reactively re-run.
 * @param {DOMNode} parentNode The node that will be the parent of the rendered template.  It must be an Element node.
 * @param {DOMNode} [nextNode] Optional. If provided, must be a child of <em>parentNode</em>; the template will be inserted before this node. If not provided, the template will be inserted as the last child of parentNode.
 * @param {Blaze.View} [parentView] Optional. If provided, it will be set as the rendered View's [`parentView`](#view_parentview).
 */
Blaze.renderWithData = function (content, data, parentElement, nextNode, parentView) {
  // We defer the handling of optional arguments to Blaze.render.  At this point,
  // `nextNode` may actually be `parentView`.
  return Blaze.render(Blaze._TemplateWith(data, contentAsFunc(content)),
                          parentElement, nextNode, parentView);
};

/**
 * @summary Removes a rendered View from the DOM, stopping all reactive updates and event listeners on it.
 * @locus Client
 * @param {Blaze.View} renderedView The return value from `Blaze.render` or `Blaze.renderWithData`.
 */
Blaze.remove = function (view) {
  if (! (view && (view._domrange instanceof Blaze._DOMRange)))
    throw new Error("Expected template rendered with Blaze.render");

  while (view) {
    if (! view.isDestroyed) {
      var range = view._domrange;
      if (range.attached && ! range.parentRange)
        range.detach();
      range.destroy();
    }

    view = view._hasGeneratedParent && view.parentView;
  }
};

/**
 * @summary Renders a template or View to a string of HTML.
 * @locus Client
 * @param {Template|Blaze.View} templateOrView The template (e.g. `Template.myTemplate`) or View object from which to generate HTML.
 */
Blaze.toHTML = function (content, parentView) {
  parentView = parentView || currentViewIfRendering();

  return HTML.toHTML(Blaze._expandView(contentAsView(content), parentView));
};

/**
 * @summary Renders a template or View to HTML with a data context.  Otherwise identical to `Blaze.toHTML`.
 * @locus Client
 * @param {Template|Blaze.View} templateOrView The template (e.g. `Template.myTemplate`) or View object from which to generate HTML.
 * @param {Object|Function} data The data context to use, or a function returning a data context.
 */
Blaze.toHTMLWithData = function (content, data, parentView) {
  parentView = parentView || currentViewIfRendering();

  return HTML.toHTML(Blaze._expandView(Blaze._TemplateWith(
    data, contentAsFunc(content)), parentView));
};

Blaze._toText = function (htmljs, parentView, textMode) {
  if (typeof htmljs === 'function')
    throw new Error("Blaze._toText doesn't take a function, just HTMLjs");

  if ((parentView != null) && ! (parentView instanceof Blaze.View)) {
    // omitted parentView argument
    textMode = parentView;
    parentView = null;
  }
  parentView = parentView || currentViewIfRendering();

  if (! textMode)
    throw new Error("textMode required");
  if (! (textMode === HTML.TEXTMODE.STRING ||
         textMode === HTML.TEXTMODE.RCDATA ||
         textMode === HTML.TEXTMODE.ATTRIBUTE))
    throw new Error("Unknown textMode: " + textMode);

  return HTML.toText(Blaze._expand(htmljs, parentView), textMode);
};

/**
 * @summary Returns the current data context, or the data context that was used when rendering a particular DOM element or View from a Meteor template.
 * @locus Client
 * @param {DOMElement|Blaze.View} [elementOrView] Optional.  An element that was rendered by a Meteor, or a View.
 */
Blaze.getData = function (elementOrView) {
  var theWith;

  if (! elementOrView) {
    theWith = Blaze.getView('with');
  } else if (elementOrView instanceof Blaze.View) {
    var view = elementOrView;
    theWith = (view.name === 'with' ? view :
               Blaze.getView(view, 'with'));
  } else if (typeof elementOrView.nodeType === 'number') {
    if (elementOrView.nodeType !== 1)
      throw new Error("Expected DOM element");
    theWith = Blaze.getView(elementOrView, 'with');
  } else {
    throw new Error("Expected DOM element or View");
  }

  return theWith ? theWith.dataVar.get() : null;
};

// For back-compat
Blaze.getElementData = function (element) {
  Blaze._warn("Blaze.getElementData has been deprecated.  Use " +
              "Blaze.getData(element) instead.");

  if (element.nodeType !== 1)
    throw new Error("Expected DOM element");

  return Blaze.getData(element);
};

// Both arguments are optional.

/**
 * @summary Gets either the current View, or the View enclosing the given DOM element.
 * @locus Client
 * @param {DOMElement} [element] Optional.  If specified, the View enclosing `element` is returned.
 */
Blaze.getView = function (elementOrView, _viewName) {
  var viewName = _viewName;

  if ((typeof elementOrView) === 'string') {
    // omitted elementOrView; viewName present
    viewName = elementOrView;
    elementOrView = null;
  }

  // We could eventually shorten the code by folding the logic
  // from the other methods into this method.
  if (! elementOrView) {
    return Blaze._getCurrentView(viewName);
  } else if (elementOrView instanceof Blaze.View) {
    return Blaze._getParentView(elementOrView, viewName);
  } else if (typeof elementOrView.nodeType === 'number') {
    return Blaze._getElementView(elementOrView, viewName);
  } else {
    throw new Error("Expected DOM element or View");
  }
};

// Gets the current view or its nearest ancestor of name
// `name`.
Blaze._getCurrentView = function (name) {
  var view = Blaze.currentView;
  // Better to fail in cases where it doesn't make sense
  // to use Blaze._getCurrentView().  There will be a current
  // view anywhere it does.  You can check Blaze.currentView
  // if you want to know whether there is one or not.
  if (! view)
    throw new Error("There is no current view");

  if (name) {
    while (view && view.name !== name)
      view = view.parentView;
    return view || null;
  } else {
    // Blaze._getCurrentView() with no arguments just returns
    // Blaze.currentView.
    return view;
  }
};

Blaze._getParentView = function (view, name) {
  var v = view.parentView;

  if (name) {
    while (v && v.name !== name)
      v = v.parentView;
  }

  return v || null;
};

Blaze._getElementView = function (elem, name) {
  var range = Blaze._DOMRange.forElement(elem);
  var view = null;
  while (range && ! view) {
    view = (range.view || null);
    if (! view) {
      if (range.parentRange)
        range = range.parentRange;
      else
        range = Blaze._DOMRange.forElement(range.parentElement);
    }
  }

  if (name) {
    while (view && view.name !== name)
      view = view.parentView;
    return view || null;
  } else {
    return view;
  }
};

Blaze._addEventMap = function (view, eventMap, thisInHandler) {
  thisInHandler = (thisInHandler || null);
  var handles = [];

  if (! view._domrange)
    throw new Error("View must have a DOMRange");

  view._domrange.onAttached(function attached_eventMaps(range, element) {
    _.each(eventMap, function (handler, spec) {
      var clauses = spec.split(/,\s+/);
      // iterate over clauses of spec, e.g. ['click .foo', 'click .bar']
      _.each(clauses, function (clause) {
        var parts = clause.split(/\s+/);
        if (parts.length === 0)
          return;

        var newEvents = parts.shift();
        var selector = parts.join(' ');
        handles.push(Blaze._EventSupport.listen(
          element, newEvents, selector,
          function (evt) {
            if (! range.containsElement(evt.currentTarget))
              return null;
            var handlerThis = thisInHandler || this;
            var handlerArgs = arguments;
            return Blaze._withCurrentView(view, function () {
              return handler.apply(handlerThis, handlerArgs);
            });
          },
          range, function (r) {
            return r.parentRange;
          }));
      });
    });
  });

  view.onViewDestroyed(function () {
    _.each(handles, function (h) {
      h.stop();
    });
    handles.length = 0;
  });
};
