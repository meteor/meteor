var assert = require("assert");
var Fiber = require("fibers");
var Promise = require("../promise.js");

require("../promise_server.js").makeCompatible(Promise, Fiber);

describe("Promise.await", function () {
  it("should work inside an existing Fiber", Promise.async(function () {
    assert.strictEqual(Promise.await(42), 42);
    assert.strictEqual(Promise.await(Promise.resolve("asdf")), "asdf");

    var obj = {};
    assert.strictEqual(Promise.resolve(obj).await(), obj);
  }));

  it("should not switch Fibers", Promise.async(function () {
    var originalFiber = Fiber.current;
    assert.ok(originalFiber instanceof Fiber);
    var promise = Promise.resolve(0);

    for (var i = 0; i < 100; ++i) {
      promise = promise.then(function (count) {
        assert.ok(Fiber.current instanceof Fiber);
        assert.notStrictEqual(Fiber.current, originalFiber);
        return count + 1;
      });
    }

    assert.strictEqual(Promise.await(promise), 100);
    assert.strictEqual(Fiber.current, originalFiber);
  }));

  it("should throw rejection reasons", Promise.async(function () {
    var reason = new Error("reason");
    try {
      Promise.await(Promise.reject(reason));
      assert.ok(false, "should have thrown");
    } catch (error) {
      assert.strictEqual(error, reason);
    }
  }));
});

describe("Promise.awaitAll", function () {
  it("should await multiple promises", Promise.async(function () {
    assert.deepEqual(Promise.awaitAll([
      123,
      Promise.resolve("oyez"),
      new Promise(function (resolve) {
        process.nextTick(function () {
          resolve("resolved");
        });
      })
    ]), [123, "oyez", "resolved"]);
  }));
});

describe("Promise.async", function () {
  it("should create a new Fiber", function () {
    var self = this;

    var parent = Promise.async(function () {
      var parentFiber = Fiber.current;
      assert.ok(parentFiber instanceof Fiber);

      var childFibers = [];
      var child = Promise.async(function (arg) {
        assert.strictEqual(this, self);

        var childFiber = Fiber.current;
        assert.ok(childFiber instanceof Fiber);
        assert.notStrictEqual(childFiber, parentFiber);

        assert.strictEqual(childFibers.indexOf(childFiber), -1);
        childFibers.push(childFiber);

        return Promise.await(arg);
      });

      return Promise.all([
        child.call(this, 1),
        child.call(this, 2),
        child.call(this, 3)
      ]);
    });

    return parent.call(this).then(function (results) {
      assert.deepEqual(results, [1, 2, 3]);
    });
  });

  it("should be able to reuse Fiber.current", function () {
    var self = this;

    var parent = Promise.async(function () {
      var parentFiber = Fiber.current;
      assert.ok(parentFiber instanceof Fiber);

      var childFibers = [];
      var child = Promise.async(function (arg) {
        assert.strictEqual(this, self);

        var childFiber = Fiber.current;
        assert.ok(childFiber instanceof Fiber);
        assert.strictEqual(childFiber, parentFiber);

        childFibers.forEach(function (otherChildFiber) {
          assert.strictEqual(childFiber, otherChildFiber);
        });
        childFibers.push(childFiber);

        return Promise.await(arg);
      }, true);

      return Promise.all([
        child.call(this, 1),
        child.call(this, 2),
        child.call(this, 3)
      ]);
    });

    return parent.call(this).then(function (results) {
      assert.deepEqual(results, [1, 2, 3]);
    });
  });
});

describe("Promise.then callbacks", function () {
  it("should always run in a fiber", Promise.async(function () {
    var parentFiber = Fiber.current;
    assert.ok(parentFiber instanceof Fiber);

    var dynamics = { user: "ben" };
    parentFiber._meteorDynamics = dynamics;

    function checkCallbackFiber() {
      assert.ok(Fiber.current instanceof Fiber);
      assert.deepEqual(Fiber.current._meteorDynamics, dynamics);
    }

    return Promise.resolve("result").then(function (result) {
      assert.strictEqual(result, "result");
      checkCallbackFiber();
      throw new Error("friendly exception");
    }).catch(function (error) {
      assert.strictEqual(error.message, "friendly exception");
      checkCallbackFiber();
    });
  }));
});

describe("FiberPool", function () {
  it("should still work when the target size is 1 or 0", function () {
    var fiberPool = require("../fiber_pool.js").makePool();

    return fiberPool.setTargetFiberCount(1).run({
      callback: function () {
        assert.ok(Fiber.current instanceof Fiber);
        return Fiber.current;
      }
    }, Promise).then(function (firstFiber) {
      return fiberPool.run({
        callback: function () {
          assert.ok(Fiber.current instanceof Fiber);
          assert.strictEqual(Fiber.current, firstFiber);
          fiberPool.drain();
          return Fiber.current;
        }
      }, Promise);
    }).then(function (secondFiber) {
      return fiberPool.run({
        callback: function () {
          assert.ok(Fiber.current instanceof Fiber);
          assert.notStrictEqual(Fiber.current, secondFiber);
        }
      }, Promise);
    });
  });
});

describe("dynamic environment", function () {
  it("should be restored to cloned values", Promise.async(function () {
    var fiber = Fiber.current;
    assert.ok(fiber instanceof Fiber);

    var asdf = fiber._asdf = [1, /* hole */, 3];
    var expected = new Error("expected");
    var promise = Promise.resolve(asdf).then(function (asdf) {
      var fiber = Fiber.current;
      assert.notStrictEqual(asdf, fiber._asdf);
      assert.deepEqual(asdf, fiber._asdf);
      fiber._asdf.push(4);
      throw expected;
    }).catch(function (error) {
      assert.strictEqual(error, expected);
      var fiber = Fiber.current;
      assert.notStrictEqual(asdf, fiber._asdf);
      assert.deepEqual(asdf, fiber._asdf);
      assert.strictEqual(asdf.length, 3);
    });

    // Own properties should have been cloned when .then and .catch were
    // called, so deleting this property here should have no impact on the
    // behavior of the callbacks.
    delete fiber._asdf;

    return promise;
  }));
});

describe("uncaught exceptions", function () {
  it("should be emitted via process.domain", function (done) {
    var domain = require("domain").create();
    var expected = new Error("expected");
    var fiber = new Fiber(function () {
      Promise.await("asdf");
      throw expected;
    });

    function onError(error) {
      assert.strictEqual(error, expected);
      done();
    }

    domain.on("error", onError);

    domain.run(function () {
      fiber.run();
    });
  });
});

describe("promise_client.js", function () {
  it("should use Meteor.bindEnvironment", function () {
    var savedMeteor = global.Meteor;
    var calledBindEnvironment = false;
    var calledBoundFunction = false;

    global.Meteor = {
      bindEnvironment: function (handler) {
        calledBindEnvironment = true;
        return function () {
          calledBoundFunction = true;
          return handler.apply(this, arguments);
        };
      }
    };

    var Promise = require("promise");
    require("../promise_client.js").makeCompatible(Promise);

    var p = Promise.resolve(1234).then(function (value) {
      assert.strictEqual(value, 1234);
      assert.strictEqual(calledBindEnvironment, true);
      assert.strictEqual(calledBoundFunction, true);
      global.Meteor = savedMeteor;
    });

    assert.strictEqual(calledBindEnvironment, true);
    assert.strictEqual(calledBoundFunction, false);

    return p;
  });
});
