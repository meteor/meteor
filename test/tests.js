var assert = require("assert");
var Fiber = require("fibers");
var Promise = require("../promise_server.js");

describe("Promise.await", function () {
  it("should work inside an existing Fiber", function () {
    assert.strictEqual(Promise.await(42), 42);
    assert.strictEqual(Promise.await(Promise.resolve("asdf")), "asdf");

    var obj = {};
    assert.strictEqual(Promise.resolve(obj).await(), obj);
  }.async());
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

    parentFiber._meteorDynamics = { user: "ben" };

    function checkCallbackFiber() {
      assert.ok(Fiber.current instanceof Fiber);
      assert.notStrictEqual(Fiber.current, parentFiber);
      assert.deepEqual(
        Fiber.current._meteorDynamics,
        parentFiber._meteorDynamics
      );
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
