
HTMLTools = {};
HTMLTools.Parse = {};

var asciiLowerCase = HTMLTools.asciiLowerCase = function (str) {
  return str.replace(/[A-Z]/g, function (c) {
    return String.fromCharCode(c.charCodeAt(0) + 32);
  });
};

var svgCamelCaseAttributes = 'attributeName attributeType baseFrequency baseProfile calcMode clipPathUnits contentScriptType contentStyleType diffuseConstant edgeMode externalResourcesRequired filterRes filterUnits glyphRef glyphRef gradientTransform gradientTransform gradientUnits gradientUnits kernelMatrix kernelUnitLength kernelUnitLength kernelUnitLength keyPoints keySplines keyTimes lengthAdjust limitingConeAngle markerHeight markerUnits markerWidth maskContentUnits maskUnits numOctaves pathLength patternContentUnits patternTransform patternUnits pointsAtX pointsAtY pointsAtZ preserveAlpha preserveAspectRatio primitiveUnits refX refY repeatCount repeatDur requiredExtensions requiredFeatures specularConstant specularExponent specularExponent spreadMethod spreadMethod startOffset stdDeviation stitchTiles surfaceScale surfaceScale systemLanguage tableValues targetX targetY textLength textLength viewBox viewTarget xChannelSelector yChannelSelector zoomAndPan'.split(' ');

var properAttributeCaseMap = (function (map) {
  for (var i = 0; i < svgCamelCaseAttributes.length; i++) {
    var a = svgCamelCaseAttributes[i];
    map[asciiLowerCase(a)] = a;
  }
  return map;
})({});

var properTagCaseMap = (function (map) {
  var knownElements = HTML.knownElementNames;
  for (var i = 0; i < knownElements.length; i++) {
    var a = knownElements[i];
    map[asciiLowerCase(a)] = a;
  }
  return map;
})({});

// Take a tag name in any case and make it the proper case for HTML.
//
// Modern browsers let you embed SVG in HTML, but SVG elements are special
// in that they have a case-sensitive DOM API (nodeName, getAttribute,
// setAttribute).  For example, it has to be `setAttribute("viewBox")`,
// not `"viewbox"`.  However, the browser's HTML parser is NOT case sensitive
// and will fix the case for you, so if you write `<svg viewbox="...">`
// you actually get a `"viewBox"` attribute.  Any HTML-parsing toolchain
// must do the same.
HTMLTools.properCaseTagName = function (name) {
  var lowered = asciiLowerCase(name);
  return properTagCaseMap.hasOwnProperty(lowered) ?
    properTagCaseMap[lowered] : lowered;
};

// See docs for properCaseTagName.
HTMLTools.properCaseAttributeName = function (name) {
  var lowered = asciiLowerCase(name);
  return properAttributeCaseMap.hasOwnProperty(lowered) ?
    properAttributeCaseMap[lowered] : lowered;
};
