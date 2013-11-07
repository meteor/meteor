
var voidElementNames = 'area base br col command embed hr img input keygen link meta param source track wbr'.split(' ');
var voidElementSet = (function (set) {
  _.each(voidElementNames, function (n) {
    set[n] = 1;
  });
  return set;
})({});

////////////////////////////////////////

var instantiate = function (kind, parent) {
  // check arguments
  if (UI.isComponent(kind)) {
    if (kind.isInited)
      throw new Error("A component kind is required, not an instance");
  } else {
    throw new Error("Expected Component kind");
  }

  var inst = kind.extend(); // XXX args go here
  inst.isInited = true;

  // XXX messy to define this here
  inst.templateInstance = {
    findAll: function (selector) {
      // XXX check that `.dom` exists here?
      return inst.dom.$(selector);
    },
    find: function (selector) {
      var result = this.findAll(selector);
      return result[0] || null;
    },
    firstNode: null,
    lastNode: null,
    data: null,
    __component__: inst
  };

  inst.parent = (parent || null);

  if (inst.init)
    inst.init();

  if (inst.created) {
    updateTemplateInstance(inst);
    inst.created.call(inst.templateInstance);
  }

  return inst;
};


// Takes a reactive function (call it `inner`) and returns a reactive function
// `outer` which is equivalent except in its reactive behavior.  Specifically,
// `outer` has the following two special properties:
//
// 1. Isolation:  An invocation of `outer()` only invalidates its context
//    when the value of `inner()` changes.  For example, `inner` may be a
//    function that gets one or more Session variables and calculates a
//    true/false value.  `outer` blocks invalidation signals caused by the
//    Session variables changing and sends a signal out only when the value
//    changes between true and false (in this example).  The value can be
//    of any type, and it is compared with `===` unless an `equals` function
//    is provided.
//
// 2. Value Sharing:  The `outer` function returned by `emboxValue` can be
//    shared between different contexts, for example by assigning it to an
//    object as a method that can be accessed at any time, such as by
//    different templates or different parts of a template.  No matter
//    how many times `outer` is called, `inner` is only called once until
//    it changes.  The most recent value is stored internally.
//
// Conceptually, an emboxed value is much like a Session variable which is
// kept up to date by an autorun.  Session variables provide storage
// (value sharing) and they don't notify their listeners unless a value
// actually changes (isolation).  The biggest difference is that such an
// autorun would never be stopped, and the Session variable would never be
// deleted even if it wasn't used any more.  An emboxed value, on the other
// hand, automatically stops computing when it's not being used, and starts
// again when called from a reactive context.  This means that when it stops
// being used, it can be completely garbage-collected.
//
// If a non-function value is supplied to `emboxValue` instead of a reactive
// function, then `outer` is still a function but it simply returns the value.
//
UI.emboxValue = function (funcOrValue, equals) {
  if (typeof funcOrValue === 'function') {
    var func = funcOrValue;

    var curResult = null;
    // There's one shared Dependency and Computation for all callers of
    // our box function.  It gets kicked off if necessary, and when
    // there are no more dependents, it gets stopped to avoid leaking
    // memory.
    var resultDep = null;
    var computation = null;

    return function () {
      if (! computation) {
        if (! Deps.active) {
          // Not in a reactive context.  Just call func, and don't start a
          // computation if there isn't one running already.
          return func();
        }

        // No running computation, so kick one off.  Since this computation
        // will be shared, avoid any association with the current computation
        // by using `Deps.nonreactive`.
        resultDep = new Deps.Dependency;

        computation = Deps.nonreactive(function () {
          return Deps.autorun(function (c) {
            var oldResult = curResult;
            curResult = func();
            if (! c.firstRun) {
              if (! (equals ? equals(curResult, oldResult) :
                     curResult === oldResult))
                resultDep.changed();
            }
          });
        });
      }

      if (Deps.active) {
        var isNew = resultDep.depend();
        if (isNew) {
          // For each new dependent, schedule a task for after that dependent's
          // invalidation time and the subsequent flush. The task checks
          // whether the computation should be torn down.
          Deps.onInvalidate(function () {
            if (resultDep && ! resultDep.hasDependents()) {
              Deps.afterFlush(function () {
                // use a second afterFlush to bump ourselves to the END of the
                // flush, after computation re-runs have had a chance to
                // re-establish their connections to our computation.
                Deps.afterFlush(function () {
                  if (resultDep && ! resultDep.hasDependents()) {
                    computation.stop();
                    computation = null;
                    resultDep = null;
                  }
                });
              });
            }
          });
        }
      }

      return curResult;
    };

  } else {
    var value = funcOrValue;
    return function () {
      return value;
    };
  }
};

