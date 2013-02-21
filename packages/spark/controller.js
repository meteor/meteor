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

    // Also record the parent class for our future use.
    newClass.superclass = parentClass;

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

  var nextLandmarkId = 1;

  Spark.Landmark = function () {
    this.id = nextLandmarkId++;
    this._range = null;
    this.setPreserve(this.preserve);
    this._initialParent = null;
  };
  Spark.Landmark.extend = extendThis;

  _.extend(Spark.Landmark.prototype, {
    init: function () {
      // override this
      // called when first created with initial arguments
    },
    recycle: function () {
      // override this
      // called when rerendering and trying to reuse controller with
      // updated arguments
    },
    setPreserve: function (preserve) {
      // Normalize preserve map from preserve into this._preservations.
      var preservations = {};
      if (_.isArray(preserve))
        _.each(preserve, function (selector) {
          preservations[selector] = true;
        });
      else
        preservations = preserve || {};
      for (var selector in preservations)
        if (typeof preservations[selector] !== 'function')
          preservations[selector] = function () { return true; };
      this.preserve = preserve;
      this._preservations = preservations;
    },
    firstNode: function () {
      return this._range.firstNode();
    },
    lastNode: function () {
      return this._range.lastNode();
    },
    find: function (selector) {
      var r = this._range;
      return DomUtils.findClipped(r.containerNode(), selector,
                                  r.firstNode(), r.lastNode());
    },
    findAll: function (selector) {
      var r = this._range;
      return DomUtils.findAllClipped(r.containerNode(), selector,
                                     r.firstNode(), r.lastNode());
    },
    hasDom: function () {
      return !! this._range;
    },
    _setRange: function (range) {
      this._range = range;
      this._initialParent = null;
    },
    _setInitialParent: function (initialParent) {
      this._initialParent = initialParent;
    },
    _tearDown: function () {
      this._range = null;
      // XXX walk the subclasses here so finalize() impls don't have to call super
      this.finalize();
    },
    finalize: function () {
      // do nothing.  subclasses may override.
    },
    rendered: function () {
      // do nothing.  subclasses may override.
    },
    constant: false,
    // this property is only read once, in the constructor
    preserve: {},
    parent: function (cls) {
      // find nearest enclosing parent Controller of class `cls`, if any
      if (cls) {
        var walk = this;
        do {
          walk = walk.parent();
        } while (walk && ! (walk instanceof cls));
        return walk;
      }

      // find nearest enclosing parent Controller
      if (this._range) {
        var range = this._range;
        do {
          range = range.findParent();
        } while (range && range.type !== Spark._ANNOTATION_LANDMARK);

        return (range && range.landmark);
      } else {
        // no LiveRange; get it from creation time
        return this._initialParent;
      }
    }
  });


})();