var MeteorPromise = require("meteor-promise");
MeteorPromise.Fiber = require("fibers");
Promise = MeteorPromise;

// Requiring this module installs global.babelHelpers.
require("babel-core/external-helpers");

// Requiring this module installs global.regeneratorRuntime.
require("regenerator/runtime");

var runtime = module.exports = babelHelpers;

runtime.sanitizeForInObject = function (obj) {
  if (Array.isArray(obj)) {
    var newObj = {};
    var keys = Object.keys(obj);
    var keyCount = keys.length;
    for (var i = 0; i < keyCount; ++i) {
      var key = keys[i];
      newObj[key] = obj[key];
    }
    return newObj;
  }

  return obj;
};
