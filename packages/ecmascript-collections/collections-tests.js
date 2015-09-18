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
