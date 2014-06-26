// TODO
//
// - DOMRange
//   - kill DOMAugmenter
//   - consider moving to _callbacks (including memberOut)
// - attributes
// - materializers.js
// - write EACH

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

Blaze.View.prototype.autorun = function (f) {
  if (! this.isCreated)
    throw new Error("View#autorun must be called from the created callback at the earliest");
  if (Deps.active)
    throw new Error("Can't call View#autorun from an active Deps Computation; try calling it from a callback like created or rendered.");

  var comp = Deps.autorun(f);
  this.onDestroyed(function () { comp.stop(); });
};

Blaze._fireCallbacks = function (view, which) {
  Deps.nonreactive(function fireCallbacks() {
    var cbs = view._callbacks[which];
    for (var i = 0, N = (cbs && cbs.length); i < N; i++)
      cbs[i].call(view);
  });
};

Blaze.materializeView = function (view, parentView) {
  view.parentView = (parentView || null);

  if (view.isCreated)
    throw new Error("Can't materialize the same View twice");
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
  Deps.nonreactive(function () {
    view.autorun(function doRender(c) {
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
  });

  domrange.onAttached(function attached(range, element) {
    Blaze.DOMBackend.Teardown.onElementTeardown(element, function teardown() {
      Blaze.destroyView(view, true /* _viaTeardown */);
    });

    scheduleRenderedCallback();
  });

  return domrange;
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

// new Blaze.DOMMaterializer(options)
//
// An HTML.Visitor that turns HTMLjs into DOM nodes and DOMRanges.
//
// Options: `parentView`
Blaze.DOMMaterializer = HTML.Visitor.extend();
Blaze.DOMMaterializer.def({
  visitNull: function (x, intoArray) {
    return intoArray;
  },
  visitPrimitive: function (primitive, intoArray) {
    var string = String(primitive);
    intoArray.push(document.createTextNode(string));
    return intoArray;
  },
  visitCharRef: function (charRef, intoArray) {
    return this.visitPrimitive(charRef.str, intoArray);
  },
  visitArray: function (array, intoArray) {
    for (var i = 0; i < array.length; i++)
      this.visit(array[i], intoArray);
    return intoArray;
  },
  visitComment: function (comment, intoArray) {
    intoArray.push(document.createComment(comment.sanitizedValue));
    return intoArray;
  },
  visitRaw: function (raw, intoArray) {
    // Get an array of DOM nodes by using the browser's HTML parser
    // (like innerHTML).
    var nodes = Blaze.DOMBackend.parseHTML(raw.value);
    for (var i = 0; i < nodes.length; i++)
      intoArray.push(nodes[i]);

    return intoArray;
  },
  visitTag: function (tag, intoArray) {
    var tagName = tag.tagName;
    var elem;
    if (HTML.isKnownSVGElement(tagName) && document.createElementNS) {
      // inline SVG
      elem = document.createElementNS('http://www.w3.org/2000/svg', tagName);
    } else {
      // normal elements
      elem = document.createElement(tagName);
    }

    var rawAttrs = tag.attrs;
    var children = tag.children;
    if (tagName === 'textarea') {
      // turn TEXTAREA contents into a value attribute
      rawAttrs = (rawAttrs || {});
      rawAttrs.value = children;
      children = [];
    }

    if (rawAttrs) {
      var attrUpdater = new ElementAttributesUpdater(elem);
      var controller = Blaze.currentController;
      Blaze._wrapAutorun(Deps.autorun(function (c) {
        Blaze.withCurrentController(controller, function () {
          var evaledAttrs = Blaze._evaluateAttributes(rawAttrs);
          var flattenedAttrs = HTML.flattenAttributes(evaledAttrs);
          var stringAttrs = {};
          for (var attrName in flattenedAttrs) {
            stringAttrs[attrName] = Blaze._toText(flattenedAttrs[attrName],
                                                  HTML.TEXTMODE.STRING);
          }
          attrUpdater.update(stringAttrs);
        });
      }));
    }

    var childNodesAndRanges = this.visit(children, []);
    for (var i = 0; i < childNodesAndRanges.length; i++) {
      var x = childNodesAndRanges[i];
      if (x instanceof Blaze.DOMRange)
        x.attach(elem);
      else
        elem.appendChild(x);
    }

    intoArray.push(elem);

    return intoArray;
  },
  visitObject: function (x, intoArray) {
    if (x instanceof Blaze.View) {
      intoArray.push(Blaze.materializeView(x, this.parentView));
      return intoArray;
    }

    // throw the default error
    return HTML.Visitor.prototype.visitObject.call(this, x);
  }
});

Blaze.render3 = function (contentFunc) {
  return Blaze.materializeView(Blaze.View('render', contentFunc));
};

Blaze.With3 = function (dataFunc, contentFunc) {
  var view = Blaze.View('with', contentFunc);

  view.dataVar = new Blaze.ReactiveVar;

  view.onCreated(function () {
    this.autorun(function () {
      this.dataVar.set(dataFunc());
    });
  });
};

/*Blaze._eachView = function (argFunc, contentFunc, elseContentFunc) {
  var view = Blaze.View(function () {

  });
  var initialSubviews = [];

  var elseMode = false;
  var handle = ObserveSequence.observe(argFunc, {
    addedAt: function (id, item, index) {
      if (view.domrange) {
        if (elseMode) {
          view.domrange.removeMember(0);
          elseMode = false;
        }

      var dataVar = Blaze.Var(item);
      var func = function () {
        return Blaze.With(dataVar, contentFunc);
      };
      func.dataVar = dataVar;
      seq.addItem(func, index);
    }
  });

};
*/
