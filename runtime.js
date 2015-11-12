var MeteorPromise = require("meteor-promise");
MeteorPromise.Fiber = require("fibers");
Promise = MeteorPromise;

var runtime = exports;

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
