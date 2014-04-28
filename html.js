///!README

/**
 * # HTMLjs
 *
 * HTMLjs is a small library for expressing HTML trees with a concise
 * syntax.  It is used to render content in Blaze and to represent
 * templates during compilation.
 *
```
var UL = HTML.UL, LI = HTML.LI, B = HTML.B;

HTML.toHTML(
  UL({id: 'mylist'},
     LI({'class': 'item'}, "Hello ", B("world"), "!"),
     LI({'class': 'item'}, "Goodbye, world")))
```

```
<ul id="mylist">
  <li class="item">Hello <b>world</b>!</li>
  <li class="item">Goodbye, world</li>
</ul>
```
 *
 * The functions `UL`, `LI`, and `B` are constructors which
 * return instances of `HTML.Tag`.  These tag objects can
 * then be converted to an HTML string or directly into DOM nodes.
 *
 * The flexible structure of HTMLjs allows different kinds of Blaze
 * directives to be embedded in the tree.  HTMLjs does not know about
 * these directives, which are considered "foreign objects."
 *
 * # Built-in Types
 *
 * The following types are built into HTMLjs.  Built-in methods like
 * `HTML.toHTML` require a tree consisting only of these types.
 *
 * * __`null`, `undefined`__ - Render to nothing.
 *
 * * __boolean, number__ - Render to the string form of the boolean or number.
 *
 * * __string__ - Renders to a text node (or part of an attribute value).  All characters are safe, and no HTML injection is possible.  The string `"<a>"` renders `&lt;a>` in HTML, and `document.createTextNode("<a>")` in DOM.
 *
 * * __Array__ - Renders to its elements in order.  An array may be empty.  Arrays are detected using `HTML.isArray(...)`.
 *
 * * __`HTML.Tag`__ - Renders to an HTML element (including start tag, contents, and end tag).
 *
 * * __`HTML.CharRef({html: ..., str: ...})`__ - Renders to a character reference (such as `&nbsp`) when generating HTML.
 *
 * * __`HTML.Comment(text)`__ - Renders to an HTML comment.
 *
 * * __`HTML.Raw(html)`__ - Renders to a string of HTML to include verbatim.
 *
 * The `new` keyword is not required before constructors of HTML object types.
 *
 * All objects and arrays should be considered immutable.  Their properties
 * are public, but they should only be read, not written.  Arrays should not
 * be spliced in place.  This convention allows for clean patterns of
 * processing and transforming HTMLjs trees.
 */

HTML = {};

var IDENTITY = function (x) { return x; };
var SLICE = Array.prototype.slice;

/**
 * ## HTML.Tag
 *
 * An `HTML.Tag` is created using a tag-specific constructor, like
 * `HTML.P` for a `<p>` tag or `HTML.INPUT` for an `<input>` tag.  The
 * resulting object is `instanceof HTML.Tag`.  (The `HTML.Tag`
 * constructor should not be called directly.)
 *
 * Tag constructors take an optional attributes dictionary followed
 * by zero or more children:
 *
 * ```
 * HTML.HR()
 *
 * HTML.DIV(HTML.P("First paragraph"),
 *          HTML.P("Second paragraph"))
 *
 * HTML.INPUT({type: "text"})
 *
 * HTML.SPAN({'class': "foo"}, "Some text")
 * ```
 *
 * ### Tag properties
 *
 * Tags have the following properties:
 *
 * * `tagName` - The tag name in lowercase (or camelCase)
 * * `children` - An array of children (always present)
 * * `attrs` - An attributes dictionary, `null`, or an array (see below)
 */


HTML.Tag = function () {};
HTML.Tag.prototype.tagName = ''; // this will be set per Tag subclass
HTML.Tag.prototype.attrs = null;
HTML.Tag.prototype.children = Object.freeze ? Object.freeze([]) : [];
HTML.Tag.prototype.htmljsType = HTML.Tag.htmljsType = ['Tag'];

