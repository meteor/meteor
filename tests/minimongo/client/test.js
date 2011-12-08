TestFailure = function (message) {
  this.message = message;
};
TestFailure.prototype = new Error();

log = function (message) {
  $('body').append(DIV([message]));
};

assert = function (expected, actual) {
  expected = JSON.stringify(expected);
  actual = JSON.stringify(actual);

  if (expected !== actual) {
    debugger;
    console.log("Assertion failed");
    console.log("  Expected: " + expected);
    console.log("  Actual: " + actual);
    throw new TestFailure("assertion failed");
  }
};

// XXX should separate exceptions that come from test assertions
// failing, from assertions coming from the actual API
// calls. assertThrows is trying to assert that we get the latter
assertThrows = function (f) {
  var caught = false;
  try {
    f();
  } catch (e) {
    if (e instanceof TestFailure)
      throw new TestFailure("test expected an exception, but got a test failure");
    caught = true;
  }
  if (!caught) {
    debugger;
    throw new TestFailure("test expected an exception");
  }
}

// XXX test shared structure in all MM entrypoints

run_tests = function () {
  log("running tests");
  test_basics();
  test_misc();
  test_selector_compiler();
  test_ordering();
  test_sort();
  test_modify();
  test_livequery();
  log("done");
};

test_basics = function () {
  var c = new Collection();

  c.insert({type: "kitten", name: "fluffy"});
  c.insert({type: "kitten", name: "snookums"});
  c.insert({type: "cryptographer", name: "alice"});
  c.insert({type: "cryptographer", name: "bob"});
  c.insert({type: "cryptographer", name: "cara"});
  assert(2, c.find({type: "kitten"}).length);
  assert(3, c.find({type: "cryptographer"}).length);
  c.remove({name: "cara"});
  assert(2, c.find({type: "kitten"}).length);
  assert(2, c.find({type: "cryptographer"}).length);
  c.update({name: "snookums"}, {$set: {type: "cryptographer"}});
  assert(1, c.find({type: "kitten"}).length);
  assert(3, c.find({type: "cryptographer"}).length);

  c.remove({});
  c.insert({_id: 1, name: "strawberry", tags: ["fruit", "red", "squishy"]});
  c.insert({_id: 2, name: "apple", tags: ["fruit", "red", "hard"]});
  c.insert({_id: 3, name: "rose", tags: ["flower", "red", "squishy"]});
  assert(1, c.find({tags: "flower"}).length);
  assert(2, c.find({tags: "fruit"}).length);
  assert(3, c.find({tags: "red"}).length);

  var ev = "";
  var makecb = function (tag) {
    return {
      added: function (doc) { ev += "a" + tag + doc._id + "_"; },
      changed: function (doc) { ev += "c" + tag + doc._id + "_"; },
      removed: function (id) { ev += "r" + tag + id + "_"; }
    };
  };
  var expect = function (x) {
    assert(x, ev);
    ev = "";
  };
  c.findLive({tags: "flower"}, makecb('a'));
  expect("aa3_");
  c.update({name: "rose"}, {$set: {tags: ["bloom", "red", "squishy"]}});
  expect("ra3_");
  c.update({name: "rose"}, {$set: {tags: ["flower", "red", "squishy"]}});
  expect("aa3_");
  c.update({name: "rose"}, {$set: {food: false}});
  expect("ca3_");
  c.remove({});
  expect("ra3_");
  c.insert({_id: 4, name: "daisy", tags: ["flower"]});
  expect("aa4_");
};

test_misc = function () {
  // deepcopy
  var a = {a: [1, 2, 3], b: "x", c: true, d: {x: 12, y: [12]},
           f: null};
  var b = Collection._deepcopy(a);
  assert(true, Collection._f._equal(a, b));
  a.a.push(4);
  assert(3, b.a.length);
  a.c = false;
  assert(true, b.c);
  b.d.z = 15;
  a.d.z = 14;
  assert(15, b.d.z);
  a.d.y.push(88);
  assert(1, b.d.y.length);

  a = {x: function () {}};
  b = Collection._deepcopy(a);
  a.x.a = 14;
  assert(14, b.x.a); // just to document current behavior
};

