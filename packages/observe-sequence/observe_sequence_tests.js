// @param test {Object} as passed to Tinytest.add
// @param stripIds {Boolean} If true, strip the id arguments. For test
//     cases with items that aren't objects with an '_id' field.
// @param sequenceFunc {Function(): sequence type}
// @param run {Function()} modify the sequence or cause sequenceFunc
//     to be recomupted
// @param expectedCallbacks {Array} elements look like {addedAt: arguments}
runOneObserveSequenceTestCase = function (test, stripIds, sequenceFunc,
                                       run, expectedCallbacks) {
  var firedCallbacks = [];
  var handle = ObserveSequence.observe(sequenceFunc, {
    addedAt: function () {
      if (stripIds)
        // [item, atIndex, before]
        firedCallbacks.push({addedAt: [arguments[1], arguments[2], arguments[3]]});
      else
        firedCallbacks.push({addedAt: _.toArray(arguments)});
    },
    changed: function () {
      if (stripIds)
        // [newItem, oldItem]
        firedCallbacks.push({changed: [arguments[1], arguments[2]]});
      else
        firedCallbacks.push({changed: _.toArray(arguments)});
    },
    removed: function () {
      if (stripIds)
        // [oldItem]
        firedCallbacks.push({removed: [arguments[1]]});
      else
        firedCallbacks.push({removed: _.toArray(arguments)});
    },
    movedTo: function () {
      if (stripIds)
        // [item, fromIndex, toIndex, before]
        firedCallbacks.push({movedTo: [arguments[1], arguments[2], arguments[3], arguments[4]]});
      else
        firedCallbacks.push({movedTo: _.toArray(arguments)});
    }
  });

  run();
  Deps.flush();
  handle.stop();
  test.equal(firedCallbacks, expectedCallbacks);
};

Tinytest.add('observe sequence - initial data for all sequence types', function (test) {
  runOneObserveSequenceTestCase(test, /*stripIds=*/ true, function () {
    return null;
  }, function () {}, []);

  runOneObserveSequenceTestCase(test, /*stripIds=*/ true, function () {
    return [];
  }, function () {}, []);

  runOneObserveSequenceTestCase(test, /*stripIds=*/ true, function () {
    return [{foo: 1}, {bar: 2}];
  }, function () {}, [
    {addedAt: [{foo: 1}, 0, null]},
    {addedAt: [{bar: 2}, 1, null]}
  ]);

  runOneObserveSequenceTestCase(test, /*stripIds=*/ false, function () {
    return [{_id: "13", foo: 1}, {_id: "37", bar: 2}];
  }, function () {}, [
    {addedAt: ["13", {_id: "13", foo: 1}, 0, null]},
    {addedAt: ["37", {_id: "37", bar: 2}, 1, null]}
  ]);

  runOneObserveSequenceTestCase(test, /*stripIds=*/ false, function () {
    var coll = new Meteor.Collection(null);
    coll.insert({_id: "13", foo: 1});
    coll.insert({_id: "37", bar: 2});
    var cursor = coll.find({}, {sort: {_id: 1}});
    return cursor;
  }, function () {}, [
    {addedAt: ["13", {_id: "13", foo: 1}, 0, null]},
    {addedAt: ["37", {_id: "37", bar: 2}, 1, null]}
  ]);
});

Tinytest.add('observe sequence - array to other array', function (test) {
  var dep = new Deps.Dependency;
  var seq = [{_id: "13", foo: 1}, {_id: "37", bar: 2}];

  runOneObserveSequenceTestCase(test, /*stripIds=*/ false, function () {
    dep.depend();
    return seq;
  }, function () {
    seq = [{_id: "13", foo: 1}, {_id: "38", bar: 2}];
    dep.changed();
  }, [
    {addedAt: ["13", {_id: "13", foo: 1}, 0, null]},
    {addedAt: ["37", {_id: "37", bar: 2}, 1, null]},
    {removed: ["37", {_id: "37", bar: 2}]},
    {addedAt: ["38", {_id: "38", bar: 2}, 1, null]},
    {changed: ["13", {_id: "13", foo: 1}, {_id: "13", foo: 1}]}
    // XXX yeah, it didn't change at all but current implementation is too lazy
    // to diff objects (and it's not always possible, since you can't diff
    // objects with circular refferences)
  ]);
});

