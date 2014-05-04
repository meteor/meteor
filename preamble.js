Blaze = {};

Blaze._wrapAutorun = function () {}; // replace this for debugging :)

// Adapted from CoffeeScript's `__extends`.
__extends = function(child, parent) {
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
Blaze.__extends = __extends;
