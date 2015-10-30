Tinytest.add("ecmascript-containers - Map", function (test) {
  test.equal(typeof Map, "function");
  var key = {};
  var map = new Map;

  test.equal(map.entries().next(), {
    value: undefined,
    done: true
  });

  map.set(key, 1234);

  test.equal(map.entries().next(), {
    value: [key, 1234],
    done: false
  });
});

Tinytest.add("ecmascript-containers - Set", function (test) {
  test.equal(typeof Set, "function");
  var key = {};
  var set = new Set;

  test.equal(set.values().next(), {
    value: undefined,
    done: true
  });

  set.add(key);

  test.equal(set.values().next(), {
    value: key,
    done: false
  });
});

Tinytest.add("core-js - Array", function (test) {
  test.equal(Array.from("123", Number), [1, 2, 3]);
  test.equal(Array.of(1, 3, 5), [1, 3, 5]);
  test.equal(
    Array(5).fill("oyez"),
    ["oyez", "oyez", "oyez", "oyez", "oyez"]
  );

  function isOdd(n) {
    return n % 2;
  }

  test.equal([2, 3, 4].find(isOdd), 3);
  test.equal([2, 3, 4].findIndex(isOdd), 1);
});

Tinytest.add("core-js - Number", function () {
  // Make sure https://github.com/grigio/meteor-babel/issues/5 is not a
  // problem for us.
  check(1234, Number);
});

Tinytest.add("core-js - Object", function (test) {
  test.equal(typeof Object.assign, "function");
  test.equal(typeof Object.is, "function");
  test.equal(typeof Object.setPrototypeOf, "function");
  test.equal(typeof Object.getPrototypeOf, "function");
});

Tinytest.add("core-js - String", function (test) {
  test.equal(typeof "asdf".startsWith, "function");
  test.equal(typeof "asdf".endsWith, "function");
  test.equal(typeof "asdf".repeat, "function");
  test.equal(typeof "asdf".trim, "function");
});

Tinytest.add("core-js - Symbol", function (test) {
  test.equal(typeof Symbol, "function");
  test.equal(
    typeof Array.prototype[Symbol.iterator],
    "function"
  );
});

Tinytest.add("core-js - Function", function (test) {
  test.equal(
    typeof Function.prototype[Symbol.hasInstance],
    "function"
  );

  function Constructor() {};
  test.equal(Constructor[Symbol.hasInstance](new Constructor), true);
  test.equal(Constructor[Symbol.hasInstance]({}), false);
});
