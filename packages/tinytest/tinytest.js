(function () {

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
  self.id = Meteor.uuid();
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
    /* If expected is a DOM node, do a literal '===' comparison with
     * actual. Otherwise do a deep comparison, as implemented by _.isEqual.
     */

    var matched;
    // XXX remove cruft specific to liverange
    if (typeof expected === "object" && expected && expected.nodeType) {
      matched = expected === actual;
      expected = "[Node]";
      actual = "[Unknown]";
    } else {
      matched = _.isEqual(expected, actual);
      expected = JSON.stringify(expected);
      actual = JSON.stringify(actual);
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

  isTrue: function (v, msg) {
    if (v)
      this.ok();
    else
      this.fail({type: "true", message: msg});
  },

  isFalse: function (v, msg) {
    if (v)
      this.fail({type: "true", message: msg});
    else
      this.ok();
  },

  isNull: function (v, msg) {
    if (v === null)
      this.ok();
    else
      this.fail({type: "null", message: msg});
  },

  isNotNull: function (v, msg) {
    if (v === null)
      this.fail({type: "true", message: msg});
    else
      this.ok();
  },

  isUndefined: function (v, msg) {
    if (v === undefined)
      this.ok();
    else
      this.fail({type: "undefined", message: msg});
  },

  isNaN: function (v, msg) {
    if (isNaN(v))
      this.ok();
    else
      this.fail({type: "NaN", message: msg});
  },

  include: function (s, v) {
    var pass = false;
    if (s instanceof Array)
      pass = _.indexOf(s, v) !== -1;
    else if (typeof s === "object")
      pass = v in s;
    else if (typeof s === "string")
      for (var i = 0; i < s.length; i++)
        if (s.charAt(i) === v) {
          pass = true;
          break;
        }
    else
      /* fail -- not something that contains other things */;
    if (pass)
      this.ok();
    else
      this.fail({type: "include", sequence: s, should_contain_value: v});
  },

  // XXX should change to lengthOf to match vowsjs
  length: function (obj, expected_length) {
    if (obj.length === expected_length)
      this.ok();
    else
      this.fail({type: "length", expected: expected_length,
                 actual: obj.length});
  }

});

/******************************************************************************/
/* TestCase                                                                   */
/******************************************************************************/

TestCase = function (name, func, async) {
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

    var results = new TestCaseResults(self, onEvent,
                                      function (e) {
                                        if (markComplete())
                                          onException(e);
                                      }, stop_at_offset);

    Meteor.defer(function () {
      try {
        if (self.async) {
          self.func(results, function () {
            if (markComplete())
              onComplete();
          });
        } else {
          self.func(results);
          if (markComplete())
            onComplete();
        }
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
};

_.extend(TestManager.prototype, {
  addCase: function (test) {
    var self = this;
    if (test.name in self.tests)
      throw new Error(
        "Every test needs a unique name, but there are two tests named '" +
          test.name + "'");
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

TestRun = function (manager, onReport) {
  var self = this;
  self.manager = manager;
  self.onReport = onReport;
  self.next_sequence_number = 0;

  _.each(self.manager.ordered_tests, function (test) {
    self._report(test);
  });
};

_.extend(TestRun.prototype, {
  _runOne: function (test, onComplete, stop_at_offset) {
    var self = this;

    var startTime = (+new Date);

    test.run(function (event) {
      /* onEvent */
      self._report(test, event);
    }, function () {
      /* onComplete */
      var totalTime = (+new Date) - startTime;
      self._report(test, {type: "finish", timeMs: totalTime});
      onComplete && onComplete();
    }, function (exception) {
      /* onException */

      // XXX you want the "name" and "message" fields on the
      // exception, to start with..
      self._report(test, {
        type: "exception",
        details: {
          message: exception.message, // XXX empty???
          stack: exception.stack // XXX portability
        }
      });

      onComplete && onComplete();
    }, stop_at_offset);
  },

  run: function (onComplete) {
    var self = this;
    // create array of arrays of tests; synchronous tests in
    // different groups are run in parallel on client, async tests or
    // tests in different groups are run in sequence, as are all
    // tests on server
    var testGroups = _.values(
      _.groupBy(self.manager.ordered_tests,
                function(t) {
                  if (Meteor.isServer)
                    return "SERVER";
                  if (t.async)
                    return "ASYNC";
                  return t.name.split(" - ")[0];
                }));

    if (! testGroups.length) {
      onComplete();
    } else {
      var groupsDone = 0;

      _.each(testGroups, function(tests) {
        var runNext = function () {
          if (tests.length) {
            self._runOne(tests.shift(), runNext);
          } else {
            groupsDone++;
            if (groupsDone >= testGroups.length)
              onComplete();
          }
        };

        runNext();
      });
    }
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

var globals = this;
globals.Tinytest = {
  add: function (name, func) {
    TestManager.addCase(new TestCase(name, func));
  },

  addAsync: function (name, func) {
    TestManager.addCase(new TestCase(name, func, true));
  }
};

// Run every test, asynchronously. Runs the test in the current
// process only (if called on the server, runs the tests on the
// server, and likewise for the client.) Report results via
// onReport. Call onComplete when it's done.
Meteor._runTests = function (onReport, onComplete) {
  var testRun = TestManager.createRun(onReport);
  testRun.run(onComplete);
};

// Run just one test case, and stop the debugger at a particular
// error, all as indicated by 'cookie', which will have come from a
// failure event output by _runTests.
Meteor._debugTest = function (cookie, onReport, onComplete) {
  var testRun = TestManager.createRun(onReport);
  testRun.debug(cookie, onComplete);
};

})();
