
// An AttributeHandler object is responsible for updating a particular attribute
// of a particular element.  AttributeHandler subclasses implement
// browser-specific logic for dealing with particular attributes across
// different browsers.
//
// To define a new type of AttributeHandler, use
// `var FooHandler = AttributeHandler.extend({ update: function ... })`
// where the `update` function takes arguments `(element, oldValue, value)`.
// The `element` argument is always the same between calls to `update` on
// the same instance.  `oldValue` and `value` are each either `null` or
// a Unicode string of the type that might be passed to the value argument
// of `setAttribute` (i.e. not an HTML string with character references).
// When an AttributeHandler is installed, an initial call to `update` is
// always made with `oldValue = null`.  The `update` method can access
// `this.name` if the AttributeHandler class is a generic one that applies
// to multiple attribute names.
//
// AttributeHandlers can store custom properties on `this`, as long as they
// don't use the names `element`, `name`, `value`, and `oldValue`.
//
// AttributeHandlers can't influence how attributes appear in rendered HTML,
// only how they are updated after materialization as DOM.

AttributeHandler = function (name, value) {
  this.name = name;
  this.value = value;
};

AttributeHandler.prototype.update = function (element, oldValue, value) {
  if (value === null) {
    if (oldValue !== null)
      element.removeAttribute(this.name);
  } else {
    element.setAttribute(this.name, value);
  }
};

AttributeHandler.extend = function (options) {
  var curType = this;
  var subType = function AttributeHandlerSubtype(/*arguments*/) {
    AttributeHandler.apply(this, arguments);
  };
  subType.prototype = new curType;
  subType.extend = curType.extend;
  if (options)
    _.extend(subType.prototype, options);
  return subType;
};

// Apply the diff between the tokens of "oldValue" and "value" to "element."
// Extended below to support classes, SVG elements and styles.
var BaseTokenHandler = AttributeHandler.extend({
  update: function (element, oldValue, value) {
    if (!this.getCurrentValue || !this.setValue ||
        !this.tokenize || !this.stringify)
      throw new Error("Missing methods in subclass of 'BaseTokenHandler'");

    var oldTokens = oldValue ? _.compact(this.tokenize(oldValue)) : [];
    var newTokens = value ? _.compact(this.tokenize(value)) : [];

    // the current classes on the element, which we will mutate.

    var tokenString = this.getCurrentValue(element);
    var tokens = tokenString ? _.compact(this.tokenize(tokenString)) : [];

    // optimize this later (to be asymptotically faster) if necessary
    for (var i = 0; i < oldTokens.length; i++) {
      var c = oldTokens[i];
      if (! _.contains(newTokens, c))
        tokens = _.without(tokens, c);
    }
    for (var i = 0; i < newTokens.length; i++) {
      var c = newTokens[i];
      if ((! _.contains(oldTokens, c)) &&
          (! _.contains(tokens, c)))
        tokens.push(c);
    }

    this.setValue(element, this.stringify(tokens));
  }
});

var ClassHandler = BaseTokenHandler.extend({
  // @param rawValue {String}
  getCurrentValue: function (element) {
    return element.className;
  },
  setValue: function (element, className) {
    element.className = className;
  },
  tokenize: function (attrString) {
    return attrString.split(' ');
  },
  stringify: function (tokens) {
    return tokens.join(' ');
  }
});

var SVGClassHandler = BaseTokenHandler.extend({
  getCurrentValue: function (element) {
    return element.className.baseVal;
  },
  setValue: function (element, className) {
    element.setAttribute('class', className);
  },
  tokenize: function (attrString) {
    return attrString.split(' ');
  },
  stringify: function (tokens) {
    return tokens.join(' ');
  }
});

