// assert that f is a strcmp-style comparison function that puts
// 'values' in the provided order
var assert_ordering = function (test, f, values) {
  for (var i = 0; i < values.length; i++) {
    var x = f(values[i], values[i]);
    if (x !== 0) {
      // XXX super janky
      test.fail({type: "minimongo-ordering",
                 message: "value doesn't order as equal to itself",
                 value: JSON.stringify(values[i]),
                 should_be_zero_but_got: JSON.stringify(x)});
    }
    if (i + 1 < values.length) {
      var less = values[i];
      var more = values[i + 1];
      var x = f(less, more);
      if (!(x < 0)) {
        // XXX super janky
        test.fail({type: "minimongo-ordering",
                   message: "ordering test failed",
                   first: JSON.stringify(less),
                   second: JSON.stringify(more),
                   should_be_negative_but_got: JSON.stringify(x)});
      }
      x = f(more, less);
      if (!(x > 0)) {
        // XXX super janky
        test.fail({type: "minimongo-ordering",
                   message: "ordering test failed",
                   first: JSON.stringify(less),
                   second: JSON.stringify(more),
                   should_be_positive_but_got: JSON.stringify(x)});
      }
    }
  }
};

var log_callbacks = function (operations) {
  return {
    added: function (obj, idx) {
      delete obj._id;
      operations.push(LocalCollection._deepcopy(['added', obj, idx]));
    },
    changed: function (obj, at, old_obj) {
      delete obj._id;
      delete old_obj._id;
      operations.push(LocalCollection._deepcopy(['changed', obj, at, old_obj]));
    },
    moved: function (obj, old_at, new_at) {
      delete obj._id;
      operations.push(LocalCollection._deepcopy(['moved', obj, old_at, new_at]));
    },
    removed: function (old_obj, at) {
      var id = old_obj._id;
      delete old_obj._id;
      operations.push(LocalCollection._deepcopy(['removed', id, at, old_obj]));
    }
  };
};

// XXX test shared structure in all MM entrypoints

_.each(['observe', '_observeUnordered'], function (observeMethod) {
  Tinytest.add("minimongo - basics (" + observeMethod + ")", function (test) {
    var c = new LocalCollection();

    c.insert({type: "kitten", name: "fluffy"});
    c.insert({type: "kitten", name: "snookums"});
    c.insert({type: "cryptographer", name: "alice"});
    c.insert({type: "cryptographer", name: "bob"});
    c.insert({type: "cryptographer", name: "cara"});
    test.equal(c.find().count(), 5);
    test.equal(c.find({type: "kitten"}).count(), 2);
    test.equal(c.find({type: "cryptographer"}).count(), 3);
    test.length(c.find({type: "kitten"}).fetch(), 2);
    test.length(c.find({type: "cryptographer"}).fetch(), 3);

    c.remove({name: "cara"});
    test.equal(c.find().count(), 4);
    test.equal(c.find({type: "kitten"}).count(), 2);
    test.equal(c.find({type: "cryptographer"}).count(), 2);
    test.length(c.find({type: "kitten"}).fetch(), 2);
    test.length(c.find({type: "cryptographer"}).fetch(), 2);

    c.update({name: "snookums"}, {$set: {type: "cryptographer"}});
    test.equal(c.find().count(), 4);
    test.equal(c.find({type: "kitten"}).count(), 1);
    test.equal(c.find({type: "cryptographer"}).count(), 3);
    test.length(c.find({type: "kitten"}).fetch(), 1);
    test.length(c.find({type: "cryptographer"}).fetch(), 3);

    c.remove(null);
    c.remove(false);
    c.remove(undefined);
    test.equal(c.find().count(), 4);

    c.remove({_id: null});
    c.remove({_id: false});
    c.remove({_id: undefined});
    c.remove();
    test.equal(c.find().count(), 4);

    c.remove({});
    test.equal(c.find().count(), 0);

    c.insert({_id: 1, name: "strawberry", tags: ["fruit", "red", "squishy"]});
    c.insert({_id: 2, name: "apple", tags: ["fruit", "red", "hard"]});
    c.insert({_id: 3, name: "rose", tags: ["flower", "red", "squishy"]});

    test.equal(c.find({tags: "flower"}).count(), 1);
    test.equal(c.find({tags: "fruit"}).count(), 2);
    test.equal(c.find({tags: "red"}).count(), 3);
    test.length(c.find({tags: "flower"}).fetch(), 1);
    test.length(c.find({tags: "fruit"}).fetch(), 2);
    test.length(c.find({tags: "red"}).fetch(), 3);

    test.equal(c.findOne(1).name, "strawberry");
    test.equal(c.findOne(2).name, "apple");
    test.equal(c.findOne(3).name, "rose");
    test.equal(c.findOne(4), undefined);
    test.equal(c.findOne("abc"), undefined);
    test.equal(c.findOne(undefined), undefined);

    test.equal(c.find(1).count(), 1);
    test.equal(c.find(4).count(), 0);
    test.equal(c.find("abc").count(), 0);
    test.equal(c.find(undefined).count(), 0);
    test.equal(c.find().count(), 3);

    // Regression test for #455.
    c.insert({foo: {bar: 'baz'}});
    test.equal(c.find({foo: {bam: 'baz'}}).count(), 0);
    test.equal(c.find({foo: {bar: 'baz'}}).count(), 1);

    // Duplicate ID.
    test.throws(function () { c.insert({_id: 1, name: "bla"}); });
    test.equal(c.find({_id: 1}).count(), 1);
    test.equal(c.findOne(1).name, "strawberry");

    var ev = "";
    var makecb = function (tag) {
      return {
        added: function (doc) { ev += "a" + tag + doc._id + "_"; },
        changed: function (doc) { ev += "c" + tag + doc._id + "_"; },
        removed: function (doc) { ev += "r" + tag + doc._id + "_"; }
      };
    };
    var expect = function (x) {
      test.equal(ev, x);
      ev = "";
    };
    // This should work equally well for ordered and unordered observations
    // (because the callbacks don't look at indices and there's no 'moved'
    // callback).
    var handle = c.find({tags: "flower"})[observeMethod](makecb('a'));
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
    handle.stop();
    // After calling stop, no more callbacks are called.
    c.insert({_id: 5, name: "iris", tags: ["flower"]});
    expect("");
  });
});

