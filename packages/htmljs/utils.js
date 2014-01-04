
HTML = {};

HTML.isNully = function (node) {
  if (node == null)
    // null or undefined
    return true;

  if (node instanceof Array) {
    // is it an empty array or an array of all nully items?
    for (var i = 0; i < node.length; i++)
      if (! HTML.isNully(node[i]))
        return false;
    return true;
  }

  return false;
};

HTML.asciiLowerCase = function (str) {
  return str.replace(/[A-Z]/g, function (c) {
    return String.fromCharCode(c.charCodeAt(0) + 32);
  });
};

HTML.escapeData = function (str) {
  // string; escape the two special chars in HTML data and RCDATA
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;');
};

var svgCamelCaseAttributes = 'attributeName attributeType baseFrequency baseProfile calcMode clipPathUnits contentScriptType contentStyleType diffuseConstant edgeMode externalResourcesRequired filterRes filterUnits glyphRef glyphRef gradientTransform gradientTransform gradientUnits gradientUnits kernelMatrix kernelUnitLength kernelUnitLength kernelUnitLength keyPoints keySplines keyTimes lengthAdjust limitingConeAngle markerHeight markerUnits markerWidth maskContentUnits maskUnits numOctaves pathLength patternContentUnits patternTransform patternUnits pointsAtX pointsAtY pointsAtZ preserveAlpha preserveAspectRatio primitiveUnits refX refY repeatCount repeatDur requiredExtensions requiredFeatures specularConstant specularExponent specularExponent spreadMethod spreadMethod startOffset stdDeviation stitchTiles surfaceScale surfaceScale systemLanguage tableValues targetX targetY textLength textLength viewBox viewTarget xChannelSelector yChannelSelector zoomAndPan'.split(' ');
var svgCamelCaseElements = 'altGlyph altGlyphDef altGlyphItem animateColor animateMotion animateTransform clipPath feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence foreignObject glyphRef linearGradient radialGradient textPath vkern'.split(' ');
var svgCamelCaseAttributesMap = (function (map) {
  for (var i = 0; i < svgCamelCaseAttributes.length; i++) {
    var a = svgCamelCaseAttributes[i];
    map[HTML.asciiLowerCase(a)] = a;
  }
  return map;
})({});
var svgCamelCaseElementsMap = (function (map) {
  for (var i = 0; i < svgCamelCaseElements.length; i++) {
    var e = svgCamelCaseElements[i];
    map[HTML.asciiLowerCase(e)] = e;
  }
  return map;
})({});


// Take a tag name in any case and make it the proper case for HTML.
//
// Modern browsers let you embed SVG in HTML, but SVG elements are special
// in that they have a case-sensitive DOM API (nodeName, getAttribute,
// setAttribute).  For example, it has to be `setAttribute("viewBox")`,
// not `"viewbox"`.  However, the HTML parser will fix the case for you,
// so if you write `<svg viewbox="...">` you actually get a `"viewBox"`
// attribute.
HTML.properCaseTagName = function (name) {
  var lowered = HTML.asciiLowerCase(name);
  return svgCamelCaseElementsMap.hasOwnProperty(lowered) ?
    svgCamelCaseElementsMap[lowered] : lowered;
};

// See docs for properCaseTagName.
HTML.properCaseAttributeName = function (name) {
  var lowered = HTML.asciiLowerCase(name);
  return svgCamelCaseAttributesMap.hasOwnProperty(lowered) ?
    svgCamelCaseAttributesMap[lowered] : lowered;
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


HTML.knownElementNames = 'a abbr acronym address applet area b base basefont bdo big blockquote body br button caption center cite code col colgroup dd del dfn dir div dl dt em fieldset font form frame frameset h1 h2 h3 h4 h5 h6 head hr html i iframe img input ins isindex kbd label legend li link map menu meta noframes noscript object ol optgroup option p param pre q s samp script select small span strike strong style sub sup table tbody td textarea tfoot th thead title tr tt u ul var article aside audio bdi canvas command data datagrid datalist details embed eventsource figcaption figure footer header hgroup keygen mark meter nav output progress ruby rp rt section source summary time track video wbr'.split(' ');

HTML.voidElementNames = 'area base br col command embed hr img input keygen link meta param source track wbr'.split(' ');

HTML.knownSVGElementNames = 'a altGlyph altGlyphDef altGlyphItem animate animateColor animateMotion animateTransform circle clipPath color-profile cursor defs desc ellipse feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence filter font font-face font-face-format font-face-name font-face-src font-face-uri foreignObject g glyph glyphRef hkern image line linearGradient marker mask metadata missing-glyph path pattern polygon polyline radialGradient rect script set stop style svg switch symbol text textPath title tref tspan use view vkern'.split(' ');

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

HTML.isKnownElement = function (name) {
  return knownElementSet[HTML.properCaseTagName(name)] === YES;
};

HTML.isVoidElement = function (name) {
  return voidElementSet[HTML.properCaseTagName(name)] === YES;
};

HTML.isKnownSVGElement = function (name) {
  return knownSVGElementSet[HTML.properCaseTagName(name)] === YES;
};
