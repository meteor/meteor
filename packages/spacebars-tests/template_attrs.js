var cache = {};

Template.__define__ = (function (define) {

  return function (name, renderFunc, attrs) {
    cache[name] = attrs || {};
    return define.apply(this, arguments);
  };

})(Template.__define__);

// this is only for testing purposes
Template.__getAttrs__ = function (name) {
  return cache[name];
}
