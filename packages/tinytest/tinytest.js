import isEqual from "lodash.isequal";

/******************************************************************************/
/* TestCaseResults                                                            */
/******************************************************************************/

export class TestCaseResults {
  constructor(test_case, onEvent, onException, stop_at_offset) {
    this.test_case = test_case;
    this.onEvent = onEvent;
    this.expecting_failure = false;
    this.current_fail_count = 0;
    this.stop_at_offset = stop_at_offset;
    this.onException = onException;
    this.id = Random.id();
    this.extraDetails = {};
  }

  sleep(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  ok(doc) {
    var ok = {type: "ok"};
    if (doc)
      ok.details = doc;
    if (this.expecting_failure) {
      ok.details = ok.details || {};
      ok.details["was_expecting_failure"] = true;
      this.expecting_failure = false;
    }
    this.onEvent(ok);
  }

  expect_fail() {
    this.expecting_failure = true;
  }

  fail(doc) {
    if (typeof doc === "string") {
      // Some very old code still tries to call fail() with a
      // string. Don't do this!
      doc = { type: "fail", message: doc };
    }

    doc = {
      ...doc,
      ...this.extraDetails,
    };

    if (this.stop_at_offset === 0) {
      if (Meteor.isClient) {
        // Only supported on the browser for now..
        var now = (+new Date);
        debugger;
        if ((+new Date) - now < 100)
          alert("To use this feature, first enable your browser's debugger.");
      }
      this.stop_at_offset = null;
    }
    if (this.stop_at_offset)
      this.stop_at_offset--;

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
        const fileName = frame.getFileName();
        if (fileName && fileName.match(/:tests\.js/)) {
          doc.filename = fileName;
          doc.line = frame.getLineNumber();
          break;
        }
      }
    }

