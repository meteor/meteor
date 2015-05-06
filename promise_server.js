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
