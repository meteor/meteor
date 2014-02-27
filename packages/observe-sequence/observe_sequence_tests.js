// Run a function named `run` which modifies a sequence. While it
// executes, observe changes to the sequence and accumulate them in an
// array, canonicalizing as necessary. Then make sure the results are
// the same as passed in `expectedCallbacks`. In items in
// `expectedCallbacks`, allow for special values of the form {NOT:
// "foo"}, which match anything other than "foo".
//
// @param test {Object} as passed to Tinytest.add
// @param sequenceFunc {Function(): sequence type}
// @param run {Function()} modify the sequence or cause sequenceFunc
//     to be recomupted
// @param expectedCallbacks {Array}
//     elements are objects eg {addedAt: [array of arguments]}
// @param numExpectedWarnings {Number}
runOneObserveSequenceTestCase = function (test, sequenceFunc,
                                          run, expectedCallbacks,
                                          numExpectedWarnings) {
  if (numExpectedWarnings)
    ObserveSequence._suppressWarnings += numExpectedWarnings;

  var firedCallbacks = [];
  var handle = ObserveSequence.observe(sequenceFunc, {
    addedAt: function () {
      firedCallbacks.push({addedAt: _.toArray(arguments)});
    },
    changed: function () {
      var obj = {changed: _.toArray(arguments)};

      // Browsers are inconsistent about the order in which 'changed'
      // callbacks fire. To ensure consistent behavior of these tests,
      // we can't simply push `obj` at the end of `firedCallbacks` as
      // we do for the other callbacks. Instead, we use insertion sort
      // to place `obj` in a canonical position within the chunk of
      // contiguously recently fired 'changed' callbacks.
      for (var i = firedCallbacks.length; i > 0; i--) {

        var compareTo = firedCallbacks[i - 1];
        if (!compareTo.changed)
          break;

        if (EJSON.stringify(compareTo, {canonical: true}) <
            EJSON.stringify(obj, {canonical: true}))
          break;
      }

      firedCallbacks.splice(i, 0, obj);
    },
    removed: function () {
      firedCallbacks.push({removed: _.toArray(arguments)});
    },
    movedTo: function () {
      firedCallbacks.push({movedTo: _.toArray(arguments)});
    }
  });

  run();
  Deps.flush();
  handle.stop();

  test.equal(ObserveSequence._suppressWarnings, 0);
  test.equal(ObserveSequence._loggedWarnings, 0);
  ObserveSequence._loggedWarnings = 0;

  // any expected argument this is `{NOT: "foo"}`, should match any
  // corresponding value in the fired callbacks other than "foo". so,
  // assert non-equality and then replace the appropriate entries in
  // the 'firedCallbacks' array with `{NOT: "foo"}` before calling
  // `test.equal` below.
  var commonLength = Math.min(firedCallbacks.length, expectedCallbacks.length);
  for (var i = 0; i < commonLength; i++) {
    var callback = expectedCallbacks[i];
    if (_.keys(callback).length !== 1)
      throw new Error("Callbacks should be objects with one key, eg `addedAt`");
    var callbackName = _.keys(callback)[0];
    var args = _.values(callback)[0];
    _.each(args, function (arg, argIndex) {
      if (arg && typeof arg === 'object' &&
          'NOT' in arg &&
          firedCallbacks[i][callbackName]) {
        test.notEqual(firedCallbacks[i][callbackName][argIndex],
                      arg.NOT, "Should be NOT " + arg.NOT);
        firedCallbacks[i][callbackName][argIndex] = arg;
      }
    });
  }

  test.equal(EJSON.stringify(firedCallbacks, {canonical: true}),
             EJSON.stringify(expectedCallbacks, {canonical: true}));
};

Tinytest.add('observe sequence - initial data for all sequence types', function (test) {
  runOneObserveSequenceTestCase(test, function () {
    return null;
  }, function () {}, []);

  runOneObserveSequenceTestCase(test, function () {
    return [];
  }, function () {}, []);

  runOneObserveSequenceTestCase(test, function () {
    return [{foo: 1}, {bar: 2}];
  }, function () {}, [
    {addedAt: [0, {foo: 1}, 0, null]},
    {addedAt: [1, {bar: 2}, 1, null]}
  ]);

  runOneObserveSequenceTestCase(test, function () {
    return [{_id: "13", foo: 1}, {_id: "37", bar: 2}];
  }, function () {}, [
    {addedAt: ["13", {_id: "13", foo: 1}, 0, null]},
    {addedAt: ["37", {_id: "37", bar: 2}, 1, null]}
  ]);

  runOneObserveSequenceTestCase(test, function () {
    var coll = new Meteor.Collection(null);
    coll.insert({_id: "13", foo: 1});
    coll.insert({_id: "37", bar: 2});
    var cursor = coll.find({}, {sort: {_id: 1}});
    return cursor;
  }, function () {}, [
    {addedAt: ["13", {_id: "13", foo: 1}, 0, null]},
    {addedAt: ["37", {_id: "37", bar: 2}, 1, null]}
  ]);

  // shouldn't break on array with duplicate _id's, and the ids sent
  // in the callbacks should be distinct
  runOneObserveSequenceTestCase(test, function () {
    return [
      {_id: "13", foo: 1},
      {_id: "13", foo: 2}
    ];
  }, function () {}, [
    {addedAt: ["13", {_id: "13", foo: 1}, 0, null]},
    {addedAt: [{NOT: "13"}, {_id: "13", foo: 2}, 1, null]}
  ], /*numExpectedWarnings = */1);
});

