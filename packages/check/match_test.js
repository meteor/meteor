Tinytest.add("check - check", function (test) {
  var matches = function (value, pattern) {
    var error;
    try {
      check(value, pattern);
    } catch (e) {
      error = e;
    }
    test.isFalse(error);
    test.isTrue(Match.test(value, pattern));
  };
  var fails = function (value, pattern) {
    var error;
    try {
      check(value, pattern);
    } catch (e) {
      error = e;
    }
    test.isTrue(error);
    test.instanceOf(error, Match.Error);
    test.isFalse(Match.test(value, pattern));
  };

  // Atoms.
  var pairs = [
    ["foo", String],
    ["", String],
    [0, Number],
    [42.59, Number],
    [NaN, Number],
    [Infinity, Number],
    [true, Boolean],
    [false, Boolean],
    [undefined, undefined],
    [null, null]
  ];
  _.each(pairs, function (pair) {
    matches(pair[0], Match.Any);
    _.each([String, Number, Boolean, undefined, null], function (type) {
      if (type === pair[1]) {
        matches(pair[0], type);
        matches(pair[0], Match.Optional(type));
        matches(undefined, Match.Optional(type));
        matches(pair[0], Match.Where(function () {
          check(pair[0], type);
          return true;
        }));
        matches(pair[0], Match.Where(function () {
          try {
            check(pair[0], type);
            return true;
          } catch (e) {
            return false;
          }
        }));
      } else {
        fails(pair[0], type);
        matches(pair[0], Match.OneOf(type, pair[1]));
        matches(pair[0], Match.OneOf(pair[1], type));
        fails(pair[0], Match.Where(function () {
          check(pair[0], type);
          return true;
        }));
        fails(pair[0], Match.Where(function () {
          try {
            check(pair[0], type);
            return true;
          } catch (e) {
            return false;
          }
        }));
      }
      fails(pair[0], [type]);
      fails(pair[0], Object);
    });
  });
  fails(true, Match.OneOf(String, Number, undefined, null, [Boolean]));
  fails(new String("foo"), String);
  fails(new Boolean(true), Boolean);
  fails(new Number(123), Number);

  matches([1, 2, 3], [Number]);
  matches([], [Number]);
  fails([1, 2, 3, "4"], [Number]);
  fails([1, 2, 3, [4]], [Number]);
  matches([1, 2, 3, "4"], [Match.OneOf(Number, String)]);

  matches({}, Object);
  matches({}, {});
  matches({foo: 42}, Object);
  fails({foo: 42}, {});
  matches({a: 1, b:2}, {b: Number, a: Number});
  fails({a: 1, b:2}, {b: Number});
  matches({a: 1, b:2}, Match.ObjectIncluding({b: Number}));
  fails({a: 1, b:2}, Match.ObjectIncluding({b: String}));
  fails({a: 1, b:2}, Match.ObjectIncluding({c: String}));
  fails({}, {a: Number});
  matches({}, {a: Match.Optional(Number)});
  matches({a: 1}, {a: Match.Optional(Number)});
  fails({a: true}, {a: Match.Optional(Number)});
  // Match.Optional means "or undefined" at the top level but "or absent" in
  // objects.
  fails({a: undefined}, {a: Match.Optional(Number)});
  var F = function () {
    this.x = 123;
  };
  fails(new F, { x: 123 });

  matches({}, Match.ObjectWithValues(Number));
  matches({x: 1}, Match.ObjectWithValues(Number));
  matches({x: 1, y: 2}, Match.ObjectWithValues(Number));
  fails({x: 1, y: "2"}, Match.ObjectWithValues(Number));

  matches("asdf", "asdf");
  fails("asdf", "monkey");
  matches(123, 123);
  fails(123, 456);
  fails("123", 123);
  fails(123, "123");
  matches(true, true);
  matches(false, false);
  fails(true, false);
  fails(true, "true");
  fails("false", false);

  matches(/foo/, RegExp);
  fails(/foo/, String);
  matches(new Date, Date);
  fails(new Date, Number);
  matches(EJSON.newBinary(42), Match.Where(EJSON.isBinary));
  fails([], Match.Where(EJSON.isBinary));

  matches(42, Match.Where(function (x) { return x % 2 === 0; }));
  fails(43, Match.Where(function (x) { return x % 2 === 0; }));

  matches({
    a: "something",
    b: [
      {x: 42, k: null},
      {x: 43, k: true, p: ["yay"]}
    ]
  }, {a: String, b: [Match.ObjectIncluding({
    x: Number,
    k: Match.OneOf(null, Boolean)})]});


  // Match.Integer
  matches(-1, Match.Integer);
  matches(0, Match.Integer);
  matches(1, Match.Integer);
  matches(-2147483648, Match.Integer); // INT_MIN
  matches(2147483647, Match.Integer); // INT_MAX
  fails(123.33, Match.Integer);
  fails(.33, Match.Integer);
  fails(1.348192308491824e+23, Match.Integer);
  fails(NaN, Match.Integer);
  fails(Infinity, Match.Integer);
  fails(-Infinity, Match.Integer);
  fails({}, Match.Integer);
  fails([], Match.Integer);
  fails(function () {}, Match.Integer);
  fails(new Date, Match.Integer);

  // Test that "arguments" is treated like an array.
  var argumentsMatches = function () {
    matches(arguments, [Number]);
  };
  argumentsMatches();
  argumentsMatches(1);
  argumentsMatches(1, 2);
  var argumentsFails = function () {
    fails(arguments, [Number]);
  };
  argumentsFails("123");
  argumentsFails(1, "23");
});

