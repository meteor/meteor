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
        matches(pair[0], function () {
          check(pair[0], type);
          return true;
        });
        matches(pair[0], function () {
          try {
            check(pair[0], type);
            return true;
          } catch (e) {
            return false;
          }
        });
      } else {
        fails(pair[0], type);
        matches(pair[0], Match.OneOf(type, pair[1]));
        matches(pair[0], Match.OneOf(pair[1], type));
        fails(pair[0], function () {
          check(pair[0], type);
          return true;
        });
        fails(pair[0], function () {
          try {
            check(pair[0], type);
            return true;
          } catch (e) {
            return false;
          }
        });
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

  matches(/foo/, RegExp);
  fails(/foo/, String);
  matches(new Date, Date);
  matches(function () {}, Function);
  fails(new Date, Number);
  matches(EJSON.newBinary(42), EJSON.isBinary);
  fails([], EJSON.isBinary);

  matches(42, function (x) { return x % 2 === 0; });
  fails(43, function (x) { return x % 2 === 0; });

  matches({
    a: "something",
    b: [
      {x: 42, k: null},
      {x: 43, k: true, p: ["yay"]}
    ]
  }, {a: String, b: [Match.ObjectIncluding({
    x: Number,
    k: Match.OneOf(null, Boolean)})]});

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

Tinytest.add("check - register constructor", function (test) {
  var Foo = function () {
    this.bar = 123;
  };
  var foo = new Foo();
  Match.constructors(Foo);
  test.isFalse(Match.test(123, Foo));
  test.isTrue(Match.test(foo, Foo));
  test.isFalse(Match.test(Foo, Foo));
  Match.__resetConstructors();
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