    this.onEvent({
        type: (this.expecting_failure ? "expected_fail" : "fail"),
        details: doc,
        cookie: {name: this.test_case.name, offset: this.current_fail_count,
                 groupPath: this.test_case.groupPath,
                 shortName: this.test_case.shortName}
    });
    this.expecting_failure = false;
    this.current_fail_count++;
  }

  // Call this to fail the test with an exception. Use this to record
  // exceptions that occur inside asynchronous callbacks in tests.
  //
  // It should only be used with asynchronous tests, and if you call
  // this function, you should make sure that (1) the test doesn't
  // call its callback (onComplete function); (2) the test function
  // doesn't directly raise an exception.
  exception(exception) {
    this.onException(exception);
  }

  // returns a unique ID for this test run, for convenience use by
  // your tests
  runId() {
    return this.id;
  }

  // === Following patterned after http://vowsjs.org/#reference ===

  // XXX eliminate 'message' and 'not' arguments
  equal(actual, expected, message, not) {
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
  }

  notEqual(actual, expected, message) {
    this.equal(actual, expected, message, true);
  }

  instanceOf(obj, klass, message) {
    if (obj instanceof klass)
      this.ok();
    else
      this.fail({type: "instanceOf", message: message, not: false}); // XXX what other data?
  }

  notInstanceOf(obj, klass, message) {
    if (obj instanceof klass)
      this.fail({type: "instanceOf", message: message, not: true}); // XXX what other data?
    else
      this.ok();
  }

  matches(actual, regexp, message) {
    if (regexp.test(actual))
      this.ok();
    else
      this.fail({type: "matches", message: message,
                 actual: actual, regexp: regexp.toString(), not: false});
  }

  notMatches(actual, regexp, message) {
    if (regexp.test(actual))
      this.fail({type: "matches", message: message,
                 actual: actual, regexp: regexp.toString(), not: true});
    else
      this.ok();
  }

  _assertActual(actual, predicate, message) {
    if (actual && predicate(actual))
      this.ok();
    else
      this.fail({
        type: "throws",
        message: (actual ?
            "wrong error thrown: " + actual.message :
            "did not throw an error as expected") + (message ? ": " + message : ""),
      });
  }

  _guessPredicate(expected) {
    let predicate;

    if (expected === undefined) {
      predicate = function () {
        return true;
      };
    } else if (typeof expected === "string") {
      predicate = function (actual) {
        return typeof actual.message === "string" &&
            actual.message.indexOf(expected) !== -1;
      };
    } else if (expected instanceof RegExp) {
      predicate = function (actual) {
        return expected.test(actual.message);
      };
    } else if (typeof expected === 'function') {
      predicate = expected;
    } else {
      throw new Error('expected should be a string, regexp, or predicate function');
    }

    return predicate;
  }

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
  throws(f, expected, message) {
    let actual;
    const predicate = this._guessPredicate(expected);

    try {
      f();
    } catch (exception) {
      actual = exception;
    }

    this._assertActual(actual, predicate, message);
  }

  /**
   * Same as throw, but accepts an async function as a parameter.
   * @param f
   * @param expected
   * @param message
   * @returns {Promise<void>}
   */
  async throwsAsync(f, expected, message) {
    let actual;
    const predicate = this._guessPredicate(expected);

    try {
      await f();
    } catch (exception) {
      actual = exception;
    }
    this._assertActual(actual, predicate, message);
  }

  isTrue(v, msg) {
    if (v)
      this.ok();
    else
      this.fail({type: "true", message: msg, not: false});
  }

  isFalse(v, msg) {
    if (v)
      this.fail({type: "true", message: msg, not: true});
    else
      this.ok();
  }

  isNull(v, msg) {
    if (v === null)
      this.ok();
    else
      this.fail({type: "null", message: msg, not: false});
  }

  isNotNull(v, msg) {
    if (v === null)
      this.fail({type: "null", message: msg, not: true});
    else
      this.ok();
  }

  isUndefined(v, msg) {
    if (v === undefined)
      this.ok();
    else
      this.fail({type: "undefined", message: msg, not: false});
  }

  isNotUndefined(v, msg) {
    if (v === undefined)
      this.fail({type: "undefined", message: msg, not: true});
    else
      this.ok();
  }

  isNaN(v, msg) {
    if (isNaN(v))
      this.ok();
    else
      this.fail({type: "NaN", message: msg, not: false});
  }

  isNotNaN(v, msg) {
    if (isNaN(v))
      this.fail({type: "NaN", message: msg, not: true});
    else
      this.ok();
  }

  include(s, v, message, not) {
    var pass = false;
    if (s instanceof Array) {
      pass = s.some(it => isEqual(v, it));
    } else if (s && typeof s === "object") {
      pass = v in s;
    } else if (typeof s === "string") {
      if (s.indexOf(v) > -1) {
        pass = true;
      }
    } else {
      /* fail -- not something that contains other things */
    }

    if (pass === ! not) {
      this.ok();
    } else {
      this.fail({
        type: "include",
        message,
        sequence: s,
        should_contain_value: v,
        not: !!not,
      });
    }
  }

  notInclude(s, v, message) {
    this.include(s, v, message, true);
  }

  // XXX should change to lengthOf to match vowsjs
  length(obj, expected_length, msg) {
    if (obj.length === expected_length) {
      this.ok();
    } else {
      this.fail({
        type: "length",
        expected: expected_length,
        actual: obj.length,
        message: msg,
      });
    }
  }

  // EXPERIMENTAL way to compare two strings that results in
  // a nicer display in the test runner, e.g. for multiline
  // strings
  _stringEqual(actual, expected, message) {
    if (actual !== expected) {
      this.fail({
        type: "string_equal",
        message,
        expected,
        actual,
      });
    } else {
      this.ok();
    }
  }
}

/******************************************************************************/
/* TestCase                                                                   */
/******************************************************************************/

export class TestCase {
  constructor(name, func) {
    this.name = name;
    this.func = func;

    var nameParts = name.split(" - ").map(s => {
      return s.replace(/^\s*|\s*$/g, ""); // trim
    });
    this.shortName = nameParts.pop();
    nameParts.unshift("tinytest");
    this.groupPath = nameParts;
  }

