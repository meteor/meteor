// This module exists so that it can be accessed directly via
// require("meteor-babel/modern-versions.js").get() without importing any
// other modules, which can be expensive (10s of ms). Note that the
// babel-preset-meteor/modern module has no top-level require calls, so
// importing it should be very cheap.
exports.get = function () {
  return require("babel-preset-meteor/modern").minimumVersions;
};
