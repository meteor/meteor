// This depends on tinytest, so it's a little weird to put it in
// test-helpers, but it'll do for now.

// Provides the testAsyncMulti helper, which creates an async test
// (using Tinytest.addAsync) that tracks parallel and sequential
// asynchronous calls.  Specifically, the two features it provides
// are:
// 1) Executing an array of functions sequentially when those functions
//    contain async calls.
// 2) Keeping track of when callbacks are outstanding, via "expect".
//
// To use, pass an array of functions that take arguments (test, expect).
// (There is no onComplete callback; completion is determined automatically.)
// Expect takes a callback closure and wraps it, returning a new callback closure,
// and making a note that there is a callback oustanding.  Pass this returned closure
// to async functions as the callback, and the machinery in the wrapper will
// record the fact that the callback has been called.
//
// A second form of expect takes data arguments to test for.
// Essentially, expect("foo", "bar") is equivalent to:
// expect(function(arg1, arg2) { test.equal([arg1, arg2], ["foo", "bar"]); }).
//
// You cannot "nest" expect or call it from a callback!  Even if you have a chain
// of callbacks, you need to call expect at the "top level" (synchronously)
// but the callback you wrap has to be the last/innermost one.  This sometimes
// leads to some code contortions and should probably be fixed.

// Example: (at top level of test file)
//
// testAsyncMulti("test name", [
//   function(test, expect) {
//     ... tests here
//     Meteor.defer(expect(function() {
//       ... tests here
//     }));
//
//     call_something_async('foo', 'bar', expect('baz')); // implicit callback
//
//   },
//   function(test, expect) {
//     ... more tests
//   }
// ]);

var ExpectationManager = function (test, onComplete) {
  var self = this;

  self.test = test;
  self.onComplete = onComplete;
  self.closed = false;
  self.dead = false;
  self.outstanding = 0;
};

Object.assign(ExpectationManager.prototype, {
  expect: function (/* arguments */) {
    var self = this;

    if (typeof arguments[0] === "function")
      var expected = arguments[0];
    else
      var expected = Array.from(arguments);

    if (self.closed)
      throw new Error("Too late to add more expectations to the test");
    self.outstanding++;

    return async function (/* arguments */) {
      if (self.dead)
        return;

      if (typeof expected === "function") {
        try {
          await expected.apply({}, arguments);
        } catch (e) {
          if (self.cancel())
            self.test.exception(e);
        }
      } else {
        self.test.equal(Array.from(arguments), expected);
      }

      self.outstanding--;
      self._check_complete();
    };
  },

  done: function () {
    var self = this;
    self.closed = true;
    self._check_complete();
  },

  cancel: function () {
    var self = this;
    if (! self.dead) {
      self.dead = true;
      return true;
    }
    return false;
  },

  _check_complete: function () {
    var self = this;
    if (!self.outstanding && self.closed && !self.dead) {
      self.dead = true;
      self.onComplete();
    }
  }
});

testAsyncMulti = function (name, funcs, { isOnly = false } = {}) {
  // XXX Tests on remote browsers are _slow_. We need a better solution.
  var timeout = 180000;

  const addFunction = isOnly ? Tinytest.onlyAsync : Tinytest.addAsync;
  addFunction(name, function (test, onComplete) {
    var remaining = [...funcs]
    var context = {};
    var i = 0;

    var runNext = function () {
      var func = remaining.shift();
      if (!func) {
        delete test.extraDetails.asyncBlock;
        onComplete();
      }
      else {
        var em = new ExpectationManager(test, function () {
          clearTimeout(timer);
          runNext();
        });

        var timer = setTimeout(function () {
          if (em.cancel()) {
            test.fail({type: "timeout", message: "Async batch timed out"});
            onComplete();
          }
          return;
        }, timeout);

        test.extraDetails.asyncBlock = i++;

        new Promise(resolve => {
          const result = func.apply(context, [test, em.expect.bind(em)]);
          if (result && typeof result.then === "function") {
            return result.then((r) => resolve(r))
          }

          return resolve(result);
        }).then(() => {
          em.done();
        }, exception => {
          if (em.cancel()) {
            test.exception(exception);
            // Because we called test.exception, we're not to call onComplete.
          }
          clearTimeout(timer);
        });
      }
    };

    runNext();
  });
};

// Call `fn` periodically until it returns true.  If it does, call
// `success`.  If it doesn't before the timeout, call `failed`.
simplePoll = function (fn, success, failed, timeout, step) {
  timeout = timeout || 10000;
  step = step || 100;
  var start = (new Date()).valueOf();
  let timeOutId;
  var helper = function () {
    if (fn()) {
      success();
      Meteor.clearTimeout(timeOutId);
      return;
    }
    if (start + timeout < (new Date()).valueOf()) {
      failed();
      Meteor.clearTimeout(timeOutId);
      return;
    }
    timeOutId = Meteor.setTimeout(helper, step);
  };
  helper();
};

pollUntil = function (expect, f, timeout, step, noFail) {
  noFail = noFail || false;
  step = step || 100;
  var expectation = expect(true);
  simplePoll(
    f,
    function () { expectation(true) },
    function () { expectation(noFail) },
    timeout,
    step
  );
};

/**
 * Helper that is used on the async tests.
 * Just run the function and assert if we have an error or not.
 * @param fn
 * @param test
 * @param shouldErrorOut
 * @returns {Promise<*>}
 */
runAndThrowIfNeeded = async (fn, test, shouldErrorOut) => {
  let err, result;
  try {
    result = await fn();
  } catch (e) {
    err = e;
  }

  test[shouldErrorOut ? "isTrue" : "isFalse"](err);

  return result;
};
