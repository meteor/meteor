// This is a magic collection that fails its writes on the server when
// the selector (or inserted document) contains fail: true.

// XXX namespacing
Meteor._FailureTestCollection =
  new Meteor.Collection("___meteor_failure_test_collection");

testAsyncMulti("mongo-livedata - database error reporting", [
  function (test, expect) {
    var ftc = Meteor._FailureTestCollection;

    var exception = function (err, res) {
      test.instanceOf(err, Error);
    };

    _.each(["insert", "remove", "update"], function (op) {
      if (Meteor.isServer) {
        test.throws(function () {
          ftc[op]({fail: true});
        });

        ftc[op]({fail: true}, expect(exception));
      }

      if (Meteor.isClient) {
        ftc[op]({fail: true}, expect(exception));

        // This would log to console in normal operation.
        Meteor._suppress_log(1);
        ftc[op]({fail: true});
      }
    });
  }
]);


Tinytest.addAsync("mongo-livedata - basics", function (test, onComplete) {
  var run = test.runId();
  var coll, coll2;
  if (Meteor.isClient) {
    coll = new Meteor.Collection(null); // local, unmanaged
    coll2 = new Meteor.Collection(null); // local, unmanaged
  } else {
    coll = new Meteor.Collection("livedata_test_collection_"+run);
    coll2 = new Meteor.Collection("livedata_test_collection_2_"+run);
  }

  var log = '';
  var obs = coll.find({run: run}, {sort: ["x"]}).observe({
    added: function (doc, before_index) {
      log += 'a(' + doc.x + ',' + before_index + ')';
    },
    changed: function (new_doc, at_index, old_doc) {
      log += 'c(' + new_doc.x + ',' + at_index + ',' + old_doc.x + ')';
    },
    moved: function (doc, old_index, new_index) {
      log += 'm(' + doc.x + ',' + old_index + ',' + new_index + ')';
    },
    removed: function (doc, at_index) {
      log += 'r(' + doc.x + ',' + at_index + ')';
    }
  });

  var captureObserve = function (f) {
    if (Meteor.isClient) {
      f();
    } else {
      var fence = new Meteor._WriteFence;
      Meteor._CurrentWriteFence.withValue(fence, f);
      fence.armAndWait();
    }

    var ret = log;
    log = '';
    return ret;
  };

  var expectObserve = function (expected, f) {
    if (!(expected instanceof Array))
      expected = [expected];

    test.include(expected, captureObserve(f));
  };

  test.equal(coll.find({run: run}).count(), 0);
  test.equal(coll.findOne("abc"), undefined);
  test.equal(coll.findOne({run: run}), undefined);

  expectObserve('a(1,0)', function () {
    var id = coll.insert({run: run, x: 1});
    test.equal(id.length, 36);
    test.equal(coll.find({run: run}).count(), 1);
    test.equal(coll.findOne(id).x, 1);
    test.equal(coll.findOne({run: run}).x, 1);
  });

  expectObserve('a(4,1)', function () {
    var id2 = coll.insert({run: run, x: 4});
    test.equal(coll.find({run: run}).count(), 2);
    test.equal(coll.find({_id: id2}).count(), 1);
    test.equal(coll.findOne(id2).x, 4);
  });

  test.equal(coll.findOne({run: run}, {sort: ["x"], skip: 0}).x, 1);
  test.equal(coll.findOne({run: run}, {sort: ["x"], skip: 1}).x, 4);
  test.equal(coll.findOne({run: run}, {sort: {x: -1}, skip: 0}).x, 4);
  test.equal(coll.findOne({run: run}, {sort: {x: -1}, skip: 1}).x, 1);

  // sleep function from fibers docs.
  var sleep = function(ms) {
    var fiber = Fiber.current;
    setTimeout(function() {
      fiber.run();
    }, ms);
    Fiber.yield();
  };

  var cur = coll.find({run: run}, {sort: ["x"]});
  var total = 0;
  cur.forEach(function (doc) {
    total *= 10;
    if (Meteor.isServer) {
      // Verify that the callbacks from forEach run sequentially and that
      // forEach waits for them to complete (issue# 321). If they do not run
      // sequentially, then the second callback could execute during the first
      // callback's sleep sleep and the *= 10 will occur before the += 1, then
      // total (at test.equal time) will be 5. If forEach does not wait for the
      // callbacks to complete, then total (at test.equal time) will be 0.
      sleep(5);
    }
    total += doc.x;
    // verify the meteor environment is set up here
    coll2.insert({total:total});
  });
  test.equal(total, 14);

  cur.rewind();
  test.equal(cur.map(function (doc) {
    return doc.x * 2;
  }), [2, 8]);

  test.equal(_.pluck(coll.find({run: run}, {sort: {x: -1}}).fetch(), "x"),
             [4, 1]);

  expectObserve('c(3,0,1)c(6,1,4)', function () {
    coll.update({run: run}, {$inc: {x: 2}}, {multi: true});
    test.equal(_.pluck(coll.find({run: run}, {sort: {x: -1}}).fetch(), "x"),
               [6, 3]);
  });

  expectObserve(['c(13,0,3)m(13,0,1)', 'm(6,1,0)c(13,1,3)',
                 'c(13,0,3)m(6,1,0)', 'm(3,0,1)c(13,1,3)'], function () {
    coll.update({run: run, x: 3}, {$inc: {x: 10}}, {multi: true});
    test.equal(_.pluck(coll.find({run: run}, {sort: {x: -1}}).fetch(), "x"),
               [13, 6]);
  });

  expectObserve('r(13,1)', function () {
    coll.remove({run: run, x: {$gt: 10}});
    test.equal(coll.find({run: run}).count(), 1);
  });

  expectObserve('r(6,0)', function () {
    coll.remove({run: run});
    test.equal(coll.find({run: run}).count(), 0);
  });

  obs.stop();
  onComplete();
});

