var global = this;

if (typeof global.Promise === "function") {
  exports.Promise = global.Promise;
} else {
  exports.Promise = global.Promise =
    require("promise/lib/es6-extensions");
}

exports.Promise.prototype.done = function (onFulfilled, onRejected) {
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