UI.bind = function (kindOrFunc, options) {
  var boxedOptions = {};
  for (var k in options)
    boxedOptions[k] = UI.emboxValue(options[k]);

  if (typeof kindOrFunc === 'function') {
    return function () {
      var kind = kindOrFunc();

      if (! kind)
        return null;

      if ((! UI.isComponent(kind)) || kind.isInited)
        throw new Error("Expected Component kind");

      return kind.extend(boxedOptions);
    };
  } else {
    var kind = kindOrFunc;

    if (! kind)
      return null;

    if ((! UI.isComponent(kind)) || kind.isInited)
      throw new Error("Expected Component kind");

    return kind.extend(boxedOptions);
  }
};

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

  if (parent.component && parent.component.dom) {
    // parent is DomRange; add node or range
    parent.add(nodeOrRange.component || nodeOrRange, before);
  } else if (nodeOrRange.component && nodeOrRange.component.dom) {
    // parent is an element; inserting a range
    UI.insert(nodeOrRange.component, parent, before);
  } else {
    // parent is an element; inserting an element
    parent.insertBefore(nodeOrRange, before || null); // `null` for IE
  }
};

// Update attributes on `elem` to the dictionary `attrs`, using the
// dictionary of existing `handlers` if provided.
//
// Values in the `attrs` dictionary are in pseudo-DOM form -- a string,
// CharRef, or array of strings and CharRefs -- but they are passed to
// the AttributeHandler in string form.
var updateAttributes = function(elem, newAttrs, handlers) {

  if (handlers) {
    for (var k in handlers) {
      if (! newAttrs.hasOwnProperty(k)) {
        // remove attributes (and handlers) for attribute names
        // that don't exist as keys of `newAttrs` and so won't
        // be visited when traversing it.  (Attributes that
        // exist in the `newAttrs` object but are `null`
        // are handled later.)
        var handler = handlers[k];
        var oldValue = handler.value;
        handler.value = null;
        handler.update(elem, oldValue, null);
        delete handlers[k];
      }
    }
  }

  for (var k in newAttrs) {
    var handler = null;
    var oldValue;
    var value = attributeValueToString(newAttrs[k]);
    if ((! handlers) || (! handlers.hasOwnProperty(k))) {
      if (value !== null) {
        // make new handler
        checkAttributeName(k);
        handler = makeAttributeHandler2(k, value);
        if (handlers)
          handlers[k] = handler;
        oldValue = null;
      }
    } else {
      handler = handlers[k];
      oldValue = handler.value;
    }
    if (handler) {
      handler.value = value;
      handler.update(elem, oldValue, value);
      if (value === null)
        delete handlers[k];
    }
  }
};

