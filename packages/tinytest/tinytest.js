var Future;
if (Meteor.isServer)
  Future = Npm.require('fibers/future');

/******************************************************************************/
/* TestCaseResults                                                            */
/******************************************************************************/

TestCaseResults = function (test_case, onEvent, onException, stop_at_offset) {
  var self = this;
  self.test_case = test_case;
  self.onEvent = onEvent;
  self.expecting_failure = false;
  self.current_fail_count = 0;
  self.stop_at_offset = stop_at_offset;
  self.onException = onException;
  self.id = Random.id();
  self.extraDetails = {};
};

_.extend(TestCaseResults.prototype, {
  ok: function (doc) {
    var self = this;
    var ok = {type: "ok"};
    if (doc)
      ok.details = doc;
    if (self.expecting_failure) {
      ok.details = ok.details || {};
      ok.details["was_expecting_failure"] = true;
      self.expecting_failure = false;
    }
    self.onEvent(ok);
  },

  expect_fail: function () {
    var self = this;
    self.expecting_failure = true;
  },

  fail: function (doc) {
    var self = this;

    if (typeof doc === "string") {
      // Some very old code still tries to call fail() with a
      // string. Don't do this!
      doc = { type: "fail", message: doc };
    }

    doc = _.extend({}, doc, self.extraDetails);

    if (self.stop_at_offset === 0) {
      if (Meteor.isClient) {
        // Only supported on the browser for now..
        var now = (+new Date);
        debugger;
        if ((+new Date) - now < 100)
          alert("To use this feature, first enable your browser's debugger.");
      }
      self.stop_at_offset = null;
    }
    if (self.stop_at_offset)
      self.stop_at_offset--;

    // Get filename and line number of failure if we're using v8 (Chrome or
    // Node).
    if (Error.captureStackTrace) {
      var savedPrepareStackTrace = Error.prepareStackTrace;
      Error.prepareStackTrace = function(_, stack){ return stack; };
      var err = new Error;
      Error.captureStackTrace(err);
      var stack = err.stack;
      Error.prepareStackTrace = savedPrepareStackTrace;
      for (var i = stack.length - 1; i >= 0; --i) {
        var frame = stack[i];
        // Heuristic: use the OUTERMOST line which is in a :tests.js
        // file (this is less likely to be a test helper function).
        if (frame.getFileName().match(/:tests\.js/)) {
          doc.filename = frame.getFileName();
          doc.line = frame.getLineNumber();
          break;
        }
      }
    }

    self.onEvent({
        type: (self.expecting_failure ? "expected_fail" : "fail"),
        details: doc,
        cookie: {name: self.test_case.name, offset: self.current_fail_count,
                 groupPath: self.test_case.groupPath,
                 shortName: self.test_case.shortName}
    });
    self.expecting_failure = false;
    self.current_fail_count++;
  },

  // Call this to fail the test with an exception. Use this to record
  // exceptions that occur inside asynchronous callbacks in tests.
  //
  // It should only be used with asynchronous tests, and if you call
  // this function, you should make sure that (1) the test doesn't
  // call its callback (onComplete function); (2) the test function
  // doesn't directly raise an exception.
  exception: function (exception) {
    this.onException(exception);
  },

  // returns a unique ID for this test run, for convenience use by
  // your tests
  runId: function () {
    return this.id;
  },

  // === Following patterned after http://vowsjs.org/#reference ===

  // XXX eliminate 'message' and 'not' arguments
  equal: function (actual, expected, message, not) {

    if ((! not) && (typeof actual === 'string') &&
        (typeof expected === 'string')) {
      this._stringEqual(actual, expected, message);
      return;
    }

    /* If expected is a DOM node, do a literal '===' comparison with
     * actual. Otherwise do a deep comparison, as implemented by _.isEqual.
     */

    var matched;
    // XXX remove cruft specific to liverange
    if (typeof expected === "object" && expected && expected.nodeType) {
      matched = expected === actual;
      expected = "[Node]";
      actual = "[Unknown]";
    } else if (typeof Uint8Array !== 'undefined' && expected instanceof Uint8Array) {
      // I have no idea why but _.isEqual on Chrome horks completely on Uint8Arrays.
      // and the symptom is the chrome renderer taking up an entire CPU and freezing
      // your web page, but not pausing anywhere in _.isEqual.  I don't understand it
      // but we fall back to a manual comparison
      if (!(actual instanceof Uint8Array))
        this.fail({type: "assert_equal", message: "found object is not a typed array",
                   expected: "A typed array", actual: actual.constructor.toString()});
      if (expected.length !== actual.length)
        this.fail({type: "assert_equal", message: "lengths of typed arrays do not match",
                   expected: expected.length, actual: actual.length});
      for (var i = 0; i < expected.length; i++) {
        this.equal(actual[i], expected[i]);
      }
    } else {
      matched = EJSON.equals(expected, actual);
    }

    if (matched === !!not) {
      this.fail({type: "assert_equal", message: message,
                 expected: JSON.stringify(expected), actual: JSON.stringify(actual), not: !!not});
    } else
      this.ok();
  },

  notEqual: function (actual, expected, message) {
    this.equal(actual, expected, message, true);
  },

  instanceOf: function (obj, klass, message) {
    if (obj instanceof klass)
      this.ok();
    else
      this.fail({type: "instanceOf", message: message, not: false}); // XXX what other data?
  },

  notInstanceOf: function (obj, klass, message) {
    if (obj instanceof klass)
      this.fail({type: "instanceOf", message: message, not: true}); // XXX what other data?
    else
      this.ok();
  },

  matches: function (actual, regexp, message) {
    if (regexp.test(actual))
      this.ok();
    else
      this.fail({type: "matches", message: message,
                 actual: actual, regexp: regexp.toString(), not: false});
  },

  notMatches: function (actual, regexp, message) {
    if (regexp.test(actual))
      this.fail({type: "matches", message: message,
                 actual: actual, regexp: regexp.toString(), not: true});
    else
      this.ok();
  },

  // expected can be:
  //  undefined: accept any exception.
  //  string: pass if the string is a substring of the exception message.
  //  regexp: pass if the exception message passes the regexp.
  //  function: call the function as a predicate with the exception.
  //
  // Note: Node's assert.throws also accepts a constructor to test
  // whether the error is of the expected class.  But since
  // JavaScript can't distinguish between constructors and plain
  // functions and Node's assert.throws also accepts a predicate
  // function, if the error fails the instanceof test with the
  // constructor then the constructor is then treated as a predicate
  // and called (!)
  //
  // The upshot is, if you want to test whether an error is of a
  // particular class, use a predicate function.
  //
  throws: function (f, expected) {
    var actual, predicate;

    if (expected === undefined)
      predicate = function (actual) {
        return true;
      };
    else if (_.isString(expected))
      predicate = function (actual) {
        return _.isString(actual.message) &&
               actual.message.indexOf(expected) !== -1;
      };
    else if (expected instanceof RegExp)
      predicate = function (actual) {
        return expected.test(actual.message);
      };
    else if (typeof expected === 'function')
      predicate = expected;
    else
      throw new Error('expected should be a string, regexp, or predicate function');

    try {
      f();
    } catch (exception) {
      actual = exception;
    }

    if (actual && predicate(actual))
      this.ok();
    else
      this.fail({
        type: "throws",
        message: actual ?
          "wrong error thrown: " + actual.message :
          "did not throw an error as expected"
      });
  },

  isTrue: function (v, msg) {
    if (v)
      this.ok();
    else
      this.fail({type: "true", message: msg, not: false});
  },

  isFalse: function (v, msg) {
    if (v)
      this.fail({type: "true", message: msg, not: true});
    else
      this.ok();
  },

  isNull: function (v, msg) {
    if (v === null)
      this.ok();
    else
      this.fail({type: "null", message: msg, not: false});
  },

  isNotNull: function (v, msg) {
    if (v === null)
      this.fail({type: "null", message: msg, not: true});
    else
      this.ok();
  },

  isUndefined: function (v, msg) {
    if (v === undefined)
      this.ok();
    else
      this.fail({type: "undefined", message: msg, not: false});
  },

  isNotUndefined: function (v, msg) {
    if (v === undefined)
      this.fail({type: "undefined", message: msg, not: true});
    else
      this.ok();
  },

  isNaN: function (v, msg) {
    if (isNaN(v))
      this.ok();
    else
      this.fail({type: "NaN", message: msg, not: false});
  },

  isNotNaN: function (v, msg) {
    if (isNaN(v))
      this.fail({type: "NaN", message: msg, not: true});
    else
      this.ok();
  },

  include: function (s, v, message, not) {
    var pass = false;
    if (s instanceof Array)
      pass = _.any(s, function(it) {return _.isEqual(v, it);});
    else if (typeof s === "object")
      pass = v in s;
    else if (typeof s === "string")
      if (s.indexOf(v) > -1) {
        pass = true;
      }
    else
      /* fail -- not something that contains other things */;
    if (pass === ! not)
      this.ok();
    else {
      this.fail({type: "include", message: message,
                 sequence: s, should_contain_value: v, not: !!not});
    }
  },

  notInclude: function (s, v, message) {
    this.include(s, v, message, true);
  },

  // XXX should change to lengthOf to match vowsjs
  length: function (obj, expected_length, msg) {
    if (obj.length === expected_length)
      this.ok();
    else
      this.fail({type: "length", expected: expected_length,
                 actual: obj.length, message: msg});
  },

  // EXPERIMENTAL way to compare two strings that results in
  // a nicer display in the test runner, e.g. for multiline
  // strings
  _stringEqual: function (actual, expected, message) {
    if (actual !== expected) {
      this.fail({type: "string_equal",
                 message: message,
                 expected: expected,
                 actual: actual});
    } else {
      this.ok();
    }
  }


});