Tinytest.add('observe sequence - array to other array, changes', function (test) {
  var dep = new Deps.Dependency;
  var seq = [{_id: "13", foo: 1}, {_id: "37", bar: 2}, {_id: "42", baz: 42}];

  runOneObserveSequenceTestCase(test, /*stripIds=*/ false, function () {
    dep.depend();
    return seq;
  }, function () {
    seq = [{_id: "13", foo: 1}, {_id: "38", bar: 2}, {_id: "42", baz: 43}];
    dep.changed();
  }, [
    {addedAt: ["13", {_id: "13", foo: 1}, 0, null]},
    {addedAt: ["37", {_id: "37", bar: 2}, 1, null]},
    {addedAt: ["42", {_id: "42", baz: 42}, 2, null]},
    {removed: ["37", {_id: "37", bar: 2}]},
    {addedAt: ["38", {_id: "38", bar: 2}, 1, "42"]},
    {changed: ["13", {_id: "13", foo: 1}, {_id: "13", foo: 1}]}, // XXX doesn't really change
    {changed: ["42", {_id: "42", baz: 42}, {_id: "42", baz: 43}]}
  ]);
});

Tinytest.add('observe sequence - array to other array, movedTo', function (test) {
  var dep = new Deps.Dependency;
  var seq = [{_id: "13", foo: 1}, {_id: "37", bar: 2}, {_id: "42", baz: 42}];

  runOneObserveSequenceTestCase(test, /*stripIds=*/ false, function () {
    dep.depend();
    return seq;
  }, function () {
    seq = [{_id: "37", bar: 2}, {_id: "13", foo: 1}, {_id: "42", baz: 42}];
    dep.changed();
  }, [
    {addedAt: ["13", {_id: "13", foo: 1}, 0, null]},
    {addedAt: ["37", {_id: "37", bar: 2}, 1, null]},
    {addedAt: ["42", {_id: "42", baz: 42}, 2, null]},
    {movedTo: ["37", {_id: "37", bar: 2}, 1, 0, "13"]},
    {changed: ["13", {_id: "13", foo: 1}, {_id: "13", foo: 1}]}, // XXX doesn't really change
    {changed: ["37", {_id: "37", bar: 2}, {_id: "37", bar: 2}]}, // XXX doesn't really change
    {changed: ["42", {_id: "42", baz: 42}, {_id: "42", baz: 42}]} // XXX doesn't really change
  ]);
});

Tinytest.add('observe sequence - array to null', function (test) {
  var dep = new Deps.Dependency;
  var seq = [{_id: "13", foo: 1}, {_id: "37", bar: 2}];

  runOneObserveSequenceTestCase(test, /*stripIds=*/ false, function () {
    dep.depend();
    return seq;
  }, function () {
    seq = null;
    dep.changed();
  }, [
    {addedAt: ["13", {_id: "13", foo: 1}, 0, null]},
    {addedAt: ["37", {_id: "37", bar: 2}, 1, null]},
    {removed: ["13", {_id: "13", foo: 1}]},
    {removed: ["37", {_id: "37", bar: 2}]}
  ]);
});

Tinytest.add('observe sequence - array to cursor', function (test) {
  var dep = new Deps.Dependency;
  var seq = [{_id: "13", foo: 1}, {_id: "37", bar: 2}];

  runOneObserveSequenceTestCase(test, /*stripIds=*/ false, function () {
    dep.depend();
    return seq;
  }, function () {
    var coll = new Meteor.Collection(null);
    coll.insert({_id: "13", foo: 1});
    coll.insert({_id: "38", bar: 2});
    var cursor = coll.find({}, {sort: {_id: 1}});
    seq = cursor;
    dep.changed();
  }, [
    {addedAt: ["13", {_id: "13", foo: 1}, 0, null]},
    {addedAt: ["37", {_id: "37", bar: 2}, 1, null]},
    {removed: ["37", {_id: "37", bar: 2}]},
    {addedAt: ["38", {_id: "38", bar: 2}, 1, null]},
    {changed: ["13", {_id: "13", foo: 1}, {_id: "13", foo: 1}]} // XXX doesn't actually change
  ]);
});


Tinytest.add('observe sequence - cursor to null', function (test) {
  var dep = new Deps.Dependency;
  var coll = new Meteor.Collection(null);
  coll.insert({_id: "13", foo: 1});
  coll.insert({_id: "37", bar: 2});
  var cursor = coll.find({}, {sort: {_id: 1}});
  var seq = cursor;

  runOneObserveSequenceTestCase(test, /*stripIds=*/ false, function () {
    dep.depend();
    return seq;
  }, function () {
    seq = null;
    dep.changed();
  }, [
    {addedAt: ["13", {_id: "13", foo: 1}, 0, null]},
    {addedAt: ["37", {_id: "37", bar: 2}, 1, null]},
    {removed: ["13", {_id: "13", foo: 1}]},
    {removed: ["37", {_id: "37", bar: 2}]}
  ]);
});

