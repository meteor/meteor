meteorBabelHelpers = module.exports = {
  sanitizeForInObject: function (obj) {
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
  }
};