Tinytest.add('observe sequence - array to other array', function (test) {
  var dep = new Deps.Dependency;
  var seq = [{_id: "13", foo: 1}, {_id: "37", bar: 2}];

  runOneObserveSequenceTestCase(test, function () {
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
  ]);
});

Tinytest.add('observe sequence - array to other array, strings', function (test) {
  var dep = new Deps.Dependency;
  var seq = ["A", "B"];

  runOneObserveSequenceTestCase(test, function () {
    dep.depend();
    return seq;
  }, function () {
    seq = ["B", "C"];
    dep.changed();
  }, [
    {addedAt: ["-A", "A", 0, null]},
    {addedAt: ["-B", "B", 1, null]},
    {removed: ["-A", "A"]},
    {addedAt: ["-C", "C", 1, null]}
  ]);
});

Tinytest.add('observe sequence - array to other array, objects without ids', function (test) {
  var dep = new Deps.Dependency;
  var seq = [{foo: 1}, {bar: 2}];

  runOneObserveSequenceTestCase(test, function () {
    dep.depend();
    return seq;
  }, function () {
    seq = [{foo: 2}];
    dep.changed();
  }, [
    {addedAt: [0, {foo: 1}, 0, null]},
    {addedAt: [1, {bar: 2}, 1, null]},
    {removed: [1, {bar: 2}]},
    {changed: [0, {foo: 2}, {foo: 1}]}
  ]);
});

Tinytest.add('observe sequence - array to other array, changes', function (test) {
  var dep = new Deps.Dependency;
  var seq = [{_id: "13", foo: 1}, {_id: "37", bar: 2}, {_id: "42", baz: 42}];

  runOneObserveSequenceTestCase(test, function () {
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
    // change fires for all elements, because we don't diff the actual
    // objects.
    {changed: ["13", {_id: "13", foo: 1}, {_id: "13", foo: 1}]},
    {changed: ["42", {_id: "42", baz: 43}, {_id: "42", baz: 42}]}
  ]);
});

Tinytest.add('observe sequence - array to other array, movedTo', function (test) {
  var dep = new Deps.Dependency;
  var seq = [{_id: "13", foo: 1}, {_id: "37", bar: 2}, {_id: "42", baz: 42}];

  runOneObserveSequenceTestCase(test, function () {
    dep.depend();
    return seq;
  }, function () {
    seq = [{_id: "37", bar: 2}, {_id: "13", foo: 1}, {_id: "42", baz: 42}];
    dep.changed();
  }, [
    {addedAt: ["13", {_id: "13", foo: 1}, 0, null]},
    {addedAt: ["37", {_id: "37", bar: 2}, 1, null]},
    {addedAt: ["42", {_id: "42", baz: 42}, 2, null]},
    // XXX it could have been the "13" moving but it's a detail of implementation
    {movedTo: ["37", {_id: "37", bar: 2}, 1, 0, "13"]},
    {changed: ["13", {_id: "13", foo: 1}, {_id: "13", foo: 1}]},
    {changed: ["37", {_id: "37", bar: 2}, {_id: "37", bar: 2}]},
    {changed: ["42", {_id: "42", baz: 42}, {_id: "42", baz: 42}]}
  ]);
});