Tinytest.addAsync("mongo-livedata - fuzz test", function(test, onComplete) {

  var run = test.runId();
  var coll;
  if (Meteor.isClient) {
    coll = new Meteor.Collection(null); // local, unmanaged
  } else {
    coll = new Meteor.Collection("livedata_test_collection_"+run);
  }

  // fuzz test of observe(), especially the server-side diffing
  var actual = [];
  var correct = [];
  var counters = {add: 0, change: 0, move: 0, remove: 0};

  var obs = coll.find({run: run}, {sort: ["x"]}).observe({
    added: function (doc, before_index) {
      counters.add++;
      actual.splice(before_index, 0, doc.x);
    },
    changed: function (new_doc, at_index, old_doc) {
      counters.change++;
      test.equal(actual[at_index], old_doc.x);
      actual[at_index] = new_doc.x;
    },
    moved: function (doc, old_index, new_index) {
      counters.move++;
      test.equal(actual[old_index], doc.x);
      actual.splice(old_index, 1);
      actual.splice(new_index, 0, doc.x);
    },
    removed: function (doc, at_index) {
      counters.remove++;
      test.equal(actual[at_index], doc.x);
      actual.splice(at_index, 1);
    }
  });

  var step = 0;

  // Use non-deterministic randomness so we can have a shorter fuzz
  // test (fewer iterations).  For deterministic (fully seeded)
  // randomness, remove the call to Math.random().
  var seededRandom = new SeededRandom("foobard" + Math.random());
  // Random integer in [0,n)
  var rnd = function (n) {
    return seededRandom.nextIntBetween(0, n-1);
  };

  var finishObserve = function (f) {
    if (Meteor.isClient) {
      f();
    } else {
      var fence = new Meteor._WriteFence;
      Meteor._CurrentWriteFence.withValue(fence, f);
      fence.armAndWait();
    }
  };

  var doStep = function () {
    if (step++ === 5) { // run N random tests
      obs.stop();
      onComplete();
      return;
    }

    var max_counters = _.clone(counters);

    finishObserve(function () {
      // XXX What if there are multiple observe handles on the LiveResultsSet?
      //     There shouldn't be because the collection has a name unique to this
      //     run.
      if (Meteor.isServer)
        obs._liveResultsSet._suspendPolling();

      // Do a batch of 1-10 operations
      var batch_count = rnd(10) + 1;
      for (var i = 0; i < batch_count; i++) {
        // 25% add, 25% remove, 25% change in place, 25% change and move
        var op = rnd(4);
        var which = rnd(correct.length);
        if (op === 0 || step < 2 || !correct.length) {
          // Add
          var x = rnd(1000000);
          coll.insert({run: run, x: x});
          correct.push(x);
          max_counters.add++;
        } else if (op === 1 || op === 2) {
          var x = correct[which];
          if (op === 1)
            // Small change, not likely to cause a move
            var val = x + (rnd(2) ? -1 : 1);
          else
            // Large change, likely to cause a move
            var val = rnd(1000000);
          coll.update({run: run, x: x}, {$set: {x: val}});
          correct[which] = val;
          max_counters.change++;
          max_counters.move++;
        } else {
          coll.remove({run: run, x: correct[which]});
          correct.splice(which, 1);
          max_counters.remove++;
        }
      }
      if (Meteor.isServer)
        obs._liveResultsSet._resumePolling();

    });

    // Did we actually deliver messages that mutated the array in the
    // right way?
    correct.sort(function (a,b) {return a-b;});
    test.equal(actual, correct);

    // Did we limit ourselves to one 'moved' message per change,
    // rather than O(results) moved messages?
    _.each(max_counters, function (v, k) {
      test.isTrue(max_counters[k] >= counters[k], k);
    });

    Meteor.defer(doStep);
  };

  doStep();

});

