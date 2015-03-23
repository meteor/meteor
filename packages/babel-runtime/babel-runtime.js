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
      // XXX TODO: don't use Object.defineProperties, and disallow cases that
      // require it, like getters and setters
      Object.defineProperties(target, props);
    }

    return function (Constructor, protoProps, staticProps) {
      if (protoProps) defineProperties(Constructor.prototype, protoProps);
      if (staticProps) defineProperties(Constructor, staticProps);
      return Constructor;
    };
  })(),
  inherits: function (subClass, superClass) {
    if (typeof superClass !== "function" && superClass !== null) {
      throw new TypeError("Super expression must either be null or a function, not " + typeof superClass);
    }
    // XXX TODO: Don't depend on Object.create, which doesn't exist in IE 8.
    subClass.prototype = Object.create(superClass && superClass.prototype, {
      constructor: {
        value: subClass,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
    // XXX TODO: Don't depend on __proto__, which doesn't work in IE 8-10.
    // There's no perfect way to make static methods inherited if they are
    // assigned after declaration of the classes.  The best we can do is
    // probably to copy them.  In other words, when you write `class Foo
    // extends Bar`, we copy the static methods from Bar onto Foo, but future
    // ones are not copied.
    if (superClass) subClass.__proto__ = superClass;
  }
};