// Given "p" create the function `HTML.P`.
var makeTagConstructor = function (tagName) {
  // HTMLTag is the per-tagName constructor of a HTML.Tag subclass
  var HTMLTag = function HTMLTag(/*arguments*/) {
    // Work with or without `new`.  If not called with `new`,
    // perform instantiation by recursively calling this constructor.
    // We can't pass varargs, so pass no args.
    var instance = (this instanceof HTML.Tag) ? this : new HTMLTag;

    var i = 0;
    var attrs = arguments.length && arguments[0];
    if (attrs && (typeof attrs === 'object')) {
      // Treat vanilla JS object as an attributes dictionary.
      if (! HTML.isConstructedObject(attrs)) {
        instance.attrs = attrs;
        i++;
      } else if (attrs instanceof HTML.Attrs) {
        var array = attrs.value;
        if (array.length === 1) {
          instance.attrs = array[0];
        } else if (array.length > 1) {
          instance.attrs = array;
        }
        i++;
      }
    }


    // If no children, don't create an array at all, use the prototype's
    // (frozen, empty) array.  This way we don't create an empty array
    // every time someone creates a tag without `new` and this constructor
    // calls itself with no arguments (above).
    if (i < arguments.length)
      instance.children = SLICE.call(arguments, i);

    return instance;
  };
  HTMLTag.prototype = new HTML.Tag;
  HTMLTag.prototype.constructor = HTMLTag;
  HTMLTag.prototype.tagName = tagName;

  return HTMLTag;
};

/**
 * ### Special forms of attributes
 *
 * The attributes of a Tag may be an array of dictionaries.  In order
 * for a tag constructor to recognize an array as the attributes argument,
 * it must be written as `HTML.Attrs(attrs1, attrs2, ...)`, as in this
 * example:
 *
 * ```
 * var extraAttrs = {'class': "container"};
 *
 * var div = HTML.DIV(HTML.Attrs({id: "main"}, extraAttrs),
 *                    "This is the content.");
 *
 * div.attrs // => [{id: "main"}, {'class': "container"}]
 * ```
 *
 * `HTML.Attrs` may also be used to pass a foreign object in place of
 * an attributes dictionary of a tag.
 *
 */
// Not an HTMLjs node, but a wrapper to pass multiple attrs dictionaries
// to a tag (for the purpose of implementing dynamic attributes).
var Attrs = HTML.Attrs = function (/*attrs dictionaries*/) {
  // Work with or without `new`.  If not called with `new`,
  // perform instantiation by recursively calling this constructor.
  // We can't pass varargs, so pass no args.
  var instance = (this instanceof Attrs) ? this : new Attrs;

  instance.value = SLICE.call(arguments);

  return instance;
};

/**
 * ### Normalized Case for Tag Names
 *
 * The `tagName` field is always in "normalized case," which is the
 * official case for that particular element name (usually lowercase).
 * For example, `HTML.DIV().tagName` is `"div"`.  For some elements
 * used in inline SVG graphics, the correct case is "camelCase."  For
 * example, there is an element named `clipPath`.
 *
 * Web browsers have a confusing policy about case.  They perform case
 * normalization when parsing HTML, but not when creating SVG elements
 * at runtime; the correct case is required.
 *
 * Therefore, in order to avoid ever having to normalize case at
 * runtime, the policy of HTMLjs is to put the burden on the caller
 * of functions like `HTML.ensureTag` -- for example, a template
 * engine -- of supplying correct normalized case.
 *
 * Briefly put, normlized case is usually lowercase, except for certain
 * elements where it is camelCase.
 */

////////////////////////////// KNOWN ELEMENTS

/**
 * ### Known Elements
 *
 * HTMLjs comes preloaded with constructors for all "known" HTML and
 * SVG elements.  You can use `HTML.P`, `HTML.DIV`, and so on out of
 * the box.  If you want to create a tag like `<foo>` for some reason,
 * you have to tell HTMLjs to create the `HTML.FOO` constructor for you
 * using `HTML.ensureTag` or `HTML.getTag`.
 *
 * HTMLjs's lists of known elements are public because they are useful to
 * other packages that provide additional functions not found here, like
 * functions for normalizing case.
 *
 */

/**
 * ### HTML.getTag(tagName)
 *
 * * `tagName` - A string in normalized case
 *
 * Creates a tag constructor for `tagName`, assigns it to the `HTML`
 * namespace object, and returns it.
 *
 * For example, `HTML.getTag("p")` returns `HTML.P`.  `HTML.getTag("foo")`
 * will create and return `HTML.FOO`.
 *
 * It's very important that `tagName` be in normalized case, or else
 * an incorrect tag constructor will be registered and used henceforth.
 */
