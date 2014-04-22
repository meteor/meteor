//////////////////// Blaze.toText

// Escaping modes for outputting text when generating HTML.
Blaze.TEXTMODE = {
  ATTRIBUTE: 1,
  RCDATA: 2,
  STRING: 3
};

var ToTextVisitor = HTML.Visitor.extend({
  visitNull: function (nullOrUndefined) {
    return '';
  },
  visitPrimitive: function (stringBooleanOrNumber) {
    return String(stringBooleanOrNumber);
  },
  visitArray: function (array) {
    var parts = [];
    for (var i = 0; i < array.length; i++)
      parts.push(this.visit(array[i]));
    return parts.join('');
  },
  visitComment: function (comment) {
    throw new Error("Can't have a comment here");
  },
  visitCharRef: function (charRef) {
    return charRef.str;
  },
  visitRaw: function (raw) {
    return raw.value;
  },
  visitTag: function (tag) {
    // Really we should just disallow Tags here.  However, at the
    // moment it's useful to stringify any HTML we find.  In
    // particular, when you include a template within `{{#markdown}}`,
    // we render the template as text, and since there's currently
    // no way to make the template be *parsed* as text (e.g. `<template
    // type="text">`), we hackishly support HTML tags in markdown
    // in templates by parsing them and stringifying them.
    return this.visit(this.toHTML(tag));
  },
  visitObject: function (x) {
    if (x instanceof Blaze.RenderPoint)
      return x.toText();

    throw new Error("Unexpected object in htmljs in toText: " + x);
  },
  toHTML: function (node) {
    return Blaze.toHTML(node);
  }
});

var ToRCDataVisitor = ToTextVisitor.extend({
  visitPrimitive: function (stringBooleanOrNumber) {
    var str = String(stringBooleanOrNumber);
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  },
  visitCharRef: function (charRef) {
    return charRef.html;
  }
});

var ToAttributeTextVisitor = ToTextVisitor.extend({
  visitPrimitive: function (stringBooleanOrNumber) {
    var str = String(stringBooleanOrNumber);
    // escape `&` and `"` this time, not `&` and `<`
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  },
  visitCharRef: function (charRef) {
    return charRef.html;
  }
});

Blaze.TEXTMODE.Visitors = {};
Blaze.TEXTMODE.Visitors[Blaze.TEXTMODE.STRING] = ToTextVisitor;
Blaze.TEXTMODE.Visitors[Blaze.TEXTMODE.RCDATA] = ToRCDataVisitor;
Blaze.TEXTMODE.Visitors[Blaze.TEXTMODE.ATTRIBUTE] = ToAttributeTextVisitor;

Blaze.toText = function (content, textMode) {
  var visitor = Blaze.TEXTMODE.Visitors[textMode];
  if (! visitor) {
    if (! textMode)
      throw new Error("textMode required for Blaze.toText");
    throw new Error("Unknown textMode: " + textMode);
  }

  return (new visitor).visit(content);
};



//////////////////// Blaze.toHTML

// This function is mainly for server-side rendering and is not in the normal
// code path for client-side rendering.

var ToHTMLVisitor = HTML.Visitor.extend({
  visitNull: function (nullOrUndefined) {
    return '';
  },
  visitPrimitive: function (stringBooleanOrNumber) {
    var str = String(stringBooleanOrNumber);
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  },
  visitArray: function (array) {
    var parts = [];
    for (var i = 0; i < array.length; i++)
      parts.push(this.visit(array[i]));
    return parts.join('');
  },
  visitComment: function (comment) {
    return '<!--' + comment.sanitizedValue + '-->';
  },
  visitCharRef: function (charRef) {
    return charRef.html;
  },
  visitRaw: function (raw) {
    return raw.value;
  },
  visitTag: function (tag) {
    var attrStrs = [];

    var attrs = tag.attrs;
    if (attrs) {
      for (var k in attrs) {
        var v = this.toText(attrs[k], Blaze.TEXTMODE.ATTRIBUTE);
        attrStrs.push(' ' + k + '="' + v + '"');
      }
    }

    var tagName = tag.tagName;
    var startTag = '<' + tagName + attrStrs.join('') + '>';

    var children = tag.children;
    var childStrs = [];
    var content;
    if (tagName === 'textarea') {

      for (var i = 0; i < children.length; i++)
        childStrs.push(this.toText(children[i], Blaze.TEXTMODE.RCDATA));

      content = childStrs.join('');
      if (content.slice(0, 1) === '\n')
        // TEXTAREA will absorb a newline, so if we see one, add
        // another one.
        content = '\n' + content;

    } else {
      for (var i = 0; i < children.length; i++)
        childStrs.push(this.visit(children[i]));

      content = childStrs.join('');
    }

    var result = startTag + content;

    if (children.length || ! HTML.isVoidElement(tagName)) {
      // "Void" elements like BR are the only ones that don't get a close
      // tag in HTML5.  They shouldn't have contents, either, so we could
      // throw an error upon seeing contents here.
      result += '</' + tagName + '>';
    }

    return result;
  },
  visitObject: function (x) {
    if (x instanceof Blaze.RenderPoint)
      return x.toHTML();

    throw new Error("Unexpected object in htmljs in toHTML: " + x);
  },
  toText: function (node, textMode) {
    return Blaze.toText(node, textMode);
  }
});

Blaze.toHTML = function (content) {
  return (new ToHTMLVisitor).visit(content);
};


//////////////////// evaluate

var IDENT = function (x) { return x; };

var EvaluatingVisitor = HTML.TransformingVisitor.extend({
  visitObject: function (x) {
    if (x instanceof Blaze.RenderPoint)
      return x.evaluate();

    // this will throw an error; other objects are not allowed!
    return HTML.TransformingVisitor.prototype.visitObject.call(this, x);
  },
  visitAttributes: function (attrs) {
    if (attrs instanceof Blaze.Var)
      attrs = attrs.get();

    // call super
    return HTML.TransformingVisitor.prototype.visitAttributes.call(this, attrs);
  }
});

// Expand all Vars and components, making the current computation depend on them.
Blaze.evaluate = function (content) {
  return (new EvaluatingVisitor).visit(content);
};

Blaze._evaluateAttributes = function (attrs) {
  return (new EvaluatingVisitor).visitAttributes(attrs);
};

//////////////////// Blaze.toDOM

var ToDOMVisitor = HTML.Visitor.extend({
  visitNull: function (x, intoArray) {
    return intoArray;
  },
  visitPrimitive: function (primitive, intoArray) {
    var string = String(primitive);
    intoArray.push(document.createTextNode(string));
    return intoArray;
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
    var nodes = DOMBackend.parseHTML(raw.value);
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
      Blaze._onAutorun(Deps.autorun(function (c) {
        Blaze.withCurrentController(controller, function () {
          var evaledAttrs = Blaze._evaluateAttributes(rawAttrs);
          var flattenedAttrs = HTML.flattenAttributes(evaledAttrs);
          var stringAttrs = {};
          for (var attrName in flattenedAttrs) {
            stringAttrs[attrName] = Blaze.toText(flattenedAttrs[attrName],
                                                 Blaze.TEXTMODE.STRING);
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
    if (x instanceof Blaze.RenderPoint) {
      intoArray.push(x.createDOMRange());
      return intoArray;
    }

    // throw the default error
    return HTML.Visitor.prototype.visitObject.call(this, x);
  }
});

Blaze.toDOM = function (content) {
  return (new ToDOMVisitor).visit(content, []);
};
