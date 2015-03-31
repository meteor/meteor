// The name `babelHelpers` is hard-coded in Babel.  Otherwise we would make it
// something capitalized and more descriptive, like `BabelRuntime`.
babelHelpers = {
  // Constructs the object passed to the tag function in a tagged
  // template literal.
  taggedTemplateLiteralLoose: function (strings, raw) {
    // Babel's own version of this calls Object.freeze on `strings` and
    // `strings.raw`, but it doesn't seem worth the compatibility and
    // performance concerns.  If you're writing code against this helper,
    // don't add properties to these objects.
    strings.raw = raw;
    return strings;
  },

  // Checks that a class constructor is being called with `new`, and throws
  // an error if it is not.
  classCallCheck: function (instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  },

  inherits: function (subClass, superClass) {
    if (typeof superClass !== "function" && superClass !== null) {
      throw new TypeError("Super expression must either be null or a function, not " + typeof superClass);
    }

    if (superClass) {
      if (Object.create) {
        // All but IE 8
        subClass.prototype = Object.create(superClass.prototype, {
          constructor: {
            value: subClass,
            enumerable: false,
            writable: true,
            configurable: true
          }
        });
      } else {
        // IE 8 path.  Slightly worse for modern browsers, because `constructor`
        // is enumerable and shows up in the inspector unnecessarily.
        // It's not an "own" property of any instance though.
        //
        // For correctness when writing code,
        // don't enumerate all the own-and-inherited properties of an instance
        // of a class and expect not to find `constructor` (but who does that?).
        var F = function () {
          this.constructor = subClass;
        };
        F.prototype = superClass.prototype;
        subClass.prototype = new F();
      }

      // For modern browsers, this would be `subClass.__proto__ = superClass`,
      // but IE <=10 don't support `__proto__`, and in this case the difference
      // would be detectable; code that works in modern browsers could easily
      // fail on IE 8 if we ever used the `__proto__` trick.
      //
      // There's no perfect way to make static methods inherited if they are
      // assigned after declaration of the classes.  The best we can do is
      // to copy them.  In other words, when you write `class Foo
      // extends Bar`, we copy the static methods from Bar onto Foo, but future
      // ones are not copied.
      //
      // For correctness when writing code, don't add static methods to a class
      // after you subclass it.
      for (var k in superClass) {
        if (_hasOwnProperty.call(superClass, k)) {
          subClass[k] = superClass[k];
        }
      }
    }
  }
};

var _hasOwnProperty = Object.prototype.hasOwnProperty;