/******************************************************************************/
/* TestCase                                                                   */
/******************************************************************************/

TestCase = function (name, func) {
  var self = this;
  self.name = name;
  self.func = func;

  var nameParts = _.map(name.split(" - "), function(s) {
    return s.replace(/^\s*|\s*$/g, ""); // trim
  });
  self.shortName = nameParts.pop();
  nameParts.unshift("tinytest");
  self.groupPath = nameParts;
};

_.extend(TestCase.prototype, {
  // Run the test asynchronously, delivering results via onEvent;
  // then call onComplete() on success, or else onException(e) if the
  // test raised (or voluntarily reported) an exception.
  run: function (onEvent, onComplete, onException, stop_at_offset) {
    var self = this;

    var completed = false;
    var markComplete = function () {
      if (completed) {
        Meteor._debug("*** Test error -- test '" + self.name +
                      "' returned multiple times.");
        return false;
      }
      completed = true;
      return true;
    };

    var wrappedOnEvent = function (e) {
      // If this trace prints, it means you ran some test.* function after the
      // test finished! Another symptom will be that the test will display as
      // "waiting" even when it counts as passed or failed.
      if (completed)
        console.trace("event after complete!");
      return onEvent(e);
    };

    var results = new TestCaseResults(self, wrappedOnEvent,
                                      function (e) {
                                        if (markComplete())
                                          onException(e);
                                      }, stop_at_offset);

    Meteor.defer(function () {
      try {
        self.func(results, function () {
          if (markComplete())
            onComplete();
        });
      } catch (e) {
        if (markComplete())
          onException(e);
      }
    });
  }
});