Tinytest.add('observe sequence - array to null', function (test) {
  var dep = new Deps.Dependency;
  var seq = [{_id: "13", foo: 1}, {_id: "37", bar: 2}];

  runOneObserveSequenceTestCase(test, function () {
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

  runOneObserveSequenceTestCase(test, function () {
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
    {changed: ["13", {_id: "13", foo: 1}, {_id: "13", foo: 1}]}
  ]);
});


Tinytest.add('observe sequence - cursor to null', function (test) {
  var dep = new Deps.Dependency;
  var coll = new Meteor.Collection(null);
  coll.insert({_id: "13", foo: 1});
  coll.insert({_id: "37", bar: 2});
  var cursor = coll.find({}, {sort: {_id: 1}});
  var seq = cursor;

  runOneObserveSequenceTestCase(test, function () {
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

  runOneObserveSequenceTestCase(test, function () {
    dep.depend();
    return seq;
  }, function () {
    coll.insert({_id: "37", bar: 2});
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

  runOneObserveSequenceTestCase(test, function () {
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

  runOneObserveSequenceTestCase(test, function () {
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
    {changed: ["13", {_id: "13", foo: 1}, {_id: "13", foo: 1}]}
  ]);
});

Tinytest.add('observe sequence - cursor to other cursor with transform', function (test) {
  var dep = new Deps.Dependency;
  var transform = function(doc) {
    return _.extend({idCopy: doc._id}, doc);
  };

  var coll = new Meteor.Collection(null, {transform: transform});
  coll.insert({_id: "13", foo: 1});
  var cursor = coll.find({}, {sort: {_id: 1}});
  var seq = cursor;

  runOneObserveSequenceTestCase(test, function () {
    dep.depend();
    return seq;
  }, function () {
    coll.insert({_id: "37", bar: 2});

    var newColl = new Meteor.Collection(null, {transform: transform});
    newColl.insert({_id: "13", foo: 1});
    newColl.insert({_id: "38", bar: 2});
    var newCursor = newColl.find({}, {sort: {_id: 1}});
    seq = newCursor;
    dep.changed();
  }, [
    {addedAt: ["13", {_id: "13", foo: 1, idCopy: "13"}, 0, null]},
    {addedAt: ["37", {_id: "37", bar: 2, idCopy: "37"}, 1, null]},
    {removed: ["37", {_id: "37", bar: 2, idCopy: "37"}]},
    {addedAt: ["38", {_id: "38", bar: 2, idCopy: "38"}, 1, null]},
    {changed: ["13", {_id: "13", foo: 1, idCopy: "13"}, {_id: "13", foo: 1, idCopy: "13"}]}
  ]);
});

Tinytest.add('observe sequence - cursor to same cursor', function (test) {
  var coll = new Meteor.Collection(null);
  coll.insert({_id: "13", rank: 1});
  var cursor = coll.find({}, {sort: {rank: 1}});
  var seq = cursor;
  var dep = new Deps.Dependency;

  runOneObserveSequenceTestCase(test, function () {
    dep.depend();
    return seq;
  }, function () {
    coll.insert({_id: "24", rank: 2});
    dep.changed();
    Deps.flush();
    coll.insert({_id: "78", rank: 3});
  }, [
    {addedAt: ["13", {_id: "13", rank: 1}, 0, null]},
    {addedAt: ["24", {_id: "24", rank: 2}, 1, null]},
    // even if the cursor changes to the same cursor, we diff to see if we
    // missed anything during the invalidation, which leads to these
    // "changed" events.
    {changed: ["13", {_id: "13", rank: 1}, {_id: "13", rank: 1}]},
    {changed: ["24", {_id: "24", rank: 2}, {_id: "24", rank: 2}]},
    {addedAt: ["78", {_id: "78", rank: 3}, 2, null]}
  ]);
});

Tinytest.add('observe sequence - string arrays', function (test) {
  var seq = ['A', 'B'];
  var dep = new Deps.Dependency;

  runOneObserveSequenceTestCase(test, function () {
    dep.depend();
    return seq;
  }, function () {
    seq = ['B', 'C'];
    dep.changed();
  }, [
    {addedAt: ['-A', 'A', 0, null]},
    {addedAt: ['-B', 'B', 1, null]},
    {removed: ['-A', 'A']},
    {addedAt: ['-C', 'C', 1, null]}
  ]);
});

Tinytest.add('observe sequence - number arrays', function (test) {
  var seq = [1, 1, 2];
  var dep = new Deps.Dependency;

  runOneObserveSequenceTestCase(test, function () {
    dep.depend();
    return seq;
  }, function () {
    seq = [1, 3, 2, 3];
    dep.changed();
  }, [
    {addedAt: [1, 1, 0, null]},
    {addedAt: [{NOT: 1}, 1, 1, null]},
    {addedAt: [2, 2, 2, null]},
    {removed: [{NOT: 1}, 1]},
    {addedAt: [3, 3, 1, 2]},
    {addedAt: [{NOT: 3}, 3, 3, null]}
  ], /*numExpectedWarnings = */2);
});

Tinytest.add('observe sequence - cursor to other cursor, same collection', function (test) {
  var dep = new Deps.Dependency;
  var coll = new Meteor.Collection(null);
  coll.insert({_id: "13", foo: 1});
  coll.insert({_id: "37", foo: 2});
  var cursor = coll.find({foo: 1});
  var seq = cursor;

  runOneObserveSequenceTestCase(test, function () {
    dep.depend();
    return seq;
  }, function () {
    var newCursor = coll.find({foo: 2});
    seq = newCursor;
    dep.changed();
    Deps.flush();
    coll.insert({_id: "38", foo: 1});
    coll.insert({_id: "39", foo: 2});
  }, [
    {addedAt: ["13", {_id: "13", foo: 1}, 0, null]},
    {removed: ["13", {_id: "13", foo: 1}]},
    {addedAt: ["37", {_id: "37", foo: 2}, 0, null]},
    {addedAt: ["39", {_id: "39", foo: 2}, 1, null]}
  ]);
});