Tinytest.add("check - argument checker", function (test) {
  var checksAllArguments = function (f /*arguments*/) {
    Match._failIfArgumentsAreNotAllChecked(
      f, {}, _.toArray(arguments).slice(1), "test");
  };
  checksAllArguments(function () {});
  checksAllArguments(function (x) {check(x, Match.Any);}, undefined);
  checksAllArguments(function (x) {check(x, Match.Any);}, null);
  checksAllArguments(function (x) {check(x, Match.Any);}, false);
  checksAllArguments(function (x) {check(x, Match.Any);}, true);
  checksAllArguments(function (x) {check(x, Match.Any);}, 0);
  checksAllArguments(function (a, b, c) {
    check(a, String);
    check(b, Boolean);
    check(c, Match.Optional(Number));
  }, "foo", true);
  checksAllArguments(function () {
    check(arguments, [Number]);
  }, 1, 2, 4);
  checksAllArguments(function(x) {
    check(x, Number);
    check(_.toArray(arguments).slice(1), [String]);
  }, 1, "foo", "bar", "baz");
  // NaN values
  checksAllArguments(function (x) {
    check(x, Number);
  }, NaN);

  var doesntCheckAllArguments = function (f /*arguments*/) {
    try {
      Match._failIfArgumentsAreNotAllChecked(
        f, {}, _.toArray(arguments).slice(1), "test");
      test.fail({message: "expected _failIfArgumentsAreNotAllChecked to throw"});
    } catch (e) {
      test.equal(e.message, "Did not check() all arguments during test");
    }
  };

  doesntCheckAllArguments(function () {}, undefined);
  doesntCheckAllArguments(function () {}, null);
  doesntCheckAllArguments(function () {}, 1);
  doesntCheckAllArguments(function () {
    check(_.toArray(arguments).slice(1), [String]);
  }, 1, "asdf", "foo");
  doesntCheckAllArguments(function (x, y) {
    check(x, Boolean);
  }, true, false);
  // One "true" check doesn't count for all.
  doesntCheckAllArguments(function (x, y) {
    check(x, Boolean);
  }, true, true);
  // For non-primitives, we really do require that each arg gets checked.
  doesntCheckAllArguments(function (x, y) {
    check(x, [Boolean]);
    check(x, [Boolean]);
  }, [true], [true]);


  // In an ideal world this test would fail, but we currently can't
  // differentiate between "two calls to check x, both of which are true" and
  // "check x and check y, both of which are true" (for any interned primitive
  // type).
  checksAllArguments(function (x, y) {
    check(x, Boolean);
    check(x, Boolean);
  }, true, true);
});

