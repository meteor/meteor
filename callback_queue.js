var assert = require("assert");
var Fiber = require("fibers");
var Promise = require("promise");
var undefined;

// Just in case someone tampers with Fiber.yield, don't let that interfere
// with our processing of the callback queue.
var originalYield = Fiber.yield;

// Runs callback functions in a shared fiber, preserving the
// ._meteorDynamics of the calling Fiber.
function CallbackQueue() {
  var cbqHead = {};
  var cbqTail = cbqHead;
  var cbqWaiting = true;
  var cbqSharedFiber = new Fiber(function () {
    while (true) {
      var next = cbqHead.next;
      if (next) {
        var entry = next.entry;
        cbqHead = next;

        // No need to clone or restore these dynamic values, because no
        // two entry.callback functions can be running at the same time,
        // and cbqSharedFiber has no ._meteorDynamics worth preserving.
        cbqSharedFiber._meteorDynamics =
          entry.callingFiber instanceof Fiber &&
          entry.callingFiber._meteorDynamics ||
          undefined;

        try {
          entry.resolve(entry.callback.apply(
            entry.context || null,
            entry.args || []
          ));
        } catch (error) {
          entry.reject(error);
        }

      } else {
        cbqWaiting = true;
        originalYield.call(Fiber);
        cbqWaiting = false;
      }
    }
  });

  this.enqueue = function enqueue(entry) {
    assert.strictEqual(typeof entry, "object");
    assert.strictEqual(typeof entry.callback, "function");

    var promise = new Promise(function (resolve, reject) {
      entry.resolve = resolve;
      entry.reject = reject;
      cbqTail = cbqTail.next = { entry: entry };
    });

    if (cbqWaiting) {
      cbqSharedFiber.run();
    }

    return promise;
  };
}

exports.makeQueue = function () {
  return new CallbackQueue;
};
