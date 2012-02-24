// assert that f is a strcmp-style comparison function that puts
// 'values' in the provided order
assert_ordering = function (f, values) {
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

// XXX test shared structure in all MM entrypoints

test("minimongo - basics", function () {
  var c = new LocalCollection();

  c.insert({type: "kitten", name: "fluffy"});
  c.insert({type: "kitten", name: "snookums"});
  c.insert({type: "cryptographer", name: "alice"});
  c.insert({type: "cryptographer", name: "bob"});
  c.insert({type: "cryptographer", name: "cara"});
  assert.equal(c.find().count(), 5);
  assert.equal(c.find({type: "kitten"}).count(), 2);
  assert.equal(c.find({type: "cryptographer"}).count(), 3);
  assert.length(c.find({type: "kitten"}).fetch(), 2);
  assert.length(c.find({type: "cryptographer"}).fetch(), 3);

  c.remove({name: "cara"});
  assert.equal(c.find().count(), 4);
  assert.equal(c.find({type: "kitten"}).count(), 2);
  assert.equal(c.find({type: "cryptographer"}).count(), 2);
  assert.length(c.find({type: "kitten"}).fetch(), 2);
  assert.length(c.find({type: "cryptographer"}).fetch(), 2);

  c.update({name: "snookums"}, {$set: {type: "cryptographer"}});
  assert.equal(c.find().count(), 4);
  assert.equal(c.find({type: "kitten"}).count(), 1);
  assert.equal(c.find({type: "cryptographer"}).count(), 3);
  assert.length(c.find({type: "kitten"}).fetch(), 1);
  assert.length(c.find({type: "cryptographer"}).fetch(), 3);

  c.remove(null);
  c.remove(false);
  c.remove(undefined);
  assert.equal(c.find().count(), 4);

  c.remove({_id: null});
  c.remove({_id: false});
  c.remove({_id: undefined});
  assert.equal(c.find().count(), 4);

  c.remove();
  assert.equal(0, c.find().count());

  c.insert({_id: 1, name: "strawberry", tags: ["fruit", "red", "squishy"]});
  c.insert({_id: 2, name: "apple", tags: ["fruit", "red", "hard"]});
  c.insert({_id: 3, name: "rose", tags: ["flower", "red", "squishy"]});

  assert.equal(c.find({tags: "flower"}).count(), 1);
  assert.equal(c.find({tags: "fruit"}).count(), 2);
  assert.equal(c.find({tags: "red"}).count(), 3);
  assert.length(c.find({tags: "flower"}).fetch(), 1);
  assert.length(c.find({tags: "fruit"}).fetch(), 2);
  assert.length(c.find({tags: "red"}).fetch(), 3);

  assert.equal(c.findOne(1).name, "strawberry");
  assert.equal(c.findOne(2).name, "apple");
  assert.equal(c.findOne(3).name, "rose");
  assert.equal(c.findOne(4), undefined);
  assert.equal(c.findOne("abc"), undefined);
  assert.equal(c.findOne(undefined), undefined);

  assert.equal(c.find(1).count(), 1);
  assert.equal(c.find(4).count(), 0);
  assert.equal(c.find("abc").count(), 0);
  assert.equal(c.find(undefined).count(), 0);
  assert.equal(c.find().count(), 3);

  var ev = "";
  var makecb = function (tag) {
    return {
      added: function (doc) { ev += "a" + tag + doc._id + "_"; },
      changed: function (doc) { ev += "c" + tag + doc._id + "_"; },
      removed: function (id) { ev += "r" + tag + id + "_"; }
    };
  };
  var expect = function (x) {
    assert.equal(ev, x);
    ev = "";
  };
  c.find({tags: "flower"}).observe(makecb('a'));
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
});

test("minimongo - cursors", function () {
  var c = new LocalCollection();
  var res;

  for (var i = 0; i < 20; i++)
    c.insert({i: i});

  var q = c.find();
  assert.equal(q.count(), 20);

  // fetch
  res = q.fetch();
  assert.length(res, 20);
  for (var i = 0; i < 20; i++)
    assert.equal(res[i].i, i);
  // everything empty
  assert.length(q.fetch(), 0);
  q.rewind();

  // forEach
  var count = 0;
  q.forEach(function (obj) {
    assert.equal(obj.i, count++);
  });
  assert.equal(count, 20);
  // everything empty
  assert.length(q.fetch(), 0);
  q.rewind();

  // map
  res = q.map(function (obj) { return obj.i * 2; });
  assert.length(res, 20);
  for (var i = 0; i < 20; i++)
    assert.equal(res[i], i * 2);
  // everything empty
  assert.length(q.fetch(), 0);

  // findOne (and no rewind first)
  assert.equal(c.findOne({i: 0}).i, 0);
  assert.equal(c.findOne({i: 1}).i, 1);
  var id = c.findOne({i: 2})._id;
  assert.equal(c.findOne(id).i, 2);
});

test("minimongo - misc", function () {
  // deepcopy
  var a = {a: [1, 2, 3], b: "x", c: true, d: {x: 12, y: [12]},
           f: null};
  var b = LocalCollection._deepcopy(a);
  assert.isTrue(LocalCollection._f._equal(a, b));
  a.a.push(4);
  assert.length(b.a, 3);
  a.c = false;
  assert.isTrue(b.c);
  b.d.z = 15;
  a.d.z = 14;
  assert.equal(b.d.z, 15);
  a.d.y.push(88);
  assert.length(b.d.y, 1);

  a = {x: function () {}};
  b = LocalCollection._deepcopy(a);
  a.x.a = 14;
  assert.equal(b.x.a, 14); // just to document current behavior
});

test("minimongo - selector_compiler", function () {
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

  assert.throws(function () {
    match({a: {$regex: /a/, $options: 'x'}}, {a: 'cat'});
  });
  assert.throws(function () {
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

  // XXX still needs tests:
  // - $or, $and, $nor, $where
  // - $elemMatch
  // - dotted keypaths
  // - people.2.name
  // - non-scalar arguments to $gt, $lt, etc
});

test("minimongo - ordering", function () {
  // value ordering
  assert_ordering(LocalCollection._f._cmp, [
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
      assert_ordering(LocalCollection._compileSort(sort), docs);
    });
  };

  verify([{"a" : 1}, ["a"], [["a", "asc"]]],
         [{c: 1}, {a: 1}, {a: {}}, {a: []}, {a: true}])
  verify([{"a" : -1}, [["a", "desc"]]],
         [{a: true}, {a: []}, {a: {}}, {a: 1}, {c: 1}]);

  verify([{"a" : 1, "b": -1}, ["a", ["b", "desc"]],
          [["a", "asc"], ["b", "desc"]]],
         [{c: 1}, {a: 1, b: 3}, {a: 1, b: 2}, {a: 2, b: 0}]);

  verify([{"a" : 1, "b": 1}, ["a", "b"],
          [["a", "asc"], ["b", "asc"]]],
         [{c: 1}, {a: 1, b: 2}, {a: 1, b: 3}, {a: 2, b: 0}]);

  assert.throws(function () {
    LocalCollection._compileSort("a");
  });

  assert.throws(function () {
    LocalCollection._compileSort(123);
  });

  assert.equal(LocalCollection._compileSort({})({a:1}, {a:2}), 0);
});

test("minimongo - sort", function () {
  var c = new LocalCollection();
  for (var i = 0; i < 50; i++)
    for (var j = 0; j < 2; j++)
      c.insert({a: i, b: j, _id: i + "_" + j});

  assert.equal(
    c.find({a: {$gt: 10}}, {sort: {b: -1, a: 1}, limit: 5}).fetch(), [
      {a: 11, b: 1, _id: "11_1"},
      {a: 12, b: 1, _id: "12_1"},
      {a: 13, b: 1, _id: "13_1"},
      {a: 14, b: 1, _id: "14_1"},
      {a: 15, b: 1, _id: "15_1"}]);

  assert.equal(
    c.find({a: {$gt: 10}}, {sort: {b: -1, a: 1}, skip: 3, limit: 5}).fetch(), [
      {a: 14, b: 1, _id: "14_1"},
      {a: 15, b: 1, _id: "15_1"},
      {a: 16, b: 1, _id: "16_1"},
      {a: 17, b: 1, _id: "17_1"},
      {a: 18, b: 1, _id: "18_1"}]);

  assert.equal(
    c.find({a: {$gte: 20}}, {sort: {a: 1, b: -1}, skip: 50, limit: 5}).fetch(), [
      {a: 45, b: 1, _id: "45_1"},
      {a: 45, b: 0, _id: "45_0"},
      {a: 46, b: 1, _id: "46_1"},
      {a: 46, b: 0, _id: "46_0"},
      {a: 47, b: 1, _id: "47_1"}]);
});

test("minimongo - modify", function () {
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
    assert.throws(function () {
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

test("minimongo - observe", function () {
  var operations = [];
  var cbs = {
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
    removed: function (id, at, old_obj) {
      delete old_obj._id;
      operations.push(LocalCollection._deepcopy(['removed', id, at, old_obj]));
    }
  };
  var handle;

  var c = new LocalCollection();
  handle = c.find({}, {sort: {a: 1}}).observe(cbs);

  c.insert({a:1});
  assert.equal(operations.shift(), ['added', {a:1}, 0]);
  c.update({a:1}, {$set: {a: 2}});
  assert.equal(operations.shift(), ['changed', {a:2}, 0, {a:1}]);
  c.insert({a:10});
  assert.equal(operations.shift(), ['added', {a:10}, 1]);
  c.update({}, {$inc: {a: 1}}, {multi: true});
  assert.equal(operations.shift(), ['changed', {a:3}, 0, {a:2}]);
  assert.equal(operations.shift(), ['changed', {a:11}, 1, {a:10}]);
  c.update({a:11}, {a:1});
  assert.equal(operations.shift(), ['changed', {a:1}, 1, {a:11}]);
  assert.equal(operations.shift(), ['moved', {a:1}, 1, 0]);
  c.remove({a:2});
  assert.equal(operations.shift(), undefined);
  var id = c.findOne({a:3})._id;
  c.remove({a:3});
  assert.equal(operations.shift(), ['removed', id, 1, {a:3}]);

  // test stop
  handle.stop();
  c.insert({a:2});
  assert.equal(operations.shift(), undefined);

  // test initial inserts (and backwards sort)
  handle = c.find({}, {sort: {a: -1}}).observe(cbs);
  assert.equal(operations.shift(), ['added', {a:2}, 0]);
  assert.equal(operations.shift(), ['added', {a:1}, 1]);
  handle.stop();

  // test _suppress_initial
  handle = c.find({}, {sort: {a: -1}}).observe(_.extend(cbs, {_suppress_initial: true}));
  assert.equal(operations.shift(), undefined);
  c.insert({a:100});
  assert.equal(operations.shift(), ['added', {a:100}, 0]);
  handle.stop();
});
