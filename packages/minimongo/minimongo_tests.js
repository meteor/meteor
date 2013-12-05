
// Hack to make LocalCollection generate ObjectIDs by default.
LocalCollection._useOID = true;

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
    addedAt: function (obj, idx, before) {
      delete obj._id;
      operations.push(EJSON.clone(['added', obj, idx, before]));
    },
    changedAt: function (obj, old_obj, at) {
      delete obj._id;
      delete old_obj._id;
      operations.push(EJSON.clone(['changed', obj, at, old_obj]));
    },
    movedTo: function (obj, old_at, new_at, before) {
      delete obj._id;
      operations.push(EJSON.clone(['moved', obj, old_at, new_at, before]));
    },
    removedAt: function (old_obj, at) {
      var id = old_obj._id;
      delete old_obj._id;
      operations.push(EJSON.clone(['removed', id, at, old_obj]));
    }
  };
};

// XXX test shared structure in all MM entrypoints
Tinytest.add("minimongo - basics", function (test) {
  var c = new LocalCollection(),
      fluffyKitten_id,
      count;

  fluffyKitten_id = c.insert({type: "kitten", name: "fluffy"});
  c.insert({type: "kitten", name: "snookums"});
  c.insert({type: "cryptographer", name: "alice"});
  c.insert({type: "cryptographer", name: "bob"});
  c.insert({type: "cryptographer", name: "cara"});
  test.equal(c.find().count(), 5);
  test.equal(c.find({type: "kitten"}).count(), 2);
  test.equal(c.find({type: "cryptographer"}).count(), 3);
  test.length(c.find({type: "kitten"}).fetch(), 2);
  test.length(c.find({type: "cryptographer"}).fetch(), 3);
  test.equal(fluffyKitten_id, c.findOne({type: "kitten", name: "fluffy"})._id);

  c.remove({name: "cara"});
  test.equal(c.find().count(), 4);
  test.equal(c.find({type: "kitten"}).count(), 2);
  test.equal(c.find({type: "cryptographer"}).count(), 2);
  test.length(c.find({type: "kitten"}).fetch(), 2);
  test.length(c.find({type: "cryptographer"}).fetch(), 2);

  count = c.update({name: "snookums"}, {$set: {type: "cryptographer"}});
  test.equal(count, 1);
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
  count = c.remove();
  test.equal(count, 0);
  test.equal(c.find().count(), 4);

  count = c.remove({});
  test.equal(count, 4);
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
  test.equal(c.find(1, {skip: 1}).count(), 0);
  test.equal(c.find({_id: 1}, {skip: 1}).count(), 0);
  test.equal(c.find({}, {skip: 1}).count(), 2);
  test.equal(c.find({}, {skip: 2}).count(), 1);
  test.equal(c.find({}, {limit: 2}).count(), 2);
  test.equal(c.find({}, {limit: 1}).count(), 1);
  test.equal(c.find({}, {skip: 1, limit: 1}).count(), 1);
  test.equal(c.find({tags: "fruit"}, {skip: 1}).count(), 1);
  test.equal(c.find({tags: "fruit"}, {limit: 1}).count(), 1);
  test.equal(c.find({tags: "fruit"}, {skip: 1, limit: 1}).count(), 1);
  test.equal(c.find(1, {sort: ['_id','desc'], skip: 1}).count(), 0);
  test.equal(c.find({_id: 1}, {sort: ['_id','desc'], skip: 1}).count(), 0);
  test.equal(c.find({}, {sort: ['_id','desc'], skip: 1}).count(), 2);
  test.equal(c.find({}, {sort: ['_id','desc'], skip: 2}).count(), 1);
  test.equal(c.find({}, {sort: ['_id','desc'], limit: 2}).count(), 2);
  test.equal(c.find({}, {sort: ['_id','desc'], limit: 1}).count(), 1);
  test.equal(c.find({}, {sort: ['_id','desc'], skip: 1, limit: 1}).count(), 1);
  test.equal(c.find({tags: "fruit"}, {sort: ['_id','desc'], skip: 1}).count(), 1);
  test.equal(c.find({tags: "fruit"}, {sort: ['_id','desc'], limit: 1}).count(), 1);
  test.equal(c.find({tags: "fruit"}, {sort: ['_id','desc'], skip: 1, limit: 1}).count(), 1);

  // Regression test for #455.
  c.insert({foo: {bar: 'baz'}});
  test.equal(c.find({foo: {bam: 'baz'}}).count(), 0);
  test.equal(c.find({foo: {bar: 'baz'}}).count(), 1);

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
  var context = {};
  q.forEach(function (obj, i, cursor) {
    test.equal(obj.i, count++);
    test.equal(obj.i, i);
    test.isTrue(context === this);
    test.isTrue(cursor === q);
  }, context);
  test.equal(count, 20);
  // everything empty
  test.length(q.fetch(), 0);
  q.rewind();

  // map
  res = q.map(function (obj, i, cursor) {
    test.equal(obj.i, i);
    test.isTrue(context === this);
    test.isTrue(cursor === q);
    return obj.i * 2;
  }, context);
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
  var b = EJSON.clone(a);
  test.equal(a, b);
  test.isTrue(LocalCollection._f._equal(a, b));
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
  b = EJSON.clone(a);
  a.x.a = 14;
  test.equal(b.x.a, 14); // just to document current behavior
});

Tinytest.add("minimongo - lookup", function (test) {
  var lookupA = LocalCollection._makeLookupFunction('a');
  test.equal(lookupA({}), [undefined]);
  test.equal(lookupA({a: 1}), [1]);
  test.equal(lookupA({a: [1]}), [[1]]);

  var lookupAX = LocalCollection._makeLookupFunction('a.x');
  test.equal(lookupAX({a: {x: 1}}), [1]);
  test.equal(lookupAX({a: {x: [1]}}), [[1]]);
  test.equal(lookupAX({a: 5}), [undefined]);
  test.equal(lookupAX({a: [{x: 1}, {x: [2]}, {y: 3}]}),
             [1, [2], undefined]);

  var lookupA0X = LocalCollection._makeLookupFunction('a.0.x');
  test.equal(lookupA0X({a: [{x: 1}]}), [1]);
  test.equal(lookupA0X({a: [{x: [1]}]}), [[1]]);
  test.equal(lookupA0X({a: 5}), [undefined]);
  test.equal(lookupA0X({a: [{x: 1}, {x: [2]}, {y: 3}]}), [1]);
});

