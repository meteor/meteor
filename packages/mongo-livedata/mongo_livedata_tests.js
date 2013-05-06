// This is a magic collection that fails its writes on the server when
// the selector (or inserted document) contains fail: true.

var TRANSFORMS = {};
if (Meteor.isServer) {
  Meteor.methods({
    createInsecureCollection: function (name, options) {
      check(name, String);
      check(options, Match.Optional({
        transformName: Match.Optional(String),
        idGeneration: Match.Optional(String)
      }));

      if (options && options.transformName) {
        options.transform = TRANSFORMS[options.transformName];
      }
      var c = new Meteor.Collection(name, options);
      c._insecure = true;
      Meteor.publish('c-' + name, function () {
        return c.find();
      });
    }
  });
}

Meteor._FailureTestCollection =
  new Meteor.Collection("___meteor_failure_test_collection");

// For test "document with a custom type"
var Dog = function (name, color) {
  var self = this;
  self.color = color;
  self.name = name;
};
_.extend(Dog.prototype, {
  getName: function () { return this.name;},
  getColor: function () { return this.name;},
  equals: function (other) { return other.name === this.name &&
                             other.color === this.color; },
  toJSONValue: function () { return {color: this.color, name: this.name};},
  typeName: function () { return "dog"; },
  clone: function () { return new Dog(this.name, this.color); },
  speak: function () { return "woof"; }
});
EJSON.addType("dog", function (o) { return new Dog(o.name, o.color);});