test_selector_compiler = function () {
  var matches = function (should_match, selector, doc) {
    var does_match = Collection._matches(selector, doc);
    if (does_match != should_match) {
      console.log("minimongo match failed");
      console.log("  Selector: " + JSON.stringify(selector));
      console.log("  Document: " + JSON.stringify(doc));
      if (should_match)
        console.log("  Should match, but doesn't");
      else
        console.log("  Shouldn't match, but does");
      debugger;
      throw new TestFailure("minimongo match failed");
    }
  };

  var match = _.bind(matches, null, true);
  var nomatch = _.bind(matches, null, false);

  // XXX blog post about what I learned while writing these tests (weird
  // mongo edge cases)

  // empty selectors
  match({}, {});
  match({}, {a: 12});

  // matching one or more keys
  nomatch({a: 12}, {});
  match({a: 12}, {a: 12});
  match({a: 12}, {a: 12, b: 13});
  match({a: 12, b: 13}, {a: 12, b: 13});
  match({a: 12, b: 13}, {a: 12, b: 13, c: 14});
  nomatch({a: 12, b: 13, c: 14}, {a: 12, b: 13});
  nomatch({a: 12, b: 13}, {b: 13, c: 14});

  match({a: 12}, {a: [12]});
  match({a: 12}, {a: [11, 12, 13]});
  nomatch({a: 12}, {a: [11, 13]});
  match({a: 12, b: 13}, {a: [11, 12, 13], b: [13, 14, 15]});
  nomatch({a: 12, b: 13}, {a: [11, 12, 13], b: [14, 15]});

  // arrays
  match({a: [1,2]}, {a: [1, 2]});
  match({a: [1,2]}, {a: [[1, 2]]});
  match({a: [1,2]}, {a: [[3, 4], [1, 2]]});
  nomatch({a: [1,2]}, {a: [3, 4]});
  nomatch({a: [1,2]}, {a: [[[1, 2]]]});

  // literal documents
  match({a: {b: 12}}, {a: {b: 12}});
  nomatch({a: {b: 12, c: 13}}, {a: {b: 12}});
  nomatch({a: {b: 12}}, {a: {b: 12, c: 13}});
  match({a: {b: 12, c: 13}}, {a: {b: 12, c: 13}});
  nomatch({a: {b: 12, c: 13}}, {a: {c: 13, b: 12}}); // tested on mongodb
  nomatch({a: {}}, {a: {b: 12}});
  nomatch({a: {b:12}}, {a: {}});
  match(
    {a: {b: 12, c: [13, true, false, 2.2, "a", null, {d: 14}]}},
    {a: {b: 12, c: [13, true, false, 2.2, "a", null, {d: 14}]}});
  match({a: {b: 12}}, {a: {b: 12}, k: 99});

  match({a: {b: 12}}, {a: [{b: 12}]});
  nomatch({a: {b: 12}}, {a: [[{b: 12}]]});
  match({a: {b: 12}}, {a: [{b: 11}, {b: 12}, {b: 13}]});
  nomatch({a: {b: 12}}, {a: [{b: 11}, {b: 12, c: 20}, {b: 13}]});
  nomatch({a: {b: 12, c: 20}}, {a: [{b: 11}, {b: 12}, {c: 20}]});
  match({a: {b: 12, c: 20}}, {a: [{b: 11}, {b: 12, c: 20}, {b: 13}]});

  // null
  match({a: null}, {a: null});
  match({a: null}, {b: 12});
  nomatch({a: null}, {a: 12});
  match({a: null}, {a: [1, 2, null, 3]}); // tested on mongodb
  nomatch({a: null}, {a: [1, 2, {}, 3]}); // tested on mongodb

  // order comparisons: $lt, $gt, $lte, $gte
  match({a: {$lt: 10}}, {a: 9});
  nomatch({a: {$lt: 10}}, {a: 10});
  nomatch({a: {$lt: 10}}, {a: 11});

  match({a: {$gt: 10}}, {a: 11});
  nomatch({a: {$gt: 10}}, {a: 10});
  nomatch({a: {$gt: 10}}, {a: 9});

  match({a: {$lte: 10}}, {a: 9});
  match({a: {$lte: 10}}, {a: 10});
  nomatch({a: {$lte: 10}}, {a: 11});

  match({a: {$gte: 10}}, {a: 11});
  match({a: {$gte: 10}}, {a: 10});
  nomatch({a: {$gte: 10}}, {a: 9});

  match({a: {$lt: 10}}, {a: [11, 9, 12]});
  nomatch({a: {$lt: 10}}, {a: [11, 12]});

  // (there's a full suite of ordering test elsewhere)
  match({a: {$lt: "null"}}, {a: null}); // tested against mongodb
  match({a: {$lt: {x: [2, 3, 4]}}}, {a: {x: [1, 3, 4]}});
  match({a: {$gt: {x: [2, 3, 4]}}}, {a: {x: [3, 3, 4]}});
  nomatch({a: {$gt: {x: [2, 3, 4]}}}, {a: {x: [1, 3, 4]}});
  nomatch({a: {$gt: {x: [2, 3, 4]}}}, {a: {x: [2, 3, 4]}});
  nomatch({a: {$lt: {x: [2, 3, 4]}}}, {a: {x: [2, 3, 4]}});
  match({a: {$gte: {x: [2, 3, 4]}}}, {a: {x: [2, 3, 4]}});
  match({a: {$lte: {x: [2, 3, 4]}}}, {a: {x: [2, 3, 4]}});

  nomatch({a: {$gt: [2, 3]}}, {a: [1, 2]}); // tested against mongodb

  // composition of two qualifiers
  nomatch({a: {$lt: 11, $gt: 9}}, {a: 8});
  nomatch({a: {$lt: 11, $gt: 9}}, {a: 9});
  match({a: {$lt: 11, $gt: 9}}, {a: 10});
  nomatch({a: {$lt: 11, $gt: 9}}, {a: 11});
  nomatch({a: {$lt: 11, $gt: 9}}, {a: 12});

  match({a: {$lt: 11, $gt: 9}}, {a: [8, 9, 10, 11, 12]});
  match({a: {$lt: 11, $gt: 9}}, {a: [8, 9, 11, 12]}); // tested against mongodb

  // $all
  match({a: {$all: [1, 2]}}, {a: [1, 2]});
  nomatch({a: {$all: [1, 2, 3]}}, {a: [1, 2]});
  match({a: {$all: [1, 2]}}, {a: [3, 2, 1]});
  match({a: {$all: [1, "x"]}}, {a: [3, "x", 1]});
  nomatch({a: {$all: ['2']}}, {a: 2});
  nomatch({a: {$all: [2]}}, {a: '2'});
  match({a: {$all: [[1, 2], [1, 3]]}}, {a: [[1, 3], [1, 2], [1, 4]]});
  nomatch({a: {$all: [[1, 2], [1, 3]]}}, {a: [[1, 4], [1, 2], [1, 4]]});
  match({a: {$all: [2, 2]}}, {a: [2]}); // tested against mongodb
  nomatch({a: {$all: [2, 3]}}, {a: [2, 2]});

  nomatch({a: {$all: [1, 2]}}, {a: [[1, 2]]}); // tested against mongodb

  // $exists
  match({a: {$exists: true}}, {a: 12});
  nomatch({a: {$exists: true}}, {b: 12});
  nomatch({a: {$exists: false}}, {a: 12});
  match({a: {$exists: false}}, {b: 12});

  match({a: {$exists: true}}, {a: []});
  nomatch({a: {$exists: true}}, {b: []});
  nomatch({a: {$exists: false}}, {a: []});
  match({a: {$exists: false}}, {b: []});

  match({a: {$exists: true}}, {a: [1]});
  nomatch({a: {$exists: true}}, {b: [1]});
  nomatch({a: {$exists: false}}, {a: [1]});
  match({a: {$exists: false}}, {b: [1]});

  // $mod
  match({a: {$mod: [10, 1]}}, {a: 11});
  nomatch({a: {$mod: [10, 1]}}, {a: 12});
  match({a: {$mod: [10, 1]}}, {a: [10, 11, 12]});
  nomatch({a: {$mod: [10, 1]}}, {a: [10, 12]});

  // $ne
  match({a: {$ne: 1}}, {a: 2});
  nomatch({a: {$ne: 2}}, {a: 2});
  match({a: {$ne: [1]}}, {a: [2]});

  nomatch({a: {$ne: [1, 2]}}, {a: [1, 2]}); // all tested against mongodb
  nomatch({a: {$ne: 1}}, {a: [1, 2]});
  nomatch({a: {$ne: 2}}, {a: [1, 2]});
  match({a: {$ne: 3}}, {a: [1, 2]});

  nomatch({a: {$ne: {x: 1}}}, {a: {x: 1}});
  match({a: {$ne: {x: 1}}}, {a: {x: 2}});
  match({a: {$ne: {x: 1}}}, {a: {x: 1, y: 2}});

  // $in
  match({a: {$in: [1, 2, 3]}}, {a: 2});
  nomatch({a: {$in: [1, 2, 3]}}, {a: 4});
  match({a: {$in: [[1], [2], [3]]}}, {a: [2]});
  nomatch({a: {$in: [[1], [2], [3]]}}, {a: [4]});
  match({a: {$in: [{b: 1}, {b: 2}, {b: 3}]}}, {a: {b: 2}});
  nomatch({a: {$in: [{b: 1}, {b: 2}, {b: 3}]}}, {a: {b: 4}});

  match({a: {$in: [1, 2, 3]}}, {a: [2]}); // tested against mongodb
  match({a: {$in: [{x: 1}, {x: 2}, {x: 3}]}}, {a: [{x: 2}]});
  match({a: {$in: [1, 2, 3]}}, {a: [4, 2]});
  nomatch({a: {$in: [1, 2, 3]}}, {a: [4]});

  // $nin
  nomatch({a: {$nin: [1, 2, 3]}}, {a: 2});
  match({a: {$nin: [1, 2, 3]}}, {a: 4});
  nomatch({a: {$nin: [[1], [2], [3]]}}, {a: [2]});
  match({a: {$nin: [[1], [2], [3]]}}, {a: [4]});
  nomatch({a: {$nin: [{b: 1}, {b: 2}, {b: 3}]}}, {a: {b: 2}});
  match({a: {$nin: [{b: 1}, {b: 2}, {b: 3}]}}, {a: {b: 4}});

  nomatch({a: {$nin: [1, 2, 3]}}, {a: [2]}); // tested against mongodb
  nomatch({a: {$nin: [{x: 1}, {x: 2}, {x: 3}]}}, {a: [{x: 2}]});
  nomatch({a: {$nin: [1, 2, 3]}}, {a: [4, 2]});
  match({a: {$nin: [1, 2, 3]}}, {a: [4]});

  // $size
  match({a: {$size: 0}}, {a: []});
  match({a: {$size: 1}}, {a: [2]});
  match({a: {$size: 2}}, {a: [2, 2]});
  nomatch({a: {$size: 0}}, {a: [2]});
  nomatch({a: {$size: 1}}, {a: []});
  nomatch({a: {$size: 1}}, {a: [2, 2]});
  nomatch({a: {$size: 0}}, {a: "2"});
  nomatch({a: {$size: 1}}, {a: "2"});
  nomatch({a: {$size: 2}}, {a: "2"});

  nomatch({a: {$size: 2}}, {a: [[2,2]]}); // tested against mongodb

  // $type
  match({a: {$type: 1}}, {a: 1.1});
  match({a: {$type: 1}}, {a: 1});
  nomatch({a: {$type: 1}}, {a: "1"});
  match({a: {$type: 2}}, {a: "1"});
  nomatch({a: {$type: 2}}, {a: 1});
  match({a: {$type: 3}}, {a: {}});
  match({a: {$type: 3}}, {a: {b: 2}});
  nomatch({a: {$type: 3}}, {a: []});
  nomatch({a: {$type: 3}}, {a: [1]});
  nomatch({a: {$type: 3}}, {a: null});
  match({a: {$type: 8}}, {a: true});
  match({a: {$type: 8}}, {a: false});
  nomatch({a: {$type: 8}}, {a: "true"});
  nomatch({a: {$type: 8}}, {a: 0});
  nomatch({a: {$type: 8}}, {a: null});
  nomatch({a: {$type: 8}}, {a: ''});
  nomatch({a: {$type: 8}}, {});
  match({a: {$type: 10}}, {a: null});
  nomatch({a: {$type: 10}}, {a: false});
  nomatch({a: {$type: 10}}, {a: ''});
  nomatch({a: {$type: 10}}, {a: 0});
  nomatch({a: {$type: 10}}, {});
  match({a: {$type: 11}}, {a: /x/});
  nomatch({a: {$type: 11}}, {a: 'x'});
  nomatch({a: {$type: 11}}, {});

  nomatch({a: {$type: 4}}, {a: []});
  nomatch({a: {$type: 4}}, {a: [1]}); // tested against mongodb
  match({a: {$type: 1}}, {a: [1]});
  nomatch({a: {$type: 2}}, {a: [1]});
  match({a: {$type: 1}}, {a: ["1", 1]});
  match({a: {$type: 2}}, {a: ["1", 1]});
  nomatch({a: {$type: 3}}, {a: ["1", 1]});
  nomatch({a: {$type: 4}}, {a: ["1", 1]});
  nomatch({a: {$type: 1}}, {a: ["1", []]});
  match({a: {$type: 2}}, {a: ["1", []]});
  match({a: {$type: 4}}, {a: ["1", []]}); // tested against mongodb

  // regular expressions
  match({a: /a/}, {a: 'cat'});
  nomatch({a: /a/}, {a: 'cut'});
  nomatch({a: /a/}, {a: 'CAT'});
  match({a: /a/i}, {a: 'CAT'});
  match({a: {$regex: /a/}}, {a: 'cat'});
  nomatch({a: {$regex: /a/}}, {a: 'cut'});
  nomatch({a: {$regex: /a/}}, {a: 'CAT'});
  match({a: {$regex: /a/i}}, {a: 'CAT'});
  match({a: {$regex: /a/, $options: 'i'}}, {a: 'CAT'}); // tested
  match({a: {$regex: /a/i, $options: 'i'}}, {a: 'CAT'}); // tested
  nomatch({a: {$regex: /a/i, $options: ''}}, {a: 'CAT'}); // tested
  match({a: {$regex: 'a'}}, {a: 'cat'});
  nomatch({a: {$regex: 'a'}}, {a: 'cut'});
  nomatch({a: {$regex: 'a'}}, {a: 'CAT'});
  match({a: {$regex: 'a', $options: 'i'}}, {a: 'CAT'});

  match({a: {$options: 'i'}}, {a: 12});
  match({b: {$options: 'i'}}, {a: 12});

  match({a: /a/}, {a: ['dog', 'cat']});
  nomatch({a: /a/}, {a: ['dog', 'puppy']});

  assertThrows(function () {
    match({a: {$regex: /a/, $options: 'x'}}, {a: 'cat'});
  });
  assertThrows(function () {
    match({a: {$regex: /a/, $options: 's'}}, {a: 'cat'});
  });

  // $not
  match({x: {$not: {$gt: 7}}}, {x: 6});
  nomatch({x: {$not: {$gt: 7}}}, {x: 8});
  match({x: {$not: {$lt: 10, $gt: 7}}}, {x: 11});
  nomatch({x: {$not: {$lt: 10, $gt: 7}}}, {x: 9});
  match({x: {$not: {$lt: 10, $gt: 7}}}, {x: 6});

  match({x: {$not: {$gt: 7}}}, {x: [2, 3, 4]});
  nomatch({x: {$not: {$gt: 7}}}, {x: [2, 3, 4, 10]});

  match({x: {$not: /a/}}, {x: "dog"});
  nomatch({x: {$not: /a/}}, {x: "cat"});
  match({x: {$not: /a/}}, {x: ["dog", "puppy"]});
  nomatch({x: {$not: /a/}}, {x: ["kitten", "cat"]})

  // still needs tests:
  // - $or, $and, $nor, $where
  // - $elemMatch
  // - dotted keypaths
  // - people.2.name
  // - non-scalar arguments to $gt, $lt, etc
};

