Tinytest.add("ejson - hasSize", function (test) {
  test.isTrue(hasSize({}, 0));
  test.isFalse(hasSize({}, 1));
  test.isFalse(hasSize({}, 2));
  test.isFalse(hasSize({}, 3));

  test.isFalse(hasSize({a: 1}, 0));
  test.isTrue(hasSize({a: 1}, 1));
  test.isFalse(hasSize({a: 1}, 2));
  test.isFalse(hasSize({a: 1}, 3));

  test.isFalse(hasSize({a: 1, b: 2}, 0));
  test.isFalse(hasSize({a: 1, b: 2}, 1));
  test.isTrue(hasSize({a: 1, b: 2}, 2));
  test.isFalse(hasSize({a: 1, b: 2}, 3));
});

Tinytest.add("ejson - hasSizeAtMost", function (test) {
  test.isTrue(hasSizeAtMost({}, 0));
  test.isTrue(hasSizeAtMost({}, 1));
  test.isTrue(hasSizeAtMost({}, 2));
  test.isTrue(hasSizeAtMost({}, 3));

  test.isFalse(hasSizeAtMost({a: 1}, 0));
  test.isTrue(hasSizeAtMost({a: 1}, 1));
  test.isTrue(hasSizeAtMost({a: 1}, 2));
  test.isTrue(hasSizeAtMost({a: 1}, 3));

  test.isFalse(hasSizeAtMost({a: 1, b: 2}, 0));
  test.isFalse(hasSizeAtMost({a: 1, b: 2}, 1));
  test.isTrue(hasSizeAtMost({a: 1, b: 2}, 2));
  test.isTrue(hasSizeAtMost({a: 1, b: 2}, 3));
});