/******************************************************************************/
/* TestManager                                                                */
/******************************************************************************/

TestManager = function () {
  var self = this;
  self.tests = {};
  self.ordered_tests = [];
  self.testQueue = Meteor.isServer && new Meteor._SynchronousQueue();
};

if (Meteor.isServer && process.env.TINYTEST_FILTER) {
  __meteor_runtime_config__.tinytestFilter = process.env.TINYTEST_FILTER;
}

_.extend(TestManager.prototype, {
  addCase: function (test) {
    var self = this;
    if (test.name in self.tests)
      throw new Error(
        "Every test needs a unique name, but there are two tests named '" +
          test.name + "'");
    if (__meteor_runtime_config__.tinytestFilter &&
        test.name.indexOf(__meteor_runtime_config__.tinytestFilter) === -1) {
      return;
    }
    self.tests[test.name] = test;
    self.ordered_tests.push(test);
  },

  createRun: function (onReport, pathPrefix) {
    var self = this;
    return new TestRun(self, onReport, pathPrefix);
  }
});

// singleton
TestManager = new TestManager;

/******************************************************************************/
/* TestRun                                                                    */
/******************************************************************************/

TestRun = function (manager, onReport, pathPrefix) {
  var self = this;
  self.manager = manager;
  self.onReport = onReport;
  self.next_sequence_number = 0;
  self._pathPrefix = pathPrefix || [];
  _.each(self.manager.ordered_tests, function (test) {
    if (self._prefixMatch(test.groupPath))
      self._report(test);
  });
};

