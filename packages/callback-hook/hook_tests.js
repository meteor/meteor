Tinytest.add("callback-hook - binds to registrar's env by default", function (test) {
  const hook = new Hook();
  const envVar = new Meteor.EnvironmentVariable();
  envVar.withValue("registrar's value", function () {
    hook.register(function () {
      test.equal(envVar.get(), "registrar's value");
    });
  });
  envVar.withValue("invoker's value", function () {
    hook.forEach(function (callback) {
      callback();
    });
  });
});

Tinytest.add("callback-hook - uses invoker's env with {bindEnvironment: false}", function (test) {
  const hook = new Hook({ bindEnvironment: false });
  const envVar = new Meteor.EnvironmentVariable();
  envVar.withValue("registrar's value", function () {
    hook.register(function () {
      test.equal(envVar.get(), "invoker's value");
    });
  });
  envVar.withValue("invoker's value", function () {
    hook.each(function (callback) {
      callback();
    });
  });
});

Tinytest.add("callback-hook - exceptions unhandled with {bindEnvironment: false}", function (test) {
  const hook = new Hook({ bindEnvironment: false });
  hook.register(function () {
    throw new Error("Test error");
  });
  hook.forEach(function (callback) {
    test.throws(callback, "Test error");
  });
});

Tinytest.add(
  "callback-hook - exceptionHandler used with {bindEnvironment: false}",
  function (test) {
    const exToThrow = new Error("Test error");
    let thrownEx = null;
    const hook = new Hook({
      bindEnvironment: false,
      exceptionHandler: function (ex) {
        thrownEx = ex;
      },
    });
    hook.register(function () {
      throw exToThrow;
    });
    hook.each(function (callback) {
      callback();
    });
    test.equal(exToThrow, thrownEx);
  },
);

Tinytest.add("callback-hook - register returns object with stop", function (test) {
  const hook = new Hook({ bindEnvironment: false });
  const handle = hook.register(function () {});
  test.isTrue(typeof handle === "object" && handle !== null);
  test.equal(typeof handle.stop, "function");
  test.equal(typeof handle.callback, "function");
});

Tinytest.add("callback-hook - stop unregisters the callback", function (test) {
  const hook = new Hook({ bindEnvironment: false });
  const calls = [];
  const h1 = hook.register(function () {
    calls.push("a");
  });
  hook.register(function () {
    calls.push("b");
  });
  h1.stop();

  hook.forEach(function (callback) {
    callback();
    return true;
  });
  test.equal(calls, ["b"]);
});

Tinytest.add("callback-hook - forEach iterates callbacks in registration order", (test) => {
  const hook = new Hook({ bindEnvironment: false });
  const order = [];
  hook.register(function () {
    order.push(1);
  });
  hook.register(function () {
    order.push(2);
  });
  hook.register(function () {
    order.push(3);
  });

  hook.forEach(function (callback) {
    callback();
    return true;
  });
  test.equal(order, [1, 2, 3]);
});

Tinytest.add("callback-hook - forEach stops when iterator returns falsy", (test) => {
  const hook = new Hook({ bindEnvironment: false });
  const order = [];
  hook.register(function () {
    order.push(1);
  });
  hook.register(function () {
    order.push(2);
  });
  hook.register(function () {
    order.push(3);
  });

  let seen = 0;
  hook.forEach(function (callback) {
    callback();
    seen++;
    return seen < 2; // stop after the second
  });
  test.equal(order, [1, 2]);
});

Tinytest.add("callback-hook - callback can safely stop itself during iteration", (test) => {
  const hook = new Hook({ bindEnvironment: false });
  const calls = [];
  const holder = {};
  hook.register(function () {
    calls.push("a");
  });
  holder.h2 = hook.register(function () {
    calls.push("b");
    holder.h2.stop();
  });
  hook.register(function () {
    calls.push("c");
  });

  hook.forEach(function (callback) {
    callback();
    return true;
  });
  test.equal(calls, ["a", "b", "c"]);

  // A second pass confirms h2 is really gone.
  calls.length = 0;
  hook.forEach(function (callback) {
    callback();
    return true;
  });
  test.equal(calls, ["a", "c"]);
});

Tinytest.add("callback-hook - clear removes all callbacks", (test) => {
  const hook = new Hook({ bindEnvironment: false });
  hook.register(function () {});
  hook.register(function () {});
  let seen = 0;
  hook.forEach(function () {
    seen++;
    return true;
  });
  test.equal(seen, 2);

  hook.clear();
  seen = 0;
  hook.forEach(function () {
    seen++;
    return true;
  });
  test.equal(seen, 0);
});

Tinytest.addAsync(
  "callback-hook - forEachAsync iterates and honors falsy return",
  async function (test) {
    const hook = new Hook({ bindEnvironment: false });
    const order = [];
    hook.register(function () {
      order.push(1);
    });
    hook.register(function () {
      order.push(2);
    });
    hook.register(function () {
      order.push(3);
    });

    await hook.forEachAsync(async function (callback) {
      callback();
      return order.length < 2; // stop after the second
    });
    test.equal(order, [1, 2]);
  },
);

