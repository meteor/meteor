var assert = require("assert");
var undefined;

function FiberPool(targetFiberCount) {
  assert.ok(this instanceof FiberPool);
  assert.strictEqual(typeof targetFiberCount, "number");

  var fiberStack = [];

  function makeNewFiber(Fiber) {
    // Just in case someone tampers with Fiber.yield, don't let that interfere
    // with our processing of the callback queue.
    var originalYield = Fiber.yield;

    var fiber = new Fiber(function () {
      while (true) {
        // Call Fiber.yield() to await further instructions.
        var entry = originalYield.call(Fiber);

        // Ensure this Fiber is no longer in the pool once it begins to
        // execute an entry.
        assert.strictEqual(fiberStack.indexOf(fiber), -1);

        if (entry.dynamics) {
          // Restore the dynamic environment of this fiber as if
          // entry.callback had been wrapped by Meteor.bindEnvironment.
          Object.keys(entry.dynamics).forEach(function (key) {
            fiber[key] = entry.dynamics[key];
          });
        }

        try {
          entry.resolve(entry.callback.apply(
            entry.context || null,
            entry.args || []
          ));
        } catch (error) {
          entry.reject(error);
        }

        // Remove all own properties of the fiber before returning it to
        // the pool.
        Object.keys(fiber).forEach(function (key) {
          delete fiber[key];
        });

        if (fiberStack.length < targetFiberCount) {
          fiberStack.push(fiber);
        } else {
          // If the pool has already reached the target maximum number of
          // Fibers, don't bother recycling this Fiber.
          break;
        }
      }
    });

    // Run the new Fiber up to the first yield point, so that it will be
    // ready to receive entries.
    fiber.run();

    return fiber;
  }

  // Run the entry.callback function in a Fiber either taken from the pool
  // or created anew if the pool is empty. This method returns a Promise
  // for the eventual result of the entry.callback function.
  this.run = function (entry, Promise) {
    assert.strictEqual(typeof entry, "object");
    assert.strictEqual(typeof entry.callback, "function");

    if (typeof Promise.Fiber !== "function") {
      return new Promise(function (resolve) {
        resolve(entry.callback.apply(
          entry.context || null,
          entry.args
        ));
      });
    }

    var fiber = fiberStack.pop() || makeNewFiber(Promise.Fiber);

    var promise = new Promise(function (resolve, reject) {
      entry.resolve = resolve;
      entry.reject = reject;
    });

    fiber.run(entry);

    return promise;
  };

  // Limit the maximum number of idle Fibers that may be kept in the
  // pool. Note that the run method will never refuse to create a new
  // Fiber if the pool is empty; it's just that excess Fibers might be
  // thrown away upon completion, if the pool is full.
  this.setTargetFiberCount = function (limit) {
    assert.strictEqual(typeof limit, "number");

    targetFiberCount = Math.max(limit, 0);

    if (targetFiberCount < fiberStack.length) {
      // If the requested target count is less than the current length of
      // the stack, truncate the stack and terminate any surplus Fibers.
      fiberStack.splice(targetFiberCount).forEach(function (fiber) {
        fiber.reset();
      });
    }

    return this;
  };
}

// Call pool.drain() to terminate all Fibers waiting in the pool and
// signal to any outstanding Fibers that they should exit upon completion,
// instead of reinserting themselves into the pool.
FiberPool.prototype.drain = function () {
  return this.setTargetFiberCount(0);
};

exports.makePool = function (targetFiberCount) {
  return new FiberPool(targetFiberCount || 20);
};