  // Run the test asynchronously, delivering results via onEvent;
  // then call onComplete() on success, or else onException(e) if the
  // test raised (or voluntarily reported) an exception.
  run(onEvent, onComplete, onException, stop_at_offset) {
    let completed = false;
    const self = this;
    return new Promise((resolve, reject) => {
      const results = new TestCaseResults(
        this,
        event => {
          // If this trace prints, it means you ran some test.* function
          // after the test finished! Another symptom will be that the
          // test will display as "waiting" even when it counts as passed
          // or failed.
          if (completed) {
            console.warn('Test name:', self.name);
            console.trace("event after complete!");
          }
          return onEvent(event);
        },
        reject,
        stop_at_offset
      );

      const result = Meteor._runFresh(() => this.func(results, resolve));
      if (result && typeof result.then === "function") {
        return result.then(resolve, reject);
      }

    }).then(
      () => {
        completed = true;
        onComplete();
      },
      error => {
        completed = true;
        onException(error);
      }
    );
  }
}

/******************************************************************************/
/* TestManager                                                                */
/******************************************************************************/

export const TestManager = new (class TestManager {
  constructor() {
    this.tests = {};
    this.ordered_tests = [];
    this.testQueue = Meteor.isServer && new Meteor._AsynchronousQueue();
    this.onlyTestsNames = [];
  }

  addCase(test, options = {}) {
    if (test.name in this.tests)
      throw new Error(
        "Every test needs a unique name, but there are two tests named '" +
          test.name + "'");
    if (__meteor_runtime_config__.tinytestFilter &&
        test.name.indexOf(__meteor_runtime_config__.tinytestFilter) === -1) {
      return;
    }

    if (options.isOnly) {
      this.onlyTestsNames.push(test.name);
    }

    this.tests[test.name] = test;
    this.ordered_tests.push(test);

    if (this.onlyTestsNames.length){
      this.tests = Object.entries(this.tests).reduce((acc, [key, value]) => {
        if(this.onlyTestsNames.includes(key)){
          return {...acc, [key]: value};
        }
        return acc;
      }, {});

      this.ordered_tests = this.ordered_tests.map(test => {
        if (this.onlyTestsNames.includes(test.name)) {
          return test;
        }
        return null;
      }).filter(Boolean);
    }
  }

  createRun(onReport, pathPrefix) {
    return new TestRun(this, onReport, pathPrefix);
  }
});

if (Meteor.isServer && process.env.TINYTEST_FILTER) {
  __meteor_runtime_config__.tinytestFilter = process.env.TINYTEST_FILTER;
}

/******************************************************************************/
/* TestRun                                                                    */
/******************************************************************************/

export class TestRun {
  constructor(manager, onReport, pathPrefix) {
    this.manager = manager;
    this.onReport = onReport;
    this.next_sequence_number = 0;
    this._pathPrefix = pathPrefix || [];
    this.manager.ordered_tests.forEach(test => {
      if (this._prefixMatch(test.groupPath))
        this._report(test);
    });
  }

  _prefixMatch(testPath) {
    for (var i = 0; i < this._pathPrefix.length; i++) {
      if (!testPath[i] || this._pathPrefix[i] !== testPath[i]) {
        return false;
      }
    }
    return true;
  }

  _runTest(test, onComplete, stop_at_offset) {
    var startTime = (+new Date);
    Tinytest._currentRunningTestName = test.name;

    return test.run(event => {
      /* onEvent */
      // Ignore result callbacks if the test has already been reported
      // as timed out.
      if (test.timedOut)
        return;
      this._report(test, event);
    }, () => {
      /* onComplete */
      if (test.timedOut)
        return;
      var totalTime = (+new Date) - startTime;
      this._report(test, {type: "finish", timeMs: totalTime});
      onComplete();
    }, exception => {
      /* onException */
      if (test.timedOut)
        return;

      // XXX you want the "name" and "message" fields on the
      // exception, to start with..
      this._report(test, {
        type: "exception",
        details: {
          message: exception.message, // XXX empty???
          stack: exception.stack // XXX portability
        }
      });

      onComplete();
    }, stop_at_offset);
  }

