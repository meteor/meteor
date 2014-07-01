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
    if (HTML.isKnownSVGElement(tagName) && document.createElementNS) {
      // inline SVG
      elem = document.createElementNS('http://www.w3.org/2000/svg', tagName);
    } else {
      // normal elements
      elem = document.createElement(tagName);
    }

    var rawAttrs = tag.attrs;
    var children = tag.children;
    if (tagName === 'textarea' && ! ('value' in rawAttrs)) {
      // turn TEXTAREA contents into a value attribute
      rawAttrs = (rawAttrs || {});
      rawAttrs.value = children;
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