// Convert the pseudoDOM `node` into reactive DOM nodes and insert them
// into the element or DomRange `parent`, before the node or id `before`.
var materialize = function (node, parent, before, parentComponent) {
  // XXX should do more error-checking for the case where user is supplying the tags.
  // For example, check that CharRef has `html` and `str` properties and no content.
  // Check that Comment has a single string child and no attributes.  Etc.

  if (UI.isComponent(node)) {
    if (node.isInited)
      throw new Error("Can't render component instance, only component kind");
    var inst = instantiate(node, parentComponent);

    var content = null;
    try {
      content = (inst.render && inst.render());
    } catch (e) {
      reportUIException(e);
    }

    var range = new UI.DomRange(inst);
    materialize(content, range, null, inst);

    inst.parented = function () {}; // XXX override old base
    inst.removed = function () {
      inst.isDestroyed = true;
      if (inst.destroyed) {
        updateTemplateInstance(inst);
        inst.destroyed.call(inst.templateInstance);
      }
    };
    insert(range, parent, before);

    // TODO: defer this until template is in document
    if (inst.rendered) {
      updateTemplateInstance(inst);
      inst.rendered.call(inst.templateInstance);
    }

  } else if (node && (typeof node === 'object') &&
      (typeof node.splice === 'function')) {
    // Tag or array
    if (node.tagName) {
      if (node.tagName === 'CharRef') {
        checkCharRef(node);
        insert(document.createTextNode(node.attrs.str), parent, before);
      } else if (node.tagName === 'Comment') {
        checkComment(node);
        insert(document.createComment(sanitizeComment(node[0])), parent, before);
      } else if (node.tagName === 'EmitCode') {
        throw new Error("EmitCode node can only be processed by toCode");
      } else {
        var elem = document.createElement(node.tagName);
        if (node.attrs) {
          var attrs = node.attrs;
          if (typeof attrs === 'function') {
            var attrUpdater = Deps.autorun(function (c) {
              if (! c.handlers)
                c.handlers = {};

              try {
                updateAttributes(elem, attrs(), c.handlers);
              } catch (e) {
                reportUIException(e);
              }
            });
            UI.DomBackend2.onRemoveElement(elem, function () {
              attrUpdater.stop();
            });
          } else {
            updateAttributes(elem, attrs);
          }
        }
        _.each(node, function (child) {
          materialize(child, elem, null, parentComponent);
        });
        insert(elem, parent, before);
      }
    } else {
      // array
      _.each(node, function (child) {
        materialize(child, parent, before, parentComponent);
      });
    }
  } else if (typeof node === 'string') {
    insert(document.createTextNode(node), parent, before);
  } else if (typeof node === 'function') {
    var range = new UI.DomRange;
    var rangeUpdater = Deps.autorun(function (c) {
      if (! c.firstRun)
        range.removeAll();

      var content = null;
      try {
        content = node();
      } catch (e) {
        reportUIException(e);
      }

      Deps.nonreactive(function () {
        materialize(content, range, null, parentComponent);
      });
    });
    range.removed = function () {
      rangeUpdater.stop();
    };
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
// CharRefs (and arrays) -- and renders it as a double-quoted string literal
// suitable for an HTML attribute value (without the quotes).  Returns `null`
// if there's no attribute value (`null`, `undefined`, or empty array).
var attributeValueToQuotedContents = function (v) {
  if (v == null) {
    // null or undefined
    return null;
  } else if (typeof v === 'string') {
    return v.replace(/"/g, '&quot;').replace(/&/g, '&amp;');
  } else if (v.tagName === 'CharRef') {
    return v.attrs.html;
  } else if (typeof v === 'object' && (typeof v.length === 'number')) {
    // array or tag
    if (v.tagName)
      throw new Error("Unexpected tag in attribute value: " + v.tagName);
    // array
    var parts = [];
    for (var i = 0; i < v.length; i++) {
      var part = attributeValueToQuotedContents(v[i]);
      if (part !== null)
        parts.push(part);
    }
    return parts.length ? parts.join('') : null;
  } else {
    throw new Error("Unexpected node in attribute value: " + v);
  }
};

// Takes an attribute value -- i.e. a string, CharRef, or array of strings and
// CharRefs (and arrays) -- and converts it to a string suitable for passing
// to `setAttribute`.  May return `null` to mean no attribute.
var attributeValueToString = function (v) {
  if (v == null) {
    // null or undefined
    return null;
  } else if (typeof v === 'string') {
    return v;
  } else if (v.tagName === 'CharRef') {
    return v.attrs.str;
  } else if (typeof v === 'object' && (typeof v.length === 'number')) {
    // array or tag
    if (v.tagName)
      throw new Error("Unexpected tag in attribute value: " + v.tagName);
    // array
    var parts = [];
    for (var i = 0; i < v.length; i++) {
      var part = attributeValueToString(v[i]);
      if (part !== null)
        parts.push(part);
    }
    return parts.length ? parts.join('') : null;
  } else {
    throw new Error("Unexpected node in attribute value: " + v);
  }
};

// Takes an attribute value -- i.e. a string, CharRef, or array of strings and
// CharRefs (and arrays) -- and converts it to JavaScript code.  May also return
// `null` to indicate that the attribute should not be included because it has
// an identically "nully" value (`null`, `undefined`, `[]`, `[[]]`, etc.).
var attributeValueToCode = function (v) {
  if (v == null) {
    // null or undefined
    return null;
  } else if (typeof v === 'string') {
    return toJSLiteral(v);
  } else if (v.tagName === 'CharRef') {
    return toCode(v);
  } else if (typeof v === 'object' && (typeof v.length === 'number')) {
    // array or tag
    if (v.tagName)
      throw new Error("Unexpected tag in attribute value: " + v.tagName);
    // array
    var parts = [];
    for (var i = 0; i < v.length; i++) {
      var part = attributeValueToCode(v[i]);
      if (part !== null)
        parts.push(part);
    }
    return parts.length ? ('[' + parts.join(', ') + ']') : null;
  } else {
    throw new Error("Unexpected node in attribute value: " + v);
  }
};

// checks that a pseudoDOM node with tagName "CharRef" is well-formed.
var checkCharRef = function (charRef) {
  if (typeof charRef.attrs === 'function')
    throw new Error("Can't have a reactive character reference (CharRef)");

  var attrs = charRef.attrs;
  if ((! attrs) || (typeof attrs.html !== 'string') ||
      (typeof attrs.str !== 'string') || (! attrs.html) || (! attrs.str))
    throw new Error("CharRef should have simple string attributes " +
                    "`html` and `str`.");

  if (charRef.length)
    throw new Error("CharRef should have no content");
};

// checks that a pseudoDOM node with tagName "Comment" is well-formed.
var checkComment = function (comment) {
  if (comment.attrs)
    throw new Error("Comment can't have attributes");
  if (comment.length !== 1 || (typeof comment[0] !== 'string'))
    throw new Error("Comment should have exactly one content item, a simple string");
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
var checkAttributeName = function (name) {
  return /^[:_A-Za-z][:_A-Za-z0-9.\-]*/.test(name);
};

// Convert the pseudoDOM `node` into static HTML.
var toHTML = function (node, parentComponent) {
  var result = "";

  if (UI.isComponent(node)) {
    if (node.isInited)
      throw new Error("Can't render component instance, only component kind");
    var inst = instantiate(node, parentComponent);

    var content = null;
    try {
      content = (inst.render && inst.render());
    } catch (e) {
      reportUIException(e);
    }

    result += toHTML(content, inst);

  } else if (node && (typeof node === 'object') &&
      (typeof node.splice === 'function')) {
    // Tag or array
    if (node.tagName) {
      // Tag
      if (node.tagName === 'CharRef') {
        checkCharRef(node);
        result += node.attrs.html;
      } else if (node.tagName === 'Comment') {
        checkComment(node);
        result += '<!--' + sanitizeComment(node[0]) + '-->';
      } else if (node.tagName === 'EmitCode') {
        throw new Error("EmitCode node can only be processed by toCode");
      } else {
        var casedTagName = properCaseTagName(node.tagName);
        result += '<' + casedTagName;
        if (node.attrs) {
          var attrs = node.attrs;
          if (typeof attrs === 'function')
            attrs = attrs();

          _.each(attrs, function (v, k) {
            checkAttributeName(k);
            v = attributeValueToQuotedContents(v);
            if (v !== null)
              result += ' ' + k + '="' + v + '"';
          });
        }
        result += '>';
        _.each(node, function (child) {
          result += toHTML(child, parentComponent);
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
        result += toHTML(child, parentComponent);
      });
    }
  } else if (typeof node === 'string') {
    result += node.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  } else if (typeof node === 'function') {
    var content = null;
    try {
      content = node();
    } catch (e) {
      reportUIException(e);
    }

    result += toHTML(content, parentComponent);
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

  if (UI.isComponent(node)) {
    throw new Error("Can't convert Component object to code string.  Use EmitCode instead.");
  } else if (node && (typeof node === 'object') &&
      (typeof node.splice === 'function')) {
    // Tag or array
    if (node.tagName) {
      // Tag
      if (node.tagName === 'EmitCode') {
        result += node[0];
      } else {
        var isNonTag = false;
        if (node.tagName === 'Comment') {
          checkComment(node);
          isNonTag = true;
        } else if (node.tagName === 'CharRef') {
          checkCharRef(node);
          isNonTag = true;
        }

        result += 'HTML.' + (isNonTag ? '' : 'Tag.') + node.tagName + '(';
        var argStrs = [];
        if (node.attrs) {
          var kvStrs = [];
          _.each(node.attrs, function (v, k) {
            checkAttributeName(k);
            v = attributeValueToCode(v);
            if (v !== null)
              kvStrs.push(toObjectLiteralKey(k) + ': ' + v);
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
