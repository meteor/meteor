
// Tag instances are `instanceof HTML.Tag`.
//
// Tag objects should be considered immutable.
//
// This is a private constructor of an abstract class; don't call it.
HTML.Tag = function () {};
HTML.Tag.prototype.tagName = ''; // this will be set per Tag subclass
HTML.Tag.prototype.attrs = null;
HTML.Tag.prototype.children = Object.freeze ? Object.freeze([]) : [];

// Given "p", create and assign `HTML.P` if it doesn't already exist.
// Then return it.  `tagName` must have proper case (usually all lowercase).
HTML.getTag = function (tagName) {
  var symbolName = HTML.getSymbolName(tagName);
  if (symbolName === tagName) // all-caps tagName
    throw new Error("Use the lowercase or camelCase form of '" + tagName + "' here");

  if (! HTML[symbolName])
    HTML[symbolName] = makeTagConstructor(tagName);

  return HTML[symbolName];
};

// Given "p", make sure `HTML.P` exists.  `tagName` must have proper case
// (usually all lowercase).
HTML.ensureTag = function (tagName) {
  HTML.getTag(tagName); // don't return it
};

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
    if (attrs && (typeof attrs === 'object') &&
        (attrs.constructor === Object)) {
      instance.attrs = attrs;
      i++;
    }

    // If no children, don't create an array at all, use the prototype's
    // (frozen, empty) array.  This way we don't create an empty array
    // every time someone creates a tag without `new` and this constructor
    // calls itself with no arguments (above).
    if (i < arguments.length)
      instance.children = Array.prototype.slice.call(arguments, i);

    return instance;
  };
  HTMLTag.prototype = new HTML.Tag;
  HTMLTag.prototype.constructor = HTMLTag;
  HTMLTag.prototype.tagName = tagName;

  return HTMLTag;
};

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


//---------- KNOWN ELEMENTS

// These lists of known elements are public.  You can use them, for example, to
// write a helper that determines the proper case for an SVG element name.
// Such helpers that may not be needed at runtime are not provided here.

HTML.knownElementNames = 'a abbr acronym address applet area b base basefont bdo big blockquote body br button caption center cite code col colgroup dd del dfn dir div dl dt em fieldset font form frame frameset h1 h2 h3 h4 h5 h6 head hr html i iframe img input ins isindex kbd label legend li link map menu meta noframes noscript object ol optgroup option p param pre q s samp script select small span strike strong style sub sup table tbody td textarea tfoot th thead title tr tt u ul var article aside audio bdi canvas command data datagrid datalist details embed eventsource figcaption figure footer header hgroup keygen mark meter nav output progress ruby rp rt section source summary time track video wbr'.split(' ');

// omitted because also an HTML element: "a"
HTML.knownSVGElementNames = 'altGlyph altGlyphDef altGlyphItem animate animateColor animateMotion animateTransform circle clipPath color-profile cursor defs desc ellipse feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence filter font font-face font-face-format font-face-name font-face-src font-face-uri foreignObject g glyph glyphRef hkern image line linearGradient marker mask metadata missing-glyph path pattern polygon polyline radialGradient rect script set stop style svg switch symbol text textPath title tref tspan use view vkern'.split(' ');
// Append SVG element names to list of known element names
HTML.knownElementNames = HTML.knownElementNames.concat(HTML.knownSVGElementNames);

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

// Is the given element (in proper case) a known HTML element?
// This includes SVG elements.
HTML.isKnownElement = function (name) {
  return knownElementSet[name] === YES;
};

// Is the given element (in proper case) an element with no end tag
// in HTML, like "br", "hr", or "input"?
HTML.isVoidElement = function (name) {
  return voidElementSet[name] === YES;
};

// Is the given element (in proper case) a known SVG element?
HTML.isKnownSVGElement = function (name) {
  return knownSVGElementSet[name] === YES;
};

// For code generators, is a particular tag (in proper case) guaranteed
// to be available on the HTML object (under the name returned by
// getSymbolName)?
HTML.isTagEnsured = function (t) {
  return HTML.isKnownElement(t);
};

// For code generators, take a tagName like "p" and return an uppercase
// symbol name like "P" which is available on the "HTML" object for
// known elements or after calling getTag or ensureTag.
HTML.getSymbolName = function (tagName) {
  // "foo-bar" -> "FOO_BAR"
  return tagName.toUpperCase().replace(/-/g, '_');
};

