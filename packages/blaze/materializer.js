// new Blaze._DOMMaterializer(options)
//
// An HTML.Visitor that turns HTMLjs into DOM nodes and DOMRanges.
//
// Options: `parentView`
Blaze._DOMMaterializer = HTML.Visitor.extend();
Blaze._DOMMaterializer.def({
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
    var nodes = Blaze._DOMBackend.parseHTML(raw.value);
    for (var i = 0; i < nodes.length; i++)
      intoArray.push(nodes[i]);

    return intoArray;
  },
  visitTag: function (tag, intoArray) {
    var self = this;
    var tagName = tag.tagName;
    var elem;
    if ((HTML.isKnownSVGElement(tagName) || isSVGAnchor(tag))
        && document.createElementNS) {
      // inline SVG
      elem = document.createElementNS('http://www.w3.org/2000/svg', tagName);
    } else {
      // normal elements
      elem = document.createElement(tagName);
    }

    var rawAttrs = tag.attrs;
    var children = tag.children;
    if (tagName === 'textarea' && tag.children.length &&
        ! (rawAttrs && ('value' in rawAttrs))) {
      // Provide very limited support for TEXTAREA tags with children
      // rather than a "value" attribute.
      // Reactivity in the form of Views nested in the tag's children
      // won't work.  Compilers should compile textarea contents into
      // the "value" attribute of the tag, wrapped in a function if there
      // is reactivity.
      if (typeof rawAttrs === 'function' ||
          HTML.isArray(rawAttrs)) {
        throw new Error("Can't have reactive children of TEXTAREA node; " +
                        "use the 'value' attribute instead.");
      }
      rawAttrs = _.extend({}, rawAttrs || null);
      rawAttrs.value = Blaze._expand(children, self.parentView);
      children = [];
    }

    if (rawAttrs) {
      var attrUpdater = new ElementAttributesUpdater(elem);
      var updateAttributes = function () {
        var parentView = self.parentView;
        var expandedAttrs = Blaze._expandAttributes(rawAttrs, parentView);
        var flattenedAttrs = HTML.flattenAttributes(expandedAttrs);
        var stringAttrs = {};
        for (var attrName in flattenedAttrs) {
          stringAttrs[attrName] = Blaze._toText(flattenedAttrs[attrName],
                                                parentView,
                                                HTML.TEXTMODE.STRING);
        }
        attrUpdater.update(stringAttrs);
      };
      var updaterComputation;
      if (self.parentView) {
        updaterComputation = self.parentView.autorun(updateAttributes);
      } else {
        updaterComputation = Tracker.nonreactive(function () {
          return Tracker.autorun(function () {
            Tracker._withCurrentView(self.parentView, updateAttributes);
          });
        });
      }
      Blaze._DOMBackend.Teardown.onElementTeardown(elem, function attrTeardown() {
        updaterComputation.stop();
      });
    }

    var childNodesAndRanges = self.visit(children, []);
    for (var i = 0; i < childNodesAndRanges.length; i++) {
      var x = childNodesAndRanges[i];
      if (x instanceof Blaze._DOMRange)
        x.attach(elem);
      else
        elem.appendChild(x);
    }

    intoArray.push(elem);

    return intoArray;
  },
  visitObject: function (x, intoArray) {
    if (x instanceof Blaze.Template)
      x = x.constructView();

    if (x instanceof Blaze.View) {
      intoArray.push(Blaze._materializeView(x, this.parentView));
      return intoArray;
    }

    // throw the default error
    return HTML.Visitor.prototype.visitObject.call(this, x);
  }
});

var isSVGAnchor = function (node) {
  // We generally aren't able to detect SVG <a> elements because
  // if "A" were in our list of known svg element names, then all
  // <a> nodes would be created using
  // `document.createElementNS`. But in the special case of <a
  // xlink:href="...">, we can at least detect that attribute and
  // create an SVG <a> tag in that case.
  //
  // However, we still have a general problem of knowing when to
  // use document.createElementNS and when to use
  // document.createElement; for example, font tags will always
  // be created as SVG elements which can cause other
  // problems. #1977
  return (node.tagName === "a" &&
          node.attrs &&
          node.attrs["xlink:href"] !== undefined);
};
