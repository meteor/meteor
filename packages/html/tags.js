// A Tag is an array of zero or more content items, with additional properties
// `tagName` (String, required) and `attrs` (Object or `null`).  In addition to
// be arrays, Tags are `instanceof HTML.Tag`.
//
// An attribute value may be null, a string, a CharRef tag, or an array of
// strings, CharRef tags, arrays, and nulls.
//
// Tags are created using tag functions, e.g. `DIV(P({id:'foo'}, "Hello"))`.
// If a tag function is given a first argument that is an object and not a
// Tag or an array, that object is used as element attributes (`attrs`).
// The attrs argument may be of the form `{$attrs: function () { ... }}` in
// which case the function becomes the `attrs` attribute of the tag.
//
// Tag functions for all known tags are available as `HTML.Tag.DIV`,
// `HTML.Tag.SPAN`, etc., and you can define new ones with
// `HTML.defineTag("FOO")`, which makes a tag function available at
// `HTML.Tag.FOO` henceforth. You can also use `HTML.getTag("FOO")` to
// define (if necessary) and return a tag function.

Tag = function (tagName, attrs) {
  this.tagName = tagName;
  this.attrs = attrs; // may be falsy
};
Tag.prototype = [];

makeTagFunc = function (name) {
  // Do a little dance so that tags print nicely in the Chrome console.
  // First make tag name suitable for insertion into evaluated JS code,
  // for security reasons mainly.
  var sanitizedName = String(name).replace(/^[^a-zA-Z_]|[^a-zA-Z_0-9]+/g,
                                           '') || 'Tag';
  // Generate a constructor function whose name is the tag name.
  // We try to choose generic-sounding variable names in case V8 infers
  // them as type names and they show up in the developer console.
  // HTMLTag is the constructor function for our specific tag type,
  // while Tag is the super constructor.
  var HTMLTag = (new Function('return function ' +
                              sanitizedName +
                              '(attrs) { this.attrs = attrs; };'))();
  HTMLTag.prototype = new Tag(name);

  return function (optAttrs/*, children*/) {
    // see whether first argument is truthy and not an Array or Tag
    var attrsGiven = (optAttrs && (typeof optAttrs === 'object') &&
                      (typeof optAttrs.splice !== 'function'));
    var attrs = (attrsGiven ? optAttrs : null);
    if (attrsGiven && (typeof attrs.$attrs === 'function'))
      attrs = attrs.$attrs;

    var tag = new HTMLTag(attrs);
    tag.push.apply(tag, (attrsGiven ?
                         Array.prototype.slice.call(arguments, 1) :
                         arguments));
    return tag;
  };
};

defineTag = function (name) {
  // XXX maybe sanity-check name?  Like no whitespace.
  name = name.toUpperCase();
  Tag[name] = makeTagFunc(name);
  return Tag[name];
};

getTag = function (name) {
  name = name.toUpperCase();
  return Tag[name] || defineTag(name);
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

// checks that a pseudoDOM node with tagName "Comment" is well-formed.
var checkEmitCode = function (node) {
  if (node.attrs)
    throw new Error("EmitCode can't have attributes");
  if (node.length !== 1 || (typeof node[0] !== 'string'))
    throw new Error("EmitCode should have exactly one content item, a simple string");
};

var checkSpecial = function (node) {
  if (! node.attrs)
    throw new Error("Special tag must have attributes");
  if (node.length > 0)
    throw new Error("Special tag must not have content");
};

typeOf = function (node) {
  if (node && (typeof node === 'object') &&
      (typeof node.splice === 'function')) {
    // Tag or array
    if (node.tagName) {
      if (node.tagName === 'CharRef') {
        checkCharRef(node);
        return 'charref';
      } else if (node.tagName === 'Comment') {
        checkComment(node);
        return 'comment';
      } else if (node.tagName === 'EmitCode') {
        checkEmitCode(node);
        return 'emitcode';
      } else if (node.tagName === 'Special') {
        checkSpecial(node);
        return 'special';
      } else {
        return 'tag';
      }
    } else {
      return 'array';
    }
  } else if (typeof node === 'string') {
    return 'string';
  } else if (typeof node === 'function') {
    return 'function';
  } else if (node == null) {
    return 'null';
  } else {
    throw new Error("Unexpected item in HTML tree: " + node);
  }
};