// Ensure tags for all known elements
for (var i = 0; i < HTML.knownElementNames.length; i++)
  HTML.ensureTag(HTML.knownElementNames[i]);

////////////////////////////////////////////////////////////////////////////////

callReactiveFunction = function (func) {
  var result;
  var cc = Deps.currentComputation;
  var h = Deps.autorun(function (c) {
    result = func();
  });
  h.onInvalidate(function () {
    if (cc)
      cc.invalidate();
  });
  if (Deps.active) {
    Deps.onInvalidate(function () {
      h.stop();
      func.stop && func.stop();
    });
  } else {
    h.stop();
    func.stop && func.stop();
  }
  return result;
};

stopWithLater = function (instance) {
  if (instance.materialized && instance.materialized.isWith) {
    if (Deps.active)
      instance.materialized();
    else
      instance.data.stop();
  }
};

// Call all functions and instantiate all components, when fine-grained
// reactivity is not needed (for example, in attributes).
HTML.evaluate = function (node, parentComponent) {
  if (node == null) {
    return node;
  } else if (typeof node === 'function') {
    return HTML.evaluate(callReactiveFunction(node), parentComponent);
  } else if (node instanceof Array) {
    var result = [];
    for (var i = 0; i < node.length; i++)
      result.push(HTML.evaluate(node[i], parentComponent));
    return result;
  } else if (typeof node.instantiate === 'function') {
    // component
    var instance = node.instantiate(parentComponent || null);
    var content = instance.render('STATIC');
    stopWithLater(instance);
    return HTML.evaluate(content, instance);
  }  else if (node instanceof HTML.Tag) {
    var newChildren = [];
    for (var i = 0; i < node.children.length; i++)
      newChildren.push(HTML.evaluate(node.children[i], parentComponent));
    var newTag = HTML.getTag(node.tagName).apply(null, newChildren);
    newTag.attrs = {};
    for (var k in node.attrs)
      newTag.attrs[k] = HTML.evaluate(node.attrs[k], parentComponent);
    return newTag;
  } else {
    return node;
  }
};

var extendAttrs = function (tgt, src, parentComponent) {
  for (var k in src) {
    if (k === '$dynamic')
      continue;
    if (! HTML.isValidAttributeName(k))
      throw new Error("Illegal HTML attribute name: " + k);
    var value = HTML.evaluate(src[k], parentComponent);
    if (! HTML.isNully(value))
      tgt[k] = value;
  }
};

// Process the `attrs.$dynamic` directive, if present, returning the final
// attributes dictionary.  The value of `attrs.$dynamic` must be an array
// of attributes dictionaries or functions returning attribute dictionaries.
// These attributes are used to extend `attrs` as long as they are non-nully.
// All attributes are "evaluated," calling functions and instantiating
// components.
HTML.evaluateAttributes = function (attrs, parentComponent) {
  if (! attrs)
    return attrs;

  var result = {};
  extendAttrs(result, attrs, parentComponent);

  if ('$dynamic' in attrs) {
    if (! (attrs.$dynamic instanceof Array))
      throw new Error("$dynamic must be an array");
    // iterate over attrs.$dynamic, calling each element if it
    // is a function and then using it to extend `result`.
    var dynamics = attrs.$dynamic;
    for (var i = 0; i < dynamics.length; i++) {
      var moreAttrs = dynamics[i];
      if (typeof moreAttrs === 'function')
        moreAttrs = moreAttrs();
      extendAttrs(result, moreAttrs, parentComponent);
    }
  }

  return result;
};

HTML.Tag.prototype.evaluateAttributes = function (parentComponent) {
  return HTML.evaluateAttributes(this.attrs, parentComponent);
};

HTML.Raw = function (value) {
  if (! (this instanceof HTML.Raw))
    // called without `new`
    return new HTML.Raw(value);

  if (typeof value !== 'string')
    throw new Error('HTML.Raw must be constructed with a string');

  this.value = value;
};

HTML.EmitCode = function (value) {
  if (! (this instanceof HTML.EmitCode))
    // called without `new`
    return new HTML.EmitCode(value);

  if (typeof value !== 'string')
    throw new Error('HTML.EmitCode must be constructed with a string');

  this.value = value;
};
