// A Tag is an array of zero or more content items, with additional properties
// `tagName` (String, required) and `attrs` (Object or `null`).  In addition to
// be arrays, Tags are `instanceof HTML.Tag`.
//
// Tags are created using tag functions, e.g. `DIV(P({id:'foo'}, "Hello"))`.
// If a tag function is given a first argument that is an object and not a
// Tag or an array, that object is used as element attributes (`attrs`).
// The attrs argument may be of the form `{$attrs: function () { ... }}` in
// which case the function becomes the `attrs` attribute of the tag.
//
// Tag functions for all known tags are available as `HTML.Tag.DIV`,
// `HTML.Tag.SPAN`, etc., and you can define new ones with
// `HTML.Tag.defineTag("FOO")`, which makes a tag function available at
// `HTML.Tag.FOO` henceforth.

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

Tag.defineTag = function (name) {
  // XXX maybe sanity-check name?  Like no whitespace.
  name = name.toUpperCase();
  Tag[name] = makeTagFunc(name);
};
