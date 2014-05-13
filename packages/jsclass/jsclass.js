JSClass = {};

// _assign is like _.extend or the upcoming Object.assign.
// Copy src's own, enumerable properties onto tgt and return
// tgt.
var _hasOwnProperty = Object.prototype.hasOwnProperty;
var _assign = function (tgt, src) {
  for (var k in src) {
    if (_hasOwnProperty.call(src, k))
      tgt[k] = src[k];
  }
  return tgt;
};

JSClass._extends = function(cls, supr) {
  _assign(cls, supr);
  if (Object.create) {
    cls.prototype = Object.create(supr.prototype);
  } else {
    var ctor = function () {};
    ctor.prototype = supr.prototype;
    cls.prototype = new ctor();
  }
  cls.prototype.constructor = cls;
  cls.__super__ = supr.prototype;
  return cls;
};

JSClass._extend = function (props) {
  var supr = this !== JSClass ? this : null;
  var constructor;
  if (props && _hasOwnProperty.call(props, 'constructor')) {
    constructor = props.constructor;
  } else if (supr) {
    constructor = function () { supr.apply(this, arguments); };
  } else {
    constructor = function () {};
  }

  if (supr)
    JSClass._extends(constructor, supr);

  if (props)
    _assign(constructor.prototype, props);

  return constructor;
};

/**
 * JSClass.create([props], [superClass])
 *
 * Defines a new class and returns it.
 *
 * * `props` - optional dictionary of properties (typically methods)
 *   to assign to the prototype.  The `constructor` method is special
 *   and becomes the class constructor.
 *
 * * `superClass` - optional superclass
 *
 * If a superclass is provided but no constructor, a default constructor
 * is supplied that calls the super constructor.
 *
 * All classes created in this way have a `.extend(props)` method that
 * creates a superclass.
 */
JSClass.create = function (props, superClass) {
  if (typeof props === 'function') {
    superClass = props;
    props = null;
  }
  var constructor = JSClass._extend.call(superClass || JSClass, props);
  constructor.extend = JSClass._extend;
  return constructor;
};
