

HTML.Tag = function () {};
HTML.Tag.prototype.tagName = ''; // this will be set per Tag subclass
HTML.Tag.prototype.attrs = null;
HTML.Tag.prototype.children = Object.freeze ? Object.freeze([]) : [];
HTML.Tag.prototype.htmljsType = HTML.Tag.htmljsType = ['Tag'];

// Given "p" create the function `HTML.P`.
var makeTagConstructor = function (tagName) {
  // HTMLTag is the per-tagName constructor of a HTML.Tag subclass
  var HTMLTag = function (/*arguments*/) {
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

////////////////////////////// KNOWN ELEMENTS

HTML.getTag = function (tagName) {
  var symbolName = HTML.getSymbolName(tagName);
  if (symbolName === tagName) // all-caps tagName
    throw new Error("Use the lowercase or camelCase form of '" + tagName + "' here");

  if (! HTML[symbolName])
    HTML[symbolName] = makeTagConstructor(tagName);

  return HTML[symbolName];
};

HTML.ensureTag = function (tagName) {
  HTML.getTag(tagName); // don't return it
};

HTML.isTagEnsured = function (tagName) {
  return HTML.isKnownElement(tagName);
};

HTML.getSymbolName = function (tagName) {
  // "foo-bar" -> "FOO_BAR"
  return tagName.toUpperCase().replace(/-/g, '_');
};

HTML.knownElementNames = 'a abbr acronym address applet area article aside audio b base basefont bdi bdo big blockquote body br button canvas caption center cite code col colgroup command data datagrid datalist dd del details dfn dir div dl dt em embed eventsource fieldset figcaption figure font footer form frame frameset h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input ins isindex kbd keygen label legend li link main map mark menu meta meter nav noframes noscript object ol optgroup option output p param pre progress q rp rt ruby s samp script section select small source span strike strong style sub summary sup table tbody td textarea tfoot th thead time title tr track tt u ul var video wbr'.split(' ');
// (we add the SVG ones below)

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

HTML.isKnownElement = function (tagName) {
  return knownElementSet[tagName] === YES;
};

HTML.isKnownSVGElement = function (tagName) {
  return knownSVGElementSet[tagName] === YES;
};

HTML.isVoidElement = function (tagName) {
  return voidElementSet[tagName] === YES;
};


// Ensure tags for all known elements
for (var i = 0; i < HTML.knownElementNames.length; i++)
  HTML.ensureTag(HTML.knownElementNames[i]);


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
  // could change this to use the more convoluted Object.prototype.toString
  // approach that works when objects are passed between frames, but does
  // it matter?
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

HTML.isValidAttributeName = function (name) {
  return /^[:_A-Za-z][:_A-Za-z0-9.\-]*/.test(name);
};

// If `attrs` is an array of attributes dictionaries, combines them
// into one.  Removes attributes that are "nully."
HTML.flattenAttributes = function (attrs) {
  if (! attrs)
    return attrs;

  var isArray = HTML.isArray(attrs);
  if (isArray && attrs.length === 0)
    return null;

  var result = {};
  for (var i = 0, N = (isArray ? attrs.length : 1); i < N; i++) {
    var oneAttrs = (isArray ? attrs[i] : attrs);
    if ((typeof oneAttrs !== 'object') ||
        HTML.isConstructedObject(oneAttrs))
      throw new Error("Expected plain JS object as attrs, found: " + oneAttrs);
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



////////////////////////////// TOHTML

HTML.toHTML = function (content) {
  return (new HTML.ToHTMLVisitor).visit(content);
};

// Escaping modes for outputting text when generating HTML.
HTML.TEXTMODE = {
  STRING: 1,
  RCDATA: 2,
  ATTRIBUTE: 3
};


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