var runInFence = function (f) {
  if (Meteor.isClient) {
    f();
  } else {
    var fence = new Meteor._WriteFence;
    Meteor._CurrentWriteFence.withValue(fence, f);
    fence.armAndWait();
  }
};

Tinytest.addAsync("mongo-livedata - scribbling", function (test, onComplete) {
  var run = test.runId();
  var coll;
  if (Meteor.isClient) {
    coll = new Meteor.Collection(null); // local, unmanaged
  } else {
    coll = new Meteor.Collection("livedata_test_collection_"+run);
  }

  var numAddeds = 0;
  var handle = coll.find({run: run}).observe({
    added: function (o) {
      // test that we can scribble on the object we get back from Mongo without
      // breaking anything.  The worst possible scribble is messing with _id.
      delete o._id;
      numAddeds++;
    }
  });
  _.each([123, 456, 789], function (abc) {
    runInFence(function () {
      coll.insert({run: run, abc: abc});
    });
  });
  handle.stop();
  // will be 6 (1+2+3) if we broke diffing!
  test.equal(numAddeds, 3);

  onComplete();
});

Tinytest.addAsync("mongo-livedata - stop handle in callback", function (test, onComplete) {
  var run = test.runId();
  var coll;
  if (Meteor.isClient) {
    coll = new Meteor.Collection(null); // local, unmanaged
  } else {
    coll = new Meteor.Collection("stopHandleInCallback-"+run);
  }

  var output = [];

  var handle = coll.find()._observeUnordered({
    added: function (doc) {
      output.push({added: doc._id});
    },
    changed: function (newDoc) {
      output.push('changed');
      handle.stop();
    }
  });

  test.equal(output, []);

  // Insert a document. Observe that the added callback is called.
  var docId;
  runInFence(function () {
    docId = coll.insert({foo: 42});
  });
  test.length(output, 1);
  test.equal(output.shift(), {added: docId});

  // Update it. Observe that the changed callback is called. This should also
  // stop the observation.
  runInFence(function() {
    coll.update(docId, {$set: {bar: 10}});
  });
  test.length(output, 1);
  test.equal(output.shift(), 'changed');

  // Update again. This shouldn't call the callback because we stopped the
  // observation.
  runInFence(function() {
    coll.update(docId, {$set: {baz: 40}});
  });
  test.length(output, 0);

  test.equal(coll.find().count(), 1);
  test.equal(coll.findOne(docId),
             {_id: docId, foo: 42, bar: 10, baz: 40});

  onComplete();
});

