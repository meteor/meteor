
// TODO
//
// Make the function argument to component
// run reactively.
//
// Then make openTag attributes
// reactive too.

RenderBuffer = function (component) {
  this._component = component;
  this._htmlBuf = [];

  this._builderId = Random.id();
  this._nextNum = 1;

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

_.extend(RenderBuffer.prototype, {
  _encodeEntities: encodeEntities,
  /*computeAttributeValue: function (expression) {
    var self = this;

    if ((typeof expression) === 'string')
      return expression;

    var initialValue;
    Deps.autorun(function (c) {
      if (c.firstRun) {
        c.expression = expression;
        c.component = self.currentComponent;
      } else {
        return; // XXX
      }

      initialValue =
        _.map(c.expression, evaluateStringOrHelper).join('');
    });

    return initialValue;
  },*/
  openTag: function (tagName, attrs, options) {
    var self = this;

    if ((typeof tagName) !== 'string' ||
        ! TAG_NAME_REGEX.test(tagName))
      throw new Error("Illegal HTML tag name: " + tagName);

    attrs = attrs || {};
    options = options || {};

    var buf = this._htmlBuf;
    buf.push('<', tagName);
    _.each(attrs, function (attrValue, attrName) {
      if ((typeof attrName) !== 'string' ||
          ! ATTRIBUTE_NAME_REGEX.test(attrName))
        throw new Error("Illegal HTML attribute name: " + attrName);

      buf.push(' ', attrName, '="');
      var initialValue = (typeof attrValue === 'function' ?
                          attrValue() : attrValue);
      buf.push(self._encodeEntities(initialValue, true));
      buf.push('"');
    });
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
    var comp = (typeof componentOrFunction === 'function' ?
                componentOrFunction() : componentOrFunction);

    var childKey = (options && options.childKey || null);

    this._component.addChild(childKey, comp);

    var commentString = this.builderId + '_' +
          (this._nextNum++);
    this._htmlBuf.push('<!--' + commentString + '-->');

    this._childrenToAttach[commentString] = comp;
  },
  build: function () {
    var html = this._htmlBuf.join('');
    var frag = DomUtils.htmlToFragment(html);
    if (! frag.firstChild)
      frag.appendChild(document.createComment("empty"));

    var components = this._childrenToAttach;
    var start = frag.firstChild;
    var end = frag.lastChild;

    var replaceCommentsWithComponents = function (parent) {
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
          // recurse
          replaceCommentsWithComponents(n);
        }
        n = next;
      }
    };

    replaceCommentsWithComponents(frag);

    return {
      fragment: frag,
      start: start,
      end: end
    };
  }
});

// CHANGES TO COMPONENT NEEDED:
//
// - childKey, elementKey -- call things "key"
// - no attach/detach -- need to wire things up from HTML...


// openChunk, closeChunk
//
// Drop comemnts at start and finish.  Comments may have
// to be fished out due to missing close tags (some fun
// logic there).  Eventually, can produce cleaner HTML
// using attributes in some cases instead of comments.
// Chunks bound components, and also text/raw inclusions.
// Consecutive openChunks or closeChunks create Chunks
// defined in terms of each other.
//
// When building is finished, it produces HTML and some
// other data.  We don't do materialization, because in
// the server-side rendering case, the browser does that!
//
// After materialization, we want to somehow:
// - recalculate all the helpers with deps tracking
// - assign elements to components
// - set bounds of components
//
// ... based on walking the DOM.
//
// The RenderBuffer probably has a tree of components
// with children and elements, if only to track comment
// references.

// Component inclusions are also calculated, so their expressions
// must be sent down.  Components must also be serialized on the
// wire.  Argument change leads to update, of course.

// Are Component class names in templates resolved?  Maybe.
// Assuming so, the test for whether a class has changed is
// comparing the resolved constructor names.