// assert that f is a strcmp-style comparison function that puts
// 'values' in the provided order
var assert_ordering = function (f, values) {
  for (var i = 0; i < values.length; i++) {
    var x = f(values[i], values[i]);
    if (x !== 0) {
      console.log("value doesn't order as equal to itself");
      console.log("  value: " + JSON.stringify(values[i]));
      console.log("  should be zero, but got: " + JSON.stringify(x));
      debugger;
      throw new TestFailure("value doesn't order as equal to itself");
    }
    if (i + 1 < values.length) {
      var less = values[i];
      var more = values[i + 1];
      var x = f(less, more);
      if (!(x < 0)) {
        console.log("ordering test failed");
        console.log("  first arg: " + JSON.stringify(less));
        console.log("  second arg: " + JSON.stringify(more));
        console.log("  should be negative, but got: " + JSON.stringify(x));
        debugger;
        throw new TestFailure("ordering test failed");
      }
      x = f(more, less);
      if (!(x > 0)) {
        console.log("ordering test failed");
        console.log("  first arg: " + JSON.stringify(less));
        console.log("  second arg: " + JSON.stringify(more));
        console.log("  should be positive, but got: " + JSON.stringify(x));
        debugger;
        throw new TestFailure("ordering test failed");
      }
    }
  }
}