  // Run a single test.  On the server, ensure that only one test runs
  // at a time, even with multiple clients submitting tests.  However,
  // time out the test after three minutes to avoid locking up the
  // server if a test fails to complete.
  //
  _runOne(test, onComplete, stop_at_offset) {
    if (! this._prefixMatch(test.groupPath)) {
      onComplete && onComplete();
      return;
    }

    if (Meteor.isServer) {
      this.manager.testQueue.queueTask(() => {
        // On the server, ensure that only one test runs at a time, even
        // with multiple clients.
        let hasRan = false;
        const timeoutPromise = new Promise((resolve) => {
          Meteor.setTimeout(() => {
            if (!hasRan) {
              test.timedOut = true;
              this._report(test, {
                type: "exception",
                details: {
                  message: "test timed out"
                }
              });
            }

            resolve();
          }, 3 * 60 * 1000);
        });
        const runnerPromise = new Promise((resolve) => {
          this._runTest(test, () => {
            if (!hasRan) {
              hasRan = true;
            }
            resolve();
          }, stop_at_offset);
        });

        Promise.race([runnerPromise, timeoutPromise]).finally(() => {
          onComplete && onComplete();
        });
      });
    } else {
      // client
      return this._runTest(test, () => {
        onComplete && onComplete();
      }, stop_at_offset);
    }
  }

  run(onComplete) {
    var tests = this.manager.ordered_tests.slice(0);
    var reportCurrent = function (name) {
      if (Meteor.isClient)
        Tinytest._onCurrentClientTest(name);
    };

    const runNext = () => {
      if (tests.length) {
        var t = tests.shift();
        reportCurrent(t.name);
        this._runOne(t, runNext);
      } else {
        reportCurrent(null);
        onComplete && onComplete();
      }
    };

    runNext();
  }

  // An alternative to run(). Given the 'cookie' attribute of a
  // failure record, try to rerun that particular test up to that
  // failure, and then open the debugger.
  debug(cookie, onComplete) {
    var test = this.manager.tests[cookie.name];
    if (!test)
      throw new Error("No such test '" + cookie.name + "'");
    this._runOne(test, onComplete, cookie.offset);
  }

  _report(test, event) {
    let events;
    if (event) {
      events = [{
        sequence: this.next_sequence_number++,
        ...event
      }];
    } else {
      events = [];
    }
    this.onReport({
      groupPath: test.groupPath,
      test: test.shortName,
      events,
    });
  }
}

/******************************************************************************/
/* Public API                                                                 */
/******************************************************************************/

export const Tinytest = {};
globalThis.__Tinytest = Tinytest;

Tinytest.addAsync = function (name, func, options) {
  TestManager.addCase(new TestCase(name, func), options);
};

Tinytest.onlyAsync = function (name, func) {
  Tinytest.addAsync(name, func, { isOnly: true });
};

Tinytest.add = function (name, func, options) {
  Tinytest.addAsync(name, function (test, onComplete) {
    func(test);
    onComplete();
  }, options);
};

Tinytest.only = function (name, func) {
  Tinytest.add(name, func, { isOnly: true });
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

Tinytest._currentRunningTestName = ""

Meteor.methods({
  'tinytest/getCurrentRunningTestName'() {
    return Tinytest._currentRunningTestName;
  }
})

Tinytest._getCurrentRunningTestOnServer = function () {
  return Meteor.callAsync('tinytest/getCurrentRunningTestName');
}

Tinytest._getCurrentRunningTestOnClient = function () {
  return Tinytest._currentRunningTestName;
}

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
