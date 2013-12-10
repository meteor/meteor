HTML2 = {};

HTML = HTML2;

/*HTML.isNully = function (node) {
  if (node == null)
    return true;

  if (node instanceof Array) {
    for (var i = 0; i < node.length; i++)
      if (! HTML.isNully(node[i]))
        return false;
    return true;
  }

  return false;
};*/

HTML.asciiLowerCase = function (str) {
  return str.replace(/[A-Z]/g, function (c) {
    return String.fromCharCode(c.charCodeAt(0) + 32);
  });
};

HTML.escapeData = function (str) {
  // string; escape the two special chars in HTML data and RCDATA
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;');
};

// Take a tag name in any case and make it the proper case for HTML.
//
// Modern browsers let you embed SVG in HTML, but SVG elements are special
// in that they have a case-sensitive DOM API (nodeName, getAttribute,
// setAttribute).  For example, it has to be `setAttribute("viewBox")`,
// not `"viewbox"`.  However, the HTML parser will fix the case for you,
// so if you write `<svg viewbox="...">` you actually get a `"viewBox"`
// attribute.
HTML.properCaseTagName = function (name) {
  // XXX TODO: SVG camelCase
  return HTML.asciiLowerCase(name);
};

// See docs for properCaseTagName.
HTML.properCaseAttributeName = function (name) {
  // XXX TODO: SVG camelCase
  return HTML.asciiLowerCase(name);
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

var YES = {yes:true};

var voidElementSet = (function (set) {
  var voidElementNames = HTML.voidElementNames;
  for (var i = 0; i < voidElementNames.length; i++)
    set[voidElementNames[i]] = YES;

  return set;
})({});

var knownElementSet = (function (set) {
  var knownElementNames = HTML.knownElementNames;
  for (var i = 0; i < knownElementNames.length; i++)
    set[knownElementNames[i]] = YES;

  return set;
})({});

HTML.isKnownElement = function (name) {
  return knownElementSet[HTML.properCaseTagName(name)] === YES;
};

HTML.isVoidElement = function (name) {
  return voidElementSet[HTML.properCaseTagName(name)] === YES;
};
