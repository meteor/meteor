var hasOwn = Object.prototype.hasOwnProperty;

var g =
  typeof global === "object" ? global :
  typeof window === "object" ? window :
  typeof self === "object" ? self : this;

var GlobalPromise = g.Promise;
var NpmPromise = require("promise");

function copyMethods(target, source) {
  Object.keys(source).forEach(function (key) {
    var value = source[key];
    if (typeof value === "function" &&
        ! hasOwn.call(target, key)) {
      target[key] = value;
    }
  });
}

if (typeof GlobalPromise === "function") {
  copyMethods(GlobalPromise, NpmPromise);
  copyMethods(GlobalPromise.prototype, NpmPromise.prototype);
  module.exports = GlobalPromise;
} else {
  module.exports = NpmPromise;
}
