
(function () {
  var globals = this;
  var CurrentTestRun = new Meteor.DynamicVariable;

// XXX namespacing

/******************************************************************************/
/* TestResultsReporter                                                        */
/******************************************************************************/

Meteor._TestResultsReporter = function (run) {
  var self = this;
  self.run = run;
};

_.extend(Meteor._TestResultsReporter.prototype, {
  ok: function (doc) {
    this.run.ok(doc);
  },

  expect_fail: function () {
    this.run.expect_fail();
  },

  fail: function (doc) {
    this.run.fail(doc);
  },

  exception: function (exception) {
    this.run.exception(exception);
  },

  // returns a unique ID for this test run, for convenience use by
  // your tests
  runId: function () {
    return this.run.id;
  },

  // === Following patterned after http://vowsjs.org/#reference ===

  // XXX eliminate 'message' and 'not' arguments
  equal: function (actual, expected, message, not) {
    /* If expected is a DOM node, do a literal '===' comparison with
     * actual. Otherwise compare the JSON stringifications of expected
     * and actual. (It's no good to stringify a DOM node. Circular
     * references, to start with..) */

    // XXX WE REALLY SHOULD NOT BE USING
    // STRINGIFY. stringify([undefined]) === stringify([null]). should use
    // deep equality instead.

    // XXX remove cruft specific to liverange
    if (typeof expected === "object" && expected && expected.nodeType) {
      var matched = expected === actual;
      expected = "[Node]";
      actual = "[Unknown]";
    } else {
      expected = JSON.stringify(expected);
      actual = JSON.stringify(actual);
      var matched = expected === actual;
    }

    if (matched === !!not) {
      this.fail({type: "assert_equal", message: message,
                 expected: expected, actual: actual, not: !!not});
    } else
      this.ok();
  },

  notEqual: function (actual, expected, message) {
    this.equal(actual, expected, message, true);
  },

  instanceOf: function (obj, klass) {
    if (obj instanceof klass)
      this.ok();
    else
      this.fail({type: "instanceOf"}); // XXX what other data?
  },

  // XXX should be length(), but on Chrome, functions always have a
  // length property that is permanently 0 and can't be assigned to
  // (it's a noop). How does vows do it??
  length: function (obj, expected_length) {
    if (obj.length === expected_length)
      this.ok();
    else
      this.fail({type: "length"}); // XXX what other data?
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
      this.ok({message: actual.message});
    else
      this.fail({type: "throws"});
  },

  isTrue: function (v) {
    if (v)
      this.ok();
    else
      this.fail({type: "true"});
  },

  isFalse: function (v) {
    if (v)
      this.fail({type: "true"});
    else
      this.ok();
  }
});

/******************************************************************************/
/* TestCase                                                                   */
/******************************************************************************/

Meteor._TestCase = function (name, func, async) {
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

_.extend(Meteor._TestCase.prototype, {
  // Run the test asynchronously, then call onComplete() on success,
  // or else onException(e) if the test raised an exception.
  run: function (run, onComplete, onException) {
    var self = this;
    var reporter = new Meteor._TestResultsReporter(run);
    _.defer(Meteor.bindEnvironment(function () {
      if (self.async)
        self.func(reporter, onComplete);
      else {
        self.func(reporter);
        onComplete();
      }
    }, onException));
  }
});

/******************************************************************************/
/* TestManager                                                                */
/******************************************************************************/

Meteor._TestManager = function () {
  var self = this;
  self.tests = {};
  self.ordered_tests = [];
};

_.extend(Meteor._TestManager.prototype, {
  addCase: function (test) {
    var self = this;
    if (test.name in self.tests)
      throw new Error("Every test needs a unique name, but there are two tests named '" + name + "'");
    self.tests[test.name] = test;
    self.ordered_tests.push(test);
  },

  createRun: function (onReport) {
    var self = this;
    return new Meteor._TestRun(self, onReport);
  }
});

// singleton
Meteor._TestManager = new Meteor._TestManager;

/******************************************************************************/
/* TestRun                                                                    */
/******************************************************************************/

Meteor._TestRun = function (manager, onReport) {
  var self = this;
  self.expecting_failure = false;
  self.manager = manager;
  self.onReport = onReport;
  // XXX eliminate, so test cases can run in parallel (within the run)?
  self.current_test = null;
  self.current_fail_count = null;
  self.stop_at_offset = null;
  self.current_onException = null;
  self.id = Meteor.uuid();

  _.each(self.manager.ordered_tests, _.bind(self._report, self));
};

_.extend(Meteor._TestRun.prototype, {
  _runOne: function (test, onComplete, stopAtOffset) {
    var self = this;
    self._report(test);
    self.current_test = test;
    self.current_fail_count = 0;
    self.stop_at_offset = stopAtOffset;

    var startTime = (+new Date);

    var cleanup = function () {
      self.current_test = null;
      self.current_fail_count = null;
      self.stop_at_offset = null;
      self.current_onException = null;
    };

    self.current_onException = function (exception) {
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
    };

    test.run(self, function () {
      /* onComplete */
      cleanup();

      var totalTime = (+new Date) - startTime;
      self._report(test, {events: [{type: "finish", timeMs: totalTime}]});
      onComplete();
    }, _.bind(self.current_onException, self));
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

    CurrentTestRun.withValue(self, runNext);
  },

  // An alternative to run(). Given the 'cookie' attribute of a
  // failure record, try to rerun that particular test up to that
  // failure, and then open the debugger.
  debug: function (cookie, onComplete) {
    var self = this;
    var test = self.manager.tests[cookie.name];
    if (!test)
      throw new Error("No such test '" + cookie.name + "'");
    CurrentTestRun.withValue(self, function () {
      self._runOne(test, onComplete, cookie.offset);
    });
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
      if (Meteor.is_client) {
        // Only supported on the browser for now..
        var now = (+new Date);
        debugger;
        if ((+new Date) - now < 100)
          alert("To use this feature, first open the debugger window in your browser.");
      }
      self.stop_at_offset = null;
    }

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
  },

  // Call this to fail the current test with an exception. Use this to record
  // exceptions that occur inside asynchronous callbacks in tests.
  //
  // It should only be used with asynchronous tests, and if you call
  // this function, you should make sure that (1) the test doesn't
  // call its callback (onComplete function); (2) the test function
  // doesn't directly raise an exception.
  exception: function (exception) {
    var self = this;
    if (!self.current_onException)
      throw new Error("Not in a test");
    self.current_onException(exception);
  }
});

/******************************************************************************/
/* Public API                                                                 */
/******************************************************************************/

// XXX this API is confusing and irregular. revisit once we have
// package namespacing.

globals.test = function (name, func) {
  Meteor._TestManager.addCase(new Meteor._TestCase(name, func));
};

globals.testAsync = function (name, func) {
  Meteor._TestManager.addCase(new Meteor._TestCase(name, func, true));
};

})();