HTML.getTag = function (tagName) {
  var symbolName = HTML.getSymbolName(tagName);
  if (symbolName === tagName) // all-caps tagName
    throw new Error("Use the lowercase or camelCase form of '" + tagName + "' here");

  if (! HTML[symbolName])
    HTML[symbolName] = makeTagConstructor(tagName);

  return HTML[symbolName];
};

/**
 * ### HTML.ensureTag(tagName)
 *
 * * `tagName` - A string in normalized case
 *
 * Ensures that a tag constructor (like `HTML.FOO`) exists for a tag
 * name (like `"foo"`), creating it if necessary.  Like `HTML.getTag`
 * but does not return the tag constructor.
 */
HTML.ensureTag = function (tagName) {
  HTML.getTag(tagName); // don't return it
};

/**
 * ### HTML.isTagEnsured(tagName)
 *
 * * `tagName` - A string in normalized case
 *
 * Returns whether a particular tag is guaranteed to be available on
 * the `HTML` object (under the name returned by `HTML.getSymbolName`).
 *
 * Useful for code generators.
 */
HTML.isTagEnsured = function (tagName) {
  return HTML.isKnownElement(tagName);
};

/**
 * ### HTML.getSymbolName(tagName)
 *
 * * `tagName` - A string in normalized case
 *
 * Returns the name of the all-caps constructor (like `"FOO"`) for a
 * tag name in normalized case (like `"foo"`).
 *
 * In addition to converting `tagName` to all-caps, hyphens (`-`) in
 * tag names are converted to underscores (`_`).
 *
 * Useful for code generators.
 */
HTML.getSymbolName = function (tagName) {
  // "foo-bar" -> "FOO_BAR"
  return tagName.toUpperCase().replace(/-/g, '_');
};


/**
 * ### HTML.knownElementNames
 *
 * An array of all known HTML5 and SVG element names in normalized case.
 */
HTML.knownElementNames = 'a abbr acronym address applet area b base basefont bdo big blockquote body br button caption center cite code col colgroup dd del dfn dir div dl dt em fieldset font form frame frameset h1 h2 h3 h4 h5 h6 head hr html i iframe img input ins isindex kbd label legend li link map menu meta noframes noscript object ol optgroup option p param pre q s samp script select small span strike strong style sub sup table tbody td textarea tfoot th thead title tr tt u ul var article aside audio bdi canvas command data datagrid datalist details embed eventsource figcaption figure footer header hgroup keygen mark meter nav output progress ruby rp rt section source summary time track video wbr'.split(' ');
// (we add the SVG ones below)

/**
 * ### HTML.knownSVGElementNames
 *
 * An array of all known SVG element names in normalized case.
 *
 * The `"a"` element is not included because it is primarily a non-SVG
 * element.
 */
HTML.knownSVGElementNames = 'altGlyph altGlyphDef altGlyphItem animate animateColor animateMotion animateTransform circle clipPath color-profile cursor defs desc ellipse feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence filter font font-face font-face-format font-face-name font-face-src font-face-uri foreignObject g glyph glyphRef hkern image line linearGradient marker mask metadata missing-glyph path pattern polygon polyline radialGradient rect script set stop style svg switch symbol text textPath title tref tspan use view vkern'.split(' ');
// Append SVG element names to list of known element names
HTML.knownElementNames = HTML.knownElementNames.concat(HTML.knownSVGElementNames);

/**
 * ### HTML.voidElementNames
 *
 * An array of all "void" element names in normalized case.  Void
 * elements are elements with a start tag and no end tag, such as BR,
 * HR, IMG, and INPUT.
 *
 * The HTML spec defines a closed class of void elements.
 */
HTML.voidElementNames = 'area base br col command embed hr img input keygen link meta param source track wbr'.split(' ');

// Speed up search through lists of known elements by creating internal "sets"
// of strings.
var YES = {yes:true};
var makeSet = function (array) {
  var set = {};
  for (var i = 0; i < array.length; i++)
    set[array[i]] = YES;
  return set;
};
var voidElementSet = makeSet(HTML.voidElementNames);
var knownElementSet = makeSet(HTML.knownElementNames);
var knownSVGElementSet = makeSet(HTML.knownSVGElementNames);

