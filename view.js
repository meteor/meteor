Blaze.View = function (render) {
  this.render = render;

  this._createdCallbacks = [];
  this._destroyedCallbacks = [];
};

Blaze.View.prototype.render = function () { return null; };

Blaze.View.prototype.isCreated = false;
Blaze.View.prototype.onCreated = function (cb) {
  this._createdCallbacks.push(cb);
};
Blaze.View.prototype.isDestroyed = false;
Blaze.View.prototype.onDestroyed = function (cb) {
  this._destroyedCallbacks.push(cb);
};

Blaze._destroyView = function (view) {
  if (view.isDestroyed)
    return;
  view.isDestroyed = true;

  var cbs = view._destroyedCallbacks;
  for (var i = 0; i < cbs.length; i++)
    cbs[i].call(view);
};

Blaze.View.prototype.autorun = function (f) {

};

Blaze._materializeView = function (view, parentView) {
  view.parentView = (parentView || null);

  if (view.isCreated)
    throw new Error("Can't materialize the same View twice");
  view.isCreated = true;

  Deps.nonreactive(function () {
    var cbs = view._createdCallbacks;
    for (var i = 0; i < cbs.length; i++)
      cbs[i].call(view);
  });

  var domrange = new Blaze.DOMRange;
  view.domrange = domrange;
  domrange.view = view;

  var lastHtmljs;
  var comp = Deps.autorun(function (c) {
    var htmljs = view.render();

    Deps.nonreactive(function () {
      var materializer = new Blaze.Materializer({parentView: view});
      var rangesAndNodes = materializer.visit(htmljs, []);
      if (c.firstRun || ! Blaze._isContentEqual(lastHtmljs, htmljs))
        domrange.setMembers(rangesAndNodes);
    });
    lastHtmljs = htmljs;
  });

  view._destroyedCallbacks.push(function () { comp.stop(); });

  return domrange;
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

// new Blaze.Materializer(options)
//
// An HTML.Visitor that turns HTMLjs into DOM nodes and DOMRanges.
//
// Options: `parentView`
Blaze.Materializer = HTML.Visitor.extend();
Blaze.Materializer.def({
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
      intoArray.push(Blaze._materializeView(x, this.parentView));
      return intoArray;
    }

    // throw the default error
    return HTML.Visitor.prototype.visitObject.call(this, x);
  }
});
