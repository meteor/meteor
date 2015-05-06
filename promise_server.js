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

Promise.async = function (fn) {
  return function () {
    if (Fiber.current) {
      return Promise.resolve(fn.apply(this, arguments));
    }

    return new Promise(function (resolve) {
      new Fiber(function () {
        resolve(fn.apply(this, arguments));
      }).run();
    });
  }
};

Function.prototype.async = function () {
  return Promise.async(this);
};
