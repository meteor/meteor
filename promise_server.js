var assert = require("assert");
var fiberPool = require("./fiber_pool.js").makePool();

exports.makeCompatible = function (Promise, Fiber) {
  var es6PromiseThen = Promise.prototype.then;

  if (typeof Fiber === "function") {
    Promise.Fiber = Fiber;
  }

  if (es6PromiseThen.name === "meteorPromiseThen") {
    return; // Already compatible.
  }

  function meteorPromiseThen(onResolved, onRejected) {
    var Promise = this.constructor;
    var Fiber = Promise.Fiber;

    if (typeof Fiber === "function" &&
        ! this._meteorPromiseAlreadyWrapped) {
      onResolved = wrapCallback(onResolved, Promise);
      onRejected = wrapCallback(onRejected, Promise);

      // Just in case we're wrapping a .then method defined by an older
      // version of this library, make absolutely sure it doesn't attempt
      // to rewrap the callbacks, and instead calls its own original
      // es6PromiseThen function.
      Promise.Fiber = null;
      try {
        return es6PromiseThen.call(this, onResolved, onRejected);
      } finally {
        Promise.Fiber = Fiber;
      }
    }

    return es6PromiseThen.call(this, onResolved, onRejected);
  }

  // Replace Promise.prototype.then with a wrapper that ensures the
  // onResolved and onRejected callbacks always run in a Fiber.
  Object.defineProperty(Promise.prototype, "then", {
    value: meteorPromiseThen,
    enumerable: true,
    // Don't let older versions of the meteor-promise library overwrite
    // this version of Promise.prototype.then...
    writable: false,
    // ... unless they also call Object.defineProperty.
    configurable: true
  });

  Promise.awaitAll = function (args) {
    return awaitPromise(this.all(args));
  };

  Promise.await = function (arg) {
    return awaitPromise(this.resolve(arg));
  };

  Promise.prototype.await = function () {
    return awaitPromise(this);
  };

  // Yield the current Fiber until the given Promise has been fulfilled.
  function awaitPromise(promise) {
    var Promise = promise.constructor;
    var Fiber = Promise.Fiber;

    assert.strictEqual(
      typeof Fiber, "function",
      "Cannot await unless Promise.Fiber is defined"
    );

    var fiber = Fiber.current;

    assert.ok(
      fiber instanceof Fiber,
      "Cannot await without a Fiber"
    );

    var run = fiber.run;
    var throwInto = fiber.throwInto;

    if (process.domain) {
      run = process.domain.bind(run);
      throwInto = process.domain.bind(throwInto);
    }

    // The overridden es6PromiseThen function is adequate here because these
    // two callbacks do not need to run in a Fiber.
    es6PromiseThen.call(promise, function (result) {
      tryCatchNextTick(fiber, run, [result]);
    }, function (error) {
      tryCatchNextTick(fiber, throwInto, [error]);
    });

    return stackSafeYield(Fiber, awaitPromise);
  }

  function stackSafeYield(Fiber, caller) {
    try {
      return Fiber.yield();
    } catch (thrown) {
      if (thrown) {
        var e = new Error;
        Error.captureStackTrace(e, caller);
        thrown.stack += e.stack.replace(/^.*?\n/, "\n => awaited here:\n");
      }
      throw thrown;
    }
  }

  // Return a wrapper function that returns a Promise for the eventual
  // result of the original function.
  Promise.async = function (fn, allowReuseOfCurrentFiber) {
    var Promise = this;
    return function () {
      return Promise.asyncApply(
        fn, this, arguments,
        allowReuseOfCurrentFiber
      );
    };
  };

  Promise.asyncApply = function (
    fn, context, args, allowReuseOfCurrentFiber
  ) {
    var Promise = this;
    var Fiber = Promise.Fiber;
    var fiber = Fiber && Fiber.current;

    if (fiber && allowReuseOfCurrentFiber) {
      return this.resolve(fn.apply(context, args));
    }

    return fiberPool.run({
      callback: fn,
      context: context,
      args: args,
      dynamics: cloneFiberOwnProperties(fiber)
    }, Promise);
  };
};

function wrapCallback(callback, Promise) {
  if (! callback) {
    return callback;
  }

  // Don't wrap callbacks that are flagged as not wanting to be called in a
  // fiber.
  if (callback._meteorPromiseAlreadyWrapped) {
    return callback;
  }

  var dynamics = cloneFiberOwnProperties(Promise.Fiber.current);
  var result = function (arg) {
    var promise = fiberPool.run({
      callback: callback,
      args: [arg], // Avoid dealing with arguments objects.
      dynamics: dynamics
    }, Promise);

    // Avoid wrapping the native resolver functions that will be attached
    // to this promise per https://github.com/meteor/promise/issues/18.
    promise._meteorPromiseAlreadyWrapped = true;

    return promise;
  };

  // Flag this callback as not wanting to be called in a fiber because it is
  // already creating a fiber.
  result._meteorPromiseAlreadyWrapped = true;

  return result;
}

function cloneFiberOwnProperties(fiber) {
  if (fiber) {
    var dynamics = {};

    Object.keys(fiber).forEach(function (key) {
      dynamics[key] = shallowClone(fiber[key]);
    });

    return dynamics;
  }
}

function shallowClone(value) {
  if (Array.isArray(value)) {
    return value.slice(0);
  }

  if (value && typeof value === "object") {
    var copy = Object.create(Object.getPrototypeOf(value));
    var keys = Object.keys(value);
    var keyCount = keys.length;

    for (var i = 0; i < keyCount; ++i) {
      var key = keys[i];
      copy[key] = value[key];
    }

    return copy;
  }

  return value;
}

// Invoke method with args against object in a try-catch block,
// re-throwing any exceptions in the next tick of the event loop, so that
// they won't get captured/swallowed by the caller.
function tryCatchNextTick(object, method, args) {
  try {
    return method.apply(object, args);
  } catch (error) {
    process.nextTick(function () {
      throw error;
    });
  }
}