Tinytest.add('observe sequence - cursor to array', function (test) {
  var dep = new Deps.Dependency;
  var coll = new Meteor.Collection(null);
  coll.insert({_id: "13", foo: 1});
  var cursor = coll.find({}, {sort: {_id: 1}});
  var seq = cursor;

  runOneObserveSequenceTestCase(test, /*stripIds=*/ false, function () {
    dep.depend();
    return seq;
  }, function () {
    coll.insert({_id: "37", bar: 2});
    dep.changed();
    seq = [{_id: "13", foo: 1}, {_id: "38", bar: 2}];
    dep.changed();
  }, [
    {addedAt: ["13", {_id: "13", foo: 1}, 0, null]},
    {addedAt: ["37", {_id: "37", bar: 2}, 1, null]},
    {removed: ["37", {_id: "37", bar: 2}]},
    {addedAt: ["38", {_id: "38", bar: 2}, 1, null]},
    {changed: ["13", {_id: "13", foo: 1}, {_id: "13", foo: 1}]}
  ]);
});

Tinytest.add('observe sequence - cursor', function (test) {
  var coll = new Meteor.Collection(null);
  coll.insert({_id: "13", rank: 1});
  var cursor = coll.find({}, {sort: {rank: 1}});
  var seq = cursor;

  runOneObserveSequenceTestCase(test, /*stripIds=*/ false, function () {
    return seq;
  }, function () {
    coll.insert({_id: "37", rank: 2});
    coll.insert({_id: "77", rank: 3});
    coll.remove({_id: "37"});                           // should fire a 'remove' callback
    coll.insert({_id: "11", rank: 0});                  // should fire an 'insert' callback
    coll.update({_id: "13"}, {$set: {updated: true}});  // should fire an 'changed' callback
    coll.update({_id: "77"}, {$set: {rank: -1}});       // should fire 'changed' and 'move' callback
  }, [
    // this case must not fire spurious calls as the array to array
    // case does. otherwise, the entire power of cursors is lost in
    // meteor ui.
    {addedAt: ["13", {_id: "13", rank: 1}, 0, null]},
    {addedAt: ["37", {_id: "37", rank: 2}, 1, null]},
    {addedAt: ["77", {_id: "77", rank: 3}, 2, null]},
    {removed: ["37", {_id: "37", rank: 2}]},
    {addedAt: ["11", {_id: "11", rank: 0}, 0, "13"]},
    {changed: ["13", {_id: "13", rank: 1, updated: true}, {_id: "13", rank: 1}]},
    {changed: ["77", {_id: "77", rank: -1}, {_id: "77", rank: 3}]},
    {movedTo: ["77", {_id: "77", rank: -1}, 2, 0, "11"]}
  ]);
});

Tinytest.add('observe sequence - cursor to other cursor', function (test) {
  var dep = new Deps.Dependency;
  var coll = new Meteor.Collection(null);
  coll.insert({_id: "13", foo: 1});
  var cursor = coll.find({}, {sort: {_id: 1}});
  var seq = cursor;

  runOneObserveSequenceTestCase(test, /*stripIds=*/ false, function () {
    dep.depend();
    return seq;
  }, function () {
    coll.insert({_id: "37", bar: 2});

    var newColl = new Meteor.Collection(null);
    newColl.insert({_id: "13", foo: 1});
    newColl.insert({_id: "38", bar: 2});
    var newCursor = newColl.find({}, {sort: {_id: 1}});
    seq = newCursor;
    dep.changed();
  }, [
    {addedAt: ["13", {_id: "13", foo: 1}, 0, null]},
    {addedAt: ["37", {_id: "37", bar: 2}, 1, null]},
    {removed: ["37", {_id: "37", bar: 2}]},
    {addedAt: ["38", {_id: "38", bar: 2}, 1, null]},
    {changed: ["13", {_id: "13", foo: 1}, {_id: "13", foo: 1}]} // XXX this doesn't really change
  ]);
});

Tinytest.add('observe sequence - cursor to same cursor', function (test) {
  var coll = new Meteor.Collection(null);
  coll.insert({_id: "13", rank: 1});
  var cursor = coll.find({}, {sort: {rank: 1}});
  var seq = cursor;
  var dep = new Deps.Dependency;

  runOneObserveSequenceTestCase(test, /*stripIds=*/ false, function () {
    dep.depend();
    return seq;
  }, function () {
    dep.changed();
  }, [ {addedAt: ["13", {_id: "13", rank: 1}, 0, null]} ]);
});