// Parameterize tests.
_.each( ['STRING', 'MONGO'], function(idGeneration) {


var collectionOptions = { idGeneration: idGeneration};

testAsyncMulti("mongo-livedata - database error reporting. " + idGeneration, [
  function (test, expect) {
    var ftc = Meteor._FailureTestCollection;

    var exception = function (err, res) {
      test.instanceOf(err, Error);
    };

    _.each(["insert", "remove", "update"], function (op) {
      var arg = (op === "insert" ? {} : 'bla');
      if (Meteor.isServer) {
        test.throws(function () {
          ftc[op](arg);
        });

        ftc[op](arg, expect(exception));
      }

      if (Meteor.isClient) {
        ftc[op](arg, expect(exception));

        // This would log to console in normal operation.
        Meteor._suppress_log(1);
        ftc[op](arg);
      }
    });
  }
]);


Tinytest.addAsync("mongo-livedata - basics, " + idGeneration, function (test, onComplete) {
  var run = test.runId();
  var coll, coll2;
  if (Meteor.isClient) {
    coll = new Meteor.Collection(null, collectionOptions) ; // local, unmanaged
    coll2 = new Meteor.Collection(null, collectionOptions); // local, unmanaged
  } else {
    coll = new Meteor.Collection("livedata_test_collection_"+run, collectionOptions);
    coll2 = new Meteor.Collection("livedata_test_collection_2_"+run, collectionOptions);
  }

  var log = '';
  var obs = coll.find({run: run}, {sort: ["x"]}).observe({
    addedAt: function (doc, before_index, before) {
      log += 'a(' + doc.x + ',' + before_index + ',' + before + ')';
    },
    changedAt: function (new_doc, old_doc, at_index) {
      log += 'c(' + new_doc.x + ',' + at_index + ',' + old_doc.x + ')';
    },
    movedTo: function (doc, old_index, new_index) {
      log += 'm(' + doc.x + ',' + old_index + ',' + new_index + ')';
    },
    removedAt: function (doc, at_index) {
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

  expectObserve('a(1,0,null)', function () {
    var id = coll.insert({run: run, x: 1});
    test.equal(coll.find({run: run}).count(), 1);
    test.equal(coll.findOne(id).x, 1);
    test.equal(coll.findOne({run: run}).x, 1);
  });

  expectObserve('a(4,1,null)', function () {
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
    var Fiber = Npm.require('fibers');
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

Tinytest.addAsync("mongo-livedata - fuzz test, " + idGeneration, function(test, onComplete) {

  var run = test.runId();
  var coll;
  if (Meteor.isClient) {
    coll = new Meteor.Collection(null, collectionOptions); // local, unmanaged
  } else {
    coll = new Meteor.Collection("livedata_test_collection_"+run, collectionOptions);
  }

  // fuzz test of observe(), especially the server-side diffing
  var actual = [];
  var correct = [];
  var counters = {add: 0, change: 0, move: 0, remove: 0};

  var obs = coll.find({run: run}, {sort: ["x"]}).observe({
    addedAt: function (doc, before_index) {
      counters.add++;
      actual.splice(before_index, 0, doc.x);
    },
    changedAt: function (new_doc, old_doc, at_index) {
      counters.change++;
      test.equal(actual[at_index], old_doc.x);
      actual[at_index] = new_doc.x;
    },
    movedTo: function (doc, old_index, new_index) {
      counters.move++;
      test.equal(actual[old_index], doc.x);
      actual.splice(old_index, 1);
      actual.splice(new_index, 0, doc.x);
    },
    removedAt: function (doc, at_index) {
      counters.remove++;
      test.equal(actual[at_index], doc.x);
      actual.splice(at_index, 1);
    }
  });

  var step = 0;

  // Use non-deterministic randomness so we can have a shorter fuzz
  // test (fewer iterations).  For deterministic (fully seeded)
  // randomness, remove the call to Random.fraction().
  var seededRandom = new SeededRandom("foobard" + Random.fraction());
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

Tinytest.addAsync("mongo-livedata - scribbling, " + idGeneration, function (test, onComplete) {
  var run = test.runId();
  var coll;
  if (Meteor.isClient) {
    coll = new Meteor.Collection(null, collectionOptions); // local, unmanaged
  } else {
    coll = new Meteor.Collection("livedata_test_collection_"+run, collectionOptions);
  }

  var numAddeds = 0;
  var handle = coll.find({run: run}).observe({
    addedAt: function (o) {
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

Tinytest.addAsync("mongo-livedata - stop handle in callback, " + idGeneration, function (test, onComplete) {
  var run = test.runId();
  var coll;
  if (Meteor.isClient) {
    coll = new Meteor.Collection(null, collectionOptions); // local, unmanaged
  } else {
    coll = new Meteor.Collection("stopHandleInCallback-"+run, collectionOptions);
  }

  var output = [];

  var handle = coll.find().observe({
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
  Tinytest.addAsync("mongo-livedata - recursive observe throws, " + idGeneration, function (test, onComplete) {
    var run = test.runId();
    var coll = new Meteor.Collection("observeInCallback-"+run, collectionOptions);

    var callbackCalled = false;
    var handle = coll.find().observe({
      added: function (newDoc) {
        callbackCalled = true;
        test.throws(function () {
          coll.find().observe({});
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

  Tinytest.addAsync("mongo-livedata - cursor dedup, " + idGeneration, function (test, onComplete) {
    var run = test.runId();
    var coll = new Meteor.Collection("cursorDedup-"+run, collectionOptions);

    var observer = function (noAdded) {
      var output = [];
      var callbacks = {
        changedAt: function (newDoc) {
          output.push({changed: newDoc._id});
        }
      };
      if (!noAdded) {
        callbacks.addedAt = function (doc) {
          output.push({added: doc._id});
        };
      }
      var handle = coll.find({foo: 22}).observe(callbacks);
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

    // Start another handle with no added callback. Regression test for #589.
    var o4 = observer(true);

    o3.handle.stop();
    o4.handle.stop();

    onComplete();
  });
}


testAsyncMulti('mongo-livedata - empty documents, ' + idGeneration, [
  function (test, expect) {
    var collectionName = Random.id();
    if (Meteor.isClient) {
      Meteor.call('createInsecureCollection', collectionName);
      Meteor.subscribe('c-' + collectionName);
    }

    var coll = new Meteor.Collection(collectionName, collectionOptions);
    var docId;

    coll.insert({}, expect(function (err, id) {
      test.isFalse(err);
      test.isTrue(id);
      docId = id;
      var cursor = coll.find();
      test.equal(cursor.count(), 1);
    }));
  }
]);

testAsyncMulti('mongo-livedata - document with a date, ' + idGeneration, [
  function (test, expect) {
    var collectionName = Random.id();
    if (Meteor.isClient) {
      Meteor.call('createInsecureCollection', collectionName, collectionOptions);
      Meteor.subscribe('c-' + collectionName);
    }

    var coll = new Meteor.Collection(collectionName, collectionOptions);
    var docId;
    coll.insert({d: new Date(1356152390004)}, expect(function (err, id) {
      test.isFalse(err);
      test.isTrue(id);
      docId = id;
      var cursor = coll.find();
      test.equal(cursor.count(), 1);
      test.equal(coll.findOne().d.getFullYear(), 2012);
    }));
  }
]);

testAsyncMulti('mongo-livedata - document goes through a transform, ' + idGeneration, [
  function (test, expect) {
    var self = this;
    var seconds = function (doc) {
      doc.seconds = function () {return doc.d.getSeconds();};
      return doc;
    };
    TRANSFORMS["seconds"] = seconds;
    var collectionOptions = {
      idGeneration: idGeneration,
      transform: seconds,
      transformName: "seconds"
    };
    var collectionName = Random.id();
    if (Meteor.isClient) {
      Meteor.call('createInsecureCollection', collectionName, collectionOptions);
      Meteor.subscribe('c-' + collectionName);
    }

    self.coll = new Meteor.Collection(collectionName, collectionOptions);
    var obs;
    var expectAdd = expect(function (doc) {
      test.equal(doc.seconds(), 50);
    });
    var expectRemove = expect (function (doc) {
      test.equal(doc.seconds(), 50);
      obs.stop();
    });
    self.coll.insert({d: new Date(1356152390004)}, expect(function (err, id) {
      test.isFalse(err);
      test.isTrue(id);
      var cursor = self.coll.find();
      obs = cursor.observe({
        added: expectAdd,
        removed: expectRemove
      });
      test.equal(cursor.count(), 1);
      test.equal(cursor.fetch()[0].seconds(), 50);
      test.equal(self.coll.findOne().seconds(), 50);
      test.equal(self.coll.findOne({}, {transform: null}).seconds, undefined);
      test.equal(self.coll.findOne({}, {
        transform: function (doc) {return {seconds: doc.d.getSeconds()};}
      }).seconds, 50);
      self.coll.remove(id);
    }));
  },
  function (test, expect) {
    var self = this;
    self.coll.insert({d: new Date(1356152390004)}, expect(function (err, id) {
      test.isFalse(err);
      test.isTrue(id);
      self.id1 = id;
    }));
    self.coll.insert({d: new Date(1356152391004)}, expect(function (err, id) {
      test.isFalse(err);
      test.isTrue(id);
      self.id2 = id;
    }));
  },
  function (test, expect) {
    var self = this;
    // Test that a transform that returns something other than a document with
    // an _id (eg, a number) works. Regression test for #974.
    test.equal(self.coll.find({}, {
      transform: function (doc) { return doc.d.getSeconds(); },
      sort: {d: 1}
    }).fetch(), [50, 51]);
  }
]);

testAsyncMulti('mongo-livedata - document with binary data, ' + idGeneration, [
  function (test, expect) {
    var bin = EJSON._base64Decode(
      "TWFuIGlzIGRpc3Rpbmd1aXNoZWQsIG5vdCBvbmx5IGJ5IGhpcyBy" +
        "ZWFzb24sIGJ1dCBieSB0aGlzIHNpbmd1bGFyIHBhc3Npb24gZnJv" +
        "bSBvdGhlciBhbmltYWxzLCB3aGljaCBpcyBhIGx1c3Qgb2YgdGhl" +
        "IG1pbmQsIHRoYXQgYnkgYSBwZXJzZXZlcmFuY2Ugb2YgZGVsaWdo" +
        "dCBpbiB0aGUgY29udGludWVkIGFuZCBpbmRlZmF0aWdhYmxlIGdl" +
        "bmVyYXRpb24gb2Yga25vd2xlZGdlLCBleGNlZWRzIHRoZSBzaG9y" +
        "dCB2ZWhlbWVuY2Ugb2YgYW55IGNhcm5hbCBwbGVhc3VyZS4=");
    var collectionName = Random.id();
    if (Meteor.isClient) {
      Meteor.call('createInsecureCollection', collectionName, collectionOptions);
      Meteor.subscribe('c-' + collectionName);
    }

    var coll = new Meteor.Collection(collectionName, collectionOptions);
    var docId;
    coll.insert({b: bin}, expect(function (err, id) {
      test.isFalse(err);
      test.isTrue(id);
      docId = id;
      var cursor = coll.find();
      test.equal(cursor.count(), 1);
      var inColl = coll.findOne();
      test.isTrue(EJSON.isBinary(inColl.b));
      test.equal(inColl.b, bin);
    }));
  }
]);

testAsyncMulti('mongo-livedata - document with a custom type, ' + idGeneration, [
  function (test, expect) {
    var collectionName = Random.id();
    if (Meteor.isClient) {
      Meteor.call('createInsecureCollection', collectionName, collectionOptions);
      Meteor.subscribe('c-' + collectionName);
    }

    var coll = new Meteor.Collection(collectionName, collectionOptions);
    var docId;
    // Dog is implemented at the top of the file, outside of the idGeneration
    // loop (so that we only call EJSON.addType once).
    var d = new Dog("reginald", "purple");
    coll.insert({d: d}, expect(function (err, id) {
      test.isFalse(err);
      test.isTrue(id);
      docId = id;
      var cursor = coll.find();
      test.equal(cursor.count(), 1);
      var inColl = coll.findOne();
      test.isTrue(inColl);
      inColl && test.equal(inColl.d.speak(), "woof");
    }));
  }
]);

if (Meteor.isServer) {
  Tinytest.addAsync("mongo-livedata - id-based invalidation, " + idGeneration, function (test, onComplete) {
    var run = test.runId();
    var coll = new Meteor.Collection("livedata_invalidation_collection_"+run, collectionOptions);

    coll.allow({
      update: function () {return true;},
      remove: function () {return true;}
    });

    var id1 = coll.insert({x: 42, is1: true});
    var id2 = coll.insert({x: 50, is2: true});

    var polls = {};
    var handlesToStop = [];
    var observe = function (name, query) {
      var handle = coll.find(query).observeChanges({
        // Make sure that we only poll on invalidation, not due to time,
        // and keep track of when we do.
        _testOnlyPollCallback: function () {
          polls[name] = (name in polls ? polls[name] + 1 : 1);
        }
      });
      handlesToStop.push(handle);
    };

    observe("all", {});
    observe("id1Direct", id1);
    observe("id1InQuery", {_id: id1, z: null});
    observe("id2Direct", id2);
    observe("id2InQuery", {_id: id2, z: null});
    observe("bothIds", {_id: {$in: [id1, id2]}});

    var resetPollsAndRunInFence = function (f) {
      polls = {};
      runInFence(f);
    };

    // Update id1 directly. This should poll all but the "id2" queries. "all"
    // and "bothIds" increment by 2 because they are looking at both.
    resetPollsAndRunInFence(function () {
      coll.update(id1, {$inc: {x: 1}});
    });
    test.equal(
      polls,
      {all: 1, id1Direct: 1, id1InQuery: 1, bothIds: 1});

    // Update id2 using a funny query. This should poll all but the "id1"
    // queries.
    resetPollsAndRunInFence(function () {
      coll.update({_id: id2, q: null}, {$inc: {x: 1}});
    });
    test.equal(
      polls,
      {all: 1, id2Direct: 1, id2InQuery: 1, bothIds: 1});

    // Update both using a $in query. Should poll each of them exactly once.
    resetPollsAndRunInFence(function () {
      coll.update({_id: {$in: [id1, id2]}, q: null}, {$inc: {x: 1}});
    });
    test.equal(
      polls,
      {all: 1, id1Direct: 1, id1InQuery: 1, id2Direct: 1, id2InQuery: 1,
       bothIds: 1});

    _.each(handlesToStop, function (h) {h.stop();});
    onComplete();
  });
}


});  // end idGeneration parametrization

Tinytest.add('mongo-livedata - rewrite selector', function (test) {
  test.equal(Meteor.Collection._rewriteSelector({x: /^o+B/im}),
             {x: {$regex: '^o+B', $options: 'im'}});
  test.equal(Meteor.Collection._rewriteSelector({x: /^o+B/}),
             {x: {$regex: '^o+B'}});
  test.equal(Meteor.Collection._rewriteSelector('foo'),
             {_id: 'foo'});
  var oid = new Meteor.Collection.ObjectID();
  test.equal(Meteor.Collection._rewriteSelector(oid),
             {_id: oid});
});

testAsyncMulti('mongo-livedata - specified _id', [
  function (test, expect) {
    var collectionName = Random.id();
    if (Meteor.isClient) {
      Meteor.call('createInsecureCollection', collectionName);
      Meteor.subscribe('c-' + collectionName);
    }
    var expectError = expect(function (err) {
      test.isTrue(err);
      var doc = coll.findOne();
      test.equal(doc.name, "foo");
    });
    var coll = new Meteor.Collection(collectionName);
    coll.insert({_id: "foo", name: "foo"}, expect(function (err1, id) {
      test.equal(id, "foo");
      var doc = coll.findOne();
      test.equal(doc._id, "foo");
      Meteor._suppress_log(1);
      coll.insert({_id: "foo", name: "bar"}, expectError);
    }));
  }
]);


if (Meteor.isServer) {

  testAsyncMulti("mongo-livedata - minimongo on server to server connection", [
    function (test, expect) {
      var self = this;
      Meteor._debug("connection setup");
      self.id = Random.id();
      var C = self.C = new Meteor.Collection("ServerMinimongo_" + self.id);
      C.allow({
        insert: function () {return true;},
        update: function () {return true;},
        remove: function () {return true;}
      });
      C.insert({a: 0, b: 1});
      C.insert({a: 0, b: 2});
      C.insert({a: 1, b: 3});
      Meteor.publish(self.id, function () {
        return C.find({a: 0});
      });

      self.conn = Meteor.connect(Meteor.absoluteUrl());
      pollUntil(expect, function () {
        return self.conn.status().connected;
      }, 10000);
    },

    function (test, expect) {
      var self = this;
      if (self.conn.status().connected) {
        self.miniC = new Meteor.Collection("ServerMinimongo_" + self.id, {
          connection: self.conn
        });
        var exp = expect(function (err) {
          test.isFalse(err);
        });
        self.conn.subscribe(self.id, {
          onError: exp,
          onReady: exp
        });
      }
    },

    function (test, expect) {
      var self = this;
      if (self.miniC) {
        var contents = self.miniC.find().fetch();
        test.equal(contents.length, 2);
        test.equal(contents[0].a, 0);
      }
    },

    function (test, expect) {
      var self = this;
      if (!self.miniC)
        return;
      self.miniC.insert({a:0, b:3});
      var contents = self.miniC.find({b:3}).fetch();
      test.equal(contents.length, 1);
      test.equal(contents[0].a, 0);
    }
  ]);

  testAsyncMulti("mongo-livedata - minimongo observe on server", [
    function (test, expect) {
      var self = this;
      self.id = Random.id();
      self.C = new Meteor.Collection("ServerMinimongoObserve_" + self.id);
      self.events = [];

      Meteor.publish(self.id, function () {
        return self.C.find();
      });

      self.conn = Meteor.connect(Meteor.absoluteUrl());
      pollUntil(expect, function () {
        return self.conn.status().connected;
      }, 10000);
    },

    function (test, expect) {
      var self = this;
      if (self.conn.status().connected) {
        self.miniC = new Meteor.Collection("ServerMinimongoObserve_" + self.id, {
          connection: self.conn
        });
        var exp = expect(function (err) {
          test.isFalse(err);
        });
        self.conn.subscribe(self.id, {
          onError: exp,
          onReady: exp
        });
      }
    },

    function (test, expect) {
      var self = this;
      if (self.miniC) {
        self.obs = self.miniC.find().observeChanges({
          added: function (id, fields) {
            self.events.push({evt: "a", id: id});
            Meteor._sleepForMs(200);
            self.events.push({evt: "b", id: id});
          }
        });
        self.one = self.C.insert({});
        self.two = self.C.insert({});
        pollUntil(expect, function () {
          return self.events.length === 4;
        }, 10000);
      }
    },

    function (test, expect) {
      var self = this;
      if (self.miniC) {
        test.equal(self.events, [
          {evt: "a", id: self.one},
          {evt: "b", id: self.one},
          {evt: "a", id: self.two},
          {evt: "b", id: self.two}
        ]);
      }
      self.obs && self.obs.stop();
    }
  ]);
}
