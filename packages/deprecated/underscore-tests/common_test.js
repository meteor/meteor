const list = [
  { test: 'test-1', num: 1, even: false },
  { test: 'test-2', num: 2, even: true },
  { test: 'test-3', num: 3, even: false },
  { test: 'test-4', num: 4, even: true }
];

const nums = [1,2,3,4];

const numStrs = ['one', 'two', 'three'];

Tinytest.add("underscore-tests - where", function (test) {
  test.equal(_.where(list, { num: 1}), [{ test: 'test-1', num: 1, even: false }]);
  test.equal(_.where(list, { even: true}), [{ test: 'test-2', num: 2, even: true }, { test: 'test-4', num: 4, even: true }]);
});

Tinytest.add("underscore-tests - findWhere", function (test) {
  test.equal(_.findWhere(list, { num: 1}), { test: 'test-1', num: 1, even: false });
  test.equal(_.findWhere(list, { even: true}), { test: 'test-2', num: 2, even: true });
});

Tinytest.add("underscore-tests - pluck", function (test) {
  test.equal(_.pluck(list, 'num'), [1,2,3,4]);
  test.equal(_.pluck(list, 'test'), ["test-1","test-2","test-3","test-4"]);
});

Tinytest.add("underscore-tests - max-min", function (test) {
  test.equal(_.max(nums), 4);
  test.equal(_.min(nums), 1);
});

Tinytest.add("underscore-tests - first-last", function (test) {
  test.equal(_.last(nums), 4);
  test.equal(_.first(nums), 1);
});

Tinytest.add("underscore-tests - sample", function (test) {
  const sample = _.sample(nums);
  test.isTrue(typeof sample === 'number' && nums.includes(sample));
  const samplesThree = _.sample(nums, 3);
  test.isTrue(samplesThree?.length === 3 && samplesThree.every(_s => nums.includes(_s)));
});

Tinytest.add("underscore-tests - groupBy", function (test) {
  test.equal(_.groupBy(numStrs, 'length'), {"3":["one","two"],"5":["three"]});
});

Tinytest.add("underscore-tests - partition", function (test) {
  test.equal(_.partition(nums, num => num % 2), [[1,3],[2,4]]);
});

Tinytest.add("underscore-tests - intersection", function (test) {
  test.equal(_.intersection([1, 2, 3], [101, 2, 1, 10], [2, 1]), [1, 2]);
});

Tinytest.add("underscore-tests - partial", function (test) {
  const subtract = function(a, b) { return b - a; };
  const sub5 = _.partial(subtract, 5);
  test.equal(sub5(20), 15);
});

Tinytest.add("underscore-tests - wrap", function (test) {
  let hello = function(name) { return "hello: " + name; };
  hello = _.wrap(hello, function(func) {
    return "before, " + func("moe") + ", after";
  });
  test.equal(hello(), 'before, hello: moe, after');
});

Tinytest.add("underscore-tests - keys", function (test) {
  test.equal(_.keys(list[0]), ["test","num","even"]);
});


Tinytest.add("underscore-tests - Meteor collection compatibility", function (test) {
  const doc = { length: 2, name: 'x' };
  test.equal(_.reduce(doc, function (memo, value) { return memo.concat(value); }, []), [2, 'x']);
  test.equal(_.reduceRight(doc, function (memo, value) { return memo.concat(value); }, []), ['x', 2]);
  test.equal(_.find(doc, function (value) { return value === 'x'; }), 'x');
  const values = { length: 2, first: -3, second: 8 };
  test.equal(_.min(values), -3);
  test.equal(_.max(values), 8);
  test.equal(_.sample(doc, 2).sort(), [2, 'x']);
  test.equal(_.shuffle(doc).sort(), [2, 'x']);
  (function () {
    test.equal(_.shuffle(arguments).sort(), [1, 2, 3]);
  })(3, 1, 2);
  const arrayLike = Object.create({});
  arrayLike[0] = 'a';
  arrayLike[1] = 'b';
  arrayLike.length = 2;
  // A NodeList-like object has a non-Object constructor.
  arrayLike.constructor = function NodeList() {};
  test.equal(_.sample(arrayLike, 2).sort(), ['a', 'b']);
});

Tinytest.add("underscore-tests - sorted uniq", function (test) {
  test.equal(_.uniq([1, 1, 2, 3], true), [1, 2, 3]);
  test.equal(_.uniq([1, 2, 3], true, function (value) { return Math.floor(value / 2); }), [1, 2]);
});

Tinytest.add("underscore-tests - template compatibility", function (test) {
  test.equal(_.template('Hello <%= name %>', { name: 'Ada' }), 'Hello Ada');
  test.equal(_.template('literal', {}), 'literal');
  test.equal(_.template('<%= variable %>', { variable: 'data, not settings' }), 'data, not settings');
  test.equal(_.template('Hello <%= name %>')({ name: 'Ada' }), 'Hello Ada');
  test.equal(_.template('Hello {{ name }}', { name: 'Ada' }, { interpolate: /{{([\s\S]+?)}}/g }), 'Hello Ada');
  test.equal(_.template('<%= data.name %>', null, { variable: 'data' })({ name: 'Ada' }), 'Ada');
});