// forEachAsync used to iterate the live Set, so a callback that registered
// another saw it run in the same pass -- while forEach, which snapshots first,
// deferred it to the next one. Both APIs now share that boundary.
Tinytest.addAsync(
  "callback-hook - forEachAsync defers callbacks registered during a pass",
  async function (test) {
    const runPasses = async (hook, order, useAsync) => {
      const passes = [];
      for (let pass = 0; pass < 2; pass++) {
        order.length = 0;
        if (useAsync) {
          await hook.forEachAsync(async function (callback) {
            await callback();
            return true;
          });
        } else {
          hook.forEach(function (callback) {
            callback();
            return true;
          });
        }
        passes.push(order.slice());
      }
      return passes;
    };

    const build = () => {
      const hook = new Hook({ bindEnvironment: false, wrapAsync: false });
      const order = [];
      let added = false;
      hook.register(function () {
        order.push("first");
        if (!added) {
          added = true;
          hook.register(function () {
            order.push("late");
          });
        }
      });
      return { hook, order };
    };

    const sync = build();
    const asyncHook = build();
    const syncPasses = await runPasses(sync.hook, sync.order, false);
    const asyncPasses = await runPasses(asyncHook.hook, asyncHook.order, true);

    // The new callback belongs to the second pass, not the one that added it.
    test.equal(syncPasses, [["first"], ["first", "late"]]);
    test.equal(asyncPasses, [["first"], ["first", "late"]]);
    test.equal(asyncPasses, syncPasses, "both APIs agree across two passes");
  },
);

// The other half of the boundary: a callback removed before its turn is
// skipped, and a callback can still remove itself.
Tinytest.addAsync(
  "callback-hook - forEachAsync skips callbacks removed during a pass",
  async function (test) {
    const hook = new Hook({ bindEnvironment: false, wrapAsync: false });
    const order = [];
    let handleB;
    hook.register(function () {
      order.push("a");
      handleB.stop();
    });
    handleB = hook.register(function () {
      order.push("b");
    });
    hook.register(function () {
      order.push("c");
    });

    await hook.forEachAsync(async function (callback) {
      await callback();
      return true;
    });
    test.equal(order, ["a", "c"], "b was removed before its turn");

    const selfHook = new Hook({ bindEnvironment: false, wrapAsync: false });
    const selfOrder = [];
    let self;
    self = selfHook.register(function () {
      selfOrder.push("self");
      self.stop();
    });
    selfHook.register(function () {
      selfOrder.push("next");
    });

    await selfHook.forEachAsync(async function (callback) {
      await callback();
      return true;
    });
    test.equal(selfOrder, ["self", "next"], "self-removal does not disturb iteration");
  },
);

// Snapshotting must not turn sequential awaits into parallel execution.
Tinytest.addAsync(
  "callback-hook - forEachAsync still awaits each callback in order",
  async function (test) {
    const hook = new Hook({ bindEnvironment: false, wrapAsync: false });
    const order = [];
    const delayed = (name, ms) =>
      function () {
        return new Promise(function (resolve) {
          setTimeout(function () {
            order.push(name);
            resolve();
          }, ms);
        });
      };
    hook.register(delayed("slow", 20));
    hook.register(delayed("fast", 1));

    await hook.forEachAsync(async function (callback) {
      await callback();
      return true;
    });
    test.equal(order, ["slow", "fast"]);
  },
);

Tinytest.add("callback-hook - debugPrintExceptions must be a string", function (test) {
  test.throws(function () {
    new Hook({ debugPrintExceptions: true });
  }, /debugPrintExceptions should be a string/);
});

Tinytest.add(
  "callback-hook - debugPrintExceptions swallows errors with {bindEnvironment: false}",
  function (test) {
    const originalDebug = Meteor._debug;
    const logged = [];
    Meteor._debug = function (...args) {
      logged.push(args);
    };
    try {
      const hook = new Hook({
        bindEnvironment: false,
        debugPrintExceptions: "test-hook",
      });
      hook.register(function () {
        throw new Error("boom");
      });
      // Should not throw — dontBindEnvironment wraps it and logs via Meteor._debug.
      hook.forEach(function (callback) {
        callback();
        return true;
      });
    } finally {
      Meteor._debug = originalDebug;
    }
    test.equal(logged.length, 1);
    // First arg is the description, second is the error.
    test.matches(logged[0][0], /test-hook/);
    test.instanceOf(logged[0][1], Error);
  },
);

Tinytest.add("callback-hook - each is an alias for forEach", function (test) {
  const hook = new Hook({ bindEnvironment: false });
  const order = [];
  hook.register(function () {
    order.push("a");
  });
  hook.register(function () {
    order.push("b");
  });
  hook.each(function (callback) {
    callback();
    return true;
  });
  test.equal(order, ["a", "b"]);
});
