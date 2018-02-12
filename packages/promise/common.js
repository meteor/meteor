var global = this;
var hasOwn = Object.prototype.hasOwnProperty;

if (typeof global.Promise === "function") {
  exports.Promise = global.Promise;
} else {
  exports.Promise = global.Promise =
    require("promise/lib/es6-extensions");
}

var proto = exports.Promise.prototype;

proto.done = function (onFulfilled, onRejected) {
  var self = this;

  if (arguments.length > 0) {
    self = this.then.apply(this, arguments);
  }

  self.then(null, function (err) {
    Meteor._setImmediate(function () {
      throw err;
    });
  });
};

if (! hasOwn.call(proto, "finally")) {
  proto["finally"] = function (onFinally) {
    var threw = false, result;
    return this.then(function (value) {
      result = value;
      // Most implementations of Promise.prototype.finally call
      // Promise.resolve(onFinally()) (or this.constructor.resolve or even
      // this.constructor[Symbol.species].resolve, depending on how spec
      // compliant they're trying to be), but this implementation simply
      // relies on the standard Promise behavior of resolving any value
      // returned from a .then callback function.
      return onFinally();
    }, function (error) {
      // Make the final .then callback (below) re-throw the error instead
      // of returning it.
      threw = true;
      result = error;
      return onFinally();
    }).then(function () {
      if (threw) throw result;
      return result;
    });
  };
}