Tinytest.add("minimongo - cursors", function (test) {
  var c = new LocalCollection();
  var res;

  for (var i = 0; i < 20; i++)
    c.insert({i: i});

  var q = c.find();
  test.equal(q.count(), 20);

  // fetch
  res = q.fetch();
  test.length(res, 20);
  for (var i = 0; i < 20; i++)
    test.equal(res[i].i, i);
  // everything empty
  test.length(q.fetch(), 0);
  q.rewind();

  // forEach
  var count = 0;
  q.forEach(function (obj) {
    test.equal(obj.i, count++);
  });
  test.equal(count, 20);
  // everything empty
  test.length(q.fetch(), 0);
  q.rewind();

  // map
  res = q.map(function (obj) { return obj.i * 2; });
  test.length(res, 20);
  for (var i = 0; i < 20; i++)
    test.equal(res[i], i * 2);
  // everything empty
  test.length(q.fetch(), 0);

  // findOne (and no rewind first)
  test.equal(c.findOne({i: 0}).i, 0);
  test.equal(c.findOne({i: 1}).i, 1);
  var id = c.findOne({i: 2})._id;
  test.equal(c.findOne(id).i, 2);
});

Tinytest.add("minimongo - misc", function (test) {
  // deepcopy
  var a = {a: [1, 2, 3], b: "x", c: true, d: {x: 12, y: [12]},
           f: null, g: new Date()};
  var b = LocalCollection._deepcopy(a);
  // minimongo doesn't support Dates, so we *can't* test
  // LocalCollection._f._equal here! (Currently _equal considers all dates equal
  // on most browsers except IE7 where it considers all dates unequal.)
  test.equal(a, b);
  a.a.push(4);
  test.length(b.a, 3);
  a.c = false;
  test.isTrue(b.c);
  b.d.z = 15;
  a.d.z = 14;
  test.equal(b.d.z, 15);
  a.d.y.push(88);
  test.length(b.d.y, 1);
  test.equal(a.g, b.g);
  b.g.setDate(b.g.getDate() + 1);
  test.notEqual(a.g, b.g);

  a = {x: function () {}};
  b = LocalCollection._deepcopy(a);
  a.x.a = 14;
  test.equal(b.x.a, 14); // just to document current behavior
});

