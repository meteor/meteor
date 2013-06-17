// RenderBuffer is a friend class of Component that provides the
// API for implementations of comp.render(buf) and knows how to
// buffer HTML and then optionally wire it up as reactive DOM.
//
// Each Component creates its own instance of RenderBuffer during
// render (i.e. build or server-side HTML generation).

// @export RenderBuffer
RenderBuffer = function (component, options) {
  this._component = component;
  if (! (component instanceof Component))
    throw new Error("Component required as first argument");

  this._htmlBuf = [];

  this._isPreview = !! (options && options.preview);

  this._builderId = Random.id();
  this._nextNum = 1;
  this._elementNextNums = {};

  this._childrenToAttach = []; // comment string -> component
};

var TAG_NAME_REGEX = /^[a-zA-Z0-9]+$/;
var ATTRIBUTE_NAME_REGEX = /^[^\s"'>/=/]+$/;
var ESCAPED_CHARS_UNQUOTED_REGEX = /[&<>]/g;
var ESCAPED_CHARS_QUOTED_REGEX = /[&<>"]/g;

var escapeMap = {
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  '"': "&quot;"
};
var escapeOne = function(c) {
  return escapeMap[c];
};

var encodeEntities = function (text, isQuoted) {
  // All HTML entities in templates are decoded by the template parser
  // and given to RenderBuffer as Unicode.  We then re-encode some
  // characters into entities here, but not most characters.  If
  // you're trying to use entities to send ASCII representations of
  // non-ASCII characters to the client, you'll need a different
  // policy here.
  return text.replace(isQuoted ? ESCAPED_CHARS_QUOTED_REGEX :
                      ESCAPED_CHARS_UNQUOTED_REGEX, escapeOne);
};

var updateDOMAttribute = function (component, elemKey, attrName,
                                   newValue, oldValue) {
  // XXX Do smart stuff here, like treat "class" attribute
  // specially, and set JS properties instead of HTML attributes
  // when appropriate.  Don't get too crazy, though.  Fancy
  // manipulation of DOM elements can be done programmatically
  // instead.
  //
  // Allow Components to hook into (i.e. replace) this update
  // logic for attributes of their choice?
  var elem = component.elements[elemKey];
  elem.setAttribute(attrName, newValue);
};


_.extend(RenderBuffer.prototype, {
  _encodeEntities: encodeEntities,
  // XXX implement dynamicAttrs option,
  // takes [[k, v], ...], does something fancy to parse out
  // name=value dynamically.  For example, `<span {{{attrs}}}>`
  // leads to `{ dynamicAttrs: [[attrs(), ''] }`, and each time
  // `attrs()` is evaluated, it is tokenized for attribute
  // assignments.
  openTag: function (tagName, attrs, options) {
    var self = this;

    if ((typeof tagName) !== 'string' ||
        ! TAG_NAME_REGEX.test(tagName))
      throw new Error("Illegal HTML tag name: " + tagName);

    attrs = attrs || {};
    options = options || {};

    var isElementReactive = false;
    // any reactive updaters here will close over this variable,
    // which we will set to something non-null afterwards.
    var elementKey = (options.key || null);

    var buf = this._htmlBuf;
    buf.push('<', tagName);
    _.each(attrs, function (attrValue, attrName) {
      if ((typeof attrName) !== 'string' ||
          ! ATTRIBUTE_NAME_REGEX.test(attrName))
        throw new Error("Illegal HTML attribute name: " + attrName);

      buf.push(' ', attrName, '="');
      var initialValue;
      if (typeof attrValue === 'function') {
        var func = attrValue;
        // we assume we've been called from some Component build,
        // so this autorun will be stopped when the Component
        // is rebuilt or destroyed.
        isElementReactive = true;
        Deps.autorun(function (c) {
          if (c.firstRun) {
            var newValue = attrValue();
            initialValue = newValue;
            c.oldValue = newValue;
            if (self._isPreview)
              c.stop();
          } else {
            var newValue = attrValue();
            var comp = self._component;
            if (comp && comp.stage === Component.BUILT) {
              var elem = elementKey && comp.elements[elementKey];
              if (elem) {
                updateDOMAttribute(comp, elementKey, attrName,
                                   newValue, c.oldValue);
              }
            }
            c.oldValue = newValue;
          }
        });
      } else {
        initialValue = attrValue;
      }
      buf.push(self._encodeEntities(initialValue, true));
      buf.push('"');
    });

    if (isElementReactive && ! self._isPreview) {
      if (! elementKey) {
        if (! this._elementNextNums[tagName])
          this._elementNextNums[tagName] = 1;
        elementKey = tagName +
          (this._elementNextNums[tagName]++);
      }

      buf.push(' data-meteorui-id="' +
               self._encodeEntities(elementKey, true) + '"');
    }

    if (options.selfClose)
      buf.push('/');
    buf.push('>');
  },
  closeTag: function (tagName) {
    if ((typeof tagName) !== 'string' ||
        ! TAG_NAME_REGEX.test(tagName))
      throw new Error("Illegal HTML tag name: " + tagName);
    this._htmlBuf.push('</', tagName, '>');
  },
  text: function (stringOrFunction) {
    if (typeof stringOrFunction === 'function') {
      var func = stringOrFunction;
      this.component(function () {
        return TextComponent.create({text: func()});
      });
    } else {
      if (typeof stringOrFunction !== 'string')
        throw new Error("string required");
      var text = stringOrFunction;
      this._htmlBuf.push(this._encodeEntities(text));
    }
  },
  rawHtml: function (stringOrFunction) {
    if (typeof stringOrFunction === 'function') {
      var func = stringOrFunction;
      this.component(function () {
        return RawHtmlComponent.create({html: func()});
      });
    } else {
      if (typeof stringOrFunction !== 'string')
        throw new Error("string required");
      var html = stringOrFunction;
      this._htmlBuf.push(html);
    }
  },
  component: function (componentOrFunction, options) {
    var self = this;

    if (! ((componentOrFunction instanceof Component) ||
           (typeof componentOrFunction === 'function')))
      throw new Error("Component or function required");

    var childKey = (options && options.key || null);

    var childComp = self._component.addChild(
      childKey, componentOrFunction);

    if (self._isPreview) {
      self._htmlBuf.push(
        childComp.getPreviewHtml());
    } else {
      var commentString = self.builderId + '_' +
            (self._nextNum++);
      self._htmlBuf.push('<!--' + commentString + '-->');

      self._childrenToAttach[commentString] = childComp;
    }
  },
  comment: function (stringOrFunction) {
    // XXX making comments reactively update seems
    // right, for completeness; consider doing that.

    var self = this;

    var content;
    if (typeof stringOrFunction === 'function') {
      var func = stringOrFunction;
      content = func();
    } else {
      if (typeof stringOrFunction !== 'string')
        throw new Error("string required");
      content = stringOrFunction;
    }

    // comments can't have "--" in them in HTML.
    // just strip those so that we don't run into trouble.
    content = content.replace(/--/g, '');
    self._htmlBuf.push('<!--' + content + '-->');
  },
  doctype: function (name, options) {
    var buf = this._htmlBuf;
    buf.push('<!DOCTYPE ', name);
    // XXX handle options (publicId, systemId, ...)
    buf.push('>');
  },
  build: function () {
    var self = this;

    if (self._isPreview)
      throw new Error("Can't build preview HTML as DOM");

    var html = self._htmlBuf.join('');
    var frag = DomUtils.htmlToFragment(html);
    if (! frag.firstChild)
      frag.appendChild(document.createComment("empty"));

    var components = self._childrenToAttach;
    var start = frag.firstChild;
    var end = frag.lastChild;

    // wireUpDOM = replace comments with Components and register
    // keyed elements
    var wireUpDOM = function (parent) {
      var n = parent.firstChild;
      while (n) {
        var next = n.nextSibling;
        if (n.nodeType === 8) { // COMMENT
          var comp = components[n.nodeValue];
          if (comp) {
            if (parent === frag) {
              if (n === frag.firstChild)
                start = comp;
              if (n === frag.lastChild)
                end = comp;
            }
            comp.attach(parent, n);
            parent.removeChild(n);
          }
        } else if (n.nodeType === 1) { // ELEMENT
          var elemKey = n.getAttribute('data-meteorui-id');
          if (elemKey)
            self._component.registerElement(elemKey, n);

          // recurse through DOM
          wireUpDOM(n);
        }
        n = next;
      }
    };

    wireUpDOM(frag);

    return {
      fragment: frag,
      start: start,
      end: end
    };
  },
  getFullHtml: function () {
    if (! this._isPreview)
      throw new Error("Can only get full HTML when previewing");

    return this._htmlBuf.join('');
  }
});
