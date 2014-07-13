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
    if (tagName === 'textarea' && ! (rawAttrs && ('value' in rawAttrs))) {
      // turn TEXTAREA contents into a value attribute.
      // Reactivity in the form of nested Views won't work here
      // because the Views have already been instantiated.  To
      // get Views in a textarea they need to be wrapped in a
      // function and provided as the "value" attribute by the
      // compiler.
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
          stringAttrs[attrName] = Blaze.toText(flattenedAttrs[attrName],
                                               parentView,
                                               HTML.TEXTMODE.STRING);
        }
        attrUpdater.update(stringAttrs);
      };
      var updaterComputation;
      if (self.parentView) {
        updaterComputation = self.parentView.autorun(updateAttributes);
      } else {
        updaterComputation = Deps.nonreactive(function () {
          return Deps.autorun(function () {
            Deps.withCurrentView(self.parentView, updateAttributes);
          });
        });
      }
      Blaze.DOMBackend.Teardown.onElementTeardown(elem, function attrTeardown() {
        updaterComputation.stop();
      });
    }

    var childNodesAndRanges = self.visit(children, []);
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
    if (Blaze.isTemplate(x))
      x = Blaze.runTemplate(x);
    if (x instanceof Blaze.View) {
      intoArray.push(Blaze.materializeView(x, this.parentView));
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