/**
 * ### HTML.isKnownElement(tagName)
 *
 * * `tagName` - A string in normalized case
 *
 * Returns whether `tagName` is a known HTML5 or SVG element.
 */
HTML.isKnownElement = function (tagName) {
  return knownElementSet[tagName] === YES;
};

/**
 * ### HTML.isKnownSVGElement(tagName)
 *
 * * `tagName` - A string in normalized case
 *
 * Returns whether `tagName` is the name of a known SVG element.
 */
HTML.isKnownSVGElement = function (tagName) {
  return knownSVGElementSet[tagName] === YES;
};

/**
 * ### HTML.isVoidElement(tagName)
 *
 * * `tagName` - A string in normalized case
 *
 * Returns whether `tagName` is the name of a void element.
 */
HTML.isVoidElement = function (tagName) {
  return voidElementSet[tagName] === YES;
};


// Ensure tags for all known elements
for (var i = 0; i < HTML.knownElementNames.length; i++)
  HTML.ensureTag(HTML.knownElementNames[i]);


/**
 * ## HTML.CharRef({html: ..., str: ...})
 *
 * Represents a character reference like `&nbsp;`.
 *
 * A CharRef is not required for escaping special characters like `<`,
 * which are automatically escaped by HTMLjs.  For example,
 * `HTML.toHTML("<")` is `"&lt;"`.  Also, now that browsers speak
 * Unicode, non-ASCII characters typically do not need to be expressed
 * as character references either.  The purpose of `CharRef` is offer
 * control over the generated HTML, allowing template engines to
 * preserve any character references that they come across.
 *
 * Constructing a CharRef requires two strings, the uninterpreted
 * "HTML" form and the interpreted "string" form.  Both are required
 * to be present, and it is up to the caller to make sure the
 * information is accurate.
 *
 * Examples of valid CharRefs:
 *
 * * `HTML.CharRef({html: '&amp;', str: '&'})`
 * * `HTML.CharRef({html: '&nbsp;', str: '\u00A0'})
 *
 * Instance properties: `.html`, `.str`
 */
var CharRef = HTML.CharRef = function (attrs) {
  if (! (this instanceof CharRef))
    // called without `new`
    return new CharRef(attrs);

  if (! (attrs && attrs.html && attrs.str))
    throw new Error(
      "HTML.CharRef must be constructed with ({html:..., str:...})");

  this.html = attrs.html;
  this.str = attrs.str;
};
CharRef.prototype.htmljsType = CharRef.htmljsType = ['CharRef'];

/// ## HTML.Comment(value)
var Comment = HTML.Comment = function (value) {
  if (! (this instanceof Comment))
    // called without `new`
    return new Comment(value);

  if (typeof value !== 'string')
    throw new Error('HTML.Comment must be constructed with a string');

  this.value = value;
  // Kill illegal hyphens in comment value (no way to escape them in HTML)
  this.sanitizedValue = value.replace(/^-|--+|-$/g, '');
};
Comment.prototype.htmljsType = Comment.htmljsType = ['Comment'];

/// ## HTML.Raw(value)
var Raw = HTML.Raw = function (value) {
  if (! (this instanceof Raw))
    // called without `new`
    return new Raw(value);

  if (typeof value !== 'string')
    throw new Error('HTML.Raw must be constructed with a string');

  this.value = value;
};
Raw.prototype.htmljsType = Raw.htmljsType = ['Raw'];


HTML.isArray = function (x) {
  return (x instanceof Array);
};

HTML.isConstructedObject = function (x) {
  return (x && (typeof x === 'object') &&
          (x.constructor !== Object) &&
          (! Object.prototype.hasOwnProperty.call(x, 'constructor')));
};

HTML.isNully = function (node) {
  if (node == null)
    // null or undefined
    return true;

  if (HTML.isArray(node)) {
    // is it an empty array or an array of all nully items?
    for (var i = 0; i < node.length; i++)
      if (! HTML.isNully(node[i]))
        return false;
    return true;
  }

  return false;
};

