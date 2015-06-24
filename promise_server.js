var assert = require("assert");
var Fiber = require("fibers");
var Promise = require("promise");
var fiberPool = require("./fiber_pool.js").makePool(Promise);

// Replace Promise.prototype.then with a wrapper that ensures the
// onResolved and onRejected callbacks always run in a Fiber.
var es6PromiseThen = Promise.prototype.then;
Promise.prototype.then = function (onResolved, onRejected) {
  return es6PromiseThen.call(
    this,
    wrapCallback(onResolved),
    wrapCallback(onRejected)
  );
};

function wrapCallback(callback) {
  var fiber = Fiber.current;
  var dynamics = fiber && fiber._meteorDynamics;

  return callback && function (arg) {
    return fiberPool.run({
      callback: callback,
      args: [arg], // Avoid dealing with arguments objects.
      dynamics: dynamics
    });
  };
}

// Yield the current Fiber until the given Promise has been fulfilled.
function await(promise) {
  var fiber = Fiber.current;

  assert.ok(
    fiber instanceof Fiber,
    "Cannot await without a Fiber"
  );

  // The overridden es6PromiseThen function is adequate here because these
  // two callbacks do not need to run in a Fiber.
  es6PromiseThen.call(promise, function (result) {
    fiber.run(result);
  }, function (error) {
    fiber.throwInto(error);
  });

  return Fiber.yield();
}

Promise.awaitAll = function (args) {
  return await(this.all(args));
};

Promise.await = function (arg) {
  return await(this.resolve(arg));
};

Promise.prototype.await = function () {
  return await(this);
};

// Return a wrapper function that returns a Promise for the eventual
// result of the original function.
Promise.async = function (fn, allowReuseOfCurrentFiber) {
  var Promise = this;

  return function () {
    var self = this;
    var args = arguments;
    var fiber = Fiber.current;

    if (allowReuseOfCurrentFiber && fiber) {
      return Promise.resolve(fn.apply(self, args));
    }

    return fiberPool.run({
      callback: fn,
      context: self,
      args: args,
      dynamics: fiber && fiber._meteorDynamics
    });
  };
};

Function.prototype.async = function (allowReuseOfCurrentFiber) {
  return Promise.async(this, allowReuseOfCurrentFiber);
};

module.exports = exports = Promise;
