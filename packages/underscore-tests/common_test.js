const list = [
  { test: 'test-1', num: 1, even: false },
  { test: 'test-2', num: 2, even: true },
  { test: 'test-3', num: 3, even: false },
  { test: 'test-4', num: 4, even: true }
];

Tinytest.add("underscore-tests - where", function (test) {
  test.equal(_.where(list, { num: 1}), [{ test: 'test-1', num: 1, even: false }]);
  test.equal(_.where(list, { even: true}), [{ test: 'test-2', num: 2, even: true }, { test: 'test-4', num: 4, even: true }]);
});

Tinytest.add("underscore-tests - findWhere", function (test) {
  test.equal(_.findWhere(list, { num: 1}), { test: 'test-1', num: 1, even: false });
  test.equal(_.findWhere(list, { even: true}), { test: 'test-2', num: 2, even: true });
});
