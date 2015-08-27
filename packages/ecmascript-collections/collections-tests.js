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

Tinytest.add("core-js - Number", function () {
  // Make sure https://github.com/grigio/meteor-babel/issues/5 is not a
  // problem for us.
  check(1234, Number);
});
