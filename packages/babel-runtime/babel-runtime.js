// The name `babelHelpers` is hard-coded in Babel.  Otherwise we would make it
// something capitalized and more descriptive, like `BabelRuntime`.
babelHelpers = {
  // Constructs the object passed to the tag function in a tagged
  // template literal.
  taggedTemplateLiteral: function (strings, raw) {
    // Babel's own version of this calls Object.freeze on `strings` and
    // `strings.raw`, but it doesn't seem worth the compatibility and
    // performance concerns.  If you're writing code against this helper,
    // don't add properties to these objects.
    strings.raw = { value: raw };
    return strings;
  },
  // Checks that a class constructor is being called with `new`, and throws
  // an error if it is not.
  classCallCheck: function (instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  },
  // Builds the class constructor object given its constructor and methods.
  createClass: (function() {
    function defineProperties(target, props) {
      for (var key in props) {
        var prop = props[key];
        prop.configurable = true;
        if (prop.value) prop.writable = true;
      }
      // XXX todo: don't use Object.defineProperties, and disallow cases that
      // require it, like getters and setters
      Object.defineProperties(target, props);
    }

    return function (Constructor, protoProps, staticProps) {
      if (protoProps) defineProperties(Constructor.prototype, protoProps);
      if (staticProps) defineProperties(Constructor, staticProps);
      return Constructor;
    };
  })()
};