test_ordering = function () {
  // value ordering
  assert_ordering(Collection._f._cmp, [
    null,
    1, 2.2, 3,
    "03", "1", "11", "2", "a", "aaa",
    {}, {a: 2}, {a: 3}, {a: 3, b: 4}, {b: 4}, {b: 4, a: 3},
    {b: {}}, {b: [1, 2, 3]}, {b: [1, 2, 4]},
    [], [1, 2], [1, 2, 3], [1, 2, 4], [1, 2, "4"], [1, 2, [4]],
    false, true
  ]);

  // document ordering under a sort specification
  var test = function (sorts, docs) {
    _.each(sorts, function (sort) {
      assert_ordering(Collection._compileSort(sort), docs);
    });
  };

  test([{"a" : 1}, ["a"], [["a", "asc"]]],
       [{c: 1}, {a: 1}, {a: {}}, {a: []}, {a: true}])
  test([{"a" : -1}, [["a", "desc"]]],
       [{a: true}, {a: []}, {a: {}}, {a: 1}, {c: 1}]);

  test([{"a" : 1, "b": -1}, ["a", ["b", "desc"]],
        [["a", "asc"], ["b", "desc"]]],
       [{c: 1}, {a: 1, b: 3}, {a: 1, b: 2}, {a: 2, b: 0}]);

  test([{"a" : 1, "b": 1}, ["a", "b"],
        [["a", "asc"], ["b", "asc"]]],
       [{c: 1}, {a: 1, b: 2}, {a: 1, b: 3}, {a: 2, b: 0}]);

  assertThrows(function () {
    Collection._compileSort("a");
  });

  assertThrows(function () {
    Collection._compileSort(123);
  });

  assert(0, Collection._compileSort({})({a:1}, {a:2}));
};

