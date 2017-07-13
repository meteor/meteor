var assert = require("assert");
var Fiber = require("fibers");
var Future = require("fibers/future");
var Promise = process.env.USE_GLOBAL_PROMISE
  ? global.Promise
  : require("promise/lib/es6-extensions");

if (! Promise) {
  process.exit(0);
}

require("../promise_server.js").makeCompatible(Promise, Fiber);

function wait(ms) {
  var self = this;
  var args = Array.prototype.slice.call(arguments, 1);

  return new Promise(function (resolve) {
    setTimeout(function () {
      resolve.apply(self, args);
    }, ms);
  });
}

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

  it("should not hang when inner promise returned from callback", Promise.async(function () {
    function go(n) {
      return n === 0
        ? Promise.resolve("done")
        : wait(0, n - 1).then(go);
    }

    var results = Promise.all([
      wait(50, "a").then(function (a) {
        return wait(100, a + "b").then(function (ab) {
          return wait(2, ab + "c");
        });
      }),
      go(10),
      go(20)
    ]).await();

    assert.deepEqual(results, [
      "abc",
      "done",
      "done"
    ]);
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

  it("should not double-wrap callbacks", Promise.async(function () {
    // Consume all fibers currently in the pool, so that we can detect how many
    // new fibers are created after that point.
    var done = new Future();
    var origCount = Fiber.fibersCreated;

    while (Fiber.fibersCreated == origCount) {
      // Force creation of a new fiber that blocks until we're done.
      var ready = new Future();
      Promise.asyncApply(function () {
        ready.return();
        done.wait();
      });
      ready.wait();  // Make sure fiber is running before we continue.
    }

    // OK, we're now in a situation where a Promise.then() should create
    // *one* new fiber.
    var baseCount = Fiber.fibersCreated;

    // Create some named no-op promises and callbacks. I'm assigning names
    // to these so that the comments below are easier to read.
    var promise1 = Promise.resolve();
    var promise2 = Promise.resolve();
    var returnPromise2 = function () { return promise2; };
    var cb = function () {};

    // Make sure this didn't create any fibers.
    assert.strictEqual(baseCount, Fiber.fibersCreated);

    // This should create one fiber, and return it to the pool.
    // Note that you can remove these two lines and the test still works and
    // tests the right thing. This is just checking my assumptions.
    promise1.then(returnPromise2).await();
    assert.strictEqual(baseCount + 1, Fiber.fibersCreated);

    // This should NOT create a another fiber. It should reuse the fiber
    // created by the above block. However, if callback double-wrapping
    // is not prevented, then cb will end up being wrapped *twice*, and
    // thus *two* fibers will be created at the same time.
    //
    // What happens is:
    // * .then(cb) wraps cb (let's call the wrapped version wcb) and passes
    //   it on to the Promise implementation.
    // * On next tick, promise1 "completes", so returnPromise2() is called.
    // * Since it returns a promise (promise2), the Promise implementation
    //   calls promise2.then(wcb) -- forwarding the callback on to the next
    //   promise in the chain.
    // * Our monkey-patched .then() is used here. If we don't detect that
    //   the callback is already wrapped, we'll end up wrapping it again!
    var promise3 = promise1.then(returnPromise2);
    promise3.then(cb).await();

    // If we double-wrapped the callback, then fibersCreated will end up
    // being baseCount + 2 instead of baseCount + 1.
    assert.strictEqual(baseCount + 1, Fiber.fibersCreated);

    done.return();
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

  it("should ignore bogus fiber.run arguments", function () {
    var fiberPool = require("../fiber_pool.js").makePool();
    var fiber;

    return fiberPool.setTargetFiberCount(1).run({
      callback() {
        fiber = Fiber.current;
      }
    }, Promise).then(() => {
      assert.ok(Fiber.current instanceof Fiber);
      assert.notStrictEqual(Fiber.current, fiber);
      fiber.run("bogus");
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
    var desc = Object.getOwnPropertyDescriptor(Promise.prototype, "then");
    desc.writable = true;
    Object.defineProperty(Promise.prototype, "then", desc);
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

describe("stack traces", function () {
  it("should reflect awaiting context(s) as well", Promise.async(function test() {
    function inner() {
      throw new Error("oyez");
    }

    var middle = Promise.async(function middle() {
      return Promise.await(new Promise(inner));
    });

    var outer = Promise.async(function outer() {
      return Promise.await(middle());
    });

    return outer().catch(function (error) {
      assert.strictEqual(error.message, "oyez");

      var sections = error.stack.split("=> awaited here:");
      assert.strictEqual(sections.length, 3);

      assert.notStrictEqual(sections[0].indexOf("at inner"), -1);
      assert.notStrictEqual(sections[1].indexOf("at middle"), -1);
      assert.notStrictEqual(sections[2].indexOf("at outer"), -1);
    });
  }));
});