Tinytest.add("check - Match error path", function (test) {
  var match = function (value, pattern, expectedPath) {
    try {
      check(value, pattern);
    } catch (err) {
      // XXX just for FF 3.6, its JSON stringification prefers "\u000a" to "\n"
      err.path = err.path.replace(/\\u000a/, "\\n");
      if (err.path != expectedPath)
        test.fail({
          type: "match-error-path",
          message: "The path of Match.Error doesn't match.",
          pattern: JSON.stringify(pattern),
          value: JSON.stringify(value),
          path: err.path,
          expectedPath: expectedPath
        });
    }
  };

  match({ foo: [ { bar: 3 }, {bar: "something"} ] }, { foo: [ { bar: Number } ] }, "foo[1].bar");
  // Complicated case with arrays, $, whitespace and quotes!
  match([{ $FoO: { "bar baz\n\"'": 3 } }], [{ $FoO: { "bar baz\n\"'": String } }], "[0].$FoO[\"bar baz\\n\\\"'\"]");
  // Numbers only, can be accessed w/o quotes
  match({ "1231": 123 }, { "1231": String }, "[1231]");
  match({ "1234abcd": 123 }, { "1234abcd": String }, "[\"1234abcd\"]");
  match({ $set: { people: "nice" } }, { $set: { people: [String] } }, "$set.people");
  match({ _underscore: "should work" }, { _underscore: Number }, "_underscore");
  // Nested array looks nice
  match([[["something", "here"], []], [["string", 123]]], [[[String]]], "[1][0][1]");
  // Object nested in arrays should look nice, too!
  match([[[{ foo: "something" }, { foo: "here"}],
          [{ foo: "asdf" }]],
         [[{ foo: 123 }]]],
        [[[{ foo: String }]]], "[1][0][0].foo");

  // JS keyword
  match({ "return": 0 }, { "return": String }, "[\"return\"]");
});

Tinytest.add("check - Match error message", function (test) {
  var match = function (value, pattern, expectedMessage) {
    try {
      check(value, pattern);
    } catch (err) {
      if (err.message !== "Match error: " + expectedMessage)
        test.fail({
          type: "match-error-message",
          message: "The message of Match.Error doesn't match.",
          pattern: JSON.stringify(pattern),
          value: JSON.stringify(value),
          errorMessage: err.message,
          expectedErrorMessage: expectedMessage
        });
    }
  };

  match(2, String, "Expected string, got number");
  match({key: 0}, Number, "Expected number, got object");
  match(null, Boolean, "Expected boolean, got null");
  match("string", undefined, "Expected undefined, got string");
  match(true, null, "Expected null, got true");
  match("bar", "foo", "Expected foo, got \"bar\"");
  match(3.14, Match.Integer, "Expected Integer, got 3.14");
  match(false, [Boolean], "Expected array, got false");
  match([null, null], [String], "Expected string, got null in field [0]");
  match(2, {key: 2}, "Expected object, got number");
  match(null, {key: 2}, "Expected object, got null");
  match(new Date, {key: 2}, "Expected plain object");
});

// Regression test for https://github.com/meteor/meteor/issues/2136
Meteor.isServer && Tinytest.addAsync("check - non-fiber check works", function (test, onComplete) {
  var Fiber = Npm.require('fibers');

  // We can only call test.isTrue inside normal Meteor Fibery code, so give us a
  // bindEnvironment way to get back.
  var report = Meteor.bindEnvironment(function (success) {
    test.isTrue(success);
    onComplete();
  });

  // Get out of a fiber with process.nextTick and ensure that we can still use
  // check.
  process.nextTick(function () {
    var success = true;
    if (Fiber.current)
      success = false;
    if (success) {
      try {
        check(true, Boolean);
      } catch (e) {
        success = false;
      }
    }
    report(success);
  });
});