_.extend(TestRun.prototype, {

  _prefixMatch: function (testPath) {
    var self = this;
    for (var i = 0; i < self._pathPrefix.length; i++) {
      if (!testPath[i] || self._pathPrefix[i] !== testPath[i]) {
        return false;
      }
    }
    return true;
  },

  _runTest: function (test, onComplete, stop_at_offset) {
    var self = this;

    var startTime = (+new Date);

    test.run(function (event) {
      /* onEvent */
      // Ignore result callbacks if the test has already been reported
      // as timed out.
      if (test.timedOut)
        return;
      self._report(test, event);
    }, function () {
      /* onComplete */
      if (test.timedOut)
        return;
      var totalTime = (+new Date) - startTime;
      self._report(test, {type: "finish", timeMs: totalTime});
      onComplete();
    }, function (exception) {
      /* onException */
      if (test.timedOut)
        return;

      // XXX you want the "name" and "message" fields on the
      // exception, to start with..
      self._report(test, {
        type: "exception",
        details: {
          message: exception.message, // XXX empty???
          stack: exception.stack // XXX portability
        }
      });

      onComplete();
    }, stop_at_offset);
  },

  // Run a single test.  On the server, ensure that only one test runs
  // at a time, even with multiple clients submitting tests.  However,
  // time out the test after three minutes to avoid locking up the
  // server if a test fails to complete.
  //
  _runOne: function (test, onComplete, stop_at_offset) {
    var self = this;

    if (! self._prefixMatch(test.groupPath)) {
      onComplete && onComplete();
      return;
    }

    if (Meteor.isServer) {
      // On the server, ensure that only one test runs at a time, even
      // with multiple clients.
      self.manager.testQueue.queueTask(function () {
        // The future resolves when the test completes or times out.
        var future = new Future();
        Meteor.setTimeout(
          function () {
            if (future.isResolved())
              // If the future has resolved the test has completed.
              return;
            test.timedOut = true;
            self._report(test, {
              type: "exception",
              details: {
                message: "test timed out"
              }
            });
            future['return']();
          },
          3 * 60 * 1000  // 3 minutes
        );
        self._runTest(test, function () {
          // The test can complete after it has timed out (it might
          // just be slow), so only resolve the future if the test
          // hasn't timed out.
          if (! future.isResolved())
            future['return']();
        }, stop_at_offset);
        // Wait for the test to complete or time out.
        future.wait();
        onComplete && onComplete();
      });
    } else {
      // client
      self._runTest(test, function () {
        onComplete && onComplete();
      }, stop_at_offset);
    }
  },

  run: function (onComplete) {
    var self = this;
    var tests = _.clone(self.manager.ordered_tests);
    var reportCurrent = function (name) {
      if (Meteor.isClient)
        Tinytest._onCurrentClientTest(name);
    };

    var runNext = function () {
      if (tests.length) {
        var t = tests.shift();
        reportCurrent(t.name);
        self._runOne(t, runNext);
      } else {
        reportCurrent(null);
        onComplete && onComplete();
      }
    };

    runNext();
  },

  // An alternative to run(). Given the 'cookie' attribute of a
  // failure record, try to rerun that particular test up to that
  // failure, and then open the debugger.
  debug: function (cookie, onComplete) {
    var self = this;
    var test = self.manager.tests[cookie.name];
    if (!test)
      throw new Error("No such test '" + cookie.name + "'");
    self._runOne(test, onComplete, cookie.offset);
  },

  _report: function (test, event) {
    var self = this;
    if (event)
      var events = [_.extend({sequence: self.next_sequence_number++}, event)];
    else
      var events = [];
    self.onReport({
      groupPath: test.groupPath,
      test: test.shortName,
      events: events
    });
  }
});

/******************************************************************************/
/* Public API                                                                 */
/******************************************************************************/

Tinytest = {};

Tinytest.addAsync = function (name, func) {
  TestManager.addCase(new TestCase(name, func));
};

Tinytest.add = function (name, func) {
  Tinytest.addAsync(name, function (test, onComplete) {
    func(test);
    onComplete();
  });
};

// Run every test, asynchronously. Runs the test in the current
// process only (if called on the server, runs the tests on the
// server, and likewise for the client.) Report results via
// onReport. Call onComplete when it's done.
//
Tinytest._runTests = function (onReport, onComplete, pathPrefix) {
  var testRun = TestManager.createRun(onReport, pathPrefix);
  testRun.run(onComplete);
};

// Run just one test case, and stop the debugger at a particular
// error, all as indicated by 'cookie', which will have come from a
// failure event output by _runTests.
//
Tinytest._debugTest = function (cookie, onReport, onComplete) {
  var testRun = TestManager.createRun(onReport);
  testRun.debug(cookie, onComplete);
};

// Replace this callback to get called when we run a client test,
// and then called with `null` when the client tests are
// done.  This is used to provide a live display of the current
// running client test on the test results page.
Tinytest._onCurrentClientTest = function (name) {};

Tinytest._TestCaseResults = TestCaseResults;
Tinytest._TestCase = TestCase;
Tinytest._TestManager = TestManager;
Tinytest._TestRun = TestRun;
