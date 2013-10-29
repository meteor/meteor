
// A Tag is an array of zero or more content items, with additional properties
// `tagName` (String, required) and `attrs` (Object or `null`).  In addition to
// be arrays, Tags are `instanceof UI.Tag`.
//
// Tags are created using tag functions, e.g. `DIV(P({id:'foo'}, "Hello"))`.
// If a tag function is given a first argument that is an object and not a
// Tag or an array, that object is used as element attributes (`attrs`).
//
// Tag functions for all known tags are available as `UI.Tag.DIV`,
// `UI.Tag.SPAN`, etc., and you can define new ones with
// `UI.Tag.defineTag("FOO")`, which makes a tag function available at
// `UI.Tag.FOO` henceforth.

UI.Tag = function (tagName, attrs) {
  this.tagName = tagName;
  this.attrs = attrs; // may be falsy
};
UI.Tag.prototype = [];

var objToString = Object.prototype.toString;

var makeTagFunc = function (name) {
  // Do a little dance so that tags print nicely in the Chrome console.
  // First make tag name suitable for insertion into evaluated JS code,
  // for security reasons mainly.
  var sanitizedName = String(name).replace(/^[^a-zA-Z_]|[^a-zA-Z_0-9]+/g,
                                           '') || 'Tag';
  // Generate a constructor function whose name is the tag name.
  var Tag = (new Function('return function ' +
                          sanitizedName +
                          '(attrs) { this.attrs = attrs; };'))();
  Tag.prototype = new UI.Tag(name);

  return function (optAttrs/*, children*/) {
    // see whether first argument is truthy and not an Array or Tag
    var attrsGiven = (optAttrs && (typeof optAttrs === 'object') &&
                      (typeof optAttrs.splice !== 'function'));
    var tag = new Tag(attrsGiven ? optAttrs : null);
    tag.push.apply(tag, (attrsGiven ?
                         Array.prototype.slice.call(arguments, 1) :
                         arguments));
    return tag;
  };
};

var allElementNames = 'a abbr acronym address applet area b base basefont bdo big blockquote body br button caption center cite code col colgroup dd del dfn dir div dl dt em fieldset font form frame frameset h1 h2 h3 h4 h5 h6 head hr html i iframe img input ins isindex kbd label legend li link map menu meta noframes noscript object ol p param pre q s samp script select small span strike strong style sub sup textarea title tt u ul var article aside audio bdi canvas command data datagrid datalist details embed eventsource figcaption figure footer header hgroup keygen mark meter nav output progress ruby rp rt section source summary time track video wbr'.split(' ');

UI.Tag.defineTag = function (name) {
  // XXX maybe sanity-check name?  Like no whitespace.
  name = name.toUpperCase();
  UI.Tag[name] = makeTagFunc(name);
};

_.each(allElementNames, UI.Tag.defineTag);

////////////////////////////////////////

var materialize = function (node, parentNode, beforeNode) {
  if (node && (typeof node === 'object') &&
      (typeof node.splice === 'function')) {
    // Tag or array
    if (node.tagName) {
      // Tag
      var elem = document.createElement(node.tagName);
      if (node.attrs) {
        _.each(node.attrs, function (v, k) {
          elem.setAttribute(k, v);
        });
      }
      _.each(node, function (child) {
        materialize(child, elem);
      });
      parentNode.insertBefore(elem, beforeNode);
    } else {
      // array
      _.each(node, function (child) {
        materialize(child, parentNode, beforeNode);
      });
    }
  } else if (typeof node === 'string') {
    parentNode.insertBefore(document.createTextNode(node), beforeNode);
  } else if (node == null) {
    // null or undefined.
    // do nothing.
  } else {
    throw new Error("Unexpected item in HTML tree: " + node);
  }
};

var properCaseTagName = function (name) {
  // XXX SVG camelCase
  return name.toLowerCase();
};

var stringifyAttributeValue = function (v) {
  // XXX todo
  return '"' + v.replace(/"/g, '&quot;').replace(/&/g, '&amp;') + '"';
};

var toHTML = function (node) {
  var result = "";

  if (node && (typeof node === 'object') &&
      (typeof node.splice === 'function')) {
    // Tag or array
    if (node.tagName) {
      // Tag
      result += '<' + properCaseTagName(node.tagName);
      if (node.attrs) {
        _.each(node.attrs, function (v, k) {
          result += ' ' + k + '=' + stringifyAttributeValue(v);
        });
      }
      result += '>';
      _.each(node, function (child) {
        result += toHTML(child);
      });
      result += '</' + properCaseTagName(node.tagName) + '>';
    } else {
      // array
      _.each(node, function (child) {
        result += toHTML(child);
      });
    }
  } else if (typeof node === 'string') {
    result += node.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  } else if (node == null) {
    // null or undefined.
    // do nothing.
  } else {
    throw new Error("Unexpected item in HTML tree: " + node);
  }

  return result;
};

UI.materialize = materialize;
UI.toHTML = toHTML;
