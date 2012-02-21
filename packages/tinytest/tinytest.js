(function () {

var globals = (function () {return this;})();

/******************************************************************************/
/* TestCase                                                                   */
/******************************************************************************/

var TestCase = function (name, func, async) {
  var self = this;
  self.name = name;
  self.func = func;
  self.async = async || false;

  var nameParts = _.map(name.split(" - "), function(s) {
    return s.replace(/^\s*|\s*$/g, ""); // trim
  });
  self.shortName = nameParts.pop();
  nameParts.unshift("tinytest");
  self.groupPath = nameParts;
};

_.extend(TestCase.prototype, {
  // Run the test, then (asynchronously) call complete(). If the test
  // throws an exception, will let that exception propagate up to the
  // caller.
  run: function (onComplete, onException) {
    var self = this;
    _.defer(function () {
      if (self.async) {
        try {
          self.func(onComplete);
        } catch (e) {
          onException(e);
        }
      } else {
        try {
          self.func();
        } catch (e) {
          onException(e);
          return;
        }
        onComplete();
      }
    });
  }
});

/******************************************************************************/
/* TestManager                                                                */
/******************************************************************************/

var TestManager = function () {
  var self = this;
  self.tests = {};
  self.ordered_tests = [];
};

_.extend(TestManager.prototype, {
  addCase: function (test) {
    var self = this;
    if (test.name in self.tests)
      throw new Error("Every test needs a unique name, but there are two tests named '" + name + "'");
    self.tests[test.name] = test;
    self.ordered_tests.push(test);
  },

  createRun: function (onReport) {
    var self = this;
    return new TestRun(self, onReport);
  }
});

// singleton
TestManager = new TestManager;

/******************************************************************************/
/* TestRun                                                                    */
/******************************************************************************/

// Previously we had functionality that would let you run up to a
// particular test, and then stop (open the debugger on the assert,
// report the exception, whatever.) It did this by counting calls to
// fail() within a particular test. It'd be nice to restore this.
var TestRun = function (manager, onReport) {
  var self = this;
  self.expecting_failure = false;
  self.manager = manager;
  self.onReport = onReport;
  // XXX eliminate, so tests can run in parallel?
  self.current_test = null;
  self.current_fail_count = null;
  self.stop_at_offset = null;

  _.each(self.manager.ordered_tests, _.bind(self._report, self));
};

_.extend(TestRun.prototype, {
  _runOne: function (test, onComplete, stopAtOffset) {
    var self = this;
    self._report(test);
    self.current_test = test;
    self.current_fail_count = 0;
    self.stop_at_offset = stopAtOffset;

    var original_assert = globals.assert;
    globals.assert = test_assert;
    var startTime = (+new Date);

    var cleanup = function () {
      globals.assert = original_assert;
      self.current_test = null;
      self.stop_at_offset = null;
    };

    test.run(function () {
      /* onComplete */
      cleanup();

      var totalTime = (+new Date) - startTime;
      self._report(test, {events: [{type: "finish", timeMs: totalTime}]});
      onComplete();
    }, function (exception) {
      /* onException */
      cleanup();

      // XXX you want the "name" and "message" fields on the
      // exception, to start with..
      self._report(test, {
        events: [{
          type: "exception",
          details: {
            message: exception.message, // XXX empty???
            stack: exception.stack // XXX portability
          }
        }]
      });

      onComplete();
    });
  },

  run: function (onComplete) {
    var self = this;
    var tests = _.clone(self.manager.ordered_tests);

    var runNext = function () {
      if (tests.length)
        self._runOne(tests.shift(), runNext);
      else
        onComplete();
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

  _report: function (test, rest) {
    var self = this;
    self.onReport(_.extend({ groupPath: test.groupPath,
                             test: test.shortName },
                           rest));
  },

  ok: function (doc) {
    var self = this;
    var ok = {type: "ok"};
    if (doc) {
      ok.details = doc;
    }
    if (self.expecting_failure) {
      ok.details["was_expecting_failure"] = true;
      self.expecting_failure = false;
    }
    self._report(self.current_test, {events: [ok]});
  },

  expect_fail: function () {
    var self = this;
    self.expecting_failure = true;
  },

  fail: function (doc) {
    var self = this;

    if (self.stop_at_offset === 0) {
      var now = (+new Date);
      debugger;
      if ((+new Date) - now < 100)
        alert("To use this feature, first open the debugger window in your browser.");
      self.stop_at_offset = null;
    }
    if (self.stop_at_offset)
      self.stop_at_offset--;

    self._report(self.current_test, {
      events: [{
        type: (self.expecting_failure ? "expected_fail" : "fail"),
        details: doc,
        cookie: {name: self.current_test.name, offset: self.current_fail_count,
                 groupPath: self.current_test.groupPath,
                 shortName: self.current_test.shortName}
      }]});
    self.expecting_failure = false;
    self.current_fail_count++;
  }
});

/******************************************************************************/
/* Helpers                                                                    */
/******************************************************************************/

// Patterned after http://vowsjs.org/#reference
var test_assert = {
  // XXX eliminate 'message' and 'not' arguments
  equal: function (actual, expected, message, not) {
    /* If expected is a DOM node, do a literal '===' comparison with
     * actual. Otherwise compare the JSON stringifications of expected
     * and actual. (It's no good to stringify a DOM node. Circular
     * references, to start with..) */
    // XXX remove cruft specific to liverange
    if (typeof expected === "object" && expected.nodeType) {
      var matched = expected === actual;
      expected = "[Node]";
      actual = "[Unknown]";
    } else {
      expected = JSON.stringify(expected);
      actual = JSON.stringify(actual);
      var matched = expected === actual;
    }

    if (matched === !!not) {
      test.fail({type: "assert_equal", message: message,
                 expected: expected, actual: actual, not: !!not});
    } else
      test.ok();
  },

  notEqual: function (actual, expected, message) {
    test_assert.equal(actual, expected, message, true);
  },

  instanceOf: function (obj, klass) {
    if (obj instanceof klass)
      test.ok();
    else
      test.fail({type: "instanceOf"}); // XXX what other data?
  },

  // XXX should be length(), but on Chrome, functions always have a
  // length property that is permanently 0 and can't be assigned to
  // (it's a noop). How does vows do it??
  length: function (obj, expected_length) {
    if (obj.length === expected_length)
      test.ok();
    else
      test.fail({type: "length"}); // XXX what other data?
  },

  // XXX nodejs assert.throws can take an expected error, as a class,
  // regular expression, or predicate function..
  throws: function (f) {
    var actual;

    try {
      f();
    } catch (exception) {
      actual = exception;
    }

    if (actual)
      test.ok({message: actual.message});
    else
      test.fail({type: "throws"});
  },

  isTrue: function (v) {
    if (v)
      test.ok();
    else
      test.fail({type: "true"});
  },

  isFalse: function (v) {
    if (v)
      test.fail({type: "true"});
    else
      test.ok();
  }
};

/******************************************************************************/
/* Public API                                                                 */
/******************************************************************************/

// XXX this API is confusing and irregular. revisit once we have
// package namespacing.

globals.test = function (name, func) {
  TestManager.addCase(new TestCase(name, func));
};

globals.testAsync = function (name, func) {
  TestManager.addCase(new TestCase(name, func, true));
};

var currentRun = null;
var reportFunc = function () {};

_.extend(globals.test, {
  setReporter: function (_reportFunc) {
    reportFunc = _reportFunc;
  },

  ok: function (doc) {
    currentRun.ok(doc);
  },

  expect_fail: function () {
    currentRun.expect_fail();
  },

  fail: function (doc) {
    currentRun.fail(doc);
  },

  run: function (onComplete) {
    if (currentRun)
      throw new Error("Only one test run can be happening at once");
    currentRun = TestManager.createRun(reportFunc);
    currentRun.run(function () {
      currentRun = null;
      onComplete && onComplete();
    });
  },

  debug: function (cookie, onComplete) {
    if (currentRun)
      throw new Error("Only one test run can be happening at once");
    currentRun = TestManager.createRun(reportFunc);
    currentRun.debug(cookie, function () {
      currentRun = null;
      onComplete && onComplete();
    });
  }
});

})();