Tinytest.add("minimongo - selector_compiler", function (test) {
  var matches = function (should_match, selector, doc) {
    var does_match = MinimongoTest.matches(selector, doc);
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
  nomatch({'a.b': {$ne: 1}}, {a: [{b: 1}, {b: 2}]});
  nomatch({'a.b': {$ne: 2}}, {a: [{b: 1}, {b: 2}]});
  match({'a.b': {$ne: 3}}, {a: [{b: 1}, {b: 2}]});

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
  nomatch({'a.b': {$nin: [1, 2, 3]}}, {a: [{b:4}, {b:2}]});
  match({a: {$nin: [1, 2, 3]}}, {a: [4]});
  match({'a.b': {$nin: [1, 2, 3]}}, {a: [{b:4}]});

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
  match({a: {$type: 5}}, {a: EJSON.newBinary(0)});
  match({a: {$type: 5}}, {a: EJSON.newBinary(4)});
  nomatch({a: {$type: 5}}, {a: []});
  nomatch({a: {$type: 5}}, {a: [42]});
  match({a: {$type: 7}}, {a: new LocalCollection._ObjectID()});
  nomatch({a: {$type: 7}}, {a: "1234567890abcd1234567890"});
  match({a: {$type: 8}}, {a: true});
  match({a: {$type: 8}}, {a: false});
  nomatch({a: {$type: 8}}, {a: "true"});
  nomatch({a: {$type: 8}}, {a: 0});
  nomatch({a: {$type: 8}}, {a: null});
  nomatch({a: {$type: 8}}, {a: ''});
  nomatch({a: {$type: 8}}, {});
  match({a: {$type: 9}}, {a: (new Date)});
  nomatch({a: {$type: 9}}, {a: +(new Date)});
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
  match({a: /a/}, {a: ['foo', 'bar']});  // search within array...
  nomatch({a: /,/}, {a: ['foo', 'bar']});  // but not by stringifying
  match({a: {$regex: 'a'}}, {a: ['foo', 'bar']});
  nomatch({a: {$regex: ','}}, {a: ['foo', 'bar']});
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
  nomatch({a: /undefined/}, {});
  nomatch({a: {$regex: 'undefined'}}, {});
  nomatch({a: /xxx/}, {});
  nomatch({a: {$regex: 'xxx'}}, {});

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
  match({'x.y': {$not: {$gt: 7}}}, {x: [{y:2}, {y:3}, {y:4}]});
  nomatch({x: {$not: {$gt: 7}}}, {x: [2, 3, 4, 10]});
  nomatch({'x.y': {$not: {$gt: 7}}}, {x: [{y:2}, {y:3}, {y:4}, {y:10}]});

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
  match({"a.b.c": null}, {});
  match({"a.b.c": null}, {a: 1});
  match({"a.b.c": null}, {a: {b: 4}});

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

  // $or
  test.throws(function () {
    match({$or: []}, {});
  });
  test.throws(function () {
    match({$or: []}, {a: 1});
  });
  match({$or: [{a: 1}]}, {a: 1});
  nomatch({$or: [{b: 2}]}, {a: 1});
  match({$or: [{a: 1}, {b: 2}]}, {a: 1});
  nomatch({$or: [{c: 3}, {d: 4}]}, {a: 1});
  match({$or: [{a: 1}, {b: 2}]}, {a: [1, 2, 3]});
  nomatch({$or: [{a: 1}, {b: 2}]}, {c: [1, 2, 3]});
  nomatch({$or: [{a: 1}, {b: 2}]}, {a: [2, 3, 4]});
  match({$or: [{a: 1}, {a: 2}]}, {a: 1});
  match({$or: [{a: 1}, {a: 2}], b: 2}, {a: 1, b: 2});
  nomatch({$or: [{a: 2}, {a: 3}], b: 2}, {a: 1, b: 2});
  nomatch({$or: [{a: 1}, {a: 2}], b: 3}, {a: 1, b: 2});

  // $or and $lt, $lte, $gt, $gte
  match({$or: [{a: {$lte: 1}}, {a: 2}]}, {a: 1});
  nomatch({$or: [{a: {$lt: 1}}, {a: 2}]}, {a: 1});
  match({$or: [{a: {$gte: 1}}, {a: 2}]}, {a: 1});
  nomatch({$or: [{a: {$gt: 1}}, {a: 2}]}, {a: 1});
  match({$or: [{b: {$gt: 1}}, {b: {$lt: 3}}]}, {b: 2});
  nomatch({$or: [{b: {$lt: 1}}, {b: {$gt: 3}}]}, {b: 2});

  // $or and $in
  match({$or: [{a: {$in: [1, 2, 3]}}]}, {a: 1});
  nomatch({$or: [{a: {$in: [4, 5, 6]}}]}, {a: 1});
  match({$or: [{a: {$in: [1, 2, 3]}}, {b: 2}]}, {a: 1});
  match({$or: [{a: {$in: [1, 2, 3]}}, {b: 2}]}, {b: 2});
  nomatch({$or: [{a: {$in: [1, 2, 3]}}, {b: 2}]}, {c: 3});
  match({$or: [{a: {$in: [1, 2, 3]}}, {b: {$in: [1, 2, 3]}}]}, {b: 2});
  nomatch({$or: [{a: {$in: [1, 2, 3]}}, {b: {$in: [4, 5, 6]}}]}, {b: 2});

  // $or and $nin
  nomatch({$or: [{a: {$nin: [1, 2, 3]}}]}, {a: 1});
  match({$or: [{a: {$nin: [4, 5, 6]}}]}, {a: 1});
  nomatch({$or: [{a: {$nin: [1, 2, 3]}}, {b: 2}]}, {a: 1});
  match({$or: [{a: {$nin: [1, 2, 3]}}, {b: 2}]}, {b: 2});
  match({$or: [{a: {$nin: [1, 2, 3]}}, {b: 2}]}, {c: 3});
  match({$or: [{a: {$nin: [1, 2, 3]}}, {b: {$nin: [1, 2, 3]}}]}, {b: 2});
  nomatch({$or: [{a: {$nin: [1, 2, 3]}}, {b: {$nin: [1, 2, 3]}}]}, {a: 1, b: 2});
  match({$or: [{a: {$nin: [1, 2, 3]}}, {b: {$nin: [4, 5, 6]}}]}, {b: 2});

  // $or and dot-notation
  match({$or: [{"a.b": 1}, {"a.b": 2}]}, {a: {b: 1}});
  match({$or: [{"a.b": 1}, {"a.c": 1}]}, {a: {b: 1}});
  nomatch({$or: [{"a.b": 2}, {"a.c": 1}]}, {a: {b: 1}});

  // $or and nested objects
  match({$or: [{a: {b: 1, c: 2}}, {a: {b: 2, c: 1}}]}, {a: {b: 1, c: 2}});
  nomatch({$or: [{a: {b: 1, c: 3}}, {a: {b: 2, c: 1}}]}, {a: {b: 1, c: 2}});

  // $or and regexes
  match({$or: [{a: /a/}]}, {a: "cat"});
  nomatch({$or: [{a: /o/}]}, {a: "cat"});
  match({$or: [{a: /a/}, {a: /o/}]}, {a: "cat"});
  nomatch({$or: [{a: /i/}, {a: /o/}]}, {a: "cat"});
  match({$or: [{a: /i/}, {b: /o/}]}, {a: "cat", b: "dog"});

  // $or and $ne
  match({$or: [{a: {$ne: 1}}]}, {});
  nomatch({$or: [{a: {$ne: 1}}]}, {a: 1});
  match({$or: [{a: {$ne: 1}}]}, {a: 2});
  match({$or: [{a: {$ne: 1}}]}, {b: 1});
  match({$or: [{a: {$ne: 1}}, {a: {$ne: 2}}]}, {a: 1});
  match({$or: [{a: {$ne: 1}}, {b: {$ne: 1}}]}, {a: 1});
  nomatch({$or: [{a: {$ne: 1}}, {b: {$ne: 2}}]}, {a: 1, b: 2});

  // $or and $not
  match({$or: [{a: {$not: {$mod: [10, 1]}}}]}, {});
  nomatch({$or: [{a: {$not: {$mod: [10, 1]}}}]}, {a: 1});
  match({$or: [{a: {$not: {$mod: [10, 1]}}}]}, {a: 2});
  match({$or: [{a: {$not: {$mod: [10, 1]}}}, {a: {$not: {$mod: [10, 2]}}}]}, {a: 1});
  nomatch({$or: [{a: {$not: {$mod: [10, 1]}}}, {a: {$mod: [10, 2]}}]}, {a: 1});
  match({$or: [{a: {$not: {$mod: [10, 1]}}}, {a: {$mod: [10, 2]}}]}, {a: 2});
  match({$or: [{a: {$not: {$mod: [10, 1]}}}, {a: {$mod: [10, 2]}}]}, {a: 3});
  // this is possibly an open-ended task, so we stop here ...

  // $nor
  test.throws(function () {
    match({$nor: []}, {});
  });
  test.throws(function () {
    match({$nor: []}, {a: 1});
  });
  nomatch({$nor: [{a: 1}]}, {a: 1});
  match({$nor: [{b: 2}]}, {a: 1});
  nomatch({$nor: [{a: 1}, {b: 2}]}, {a: 1});
  match({$nor: [{c: 3}, {d: 4}]}, {a: 1});
  nomatch({$nor: [{a: 1}, {b: 2}]}, {a: [1, 2, 3]});
  match({$nor: [{a: 1}, {b: 2}]}, {c: [1, 2, 3]});
  match({$nor: [{a: 1}, {b: 2}]}, {a: [2, 3, 4]});
  nomatch({$nor: [{a: 1}, {a: 2}]}, {a: 1});

  // $nor and $lt, $lte, $gt, $gte
  nomatch({$nor: [{a: {$lte: 1}}, {a: 2}]}, {a: 1});
  match({$nor: [{a: {$lt: 1}}, {a: 2}]}, {a: 1});
  nomatch({$nor: [{a: {$gte: 1}}, {a: 2}]}, {a: 1});
  match({$nor: [{a: {$gt: 1}}, {a: 2}]}, {a: 1});
  nomatch({$nor: [{b: {$gt: 1}}, {b: {$lt: 3}}]}, {b: 2});
  match({$nor: [{b: {$lt: 1}}, {b: {$gt: 3}}]}, {b: 2});

  // $nor and $in
  nomatch({$nor: [{a: {$in: [1, 2, 3]}}]}, {a: 1});
  match({$nor: [{a: {$in: [4, 5, 6]}}]}, {a: 1});
  nomatch({$nor: [{a: {$in: [1, 2, 3]}}, {b: 2}]}, {a: 1});
  nomatch({$nor: [{a: {$in: [1, 2, 3]}}, {b: 2}]}, {b: 2});
  match({$nor: [{a: {$in: [1, 2, 3]}}, {b: 2}]}, {c: 3});
  nomatch({$nor: [{a: {$in: [1, 2, 3]}}, {b: {$in: [1, 2, 3]}}]}, {b: 2});
  match({$nor: [{a: {$in: [1, 2, 3]}}, {b: {$in: [4, 5, 6]}}]}, {b: 2});

  // $nor and $nin
  match({$nor: [{a: {$nin: [1, 2, 3]}}]}, {a: 1});
  nomatch({$nor: [{a: {$nin: [4, 5, 6]}}]}, {a: 1});
  match({$nor: [{a: {$nin: [1, 2, 3]}}, {b: 2}]}, {a: 1});
  nomatch({$nor: [{a: {$nin: [1, 2, 3]}}, {b: 2}]}, {b: 2});
  nomatch({$nor: [{a: {$nin: [1, 2, 3]}}, {b: 2}]}, {c: 3});
  nomatch({$nor: [{a: {$nin: [1, 2, 3]}}, {b: {$nin: [1, 2, 3]}}]}, {b: 2});
  match({$nor: [{a: {$nin: [1, 2, 3]}}, {b: {$nin: [1, 2, 3]}}]}, {a: 1, b: 2});
  nomatch({$nor: [{a: {$nin: [1, 2, 3]}}, {b: {$nin: [4, 5, 6]}}]}, {b: 2});

  // $nor and dot-notation
  nomatch({$nor: [{"a.b": 1}, {"a.b": 2}]}, {a: {b: 1}});
  nomatch({$nor: [{"a.b": 1}, {"a.c": 1}]}, {a: {b: 1}});
  match({$nor: [{"a.b": 2}, {"a.c": 1}]}, {a: {b: 1}});

  // $nor and nested objects
  nomatch({$nor: [{a: {b: 1, c: 2}}, {a: {b: 2, c: 1}}]}, {a: {b: 1, c: 2}});
  match({$nor: [{a: {b: 1, c: 3}}, {a: {b: 2, c: 1}}]}, {a: {b: 1, c: 2}});

  // $nor and regexes
  nomatch({$nor: [{a: /a/}]}, {a: "cat"});
  match({$nor: [{a: /o/}]}, {a: "cat"});
  nomatch({$nor: [{a: /a/}, {a: /o/}]}, {a: "cat"});
  match({$nor: [{a: /i/}, {a: /o/}]}, {a: "cat"});
  nomatch({$nor: [{a: /i/}, {b: /o/}]}, {a: "cat", b: "dog"});

  // $nor and $ne
  nomatch({$nor: [{a: {$ne: 1}}]}, {});
  match({$nor: [{a: {$ne: 1}}]}, {a: 1});
  nomatch({$nor: [{a: {$ne: 1}}]}, {a: 2});
  nomatch({$nor: [{a: {$ne: 1}}]}, {b: 1});
  nomatch({$nor: [{a: {$ne: 1}}, {a: {$ne: 2}}]}, {a: 1});
  nomatch({$nor: [{a: {$ne: 1}}, {b: {$ne: 1}}]}, {a: 1});
  match({$nor: [{a: {$ne: 1}}, {b: {$ne: 2}}]}, {a: 1, b: 2});

  // $nor and $not
  nomatch({$nor: [{a: {$not: {$mod: [10, 1]}}}]}, {});
  match({$nor: [{a: {$not: {$mod: [10, 1]}}}]}, {a: 1});
  nomatch({$nor: [{a: {$not: {$mod: [10, 1]}}}]}, {a: 2});
  nomatch({$nor: [{a: {$not: {$mod: [10, 1]}}}, {a: {$not: {$mod: [10, 2]}}}]}, {a: 1});
  match({$nor: [{a: {$not: {$mod: [10, 1]}}}, {a: {$mod: [10, 2]}}]}, {a: 1});
  nomatch({$nor: [{a: {$not: {$mod: [10, 1]}}}, {a: {$mod: [10, 2]}}]}, {a: 2});
  nomatch({$nor: [{a: {$not: {$mod: [10, 1]}}}, {a: {$mod: [10, 2]}}]}, {a: 3});

  // $and

  test.throws(function () {
    match({$and: []}, {});
  });
  test.throws(function () {
    match({$and: []}, {a: 1});
  });
  match({$and: [{a: 1}]}, {a: 1});
  nomatch({$and: [{a: 1}, {a: 2}]}, {a: 1});
  nomatch({$and: [{a: 1}, {b: 1}]}, {a: 1});
  match({$and: [{a: 1}, {b: 2}]}, {a: 1, b: 2});
  nomatch({$and: [{a: 1}, {b: 1}]}, {a: 1, b: 2});
  match({$and: [{a: 1}, {b: 2}], c: 3}, {a: 1, b: 2, c: 3});
  nomatch({$and: [{a: 1}, {b: 2}], c: 4}, {a: 1, b: 2, c: 3});

  // $and and regexes
  match({$and: [{a: /a/}]}, {a: "cat"});
  match({$and: [{a: /a/i}]}, {a: "CAT"});
  nomatch({$and: [{a: /o/}]}, {a: "cat"});
  nomatch({$and: [{a: /a/}, {a: /o/}]}, {a: "cat"});
  match({$and: [{a: /a/}, {b: /o/}]}, {a: "cat", b: "dog"});
  nomatch({$and: [{a: /a/}, {b: /a/}]}, {a: "cat", b: "dog"});

  // $and, dot-notation, and nested objects
  match({$and: [{"a.b": 1}]}, {a: {b: 1}});
  match({$and: [{a: {b: 1}}]}, {a: {b: 1}});
  nomatch({$and: [{"a.b": 2}]}, {a: {b: 1}});
  nomatch({$and: [{"a.c": 1}]}, {a: {b: 1}});
  nomatch({$and: [{"a.b": 1}, {"a.b": 2}]}, {a: {b: 1}});
  nomatch({$and: [{"a.b": 1}, {a: {b: 2}}]}, {a: {b: 1}});
  match({$and: [{"a.b": 1}, {"c.d": 2}]}, {a: {b: 1}, c: {d: 2}});
  nomatch({$and: [{"a.b": 1}, {"c.d": 1}]}, {a: {b: 1}, c: {d: 2}});
  match({$and: [{"a.b": 1}, {c: {d: 2}}]}, {a: {b: 1}, c: {d: 2}});
  nomatch({$and: [{"a.b": 1}, {c: {d: 1}}]}, {a: {b: 1}, c: {d: 2}});
  nomatch({$and: [{"a.b": 2}, {c: {d: 2}}]}, {a: {b: 1}, c: {d: 2}});
  match({$and: [{a: {b: 1}}, {c: {d: 2}}]}, {a: {b: 1}, c: {d: 2}});
  nomatch({$and: [{a: {b: 2}}, {c: {d: 2}}]}, {a: {b: 1}, c: {d: 2}});

  // $and and $in
  nomatch({$and: [{a: {$in: []}}]}, {});
  match({$and: [{a: {$in: [1, 2, 3]}}]}, {a: 1});
  nomatch({$and: [{a: {$in: [4, 5, 6]}}]}, {a: 1});
  nomatch({$and: [{a: {$in: [1, 2, 3]}}, {a: {$in: [4, 5, 6]}}]}, {a: 1});
  nomatch({$and: [{a: {$in: [1, 2, 3]}}, {b: {$in: [1, 2, 3]}}]}, {a: 1, b: 4});
  match({$and: [{a: {$in: [1, 2, 3]}}, {b: {$in: [4, 5, 6]}}]}, {a: 1, b: 4});


  // $and and $nin
  match({$and: [{a: {$nin: []}}]}, {});
  nomatch({$and: [{a: {$nin: [1, 2, 3]}}]}, {a: 1});
  match({$and: [{a: {$nin: [4, 5, 6]}}]}, {a: 1});
  nomatch({$and: [{a: {$nin: [1, 2, 3]}}, {a: {$nin: [4, 5, 6]}}]}, {a: 1});
  nomatch({$and: [{a: {$nin: [1, 2, 3]}}, {b: {$nin: [1, 2, 3]}}]}, {a: 1, b: 4});
  nomatch({$and: [{a: {$nin: [1, 2, 3]}}, {b: {$nin: [4, 5, 6]}}]}, {a: 1, b: 4});

  // $and and $lt, $lte, $gt, $gte
  match({$and: [{a: {$lt: 2}}]}, {a: 1});
  nomatch({$and: [{a: {$lt: 1}}]}, {a: 1});
  match({$and: [{a: {$lte: 1}}]}, {a: 1});
  match({$and: [{a: {$gt: 0}}]}, {a: 1});
  nomatch({$and: [{a: {$gt: 1}}]}, {a: 1});
  match({$and: [{a: {$gte: 1}}]}, {a: 1});
  match({$and: [{a: {$gt: 0}}, {a: {$lt: 2}}]}, {a: 1});
  nomatch({$and: [{a: {$gt: 1}}, {a: {$lt: 2}}]}, {a: 1});
  nomatch({$and: [{a: {$gt: 0}}, {a: {$lt: 1}}]}, {a: 1});
  match({$and: [{a: {$gte: 1}}, {a: {$lte: 1}}]}, {a: 1});
  nomatch({$and: [{a: {$gte: 2}}, {a: {$lte: 0}}]}, {a: 1});

  // $and and $ne
  match({$and: [{a: {$ne: 1}}]}, {});
  nomatch({$and: [{a: {$ne: 1}}]}, {a: 1});
  match({$and: [{a: {$ne: 1}}]}, {a: 2});
  nomatch({$and: [{a: {$ne: 1}}, {a: {$ne: 2}}]}, {a: 2});
  match({$and: [{a: {$ne: 1}}, {a: {$ne: 3}}]}, {a: 2});

  // $and and $not
  match({$and: [{a: {$not: {$gt: 2}}}]}, {a: 1});
  nomatch({$and: [{a: {$not: {$lt: 2}}}]}, {a: 1});
  match({$and: [{a: {$not: {$lt: 0}}}, {a: {$not: {$gt: 2}}}]}, {a: 1});
  nomatch({$and: [{a: {$not: {$lt: 2}}}, {a: {$not: {$gt: 0}}}]}, {a: 1});

  // $where
  match({$where: "this.a === 1"}, {a: 1});
  nomatch({$where: "this.a !== 1"}, {a: 1});
  nomatch({$where: "this.a === 1", a: 2}, {a: 1});
  match({$where: "this.a === 1", b: 2}, {a: 1, b: 2});
  match({$where: "this.a === 1 && this.b === 2"}, {a: 1, b: 2});
  match({$where: "this.a instanceof Array"}, {a: []});
  nomatch({$where: "this.a instanceof Array"}, {a: 1});

  // reaching into array
  match({"dogs.0.name": "Fido"}, {dogs: [{name: "Fido"}, {name: "Rex"}]});
  match({"dogs.1.name": "Rex"}, {dogs: [{name: "Fido"}, {name: "Rex"}]});
  nomatch({"dogs.1.name": "Fido"}, {dogs: [{name: "Fido"}, {name: "Rex"}]});
  match({"room.1b": "bla"}, {room: {"1b": "bla"}});

  match({"dogs.name": "Fido"}, {dogs: [{name: "Fido"}, {name: "Rex"}]});
  match({"dogs.name": "Rex"}, {dogs: [{name: "Fido"}, {name: "Rex"}]});
  match({"animals.dogs.name": "Fido"},
        {animals: [{dogs: [{name: "Rover"}]},
                   {},
                   {dogs: [{name: "Fido"}, {name: "Rex"}]}]});
  match({"animals.dogs.name": "Fido"},
        {animals: [{dogs: {name: "Rex"}},
                   {dogs: {name: "Fido"}}]});
  match({"animals.dogs.name": "Fido"},
        {animals: [{dogs: [{name: "Rover"}]},
                   {},
                   {dogs: [{name: ["Fido"]}, {name: "Rex"}]}]});
  nomatch({"dogs.name": "Fido"}, {dogs: []});

  // $elemMatch
  match({dogs: {$elemMatch: {name: /e/}}},
        {dogs: [{name: "Fido"}, {name: "Rex"}]});
  nomatch({dogs: {$elemMatch: {name: /a/}}},
          {dogs: [{name: "Fido"}, {name: "Rex"}]});
  match({dogs: {$elemMatch: {age: {$gt: 4}}}},
        {dogs: [{name: "Fido", age: 5}, {name: "Rex", age: 3}]});
  match({dogs: {$elemMatch: {name: "Fido", age: {$gt: 4}}}},
        {dogs: [{name: "Fido", age: 5}, {name: "Rex", age: 3}]});
  nomatch({dogs: {$elemMatch: {name: "Fido", age: {$gt: 5}}}},
          {dogs: [{name: "Fido", age: 5}, {name: "Rex", age: 3}]});
  match({dogs: {$elemMatch: {name: /i/, age: {$gt: 4}}}},
        {dogs: [{name: "Fido", age: 5}, {name: "Rex", age: 3}]});
  nomatch({dogs: {$elemMatch: {name: /e/, age: 5}}},
          {dogs: [{name: "Fido", age: 5}, {name: "Rex", age: 3}]});

  // XXX still needs tests:
  // - non-scalar arguments to $gt, $lt, etc
});

Tinytest.add("minimongo - projection_compiler", function (test) {
  var testProjection = function (projection, tests) {
    var projection_f = LocalCollection._compileProjection(projection);
    var equalNonStrict = function (a, b, desc) {
      test.isTrue(_.isEqual(a, b), desc);
    };

    _.each(tests, function (testCase) {
      equalNonStrict(projection_f(testCase[0]), testCase[1], testCase[2]);
    });
  };

  testProjection({ 'foo': 1, 'bar': 1 }, [
    [{ foo: 42, bar: "something", baz: "else" },
     { foo: 42, bar: "something" },
     "simplest - whitelist"],

    [{ foo: { nested: 17 }, baz: {} },
     { foo: { nested: 17 } },
     "nested whitelisted field"],

    [{ _id: "uid", bazbaz: 42 },
     { _id: "uid" },
     "simplest whitelist - preserve _id"]
  ]);

  testProjection({ 'foo': 0, 'bar': 0 }, [
    [{ foo: 42, bar: "something", baz: "else" },
     { baz: "else" },
     "simplest - blacklist"],

    [{ foo: { nested: 17 }, baz: { foo: "something" } },
     { baz: { foo: "something" } },
     "nested blacklisted field"],

    [{ _id: "uid", bazbaz: 42 },
     { _id: "uid", bazbaz: 42 },
     "simplest blacklist - preserve _id"]
  ]);

  testProjection({ _id: 0, foo: 1 }, [
    [{ foo: 42, bar: 33, _id: "uid" },
     { foo: 42 },
     "whitelist - _id blacklisted"]
  ]);

  testProjection({ _id: 0, foo: 0 }, [
    [{ foo: 42, bar: 33, _id: "uid" },
     { bar: 33 },
     "blacklist - _id blacklisted"]
  ]);

  testProjection({ 'foo.bar.baz': 1 }, [
    [{ foo: { meh: "fur", bar: { baz: 42 }, tr: 1 }, bar: 33, baz: 'trolololo' },
     { foo: { bar: { baz: 42 } } },
     "whitelist nested"],

    // Behavior of this test is looked up in actual mongo
    [{ foo: { meh: "fur", bar: "nope", tr: 1 }, bar: 33, baz: 'trolololo' },
     { foo: {} },
     "whitelist nested - path not found in doc, different type"],

    // Behavior of this test is looked up in actual mongo
    [{ foo: { meh: "fur", bar: [], tr: 1 }, bar: 33, baz: 'trolololo' },
     { foo: { bar: [] } },
     "whitelist nested - path not found in doc"]
  ]);

  testProjection({ 'hope.humanity': 0, 'hope.people': 0 }, [
    [{ hope: { humanity: "lost", people: 'broken', candies: 'long live!' } },
     { hope: { candies: 'long live!' } },
     "blacklist nested"],

    [{ hope: "new" },
     { hope: "new" },
     "blacklist nested - path not found in doc"]
  ]);

  testProjection({ _id: 1 }, [
    [{ _id: 42, x: 1, y: { z: "2" } },
     { _id: 42 },
     "_id whitelisted"],
    [{ _id: 33 },
     { _id: 33 },
     "_id whitelisted, _id only"],
    [{ x: 1 },
     {},
     "_id whitelisted, no _id"]
  ]);

  testProjection({ _id: 0 }, [
    [{ _id: 42, x: 1, y: { z: "2" } },
     { x: 1, y: { z: "2" } },
     "_id blacklisted"],
    [{ _id: 33 },
     {},
     "_id blacklisted, _id only"],
    [{ x: 1 },
     { x: 1 },
     "_id blacklisted, no _id"]
  ]);

  testProjection({}, [
    [{ a: 1, b: 2, c: "3" },
     { a: 1, b: 2, c: "3" },
     "empty projection"]
  ]);

  test.throws(function () {
    testProjection({ 'inc': 1, 'excl': 0 }, [
      [ { inc: 42, excl: 42 }, { inc: 42 }, "Can't combine incl/excl rules" ]
    ]);
  });

  test.throws(function () {
    testProjection({ 'a': 1, 'a.b': 1 }, [
      [ { a: { b: 42 } }, { a: { b: 42 } }, "Can't have ambiguous rules (one is prefix of another)" ]
    ]);
  });
  test.throws(function () {
    testProjection({ 'a.b.c': 1, 'a.b': 1, 'a': 1 }, [
      [ { a: { b: 42 } }, { a: { b: 42 } }, "Can't have ambiguous rules (one is prefix of another)" ]
    ]);
  });

  test.throws(function () {
    testProjection("some string", [
      [ { a: { b: 42 } }, { a: { b: 42 } }, "Projection is not a hash" ]
    ]);
  });
});

Tinytest.add("minimongo - fetch with fields", function (test) {
  var c = new LocalCollection();
  _.times(30, function (i) {
    c.insert({
      something: Random.id(),
      anything: {
        foo: "bar",
        cool: "hot"
      },
      nothing: i,
      i: i
    });
  });

  // Test just a regular fetch with some projection
  var fetchResults = c.find({}, { fields: {
    'something': 1,
    'anything.foo': 1
  } }).fetch();

  test.isTrue(_.all(fetchResults, function (x) {
    return x &&
           x.something &&
           x.anything &&
           x.anything.foo &&
           x.anything.foo === "bar" &&
           !_.has(x, 'nothing') &&
           !_.has(x.anything, 'cool');
  }));

  // Test with a selector, even field used in the selector is excluded in the
  // projection
  fetchResults = c.find({
    nothing: { $gte: 5 }
  }, {
    fields: { nothing: 0 }
  }).fetch();

  test.isTrue(_.all(fetchResults, function (x) {
    return x &&
           x.something &&
           x.anything &&
           x.anything.foo === "bar" &&
           x.anything.cool === "hot" &&
           !_.has(x, 'nothing') &&
           x.i &&
           x.i >= 5;
  }));

  test.isTrue(fetchResults.length === 25);

  // Test that we can sort, based on field excluded from the projection, use
  // skip and limit as well!
  // following find will get indexes [10..20) sorted by nothing
  fetchResults = c.find({}, {
    sort: {
      nothing: 1
    },
    limit: 10,
    skip: 10,
    fields: {
      i: 1,
      something: 1
    }
  }).fetch();

  test.isTrue(_.all(fetchResults, function (x) {
    return x &&
           x.something &&
           x.i >= 10 && x.i < 20;
  }));

  _.each(fetchResults, function (x, i, arr) {
    if (!i) return;
    test.isTrue(x.i === arr[i-1].i + 1);
  });

  // Temporary unsupported operators
  // queries are taken from MongoDB docs examples
  test.throws(function () {
    c.find({}, { fields: { 'grades.$': 1 } });
  });
  test.throws(function () {
    c.find({}, { fields: { grades: { $elemMatch: { mean: 70 } } } });
  });
  test.throws(function () {
    c.find({}, { fields: { grades: { $slice: [20, 10] } } });
  });
});

Tinytest.add("minimongo - fetch with projection, subarrays", function (test) {
  // Apparently projection of type 'foo.bar.x' for
  // { foo: [ { bar: { x: 42 } }, { bar: { x: 3 } } ] }
  // should return exactly this object. More precisely, arrays are considered as
  // sets and are queried separately and then merged back to result set
  var c = new LocalCollection();

  // Insert a test object with two set fields
  c.insert({
    setA: [{
      fieldA: 42,
      fieldB: 33
    }, {
      fieldA: "the good",
      fieldB: "the bad",
      fieldC: "the ugly"
    }],
    setB: [{
      anotherA: { },
      anotherB: "meh"
    }, {
      anotherA: 1234,
      anotherB: 431
    }]
  });

  var equalNonStrict = function (a, b, desc) {
    test.isTrue(_.isEqual(a, b), desc);
  };

  var testForProjection = function (projection, expected) {
    var fetched = c.find({}, { fields: projection }).fetch()[0];
    equalNonStrict(fetched, expected, "failed sub-set projection: " +
                                      JSON.stringify(projection));
  };

  testForProjection({ 'setA.fieldA': 1, 'setB.anotherB': 1, _id: 0 },
                    {
                      setA: [{ fieldA: 42 }, { fieldA: "the good" }],
                      setB: [{ anotherB: "meh" }, { anotherB: 431 }]
                    });

  testForProjection({ 'setA.fieldA': 0, 'setB.anotherA': 0, _id: 0 },
                    {
                      setA: [{fieldB:33}, {fieldB:"the bad",fieldC:"the ugly"}],
                      setB: [{ anotherB: "meh" }, { anotherB: 431 }]
                    });

  c.remove({});
  c.insert({a:[[{b:1,c:2},{b:2,c:4}],{b:3,c:5},[{b:4, c:9}]]});

  testForProjection({ 'a.b': 1, _id: 0 },
                    {a: [ [ { b: 1 }, { b: 2 } ], { b: 3 }, [ { b: 4 } ] ] });
  testForProjection({ 'a.b': 0, _id: 0 },
                    {a: [ [ { c: 2 }, { c: 4 } ], { c: 5 }, [ { c: 9 } ] ] });
});

Tinytest.add("minimongo - fetch with projection, deep copy", function (test) {
  // Compiled fields projection defines the contract: returned document doesn't
  // retain anything from the passed argument.
  var doc = {
    a: { x: 42 },
    b: {
      y: { z: 33 }
    },
    c: "asdf"
  };

  var fields = {
    'a': 1,
    'b.y': 1
  };

  var projectionFn = LocalCollection._compileProjection(fields);
  var filteredDoc = projectionFn(doc);
  doc.a.x++;
  doc.b.y.z--;
  test.equal(filteredDoc.a.x, 42, "projection returning deep copy - including");
  test.equal(filteredDoc.b.y.z, 33, "projection returning deep copy - including");

  fields = { c: 0 };
  projectionFn = LocalCollection._compileProjection(fields);
  filteredDoc = projectionFn(doc);

  doc.a.x = 5;
  test.equal(filteredDoc.a.x, 43, "projection returning deep copy - excluding");
});

Tinytest.add("minimongo - observe ordered with projection", function (test) {
  // These tests are copy-paste from "minimongo -observe ordered",
  // slightly modified to test projection
  var operations = [];
  var cbs = log_callbacks(operations);
  var handle;

  var c = new LocalCollection();
  handle = c.find({}, {sort: {a: 1}, fields: { a: 1 }}).observe(cbs);
  test.isTrue(handle.collection === c);

  c.insert({_id: 'foo', a:1, b:2});
  test.equal(operations.shift(), ['added', {a:1}, 0, null]);
  c.update({a:1}, {$set: {a: 2, b: 1}});
  test.equal(operations.shift(), ['changed', {a:2}, 0, {a:1}]);
  c.insert({_id: 'bar', a:10, c: 33});
  test.equal(operations.shift(), ['added', {a:10}, 1, null]);
  c.update({}, {$inc: {a: 1}}, {multi: true});
  c.update({}, {$inc: {c: 1}}, {multi: true});
  test.equal(operations.shift(), ['changed', {a:3}, 0, {a:2}]);
  test.equal(operations.shift(), ['changed', {a:11}, 1, {a:10}]);
  c.update({a:11}, {a:1, b:44});
  test.equal(operations.shift(), ['changed', {a:1}, 1, {a:11}]);
  test.equal(operations.shift(), ['moved', {a:1}, 1, 0, 'foo']);
  c.remove({a:2});
  test.equal(operations.shift(), undefined);
  c.remove({a:3});
  test.equal(operations.shift(), ['removed', 'foo', 1, {a:3}]);

  // test stop
  handle.stop();
  var idA2 = Random.id();
  c.insert({_id: idA2, a:2});
  test.equal(operations.shift(), undefined);

  // test initial inserts (and backwards sort)
  handle = c.find({}, {sort: {a: -1}, fields: { a: 1 } }).observe(cbs);
  test.equal(operations.shift(), ['added', {a:2}, 0, null]);
  test.equal(operations.shift(), ['added', {a:1}, 1, null]);
  handle.stop();

  // test _suppress_initial
  handle = c.find({}, {sort: {a: -1}, fields: { a: 1 }}).observe(_.extend(cbs, {_suppress_initial: true}));
  test.equal(operations.shift(), undefined);
  c.insert({a:100, b: { foo: "bar" }});
  test.equal(operations.shift(), ['added', {a:100}, 0, idA2]);
  handle.stop();

  // test skip and limit.
  c.remove({});
  handle = c.find({}, {sort: {a: 1}, skip: 1, limit: 2, fields: { 'blacklisted': 0 }}).observe(cbs);
  test.equal(operations.shift(), undefined);
  c.insert({a:1, blacklisted:1324});
  test.equal(operations.shift(), undefined);
  c.insert({_id: 'foo', a:2, blacklisted:["something"]});
  test.equal(operations.shift(), ['added', {a:2}, 0, null]);
  c.insert({a:3, blacklisted: { 2: 3 }});
  test.equal(operations.shift(), ['added', {a:3}, 1, null]);
  c.insert({a:4, blacklisted: 6});
  test.equal(operations.shift(), undefined);
  c.update({a:1}, {a:0, blacklisted:4444});
  test.equal(operations.shift(), undefined);
  c.update({a:0}, {a:5, blacklisted:11111});
  test.equal(operations.shift(), ['removed', 'foo', 0, {a:2}]);
  test.equal(operations.shift(), ['added', {a:4}, 1, null]);
  c.update({a:3}, {a:3.5, blacklisted:333.4444});
  test.equal(operations.shift(), ['changed', {a:3.5}, 0, {a:3}]);
  handle.stop();

  // test _no_indices

  c.remove({});
  handle = c.find({}, {sort: {a: 1}, fields: { a: 1 }}).observe(_.extend(cbs, {_no_indices: true}));
  c.insert({_id: 'foo', a:1, zoo: "crazy"});
  test.equal(operations.shift(), ['added', {a:1}, -1, null]);
  c.update({a:1}, {$set: {a: 2, foobar: "player"}});
  test.equal(operations.shift(), ['changed', {a:2}, -1, {a:1}]);
  c.insert({a:10, b:123.45});
  test.equal(operations.shift(), ['added', {a:10}, -1, null]);
  c.update({}, {$inc: {a: 1, b:2}}, {multi: true});
  test.equal(operations.shift(), ['changed', {a:3}, -1, {a:2}]);
  test.equal(operations.shift(), ['changed', {a:11}, -1, {a:10}]);
  c.update({a:11, b:125.45}, {a:1, b:444});
  test.equal(operations.shift(), ['changed', {a:1}, -1, {a:11}]);
  test.equal(operations.shift(), ['moved', {a:1}, -1, -1, 'foo']);
  c.remove({a:2});
  test.equal(operations.shift(), undefined);
  c.remove({a:3});
  test.equal(operations.shift(), ['removed', 'foo', -1, {a:3}]);
  handle.stop();
});


Tinytest.add("minimongo - ordering", function (test) {
  var shortBinary = EJSON.newBinary(1);
  shortBinary[0] = 128;
  var longBinary1 = EJSON.newBinary(2);
  longBinary1[1] = 42;
  var longBinary2 = EJSON.newBinary(2);
  longBinary2[1] = 50;

  var date1 = new Date;
  var date2 = new Date(date1.getTime() + 1000);

  // value ordering
  assert_ordering(test, LocalCollection._f._cmp, [
    null,
    1, 2.2, 3,
    "03", "1", "11", "2", "a", "aaa",
    {}, {a: 2}, {a: 3}, {a: 3, b: 4}, {b: 4}, {b: 4, a: 3},
    {b: {}}, {b: [1, 2, 3]}, {b: [1, 2, 4]},
    [], [1, 2], [1, 2, 3], [1, 2, 4], [1, 2, "4"], [1, 2, [4]],
    shortBinary, longBinary1, longBinary2,
    new LocalCollection._ObjectID("1234567890abcd1234567890"),
    new LocalCollection._ObjectID("abcd1234567890abcd123456"),
    false, true,
    date1, date2
  ]);

  // document ordering under a sort specification
  var verify = function (sorts, docs) {
    _.each(sorts, function (sort) {
      assert_ordering(test, LocalCollection._compileSort(sort), docs);
    });
  };

  // note: [] doesn't sort with "arrays", it sorts as "undefined". the position
  // of arrays in _typeorder only matters for things like $lt. (This behavior
  // verified with MongoDB 2.2.1.) We don't define the relative order of {a: []}
  // and {c: 1} is undefined (MongoDB does seem to care but it's not clear how
  // or why).
  verify([{"a" : 1}, ["a"], [["a", "asc"]]],
         [{a: []}, {a: 1}, {a: {}}, {a: true}]);
  verify([{"a" : 1}, ["a"], [["a", "asc"]]],
         [{c: 1}, {a: 1}, {a: {}}, {a: true}]);
  verify([{"a" : -1}, [["a", "desc"]]],
         [{a: true}, {a: {}}, {a: 1}, {c: 1}]);
  verify([{"a" : -1}, [["a", "desc"]]],
         [{a: true}, {a: {}}, {a: 1}, {a: []}]);

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

Tinytest.add("minimongo - subkey sort", function (test) {
  var c = new LocalCollection();

  // normal case
  c.insert({a: {b: 2}});
  c.insert({a: {b: 1}});
  c.insert({a: {b: 3}});
  test.equal(
    _.pluck(c.find({}, {sort: {'a.b': -1}}).fetch(), 'a'),
    [{b: 3}, {b: 2}, {b: 1}]);

  // isn't an object
  c.insert({a: 1});
  test.equal(
    _.pluck(c.find({}, {sort: {'a.b': 1}}).fetch(), 'a'),
    [1, {b: 1}, {b: 2}, {b: 3}]);

  // complex object
  c.insert({a: {b: {c: 1}}});
  test.equal(
    _.pluck(c.find({}, {sort: {'a.b': -1}}).fetch(), 'a'),
    [{b: {c: 1}}, {b: 3}, {b: 2}, {b: 1}, 1]);

  // no such top level prop
  c.insert({c: 1});
  test.equal(
    _.pluck(c.find({}, {sort: {'a.b': -1}}).fetch(), 'a'),
    [{b: {c: 1}}, {b: 3}, {b: 2}, {b: 1}, 1, undefined]);

  // no such mid level prop. just test that it doesn't throw.
  test.equal(c.find({}, {sort: {'a.nope.c': -1}}).count(), 6);
});

Tinytest.add("minimongo - array sort", function (test) {
  var c = new LocalCollection();

  // "up" and "down" are the indices that the docs should have when sorted
  // ascending and descending by "a.x" respectively. They are not reverses of
  // each other: when sorting ascending, you use the minimum value you can find
  // in the document, and when sorting descending, you use the maximum value you
  // can find. So [1, 4] shows up in the 1 slot when sorting ascending and the 4
  // slot when sorting descending.
  c.insert({up: 1, down: 1, a: {x: [1, 4]}});
  c.insert({up: 2, down: 2, a: [{x: [2]}, {x: 3}]});
  c.insert({up: 0, down: 4, a: {x: 0}});
  c.insert({up: 3, down: 3, a: {x: 2.5}});
  c.insert({up: 4, down: 0, a: {x: 5}});

  test.equal(
    _.pluck(c.find({}, {sort: {'a.x': 1}}).fetch(), 'up'),
    _.range(c.find().count()));

  test.equal(
    _.pluck(c.find({}, {sort: {'a.x': -1}}).fetch(), 'down'),
    _.range(c.find().count()));
});

Tinytest.add("minimongo - binary search", function (test) {
  var forwardCmp = function (a, b) {
    return a - b;
  };

  var backwardCmp = function (a, b) {
    return -1 * forwardCmp(a, b);
  };

  var checkSearch = function (cmp, array, value, expected, message) {
    var actual = LocalCollection._binarySearch(cmp, array, value);
    if (expected != actual) {
      test.fail({type: "minimongo-binary-search",
                 message: message + " : Expected index " + expected +
                 " but had " + actual
      });
    }
  };

  var checkSearchForward = function (array, value, expected, message) {
    checkSearch(forwardCmp, array, value, expected, message);
  };
  var checkSearchBackward = function (array, value, expected, message) {
    checkSearch(backwardCmp, array, value, expected, message);
  };

  checkSearchForward([1, 2, 5, 7], 4, 2, "Inner insert");
  checkSearchForward([1, 2, 3, 4], 3, 3, "Inner insert, equal value");
  checkSearchForward([1, 2, 5], 4, 2, "Inner insert, odd length");
  checkSearchForward([1, 3, 5, 6], 9, 4, "End insert");
  checkSearchForward([1, 3, 5, 6], 0, 0, "Beginning insert");
  checkSearchForward([1], 0, 0, "Single array, less than.");
  checkSearchForward([1], 1, 1, "Single array, equal.");
  checkSearchForward([1], 2, 1, "Single array, greater than.");
  checkSearchForward([], 1, 0, "Empty array");
  checkSearchForward([1, 1, 1, 2, 2, 2, 2], 1, 3, "Highly degenerate array, lower");
  checkSearchForward([1, 1, 1, 2, 2, 2, 2], 2, 7, "Highly degenerate array, upper");
  checkSearchForward([2, 2, 2, 2, 2, 2, 2], 1, 0, "Highly degenerate array, lower");
  checkSearchForward([2, 2, 2, 2, 2, 2, 2], 2, 7, "Highly degenerate array, equal");
  checkSearchForward([2, 2, 2, 2, 2, 2, 2], 3, 7, "Highly degenerate array, upper");

  checkSearchBackward([7, 5, 2, 1], 4, 2, "Backward: Inner insert");
  checkSearchBackward([4, 3, 2, 1], 3, 2, "Backward: Inner insert, equal value");
  checkSearchBackward([5, 2, 1], 4, 1, "Backward: Inner insert, odd length");
  checkSearchBackward([6, 5, 3, 1], 9, 0, "Backward: Beginning insert");
  checkSearchBackward([6, 5, 3, 1], 0, 4, "Backward: End insert");
  checkSearchBackward([1], 0, 1, "Backward: Single array, less than.");
  checkSearchBackward([1], 1, 1, "Backward: Single array, equal.");
  checkSearchBackward([1], 2, 0, "Backward: Single array, greater than.");
  checkSearchBackward([], 1, 0, "Backward: Empty array");
  checkSearchBackward([2, 2, 2, 2, 1, 1, 1], 1, 7, "Backward: Degenerate array, lower");
  checkSearchBackward([2, 2, 2, 2, 1, 1, 1], 2, 4, "Backward: Degenerate array, upper");
  checkSearchBackward([2, 2, 2, 2, 2, 2, 2], 1, 7, "Backward: Highly degenerate array, upper");
  checkSearchBackward([2, 2, 2, 2, 2, 2, 2], 2, 7, "Backward: Highly degenerate array, upper");
  checkSearchBackward([2, 2, 2, 2, 2, 2, 2], 3, 0, "Backward: Highly degenerate array, upper");
});

Tinytest.add("minimongo - modify", function (test) {
  var modify = function (doc, mod, result) {
    var copy = EJSON.clone(doc);
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
      LocalCollection._modify(EJSON.clone(doc), mod);
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
  modify({}, {$push: {a: {$each: [1, 2, 3]}}},
         {a: [1, 2, 3]});
  modify({a: []}, {$push: {a: {$each: [1, 2, 3]}}},
         {a: [1, 2, 3]});
  modify({a: [true]}, {$push: {a: {$each: [1, 2, 3]}}},
         {a: [true, 1, 2, 3]});
  // No positive numbers for $slice
  exception({}, {$push: {a: {$each: [], $slice: 5}}});
  modify({a: [true]}, {$push: {a: {$each: [1, 2, 3], $slice: -2}}},
         {a: [2, 3]});
  modify({a: [false, true]}, {$push: {a: {$each: [1], $slice: -2}}},
         {a: [true, 1]});
  modify(
    {a: [{x: 3}, {x: 1}]},
    {$push: {a: {
      $each: [{x: 4}, {x: 2}],
      $slice: -2,
      $sort: {x: 1}
    }}},
    {a: [{x: 3}, {x: 4}]});
  modify({}, {$push: {a: {$each: [1, 2, 3], $slice: 0}}}, {a: []});
  modify({a: [1, 2]}, {$push: {a: {$each: [1, 2, 3], $slice: 0}}}, {a: []});

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

Tinytest.add("minimongo - observe ordered", function (test) {
  var operations = [];
  var cbs = log_callbacks(operations);
  var handle;

  var c = new LocalCollection();
  handle = c.find({}, {sort: {a: 1}}).observe(cbs);
  test.isTrue(handle.collection === c);

  c.insert({_id: 'foo', a:1});
  test.equal(operations.shift(), ['added', {a:1}, 0, null]);
  c.update({a:1}, {$set: {a: 2}});
  test.equal(operations.shift(), ['changed', {a:2}, 0, {a:1}]);
  c.insert({a:10});
  test.equal(operations.shift(), ['added', {a:10}, 1, null]);
  c.update({}, {$inc: {a: 1}}, {multi: true});
  test.equal(operations.shift(), ['changed', {a:3}, 0, {a:2}]);
  test.equal(operations.shift(), ['changed', {a:11}, 1, {a:10}]);
  c.update({a:11}, {a:1});
  test.equal(operations.shift(), ['changed', {a:1}, 1, {a:11}]);
  test.equal(operations.shift(), ['moved', {a:1}, 1, 0, 'foo']);
  c.remove({a:2});
  test.equal(operations.shift(), undefined);
  c.remove({a:3});
  test.equal(operations.shift(), ['removed', 'foo', 1, {a:3}]);

  // test stop
  handle.stop();
  var idA2 = Random.id();
  c.insert({_id: idA2, a:2});
  test.equal(operations.shift(), undefined);

  // test initial inserts (and backwards sort)
  handle = c.find({}, {sort: {a: -1}}).observe(cbs);
  test.equal(operations.shift(), ['added', {a:2}, 0, null]);
  test.equal(operations.shift(), ['added', {a:1}, 1, null]);
  handle.stop();

  // test _suppress_initial
  handle = c.find({}, {sort: {a: -1}}).observe(_.extend(cbs, {_suppress_initial: true}));
  test.equal(operations.shift(), undefined);
  c.insert({a:100});
  test.equal(operations.shift(), ['added', {a:100}, 0, idA2]);
  handle.stop();

  // test skip and limit.
  c.remove({});
  handle = c.find({}, {sort: {a: 1}, skip: 1, limit: 2}).observe(cbs);
  test.equal(operations.shift(), undefined);
  c.insert({a:1});
  test.equal(operations.shift(), undefined);
  c.insert({_id: 'foo', a:2});
  test.equal(operations.shift(), ['added', {a:2}, 0, null]);
  c.insert({a:3});
  test.equal(operations.shift(), ['added', {a:3}, 1, null]);
  c.insert({a:4});
  test.equal(operations.shift(), undefined);
  c.update({a:1}, {a:0});
  test.equal(operations.shift(), undefined);
  c.update({a:0}, {a:5});
  test.equal(operations.shift(), ['removed', 'foo', 0, {a:2}]);
  test.equal(operations.shift(), ['added', {a:4}, 1, null]);
  c.update({a:3}, {a:3.5});
  test.equal(operations.shift(), ['changed', {a:3.5}, 0, {a:3}]);
  handle.stop();

  // test _no_indices

  c.remove({});
  handle = c.find({}, {sort: {a: 1}}).observe(_.extend(cbs, {_no_indices: true}));
  c.insert({_id: 'foo', a:1});
  test.equal(operations.shift(), ['added', {a:1}, -1, null]);
  c.update({a:1}, {$set: {a: 2}});
  test.equal(operations.shift(), ['changed', {a:2}, -1, {a:1}]);
  c.insert({a:10});
  test.equal(operations.shift(), ['added', {a:10}, -1, null]);
  c.update({}, {$inc: {a: 1}}, {multi: true});
  test.equal(operations.shift(), ['changed', {a:3}, -1, {a:2}]);
  test.equal(operations.shift(), ['changed', {a:11}, -1, {a:10}]);
  c.update({a:11}, {a:1});
  test.equal(operations.shift(), ['changed', {a:1}, -1, {a:11}]);
  test.equal(operations.shift(), ['moved', {a:1}, -1, -1, 'foo']);
  c.remove({a:2});
  test.equal(operations.shift(), undefined);
  c.remove({a:3});
  test.equal(operations.shift(), ['removed', 'foo', -1, {a:3}]);
  handle.stop();
});

_.each([true, false], function (ordered) {
  Tinytest.add("minimongo - observe ordered: " + ordered, function (test) {
    var c = new LocalCollection();

    var ev = "";
    var makecb = function (tag) {
      var ret = {};
      _.each(["added", "changed", "removed"], function (fn) {
        var fnName = ordered ? fn + "At" : fn;
        ret[fnName] = function (doc) {
          ev = (ev + fn.substr(0, 1) + tag + doc._id + "_");
        };
      });
      return ret;
    };
    var expect = function (x) {
      test.equal(ev, x);
      ev = "";
    };

    c.insert({_id: 1, name: "strawberry", tags: ["fruit", "red", "squishy"]});
    c.insert({_id: 2, name: "apple", tags: ["fruit", "red", "hard"]});
    c.insert({_id: 3, name: "rose", tags: ["flower", "red", "squishy"]});

    // This should work equally well for ordered and unordered observations
    // (because the callbacks don't look at indices and there's no 'moved'
    // callback).
    var handle = c.find({tags: "flower"}).observe(makecb('a'));
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

    // Test that observing a lookup by ID works.
    handle = c.find(4).observe(makecb('b'));
    expect('ab4_');
    c.update(4, {$set: {eek: 5}});
    expect('cb4_');
    handle.stop();

    // Test observe with reactive: false.
    handle = c.find({tags: "flower"}, {reactive: false}).observe(makecb('c'));
    expect('ac4_ac5_');
    // This insert shouldn't trigger a callback because it's not reactive.
    c.insert({_id: 6, name: "river", tags: ["flower"]});
    expect('');
    handle.stop();
  });
});


Tinytest.add("minimongo - diff changes ordering", function (test) {
  var makeDocs = function (ids) {
    return _.map(ids, function (id) { return {_id: id};});
  };
  var testMutation = function (a, b) {
    var aa = makeDocs(a);
    var bb = makeDocs(b);
    var aaCopy = EJSON.clone(aa);
    LocalCollection._diffQueryOrderedChanges(aa, bb, {

      addedBefore: function (id, doc, before) {
        if (before === null) {
          aaCopy.push( _.extend({_id: id}, doc));
          return;
        }
        for (var i = 0; i < aaCopy.length; i++) {
          if (aaCopy[i]._id === before) {
            aaCopy.splice(i, 0, _.extend({_id: id}, doc));
            return;
          }
        }
      },
      movedBefore: function (id, before) {
        var found;
        for (var i = 0; i < aaCopy.length; i++) {
          if (aaCopy[i]._id === id) {
            found = aaCopy[i];
            aaCopy.splice(i, 1);
          }
        }
        if (before === null) {
          aaCopy.push( _.extend({_id: id}, found));
          return;
        }
        for (i = 0; i < aaCopy.length; i++) {
          if (aaCopy[i]._id === before) {
            aaCopy.splice(i, 0, _.extend({_id: id}, found));
            return;
          }
        }
      },
      removed: function (id) {
        var found;
        for (var i = 0; i < aaCopy.length; i++) {
          if (aaCopy[i]._id === id) {
            found = aaCopy[i];
            aaCopy.splice(i, 1);
          }
        }
      }
    });
    test.equal(aaCopy, bb);
  };

  var testBothWays = function (a, b) {
    testMutation(a, b);
    testMutation(b, a);
  };

  testBothWays(["a", "b", "c"], ["c", "b", "a"]);
  testBothWays(["a", "b", "c"], []);
  testBothWays(["a", "b", "c"], ["e","f"]);
  testBothWays(["a", "b", "c", "d"], ["c", "b", "a"]);
  testBothWays(['A','B','C','D','E','F','G','H','I'],
               ['A','B','F','G','C','D','I','L','M','N','H']);
  testBothWays(['A','B','C','D','E','F','G','H','I'],['A','B','C','D','F','G','H','E','I']);
});

Tinytest.add("minimongo - diff", function (test) {

  // test correctness

  var diffTest = function(origLen, newOldIdx) {
    var oldResults = new Array(origLen);
    for (var i = 1; i <= origLen; i++)
      oldResults[i-1] = {_id: i};

    var newResults = _.map(newOldIdx, function(n) {
      var doc = {_id: Math.abs(n)};
      if (n < 0)
        doc.changed = true;
      return doc;
    });
    var find = function (arr, id) {
      for (var i = 0; i < arr.length; i++) {
        if (EJSON.equals(arr[i]._id, id))
          return i;
      }
      return -1;
    };

    var results = _.clone(oldResults);
    var observer = {
      addedBefore: function(id, fields, before) {
        var before_idx;
        if (before === null)
          before_idx = results.length;
        else
          before_idx = find (results, before);
        var doc = _.extend({_id: id}, fields);
        test.isFalse(before_idx < 0 || before_idx > results.length);
        results.splice(before_idx, 0, doc);
      },
      removed: function(id) {
        var at_idx = find (results, id);
        test.isFalse(at_idx < 0 || at_idx >= results.length);
        results.splice(at_idx, 1);
      },
      changed: function(id, fields) {
        var at_idx = find (results, id);
        var oldDoc = results[at_idx];
        var doc = EJSON.clone(oldDoc);
        LocalCollection._applyChanges(doc, fields);
        test.isFalse(at_idx < 0 || at_idx >= results.length);
        test.equal(doc._id, oldDoc._id);
        results[at_idx] = doc;
      },
      movedBefore: function(id, before) {
        var old_idx = find(results, id);
        var new_idx;
        if (before === null)
          new_idx = results.length;
        else
          new_idx = find (results, before);
        if (new_idx > old_idx)
          new_idx--;
        test.isFalse(old_idx < 0 || old_idx >= results.length);
        test.isFalse(new_idx < 0 || new_idx >= results.length);
        results.splice(new_idx, 0, results.splice(old_idx, 1)[0]);
      }
    };

    LocalCollection._diffQueryOrderedChanges(oldResults, newResults, observer);
    test.equal(results, newResults);
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


Tinytest.add("minimongo - saveOriginals", function (test) {
  // set up some data
  var c = new LocalCollection(),
      count;
  c.insert({_id: 'foo', x: 'untouched'});
  c.insert({_id: 'bar', x: 'updateme'});
  c.insert({_id: 'baz', x: 'updateme'});
  c.insert({_id: 'quux', y: 'removeme'});
  c.insert({_id: 'whoa', y: 'removeme'});

  // Save originals and make some changes.
  c.saveOriginals();
  c.insert({_id: "hooray", z: 'insertme'});
  c.remove({y: 'removeme'});
  count = c.update({x: 'updateme'}, {$set: {z: 5}}, {multi: true});
  c.update('bar', {$set: {k: 7}});  // update same doc twice

  // Verify returned count is correct
  test.equal(count, 2);

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

Tinytest.add("minimongo - objectid transformation", function (test) {
  var testId = function (item) {
    test.equal(item, LocalCollection._idParse(LocalCollection._idStringify(item)));
  };
  var randomOid = new LocalCollection._ObjectID();
  testId(randomOid);
  testId("FOO");
  testId("ffffffffffff");
  testId("0987654321abcdef09876543");
  testId(new LocalCollection._ObjectID());
  testId("--a string");

  test.equal("ffffffffffff", LocalCollection._idParse(LocalCollection._idStringify("ffffffffffff")));
});


Tinytest.add("minimongo - objectid", function (test) {
  var randomOid = new LocalCollection._ObjectID();
  var anotherRandomOid = new LocalCollection._ObjectID();
  test.notEqual(randomOid, anotherRandomOid);
  test.throws(function() { new LocalCollection._ObjectID("qqqqqqqqqqqqqqqqqqqqqqqq");});
  test.throws(function() { new LocalCollection._ObjectID("ABCDEF"); });
  test.equal(randomOid, new LocalCollection._ObjectID(randomOid.valueOf()));
});

Tinytest.add("minimongo - pause", function (test) {
  var operations = [];
  var cbs = log_callbacks(operations);

  var c = new LocalCollection();
  var h = c.find({}).observe(cbs);

  // remove and add cancel out.
  c.insert({_id: 1, a: 1});
  test.equal(operations.shift(), ['added', {a:1}, 0, null]);

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

  h.stop();
});

Tinytest.add("minimongo - ids matched by selector", function (test) {
  var check = function (selector, ids) {
    var idsFromSelector = LocalCollection._idsMatchedBySelector(selector);
    // XXX normalize order, in a way that also works for ObjectIDs?
    test.equal(idsFromSelector, ids);
  };
  check("foo", ["foo"]);
  check({_id: "foo"}, ["foo"]);
  var oid1 = new LocalCollection._ObjectID();
  check(oid1, [oid1]);
  check({_id: oid1}, [oid1]);
  check({_id: "foo", x: 42}, ["foo"]);
  check({}, null);
  check({_id: {$in: ["foo", oid1]}}, ["foo", oid1]);
  check({_id: {$ne: "foo"}}, null);
  // not actually valid, but works for now...
  check({$and: ["foo"]}, ["foo"]);
  check({$and: [{x: 42}, {_id: oid1}]}, [oid1]);
  check({$and: [{x: 42}, {_id: {$in: [oid1]}}]}, [oid1]);
});

Tinytest.add("minimongo - reactive stop", function (test) {
  var coll = new LocalCollection();
  coll.insert({_id: 'A'});
  coll.insert({_id: 'B'});
  coll.insert({_id: 'C'});

  var addBefore = function (str, newChar, before) {
    var idx = str.indexOf(before);
    if (idx === -1)
      return str + newChar;
    return str.slice(0, idx) + newChar + str.slice(idx);
  };

  var x, y;
  var sortOrder = ReactiveVar(1);

  var c = Deps.autorun(function () {
    var q = coll.find({}, {sort: {_id: sortOrder.get()}});
    x = "";
    q.observe({ addedAt: function (doc, atIndex, before) {
      x = addBefore(x, doc._id, before);
    }});
    y = "";
    q.observeChanges({ addedBefore: function (id, fields, before) {
      y = addBefore(y, id, before);
    }});
  });

  test.equal(x, "ABC");
  test.equal(y, "ABC");

  sortOrder.set(-1);
  test.equal(x, "ABC");
  test.equal(y, "ABC");
  Deps.flush();
  test.equal(x, "CBA");
  test.equal(y, "CBA");

  coll.insert({_id: 'D'});
  coll.insert({_id: 'E'});
  test.equal(x, "EDCBA");
  test.equal(y, "EDCBA");

  c.stop();
  // stopping kills the observes immediately
  coll.insert({_id: 'F'});
  test.equal(x, "EDCBA");
  test.equal(y, "EDCBA");
});

Tinytest.add("minimongo - immediate invalidate", function (test) {
  var coll = new LocalCollection();
  coll.insert({_id: 'A'});

  // This has two separate findOnes.  findOne() uses skip/limit, which means
  // that its response to an update() call involves a recompute. We used to have
  // a bug where we would first calculate all the calls that need to be
  // recomputed, then recompute them one by one, without checking to see if the
  // callbacks from recomputing one query stopped the second query, which
  // crashed.
  var c = Deps.autorun(function () {
    coll.findOne('A');
    coll.findOne('A');
  });

  coll.update('A', {$set: {x: 42}});

  c.stop();
});


Tinytest.add("minimongo - count on cursor with limit", function(test){
  var coll = new LocalCollection(), count;

  coll.insert({_id: 'A'});
  coll.insert({_id: 'B'});
  coll.insert({_id: 'C'});
  coll.insert({_id: 'D'});

  var c = Deps.autorun(function (c) {
    var cursor = coll.find({_id: {$exists: true}}, {sort: {_id: 1}, limit: 3});
    count = cursor.count();
  });

  test.equal(count, 3);

  coll.remove('A'); // still 3 in the collection
  Deps.flush();
  test.equal(count, 3);

  coll.remove('B'); // expect count now 2
  Deps.flush();
  test.equal(count, 2);


  coll.insert({_id: 'A'}); // now 3 again
  Deps.flush();
  test.equal(count, 3);

  coll.insert({_id: 'B'}); // now 4 entries, but count should be 3 still
  Deps.flush();
  test.equal(count, 3);

  c.stop();

});

Tinytest.add("minimongo - $near operator tests", function (test) {
  var coll = new LocalCollection();
  coll.insert({ rest: { loc: [2, 3] } });
  coll.insert({ rest: { loc: [-3, 3] } });
  coll.insert({ rest: { loc: [5, 5] } });

  test.equal(coll.find({ 'rest.loc': { $near: [0, 0], $maxDistance: 30 } }).count(), 3);
  test.equal(coll.find({ 'rest.loc': { $near: [0, 0], $maxDistance: 4 } }).count(), 1);
  var points = coll.find({ 'rest.loc': { $near: [0, 0], $maxDistance: 6 } }).fetch();
  _.each(points, function (point, i, points) {
    test.isTrue(!i || distance([0, 0], point.rest.loc) >= distance([0, 0], points[i - 1].rest.loc));
  });

  function distance(a, b) {
    var x = a[0] - b[0];
    var y = a[1] - b[1];
    return Math.sqrt(x * x + y * y);
  }

  // GeoJSON tests
  coll = new LocalCollection();
  var data = [{ "category" : "BURGLARY", "descript" : "BURGLARY OF STORE, FORCIBLE ENTRY", "address" : "100 Block of 10TH ST", "location" : { "type" : "Point", "coordinates" : [  -122.415449723856,  37.7749518087273 ] } },
    { "category" : "WEAPON LAWS", "descript" : "POSS OF PROHIBITED WEAPON", "address" : "900 Block of MINNA ST", "location" : { "type" : "Point", "coordinates" : [  -122.415386041221,  37.7747879744156 ] } },
    { "category" : "LARCENY/THEFT", "descript" : "GRAND THEFT OF PROPERTY", "address" : "900 Block of MINNA ST", "location" : { "type" : "Point", "coordinates" : [  -122.41538270191,  37.774683628213 ] } },
    { "category" : "LARCENY/THEFT", "descript" : "PETTY THEFT FROM LOCKED AUTO", "address" : "900 Block of MINNA ST", "location" : { "type" : "Point", "coordinates" : [  -122.415396041221,  37.7747879744156 ] } },
    { "category" : "OTHER OFFENSES", "descript" : "POSSESSION OF BURGLARY TOOLS", "address" : "900 Block of MINNA ST", "location" : { "type" : "Point", "coordinates" : [  -122.415386041221,  37.7747879734156 ] } }
  ];

  _.each(data, function (x, i) { coll.insert(_.extend(x, { x: i })); });

  var close15 = coll.find({ location: { $near: {
    $geometry: { type: "Point",
                 coordinates: [-122.4154282, 37.7746115] },
    $maxDistance: 15 } } }).fetch();
  test.length(close15, 1);
  test.equal(close15[0].descript, "GRAND THEFT OF PROPERTY");

  var close20 = coll.find({ location: { $near: {
    $geometry: { type: "Point",
                 coordinates: [-122.4154282, 37.7746115] },
    $maxDistance: 20 } } }).fetch();
  test.length(close20, 4);
  test.equal(close20[0].descript, "GRAND THEFT OF PROPERTY");
  test.equal(close20[1].descript, "PETTY THEFT FROM LOCKED AUTO");
  test.equal(close20[2].descript, "POSSESSION OF BURGLARY TOOLS");
  test.equal(close20[3].descript, "POSS OF PROHIBITED WEAPON");

  // Any combinations of $near with $or/$and/$nor/$not should throw an error
  test.throws(function () {
    coll.find({ location: {
      $not: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [-122.4154282, 37.7746115]
          }, $maxDistance: 20 } } } });
  });
  test.throws(function () {
    coll.find({
      $and: [ { location: { $near: { $geometry: { type: "Point", coordinates: [-122.4154282, 37.7746115] }, $maxDistance: 20 }}},
              { x: 0 }]
    });
  });
  test.throws(function () {
    coll.find({
      $or: [ { location: { $near: { $geometry: { type: "Point", coordinates: [-122.4154282, 37.7746115] }, $maxDistance: 20 }}},
             { x: 0 }]
    });
  });
  test.throws(function () {
    coll.find({
      $nor: [ { location: { $near: { $geometry: { type: "Point", coordinates: [-122.4154282, 37.7746115] }, $maxDistance: 1 }}},
              { x: 0 }]
    });
  });
  test.throws(function () {
    coll.find({
      $and: [{
        $and: [{
          location: {
            $near: {
              $geometry: {
                type: "Point",
                coordinates: [-122.4154282, 37.7746115]
              },
              $maxDistance: 1
            }
          }
        }]
      }]
    });
  });
});