Tinytest.add("minimongo - selector_compiler", function (test) {
  var matches = function (should_match, selector, doc) {
    var does_match = LocalCollection._matches(selector, doc);
    if (does_match != should_match) {
      // XXX super janky
      test.fail({type: "minimongo-ordering",
                 message: "minimongo match failure: document " +
                 (should_match ? "should match, but doesn't" :
                  "shouldn't match, but does"),
                 selector: JSON.stringify(selector),
                 document: JSON.stringify(doc)
                });
    }
  };

  var match = _.bind(matches, null, true);
  var nomatch = _.bind(matches, null, false);

  // XXX blog post about what I learned while writing these tests (weird
  // mongo edge cases)

  // empty selectors
  match({}, {});
  match({}, {a: 12});

  // scalars
  match(1, {_id: 1, a: 'foo'});
  nomatch(1, {_id: 2, a: 'foo'});
  match('a', {_id: 'a', a: 'foo'});
  nomatch('a', {_id: 'b', a: 'foo'});

  // safety
  nomatch(undefined, {});
  nomatch(undefined, {_id: 'foo'});
  nomatch(false, {_id: 'foo'});
  nomatch(null, {_id: 'foo'});
  nomatch({_id: undefined}, {_id: 'foo'});
  nomatch({_id: false}, {_id: 'foo'});
  nomatch({_id: null}, {_id: 'foo'});

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
  nomatch({a: {$all: [1, 2]}}, {}); // tested against mongodb, field doesn't exist
  nomatch({a: {$all: [1, 2]}}, {a: {foo: 'bar'}}); // tested against mongodb, field is not an object

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

  test.throws(function () {
    match({a: {$regex: /a/, $options: 'x'}}, {a: 'cat'});
  });
  test.throws(function () {
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
  nomatch({x: {$not: /a/}}, {x: ["kitten", "cat"]});

  // dotted keypaths: bare values
  match({"a.b": 1}, {a: {b: 1}});
  nomatch({"a.b": 1}, {a: {b: 2}});
  match({"a.b": [1,2,3]}, {a: {b: [1,2,3]}});
  nomatch({"a.b": [1,2,3]}, {a: {b: [4]}});
  match({"a.b": /a/}, {a: {b: "cat"}});
  nomatch({"a.b": /a/}, {a: {b: "dog"}});

  // trying to access a dotted field that is undefined at some point
  // down the chain
  nomatch({"a.b": 1}, {x: 2});
  nomatch({"a.b.c": 1}, {a: {x: 2}});
  nomatch({"a.b.c": 1}, {a: {b: {x: 2}}});
  nomatch({"a.b.c": 1}, {a: {b: 1}});
  nomatch({"a.b.c": 1}, {a: {b: 0}});

  // dotted keypaths: literal objects
  match({"a.b": {c: 1}}, {a: {b: {c: 1}}});
  nomatch({"a.b": {c: 1}}, {a: {b: {c: 2}}});
  nomatch({"a.b": {c: 1}}, {a: {b: 2}});
  match({"a.b": {c: 1, d: 2}}, {a: {b: {c: 1, d: 2}}});
  nomatch({"a.b": {c: 1, d: 2}}, {a: {b: {c: 1, d: 1}}});
  nomatch({"a.b": {c: 1, d: 2}}, {a: {b: {d: 2}}});

  // dotted keypaths: $ operators
  match({"a.b": {$in: [1, 2, 3]}}, {a: {b: [2]}}); // tested against mongodb
  match({"a.b": {$in: [{x: 1}, {x: 2}, {x: 3}]}}, {a: {b: [{x: 2}]}});
  match({"a.b": {$in: [1, 2, 3]}}, {a: {b: [4, 2]}});
  nomatch({"a.b": {$in: [1, 2, 3]}}, {a: {b: [4]}});

  // XXX still needs tests:
  // - $or, $and, $nor, $where
  // - $elemMatch
  // - people.2.name
  // - non-scalar arguments to $gt, $lt, etc
});

Tinytest.add("minimongo - ordering", function (test) {
  // value ordering
  assert_ordering(test, LocalCollection._f._cmp, [
    null,
    1, 2.2, 3,
    "03", "1", "11", "2", "a", "aaa",
    {}, {a: 2}, {a: 3}, {a: 3, b: 4}, {b: 4}, {b: 4, a: 3},
    {b: {}}, {b: [1, 2, 3]}, {b: [1, 2, 4]},
    [], [1, 2], [1, 2, 3], [1, 2, 4], [1, 2, "4"], [1, 2, [4]],
    false, true
  ]);

  // document ordering under a sort specification
  var verify = function (sorts, docs) {
    _.each(sorts, function (sort) {
      assert_ordering(test, LocalCollection._compileSort(sort), docs);
    });
  };

  verify([{"a" : 1}, ["a"], [["a", "asc"]]],
         [{c: 1}, {a: 1}, {a: {}}, {a: []}, {a: true}]);
  verify([{"a" : -1}, [["a", "desc"]]],
         [{a: true}, {a: []}, {a: {}}, {a: 1}, {c: 1}]);

  verify([{"a" : 1, "b": -1}, ["a", ["b", "desc"]],
          [["a", "asc"], ["b", "desc"]]],
         [{c: 1}, {a: 1, b: 3}, {a: 1, b: 2}, {a: 2, b: 0}]);

  verify([{"a" : 1, "b": 1}, ["a", "b"],
          [["a", "asc"], ["b", "asc"]]],
         [{c: 1}, {a: 1, b: 2}, {a: 1, b: 3}, {a: 2, b: 0}]);

  test.throws(function () {
    LocalCollection._compileSort("a");
  });

  test.throws(function () {
    LocalCollection._compileSort(123);
  });

  test.equal(LocalCollection._compileSort({})({a:1}, {a:2}), 0);
});

Tinytest.add("minimongo - sort", function (test) {
  var c = new LocalCollection();
  for (var i = 0; i < 50; i++)
    for (var j = 0; j < 2; j++)
      c.insert({a: i, b: j, _id: i + "_" + j});

  test.equal(
    c.find({a: {$gt: 10}}, {sort: {b: -1, a: 1}, limit: 5}).fetch(), [
      {a: 11, b: 1, _id: "11_1"},
      {a: 12, b: 1, _id: "12_1"},
      {a: 13, b: 1, _id: "13_1"},
      {a: 14, b: 1, _id: "14_1"},
      {a: 15, b: 1, _id: "15_1"}]);

  test.equal(
    c.find({a: {$gt: 10}}, {sort: {b: -1, a: 1}, skip: 3, limit: 5}).fetch(), [
      {a: 14, b: 1, _id: "14_1"},
      {a: 15, b: 1, _id: "15_1"},
      {a: 16, b: 1, _id: "16_1"},
      {a: 17, b: 1, _id: "17_1"},
      {a: 18, b: 1, _id: "18_1"}]);

  test.equal(
    c.find({a: {$gte: 20}}, {sort: {a: 1, b: -1}, skip: 50, limit: 5}).fetch(), [
      {a: 45, b: 1, _id: "45_1"},
      {a: 45, b: 0, _id: "45_0"},
      {a: 46, b: 1, _id: "46_1"},
      {a: 46, b: 0, _id: "46_0"},
      {a: 47, b: 1, _id: "47_1"}]);
});

Tinytest.add("minimongo - modify", function (test) {
  var modify = function (doc, mod, result) {
    var copy = LocalCollection._deepcopy(doc);
    LocalCollection._modify(copy, mod);
    if (!LocalCollection._f._equal(copy, result)) {
      // XXX super janky
      test.fail({type: "minimongo-modifier",
                 message: "modifier test failure",
                 input_doc: JSON.stringify(doc),
                 modifier: JSON.stringify(mod),
                 expected: JSON.stringify(result),
                 actual: JSON.stringify(copy)
                });
    } else {
      test.ok();
    }
  };
  var exception = function (doc, mod) {
    test.throws(function () {
      LocalCollection._modify(LocalCollection._deepcopy(doc), mod);
    });
  };

  // document replacement
  modify({}, {}, {});
  modify({a: 12}, {}, {}); // tested against mongodb
  modify({a: 12}, {a: 13}, {a:13});
  modify({a: 12, b: 99}, {a: 13}, {a:13});
  exception({a: 12}, {a: 13, $set: {b: 13}});
  exception({a: 12}, {$set: {b: 13}, a: 13});

  // keys
  modify({}, {$set: {'a': 12}}, {a: 12});
  modify({}, {$set: {'a.b': 12}}, {a: {b: 12}});
  modify({}, {$set: {'a.b.c': 12}}, {a: {b: {c: 12}}});
  modify({a: {d: 99}}, {$set: {'a.b.c': 12}}, {a: {d: 99, b: {c: 12}}});
  modify({}, {$set: {'a.b.3.c': 12}}, {a: {b: {3: {c: 12}}}});
  modify({a: {b: []}}, {$set: {'a.b.3.c': 12}}, {
    a: {b: [null, null, null, {c: 12}]}});
  exception({a: [null, null, null]}, {$set: {'a.1.b': 12}});
  exception({a: [null, 1, null]}, {$set: {'a.1.b': 12}});
  exception({a: [null, "x", null]}, {$set: {'a.1.b': 12}});
  exception({a: [null, [], null]}, {$set: {'a.1.b': 12}});
  modify({a: [null, null, null]}, {$set: {'a.3.b': 12}}, {
    a: [null, null, null, {b: 12}]});
  exception({a: []}, {$set: {'a.b': 12}});
  test.expect_fail();
  exception({a: 12}, {$set: {'a.b': 99}}); // tested on mongo
  test.expect_fail();
  exception({a: 'x'}, {$set: {'a.b': 99}});
  test.expect_fail();
  exception({a: true}, {$set: {'a.b': 99}});
  test.expect_fail();
  exception({a: null}, {$set: {'a.b': 99}});
  modify({a: {}}, {$set: {'a.3': 12}}, {a: {'3': 12}});
  modify({a: []}, {$set: {'a.3': 12}}, {a: [null, null, null, 12]});
  modify({}, {$set: {'': 12}}, {'': 12}); // tested on mongo
  test.expect_fail();
  exception({}, {$set: {'.': 12}}); // tested on mongo
  modify({}, {$set: {'. ': 12}}, {'': {' ': 12}}); // tested on mongo
  modify({}, {$inc: {'... ': 12}}, {'': {'': {'': {' ': 12}}}}); // tested
  modify({}, {$set: {'a..b': 12}}, {a: {'': {b: 12}}});
  modify({a: [1,2,3]}, {$set: {'a.01': 99}}, {a: [1, 99, 3]});
  modify({a: [1,{a: 98},3]}, {$set: {'a.01.b': 99}}, {a: [1,{a:98, b: 99},3]});
  modify({}, {$set: {'2.a.b': 12}}, {'2': {'a': {'b': 12}}}); // tested
  modify({x: []}, {$set: {'x.2..a': 99}}, {x: [null, null, {'': {a: 99}}]});
  modify({x: [null, null]}, {$set: {'x.2.a': 1}}, {x: [null, null, {a: 1}]});
  exception({x: [null, null]}, {$set: {'x.1.a': 1}});

  // $inc
  modify({a: 1, b: 2}, {$inc: {a: 10}}, {a: 11, b: 2});
  modify({a: 1, b: 2}, {$inc: {c: 10}}, {a: 1, b: 2, c: 10});
  exception({a: 1}, {$inc: {a: '10'}});
  exception({a: 1}, {$inc: {a: true}});
  exception({a: 1}, {$inc: {a: [10]}});
  exception({a: '1'}, {$inc: {a: 10}});
  exception({a: [1]}, {$inc: {a: 10}});
  exception({a: {}}, {$inc: {a: 10}});
  exception({a: false}, {$inc: {a: 10}});
  exception({a: null}, {$inc: {a: 10}});
  modify({a: [1, 2]}, {$inc: {'a.1': 10}}, {a: [1, 12]});
  modify({a: [1, 2]}, {$inc: {'a.2': 10}}, {a: [1, 2, 10]});
  modify({a: [1, 2]}, {$inc: {'a.3': 10}}, {a: [1, 2, null, 10]});
  modify({a: {b: 2}}, {$inc: {'a.b': 10}}, {a: {b: 12}});
  modify({a: {b: 2}}, {$inc: {'a.c': 10}}, {a: {b: 2, c: 10}});

  // $set
  modify({a: 1, b: 2}, {$set: {a: 10}}, {a: 10, b: 2});
  modify({a: 1, b: 2}, {$set: {c: 10}}, {a: 1, b: 2, c: 10});
  modify({a: 1, b: 2}, {$set: {a: {c: 10}}}, {a: {c: 10}, b: 2});
  modify({a: [1, 2], b: 2}, {$set: {a: [3, 4]}}, {a: [3, 4], b: 2});
  modify({a: [1, 2, 3], b: 2}, {$set: {'a.1': [3, 4]}},
         {a: [1, [3, 4], 3], b:2});
  modify({a: [1], b: 2}, {$set: {'a.1': 9}}, {a: [1, 9], b: 2});
  modify({a: [1], b: 2}, {$set: {'a.2': 9}}, {a: [1, null, 9], b: 2});
  modify({a: {b: 1}}, {$set: {'a.c': 9}}, {a: {b: 1, c: 9}});

  // $unset
  modify({}, {$unset: {a: 1}}, {});
  modify({a: 1}, {$unset: {a: 1}}, {});
  modify({a: 1, b: 2}, {$unset: {a: 1}}, {b: 2});
  modify({a: 1, b: 2}, {$unset: {a: 0}}, {b: 2});
  modify({a: 1, b: 2}, {$unset: {a: false}}, {b: 2});
  modify({a: 1, b: 2}, {$unset: {a: null}}, {b: 2});
  modify({a: 1, b: 2}, {$unset: {a: [1]}}, {b: 2});
  modify({a: 1, b: 2}, {$unset: {a: {}}}, {b: 2});
  modify({a: {b: 2, c: 3}}, {$unset: {'a.b': 1}}, {a: {c: 3}});
  modify({a: [1, 2, 3]}, {$unset: {'a.1': 1}}, {a: [1, null, 3]}); // tested
  modify({a: [1, 2, 3]}, {$unset: {'a.2': 1}}, {a: [1, 2, null]}); // tested
  modify({a: [1, 2, 3]}, {$unset: {'a.x': 1}}, {a: [1, 2, 3]}); // tested
  modify({a: {b: 1}}, {$unset: {'a.b.c.d': 1}}, {a: {b: 1}});
  modify({a: {b: 1}}, {$unset: {'a.x.c.d': 1}}, {a: {b: 1}});
  modify({a: {b: {c: 1}}}, {$unset: {'a.b.c': 1}}, {a: {b: {}}});

  // $push
  modify({}, {$push: {a: 1}}, {a: [1]});
  modify({a: []}, {$push: {a: 1}}, {a: [1]});
  modify({a: [1]}, {$push: {a: 2}}, {a: [1, 2]});
  exception({a: true}, {$push: {a: 1}});
  modify({a: [1]}, {$push: {a: [2]}}, {a: [1, [2]]});
  modify({a: []}, {$push: {'a.1': 99}}, {a: [null, [99]]}); // tested
  modify({a: {}}, {$push: {'a.x': 99}}, {a: {x: [99]}});

  // $pushAll
  modify({}, {$pushAll: {a: [1]}}, {a: [1]});
  modify({a: []}, {$pushAll: {a: [1]}}, {a: [1]});
  modify({a: [1]}, {$pushAll: {a: [2]}}, {a: [1, 2]});
  modify({}, {$pushAll: {a: [1, 2]}}, {a: [1, 2]});
  modify({a: []}, {$pushAll: {a: [1, 2]}}, {a: [1, 2]});
  modify({a: [1]}, {$pushAll: {a: [2, 3]}}, {a: [1, 2, 3]});
  modify({}, {$pushAll: {a: []}}, {a: []});
  modify({a: []}, {$pushAll: {a: []}}, {a: []});
  modify({a: [1]}, {$pushAll: {a: []}}, {a: [1]});
  exception({a: true}, {$pushAll: {a: [1]}});
  exception({a: []}, {$pushAll: {a: 1}});
  modify({a: []}, {$pushAll: {'a.1': [99]}}, {a: [null, [99]]});
  modify({a: []}, {$pushAll: {'a.1': []}}, {a: [null, []]});
  modify({a: {}}, {$pushAll: {'a.x': [99]}}, {a: {x: [99]}});
  modify({a: {}}, {$pushAll: {'a.x': []}}, {a: {x: []}});

  // $addToSet
  modify({}, {$addToSet: {a: 1}}, {a: [1]});
  modify({a: []}, {$addToSet: {a: 1}}, {a: [1]});
  modify({a: [1]}, {$addToSet: {a: 2}}, {a: [1, 2]});
  modify({a: [1, 2]}, {$addToSet: {a: 1}}, {a: [1, 2]});
  modify({a: [1, 2]}, {$addToSet: {a: 2}}, {a: [1, 2]});
  modify({a: [1, 2]}, {$addToSet: {a: 3}}, {a: [1, 2, 3]});
  exception({a: true}, {$addToSet: {a: 1}});
  modify({a: [1]}, {$addToSet: {a: [2]}}, {a: [1, [2]]});
  modify({}, {$addToSet: {a: {x: 1}}}, {a: [{x: 1}]});
  modify({a: [{x: 1}]}, {$addToSet: {a: {x: 1}}}, {a: [{x: 1}]});
  modify({a: [{x: 1}]}, {$addToSet: {a: {x: 2}}}, {a: [{x: 1}, {x: 2}]});
  modify({a: [{x: 1, y: 2}]}, {$addToSet: {a: {x: 1, y: 2}}},
         {a: [{x: 1, y: 2}]});
  modify({a: [{x: 1, y: 2}]}, {$addToSet: {a: {y: 2, x: 1}}},
         {a: [{x: 1, y: 2}, {y: 2, x: 1}]});
  modify({a: [1, 2]}, {$addToSet: {a: {$each: [3, 1, 4]}}}, {a: [1, 2, 3, 4]});
  modify({a: [1, 2]}, {$addToSet: {a: {$each: [3, 1, 4], b: 12}}},
         {a: [1, 2, 3, 4]}); // tested
  modify({a: [1, 2]}, {$addToSet: {a: {b: 12, $each: [3, 1, 4]}}},
         {a: [1, 2, {b: 12, $each: [3, 1, 4]}]}); // tested
  modify({a: []}, {$addToSet: {'a.1': 99}}, {a: [null, [99]]});
  modify({a: {}}, {$addToSet: {'a.x': 99}}, {a: {x: [99]}});

  // $pop
  modify({}, {$pop: {a: 1}}, {}); // tested
  modify({}, {$pop: {a: -1}}, {}); // tested
  modify({a: []}, {$pop: {a: 1}}, {a: []});
  modify({a: []}, {$pop: {a: -1}}, {a: []});
  modify({a: [1, 2, 3]}, {$pop: {a: 1}}, {a: [1, 2]});
  modify({a: [1, 2, 3]}, {$pop: {a: 10}}, {a: [1, 2]});
  modify({a: [1, 2, 3]}, {$pop: {a: .001}}, {a: [1, 2]});
  modify({a: [1, 2, 3]}, {$pop: {a: 0}}, {a: [1, 2]});
  modify({a: [1, 2, 3]}, {$pop: {a: "stuff"}}, {a: [1, 2]});
  modify({a: [1, 2, 3]}, {$pop: {a: -1}}, {a: [2, 3]});
  modify({a: [1, 2, 3]}, {$pop: {a: -10}}, {a: [2, 3]});
  modify({a: [1, 2, 3]}, {$pop: {a: -.001}}, {a: [2, 3]});
  exception({a: true}, {$pop: {a: 1}});
  exception({a: true}, {$pop: {a: -1}});
  modify({a: []}, {$pop: {'a.1': 1}}, {a: []}); // tested
  modify({a: [1, [2, 3], 4]}, {$pop: {'a.1': 1}}, {a: [1, [2], 4]});
  modify({a: {}}, {$pop: {'a.x': 1}}, {a: {}}); // tested
  modify({a: {x: [2, 3]}}, {$pop: {'a.x': 1}}, {a: {x: [2]}});

  // $pull
  modify({}, {$pull: {a: 1}}, {});
  modify({}, {$pull: {'a.x': 1}}, {});
  modify({a: {}}, {$pull: {'a.x': 1}}, {a: {}});
  exception({a: true}, {$pull: {a: 1}});
  modify({a: [2, 1, 2]}, {$pull: {a: 1}}, {a: [2, 2]});
  modify({a: [2, 1, 2]}, {$pull: {a: 2}}, {a: [1]});
  modify({a: [2, 1, 2]}, {$pull: {a: 3}}, {a: [2, 1, 2]});
  modify({a: []}, {$pull: {a: 3}}, {a: []});
  modify({a: [[2], [2, 1], [3]]}, {$pull: {a: [2, 1]}},
         {a: [[2], [3]]}); // tested
  modify({a: [{b: 1, c: 2}, {b: 2, c: 2}]}, {$pull: {a: {b: 1}}},
         {a: [{b: 2, c: 2}]});
  modify({a: [{b: 1, c: 2}, {b: 2, c: 2}]}, {$pull: {a: {c: 2}}},
         {a: []});
  // XXX implement this functionality!
  // probably same refactoring as $elemMatch?
  // modify({a: [1, 2, 3, 4]}, {$pull: {$gt: 2}}, {a: [1,2]}); fails!

  // $pullAll
  modify({}, {$pullAll: {a: [1]}}, {});
  modify({a: [1, 2, 3]}, {$pullAll: {a: []}}, {a: [1, 2, 3]});
  modify({a: [1, 2, 3]}, {$pullAll: {a: [2]}}, {a: [1, 3]});
  modify({a: [1, 2, 3]}, {$pullAll: {a: [2, 1]}}, {a: [3]});
  modify({a: [1, 2, 3]}, {$pullAll: {a: [1, 2]}}, {a: [3]});
  modify({}, {$pullAll: {'a.b.c': [2]}}, {});
  exception({a: true}, {$pullAll: {a: [1]}});
  exception({a: [1, 2, 3]}, {$pullAll: {a: 1}});
  modify({x: [{a: 1}, {a: 1, b: 2}]}, {$pullAll: {x: [{a: 1}]}},
         {x: [{a: 1, b: 2}]});

  // $rename
  modify({}, {$rename: {a: 'b'}}, {});
  modify({a: [12]}, {$rename: {a: 'b'}}, {b: [12]});
  modify({a: {b: 12}}, {$rename: {a: 'c'}}, {c: {b: 12}});
  modify({a: {b: 12}}, {$rename: {'a.b': 'a.c'}}, {a: {c: 12}});
  modify({a: {b: 12}}, {$rename: {'a.b': 'x'}}, {a: {}, x: 12}); // tested
  modify({a: {b: 12}}, {$rename: {'a.b': 'q.r'}}, {a: {}, q: {r: 12}});
  modify({a: {b: 12}}, {$rename: {'a.b': 'q.2.r'}}, {a: {}, q: {2: {r: 12}}});
  modify({a: {b: 12}, q: {}}, {$rename: {'a.b': 'q.2.r'}},
         {a: {}, q: {2: {r: 12}}});
  exception({a: {b: 12}, q: []}, {$rename: {'a.b': 'q.2'}}); // tested
  exception({a: {b: 12}, q: []}, {$rename: {'a.b': 'q.2.r'}}); // tested
  test.expect_fail();
  exception({a: {b: 12}, q: []}, {$rename: {'q.1': 'x'}}); // tested
  test.expect_fail();
  exception({a: {b: 12}, q: []}, {$rename: {'q.1.j': 'x'}}); // tested
  exception({}, {$rename: {'a': 'a'}});
  exception({}, {$rename: {'a.b': 'a.b'}});
  modify({a: 12, b: 13}, {$rename: {a: 'b'}}, {b: 12});

  // $bit
  // unimplemented

  // XXX test case sensitivity of modops
  // XXX for each (most) modop, test that it performs a deep copy
});

// XXX test update() (selecting docs, multi, upsert..)

Tinytest.add("minimongo - observe", function (test) {
  var operations = [];
  var cbs = log_callbacks(operations);
  var handle;

  var c = new LocalCollection();
  handle = c.find({}, {sort: {a: 1}}).observe(cbs);
  test.isTrue(handle.collection === c);

  c.insert({a:1});
  test.equal(operations.shift(), ['added', {a:1}, 0]);
  c.update({a:1}, {$set: {a: 2}});
  test.equal(operations.shift(), ['changed', {a:2}, 0, {a:1}]);
  c.insert({a:10});
  test.equal(operations.shift(), ['added', {a:10}, 1]);
  c.update({}, {$inc: {a: 1}}, {multi: true});
  test.equal(operations.shift(), ['changed', {a:3}, 0, {a:2}]);
  test.equal(operations.shift(), ['changed', {a:11}, 1, {a:10}]);
  c.update({a:11}, {a:1});
  test.equal(operations.shift(), ['changed', {a:1}, 1, {a:11}]);
  test.equal(operations.shift(), ['moved', {a:1}, 1, 0]);
  c.remove({a:2});
  test.equal(operations.shift(), undefined);
  var id = c.findOne({a:3})._id;
  c.remove({a:3});
  test.equal(operations.shift(), ['removed', id, 1, {a:3}]);

  // test stop
  handle.stop();
  c.insert({a:2});
  test.equal(operations.shift(), undefined);

  // test initial inserts (and backwards sort)
  handle = c.find({}, {sort: {a: -1}}).observe(cbs);
  test.equal(operations.shift(), ['added', {a:2}, 0]);
  test.equal(operations.shift(), ['added', {a:1}, 1]);
  handle.stop();

  // test _suppress_initial
  handle = c.find({}, {sort: {a: -1}}).observe(_.extend(cbs, {_suppress_initial: true}));
  test.equal(operations.shift(), undefined);
  c.insert({a:100});
  test.equal(operations.shift(), ['added', {a:100}, 0]);
  handle.stop();
});

Tinytest.add("minimongo - diff", function (test) {

  // test correctness

  var diffTestOrdered = function(origLen, newOldIdx) {
    var oldResults = new Array(origLen);
    for (var i = 1; i <= origLen; i++)
      oldResults[i-1] = {_id: i};

    var newResults = _.map(newOldIdx, function(n) {
      var doc = {_id: Math.abs(n)};
      if (n < 0)
        doc.changed = true;
      return doc;
    });

    var results = _.clone(oldResults);
    var observer = {
      added: function(doc, before_idx) {
        test.isFalse(before_idx < 0 || before_idx > results.length);
        results.splice(before_idx, 0, doc);
      },
      removed: function(doc, at_idx) {
        test.isFalse(at_idx < 0 || at_idx >= results.length);
        test.equal(doc, results[at_idx]);
        results.splice(at_idx, 1);
      },
      changed: function(doc, at_idx, oldDoc) {
        test.isFalse(at_idx < 0 || at_idx >= results.length);
        test.equal(doc._id, oldDoc._id);
        test.equal(results[at_idx], oldDoc);
        results[at_idx] = doc;
      },
      moved: function(doc, old_idx, new_idx) {
        test.isFalse(old_idx < 0 || old_idx >= results.length);
        test.isFalse(new_idx < 0 || new_idx >= results.length);
        test.equal(doc, results[old_idx]);
        results.splice(new_idx, 0, results.splice(old_idx, 1)[0]);
      }
    };

    LocalCollection._diffQueryOrdered(oldResults, newResults, observer);
    test.equal(results, newResults);
  };

  var diffTestUnordered = function(origLen, newOldIdx) {
    var oldResults = {};
    for (var i = 1; i <= origLen; ++i)
      oldResults[i] = {_id: i};

    var newResults = {};
    _.each(newOldIdx, function (n) {
      var doc = {_id: Math.abs(n)};
      if (n < 0)
        doc.changed = true;
      newResults[doc._id] = doc;
    });

    var results = _.clone(oldResults);
    var observer = {
      added: function(doc) {
        test.isFalse(_.has(results, doc._id));
        results[doc._id] = doc;
      },
      removed: function(doc) {
        test.isTrue(_.has(results, doc._id));
        test.equal(doc, results[doc._id]);
        delete results[doc._id];
      },
      changed: function(doc, oldDoc) {
        test.equal(doc._id, oldDoc._id);
        test.isTrue(_.has(results, doc._id));
        test.equal(results[doc._id], oldDoc);
        results[doc._id] = doc;
      },
    };

    LocalCollection._diffQueryUnordered(oldResults, newResults, observer);
    test.equal(results, newResults);
  };

  var diffTest = function(origLen, newOldIdx) {
    diffTestOrdered(origLen, newOldIdx);
    diffTestUnordered(origLen, newOldIdx);
  };

  // edge cases and cases run into during debugging
  diffTest(5, [5, 1, 2, 3, 4]);
  diffTest(0, [1, 2, 3, 4]);
  diffTest(4, []);
  diffTest(7, [4, 5, 6, 7, 1, 2, 3]);
  diffTest(7, [5, 6, 7, 1, 2, 3, 4]);
  diffTest(10, [7, 4, 11, 6, 12, 1, 5]);
  diffTest(3, [3, 2, 1]);
  diffTest(10, [2, 7, 4, 6, 11, 3, 8, 9]);
  diffTest(0, []);
  diffTest(1, []);
  diffTest(0, [1]);
  diffTest(1, [1]);
  diffTest(5, [1, 2, 3, 4, 5]);

  // interaction between "changed" and other ops
  diffTest(5, [-5, -1, 2, -3, 4]);
  diffTest(7, [-4, -5, 6, 7, -1, 2, 3]);
  diffTest(7, [5, 6, -7, 1, 2, -3, 4]);
  diffTest(10, [7, -4, 11, 6, 12, -1, 5]);
  diffTest(3, [-3, -2, -1]);
  diffTest(10, [-2, 7, 4, 6, 11, -3, -8, 9]);
});


Tinytest.add("minimongo - snapshot", function (test) {
  var operations = [];
  var cbs = log_callbacks(operations);

  var c = new LocalCollection();
  var h = c.find({}).observe(cbs);

  // snapshot empty, restore immediately.

  test.equal(c.find().count(), 0);
  test.length(operations, 0);
  c.snapshot();
  test.equal(c.find().count(), 0);
  test.length(operations, 0);
  c.restore();
  test.equal(c.find().count(), 0);
  test.length(operations, 0);


  // snapshot empty, add new docs

  test.equal(c.find().count(), 0);
  test.length(operations, 0);

  c.snapshot();
  test.equal(c.find().count(), 0);

  c.insert({_id: 1, a: 1});
  test.equal(c.find().count(), 1);
  test.equal(operations.shift(), ['added', {a:1}, 0]);
  c.insert({_id: 2, b: 2});
  test.equal(c.find().count(), 2);
  test.equal(operations.shift(), ['added', {b:2}, 1]);

  c.restore();

  test.equal(c.find().count(), 0);
  test.equal(operations.shift(), ['removed', 1, 0, {a:1}]);
  test.equal(operations.shift(), ['removed', 2, 0, {b:2}]);


  // snapshot with contents. see we get add, update and remove.
  // depends on observer update order from diffQuery.
  // reorder test statements if this changes.

  c.insert({_id: 1, a: 1});
  test.equal(c.find().count(), 1);
  test.equal(operations.shift(), ['added', {a:1}, 0]);
  c.insert({_id: 2, b: 2});
  test.equal(c.find().count(), 2);
  test.equal(operations.shift(), ['added', {b:2}, 1]);

  c.snapshot();
  test.equal(c.find().count(), 2);

  c.remove({_id: 1});
  test.equal(c.find().count(), 1);
  test.equal(operations.shift(), ['removed', 1, 0, {a:1}]);
  c.insert({_id: 3, c: 3});
  test.equal(c.find().count(), 2);
  test.equal(operations.shift(), ['added', {c:3}, 1]);
  c.update({_id: 2}, {$set: {b: 4}});
  test.equal(operations.shift(), ['changed', {b:4}, 0, {b:2}]);

  c.restore();
  test.equal(c.find().count(), 2);
  test.equal(operations.shift(), ['added', {a:1}, 0]);
  test.equal(operations.shift(), ['changed', {b:2}, 1, {b:4}]);
  test.equal(operations.shift(), ['removed', 3, 2, {c:3}]);


  // snapshot with stuff. restore immediately. no changes.

  test.equal(c.find().count(), 2);
  test.length(operations, 0);
  c.snapshot();
  test.equal(c.find().count(), 2);
  test.length(operations, 0);
  c.restore();
  test.equal(c.find().count(), 2);
  test.length(operations, 0);



  h.stop();
});

Tinytest.add("minimongo - saveOriginals", function (test) {
  // set up some data
  var c = new LocalCollection();
  c.insert({_id: 'foo', x: 'untouched'});
  c.insert({_id: 'bar', x: 'updateme'});
  c.insert({_id: 'baz', x: 'updateme'});
  c.insert({_id: 'quux', y: 'removeme'});
  c.insert({_id: 'whoa', y: 'removeme'});

  // Save originals and make some changes.
  c.saveOriginals();
  c.insert({_id: "hooray", z: 'insertme'});
  c.remove({y: 'removeme'});
  c.update({x: 'updateme'}, {$set: {z: 5}}, {multi: true});
  c.update('bar', {$set: {k: 7}});  // update same doc twice

  // Verify the originals.
  var originals = c.retrieveOriginals();
  var affected = ['bar', 'baz', 'quux', 'whoa', 'hooray'];
  test.equal(_.size(originals), _.size(affected));
  _.each(affected, function (id) {
    test.isTrue(_.has(originals, id));
  });
  test.equal(originals.bar, {_id: 'bar', x: 'updateme'});
  test.equal(originals.baz, {_id: 'baz', x: 'updateme'});
  test.equal(originals.quux, {_id: 'quux', y: 'removeme'});
  test.equal(originals.whoa, {_id: 'whoa', y: 'removeme'});
  test.equal(originals.hooray, undefined);

  // Verify that changes actually occured.
  test.equal(c.find().count(), 4);
  test.equal(c.findOne('foo'), {_id: 'foo', x: 'untouched'});
  test.equal(c.findOne('bar'), {_id: 'bar', x: 'updateme', z: 5, k: 7});
  test.equal(c.findOne('baz'), {_id: 'baz', x: 'updateme', z: 5});
  test.equal(c.findOne('hooray'), {_id: 'hooray', z: 'insertme'});

  // The next call doesn't get the same originals again.
  c.saveOriginals();
  originals = c.retrieveOriginals();
  test.isTrue(originals);
  test.isTrue(_.isEmpty(originals));

  // Insert and remove a document during the period.
  c.saveOriginals();
  c.insert({_id: 'temp', q: 8});
  c.remove('temp');
  originals = c.retrieveOriginals();
  test.equal(_.size(originals), 1);
  test.isTrue(_.has(originals, 'temp'));
  test.equal(originals.temp, undefined);
});

Tinytest.add("minimongo - saveOriginals errors", function (test) {
  var c = new LocalCollection();
  // Can't call retrieve before save.
  test.throws(function () { c.retrieveOriginals(); });
  c.saveOriginals();
  // Can't call save twice.
  test.throws(function () { c.saveOriginals(); });
});

Tinytest.add("minimongo - pause", function (test) {
  var operations = [];
  var cbs = log_callbacks(operations);

  var c = new LocalCollection();
  var h = c.find({}).observe(cbs);

  // remove and add cancel out.
  c.insert({_id: 1, a: 1});
  test.equal(operations.shift(), ['added', {a:1}, 0]);

  c.pauseObservers();

  c.remove({_id: 1});
  test.length(operations, 0);
  c.insert({_id: 1, a: 1});
  test.length(operations, 0);

  c.resumeObservers();
  test.length(operations, 0);


  // two modifications become one
  c.pauseObservers();

  c.update({_id: 1}, {a: 2});
  c.update({_id: 1}, {a: 3});

  c.resumeObservers();
  test.equal(operations.shift(), ['changed', {a:3}, 0, {a:1}]);
  test.length(operations, 0);


  // snapshot/restore, same results
  c.snapshot();

  c.insert({_id: 2, b: 2});
  test.equal(operations.shift(), ['added', {b:2}, 1]);

  c.pauseObservers();
  c.restore();
  c.insert({_id: 2, b: 2});
  test.length(operations, 0);

  c.resumeObservers();
  test.length(operations, 0);

  // snapshot/restore, different results
  c.snapshot();

  c.insert({_id: 3, c: 3});
  test.equal(operations.shift(), ['added', {c:3}, 2]);

  c.pauseObservers();
  c.restore();
  c.insert({_id: 3, c: 4});
  test.length(operations, 0);

  c.resumeObservers();
  test.equal(operations.shift(), ['changed', {c:4}, 2, {c:3}]);
  test.length(operations, 0);


  h.stop();
});
