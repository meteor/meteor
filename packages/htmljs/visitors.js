////////////////////////////// VISITORS

// _assign is like _.extend or the upcoming Object.assign.
// Copy src's own, enumerable properties onto tgt and return
// tgt.
var _hasOwnProperty = Object.prototype.hasOwnProperty;
var _assign = function (tgt, src) {
  for (var k in src) {
    if (_hasOwnProperty.call(src, k))
      tgt[k] = src[k];
  }
  return tgt;
};

HTML.Visitor = function (props) {
  _assign(this, props);
};

HTML.Visitor.def = function (options) {
  _assign(this.prototype, options);
};

HTML.Visitor.extend = function (options) {
  var curType = this;
  var subType = function HTMLVisitorSubtype(/*arguments*/) {
    HTML.Visitor.apply(this, arguments);
  };
  subType.prototype = new curType;
  subType.extend = curType.extend;
  subType.def = curType.def;
  if (options)
    _assign(subType.prototype, options);
  return subType;
};

HTML.Visitor.def({
  visit: function (content/*, ...*/) {
    if (content == null)
      // null or undefined.
      return this.visitNull.apply(this, arguments);

    if (typeof content === 'object') {
      if (content.htmljsType) {
        switch (content.htmljsType) {
        case HTML.Tag.htmljsType:
          return this.visitTag.apply(this, arguments);
        case HTML.CharRef.htmljsType:
          return this.visitCharRef.apply(this, arguments);
        case HTML.Comment.htmljsType:
          return this.visitComment.apply(this, arguments);
        case HTML.Raw.htmljsType:
          return this.visitRaw.apply(this, arguments);
        default:
          throw new Error("Unknown htmljs type: " + content.htmljsType);
        }
      }

      if (HTML.isArray(content))
        return this.visitArray.apply(this, arguments);

      return this.visitObject.apply(this, arguments);

    } else if ((typeof content === 'string') ||
               (typeof content === 'boolean') ||
               (typeof content === 'number')) {
      return this.visitPrimitive.apply(this, arguments);

    } else if (typeof content === 'function') {
      return this.visitFunction.apply(this, arguments);
    }

    throw new Error("Unexpected object in htmljs: " + content);

  },
  visitNull: function (nullOrUndefined/*, ...*/) {},
  visitPrimitive: function (stringBooleanOrNumber/*, ...*/) {},
  visitArray: function (array/*, ...*/) {},
  visitComment: function (comment/*, ...*/) {},
  visitCharRef: function (charRef/*, ...*/) {},
  visitRaw: function (raw/*, ...*/) {},
  visitTag: function (tag/*, ...*/) {},
  visitObject: function (obj/*, ...*/) {
    throw new Error("Unexpected object in htmljs: " + obj);
  },
  visitFunction: function (fn/*, ...*/) {
    throw new Error("Unexpected function in htmljs: " + obj);
  }
});