var StyleHandler = BaseTokenHandler.extend({
  getCurrentValue: function (element) {
    return element.getAttribute("style") || '';
  },
  setValue: function (element, style) {
    element.setAttribute("style", style);
  },
  tokenize: function (attrString) {
    var tokens = [];

    // Regex for parsing a css attribute declaration, taken from css-parse.
    var regex = /(\*?[-#\/\*\\\w]+(?:\[[0-9a-z_-]+\])?)\s*:\s*((?:'(?:\\'|.)*?'|"(?:\\"|.)*?"|\([^\)]*?\)|[^};])+)[;\s]*/g;
    var match = regex.exec(attrString);
    while (match) {
      var token = match[1] + ":" + match[2];
      tokens.push(token);
      match = regex.exec(attrString);
    }

    return tokens;
  },
  stringify: function (tokens) {
    return tokens.join('; ') + ';';
  }
});

var BooleanHandler = AttributeHandler.extend({
  update: function (element, oldValue, value) {
    var name = this.name;
    if (value == null) {
      if (oldValue != null)
        element[name] = false;
    } else {
      element[name] = true;
    }
  }
});

var ValueHandler = AttributeHandler.extend({
  update: function (element, oldValue, value) {
    element.value = value;
  }
});

// attributes of the type 'xlink:something' should be set using
// the correct namespace in order to work
var XlinkHandler = AttributeHandler.extend({
  update: function(element, oldValue, value) {
    var NS = 'http://www.w3.org/1999/xlink';
    if (value === null) {
      if (oldValue !== null)
        element.removeAttributeNS(NS, this.name);
    } else {
      element.setAttributeNS(NS, this.name, this.value);
    }
  }
});

// cross-browser version of `instanceof SVGElement`
var isSVGElement = function (elem) {
  return 'ownerSVGElement' in elem;
};

var isUrlAttribute = function (tagName, attrName) {
  // Compiled from http://www.w3.org/TR/REC-html40/index/attributes.html
  // and
  // http://www.w3.org/html/wg/drafts/html/master/index.html#attributes-1
  var urlAttrs = {
    FORM: ['action'],
    BODY: ['background'],
    BLOCKQUOTE: ['cite'],
    Q: ['cite'],
    DEL: ['cite'],
    INS: ['cite'],
    OBJECT: ['classid', 'codebase', 'data', 'usemap'],
    APPLET: ['codebase'],
    A: ['href'],
    AREA: ['href'],
    LINK: ['href'],
    BASE: ['href'],
    IMG: ['longdesc', 'src', 'usemap'],
    FRAME: ['longdesc', 'src'],
    IFRAME: ['longdesc', 'src'],
    HEAD: ['profile'],
    SCRIPT: ['src'],
    INPUT: ['src', 'usemap', 'formaction'],
    BUTTON: ['formaction'],
    BASE: ['href'],
    MENUITEM: ['icon'],
    HTML: ['manifest'],
    VIDEO: ['poster']
  };

  if (attrName === 'itemid') {
    return true;
  }

  var urlAttrNames = urlAttrs[tagName] || [];
  return _.contains(urlAttrNames, attrName);
};

// To get the protocol for a URL, we let the browser normalize it for
// us, by setting it as the href for an anchor tag and then reading out
// the 'protocol' property.
if (Meteor.isClient) {
  var anchorForNormalization = document.createElement('A');
}

var normalizeUrl = function (url) {
  if (Meteor.isClient) {
    anchorForNormalization.href = url;
    return anchorForNormalization.href;
  } else {
    throw new Error('normalizeUrl not implemented on the server');
  }
};

// UrlHandler is an attribute handler for all HTML attributes that take
// URL values. It disallows javascript: URLs, unless
// UI._allowJavascriptUrls() has been called. To detect javascript:
// urls, we set the attribute and then reads the attribute out of the
// DOM, in order to avoid writing our own URL normalization code. (We
// don't want to be fooled by ' javascript:alert(1)' or
// 'jAvAsCrIpT:alert(1)'.) In future, when the URL interface is more
// widely supported, we can use that, which will be
// cleaner.  https://developer.mozilla.org/en-US/docs/Web/API/URL
var origUpdate = AttributeHandler.prototype.update;
var UrlHandler = AttributeHandler.extend({
  update: function (element, oldValue, value) {
    var self = this;
    var args = arguments;

    if (UI._javascriptUrlsAllowed()) {
      origUpdate.apply(self, args);
    } else {
      var isJavascriptProtocol =
            (normalizeUrl(value).indexOf('javascript:') === 0);
      if (isJavascriptProtocol) {
        Meteor._debug("URLs that use the 'javascript:' protocol are not " +
                      "allowed in URL attribute values. " +
                      "Call UI._allowJavascriptUrls() " +
                      "to enable them.");
        origUpdate.apply(self, [element, oldValue, null]);
      } else {
        origUpdate.apply(self, args);
      }
    }
  }
});

// XXX make it possible for users to register attribute handlers!
makeAttributeHandler = function (elem, name, value) {
  // generally, use setAttribute but certain attributes need to be set
  // by directly setting a JavaScript property on the DOM element.
  if (name === 'class') {
    if (isSVGElement(elem)) {
      return new SVGClassHandler(name, value);
    } else {
      return new ClassHandler(name, value);
    }
  } else if (name === 'style') {
    return new StyleHandler(name, value);
  } else if ((elem.tagName === 'OPTION' && name === 'selected') ||
             (elem.tagName === 'INPUT' && name === 'checked')) {
    return new BooleanHandler(name, value);
  } else if ((elem.tagName === 'TEXTAREA' || elem.tagName === 'INPUT')
             && name === 'value') {
    // internally, TEXTAREAs tracks their value in the 'value'
    // attribute just like INPUTs.
    return new ValueHandler(name, value);
  } else if (name.substring(0,6) === 'xlink:') {
    return new XlinkHandler(name.substring(6), value);
  } else if (isUrlAttribute(elem.tagName, name)) {
    return new UrlHandler(name, value);
  } else {
    return new AttributeHandler(name, value);
  }

  // XXX will need one for 'style' on IE, though modern browsers
  // seem to handle setAttribute ok.
};


ElementAttributesUpdater = function (elem) {
  this.elem = elem;
  this.handlers = {};
};

// Update attributes on `elem` to the dictionary `attrs`, whose
// values are strings.
ElementAttributesUpdater.prototype.update = function(newAttrs) {
  var elem = this.elem;
  var handlers = this.handlers;

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

  for (var k in newAttrs) {
    var handler = null;
    var oldValue;
    var value = newAttrs[k];
    if (! handlers.hasOwnProperty(k)) {
      if (value !== null) {
        // make new handler
        handler = makeAttributeHandler(elem, k, value);
        handlers[k] = handler;
        oldValue = null;
      }
    } else {
      handler = handlers[k];
      oldValue = handler.value;
    }
    if (oldValue !== value) {
      handler.value = value;
      handler.update(elem, oldValue, value);
      if (value === null)
        delete handlers[k];
    }
  }
};