// This behavior isn't great, but it beats deadlock.
if (Meteor.isServer) {
  Tinytest.addAsync("mongo-livedata - recursive observe throws", function (test, onComplete) {
    var run = test.runId();
    var coll = new Meteor.Collection("observeInCallback-"+run);

    var callbackCalled = false;
    var handle = coll.find()._observeUnordered({
      added: function (newDoc) {
        callbackCalled = true;
        test.throws(function () {
          coll.find()._observeUnordered({});
        });
      }
    });
    test.isFalse(callbackCalled);
    // Insert a document. Observe that the added callback is called.
    runInFence(function () {
      coll.insert({foo: 42});
    });
    test.isTrue(callbackCalled);

    handle.stop();

    onComplete();
  });

  Tinytest.addAsync("mongo-livedata - cursor dedup", function (test, onComplete) {
    var run = test.runId();
    var coll = new Meteor.Collection("cursorDedup-"+run);

    var observer = function () {
      var output = [];
      var handle = coll.find({foo: 22}).observe({
        added: function (doc) {
          output.push({added: doc._id});
        },
        changed: function (newDoc) {
          output.push({changed: newDoc._id});
        }
      });
      return {output: output, handle: handle};
    };

    // Insert a doc and start observing.
    var docId1 = coll.insert({foo: 22});
    var o1 = observer();
    // Initial add.
    test.length(o1.output, 1);
    test.equal(o1.output.shift(), {added: docId1});

    // Insert another doc (blocking until observes have fired).
    var docId2;
    runInFence(function () {
      docId2 = coll.insert({foo: 22, bar: 5});
    });
    // Observed add.
    test.length(o1.output, 1);
    test.equal(o1.output.shift(), {added: docId2});

    // Second identical observe.
    var o2 = observer();
    // Initial adds.
    test.length(o2.output, 2);
    test.include([docId1, docId2], o2.output[0].added);
    test.include([docId1, docId2], o2.output[1].added);
    test.notEqual(o2.output[0].added, o2.output[1].added);
    o2.output.length = 0;
    // Original observe not affected.
    test.length(o1.output, 0);

    // White-box test: both observes should have the same underlying
    // LiveResultsSet.
    var liveResultsSet = o1.handle._liveResultsSet;
    test.isTrue(liveResultsSet);
    test.isTrue(liveResultsSet === o2.handle._liveResultsSet);

    // Update. Both observes fire.
    runInFence(function () {
      coll.update(docId1, {$set: {x: 'y'}});
    });
    test.length(o1.output, 1);
    test.length(o2.output, 1);
    test.equal(o1.output.shift(), {changed: docId1});
    test.equal(o2.output.shift(), {changed: docId1});

    // Stop first handle. Second handle still around.
    o1.handle.stop();
    test.length(o1.output, 0);
    test.length(o2.output, 0);

    // Another update. Just the second handle should fire.
    runInFence(function () {
      coll.update(docId2, {$set: {z: 'y'}});
    });
    test.length(o1.output, 0);
    test.length(o2.output, 1);
    test.equal(o2.output.shift(), {changed: docId2});

    // Stop second handle. Nothing should happen, but the liveResultsSet should
    // be stopped.
    o2.handle.stop();
    test.length(o1.output, 0);
    test.length(o2.output, 0);
    // White-box: liveResultsSet has nulled its _observeHandles so you can't
    // accidentally join to it.
    test.isNull(liveResultsSet._observeHandles);

    // Start yet another handle on the same query.
    var o3 = observer();
    // Initial adds.
    test.length(o3.output, 2);
    test.include([docId1, docId2], o3.output[0].added);
    test.include([docId1, docId2], o3.output[1].added);
    test.notEqual(o3.output[0].added, o3.output[1].added);
    // Old observers not called.
    test.length(o1.output, 0);
    test.length(o2.output, 0);
    // White-box: Different LiveResultsSet.
    test.isTrue(liveResultsSet !== o3.handle._liveResultsSet);
    o3.handle.stop();
    onComplete();
  });
}
