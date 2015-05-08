var assert = require("assert");
var Fiber = require("fibers");
var Promise = require("promise");
module.exports = exports = Promise;

function await(promise) {
  var fiber = Fiber.current;

  assert.ok(
    fiber instanceof Fiber,
    "Cannot await without a Fiber"
  );

  promise.then(function (res) {
    fiber.run(res);
  }, function (err) {
    fiber.throwInto(err);
  });

  return Fiber.yield();
}

Promise.awaitAll = function (args) {
  return await(Promise.all(args));
};

Promise.await = function (arg) {
  return await(Promise.resolve(arg));
};

Promise.prototype.await = function () {
  return await(this);
};

Promise.async = function (fn, allowReuseOfCurrentFiber) {
  return function () {
    var self = this;
    var args = arguments;

    if (allowReuseOfCurrentFiber && Fiber.current) {
      return Promise.resolve(fn.apply(self, args));
    }

    return new Promise(function (resolve, reject) {
      new Fiber(function () {
        try {
          resolve(fn.apply(self, args));
        } catch (err) {
          reject(err);
        }
      }).run();
    });
  };
};

Function.prototype.async = function (allowReuseOfCurrentFiber) {
  return Promise.async(this, allowReuseOfCurrentFiber);
};
