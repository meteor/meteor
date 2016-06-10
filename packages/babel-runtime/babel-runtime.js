var hasOwn = Object.prototype.hasOwnProperty;
var S = typeof Symbol === "function" ? Symbol : {};
var iteratorSymbol = S.iterator || "@@iterator";

meteorBabelHelpers = require("meteor-babel-helpers");

var BabelRuntime = {
  // es6.templateLiterals
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

  // es6.classes
  // Checks that a class constructor is being called with `new`, and throws
  // an error if it is not.
  classCallCheck: function (instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  },

  // es6.classes
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

      // The ecmascript-runtime package provides adequate polyfills for
      // all of these Object.* functions (and Array#forEach), and anyone
      // using babel-runtime is almost certainly using it because of the
      // ecmascript package, which also implies ecmascript-runtime.
      Object.getOwnPropertyNames(superClass).forEach(function (k) {
        // This property descriptor dance preserves getter/setter behavior
        // in browsers that support accessor properties (all except
        // IE8). In IE8, the superClass can't have accessor properties
        // anyway, so this code is still safe.
        var descriptor = Object.getOwnPropertyDescriptor(superClass, k);
        if (descriptor && typeof descriptor === "object") {
          if (Object.getOwnPropertyDescriptor(subClass, k)) {
            // If subClass already has a property by this name, then it
            // would not be inherited, so it should not be copied. This
            // notably excludes properties like .prototype and .name.
            return;
          }

          Object.defineProperty(subClass, k, descriptor);
        }
      });
    }
  },

  createClass: (function () {
    var hasDefineProperty = false;
    try {
      // IE 8 has a broken Object.defineProperty, so feature-test by
      // trying to call it.
      Object.defineProperty({}, 'x', {});
      hasDefineProperty = true;
    } catch (e) {}

    function defineProperties(target, props) {
      for (var i = 0; i < props.length; i++) {
        var descriptor = props[i];
        descriptor.enumerable = descriptor.enumerable || false;
        descriptor.configurable = true;
        if ("value" in descriptor) descriptor.writable = true;
        Object.defineProperty(target, descriptor.key, descriptor);
      }
    }

    return function (Constructor, protoProps, staticProps) {
      if (! hasDefineProperty) {
        // e.g. `class Foo { get bar() {} }`.  If you try to use getters and
        // setters in IE 8, you will get a big nasty error, with or without
        // Babel.  I don't know of any other syntax features besides getters
        // and setters that will trigger this error.
        throw new Error(
          "Your browser does not support this type of class property.  " +
            "For example, Internet Explorer 8 does not support getters and " +
            "setters.");
      }

      if (protoProps) defineProperties(Constructor.prototype, protoProps);
      if (staticProps) defineProperties(Constructor, staticProps);
      return Constructor;
    };
  })(),

  "typeof": function (obj) {
    return obj && obj.constructor === Symbol ? "symbol" : typeof obj;
  },

  possibleConstructorReturn: function (self, call) {
    if (! self) {
      throw new ReferenceError(
        "this hasn't been initialised - super() hasn't been called"
      );
    }

    var callType = typeof call;
    if (call &&
        callType === "function" ||
        callType === "object") {
      return call;
    }

    return self;
  },

  interopRequireDefault: function (obj) {
    return obj && obj.__esModule ? obj : { 'default': obj };
  },

  interopRequireWildcard: function (obj) {
    if (obj && obj.__esModule) {
      return obj;
    }

    var newObj = {};

    if (obj != null) {
      for (var key in obj) {
        if (hasOwn.call(obj, key)) {
          newObj[key] = obj[key];
        }
      }
    }

    newObj["default"] = obj;
    return newObj;
  },

  interopExportWildcard: function (obj, defaults) {
    var newObj = defaults({}, obj);
    delete newObj["default"];
    return newObj;
  },

  defaults: function (obj, defaults) {
    Object.getOwnPropertyNames(defaults).forEach(function (key) {
      var desc = Object.getOwnPropertyDescriptor(defaults, key);
      if (desc && desc.configurable && typeof obj[key] === "undefined") {
        Object.defineProperty(obj, key, desc);
      }
    });

    return obj;
  },

  // es7.objectRestSpread and react (JSX)
  "extends": Object.assign || (function (target) {
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i];
      for (var key in source) {
        if (hasOwn.call(source, key)) {
          target[key] = source[key];
        }
      }
    }
    return target;
  }),

  // es6.destructuring
  objectWithoutProperties: function (obj, keys) {
    var target = {};
    outer: for (var i in obj) {
      if (! hasOwn.call(obj, i)) continue;
      for (var j = 0; j < keys.length; j++) {
        if (keys[j] === i) continue outer;
      }
      target[i] = obj[i];
    }
    return target;
  },

  // es6.destructuring
  objectDestructuringEmpty: function (obj) {
    if (obj == null) throw new TypeError("Cannot destructure undefined");
  },

  // es6.spread
  bind: Function.prototype.bind || (function () {
    var isCallable = function (value) { return typeof value === 'function'; };
    var $Object = Object;
    var to_string = Object.prototype.toString;
    var array_slice = Array.prototype.slice;
    var array_concat = Array.prototype.concat;
    var array_push = Array.prototype.push;
    var max = Math.max;
    var Empty = function Empty() {};

    // Copied from es5-shim.js (3ac7942).  See original for more comments.
    return function bind(that) {
      var target = this;
      if (!isCallable(target)) {
        throw new TypeError('Function.prototype.bind called on incompatible ' + target);
      }

      var args = array_slice.call(arguments, 1);

      var bound;
      var binder = function () {

        if (this instanceof bound) {
          var result = target.apply(
            this,
            array_concat.call(args, array_slice.call(arguments))
          );
          if ($Object(result) === result) {
            return result;
          }
          return this;
        } else {
          return target.apply(
            that,
            array_concat.call(args, array_slice.call(arguments))
          );
        }
      };

      var boundLength = max(0, target.length - args.length);

      var boundArgs = [];
      for (var i = 0; i < boundLength; i++) {
        array_push.call(boundArgs, '$' + i);
      }

      // Create a Function from source code so that it has the right `.length`.
      // Probably not important for Babel.  This code violates CSPs that ban
      // `eval`, but the browsers that need this polyfill don't have CSP!
      bound = Function('binder', 'return function (' + boundArgs.join(',') + '){ return binder.apply(this, arguments); }')(binder);

      if (target.prototype) {
        Empty.prototype = target.prototype;
        bound.prototype = new Empty();
        Empty.prototype = null;
      }

      return bound;
    };

  })(),

  toConsumableArray: function (arr) {
    if (Array.isArray(arr)) {
      for (var i = arr.length - 1, arr2 = Array(i + 1); i >= 0; --i) {
        arr2[i] = arr[i];
      }

      return arr2;
    }

    return Array.from(arr);
  },

  toArray: function (arr) {
    return Array.isArray(arr) ? arr : Array.from(arr);
  },

  slicedToArray: function (iterable, limit) {
    if (Array.isArray(iterable)) {
      return iterable;
    }

    if (iterable) {
      var it = iterable[iteratorSymbol]();
      var result = [];
      var info;

      if (typeof limit !== "number") {
        limit = Infinity;
      }

      while (result.length < limit &&
             ! (info = it.next()).done) {
        result.push(info.value);
      }

      return result;
    }

    throw new TypeError(
      "Invalid attempt to destructure non-iterable instance"
    );
  },

  slice: Array.prototype.slice
};

// Use meteorInstall to install all of the above helper functions within
// node_modules/babel-runtime/helpers.
Object.keys(BabelRuntime).forEach(function (helperName) {
  var helpers = {};

  helpers[helperName + ".js"] = function (require, exports, module) {
    module.exports = BabelRuntime[helperName];
  };

  meteorInstall({
    node_modules: {
      "babel-runtime": {
        helpers: helpers
      }
    }
  });
});

// Use meteorInstall to install the regenerator runtime at
// node_modules/babel-runtime/regenerator.
meteorInstall({
  node_modules: {
    "babel-runtime": {
      "regenerator.js": function (r, e, module) {
        // Note that we use the require function provided to the
        // babel-runtime.js file, not the one named 'r' above.
        var runtime = require("regenerator-runtime");

        // If Promise.asyncApply is defined, use it to wrap calls to
        // runtime.async so that the entire async function will run in its
        // own Fiber, not just the code that comes after the first await.
        if (typeof Promise === "function" &&
            typeof Promise.asyncApply === "function") {
          var realAsync = runtime.async;
          runtime.async = function () {
            return Promise.asyncApply(realAsync, runtime, arguments);
          };
        }

        module.exports = runtime;
      }
    }
  }
});
