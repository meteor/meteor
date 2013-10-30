
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

var voidElementNames = 'area base br col command embed hr img input keygen link meta param source track wbr'.split(' ');
var voidElementSet = (function (set) {
  _.each(voidElementNames, function (n) {
    set[n] = 1;
  });
  return set;
})({});

UI.Tag.defineTag = function (name) {
  // XXX maybe sanity-check name?  Like no whitespace.
  name = name.toUpperCase();
  UI.Tag[name] = makeTagFunc(name);
};

// e.g. `CharRef({html: '&mdash;', str: '\u2014'})`
UI.Tag.CharRef = makeTagFunc('CharRef');
// e.g. `Comment("foo")`
UI.Tag.Comment = makeTagFunc('Comment');
// e.g. `EmitCode("foo()")`
UI.Tag.EmitCode = makeTagFunc('EmitCode');

_.each(allElementNames, UI.Tag.defineTag);

////////////////////////////////////////

var sanitizeComment = function (content) {
  return content.replace(/--+/g, '').replace(/-$/, '');
};

// Insert a DOM node or DomRange into a DOM element or DomRange.
//
// One of three things happens depending on what needs to be inserted into what:
// - `range.add` (anything into DomRange)
// - `UI.insert` (DomRange into element)
// - `elem.insertBefore` (node into element)
//
// The optional `before` argument is an existing node or id to insert before in
// the parent element or DomRange.
var insert = function (nodeOrRange, parent, before) {
  if (! parent)
    throw new Error("Materialization parent required");

  if (parent.dom) {
    // parent is DomRange; add node or range
    parent.add(nodeOrRange, before);
  } else if (nodeOrRange.dom) {
    // parent is an element; inserting a range
    UI.insert(nodeOrRange, parent, before);
  } else {
    // parent is an element; inserting an element
    parent.insertBefore(nodeOrRange, before || null); // `null` for IE
  }
};

// Convert the pseudoDOM `node` into reactive DOM nodes and insert them
// into the element or DomRange `parent`, before the node or id `before`.
var materialize = function (node, parent, before) {
  // XXX should do more error-checking for the case where user is supplying the tags.
  // For example, check that CharRef has `html` and `str` properties and no content.
  // Check that Comment has a single string child and no attributes.  Etc.

  if (node && (typeof node === 'object') &&
      (typeof node.splice === 'function')) {
    // Tag or array
    if (node.tagName) {
      if (node.tagName === 'CharRef') {
        insert(document.createTextNode(node.attrs.str), parent, before);
      } else if (node.tagName === 'Comment') {
        insert(document.createComment(sanitizeComment(node[0])), parent, before);
      } else if (node.tagName === 'EmitCode') {
        throw new Error("EmitCode node can only be processed by toCode");
      } else {
        var elem = document.createElement(node.tagName);
        if (node.attrs) {
          _.each(node.attrs, function (v, k) {
            elem.setAttribute(k, attributeValueToString(v));
          });
        }
        _.each(node, function (child) {
          materialize(child, elem);
        });
        insert(elem, parent, before);
      }
    } else {
      // array
      _.each(node, function (child) {
        materialize(child, parent, before);
      });
    }
  } else if (typeof node === 'string') {
    insert(document.createTextNode(node), parent, before);
  } else if (typeof node === 'function') {
    var range = new UI.DomRange;
    Deps.autorun(function (c) {
      if (! c.firstRun)
        range.removeAll();

      materialize(node(), range);
    });
    insert(range, parent, before);
  } else if (node == null) {
    // null or undefined.
    // do nothing.
  } else {
    throw new Error("Unexpected item in HTML tree: " + node);
  }
};

// Take a tag name in any case and make it the proper case for inserting into
// HTML.
//
// The latest HTML standards don't care about case at all, but for
// compatibility it is customary to use a particular case.  In most cases
// this means lowercase, but there are some camelCase SVG tags that require a
// lookup table to get right (for browsers that care).  (Historically,
// case-sensitivity requirements come from XML.  However, HTML5 is not based
// on XML, and though it supports direct inclusion of SVG, an XML language,
// it parses it as HTML with some special parsing rules.)
var properCaseTagName = function (name) {
  // XXX TODO: SVG camelCase
  return name.toLowerCase();
};