HTML.TransformingVisitor = HTML.Visitor.extend();
HTML.TransformingVisitor.def({
  visitNull: IDENTITY,
  visitPrimitive: IDENTITY,
  visitArray: function (array/*, ...*/) {
    var argsCopy = SLICE.call(arguments);
    var result = array;
    for (var i = 0; i < array.length; i++) {
      var oldItem = array[i];
      argsCopy[0] = oldItem;
      var newItem = this.visit.apply(this, argsCopy);
      if (newItem !== oldItem) {
        // copy `array` on write
        if (result === array)
          result = array.slice();
        result[i] = newItem;
      }
    }
    return result;
  },
  visitComment: IDENTITY,
  visitCharRef: IDENTITY,
  visitRaw: IDENTITY,
  visitObject: IDENTITY,
  visitFunction: IDENTITY,
  visitTag: function (tag/*, ...*/) {
    var oldChildren = tag.children;
    var argsCopy = SLICE.call(arguments);
    argsCopy[0] = oldChildren;
    var newChildren = this.visitChildren.apply(this, argsCopy);

    var oldAttrs = tag.attrs;
    argsCopy[0] = oldAttrs;
    var newAttrs = this.visitAttributes.apply(this, argsCopy);

    if (newAttrs === oldAttrs && newChildren === oldChildren)
      return tag;

    var newTag = HTML.getTag(tag.tagName).apply(null, newChildren);
    newTag.attrs = newAttrs;
    return newTag;
  },
  visitChildren: function (children/*, ...*/) {
    return this.visitArray.apply(this, arguments);
  },
  // Transform the `.attrs` property of a tag, which may be a dictionary,
  // an array, or in some uses, a foreign object (such as
  // a template tag).
  visitAttributes: function (attrs/*, ...*/) {
    if (HTML.isArray(attrs)) {
      var argsCopy = SLICE.call(arguments);
      var result = attrs;
      for (var i = 0; i < attrs.length; i++) {
        var oldItem = attrs[i];
        argsCopy[0] = oldItem;
        var newItem = this.visitAttributes.apply(this, argsCopy);
        if (newItem !== oldItem) {
          // copy on write
          if (result === attrs)
            result = attrs.slice();
          result[i] = newItem;
        }
      }
      return result;
    }

    if (attrs && HTML.isConstructedObject(attrs)) {
      throw new Error("The basic HTML.TransformingVisitor does not support " +
                      "foreign objects in attributes.  Define a custom " +
                      "visitAttributes for this case.");
    }

    var oldAttrs = attrs;
    var newAttrs = oldAttrs;
    if (oldAttrs) {
      var attrArgs = [null, null];
      attrArgs.push.apply(attrArgs, arguments);
      for (var k in oldAttrs) {
        var oldValue = oldAttrs[k];
        attrArgs[0] = k;
        attrArgs[1] = oldValue;
        var newValue = this.visitAttribute.apply(this, attrArgs);
        if (newValue !== oldValue) {
          // copy on write
          if (newAttrs === oldAttrs)
            newAttrs = _assign({}, oldAttrs);
          newAttrs[k] = newValue;
        }
      }
    }

    return newAttrs;
  },
  // Transform the value of one attribute name/value in an
  // attributes dictionary.
  visitAttribute: function (name, value, tag/*, ...*/) {
    var args = SLICE.call(arguments, 2);
    args[0] = value;
    return this.visit.apply(this, args);
  }
});


HTML.ToTextVisitor = HTML.Visitor.extend();
HTML.ToTextVisitor.def({
  visitNull: function (nullOrUndefined) {
    return '';
  },
  visitPrimitive: function (stringBooleanOrNumber) {
    var str = String(stringBooleanOrNumber);
    if (this.textMode === HTML.TEXTMODE.RCDATA) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    } else if (this.textMode === HTML.TEXTMODE.ATTRIBUTE) {
      // escape `&` and `"` this time, not `&` and `<`
      return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    } else {
      return str;
    }
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
    if (this.textMode === HTML.TEXTMODE.RCDATA ||
        this.textMode === HTML.TEXTMODE.ATTRIBUTE) {
      return charRef.html;
    } else {
      return charRef.str;
    }
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
    throw new Error("Unexpected object in htmljs in toText: " + x);
  },
  toHTML: function (node) {
    return HTML.toHTML(node);
  }
});



HTML.ToHTMLVisitor = HTML.Visitor.extend();
HTML.ToHTMLVisitor.def({
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

    var tagName = tag.tagName;
    var children = tag.children;

    var attrs = tag.attrs;
    if (attrs) {
      attrs = HTML.flattenAttributes(attrs);
      for (var k in attrs) {
        if (k === 'value' && tagName === 'textarea') {
          children = [attrs[k], children];
        } else {
          var v = this.toText(attrs[k], HTML.TEXTMODE.ATTRIBUTE);
          attrStrs.push(' ' + k + '="' + v + '"');
        }
      }
    }

    var startTag = '<' + tagName + attrStrs.join('') + '>';

    var childStrs = [];
    var content;
    if (tagName === 'textarea') {

      for (var i = 0; i < children.length; i++)
        childStrs.push(this.toText(children[i], HTML.TEXTMODE.RCDATA));

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
    throw new Error("Unexpected object in htmljs in toHTML: " + x);
  },
  toText: function (node, textMode) {
    return HTML.toText(node, textMode);
  }
});
