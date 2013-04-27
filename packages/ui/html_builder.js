

ComponentInfo = function (constructorName) {
  this.constructorName = constructorName;
//  this.children = {};
//  this.elements = {};
};


HtmlBuilder = function () {
  this.htmlBuf = [];

  this.rootComponentInfo = null;
  this.currentComponentInfo = null;
  // parent chain of currentComponent
  this.componentInfoStack = [];

//  this.builderId = Random.id();
//  this.nextElementNum = 1;

  //this.chunkPool = [];
  // openChunk and closeChunk are primitives that build
  // the chunkPool.  They are possibly private.
  // Can tell if openChunks or closeChunks are consecutive
  // by looking at length of htmlBuf.  Interesting algo
  // problem to build the chunk info correctly.
  // ChunkInfo class?  Oh, it won't deserialize with
  // class intact... without EJSON...
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

var evaluateStringOrHelper = function (stringOrHelper, component) {
  if ((typeof stringOrHelper) === 'string')
    return stringOrHelper;

  if (! (component instanceof Component))
    throw new Error("Can only use a helper from a Component");
  if (! component.evaluateHelper)
    throw new Error("Enclosing Component does not support helpers");

  return component.evaluateHelper(stringOrHelper);
};

_.extend(HtmlBuilder.prototype, {
  encodeEntities: function (text, isQuoted) {
    // All HTML entities in templates are decoded by the template
    // parser and given to HtmlBuilder as Unicode.  We then re-encode
    // some characters into entities here, but not most characters.
    // If you're trying to use entities to send ASCII representations
    // of non-ASCII characters to the client, you'll need a different
    // policy here.
    return text.replace(isQuoted ? ESCAPED_CHARS_QUOTED_REGEX :
                        ESCAPED_CHARS_UNQUOTED_REGEX, escapeOne);
  },
  computeAttributeValue: function (expression) {
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
  },
  openTag: function (tagName, attrs, options) {
    var self = this;

    if ((typeof tagName) !== 'string' ||
        ! TAG_NAME_REGEX.test(tagName))
      throw new Error("Illegal HTML tag name: " + tagName);

    attrs = attrs || {};
    options = options || {};

    var buf = this.htmlBuf;
    buf.push('<', tagName);
    _.each(attrs, function (attrValue, attrName) {
      if ((typeof attrName) !== 'string' ||
          ! ATTRIBUTE_NAME_REGEX.test(attrName))
        throw new Error("Illegal HTML attribute name: " + attrName);

      buf.push(' ', attrName, '="');
      buf.push(self.encodeEntities(self.computeAttributeValue(attrValue),
                                   true));
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
    this.htmlBuf.push('</', tagName, '>');
  },
  text: function (stringOrHelper) {
    var text = evaluateStringOrHelper(stringOrHelper);
    this.htmlBuf.push(this.encodeEntities(text));
  },
  rawHtml: function (stringOrHelper) {
    var html = evaluateStringOrHelper(stringOrHelper);
    this.htmlBuf.push(html);
  },
  finish: function () {
    return this.htmlBuf.join('');
  }
});

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
// The HtmlBuilder probably has a tree of components
// with children and elements, if only to track comment
// references.

// Component inclusions are also calculated, so their expressions
// must be sent down.  Components must also be serialized on the
// wire.  Argument change leads to update, of course.

// Are Component class names in templates resolved?  Maybe.
// Assuming so, the test for whether a class has changed is
// comparing the resolved constructor names.