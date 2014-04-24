// ============================================================
// Optimizer for optimizing HTMLjs into raw HTML string when
// it doesn't contain template tags.

var constant = function (value) {
  return function () { return value; };
};

var OPTIMIZABLE = {
  NONE: 0,
  PARTS: 1,
  FULL: 2
};

var CanOptimizeVisitor = HTML.Visitor.extend({
  visitNull: constant(OPTIMIZABLE.FULL),
  visitPrimitive: constant(OPTIMIZABLE.FULL),
  visitComment: constant(OPTIMIZABLE.FULL),
  visitCharRef: constant(OPTIMIZABLE.FULL),
  visitRaw: constant(OPTIMIZABLE.FULL),
  visitObject: constant(OPTIMIZABLE.NONE),
  visitFunction: constant(OPTIMIZABLE.NONE),
  visitArray: function (x) {
    for (var i = 0; i < x.length; i++)
      if (this.visit(x[i]) !== OPTIMIZABLE.FULL)
        return OPTIMIZABLE.PARTS;
    return OPTIMIZABLE.FULL;
  },
  visitTag: function (tag) {
    var tagName = tag.tagName;
    if (tagName === 'textarea') {
      // optimizing into a TEXTAREA's RCDATA would require being a little
      // more clever.
      return OPTIMIZABLE.NONE;
    } else if (! (HTML.isKnownElement(tagName) &&
                  ! HTML.isKnownSVGElement(tagName))) {
      // foreign elements like SVG can't be stringified for innerHTML.
      return OPTIMIZABLE.NONE;
    } else if (tagName === 'table') {
      // Avoid ever producing HTML containing `<table><tr>...`, because the
      // browser will insert a TBODY.  If we just `createElement("table")` and
      // `createElement("tr")`, on the other hand, no TBODY is necessary
      // (assuming IE 8+).
      return OPTIMIZABLE.NONE;
    }

    var children = tag.children;
    for (var i = 0; i < children.length; i++)
      if (this.visit(children[i]) !== OPTIMIZABLE.FULL)
        return OPTIMIZABLE.PARTS;

    if (this.visitAttributes(tag.attrs) !== OPTIMIZABLE.FULL)
      return OPTIMIZABLE.PARTS;

    return OPTIMIZABLE.FULL;
  },
  visitAttributes: function (attrs) {
    if (attrs) {
      var isArray = HTML.isArray(attrs);
      for (var i = 0; i < (isArray ? attrs.length : 1); i++) {
        var a = (isArray ? attrs[i] : attrs);
        if ((typeof a !== 'object') || (a instanceof HTMLTools.TemplateTag))
          return OPTIMIZABLE.PARTS;
        for (var k in a)
          if (this.visit(a[k]) !== OPTIMIZABLE.FULL)
            return OPTIMIZABLE.PARTS;
      }
    }
    return OPTIMIZABLE.FULL;
  }
});

var getOptimizability = function (content) {
  return (new CanOptimizeVisitor).visit(content);
};

var toRaw = function (x) {
  return HTML.Raw(HTML.toHTML(x));
};

var TreeTransformer = HTML.TransformingVisitor.extend({
  visitAttributes: function (attrs/*, ...*/) {
    // pass template tags through by default
    if (attrs instanceof HTMLTools.TemplateTag)
      return attrs;

    return HTML.TransformingVisitor.prototype.visitAttributes.apply(
      this, arguments);
  }
});

// Replace parts of the HTMLjs tree that have no template tags (or
// tricky HTML tags) with HTML.Raw objects containing raw HTML.
var OptimizingVisitor = TreeTransformer.extend({
  visitNull: toRaw,
  visitPrimitive: toRaw,
  visitComment: toRaw,
  visitCharRef: toRaw,
  visitArray: function (array) {
    var optimizability = getOptimizability(array);
    if (optimizability === OPTIMIZABLE.FULL) {
      return toRaw(array);
    } else if (optimizability === OPTIMIZABLE.PARTS) {
      return TreeTransformer.prototype.visitArray.call(this, array);
    } else {
      return array;
    }
  },
  visitTag: function (tag) {
    var optimizability = getOptimizability(tag);
    if (optimizability === OPTIMIZABLE.FULL) {
      return toRaw(tag);
    } else if (optimizability === OPTIMIZABLE.PARTS) {
      return TreeTransformer.prototype.visitTag.call(this, tag);
    } else {
      return tag;
    }
  },
  visitChildren: function (children) {
    // don't optimize the children array into a Raw object!
    return TreeTransformer.prototype.visitArray.call(this, children);
  },
  visitAttributes: function (attrs) {
    return attrs;
  }
});

// Combine consecutive HTML.Raws.  Remove empty ones.
var RawCompactingVisitor = TreeTransformer.extend({
  visitArray: function (array) {
    var result = [];
    for (var i = 0; i < array.length; i++) {
      var item = array[i];
      if ((item instanceof HTML.Raw) &&
          ((! item.value) ||
           (result.length &&
            (result[result.length - 1] instanceof HTML.Raw)))) {
        // two cases: item is an empty Raw, or previous item is
        // a Raw as well.  In the latter case, replace the previous
        // Raw with a longer one that includes the new Raw.
        if (item.value) {
          result[result.length - 1] = HTML.Raw(
            result[result.length - 1].value + item.value);
        }
      } else {
        result.push(item);
      }
    }
    return result;
  }
});

// Replace pointless Raws like `HTMl.Raw('foo')` that contain no special
// characters with simple strings.
var RawReplacingVisitor = TreeTransformer.extend({
  visitRaw: function (raw) {
    var html = raw.value;
    if (html.indexOf('&') < 0 && html.indexOf('<') < 0) {
      return html;
    } else {
      return raw;
    }
  }
});

optimize = function (tree) {
  tree = (new OptimizingVisitor).visit(tree);
  tree = (new RawCompactingVisitor).visit(tree);
  tree = (new RawReplacingVisitor).visit(tree);
  return tree;
};
