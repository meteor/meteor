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
    ["foo", string],
    ["", string],
    [0, number],
    [42.59, number],
    [NaN, number],
    [Infinity, number],
    [true, boolean],
    [false, boolean],
    [undefined, undefined],
    [null, null]
  ];
  _.each(pairs, function (pair) {
    matches(pair[0], Match.Any);
    _.each([string, number, boolean, undefined, null], function (type) {
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
      fails(pair[0], object);
    });
  });
  fails(true, Match.OneOf(string, number, undefined, null, [boolean]));

  matches([1, 2, 3], [number]);
  matches([], [number]);
  fails([1, 2, 3, "4"], [number]);
  fails([1, 2, 3, [4]], [number]);
  matches([1, 2, 3, "4"], [Match.OneOf(number, string)]);

  matches({}, object);
  matches({}, {});
  matches({foo: 42}, object);
  fails({foo: 42}, {});
  matches({a: 1, b:2}, {b: number, a: number});
  fails({a: 1, b:2}, {b: number});
  matches({a: 1, b:2}, Match.ObjectIncluding({b: number}));
  fails({a: 1, b:2}, Match.ObjectIncluding({b: string}));
  fails({a: 1, b:2}, Match.ObjectIncluding({c: string}));
  fails({}, {a: number});
  matches({}, {a: Match.Optional(number)});
  matches({a: 1}, {a: Match.Optional(number)});
  fails({a: true}, {a: Match.Optional(number)});
  // Match.Optional means "or undefined" at the top level but "or absent" in
  // objects.
  fails({a: undefined}, {a: Match.Optional(number)});

  matches(/foo/, Match.Is(RegExp));
  fails(/foo/, string);
  matches(new Date, Match.Is(Date));
  fails(new Date, number);
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
  }, {a: string, b: [Match.ObjectIncluding({
    x: number,
    k: Match.OneOf(null, boolean)})]});

  // Test that "arguments" is treated like an array.
  var argumentsMatches = function () {
    matches(arguments, [number]);
  };
  argumentsMatches();
  argumentsMatches(1);
  argumentsMatches(1, 2);
  var argumentsFails = function () {
    fails(arguments, [number]);
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
    check(a, string);
    check(b, boolean);
    check(c, Match.Optional(number));
  }, "foo", true);
  checksAllArguments(function () {
    check(arguments, [number]);
  }, 1, 2, 4);
  checksAllArguments(function(x) {
    check(x, number);
    check(_.toArray(arguments).slice(1), [string]);
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
    check(_.toArray(arguments).slice(1), [string]);
  }, 1, "asdf", "foo");
  doesntCheckAllArguments(function (x, y) {
    check(x, boolean);
  }, true, false);
  // One "true" check doesn't count for all.
  doesntCheckAllArguments(function (x, y) {
    check(x, boolean);
  }, true, true);
  // For non-primitives, we really do require that each arg gets checked.
  doesntCheckAllArguments(function (x, y) {
    check(x, [boolean]);
    check(x, [boolean]);
  }, [true], [true]);


  // In an ideal world this test would fail, but we currently can't
  // differentiate between "two calls to check x, both of which are true" and
  // "check x and check y, both of which are true" (for any interned primitive
  // type).
  checksAllArguments(function (x, y) {
    check(x, boolean);
    check(x, boolean);
  }, true, true);
});