test_sort = function () {
  var c = new Collection();
  for (var i = 0; i < 50; i++)
    for (var j = 0; j < 2; j++)
      c.insert({a: i, b: j, _id: i + "_" + j});

  assert([
    {a: 11, b: 1, _id: "11_1"},
    {a: 12, b: 1, _id: "12_1"},
    {a: 13, b: 1, _id: "13_1"},
    {a: 14, b: 1, _id: "14_1"},
    {a: 15, b: 1, _id: "15_1"}],
         c.find({a: {$gt: 10}}, {sort: {b: -1, a: 1}, limit: 5}));
  assert([
    {a: 14, b: 1, _id: "14_1"},
    {a: 15, b: 1, _id: "15_1"},
    {a: 16, b: 1, _id: "16_1"},
    {a: 17, b: 1, _id: "17_1"},
    {a: 18, b: 1, _id: "18_1"}],
         c.find({a: {$gt: 10}}, {sort: {b: -1, a: 1}, skip: 3, limit: 5}));
  assert([
    {a: 45, b: 1, _id: "45_1"},
    {a: 45, b: 0, _id: "45_0"},
    {a: 46, b: 1, _id: "46_1"},
    {a: 46, b: 0, _id: "46_0"},
    {a: 47, b: 1, _id: "47_1"}],
         c.find({a: {$gte: 20}}, {sort: {a: 1, b: -1}, skip: 50, limit: 5}));
};

