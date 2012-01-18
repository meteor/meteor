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
    var doc = _.extend(doc);
    if (expecting_failure)
      doc.expected = true;

    if (stop_at_test === current_test &&
        stop_at_failure_count === current_failure_count) {
      debugger;
      throw new Error("Stopping at failed test -- " + JSON.stringify(doc));
    }

    results.insert({n: next_result++, type: "fail", details: doc,
                    cookie: {test: current_test.name,
                             failure_count: current_failure_count++}});
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
  }
});

var test_assert = function () {
  test.fail({type: "assert"});
};

_.extend(test_assert, {
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
    test.equal(actual, expected, message, true);
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
  lengthIs: function (obj, expected_length) {
    if (obj.length === expected_length)
      test.ok();
    else
      test.fail({type: "length"}); // XXX what other data?
  }

});

})();
