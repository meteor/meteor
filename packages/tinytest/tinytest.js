(function () {

var globals = (function () {return this;})();

var tests = {};
var ordered_tests = [];

var expecting_failure = false;
var results;
var next_result;

var current_test;
var current_failure_count;

var stop_at_test;
var stop_at_failure_count;

// XXX find a way to permit async tests..
globals.test = function (name, func) {
  if (name in tests)
    throw new Error("Every test needs a unique name, but there are two tests named '" + name + "'");

  var t = {name: name, func: func};
  tests[t.name] = t;
  ordered_tests.push(t);
};

_.extend(globals.test, {
  ok: function () {
  },

  expect_fail: function () {
    expecting_failure = true;
  },

  fail: function (doc) {
    if (stop_at_test === current_test &&
        stop_at_failure_count === current_failure_count) {
      debugger;
      throw new Error("Stopping at failed test -- " + JSON.stringify(doc));
    }

    results.insert({n: next_result++, type: "fail", details: doc,
                    expected: expecting_failure,
                    cookie: {test: current_test.name,
                             failure_count: current_failure_count++}});
    expecting_failure = false;
    Sky.flush();
  },

  // 'stop_at_cookie' is the 'cookie' attribute of a failure document,
  // to stop at that failure
  run: function (collection, stop_at_cookie) {
    results = collection;
    next_result = 0;

    if (stop_at_cookie) {
      stop_at_test = tests[stop_at_cookie.test]
      stop_at_failure_count = stop_at_cookie.failure_count;
    } else
      stop_at_test = null;

    var exception;
    _.each(ordered_tests, function (t) {
      results.insert({n: next_result++, type: "begin", name: t.name});
      current_test = t;
      current_failure_count = 0;

      var original_assert = globals.assert;
      globals.assert = test_assert;

      // XXX XXX we also need to skip try..catch if we're about to
      // execute the test that will generate the fail() that we're
      // trying to replicate, else we end up reporting the "stopping
      // at failure" exception in the log!
      if (stop_at_test === current_test &&
          stop_at_failure_count === "exception") {
        // Don't run the test inside try..catch, since in some
        // browsers that loses stack info.
        t.func();
        // XXX XXX XXX and you're not going to restore the original
        // assert()??! ooooouch.
      } else {
        try {
          t.func();
        } catch (exception) {
          // XXX you want the "name" and "message" fields on the
          // exception, to start with..
          results.insert({n: next_result++, type: "exception",
                          message: exception.message, // XXX empty???
                          stack: exception.stack, // XXX portability
                          cookie: {test: current_test.name,
                                   failure_count: "exception"}});
        } finally {
          globals.assert = original_assert;
          current_test = null;
        }
      }
    });

  results.insert({n: next_result++, type: "begin", name: "complete!"});
  }

});

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
      test.ok();
    else
      test.fail({type: "throws"}); // XXX what else
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

})();
