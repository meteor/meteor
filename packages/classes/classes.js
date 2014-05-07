Classes = {};

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

Classes._extends = function(child, parent) {
  _.extend(child, parent);
  if (Object.create) {
    child.prototype = Object.create(parent.prototype);
  } else {
    var ctor = function () {};
    ctor.prototype = parent.prototype;
    child.prototype = new ctor();
  }
  child.prototype.constructor = child;
  child.__super__ = parent.prototype;
  return child;
};

Classes._extend = function (props) {
  var parent = this !== Classes ? this : null;
  var constructor;
  if (_hasOwnProperty(props, 'constructor')) {
    constructor = props.constructor;
  } else if (parent) {
    constructor = function () { parent.apply(this, arguments); };
  } else {
    constructor = function () {};
  }

  if (parent)
    Classes._extends(constructor, parent);

  _assign(constructor.prototype, props);

  return constructor;
};

Classes.create = function (props, parentClass) {
  var constructor = Classes._extend.call(parentClass || Classes, props);
  constructor.extend = Classes._extend;
  return constructor;
};
