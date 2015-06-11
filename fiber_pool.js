var assert = require("assert");
var Fiber = require("fibers");
var undefined;

// Just in case someone tampers with Fiber.yield, don't let that interfere
// with our processing of the callback queue.
var originalYield = Fiber.yield;

function FiberPool(Promise) {
  assert.ok(this instanceof FiberPool);
  assert.strictEqual(typeof Promise, "function");

  var fiberStack = [];

  function makeNewFiber() {
    var fiber = new Fiber(function () {
      while (true) {
        var entry = originalYield.call(Fiber);

        // Ensure this Fiber is no longer in the pool once it begins to
        // execute an entry.
        assert.strictEqual(fiberStack.indexOf(fiber), -1);

        fiber._meteorDynamics = entry.dynamics || undefined;

        try {
          entry.resolve(entry.callback.apply(
            entry.context || null,
            entry.args || []
          ));
        } catch (error) {
          entry.reject(error);
        }

        // Not strictly necessary, but it seems wise not to let this
        // property remain accessible on fibers waiting in the pool.
        delete fiber._meteorDynamics;

        fiberStack.push(fiber);
      }
    });

    // Run the new Fiber up to the first yield point, so that it will be
    // ready to receive entries.
    fiber.run();

    return fiber;
  }

  this.run = function (entry) {
    assert.strictEqual(typeof entry, "object");
    assert.strictEqual(typeof entry.callback, "function");

    var fiber = fiberStack.pop() || makeNewFiber();

    var promise = new Promise(function (resolve, reject) {
      entry.resolve = resolve;
      entry.reject = reject;
    });

    fiber.run(entry);

    return promise;
  };
}

exports.makePool = function (Promise) {
  return new FiberPool(Promise);
};