test_modify = function () {
  var test = function (doc, mod, result) {
    var copy = Collection._deepcopy(doc);
    Collection._modify(copy, mod);
    if (!Collection._f._equal(copy, result)) {
      console.log("modifier test failed");
      console.log("  input doc: " + JSON.stringify(doc));
      console.log("  modifier: " + JSON.stringify(mod));
      console.log("  expected: " + JSON.stringify(result));
      console.log("  actual: " + JSON.stringify(copy));
      debugger;
      throw new TestFailure("modifier test failed");
    }
  };
  var exception = function (doc, mod) {
    var caught = true;
    try {
      Collection._modify(Collection._deepcopy(doc), mod);
    } catch (e) {
      caught = true;
    }
    if (!caught) {
      console.log("modifier should have raised exception");
      console.log("  input doc: " + JSON.stringify(doc));
      console.log("  modifier: " + JSON.stringify(mod));
      debugger;
      throw new TestFailure("modifier should have raised exception");
    }
  };

  // document replacement
  test({}, {}, {});
  test({a: 12}, {}, {}); // tested against mongodb
  test({a: 12}, {a: 13}, {a:13});
  test({a: 12, b: 99}, {a: 13}, {a:13});
  exception({a: 12}, {a: 13, $set: {b: 13}});
  exception({a: 12}, {$set: {b: 13}, a: 13});

  // keys
  test({}, {$set: {'a': 12}}, {a: 12});
  test({}, {$set: {'a.b': 12}}, {a: {b: 12}});
  test({}, {$set: {'a.b.c': 12}}, {a: {b: {c: 12}}});
  test({a: {d: 99}}, {$set: {'a.b.c': 12}}, {a: {d: 99, b: {c: 12}}});
  test({}, {$set: {'a.b.3.c': 12}}, {a: {b: {3: {c: 12}}}});
  test({a: {b: []}}, {$set: {'a.b.3.c': 12}}, {
    a: {b: [null, null, null, {c: 12}]}});
  exception({a: [null, null, null]}, {$set: {'a.1.b': 12}});
  exception({a: [null, 1, null]}, {$set: {'a.1.b': 12}});
  exception({a: [null, "x", null]}, {$set: {'a.1.b': 12}});
  exception({a: [null, [], null]}, {$set: {'a.1.b': 12}});
  test({a: [null, null, null]}, {$set: {'a.3.b': 12}}, {
    a: [null, null, null, {b: 12}]});
  exception({a: []}, {$set: {'a.b': 12}});
  exception({a: 12}, {$set: {'a.b': 99}}); // tested on mongo
  exception({a: 'x'}, {$set: {'a.b': 99}});
  exception({a: true}, {$set: {'a.b': 99}});
  exception({a: null}, {$set: {'a.b': 99}});
  test({a: {}}, {$set: {'a.3': 12}}, {a: {'3': 12}});
  test({a: []}, {$set: {'a.3': 12}}, {a: [null, null, null, 12]});
  test({}, {$set: {'': 12}}, {'': 12}); // tested on mongo
  exception({}, {$set: {'.': 12}}); // tested on mongo
  test({}, {$set: {'. ': 12}}, {'': {' ': 12}}); // tested on mongo
  test({}, {$inc: {'... ': 12}}, {'': {'': {'': {' ': 12}}}}); // tested
  test({}, {$set: {'a..b': 12}}, {a: {'': {b: 12}}});
  test({a: [1,2,3]}, {$set: {'a.01': 99}}, {a: [1, 99, 3]});
  test({a: [1,{a: 98},3]}, {$set: {'a.01.b': 99}}, {a: [1,{a:98, b: 99},3]});
  test({}, {$set: {'2.a.b': 12}}, {'2': {'a': {'b': 12}}}); // tested
  test({x: []}, {$set: {'x.2..a': 99}}, {x: [null, null, {'': {a: 99}}]});
  test({x: [null, null]}, {$set: {'x.2.a': 1}}, {x: [null, null, {a: 1}]});
  exception({x: [null, null]}, {$set: {'x.1.a': 1}});

  // $inc
  test({a: 1, b: 2}, {$inc: {a: 10}}, {a: 11, b: 2});
  test({a: 1, b: 2}, {$inc: {c: 10}}, {a: 1, b: 2, c: 10});
  exception({a: 1}, {$inc: {a: '10'}});
  exception({a: 1}, {$inc: {a: true}});
  exception({a: 1}, {$inc: {a: [10]}});
  exception({a: '1'}, {$inc: {a: 10}});
  exception({a: [1]}, {$inc: {a: 10}});
  exception({a: {}}, {$inc: {a: 10}});
  exception({a: false}, {$inc: {a: 10}});
  exception({a: null}, {$inc: {a: 10}});
  test({a: [1, 2]}, {$inc: {'a.1': 10}}, {a: [1, 12]});
  test({a: [1, 2]}, {$inc: {'a.2': 10}}, {a: [1, 2, 10]});
  test({a: [1, 2]}, {$inc: {'a.3': 10}}, {a: [1, 2, null, 10]});
  test({a: {b: 2}}, {$inc: {'a.b': 10}}, {a: {b: 12}});
  test({a: {b: 2}}, {$inc: {'a.c': 10}}, {a: {b: 2, c: 10}});

  // $set
  test({a: 1, b: 2}, {$set: {a: 10}}, {a: 10, b: 2});
  test({a: 1, b: 2}, {$set: {c: 10}}, {a: 1, b: 2, c: 10});
  test({a: 1, b: 2}, {$set: {a: {c: 10}}}, {a: {c: 10}, b: 2});
  test({a: [1, 2], b: 2}, {$set: {a: [3, 4]}}, {a: [3, 4], b: 2});
  test({a: [1, 2, 3], b: 2}, {$set: {'a.1': [3, 4]}}, {a: [1, [3, 4], 3], b:2});
  test({a: [1], b: 2}, {$set: {'a.1': 9}}, {a: [1, 9], b: 2});
  test({a: [1], b: 2}, {$set: {'a.2': 9}}, {a: [1, null, 9], b: 2});
  test({a: {b: 1}}, {$set: {'a.c': 9}}, {a: {b: 1, c: 9}});

  // $unset
  test({}, {$unset: {a: 1}}, {});
  test({a: 1}, {$unset: {a: 1}}, {});
  test({a: 1, b: 2}, {$unset: {a: 1}}, {b: 2});
  test({a: 1, b: 2}, {$unset: {a: 0}}, {b: 2});
  test({a: 1, b: 2}, {$unset: {a: false}}, {b: 2});
  test({a: 1, b: 2}, {$unset: {a: null}}, {b: 2});
  test({a: 1, b: 2}, {$unset: {a: [1]}}, {b: 2});
  test({a: 1, b: 2}, {$unset: {a: {}}}, {b: 2});
  test({a: {b: 2, c: 3}}, {$unset: {'a.b': 1}}, {a: {c: 3}});
  test({a: [1, 2, 3]}, {$unset: {'a.1': 1}}, {a: [1, null, 3]}); // tested
  test({a: [1, 2, 3]}, {$unset: {'a.2': 1}}, {a: [1, 2, null]}); // tested
  test({a: [1, 2, 3]}, {$unset: {'a.x': 1}}, {a: [1, 2, 3]}); // tested
  test({a: {b: 1}}, {$unset: {'a.b.c.d': 1}}, {a: {b: 1}});
  test({a: {b: 1}}, {$unset: {'a.x.c.d': 1}}, {a: {b: 1}});
  test({a: {b: {c: 1}}}, {$unset: {'a.b.c': 1}}, {a: {b: {}}});

  // $push
  test({}, {$push: {a: 1}}, {a: [1]});
  test({a: []}, {$push: {a: 1}}, {a: [1]});
  test({a: [1]}, {$push: {a: 2}}, {a: [1, 2]});
  exception({a: true}, {$push: {a: 1}});
  test({a: [1]}, {$push: {a: [2]}}, {a: [1, [2]]});
  test({a: []}, {$push: {'a.1': 99}}, {a: [null, [99]]}); // tested
  test({a: {}}, {$push: {'a.x': 99}}, {a: {x: [99]}});

  // $pushAll
  test({}, {$pushAll: {a: [1]}}, {a: [1]});
  test({a: []}, {$pushAll: {a: [1]}}, {a: [1]});
  test({a: [1]}, {$pushAll: {a: [2]}}, {a: [1, 2]});
  test({}, {$pushAll: {a: [1, 2]}}, {a: [1, 2]});
  test({a: []}, {$pushAll: {a: [1, 2]}}, {a: [1, 2]});
  test({a: [1]}, {$pushAll: {a: [2, 3]}}, {a: [1, 2, 3]});
  test({}, {$pushAll: {a: []}}, {a: []});
  test({a: []}, {$pushAll: {a: []}}, {a: []});
  test({a: [1]}, {$pushAll: {a: []}}, {a: [1]});
  exception({a: true}, {$pushAll: {a: [1]}});
  exception({a: []}, {$pushAll: {a: 1}});
  test({a: []}, {$pushAll: {'a.1': [99]}}, {a: [null, [99]]});
  test({a: []}, {$pushAll: {'a.1': []}}, {a: [null, []]});
  test({a: {}}, {$pushAll: {'a.x': [99]}}, {a: {x: [99]}});
  test({a: {}}, {$pushAll: {'a.x': []}}, {a: {x: []}});

  // $addToSet
  test({}, {$addToSet: {a: 1}}, {a: [1]});
  test({a: []}, {$addToSet: {a: 1}}, {a: [1]});
  test({a: [1]}, {$addToSet: {a: 2}}, {a: [1, 2]});
  test({a: [1, 2]}, {$addToSet: {a: 1}}, {a: [1, 2]});
  test({a: [1, 2]}, {$addToSet: {a: 2}}, {a: [1, 2]});
  test({a: [1, 2]}, {$addToSet: {a: 3}}, {a: [1, 2, 3]});
  exception({a: true}, {$addToSet: {a: 1}});
  test({a: [1]}, {$addToSet: {a: [2]}}, {a: [1, [2]]});
  test({}, {$addToSet: {a: {x: 1}}}, {a: [{x: 1}]});
  test({a: [{x: 1}]}, {$addToSet: {a: {x: 1}}}, {a: [{x: 1}]});
  test({a: [{x: 1}]}, {$addToSet: {a: {x: 2}}}, {a: [{x: 1}, {x: 2}]});
  test({a: [{x: 1, y: 2}]}, {$addToSet: {a: {x: 1, y: 2}}},
       {a: [{x: 1, y: 2}]});
  test({a: [{x: 1, y: 2}]}, {$addToSet: {a: {y: 2, x: 1}}},
       {a: [{x: 1, y: 2}, {y: 2, x: 1}]});
  test({a: [1, 2]}, {$addToSet: {a: {$each: [3, 1, 4]}}}, {a: [1, 2, 3, 4]});
  test({a: [1, 2]}, {$addToSet: {a: {$each: [3, 1, 4], b: 12}}},
       {a: [1, 2, 3, 4]}); // tested
  test({a: [1, 2]}, {$addToSet: {a: {b: 12, $each: [3, 1, 4]}}},
       {a: [1, 2, {b: 12, $each: [3, 1, 4]}]}); // tested
  test({a: []}, {$addToSet: {'a.1': 99}}, {a: [null, [99]]});
  test({a: {}}, {$addToSet: {'a.x': 99}}, {a: {x: [99]}});

  // $pop
  test({}, {$pop: {a: 1}}, {}); // tested
  test({}, {$pop: {a: -1}}, {}); // tested
  test({a: []}, {$pop: {a: 1}}, {a: []});
  test({a: []}, {$pop: {a: -1}}, {a: []});
  test({a: [1, 2, 3]}, {$pop: {a: 1}}, {a: [1, 2]});
  test({a: [1, 2, 3]}, {$pop: {a: 10}}, {a: [1, 2]});
  test({a: [1, 2, 3]}, {$pop: {a: .001}}, {a: [1, 2]});
  test({a: [1, 2, 3]}, {$pop: {a: 0}}, {a: [1, 2]});
  test({a: [1, 2, 3]}, {$pop: {a: "stuff"}}, {a: [1, 2]});
  test({a: [1, 2, 3]}, {$pop: {a: -1}}, {a: [2, 3]});
  test({a: [1, 2, 3]}, {$pop: {a: -10}}, {a: [2, 3]});
  test({a: [1, 2, 3]}, {$pop: {a: -.001}}, {a: [2, 3]});
  exception({a: true}, {$pop: {a: 1}});
  exception({a: true}, {$pop: {a: -1}});
  test({a: []}, {$pop: {'a.1': 1}}, {a: []}); // tested
  test({a: [1, [2, 3], 4]}, {$pop: {'a.1': 1}}, {a: [1, [2], 4]});
  test({a: {}}, {$pop: {'a.x': 1}}, {a: {}}); // tested
  test({a: {x: [2, 3]}}, {$pop: {'a.x': 1}}, {a: {x: [2]}});

  // $pull
  test({}, {$pull: {a: 1}}, {});
  test({}, {$pull: {'a.x': 1}}, {});
  test({a: {}}, {$pull: {'a.x': 1}}, {a: {}});
  exception({a: true}, {$pull: {a: 1}});
  test({a: [2, 1, 2]}, {$pull: {a: 1}}, {a: [2, 2]});
  test({a: [2, 1, 2]}, {$pull: {a: 2}}, {a: [1]});
  test({a: [2, 1, 2]}, {$pull: {a: 3}}, {a: [2, 1, 2]});
  test({a: []}, {$pull: {a: 3}}, {a: []});
  test({a: [[2], [2, 1], [3]]}, {$pull: {a: [2, 1]}}, {a: [[2], [3]]}); //tested
  test({a: [{b: 1, c: 2}, {b: 2, c: 2}]}, {$pull: {a: {b: 1}}},
       {a: [{b: 2, c: 2}]});
  test({a: [{b: 1, c: 2}, {b: 2, c: 2}]}, {$pull: {a: {c: 2}}},
       {a: []});
  // XXX implement this functionality!
  // probably same refactoring as $elemMatch?
  // test({a: [1, 2, 3, 4]}, {$pull: {$gt: 2}}, {a: [1,2]}); fails!

  // $pullAll
  test({}, {$pullAll: {a: [1]}}, {});
  test({a: [1, 2, 3]}, {$pullAll: {a: []}}, {a: [1, 2, 3]});
  test({a: [1, 2, 3]}, {$pullAll: {a: [2]}}, {a: [1, 3]});
  test({a: [1, 2, 3]}, {$pullAll: {a: [2, 1]}}, {a: [3]});
  test({a: [1, 2, 3]}, {$pullAll: {a: [1, 2]}}, {a: [3]});
  test({}, {$pullAll: {'a.b.c': [2]}}, {});
  exception({a: true}, {$pullAll: {a: [1]}});
  exception({a: [1, 2, 3]}, {$pullAll: {a: 1}});
  test({x: [{a: 1}, {a: 1, b: 2}]}, {$pullAll: {x: [{a: 1}]}},
       {x: [{a: 1, b: 2}]});

  // $rename
  test({}, {$rename: {a: 'b'}}, {});
  test({a: [12]}, {$rename: {a: 'b'}}, {b: [12]});
  test({a: {b: 12}}, {$rename: {a: 'c'}}, {c: {b: 12}});
  test({a: {b: 12}}, {$rename: {'a.b': 'a.c'}}, {a: {c: 12}});
  test({a: {b: 12}}, {$rename: {'a.b': 'x'}}, {a: {}, x: 12}); // tested
  test({a: {b: 12}}, {$rename: {'a.b': 'q.r'}}, {a: {}, q: {r: 12}});
  test({a: {b: 12}}, {$rename: {'a.b': 'q.2.r'}}, {a: {}, q: {2: {r: 12}}});
  test({a: {b: 12}, q: {}}, {$rename: {'a.b': 'q.2.r'}},
       {a: {}, q: {2: {r: 12}}});
  exception({a: {b: 12}, q: []}, {$rename: {'a.b': 'q.2'}}); // tested
  exception({a: {b: 12}, q: []}, {$rename: {'a.b': 'q.2.r'}}); // tested
  exception({a: {b: 12}, q: []}, {$rename: {'q.1': 'x'}}); // tested
  exception({a: {b: 12}, q: []}, {$rename: {'q.1.j': 'x'}}); // tested
  exception({}, {$rename: {'a': 'a'}});
  exception({}, {$rename: {'a.b': 'a.b'}});
  test({a: 12, b: 13}, {$rename: {a: 'b'}}, {b: 12});

  // $bit
  // unimplemented

  // XXX test case sensitivity of modops
  // XXX for each (most) modop, test that it performs a deep copy
};

// XXX test update() (selecting docs, multi, upsert..)

test_livequery = function () {
  // XXX needs tests!
  // don't forget tests for stop, indexOf
};