// The HTML spec and the DOM API (in particular `setAttribute`) have different
// definitions of what characters are legal in an attribute.  The HTML
// parser is extremely permissive (allowing, for example, `<a %=%>`), while
// `setAttribute` seems to use something like the XML grammar for names (and
// throws an error if a name is invalid, making that attribute unsettable).
// If we knew exactly what grammar browsers used for `setAttribute`, we could
// include various Unicode ranges in what's legal.  For now, allow ASCII chars
// that are known to be valid XML, valid HTML, and settable via `setAttribute`:
//
// * Starts with `:`, `_`, `A-Z` or `a-z`
// * Consists of any of those plus `-`, `.`, and `0-9`.
//
// See <http://www.w3.org/TR/REC-xml/#NT-Name> and
// <http://dev.w3.org/html5/markup/syntax.html#syntax-attributes>.
HTML.isValidAttributeName = function (name) {
  return /^[:_A-Za-z][:_A-Za-z0-9.\-]*/.test(name);
};

// If `attrs` is an array of attributes dictionaries, combines them
// into one.  Removes attributes that are "nully."
HTML.flattenAttributes = function (attrs) {
  if (! attrs)
    return attrs;

  var isArray = HTML.isArray(attrs);
  if (attrs.length === 0)
    return null;

  var result = {};
  for (var i = 0, N = (isArray ? attrs.length : 1); i < N; i++) {
    var oneAttrs = (isArray ? attrs[i] : attrs);
    for (var name in oneAttrs) {
      if (! HTML.isValidAttributeName(name))
        throw new Error("Illegal HTML attribute name: " + name);
      var value = oneAttrs[name];
      if (! HTML.isNully(value))
        result[name] = value;
    }
  }

  return result;
};


/**
 * ## Foreign objects
 *
 * Arbitrary objects are allowed in HTMLjs trees, which is useful for
 * adapting HTMLjs to a wide variety of uses.  Such objects are called
 * foreign objects.
 *
 * The one restriction on foreign objects is that they must be
 * instances of a class -- so-called "constructed objects" (see
 * `HTML.isConstructedObject`) -- so that they can be distinguished
 * from the vanilla JS objects that represent attributes dictionaries
 * when constructing Tags.
 */



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

HTML.Visitor.extend = function (options) {
  var curType = this;
  var subType = function HTMLVisitorSubtype(/*arguments*/) {
    HTML.Visitor.apply(this, arguments);
  };
  subType.prototype = new curType;
  subType.extend = curType.extend;
  if (options)
    _assign(subType.prototype, options);
  return subType;
};

_assign(HTML.Visitor.prototype, {
  visit: function (content/*, ...*/) {
    if (content == null)
      // null or undefined.
      return this.visitNull.apply(this, arguments);

    if (typeof content === 'object') {
      if (content.htmljsType) {
        switch (content.htmljsType) {
        case HTML.Tag.htmljsType:
          return this.visitTag.apply(this, arguments);
        case CharRef.htmljsType:
          return this.visitCharRef.apply(this, arguments);
        case Comment.htmljsType:
          return this.visitComment.apply(this, arguments);
        case Raw.htmljsType:
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
  visitFunction: function (obj/*, ...*/) {
    throw new Error("Unexpected function in htmljs: " + obj);
  }
});

HTML.TransformingVisitor = HTML.Visitor.extend({
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

////////////////////////////// TOHTML

// Escaping modes for outputting text when generating HTML.
HTML.TEXTMODE = {
  STRING: 1,
  RCDATA: 2,
  ATTRIBUTE: 3
};

HTML.ToTextVisitor = HTML.Visitor.extend({
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

HTML.toText = function (content, textMode) {
  if (! textMode)
    throw new Error("textMode required for HTML.toText");
  if (! (textMode === HTML.TEXTMODE.STRING ||
         textMode === HTML.TEXTMODE.RCDATA ||
         textMode === HTML.TEXTMODE.ATTRIBUTE))
    throw new Error("Unknown textMode: " + textMode);

  var visitor = new HTML.ToTextVisitor({textMode: textMode});;
  return visitor.visit(content);
};

HTML.ToHTMLVisitor = HTML.Visitor.extend({
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
      attrs = HTML.flattenAttributes(attrs);
      for (var k in attrs) {
        var v = this.toText(attrs[k], HTML.TEXTMODE.ATTRIBUTE);
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

HTML.toHTML = function (content) {
  return (new HTML.ToHTMLVisitor).visit(content);
};