// Takes an attribute value -- i.e. a string, CharRef, or array of strings and
// CharRefs -- and renders it as a double-quoted string literal suitable for an
// HTML attribute value.
var attributeValueToQuotedString = (function () {

  var attributeValuePartToQuotedStringPart = function (v) {
    if (typeof v === 'string') {
      return v.replace(/"/g, '&quot;').replace(/&/g, '&amp;');
    } else if (v.tagName === 'CharRef') {
      return v.attrs.html;
    }
  };

  return function (v) {
    var result = '"';
    if (typeof v === 'object' && (typeof v.length === 'number') && ! v.tagName) {
      // array
      for (var i = 0; i < v.length; i++)
        result += attributeValuePartToQuotedStringPart(v[i]);
    } else {
      result += attributeValuePartToQuotedStringPart(v);
    }
    result += '"';
    return result;
  };
})();

// Takes an attribute value -- i.e. a string, CharRef, or array of strings and
// CharRefs -- and converts it to a string suitable for passing to `setAttribute`.
var attributeValueToString = (function () {
  var attributeValuePartToString = function (v) {
    if (typeof v === 'string') {
      return v;
    } else if (v.tagName === 'CharRef') {
      return v.attrs.str;
    }
  };

  return function (v) {
    if (typeof v === 'object' && (typeof v.length === 'number') && ! v.tagName) {
      // array
      var result = '';
      for (var i = 0; i < v.length; i++)
        result += attributeValuePartToString(v[i]);
      return result;
    } else {
      return attributeValuePartToString(v);
    }
  };
})();

// Takes an attribute value -- i.e. a string, CharRef, or array of strings and
// CharRefs -- and converts it to JavaScript code.
var attributeValueToCode = function (v) {
  if (typeof v === 'object' && (typeof v.length === 'number') && ! v.tagName) {
    // array
    var partStrs = [];
    for (var i = 0; i < v.length; i++)
      partStrs.push(toCode(v[i]));
    return '[' + partStrs.join(', ') + ']';
  } else {
    return toCode(v);
  }
};

// Convert the pseudoDOM `node` into static HTML.
var toHTML = function (node) {
  var result = "";

  if (node && (typeof node === 'object') &&
      (typeof node.splice === 'function')) {
    // Tag or array
    if (node.tagName) {
      // Tag
      if (node.tagName === 'CharRef') {
        result += node.attrs.html;
      } else if (node.tagName === 'Comment') {
        result += '<!--' + sanitizeComment(node[0]) + '-->';
      } else if (node.tagName === 'EmitCode') {
        throw new Error("EmitCode node can only be processed by toCode");
      } else {
        var casedTagName = properCaseTagName(node.tagName);
        result += '<' + casedTagName;
        if (node.attrs) {
          _.each(node.attrs, function (v, k) {
            result += ' ' + k + '=' + attributeValueToQuotedString(v);
          });
        }
        result += '>';
        _.each(node, function (child) {
          result += toHTML(child);
        });
        if (node.length || voidElementSet[casedTagName] !== 1) {
          // "Void" elements like BR are the only ones that don't get a close
          // tag in HTML5.  They shouldn't have contents, either, so we could
          // throw an error if there were contents.
          result += '</' + properCaseTagName(node.tagName) + '>';
        }
      }
    } else {
      // array
      _.each(node, function (child) {
        result += toHTML(child);
      });
    }
  } else if (typeof node === 'string') {
    result += node.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  } else if (typeof node === 'function') {
    result += toHTML(node());
  } else if (node == null) {
    // null or undefined.
    // do nothing.
  } else {
    throw new Error("Unexpected item in HTML tree: " + node);
  }

  return result;
};

var toJSLiteral = function (obj) {
  // See <http://timelessrepo.com/json-isnt-a-javascript-subset> for `\u2028\u2029`.
  // Also escape Unicode surrogates.
  return (JSON.stringify(obj)
          .replace(/[\u2028\u2029\ud800-\udfff]/g, function (c) {
            return '\\u' + ('000' + c.charCodeAt(0).toString(16)).slice(-4);
          }));
};

var jsReservedWordSet = (function (set) {
  _.each("abstract else instanceof super boolean enum int switch break export interface synchronized byte extends let this case false long throw catch final native throws char finally new transient class float null true const for package try continue function private typeof debugger goto protected var default if public void delete implements return volatile do import short while double in static with".split(' '), function (w) {
    set[w] = 1;
  });
  return set;
})({});

var toObjectLiteralKey = function (k) {
  if (/^[a-zA-Z]+$/.test(k) && jsReservedWordSet[k] !== 1)
    return k;
  return toJSLiteral(k);
};

// Convert the pseudoDOM `node` into JavaScript code that generates it.
//
// We can't handle functions in the tree, but we support the special node
// `EmitCode` for inserting raw JavaScript.
var toCode = function (node) {
  var result = "";

  if (node && (typeof node === 'object') &&
      (typeof node.splice === 'function')) {
    // Tag or array
    if (node.tagName) {
      // Tag
      if (node.tagName === 'EmitCode') {
        result += node[0];
      } else {
        result += 'UI.Tag.' + node.tagName + '(';
        var argStrs = [];
        if (node.attrs) {
          var kvStrs = [];
          _.each(node.attrs, function (v, k) {
            kvStrs.push(toObjectLiteralKey(k) + ': ' + attributeValueToCode(v));
          });
          argStrs.push('{' + kvStrs.join(', ') + '}');
        }

        _.each(node, function (child) {
          argStrs.push(toCode(child));
        });

        result += argStrs.join(', ') + ')';
      }
    } else {
      // array
      result += '[';
      result += _.map(node, toCode).join(', ');
      result += ']';
      return result;
    }
  } else if (typeof node === 'string') {
    result += toJSLiteral(node);
  } else if (typeof node === 'function') {
    throw new Error("Can't convert function object to code string.  Use EmitCode instead.");
  } else if (node == null) {
    // null or undefined.
    // do nothing.
  } else {
    throw new Error("Unexpected item in HTML tree: " + node);
  }

  return result;
};

// XXX we're just exposing these for now
UI.materialize = materialize;
UI.toHTML = toHTML;
UI.toCode = toCode;
