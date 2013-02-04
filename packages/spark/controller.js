(function() {

  Spark = {};

  // "Crockford's object()" which creates a new object whose
  // prototype pointer points to an old object `o`.
  // http://javascript.crockford.com/prototypal.html
  var ctor = function () {};
  var object = function (o) {
    ctor.prototype = o;
    return new ctor();
  };

  // We get this pattern from Backbone.
  // See also js-toolbox:
  // https://github.com/jimmydo/js-toolbox/blob/master/toolbox.js
  var createSubclass = function (parentClass, protoProps, staticProps) {
    var newClass;

    // Since a "class" is just a constructor function, set newClass
    // to protoProps.constructor if it exists, or make up a constructor
    // that calls parentClass.apply(this, arguments).
    //
    // Custom constructors are expected to apply the parent constructor
    // by name:
    //
    //     MyClass = SomeClass.extend({
    //       constructor: function () {
    //         // ... do stuff ...
    //         // call parent constructor:
    //         SomeClass.apply(this, arguments);
    //         // ... do stuff...
    //       }
    //     });

    if (protoProps && protoProps.hasOwnProperty('constructor'))
      newClass = protoProps.constructor;
    else
      newClass = function () { return parentClass.apply(this, arguments); };

    // Inherit class (static) properties from parent.
    _.extend(newClass, parentClass);

    // Establish a prototype link from newClass.prototype to
    // parentClass.prototype.  This is similar to making
    // newClass.prototype a `new parentClass` but bypasses
    // the constructor.
    newClass.prototype = object(parentClass.prototype);

    // Add prototype properties (instance properties) to the new class,
    // if supplied.
    if (protoProps)
      _.extend(newClass.prototype, protoProps);

    // Add static properties to the constructor function, if supplied.
    if (staticProps)
      _.extend(newClass.prototype, staticProps);

    // Give instances a `constructor` property equal to `newClass`.
    newClass.prototype.constructor = newClass;

    return newClass;
  };

  // Assuming `this` is a class (i.e. a constructor function),
  // return a new class which is a subclass and supports `extend`.
  // This is the implementation of `extend`.
  function extendThis(protoProps, staticProps) {
    var subclass = createSubclass(this, protoProps, staticProps);
    subclass.extend = extendThis;
    return subclass;
  }

  Spark.ControllerBase = function () {};
  Spark.ControllerBase.extend = extendThis;

})();