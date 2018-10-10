// This is a magic collection that fails its writes on the server when
// the selector (or inserted document) contains fail: true.

var TRANSFORMS = {};

// We keep track of the collections, so we can refer to them by name
var COLLECTIONS = {};

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
      var c = new Mongo.Collection(name, options);
      COLLECTIONS[name] = c;
      c._insecure = true;
      Meteor.publish('c-' + name, function () {
        return c.find();
      });
    },
    dropInsecureCollection: function(name) {
      var c = COLLECTIONS[name];
      c._dropCollection();
    }
  });
}

// We store the generated id, keyed by collection, for each insert
// This is so we can test the stub and the server generate the same id
var INSERTED_IDS = {};

Meteor.methods({
  insertObjects: function (collectionName, doc, count) {
    var c = COLLECTIONS[collectionName];
    var ids = [];
    for (var i = 0; i < count; i++) {
      var id = c.insert(doc);
      INSERTED_IDS[collectionName] = (INSERTED_IDS[collectionName] || []).concat([id]);
      ids.push(id);
    }
    return ids;
  },
  upsertObject: function (collectionName, selector, modifier) {
    var c = COLLECTIONS[collectionName];
    return c.upsert(selector, modifier);
  },
  doMeteorCall: function (name /*, arguments */) {
    var args = Array.prototype.slice.call(arguments);

    return Meteor.call.apply(null, args);
  }
});

var runInFence = function (f) {
  if (Meteor.isClient) {
    f();
  } else {
    var fence = new DDPServer._WriteFence;
    DDPServer._CurrentWriteFence.withValue(fence, f);
    fence.armAndWait();
  }
};

// Helpers for upsert tests

var stripId = function (obj) {
  delete obj._id;
};

var compareResults = function (test, skipIds, actual, expected) {
  if (skipIds) {
    _.map(actual, stripId);
    _.map(expected, stripId);
  }
  // (technically should ignore order in comparison)
  test.equal(actual, expected);
};

var upsert = function (coll, useUpdate, query, mod, options, callback) {
  if (! callback && typeof options === "function") {
    callback = options;
    options = {};
  }

  if (useUpdate) {
    if (callback)
      return coll.update(query, mod,
                         _.extend({ upsert: true }, options),
                         function (err, result) {
                           callback(err, ! err && {
                             numberAffected: result
                           });
                         });
    return {
      numberAffected: coll.update(query, mod,
                                  _.extend({ upsert: true }, options))
    };
  } else {
    return coll.upsert(query, mod, options, callback);
  }
};

var upsertTestMethod = "livedata_upsert_test_method";
var upsertTestMethodColl;

// This is the implementation of the upsert test method on both the client and
// the server. On the client, we get a test object. On the server, we just throw
// errors if something doesn't go according to plan, and when the client
// receives those errors it will cause the test to fail.
//
// Client-side exceptions in here will NOT cause the test to fail! Because it's
// a stub, those exceptions will get caught and logged.
var upsertTestMethodImpl = function (coll, useUpdate, test) {
  coll.remove({});
  var result1 = upsert(coll, useUpdate, { foo: "bar" }, { foo: "bar" });

  if (! test) {
    test = {
      equal: function (a, b) {
        if (! EJSON.equals(a, b))
          throw new Error("Not equal: " +
                          JSON.stringify(a) + ", " + JSON.stringify(b));
      },
      isTrue: function (a) {
        if (! a)
          throw new Error("Not truthy: " + JSON.stringify(a));
      },
      isFalse: function (a) {
        if (a)
          throw new Error("Not falsey: " + JSON.stringify(a));
      }
    };
  }

  // if we don't test this, then testing result1.numberAffected will throw,
  // which will get caught and logged and the whole test will pass!
  test.isTrue(result1);

  test.equal(result1.numberAffected, 1);
  if (! useUpdate)
    test.isTrue(result1.insertedId);
  var fooId = result1.insertedId;
  var obj = coll.findOne({ foo: "bar" });
  test.isTrue(obj);
  if (! useUpdate)
    test.equal(obj._id, result1.insertedId);
  var result2 = upsert(coll, useUpdate, { _id: fooId },
                       { $set: { foo: "baz " } });
  test.isTrue(result2);
  test.equal(result2.numberAffected, 1);
  test.isFalse(result2.insertedId);
};

if (Meteor.isServer) {
  var m = {};
  m[upsertTestMethod] = function (run, useUpdate, options) {
    check(run, String);
    check(useUpdate, Boolean);
    upsertTestMethodColl = new Mongo.Collection(upsertTestMethod + "_collection_" + run, options);
    upsertTestMethodImpl(upsertTestMethodColl, useUpdate);
  };
  Meteor.methods(m);
}

Meteor._FailureTestCollection =
  new Mongo.Collection("___meteor_failure_test_collection");

// For test "document with a custom type"
var Dog = function (name, color, actions) {
  var self = this;
  self.color = color;
  self.name = name;
  self.actions = actions || [{name: "wag"}, {name: "swim"}];
};
_.extend(Dog.prototype, {
  getName: function () { return this.name;},
  getColor: function () { return this.name;},
  equals: function (other) { return other.name === this.name &&
                             other.color === this.color &&
                             EJSON.equals(other.actions, this.actions);},
  toJSONValue: function () { return {color: this.color, name: this.name, actions: this.actions};},
  typeName: function () { return "dog"; },
  clone: function () { return new Dog(this.name, this.color); },
  speak: function () { return "woof"; }
});
EJSON.addType("dog", function (o) { return new Dog(o.name, o.color, o.actions);});


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
      var arg2 = {};

      var callOp = function (callback) {
        if (op === "update") {
          ftc[op](arg, arg2, callback);
        } else {
          ftc[op](arg, callback);
        }
      };

      if (Meteor.isServer) {
        test.throws(function () {
          callOp();
        });

        callOp(expect(exception));
      }

      if (Meteor.isClient) {
        callOp(expect(exception));

        // This would log to console in normal operation.
        Meteor._suppress_log(1);
        callOp();
      }
    });
  }
]);


Tinytest.addAsync("mongo-livedata - basics, " + idGeneration, function (test, onComplete) {
  var run = test.runId();
  var coll, coll2;
  if (Meteor.isClient) {
    coll = new Mongo.Collection(null, collectionOptions) ; // local, unmanaged
    coll2 = new Mongo.Collection(null, collectionOptions); // local, unmanaged
  } else {
    coll = new Mongo.Collection("livedata_test_collection_"+run, collectionOptions);
    coll2 = new Mongo.Collection("livedata_test_collection_2_"+run, collectionOptions);
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
      var fence = new DDPServer._WriteFence;
      DDPServer._CurrentWriteFence.withValue(fence, f);
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


  // Regression test for https://github.com/meteor/meteor/issues/7436
  //  - ensure applySkipLimit defaults to false for count()
  // Note that the current behavior is inconsistent on the client.
  //  (https://github.com/meteor/meteor/issues/1201)
  if (Meteor.isServer) {
    test.equal(coll.find({run: run}, {limit: 1}).count(), 2);
    test.equal(coll.find({run: run}, {limit: 1}).count(true), 1);
    test.equal(coll.find({run: run}, {limit: 1}).count(false), 2);
  }

  var cur = coll.find({run: run}, {sort: ["x"]});
  var total = 0;
  var index = 0;
  var context = {};
  cur.forEach(function (doc, i, cursor) {
    test.equal(i, index++);
    test.isTrue(cursor === cur);
    test.isTrue(context === this);
    total *= 10;
    if (Meteor.isServer) {
      // Verify that the callbacks from forEach run sequentially and that
      // forEach waits for them to complete (issue# 321). If they do not run
      // sequentially, then the second callback could execute during the first
      // callback's sleep sleep and the *= 10 will occur before the += 1, then
      // total (at test.equal time) will be 5. If forEach does not wait for the
      // callbacks to complete, then total (at test.equal time) will be 0.
      Meteor._sleepForMs(5);
    }
    total += doc.x;
    // verify the meteor environment is set up here
    coll2.insert({total:total});
  }, context);
  test.equal(total, 14);

  index = 0;
  test.equal(cur.map(function (doc, i, cursor) {
    // XXX we could theoretically make map run its iterations in parallel or
    // something which would make this fail
    test.equal(i, index++);
    test.isTrue(cursor === cur);
    test.isTrue(context === this);
    return doc.x * 2;
  }, context), [2, 8]);

  test.equal(_.pluck(coll.find({run: run}, {sort: {x: -1}}).fetch(), "x"),
             [4, 1]);

  expectObserve('', function () {
    var count = coll.update({run: run, x: -1}, {$inc: {x: 2}}, {multi: true});
    test.equal(count, 0);
  });

  expectObserve('c(3,0,1)c(6,1,4)', function () {
    var count = coll.update({run: run}, {$inc: {x: 2}}, {multi: true});
    test.equal(count, 2);
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
    var count = coll.remove({run: run, x: {$gt: 10}});
    test.equal(count, 1);
    test.equal(coll.find({run: run}).count(), 1);
  });

  expectObserve('r(6,0)', function () {
    coll.remove({run: run});
    test.equal(coll.find({run: run}).count(), 0);
  });

  expectObserve('', function () {
    var count = coll.remove({run: run});
    test.equal(count, 0);
    test.equal(coll.find({run: run}).count(), 0);
  });

  obs.stop();
  onComplete();
});

Tinytest.addAsync("mongo-livedata - fuzz test, " + idGeneration, function(test, onComplete) {

  var run = Random.id();
  var coll;
  if (Meteor.isClient) {
    coll = new Mongo.Collection(null, collectionOptions); // local, unmanaged
  } else {
    coll = new Mongo.Collection("livedata_test_collection_"+run, collectionOptions);
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

  if (Meteor.isServer) {
    // For now, has to be polling (not oplog) because it is ordered observe.
    test.isTrue(obs._multiplexer._observeDriver._suspendPolling);
  }

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
      var fence = new DDPServer._WriteFence;
      DDPServer._CurrentWriteFence.withValue(fence, f);
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
      if (Meteor.isServer)
        obs._multiplexer._observeDriver._suspendPolling();

      // Do a batch of 1-10 operations
      var batch_count = rnd(10) + 1;
      for (var i = 0; i < batch_count; i++) {
        // 25% add, 25% remove, 25% change in place, 25% change and move
        var x;
        var op = rnd(4);
        var which = rnd(correct.length);
        if (op === 0 || step < 2 || !correct.length) {
          // Add
          x = rnd(1000000);
          coll.insert({run: run, x: x});
          correct.push(x);
          max_counters.add++;
        } else if (op === 1 || op === 2) {
          var val;
          x = correct[which];
          if (op === 1) {
            // Small change, not likely to cause a move
            val = x + (rnd(2) ? -1 : 1);
          } else {
            // Large change, likely to cause a move
            val = rnd(1000000);
          }
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
        obs._multiplexer._observeDriver._resumePolling();

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

Tinytest.addAsync("mongo-livedata - scribbling, " + idGeneration, function (test, onComplete) {
  var run = test.runId();
  var coll;
  if (Meteor.isClient) {
    coll = new Mongo.Collection(null, collectionOptions); // local, unmanaged
  } else {
    coll = new Mongo.Collection("livedata_test_collection_"+run, collectionOptions);
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
  var run = Random.id();
  var coll;
  if (Meteor.isClient) {
    coll = new Mongo.Collection(null, collectionOptions); // local, unmanaged
  } else {
    coll = new Mongo.Collection("stopHandleInCallback-"+run, collectionOptions);
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
    var coll = new Mongo.Collection("observeInCallback-"+run, collectionOptions);

    var callbackCalled = false;
    var handle = coll.find({}).observe({
      added: function (newDoc) {
        callbackCalled = true;
        test.throws(function () {
          coll.find({}).observe();
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
    var coll = new Mongo.Collection("cursorDedup-"+run, collectionOptions);

    var observer = function (noAdded) {
      var output = [];
      var callbacks = {
        changed: function (newDoc) {
          output.push({changed: newDoc._id});
        }
      };
      if (!noAdded) {
        callbacks.added = function (doc) {
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

    // White-box test: both observes should share an ObserveMultiplexer.
    var observeMultiplexer = o1.handle._multiplexer;
    test.isTrue(observeMultiplexer);
    test.isTrue(observeMultiplexer === o2.handle._multiplexer);

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

    // Stop second handle. Nothing should happen, but the multiplexer should
    // be stopped.
    test.isTrue(observeMultiplexer._handles);  // This will change.
    o2.handle.stop();
    test.length(o1.output, 0);
    test.length(o2.output, 0);
    // White-box: ObserveMultiplexer has nulled its _handles so you can't
    // accidentally join to it.
    test.isNull(observeMultiplexer._handles);

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
    // White-box: Different ObserveMultiplexer.
    test.isTrue(observeMultiplexer !== o3.handle._multiplexer);

    // Start another handle with no added callback. Regression test for #589.
    var o4 = observer(true);

    o3.handle.stop();
    o4.handle.stop();

    onComplete();
  });

  Tinytest.addAsync("mongo-livedata - async server-side insert, " + idGeneration, function (test, onComplete) {
    // Tests that insert returns before the callback runs. Relies on the fact
    // that mongo does not run the callback before spinning off the event loop.
    var cname = Random.id();
    var coll = new Mongo.Collection(cname);
    var doc = { foo: "bar" };
    var x = 0;
    coll.insert(doc, function (err, result) {
      test.equal(err, null);
      test.equal(x, 1);
      onComplete();
    });
    x++;
  });

  Tinytest.addAsync("mongo-livedata - async server-side update, " + idGeneration, function (test, onComplete) {
    // Tests that update returns before the callback runs.
    var cname = Random.id();
    var coll = new Mongo.Collection(cname);
    var doc = { foo: "bar" };
    var x = 0;
    var id = coll.insert(doc);
    coll.update(id, { $set: { foo: "baz" } }, function (err, result) {
      test.equal(err, null);
      test.equal(result, 1);
      test.equal(x, 1);
      onComplete();
    });
    x++;
  });

  Tinytest.addAsync("mongo-livedata - async server-side remove, " + idGeneration, function (test, onComplete) {
    // Tests that remove returns before the callback runs.
    var cname = Random.id();
    var coll = new Mongo.Collection(cname);
    var doc = { foo: "bar" };
    var x = 0;
    var id = coll.insert(doc);
    coll.remove(id, function (err, result) {
      test.equal(err, null);
      test.isFalse(coll.findOne(id));
      test.equal(x, 1);
      onComplete();
    });
    x++;
  });

  // compares arrays a and b w/o looking at order
  var setsEqual = function (a, b) {
    a = _.map(a, EJSON.stringify);
    b = _.map(b, EJSON.stringify);
    return _.isEmpty(_.difference(a, b)) && _.isEmpty(_.difference(b, a));
  };

  // This test mainly checks the correctness of oplog code dealing with limited
  // queries. Compitablity with poll-diff is added as well.
  Tinytest.addAsync("mongo-livedata - observe sorted, limited " + idGeneration, function (test, onComplete) {
    var run = test.runId();
    var coll = new Mongo.Collection("observeLimit-"+run, collectionOptions);

    var observer = function () {
      var state = {};
      var output = [];
      var callbacks = {
        changed: function (newDoc) {
          output.push({changed: newDoc._id});
          state[newDoc._id] = newDoc;
        },
        added: function (newDoc) {
          output.push({added: newDoc._id});
          state[newDoc._id] = newDoc;
        },
        removed: function (oldDoc) {
          output.push({removed: oldDoc._id});
          delete state[oldDoc._id];
        }
      };
      var handle = coll.find({foo: 22},
                             {sort: {bar: 1}, limit: 3}).observe(callbacks);

      return {output: output, handle: handle, state: state};
    };
    var clearOutput = function (o) { o.output.splice(0, o.output.length); };

    var ins = function (doc) {
      var id; runInFence(function () { id = coll.insert(doc); });
      return id;
    };
    var rem = function (sel) { runInFence(function () { coll.remove(sel); }); };
    var upd = function (sel, mod, opt) {
      runInFence(function () {
        coll.update(sel, mod, opt);
      });
    };
    // tests '_id' subfields for all documents in oplog buffer
    var testOplogBufferIds = function (ids) {
      if (!usesOplog)
        return;
      var bufferIds = [];
      o.handle._multiplexer._observeDriver._unpublishedBuffer.forEach(function (x, id) {
        bufferIds.push(id);
      });

      test.isTrue(setsEqual(ids, bufferIds), "expected: " + ids + "; got: " + bufferIds);
    };
    var testSafeAppendToBufferFlag = function (expected) {
      if (!usesOplog)
        return;
      test.equal(o.handle._multiplexer._observeDriver._safeAppendToBuffer,
                 expected);
    };

    // We'll describe our state as follows.  5:1 means "the document with
    // _id=docId1 and bar=5".  We list documents as
    //   [ currently published | in the buffer ] outside the buffer
    // If safeToAppendToBuffer is true, we'll say ]! instead.

    // Insert a doc and start observing.
    var docId1 = ins({foo: 22, bar: 5});
    waitUntilOplogCaughtUp();

    // State: [ 5:1 | ]!
    var o = observer();
    var usesOplog = o.handle._multiplexer._observeDriver._usesOplog;
    // Initial add.
    test.length(o.output, 1);
    test.equal(o.output.shift(), {added: docId1});
    testSafeAppendToBufferFlag(true);

    // Insert another doc (blocking until observes have fired).
    // State: [ 5:1 6:2 | ]!
    var docId2 = ins({foo: 22, bar: 6});
    // Observed add.
    test.length(o.output, 1);
    test.equal(o.output.shift(), {added: docId2});
    testSafeAppendToBufferFlag(true);

    var docId3 = ins({ foo: 22, bar: 3 });
    // State: [ 3:3 5:1 6:2 | ]!
    test.length(o.output, 1);
    test.equal(o.output.shift(), {added: docId3});
    testSafeAppendToBufferFlag(true);

    // Add a non-matching document
    ins({ foo: 13 });
    // It shouldn't be added
    test.length(o.output, 0);

    // Add something that matches but is too big to fit in
    var docId4 = ins({ foo: 22, bar: 7 });
    // State: [ 3:3 5:1 6:2 | 7:4 ]!
    // It shouldn't be added but should end up in the buffer.
    test.length(o.output, 0);
    testOplogBufferIds([docId4]);
    testSafeAppendToBufferFlag(true);

    // Let's add something small enough to fit in
    var docId5 = ins({ foo: 22, bar: -1 });
    // State: [ -1:5 3:3 5:1 | 6:2 7:4 ]!
    // We should get an added and a removed events
    test.length(o.output, 2);
    // doc 2 was removed from the published set as it is too big to be in
    test.isTrue(setsEqual(o.output, [{added: docId5}, {removed: docId2}]));
    clearOutput(o);
    testOplogBufferIds([docId2, docId4]);
    testSafeAppendToBufferFlag(true);

    // Now remove something and that doc 2 should be right back
    rem(docId5);
    // State: [ 3:3 5:1 6:2 | 7:4 ]!
    test.length(o.output, 2);
    test.isTrue(setsEqual(o.output, [{removed: docId5}, {added: docId2}]));
    clearOutput(o);
    testOplogBufferIds([docId4]);
    testSafeAppendToBufferFlag(true);

    // Add some negative numbers overflowing the buffer.
    // New documents will take the published place, [3 5 6] will take the buffer
    // and 7 will be outside of the buffer in MongoDB.
    var docId6 = ins({ foo: 22, bar: -1 });
    var docId7 = ins({ foo: 22, bar: -2 });
    var docId8 = ins({ foo: 22, bar: -3 });
    // State: [ -3:8 -2:7 -1:6 | 3:3 5:1 6:2 ] 7:4
    test.length(o.output, 6);
    var expected = [{added: docId6}, {removed: docId2},
                    {added: docId7}, {removed: docId1},
                    {added: docId8}, {removed: docId3}];
    test.isTrue(setsEqual(o.output, expected));
    clearOutput(o);
    testOplogBufferIds([docId1, docId2, docId3]);
    testSafeAppendToBufferFlag(false);

    // If we update first 3 docs (increment them by 20), it would be
    // interesting.
    upd({ bar: { $lt: 0 }}, { $inc: { bar: 20 } }, { multi: true });
    // State: [ 3:3 5:1 6:2 | ] 7:4 17:8 18:7 19:6
    //   which triggers re-poll leaving us at
    // State: [ 3:3 5:1 6:2 | 7:4 17:8 18:7 ] 19:6

    // The updated documents can't find their place in published and they can't
    // be buffered as we are not aware of the situation outside of the buffer.
    // But since our buffer becomes empty, it will be refilled partially with
    // updated documents.
    test.length(o.output, 6);
    var expectedRemoves = [{removed: docId6},
                           {removed: docId7},
                           {removed: docId8}];
    var expectedAdds = [{added: docId3},
                        {added: docId1},
                        {added: docId2}];

    test.isTrue(setsEqual(o.output, expectedAdds.concat(expectedRemoves)));
    clearOutput(o);
    testOplogBufferIds([docId4, docId7, docId8]);
    testSafeAppendToBufferFlag(false);

    // Remove first 4 docs (3, 1, 2, 4) forcing buffer to become empty and
    // schedule a repoll.
    rem({ bar: { $lt: 10 } });
    // State: [ 17:8 18:7 19:6 | ]!

    // XXX the oplog code analyzes the events one by one: one remove after
    // another. Poll-n-diff code, on the other side, analyzes the batch action
    // of multiple remove. Because of that difference, expected outputs differ.
    if (usesOplog) {
      expectedRemoves = [{removed: docId3}, {removed: docId1},
                             {removed: docId2}, {removed: docId4}];
      expectedAdds = [{added: docId4}, {added: docId8},
                          {added: docId7}, {added: docId6}];

      test.length(o.output, 8);
    } else {
      expectedRemoves = [{removed: docId3}, {removed: docId1},
                             {removed: docId2}];
      expectedAdds = [{added: docId8}, {added: docId7}, {added: docId6}];

      test.length(o.output, 6);
    }

    test.isTrue(setsEqual(o.output, expectedAdds.concat(expectedRemoves)));
    clearOutput(o);
    testOplogBufferIds([]);
    testSafeAppendToBufferFlag(true);

    var docId9 = ins({ foo: 22, bar: 21 });
    var docId10 = ins({ foo: 22, bar: 31 });
    var docId11 = ins({ foo: 22, bar: 41 });
    var docId12 = ins({ foo: 22, bar: 51 });
    // State: [ 17:8 18:7 19:6 | 21:9 31:10 41:11 ] 51:12

    testOplogBufferIds([docId9, docId10, docId11]);
    testSafeAppendToBufferFlag(false);
    test.length(o.output, 0);
    upd({ bar: { $lt: 20 } }, { $inc: { bar: 5 } }, { multi: true });
    // State: [ 21:9 22:8 23:7 | 24:6 31:10 41:11 ] 51:12
    test.length(o.output, 4);
    test.isTrue(setsEqual(o.output, [{removed: docId6},
                                     {added: docId9},
                                     {changed: docId7},
                                     {changed: docId8}]));
    clearOutput(o);
    testOplogBufferIds([docId6, docId10, docId11]);
    testSafeAppendToBufferFlag(false);

    rem(docId9);
    // State: [ 22:8 23:7 24:6 | 31:10 41:11 ] 51:12
    test.length(o.output, 2);
    test.isTrue(setsEqual(o.output, [{removed: docId9}, {added: docId6}]));
    clearOutput(o);
    testOplogBufferIds([docId10, docId11]);
    testSafeAppendToBufferFlag(false);

    upd({ bar: { $gt: 25 } }, { $inc: { bar: -7.5 } }, { multi: true });
    // State: [ 22:8 23:7 23.5:10 | 24:6 ] 33.5:11 43.5:12
    // 33.5 doesn't update in-place in buffer, because it the driver is not sure
    // it can do it: because the buffer does not have the safe append flag set,
    // for all it knows there is a different doc which is less than 33.5.
    test.length(o.output, 2);
    test.isTrue(setsEqual(o.output, [{removed: docId6}, {added: docId10}]));
    clearOutput(o);
    testOplogBufferIds([docId6]);
    testSafeAppendToBufferFlag(false);

    // Force buffer objects to be moved into published set so we can check them
    rem(docId7);
    rem(docId8);
    rem(docId10);
    // State: [ 24:6 | ] 33.5:11 43.5:12
    //    triggers repoll
    // State: [ 24:6 33.5:11 43.5:12 | ]!
    test.length(o.output, 6);
    test.isTrue(setsEqual(o.output, [{removed: docId7}, {removed: docId8},
                                     {removed: docId10}, {added: docId6},
                                     {added: docId11}, {added: docId12}]));

    test.length(_.keys(o.state), 3);
    test.equal(o.state[docId6], { _id: docId6, foo: 22, bar: 24 });
    test.equal(o.state[docId11], { _id: docId11, foo: 22, bar: 33.5 });
    test.equal(o.state[docId12], { _id: docId12, foo: 22, bar: 43.5 });
    clearOutput(o);
    testOplogBufferIds([]);
    testSafeAppendToBufferFlag(true);

    var docId13 = ins({ foo: 22, bar: 50 });
    var docId14 = ins({ foo: 22, bar: 51 });
    var docId15 = ins({ foo: 22, bar: 52 });
    var docId16 = ins({ foo: 22, bar: 53 });
    // State: [ 24:6 33.5:11 43.5:12 | 50:13 51:14 52:15 ] 53:16
    test.length(o.output, 0);
    testOplogBufferIds([docId13, docId14, docId15]);
    testSafeAppendToBufferFlag(false);

    // Update something that's outside the buffer to be in the buffer, writing
    // only to the sort key.
    upd(docId16, {$set: {bar: 10}});
    // State: [ 10:16 24:6 33.5:11 | 43.5:12 50:13 51:14 ] 52:15
    test.length(o.output, 2);
    test.isTrue(setsEqual(o.output, [{removed: docId12}, {added: docId16}]));
    clearOutput(o);
    testOplogBufferIds([docId12, docId13, docId14]);
    testSafeAppendToBufferFlag(false);

    o.handle.stop();
    onComplete();
  });

  Tinytest.addAsync("mongo-livedata - observe sorted, limited, sort fields " + idGeneration, function (test, onComplete) {
    var run = test.runId();
    var coll = new Mongo.Collection("observeLimit-"+run, collectionOptions);

    var observer = function () {
      var state = {};
      var output = [];
      var callbacks = {
        changed: function (newDoc) {
          output.push({changed: newDoc._id});
          state[newDoc._id] = newDoc;
        },
        added: function (newDoc) {
          output.push({added: newDoc._id});
          state[newDoc._id] = newDoc;
        },
        removed: function (oldDoc) {
          output.push({removed: oldDoc._id});
          delete state[oldDoc._id];
        }
      };
      var handle = coll.find({}, {sort: {x: 1},
                                  limit: 2,
                                  fields: {y: 1}}).observe(callbacks);

      return {output: output, handle: handle, state: state};
    };
    var clearOutput = function (o) { o.output.splice(0, o.output.length); };
    var ins = function (doc) {
      var id; runInFence(function () { id = coll.insert(doc); });
      return id;
    };
    var rem = function (id) {
      runInFence(function () { coll.remove(id); });
    };

    var o = observer();

    var docId1 = ins({ x: 1, y: 1222 });
    var docId2 = ins({ x: 5, y: 5222 });

    test.length(o.output, 2);
    test.equal(o.output, [{added: docId1}, {added: docId2}]);
    clearOutput(o);

    var docId3 = ins({ x: 7, y: 7222 });
    test.length(o.output, 0);

    var docId4 = ins({ x: -1, y: -1222 });

    // Becomes [docId4 docId1 | docId2 docId3]
    test.length(o.output, 2);
    test.isTrue(setsEqual(o.output, [{added: docId4}, {removed: docId2}]));

    test.equal(_.size(o.state), 2);
    test.equal(o.state[docId4], {_id: docId4, y: -1222});
    test.equal(o.state[docId1], {_id: docId1, y: 1222});
    clearOutput(o);

    rem(docId2);
    // Becomes [docId4 docId1 | docId3]
    test.length(o.output, 0);

    rem(docId4);
    // Becomes [docId1 docId3]
    test.length(o.output, 2);
    test.isTrue(setsEqual(o.output, [{added: docId3}, {removed: docId4}]));

    test.equal(_.size(o.state), 2);
    test.equal(o.state[docId3], {_id: docId3, y: 7222});
    test.equal(o.state[docId1], {_id: docId1, y: 1222});
    clearOutput(o);

    onComplete();
  });

  Tinytest.addAsync("mongo-livedata - observe sorted, limited, big initial set" + idGeneration, function (test, onComplete) {
    var run = test.runId();
    var coll = new Mongo.Collection("observeLimit-"+run, collectionOptions);

    var observer = function () {
      var state = {};
      var output = [];
      var callbacks = {
        changed: function (newDoc) {
          output.push({changed: newDoc._id});
          state[newDoc._id] = newDoc;
        },
        added: function (newDoc) {
          output.push({added: newDoc._id});
          state[newDoc._id] = newDoc;
        },
        removed: function (oldDoc) {
          output.push({removed: oldDoc._id});
          delete state[oldDoc._id];
        }
      };
      var handle = coll.find({}, {sort: {x: 1, y: 1}, limit: 3})
                    .observe(callbacks);

      return {output: output, handle: handle, state: state};
    };
    var clearOutput = function (o) { o.output.splice(0, o.output.length); };
    var ins = function (doc) {
      var id; runInFence(function () { id = coll.insert(doc); });
      return id;
    };
    var rem = function (id) {
      runInFence(function () { coll.remove(id); });
    };
    // tests '_id' subfields for all documents in oplog buffer
    var testOplogBufferIds = function (ids) {
      var bufferIds = [];
      o.handle._multiplexer._observeDriver._unpublishedBuffer.forEach(function (x, id) {
        bufferIds.push(id);
      });

      test.isTrue(setsEqual(ids, bufferIds), "expected: " + ids + "; got: " + bufferIds);
    };
    var testSafeAppendToBufferFlag = function (expected) {
      if (expected) {
        test.isTrue(o.handle._multiplexer._observeDriver._safeAppendToBuffer);
      } else {
        test.isFalse(o.handle._multiplexer._observeDriver._safeAppendToBuffer);
      }
    };

    var ids = {};
    _.each([2, 4, 1, 3, 5, 5, 9, 1, 3, 2, 5], function (x, i) {
      ids[i] = ins({ x: x, y: i });
    });

    // Ensure that we are past all the 'i' entries before we run the query, so
    // that we get the expected phase transitions.
    waitUntilOplogCaughtUp();

    var o = observer();
    var usesOplog = o.handle._multiplexer._observeDriver._usesOplog;
    //  x: [1 1 2 | 2 3 3] 4 5 5 5  9
    // id: [2 7 0 | 9 3 8] 1 4 5 10 6

    test.length(o.output, 3);
    test.isTrue(setsEqual([{added: ids[2]}, {added: ids[7]}, {added: ids[0]}], o.output));
    usesOplog && testOplogBufferIds([ids[9], ids[3], ids[8]]);
    usesOplog && testSafeAppendToBufferFlag(false);
    clearOutput(o);

    rem(ids[0]);
    //  x: [1 1 2 | 3 3] 4 5 5 5  9
    // id: [2 7 9 | 3 8] 1 4 5 10 6
    test.length(o.output, 2);
    test.isTrue(setsEqual([{removed: ids[0]}, {added: ids[9]}], o.output));
    usesOplog && testOplogBufferIds([ids[3], ids[8]]);
    usesOplog && testSafeAppendToBufferFlag(false);
    clearOutput(o);

    rem(ids[7]);
    //  x: [1 2 3 | 3] 4 5 5 5  9
    // id: [2 9 3 | 8] 1 4 5 10 6
    test.length(o.output, 2);
    test.isTrue(setsEqual([{removed: ids[7]}, {added: ids[3]}], o.output));
    usesOplog && testOplogBufferIds([ids[8]]);
    usesOplog && testSafeAppendToBufferFlag(false);
    clearOutput(o);

    rem(ids[3]);
    //  x: [1 2 3 | 4 5 5] 5  9
    // id: [2 9 8 | 1 4 5] 10 6
    test.length(o.output, 2);
    test.isTrue(setsEqual([{removed: ids[3]}, {added: ids[8]}], o.output));
    usesOplog && testOplogBufferIds([ids[1], ids[4], ids[5]]);
    usesOplog && testSafeAppendToBufferFlag(false);
    clearOutput(o);

    rem({ x: {$lt: 4} });
    //  x: [4 5 5 | 5  9]
    // id: [1 4 5 | 10 6]
    test.length(o.output, 6);
    test.isTrue(setsEqual([{removed: ids[2]}, {removed: ids[9]}, {removed: ids[8]},
                           {added: ids[5]}, {added: ids[4]}, {added: ids[1]}], o.output));
    usesOplog && testOplogBufferIds([ids[10], ids[6]]);
    usesOplog && testSafeAppendToBufferFlag(true);
    clearOutput(o);


    onComplete();
  });
}


testAsyncMulti('mongo-livedata - empty documents, ' + idGeneration, [
  function (test, expect) {
    this.collectionName = Random.id();
    if (Meteor.isClient) {
      Meteor.call('createInsecureCollection', this.collectionName);
      Meteor.subscribe('c-' + this.collectionName, expect());
    }
  }, function (test, expect) {
    var coll = new Mongo.Collection(this.collectionName, collectionOptions);

    coll.insert({}, expect(function (err, id) {
      test.isFalse(err);
      test.isTrue(id);
      var cursor = coll.find();
      test.equal(cursor.count(), 1);
    }));
  }
]);

// Regression test for #2413.
testAsyncMulti('mongo-livedata - upsert without callback, ' + idGeneration, [
  function (test, expect) {
    this.collectionName = Random.id();
    if (Meteor.isClient) {
      Meteor.call('createInsecureCollection', this.collectionName);
      Meteor.subscribe('c-' + this.collectionName, expect());
    }
  }, function (test, expect) {
    var coll = new Mongo.Collection(this.collectionName, collectionOptions);

    // No callback!  Before fixing #2413, this method never returned and
    // so no future DDP methods worked either.
    coll.upsert('foo', {bar: 1});
    // Do something else on the same method and expect it to actually work.
    // (If the bug comes back, this will 'async batch timeout'.)
    coll.insert({}, expect(function(){}));
  }
]);

// Regression test for https://github.com/meteor/meteor/issues/8666.
testAsyncMulti('mongo-livedata - upsert with an undefined selector, ' + idGeneration, [
  function (test, expect) {
    this.collectionName = Random.id();
    if (Meteor.isClient) {
      Meteor.call('createInsecureCollection', this.collectionName);
      Meteor.subscribe('c-' + this.collectionName, expect());
    }
  }, function (test, expect) {
    var coll = new Mongo.Collection(this.collectionName, collectionOptions);
    var testWidget = {
      name: 'Widget name'
    };
    coll.upsert(testWidget._id, testWidget, expect(function (error, insertDetails) {
      test.isFalse(error);
      test.equal(
        coll.findOne(insertDetails.insertedId),
        Object.assign({ _id: insertDetails.insertedId }, testWidget)
      );
    }));
  }
]);

// See https://github.com/meteor/meteor/issues/594.
testAsyncMulti('mongo-livedata - document with length, ' + idGeneration, [
  function (test, expect) {
    this.collectionName = Random.id();
    if (Meteor.isClient) {
      Meteor.call('createInsecureCollection', this.collectionName, collectionOptions);
      Meteor.subscribe('c-' + this.collectionName, expect());
    }
  }, function (test, expect) {
    var self = this;
    var coll = self.coll = new Mongo.Collection(self.collectionName, collectionOptions);

    coll.insert({foo: 'x', length: 0}, expect(function (err, id) {
      test.isFalse(err);
      test.isTrue(id);
      self.docId = id;
      test.equal(coll.findOne(self.docId),
                 {_id: self.docId, foo: 'x', length: 0});
    }));
  },
  function (test, expect) {
    var self = this;
    var coll = self.coll;
    coll.update(self.docId, {$set: {length: 5}}, expect(function (err) {
      test.isFalse(err);
      test.equal(coll.findOne(self.docId),
                 {_id: self.docId, foo: 'x', length: 5});
    }));
  }
]);

testAsyncMulti('mongo-livedata - document with a date, ' + idGeneration, [
  function (test, expect) {
    this.collectionName = Random.id();
    if (Meteor.isClient) {
      Meteor.call('createInsecureCollection', this.collectionName, collectionOptions);
      Meteor.subscribe('c-' + this.collectionName, expect());
    }
  }, function (test, expect) {

    var coll = new Mongo.Collection(this.collectionName, collectionOptions);
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
    self.collectionOptions = {
      idGeneration: idGeneration,
      transform: seconds,
      transformName: "seconds"
    };
    this.collectionName = Random.id();
    if (Meteor.isClient) {
      Meteor.call('createInsecureCollection', this.collectionName, collectionOptions);
      Meteor.subscribe('c-' + this.collectionName, expect());
    }
  }, function (test, expect) {
    var self = this;
    self.coll = new Mongo.Collection(self.collectionName, self.collectionOptions);
    var obs;
    var expectAdd = expect(function (doc) {
      test.equal(doc.seconds(), 50);
    });
    var expectRemove = expect(function (doc) {
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
  }
]);

testAsyncMulti('mongo-livedata - transform sets _id if not present, ' + idGeneration, [
  function (test, expect) {
    var self = this;
    var justId = function (doc) {
      return _.omit(doc, '_id');
    };
    TRANSFORMS["justId"] = justId;
    var collectionOptions = {
      idGeneration: idGeneration,
      transform: justId,
      transformName: "justId"
    };
    this.collectionName = Random.id();
    if (Meteor.isClient) {
      Meteor.call('createInsecureCollection', this.collectionName, collectionOptions);
      Meteor.subscribe('c-' + this.collectionName, expect());
    }
  }, function (test, expect) {
    var self = this;
    self.coll = new Mongo.Collection(this.collectionName, collectionOptions);
    self.coll.insert({}, expect(function (err, id) {
      test.isFalse(err);
      test.isTrue(id);
      test.equal(self.coll.findOne()._id, id);
    }));
  }
]);

var bin = Base64.decode(
  "TWFuIGlzIGRpc3Rpbmd1aXNoZWQsIG5vdCBvbmx5IGJ5IGhpcyBy" +
    "ZWFzb24sIGJ1dCBieSB0aGlzIHNpbmd1bGFyIHBhc3Npb24gZnJv" +
    "bSBvdGhlciBhbmltYWxzLCB3aGljaCBpcyBhIGx1c3Qgb2YgdGhl" +
    "IG1pbmQsIHRoYXQgYnkgYSBwZXJzZXZlcmFuY2Ugb2YgZGVsaWdo" +
    "dCBpbiB0aGUgY29udGludWVkIGFuZCBpbmRlZmF0aWdhYmxlIGdl" +
    "bmVyYXRpb24gb2Yga25vd2xlZGdlLCBleGNlZWRzIHRoZSBzaG9y" +
    "dCB2ZWhlbWVuY2Ugb2YgYW55IGNhcm5hbCBwbGVhc3VyZS4=");

testAsyncMulti('mongo-livedata - document with binary data, ' + idGeneration, [
  function (test, expect) {
    // XXX probably shouldn't use EJSON's private test symbols
    this.collectionName = Random.id();
    if (Meteor.isClient) {
      Meteor.call('createInsecureCollection', this.collectionName, collectionOptions);
      Meteor.subscribe('c-' + this.collectionName, expect());
    }
  }, function (test, expect) {
    var coll = new Mongo.Collection(this.collectionName, collectionOptions);
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
    this.collectionName = Random.id();
    if (Meteor.isClient) {
      Meteor.call('createInsecureCollection', this.collectionName, collectionOptions);
      Meteor.subscribe('c-' + this.collectionName, expect());
    }
  },

  function (test, expect) {
    var self = this;
    self.coll = new Mongo.Collection(this.collectionName, collectionOptions);
    var docId;
    // Dog is implemented at the top of the file, outside of the idGeneration
    // loop (so that we only call EJSON.addType once).
    var d = new Dog("reginald", null);
    self.coll.insert({d: d}, expect(function (err, id) {
      test.isFalse(err);
      test.isTrue(id);
      docId = id;
      self.docId = docId;
      var cursor = self.coll.find();
      test.equal(cursor.count(), 1);
      var inColl = self.coll.findOne();
      test.isTrue(inColl);
      inColl && test.equal(inColl.d.speak(), "woof");
      inColl && test.isNull(inColl.d.color);
    }));
  },

  function (test, expect) {
    var self = this;
    self.coll.insert(new Dog("rover", "orange"), expect(function (err, id) {
      test.isTrue(err);
      test.isFalse(id);
    }));
  },

  function (test, expect) {
    var self = this;
    self.coll.update(
      self.docId, new Dog("rover", "orange"), expect(function (err) {
        test.isTrue(err);
      }));
  }
]);

if (Meteor.isServer) {
  Tinytest.addAsync("mongo-livedata - update return values, " + idGeneration, function (test, onComplete) {
    var run = test.runId();
    var coll = new Mongo.Collection("livedata_update_result_"+run, collectionOptions);

    coll.insert({ foo: "bar" });
    coll.insert({ foo: "baz" });
    test.equal(coll.update({}, { $set: { foo: "qux" } }, { multi: true }),
               2);
    coll.update({}, { $set: { foo: "quux" } }, { multi: true }, function (err, result) {
      test.isFalse(err);
      test.equal(result, 2);
      onComplete();
    });
  });

  Tinytest.addAsync("mongo-livedata - remove return values, " + idGeneration, function (test, onComplete) {
    var run = test.runId();
    var coll = new Mongo.Collection("livedata_update_result_"+run, collectionOptions);

    coll.insert({ foo: "bar" });
    coll.insert({ foo: "baz" });
    test.equal(coll.remove({}), 2);
    coll.insert({ foo: "bar" });
    coll.insert({ foo: "baz" });
    coll.remove({}, function (err, result) {
      test.isFalse(err);
      test.equal(result, 2);
      onComplete();
    });
  });


  Tinytest.addAsync("mongo-livedata - id-based invalidation, " + idGeneration, function (test, onComplete) {
    var run = test.runId();
    var coll = new Mongo.Collection("livedata_invalidation_collection_"+run, collectionOptions);

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
        // Make sure that we only poll on invalidation, not due to time, and
        // keep track of when we do. Note: this option disables the use of
        // oplogs (which admittedly is somewhat irrelevant to this feature).
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

  Tinytest.add("mongo-livedata - upsert error parse, " + idGeneration, function (test) {
    var run = test.runId();
    var coll = new Mongo.Collection("livedata_upsert_errorparse_collection_"+run, collectionOptions);

    coll.insert({_id:'foobar', foo: 'bar'});
    var err;
    try {
      coll.update({foo: 'bar'}, {_id: 'cowbar'});
    } catch (e) {
      err = e;
    }
    test.isTrue(err);
    test.isTrue(MongoInternals.Connection._isCannotChangeIdError(err));

    try {
      coll.insert({_id: 'foobar'});
    } catch (e) {
      err = e;
    }
    test.isTrue(err);
    // duplicate id error is not same as change id error
    test.isFalse(MongoInternals.Connection._isCannotChangeIdError(err));
  });

} // end Meteor.isServer

// This test is duplicated below (with some changes) for async upserts that go
// over the network.
_.each(Meteor.isServer ? [true, false] : [true], function (minimongo) {
  _.each([true, false], function (useUpdate) {
    _.each([true, false], function (useDirectCollection) {
      Tinytest.add("mongo-livedata - " + (useUpdate ? "update " : "") + "upsert" + (minimongo ? " minimongo" : "") + (useDirectCollection ? " direct collection " : "") + ", " + idGeneration, function (test) {
        var run = test.runId();
        var options = collectionOptions;
        // We don't get ids back when we use update() to upsert, or when we are
        // directly calling MongoConnection.upsert().
        var skipIds = useUpdate || (! minimongo && useDirectCollection);
        if (minimongo)
          options = _.extend({}, collectionOptions, { connection: null });
        var coll = new Mongo.Collection(
          "livedata_upsert_collection_"+run+
            (useUpdate ? "_update_" : "") +
            (minimongo ? "_minimongo_" : "") +
            (useDirectCollection ? "_direct_" : "") + "",
          options
        );
        if (useDirectCollection)
          coll = coll._collection;

        var result1 = upsert(coll, useUpdate, {foo: 'bar'}, {foo: 'bar'});
        test.equal(result1.numberAffected, 1);
        if (! skipIds)
          test.isTrue(result1.insertedId);
        compareResults(test, skipIds, coll.find().fetch(), [{foo: 'bar', _id: result1.insertedId}]);

        var result2 = upsert(coll, useUpdate, {foo: 'bar'}, {foo: 'baz'});
        test.equal(result2.numberAffected, 1);
        if (! skipIds)
          test.isFalse(result2.insertedId);
        compareResults(test, skipIds, coll.find().fetch(), [{foo: 'baz', _id: result1.insertedId}]);

        coll.remove({});

        // Test values that require transformation to go into Mongo:

        var t1 = new Mongo.ObjectID();
        var t2 = new Mongo.ObjectID();
        var result3 = upsert(coll, useUpdate, {foo: t1}, {foo: t1});
        test.equal(result3.numberAffected, 1);
        if (! skipIds)
          test.isTrue(result3.insertedId);
        compareResults(test, skipIds, coll.find().fetch(), [{foo: t1, _id: result3.insertedId}]);

        var result4 = upsert(coll, useUpdate, {foo: t1}, {foo: t2});
        test.equal(result2.numberAffected, 1);
        if (! skipIds)
          test.isFalse(result2.insertedId);
        compareResults(test, skipIds, coll.find().fetch(), [{foo: t2, _id: result3.insertedId}]);

        coll.remove({});

        // Test modification by upsert

        var result5 = upsert(coll, useUpdate, {name: 'David'}, {$set: {foo: 1}});
        test.equal(result5.numberAffected, 1);
        if (! skipIds)
          test.isTrue(result5.insertedId);
        var davidId = result5.insertedId;
        compareResults(test, skipIds, coll.find().fetch(), [{name: 'David', foo: 1, _id: davidId}]);

        test.throws(function () {
          // test that bad modifier fails fast
          upsert(coll, useUpdate, {name: 'David'}, {$blah: {foo: 2}});
        });


        var result6 = upsert(coll, useUpdate, {name: 'David'}, {$set: {foo: 2}});
        test.equal(result6.numberAffected, 1);
        if (! skipIds)
          test.isFalse(result6.insertedId);
        compareResults(test, skipIds, coll.find().fetch(), [{name: 'David', foo: 2,
                                                               _id: result5.insertedId}]);

        var emilyId = coll.insert({name: 'Emily', foo: 2});
        compareResults(test, skipIds, coll.find().fetch(), [{name: 'David', foo: 2, _id: davidId},
                                                              {name: 'Emily', foo: 2, _id: emilyId}]);

        // multi update by upsert
        var result7 = upsert(coll, useUpdate, {foo: 2},
                             {$set: {bar: 7},
                              $setOnInsert: {name: 'Fred', foo: 2}},
                             {multi: true});
        test.equal(result7.numberAffected, 2);
        if (! skipIds)
          test.isFalse(result7.insertedId);
        compareResults(test, skipIds, coll.find().fetch(), [{name: 'David', foo: 2, bar: 7, _id: davidId},
                                                              {name: 'Emily', foo: 2, bar: 7, _id: emilyId}]);

        // insert by multi upsert
        var result8 = upsert(coll, useUpdate, {foo: 3},
                             {$set: {bar: 7},
                              $setOnInsert: {name: 'Fred', foo: 2}},
                             {multi: true});
        test.equal(result8.numberAffected, 1);
        if (! skipIds)
          test.isTrue(result8.insertedId);
        var fredId = result8.insertedId;
        compareResults(test, skipIds, coll.find().fetch(),
                       [{name: 'David', foo: 2, bar: 7, _id: davidId},
                        {name: 'Emily', foo: 2, bar: 7, _id: emilyId},
                        {name: 'Fred', foo: 2, bar: 7, _id: fredId}]);

        // test `insertedId` option
        var result9 = upsert(coll, useUpdate, {name: 'Steve'},
                             {name: 'Steve'},
                             {insertedId: 'steve'});
        test.equal(result9.numberAffected, 1);
        if (! skipIds)
          test.equal(result9.insertedId, 'steve');
        compareResults(test, skipIds, coll.find().fetch(),
                       [{name: 'David', foo: 2, bar: 7, _id: davidId},
                        {name: 'Emily', foo: 2, bar: 7, _id: emilyId},
                        {name: 'Fred', foo: 2, bar: 7, _id: fredId},
                        {name: 'Steve', _id: 'steve'}]);
        test.isTrue(coll.findOne('steve'));
        test.isFalse(coll.findOne('fred'));

        // Test $ operator in selectors.

        var result10 = upsert(coll, useUpdate,
                              {$or: [{name: 'David'}, {name: 'Emily'}]},
                              {$set: {foo: 3}}, {multi: true});
        test.equal(result10.numberAffected, 2);
        if (! skipIds)
          test.isFalse(result10.insertedId);
        compareResults(test, skipIds,
                       [coll.findOne({name: 'David'}), coll.findOne({name: 'Emily'})],
                       [{name: 'David', foo: 3, bar: 7, _id: davidId},
                        {name: 'Emily', foo: 3, bar: 7, _id: emilyId}]
                      );

        var result11 = upsert(
          coll, useUpdate,
          {
            name: 'Charlie',
            $or: [{ foo: 2}, { bar: 7 }]
          },
          { $set: { foo: 3 } }
        );
        test.equal(result11.numberAffected, 1);
        if (! skipIds)
          test.isTrue(result11.insertedId);
        var charlieId = result11.insertedId;
        compareResults(test, skipIds,
                       coll.find({ name: 'Charlie' }).fetch(),
                       [{name: 'Charlie', foo: 3, _id: charlieId}]);
      });
    });
  });
});

var asyncUpsertTestName = function (useNetwork, useDirectCollection,
                                    useUpdate, idGeneration) {
  return "mongo-livedata - async " +
    (useUpdate ? "update " : "") +
    "upsert " +
    (useNetwork ? "over network " : "") +
    (useDirectCollection ? ", direct collection " : "") +
    idGeneration;
};

// This is a duplicate of the test above, with some changes to make it work for
// callback style. On the client, we test server-backed and in-memory
// collections, and run the tests for both the Mongo.Collection and the
// LocalCollection. On the server, we test mongo-backed collections, for both
// the Mongo.Collection and the MongoConnection.
//
// XXX Rewrite with testAsyncMulti, that would simplify things a lot!
_.each(Meteor.isServer ? [false] : [true, false], function (useNetwork) {
  _.each(useNetwork ? [false] : [true, false], function (useDirectCollection) {
    _.each([true, false], function (useUpdate) {
      Tinytest.addAsync(asyncUpsertTestName(useNetwork, useDirectCollection, useUpdate, idGeneration), function (test, onComplete) {
        var coll;
        var run = test.runId();
        var collName = "livedata_upsert_collection_"+run+
              (useUpdate ? "_update_" : "") +
              (useNetwork ? "_network_" : "") +
              (useDirectCollection ? "_direct_" : "");

        var next0 = function () {
          // Test starts here.
          upsert(coll, useUpdate, {_id: 'foo'}, {_id: 'foo', foo: 'bar'}, next1);
        };

        if (useNetwork) {
          Meteor.call("createInsecureCollection", collName, collectionOptions);
          coll = new Mongo.Collection(collName, collectionOptions);
          Meteor.subscribe("c-" + collName, next0);
        } else {
          var opts = _.clone(collectionOptions);
          if (Meteor.isClient)
            opts.connection = null;
          coll = new Mongo.Collection(collName, opts);
          if (useDirectCollection)
            coll = coll._collection;
        }

        var result1;
        var next1 = function (err, result) {
          result1 = result;
          test.equal(result1.numberAffected, 1);
          if (! useUpdate) {
            test.isTrue(result1.insertedId);
            test.equal(result1.insertedId, 'foo');
          }
          compareResults(test, useUpdate, coll.find().fetch(), [{foo: 'bar', _id: 'foo'}]);
          upsert(coll, useUpdate, {_id: 'foo'}, {foo: 'baz'}, next2);
        };

        if (! useNetwork) {
          next0();
        }

        var t1, t2, result2;
        var next2 = function (err, result) {
          result2 = result;
          test.equal(result2.numberAffected, 1);
          if (! useUpdate)
            test.isFalse(result2.insertedId);
          compareResults(test, useUpdate, coll.find().fetch(), [{foo: 'baz', _id: result1.insertedId}]);
          coll.remove({_id: 'foo'});
          compareResults(test, useUpdate, coll.find().fetch(), []);

          // Test values that require transformation to go into Mongo:

          t1 = new Mongo.ObjectID();
          t2 = new Mongo.ObjectID();
          upsert(coll, useUpdate, {_id: t1}, {_id: t1, foo: 'bar'}, next3);
        };

        var result3;
        var next3 = function (err, result) {
          result3 = result;
          test.equal(result3.numberAffected, 1);
          if (! useUpdate) {
            test.isTrue(result3.insertedId);
            test.equal(t1, result3.insertedId);
          }
          compareResults(test, useUpdate, coll.find().fetch(), [{_id: t1, foo: 'bar'}]);

          upsert(coll, useUpdate, {_id: t1}, {foo: t2}, next4);
        };

        var next4 = function (err, result4) {
          test.equal(result2.numberAffected, 1);
          if (! useUpdate)
            test.isFalse(result2.insertedId);
          compareResults(test, useUpdate, coll.find().fetch(), [{foo: t2, _id: result3.insertedId}]);

          coll.remove({_id: t1});

          // Test modification by upsert
          upsert(coll, useUpdate, {_id: 'David'}, {$set: {foo: 1}}, next5);
        };

        var result5;
        var next5 = function (err, result) {
          result5 = result;
          test.equal(result5.numberAffected, 1);
          if (! useUpdate) {
            test.isTrue(result5.insertedId);
            test.equal(result5.insertedId, 'David');
          }
          var davidId = result5.insertedId;
          compareResults(test, useUpdate, coll.find().fetch(), [{foo: 1, _id: davidId}]);

          if (! Meteor.isClient && useDirectCollection) {
            // test that bad modifier fails
            // The stub throws an exception about the invalid modifier, which
            // livedata logs (so we suppress it).
            Meteor._suppress_log(1);
            upsert(coll, useUpdate, {_id: 'David'}, {$blah: {foo: 2}}, function (err) {
              if (! (Meteor.isClient && useDirectCollection))
                test.isTrue(err);
              upsert(coll, useUpdate, {_id: 'David'}, {$set: {foo: 2}}, next6);
            });
          } else {
            // XXX skip this test for now for LocalCollection; the fact that
            // we're in a nested sequence of callbacks means we're inside a
            // Meteor.defer, which means the exception just gets
            // logged. Something should be done about this at some point?  Maybe
            // LocalCollection callbacks don't really have to be deferred.
            upsert(coll, useUpdate, {_id: 'David'}, {$set: {foo: 2}}, next6);
          }
        };

        var result6;
        var next6 = function (err, result) {
          result6 = result;
          test.equal(result6.numberAffected, 1);
          if (! useUpdate)
            test.isFalse(result6.insertedId);
          compareResults(test, useUpdate, coll.find().fetch(), [{_id: 'David', foo: 2}]);

          var emilyId = coll.insert({_id: 'Emily', foo: 2});
          compareResults(test, useUpdate, coll.find().fetch(), [{_id: 'David', foo: 2},
                                                                {_id: 'Emily', foo: 2}]);

          // multi update by upsert.
          // We can't actually update multiple documents since we have to do it by
          // id, but at least make sure the multi flag doesn't mess anything up.
          upsert(coll, useUpdate, {_id: 'Emily'},
                 {$set: {bar: 7},
                  $setOnInsert: {name: 'Fred', foo: 2}},
                 {multi: true}, next7);
        };

        var result7;
        var next7 = function (err, result) {
          result7 = result;
          test.equal(result7.numberAffected, 1);
          if (! useUpdate)
            test.isFalse(result7.insertedId);
          compareResults(test, useUpdate, coll.find().fetch(), [{_id: 'David', foo: 2},
                                                                {_id: 'Emily', foo: 2, bar: 7}]);

          // insert by multi upsert
          upsert(coll, useUpdate, {_id: 'Fred'},
                 {$set: {bar: 7},
                  $setOnInsert: {name: 'Fred', foo: 2}},
                 {multi: true}, next8);

        };

        var result8;
        var next8 = function (err, result) {
          result8 = result;

          test.equal(result8.numberAffected, 1);
          if (! useUpdate) {
            test.isTrue(result8.insertedId);
            test.equal(result8.insertedId, 'Fred');
          }
          var fredId = result8.insertedId;
          compareResults(test, useUpdate,  coll.find().fetch(),
                         [{_id: 'David', foo: 2},
                          {_id: 'Emily', foo: 2, bar: 7},
                          {name: 'Fred', foo: 2, bar: 7, _id: fredId}]);
          onComplete();
        };
      });
    });
  });
});

if (Meteor.isClient) {
  Tinytest.addAsync("mongo-livedata - async update/remove return values over network " + idGeneration, function (test, onComplete) {
    var coll;
    var run = test.runId();
    var collName = "livedata_upsert_collection_"+run;
    Meteor.call("createInsecureCollection", collName, collectionOptions);
    coll = new Mongo.Collection(collName, collectionOptions);
    Meteor.subscribe("c-" + collName, function () {
      coll.insert({ _id: "foo" });
      coll.insert({ _id: "bar" });
      coll.update({ _id: "foo" }, { $set: { foo: 1 } }, { multi: true }, function (err, result) {
        test.isFalse(err);
        test.equal(result, 1);
        coll.update({ _id: "foo" }, { _id: "foo", foo: 2 }, function (err, result) {
          test.isFalse(err);
          test.equal(result, 1);
          coll.update({ _id: "baz" }, { $set: { foo: 1 } }, function (err, result) {
            test.isFalse(err);
            test.equal(result, 0);
            coll.remove({ _id: "foo" }, function (err, result) {
              test.equal(result, 1);
              coll.remove({ _id: "baz" }, function (err, result) {
                test.equal(result, 0);
                onComplete();
              });
            });
          });
        });
      });
    });
  });
}

// Runs a method and its stub which do some upserts. The method throws an error
// if we don't get the right return values.
if (Meteor.isClient) {
  _.each([true, false], function (useUpdate) {
    Tinytest.addAsync("mongo-livedata - " + (useUpdate ? "update " : "") + "upsert in method, " + idGeneration, function (test, onComplete) {
      var run = test.runId();
      upsertTestMethodColl = new Mongo.Collection(upsertTestMethod + "_collection_" + run, collectionOptions);
      var m = {};
      delete Meteor.connection._methodHandlers[upsertTestMethod];
      m[upsertTestMethod] = function (run, useUpdate, options) {
        upsertTestMethodImpl(upsertTestMethodColl, useUpdate, test);
      };
      Meteor.methods(m);
      Meteor.call(upsertTestMethod, run, useUpdate, collectionOptions, function (err, result) {
        test.isFalse(err);
        onComplete();
      });
    });
  });
}

_.each(Meteor.isServer ? [true, false] : [true], function (minimongo) {
  _.each([true, false], function (useUpdate) {
    Tinytest.add("mongo-livedata - " + (useUpdate ? "update " : "") + "upsert by id" + (minimongo ? " minimongo" : "") + ", " + idGeneration, function (test) {
      var run = test.runId();
      var options = collectionOptions;
      if (minimongo)
        options = _.extend({}, collectionOptions, { connection: null });
      var coll = new Mongo.Collection("livedata_upsert_by_id_collection_"+run, options);

      var ret;
      ret = upsert(coll, useUpdate, {_id: 'foo'}, {$set: {x: 1}});
      test.equal(ret.numberAffected, 1);
      if (! useUpdate)
        test.equal(ret.insertedId, 'foo');
      compareResults(test, useUpdate, coll.find().fetch(),
                     [{_id: 'foo', x: 1}]);

      ret = upsert(coll, useUpdate, {_id: 'foo'}, {$set: {x: 2}});
      test.equal(ret.numberAffected, 1);
      if (! useUpdate)
        test.isFalse(ret.insertedId);
      compareResults(test, useUpdate, coll.find().fetch(),
                     [{_id: 'foo', x: 2}]);

      ret = upsert(coll, useUpdate, {_id: 'bar'}, {$set: {x: 1}});
      test.equal(ret.numberAffected, 1);
      if (! useUpdate)
        test.equal(ret.insertedId, 'bar');
      compareResults(test, useUpdate, coll.find().fetch(),
                     [{_id: 'foo', x: 2},
                      {_id: 'bar', x: 1}]);

      coll.remove({});
      ret = upsert(coll, useUpdate, {_id: 'traq'}, {x: 1});

      test.equal(ret.numberAffected, 1);
      var myId = ret.insertedId;
      if (useUpdate) {
        myId = coll.findOne()._id;
      }
      // Starting with Mongo 2.6, upsert with entire document takes _id from the
      // query, so the above upsert actually does an insert with _id traq
      // instead of a random _id.  Whenever we are using our simulated upsert,
      // we have this behavior (whether running against Mongo 2.4 or 2.6).
      // https://jira.mongodb.org/browse/SERVER-5289
      test.equal(myId, 'traq');
      compareResults(test, useUpdate, coll.find().fetch(),
                     [{x: 1, _id: 'traq'}]);

      // this time, insert as _id 'traz'
      ret = upsert(coll, useUpdate, {_id: 'traz'}, {_id: 'traz', x: 2});
      test.equal(ret.numberAffected, 1);
      if (! useUpdate)
        test.equal(ret.insertedId, 'traz');
      compareResults(test, useUpdate, coll.find().fetch(),
                     [{x: 1, _id: 'traq'},
                      {x: 2, _id: 'traz'}]);

      // now update _id 'traz'
      ret = upsert(coll, useUpdate, {_id: 'traz'}, {x: 3});
      test.equal(ret.numberAffected, 1);
      test.isFalse(ret.insertedId);
      compareResults(test, useUpdate, coll.find().fetch(),
                     [{x: 1, _id: 'traq'},
                      {x: 3, _id: 'traz'}]);

      // now update, passing _id (which is ok as long as it's the same)
      ret = upsert(coll, useUpdate, {_id: 'traz'}, {_id: 'traz', x: 4});
      test.equal(ret.numberAffected, 1);
      test.isFalse(ret.insertedId);
      compareResults(test, useUpdate, coll.find().fetch(),
                     [{x: 1, _id: 'traq'},
                      {x: 4, _id: 'traz'}]);

    });
  });
});

});  // end idGeneration parametrization

Tinytest.add('mongo-livedata - rewrite selector', function (test) {
 
  test.equal(Mongo.Collection._rewriteSelector('foo'),
             {_id: 'foo'});


  var oid = new Mongo.ObjectID();
  test.equal(Mongo.Collection._rewriteSelector(oid),
             {_id: oid});

  test.matches(
    Mongo.Collection._rewriteSelector({ _id: null })._id,
    /^\S+$/,
    'Passing in a falsey selector _id should return a selector with a new '
    + 'auto-generated _id string'
  );
  test.equal(
    Mongo.Collection._rewriteSelector({ _id: null }, { fallbackId: oid }),
    { _id: oid },
    'Passing in a falsey selector _id and a fallback ID should return a '
    + 'selector with an _id using the fallback ID'
  );
});

testAsyncMulti('mongo-livedata - specified _id', [
  function (test, expect) {
    this.collectionName = Random.id();
    if (Meteor.isClient) {
      Meteor.call('createInsecureCollection', this.collectionName);
      Meteor.subscribe('c-' + this.collectionName, expect());
    }
  }, function (test, expect) {
    var expectError = expect(function (err, result) {
      test.isTrue(err);
      var doc = coll.findOne();
      test.equal(doc.name, "foo");
    });
    var coll = new Mongo.Collection(this.collectionName);
    coll.insert({_id: "foo", name: "foo"}, expect(function (err1, id) {
      test.equal(id, "foo");
      var doc = coll.findOne();
      test.equal(doc._id, "foo");
      Meteor._suppress_log(1);
      coll.insert({_id: "foo", name: "bar"}, expectError);
    }));
  }
]);


// Consistent id generation tests
function collectionInsert (test, expect, coll, index) {
  var clientSideId = coll.insert({name: "foo"}, expect(function (err1, id) {
    test.equal(id, clientSideId);
    var o = coll.findOne(id);
    test.isTrue(_.isObject(o));
    test.equal(o.name, 'foo');
  }));
}

function collectionUpsert (test, expect, coll, index) {
  var upsertId = '123456' + index;

  coll.upsert(upsertId, {$set: {name: "foo"}}, expect(function (err1, result) {
    test.equal(result.insertedId, upsertId);
    test.equal(result.numberAffected, 1);

    var o = coll.findOne(upsertId);
    test.isTrue(_.isObject(o));
    test.equal(o.name, 'foo');
  }));
}

function collectionUpsertExisting (test, expect, coll, index) {
  var clientSideId = coll.insert({name: "foo"}, expect(function (err1, id) {
    test.equal(id, clientSideId);

    var o = coll.findOne(id);
    test.isTrue(_.isObject(o));
    // We're not testing sequencing/visibility rules here, so skip this check
    // test.equal(o.name, 'foo');
  }));

  coll.upsert(clientSideId, {$set: {name: "bar"}}, expect(function (err1, result) {
    test.equal(result.insertedId, clientSideId);
    test.equal(result.numberAffected, 1);

    var o = coll.findOne(clientSideId);
    test.isTrue(_.isObject(o));
    test.equal(o.name, 'bar');
  }));
}

function functionCallsInsert (test, expect, coll, index) {
  Meteor.call("insertObjects", coll._name, {name: "foo"}, 1, expect(function (err1, ids) {
    test.notEqual((INSERTED_IDS[coll._name] || []).length, 0);
    var stubId = INSERTED_IDS[coll._name][index];

    test.equal(ids.length, 1);
    test.equal(ids[0], stubId);

    var o = coll.findOne(stubId);
    test.isTrue(_.isObject(o));
    test.equal(o.name, 'foo');
  }));
}

function functionCallsUpsert (test, expect, coll, index) {
  var upsertId = '123456' + index;
  Meteor.call("upsertObject", coll._name, upsertId, {$set:{name: "foo"}}, expect(function (err1, result) {
    test.equal(result.insertedId, upsertId);
    test.equal(result.numberAffected, 1);

    var o = coll.findOne(upsertId);
    test.isTrue(_.isObject(o));
    test.equal(o.name, 'foo');
  }));
}

function functionCallsUpsertExisting (test, expect, coll, index) {
  var id = coll.insert({name: "foo"});

  var o = coll.findOne(id);
  test.notEqual(null, o);
  test.equal(o.name, 'foo');

  Meteor.call("upsertObject", coll._name, id, {$set:{name: "bar"}}, expect(function (err1, result) {
    test.equal(result.numberAffected, 1);
    test.equal(result.insertedId, undefined);

    var o = coll.findOne(id);
    test.isTrue(_.isObject(o));
    test.equal(o.name, 'bar');
  }));
}

function functionCalls3Inserts (test, expect, coll, index) {
  Meteor.call("insertObjects", coll._name, {name: "foo"}, 3, expect(function (err1, ids) {
    test.notEqual((INSERTED_IDS[coll._name] || []).length, 0);
    test.equal(ids.length, 3);

    for (var i = 0; i < 3; i++) {
      var stubId = INSERTED_IDS[coll._name][(3 * index) + i];
      test.equal(ids[i], stubId);

      var o = coll.findOne(stubId);
      test.isTrue(_.isObject(o));
      test.equal(o.name, 'foo');
    }
  }));
}

function functionChainInsert (test, expect, coll, index) {
  Meteor.call("doMeteorCall", "insertObjects", coll._name, {name: "foo"}, 1, expect(function (err1, ids) {
    test.notEqual((INSERTED_IDS[coll._name] || []).length, 0);
    var stubId = INSERTED_IDS[coll._name][index];

    test.equal(ids.length, 1);
    test.equal(ids[0], stubId);

    var o = coll.findOne(stubId);
    test.isTrue(_.isObject(o));
    test.equal(o.name, 'foo');
  }));
}

function functionChain2Insert (test, expect, coll, index) {
  Meteor.call("doMeteorCall", "doMeteorCall", "insertObjects", coll._name, {name: "foo"}, 1, expect(function (err1, ids) {
    test.notEqual((INSERTED_IDS[coll._name] || []).length, 0);
    var stubId = INSERTED_IDS[coll._name][index];

    test.equal(ids.length, 1);
    test.equal(ids[0], stubId);

    var o = coll.findOne(stubId);
    test.isTrue(_.isObject(o));
    test.equal(o.name, 'foo');
  }));
}

function functionChain2Upsert (test, expect, coll, index) {
  var upsertId = '123456' + index;
  Meteor.call("doMeteorCall", "doMeteorCall", "upsertObject", coll._name, upsertId, {$set:{name: "foo"}}, expect(function (err1, result) {
    test.equal(result.insertedId, upsertId);
    test.equal(result.numberAffected, 1);

    var o = coll.findOne(upsertId);
    test.isTrue(_.isObject(o));
    test.equal(o.name, 'foo');
  }));
}

_.each( {collectionInsert: collectionInsert,
         collectionUpsert: collectionUpsert,
         functionCallsInsert: functionCallsInsert,
         functionCallsUpsert: functionCallsUpsert,
         functionCallsUpsertExisting: functionCallsUpsertExisting,
         functionCalls3Insert: functionCalls3Inserts,
         functionChainInsert: functionChainInsert,
         functionChain2Insert: functionChain2Insert,
         functionChain2Upsert: functionChain2Upsert}, function (fn, name) {
_.each( [1, 3], function (repetitions) {
_.each( [1, 3], function (collectionCount) {
_.each( ['STRING', 'MONGO'], function (idGeneration) {

  testAsyncMulti('mongo-livedata - consistent _id generation ' + name + ', ' + repetitions + ' repetitions on ' + collectionCount + ' collections, idGeneration=' + idGeneration, [ function (test, expect) {
    var collectionOptions = { idGeneration: idGeneration };

    var cleanups = this.cleanups = [];
    this.collections = _.times(collectionCount, function () {
      var collectionName = "consistentid_" + Random.id();
      if (Meteor.isClient) {
        Meteor.call('createInsecureCollection', collectionName, collectionOptions);
        Meteor.subscribe('c-' + collectionName, expect());
        cleanups.push(function (expect) { Meteor.call('dropInsecureCollection', collectionName, expect(function () {})); });
      }

      var collection = new Mongo.Collection(collectionName, collectionOptions);
      if (Meteor.isServer) {
        cleanups.push(function () { collection._dropCollection(); });
      }
      COLLECTIONS[collectionName] = collection;
      return collection;
    });
  }, function (test, expect) {
    // now run the actual test
    for (var i = 0; i < repetitions; i++) {
      for (var j = 0; j < collectionCount; j++) {
        fn(test, expect, this.collections[j], i);
      }
    }
  }, function (test, expect) {
    // Run any registered cleanup functions (e.g. to drop collections)
    _.each(this.cleanups, function(cleanup) {
      cleanup(expect);
    });
  }]);

});
});
});
});



testAsyncMulti('mongo-livedata - empty string _id', [
  function (test, expect) {
    var self = this;
    self.collectionName = Random.id();
    if (Meteor.isClient) {
      Meteor.call('createInsecureCollection', self.collectionName);
      Meteor.subscribe('c-' + self.collectionName, expect());
    }
    self.coll = new Mongo.Collection(self.collectionName);
    try {
      self.coll.insert({_id: "", f: "foo"});
      test.fail("Insert with an empty _id should fail");
    } catch (e) {
      // ok
    }
    self.coll.insert({_id: "realid", f: "bar"}, expect(function (err, res) {
      test.equal(res, "realid");
    }));
  },
  function (test, expect) {
    var self = this;
    var docs = self.coll.find().fetch();
    test.equal(docs, [{_id: "realid", f: "bar"}]);
  },
  function (test, expect) {
    var self = this;
    if (Meteor.isServer) {
      self.coll._collection.insert({_id: "", f: "baz"});
      test.equal(self.coll.find().fetch().length, 2);
    }
  }
]);


if (Meteor.isServer) {

  testAsyncMulti("mongo-livedata - minimongo on server to server connection", [
    function (test, expect) {
      var self = this;
      Meteor._debug("connection setup");
      self.id = Random.id();
      var C = self.C = new Mongo.Collection("ServerMinimongo_" + self.id);
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

      self.conn = DDP.connect(Meteor.absoluteUrl());
      pollUntil(expect, function () {
        return self.conn.status().connected;
      }, 10000);
    },

    function (test, expect) {
      var self = this;
      if (self.conn.status().connected) {
        self.miniC = new Mongo.Collection("ServerMinimongo_" + self.id, {
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
      self.C = new Mongo.Collection("ServerMinimongoObserve_" + self.id);
      self.events = [];

      Meteor.publish(self.id, function () {
        return self.C.find();
      });

      self.conn = DDP.connect(Meteor.absoluteUrl());
      pollUntil(expect, function () {
        return self.conn.status().connected;
      }, 10000);
    },

    function (test, expect) {
      var self = this;
      if (self.conn.status().connected) {
        self.miniC = new Mongo.Collection("ServerMinimongoObserve_" + self.id, {
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
            if (! self.two) {
              self.two = self.C.insert({});
            }
          }
        });
        self.one = self.C.insert({});
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

Tinytest.addAsync("mongo-livedata - local collections with different connections", function (test, onComplete) {
  var cname = Random.id();
  var cname2 = Random.id();
  var coll1 = new Mongo.Collection(cname);
  var doc = { foo: "bar" };
  var coll2 = new Mongo.Collection(cname2, { connection: null });
  coll2.insert(doc, function (err, id) {
    test.equal(coll1.find(doc).count(), 0);
    test.equal(coll2.find(doc).count(), 1);
    onComplete();
  });
});

Tinytest.addAsync("mongo-livedata - local collection with null connection, w/ callback", function (test, onComplete) {
  var cname = Random.id();
  var coll1 = new Mongo.Collection(cname, { connection: null });
  var doc = { foo: "bar" };
  var docId = coll1.insert(doc, function (err, id) {
    test.equal(docId, id);
    test.equal(coll1.findOne(doc)._id, id);
    onComplete();
  });
});

Tinytest.addAsync("mongo-livedata - local collection with null connection, w/o callback", function (test, onComplete) {
  var cname = Random.id();
  var coll1 = new Mongo.Collection(cname, { connection: null });
  var doc = { foo: "bar" };
  var docId = coll1.insert(doc);
  test.equal(coll1.findOne(doc)._id, docId);
  onComplete();
});

testAsyncMulti("mongo-livedata - update handles $push with $each correctly", [
  function (test, expect) {
    var self = this;
    var collectionName = Random.id();
    if (Meteor.isClient) {
      Meteor.call('createInsecureCollection', collectionName);
      Meteor.subscribe('c-' + collectionName, expect());
    }

    self.collection = new Mongo.Collection(collectionName);

    self.id = self.collection.insert(
      {name: 'jens', elements: ['X', 'Y']}, expect(function (err, res) {
        test.isFalse(err);
        test.equal(self.id, res);
        }));
  },
  function (test, expect) {
    var self = this;
    self.collection.update(self.id, {
      $push: {
        elements: {
          $each: ['A', 'B', 'C'],
          $slice: -4
        }}}, expect(function (err, res) {
          test.isFalse(err);
          test.equal(
            self.collection.findOne(self.id),
            {_id: self.id, name: 'jens', elements: ['Y', 'A', 'B', 'C']});
        }));
  }
]);

if (Meteor.isServer) {
  Tinytest.add("mongo-livedata - upsert handles $push with $each correctly", function (test) {
    var collection = new Mongo.Collection(Random.id());

    var result = collection.upsert(
      {name: 'jens'},
      {$push: {
        elements: {
          $each: ['A', 'B', 'C'],
          $slice: -4
        }}});

    test.equal(collection.findOne(result.insertedId),
               {_id: result.insertedId,
                name: 'jens',
                elements: ['A', 'B', 'C']});

    var id = collection.insert({name: "david", elements: ['X', 'Y']});
    result = collection.upsert(
      {name: 'david'},
      {$push: {
        elements: {
          $each: ['A', 'B', 'C'],
          $slice: -4
        }}});

    test.equal(collection.findOne(id),
               {_id: id,
                name: 'david',
                elements: ['Y', 'A', 'B', 'C']});
  });

  Tinytest.add("mongo-livedata - upsert handles dotted selectors corrrectly", function (test) {
    var collection = new Mongo.Collection(Random.id());

    var result1 = collection.upsert({
      "subdocument.a": 1
    }, {
      $set: {message: "upsert 1"}
    });

    test.equal(collection.findOne(result1.insertedId),{
      _id: result1.insertedId,
      subdocument: {a: 1},
      message: "upsert 1"
    });

    var result2 = collection.upsert({
      "subdocument.a": 1
    }, {
      $set: {message: "upsert 2"}
    });

    test.equal(result2, {numberAffected: 1});

    test.equal(collection.findOne(result1.insertedId),{
      _id: result1.insertedId,
      subdocument: {a: 1},
      message: "upsert 2"
    });

    var result3 = collection.upsert({
      "subdocument.a.b": 1,
      "subdocument.c": 2
    }, {
      $set: {message: "upsert3"}
    });

    test.equal(collection.findOne(result3.insertedId),{
      _id: result3.insertedId,
      subdocument: {a: {b: 1}, c: 2},
      message: "upsert3"
    });

    var result4 = collection.upsert({
      "subdocument.a": 4
    }, {
      $set: {"subdocument.a": "upsert 4"}
    });

    test.equal(collection.findOne(result4.insertedId), {
      _id: result4.insertedId,
      subdocument: {a: "upsert 4"}
    });

    var result5 = collection.upsert({
      "subdocument.a": "upsert 4"
    }, {
      $set: {"subdocument.a": "upsert 5"}
    });

    test.equal(result5, {numberAffected: 1});

    test.equal(collection.findOne(result4.insertedId), {
      _id: result4.insertedId,
      subdocument: {a: "upsert 5"}
    });

    var result6 = collection.upsert({
      "subdocument.a": "upsert 5"
    }, {
      $set: {"subdocument": "upsert 6"}
    });

    test.equal(result6, {numberAffected: 1});

    test.equal(collection.findOne(result4.insertedId), {
      _id: result4.insertedId,
      subdocument: "upsert 6"
    });

    var result7 = collection.upsert({
      "subdocument.a.b": 7
    }, {
      $set: {
        "subdocument.a.c": "upsert7"
      }
    });

    test.equal(collection.findOne(result7.insertedId), {
      _id: result7.insertedId,
      subdocument: {
        a: {b: 7, c: "upsert7"}
      }
    });

    var result8 = collection.upsert({
      "subdocument.a.b": 7
    }, {
      $set: {
        "subdocument.a.c": "upsert8"
      }
    });

    test.equal(result8, {numberAffected: 1});

    test.equal(collection.findOne(result7.insertedId), {
      _id: result7.insertedId,
      subdocument: {
        a: {b: 7, c: "upsert8"}
      }
    });

    var result9 = collection.upsert({
      "subdocument.a.b": 7
    }, {
      $set: {
        "subdocument.a.b": "upsert9"
      }
    });

    test.equal(result9, {numberAffected: 1});

    test.equal(collection.findOne(result7.insertedId), {
      _id: result7.insertedId,
      subdocument: {
        a: {b: "upsert9", c: "upsert8"}
      }
    });

  });
}

// This is a VERY white-box test.
Meteor.isServer && Tinytest.add("mongo-livedata - oplog - _disableOplog", function (test) {
  var collName = Random.id();
  var coll = new Mongo.Collection(collName);
  if (MongoInternals.defaultRemoteCollectionDriver().mongo._oplogHandle) {
    var observeWithOplog = coll.find({x: 5})
          .observeChanges({added: function () {}});
    test.isTrue(observeWithOplog._multiplexer._observeDriver._usesOplog);
    observeWithOplog.stop();
  }
  var observeWithoutOplog = coll.find({x: 6}, {_disableOplog: true})
        .observeChanges({added: function () {}});
  test.isFalse(observeWithoutOplog._multiplexer._observeDriver._usesOplog);
  observeWithoutOplog.stop();
});

Meteor.isServer && Tinytest.add("mongo-livedata - oplog - include selector fields", function (test) {
  var collName = "includeSelector" + Random.id();
  var coll = new Mongo.Collection(collName);

  var docId = coll.insert({a: 1, b: [3, 2], c: 'foo'});
  test.isTrue(docId);

  // Wait until we've processed the insert oplog entry. (If the insert shows up
  // during the observeChanges, the bug in question is not consistently
  // reproduced.) We don't have to do this for polling observe (eg
  // --disable-oplog).
  waitUntilOplogCaughtUp();

  var output = [];
  var handle = coll.find({a: 1, b: 2}, {fields: {c: 1}}).observeChanges({
    added: function (id, fields) {
      output.push(['added', id, fields]);
    },
    changed: function (id, fields) {
      output.push(['changed', id, fields]);
    },
    removed: function (id) {
      output.push(['removed', id]);
    }
  });
  // Initially should match the document.
  test.length(output, 1);
  test.equal(output.shift(), ['added', docId, {c: 'foo'}]);

  // Update in such a way that, if we only knew about the published field 'c'
  // and the changed field 'b' (but not the field 'a'), we would think it didn't
  // match any more.  (This is a regression test for a bug that existed because
  // we used to not use the shared projection in the initial query.)
  runInFence(function () {
    coll.update(docId, {$set: {'b.0': 2, c: 'bar'}});
  });
  test.length(output, 1);
  test.equal(output.shift(), ['changed', docId, {c: 'bar'}]);

  handle.stop();
});

Meteor.isServer && Tinytest.add("mongo-livedata - oplog - transform", function (test) {
  var collName = "oplogTransform" + Random.id();
  var coll = new Mongo.Collection(collName);

  var docId = coll.insert({a: 25, x: {x: 5, y: 9}});
  test.isTrue(docId);

  // Wait until we've processed the insert oplog entry. (If the insert shows up
  // during the observeChanges, the bug in question is not consistently
  // reproduced.) We don't have to do this for polling observe (eg
  // --disable-oplog).
  waitUntilOplogCaughtUp();

  var cursor = coll.find({}, {transform: function (doc) {
    return doc.x;
  }});

  var changesOutput = [];
  var changesHandle = cursor.observeChanges({
    added: function (id, fields) {
      changesOutput.push(['added', fields]);
    }
  });
  // We should get untransformed fields via observeChanges.
  test.length(changesOutput, 1);
  test.equal(changesOutput.shift(), ['added', {a: 25, x: {x: 5, y: 9}}]);
  changesHandle.stop();

  var transformedOutput = [];
  var transformedHandle = cursor.observe({
    added: function (doc) {
      transformedOutput.push(['added', doc]);
    }
  });
  test.length(transformedOutput, 1);
  test.equal(transformedOutput.shift(), ['added', {x: 5, y: 9}]);
  transformedHandle.stop();
});


Meteor.isServer && Tinytest.add("mongo-livedata - oplog - drop collection/db", function (test) {
  // This test uses a random database, so it can be dropped without affecting
  // anything else.
  var mongodbUri = Npm.require('mongodb-uri');
  var parsedUri = mongodbUri.parse(process.env.MONGO_URL);
  parsedUri.database = 'dropDB' + Random.id();
  var driver = new MongoInternals.RemoteCollectionDriver(
    mongodbUri.format(parsedUri), {
      oplogUrl: process.env.MONGO_OPLOG_URL
    }
  );

  var collName = "dropCollection" + Random.id();
  var coll = new Mongo.Collection(collName, { _driver: driver });

  var doc1Id = coll.insert({a: 'foo', c: 1});
  var doc2Id = coll.insert({b: 'bar'});
  var doc3Id = coll.insert({a: 'foo', c: 2});
  var tmp;

  var output = [];
  var handle = coll.find({a: 'foo'}).observeChanges({
    added: function (id, fields) {
      output.push(['added', id, fields]);
    },
    changed: function (id) {
      output.push(['changed']);
    },
    removed: function (id) {
      output.push(['removed', id]);
    }
  });
  test.length(output, 2);
  // make order consistent
  if (output.length === 2 && output[0][1] === doc3Id) {
    tmp = output[0];
    output[0] = output[1];
    output[1] = tmp;
  }
  test.equal(output.shift(), ['added', doc1Id, {a: 'foo', c: 1}]);
  test.equal(output.shift(), ['added', doc3Id, {a: 'foo', c: 2}]);

  // Wait until we've processed the insert oplog entry, so that we are in a
  // steady state (and we don't see the dropped docs because we are FETCHING).
  waitUntilOplogCaughtUp();

  // Drop the collection. Should remove all docs.
  runInFence(function () {
    coll._dropCollection();
  });

  test.length(output, 2);
  // make order consistent
  if (output.length === 2 && output[0][1] === doc3Id) {
    tmp = output[0];
    output[0] = output[1];
    output[1] = tmp;
  }
  test.equal(output.shift(), ['removed', doc1Id]);
  test.equal(output.shift(), ['removed', doc3Id]);

  // Put something back in.
  var doc4Id;
  runInFence(function () {
    doc4Id = coll.insert({a: 'foo', c: 3});
  });

  test.length(output, 1);
  test.equal(output.shift(), ['added', doc4Id, {a: 'foo', c: 3}]);

  // XXX: this was intermittently failing for unknown reasons.
  // Now drop the database. Should remove all docs again.
  // runInFence(function () {
  //   driver.mongo.dropDatabase();
  // });
  //
  // test.length(output, 1);
  // test.equal(output.shift(), ['removed', doc4Id]);

  handle.stop();
  driver.mongo.close();
});

var TestCustomType = function (head, tail) {
  // use different field names on the object than in JSON, to ensure we are
  // actually treating this as an opaque object.
  this.myHead = head;
  this.myTail = tail;
};
_.extend(TestCustomType.prototype, {
  clone: function () {
    return new TestCustomType(this.myHead, this.myTail);
  },
  equals: function (other) {
    return other instanceof TestCustomType
      && EJSON.equals(this.myHead, other.myHead)
      && EJSON.equals(this.myTail, other.myTail);
  },
  typeName: function () {
    return 'someCustomType';
  },
  toJSONValue: function () {
    return {head: this.myHead, tail: this.myTail};
  }
});

EJSON.addType('someCustomType', function (json) {
  return new TestCustomType(json.head, json.tail);
});

testAsyncMulti("mongo-livedata - oplog - update EJSON", [
  function (test, expect) {
    var self = this;
    var collectionName = "ejson" + Random.id();
    if (Meteor.isClient) {
      Meteor.call('createInsecureCollection', collectionName);
      Meteor.subscribe('c-' + collectionName, expect());
    }

    self.collection = new Mongo.Collection(collectionName);
    self.date = new Date;
    self.objId = new Mongo.ObjectID;

    self.id = self.collection.insert(
      {d: self.date, oi: self.objId,
       custom: new TestCustomType('a', 'b')},
      expect(function (err, res) {
        test.isFalse(err);
        test.equal(self.id, res);
      }));
  },
  function (test, expect) {
    var self = this;
    self.changes = [];
    self.handle = self.collection.find({}).observeChanges({
      added: function (id, fields) {
        self.changes.push(['a', id, fields]);
      },
      changed: function (id, fields) {
        self.changes.push(['c', id, fields]);
      },
      removed: function (id) {
        self.changes.push(['r', id]);
      }
    });
    test.length(self.changes, 1);
    test.equal(self.changes.shift(),
               ['a', self.id,
                {d: self.date, oi: self.objId,
                 custom: new TestCustomType('a', 'b')}]);

    // First, replace the entire custom object.
    // (runInFence is useful for the server, using expect() is useful for the
    // client)
    runInFence(function () {
      self.collection.update(
        self.id, {$set: {custom: new TestCustomType('a', 'c')}},
        expect(function (err) {
          test.isFalse(err);
        }));
    });
  },
  function (test, expect) {
    var self = this;
    test.length(self.changes, 1);
    test.equal(self.changes.shift(),
               ['c', self.id, {custom: new TestCustomType('a', 'c')}]);

    // Now, sneakily replace just a piece of it. Meteor won't do this, but
    // perhaps you are accessing Mongo directly.
    runInFence(function () {
      self.collection.update(
        self.id, {$set: {'custom.EJSON$value.EJSONtail': 'd'}},
      expect(function (err) {
        test.isFalse(err);
      }));
    });
  },
  function (test, expect) {
    var self = this;
    test.length(self.changes, 1);
    test.equal(self.changes.shift(),
               ['c', self.id, {custom: new TestCustomType('a', 'd')}]);

    // Update a date and an ObjectID too.
    self.date2 = new Date(self.date.valueOf() + 1000);
    self.objId2 = new Mongo.ObjectID;
    runInFence(function () {
      self.collection.update(
        self.id, {$set: {d: self.date2, oi: self.objId2}},
      expect(function (err) {
        test.isFalse(err);
      }));
    });
  },
  function (test, expect) {
    var self = this;
    test.length(self.changes, 1);
    test.equal(self.changes.shift(),
               ['c', self.id, {d: self.date2, oi: self.objId2}]);

    self.handle.stop();
  }
]);


var waitUntilOplogCaughtUp = function () {
  var oplogHandle =
        MongoInternals.defaultRemoteCollectionDriver().mongo._oplogHandle;
  if (oplogHandle)
    oplogHandle.waitUntilCaughtUp();
};


Meteor.isServer && Tinytest.add("mongo-livedata - cursor dedup stop", function (test) {
  var coll = new Mongo.Collection(Random.id());
  _.times(100, function () {
    coll.insert({foo: 'baz'});
  });
  var handler = coll.find({}).observeChanges({
    added: function (id) {
      coll.update(id, {$set: {foo: 'bar'}});
    }
  });
  handler.stop();
  // Previously, this would print
  //    Exception in queued task: TypeError: Object.keys called on non-object
  // Unfortunately, this test didn't fail before the bugfix, but it at least
  // would print the error and no longer does.
  // See https://github.com/meteor/meteor/issues/2070
});

testAsyncMulti("mongo-livedata - undefined find options", [
  function (test, expect) {
    var self = this;
    self.collName = Random.id();
    if (Meteor.isClient) {
      Meteor.call("createInsecureCollection", self.collName);
      Meteor.subscribe("c-" + self.collName, expect());
    }
  },
  function (test, expect) {
    var self = this;
    self.coll = new Mongo.Collection(self.collName);
    self.doc = { foo: 1, bar: 2, _id: "foobar" };
    self.coll.insert(self.doc, expect(function (err, id) {
      test.isFalse(err);
    }));
  },
  function (test, expect) {
    var self = this;
    var result = self.coll.findOne({ foo: 1 }, {
      fields: undefined,
      sort: undefined,
      limit: undefined,
      skip: undefined
    });
    test.equal(result, self.doc);
  }
]);

// Regression test for #2274.
Meteor.isServer && testAsyncMulti("mongo-livedata - observe limit bug", [
  function (test, expect) {
    var self = this;
    self.coll = new Mongo.Collection(Random.id());
    var state = {};
    var callbacks = {
      changed: function (newDoc) {
        state[newDoc._id] = newDoc;
      },
      added: function (newDoc) {
        state[newDoc._id] = newDoc;
      },
      removed: function (oldDoc) {
        delete state[oldDoc._id];
      }
    };
    self.observe = self.coll.find(
      {}, {limit: 1, sort: {sortField: -1}}).observe(callbacks);

    // Insert some documents.
    runInFence(function () {
      self.id0 = self.coll.insert({sortField: 0, toDelete: true});
      self.id1 = self.coll.insert({sortField: 1, toDelete: true});
      self.id2 = self.coll.insert({sortField: 2, toDelete: true});
    });
    test.equal(_.keys(state), [self.id2]);

    // Mutate the one in the unpublished buffer and the one below the
    // buffer. Before the fix for #2274, this left the observe state machine in
    // a broken state where the buffer was empty but it wasn't try to re-fill
    // it.
    runInFence(function () {
      self.coll.update({_id: {$ne: self.id2}},
                       {$set: {toDelete: false}},
                       {multi: 1});
    });
    test.equal(_.keys(state), [self.id2]);

    // Now remove the one published document. This should slide up id1 from the
    // buffer, but this didn't work before the #2274 fix.
    runInFence(function () {
      self.coll.remove({toDelete: true});
    });
    test.equal(_.keys(state), [self.id1]);
  }
]);

Meteor.isServer && testAsyncMulti("mongo-livedata - update with replace forbidden", [
  function (test, expect) {
    var c = new Mongo.Collection(Random.id());

    var id = c.insert({ foo: "bar" });

    c.update(id, { foo2: "bar2" });
    test.equal(c.findOne(id), { _id: id, foo2: "bar2" });

    test.throws(function () {
      c.update(id, { foo3: "bar3" }, { _forbidReplace: true });
    }, "Replacements are forbidden");
    test.equal(c.findOne(id), { _id: id, foo2: "bar2" });

    test.throws(function () {
      c.update(id, { foo3: "bar3", $set: { blah: 1 } });
    }, "cannot have both modifier and non-modifier fields");
    test.equal(c.findOne(id), { _id: id, foo2: "bar2" });
  }
]);

Meteor.isServer && Tinytest.add(
  "mongo-livedata - connection failure throws",
  function (test) {
    test.throws(function () {
      new MongoInternals.Connection('mongodb://this-does-not-exist.test/asdf');
    });
  }
);

Meteor.isServer && Tinytest.add("mongo-livedata - npm modules", function (test) {
  // Make sure the version number looks like a version number.
  test.matches(MongoInternals.NpmModules.mongodb.version, /^2\.(\d+)\.(\d+)/);
  test.equal(typeof(MongoInternals.NpmModules.mongodb.module), 'function');
  test.equal(typeof(MongoInternals.NpmModules.mongodb.module.connect),
             'function');
  test.equal(typeof(MongoInternals.NpmModules.mongodb.module.ObjectID),
             'function');

  var c = new Mongo.Collection(Random.id());
  var rawCollection = c.rawCollection();
  test.isTrue(rawCollection);
  test.isTrue(rawCollection.findAndModify);
  var rawDb = c.rawDatabase();
  test.isTrue(rawDb);
  test.isTrue(rawDb.admin);
});

if (Meteor.isServer) {
  Tinytest.add("mongo-livedata - update/remove don't accept an array as a selector #4804", function (test) {
    var collection = new Mongo.Collection(Random.id());

    _.times(10, function () {
      collection.insert({ data: "Hello" });
    });

    test.equal(collection.find().count(), 10);

    // Test several array-related selectors
    _.each([[], [1, 2, 3], [{}]], function (selector) {
      test.throws(function () {
        collection.remove(selector);
      });

      test.throws(function () {
        collection.update(selector, {$set: 5});
      });
    });

    test.equal(collection.find().count(), 10);
  });
}

// This is a regression test for https://github.com/meteor/meteor/issues/4839.
// Prior to fixing the issue (but after applying
// https://github.com/meteor/meteor/pull/4694), doing a Mongo write from a
// timeout that ran after a method body (invoked via the client) would throw an
// error "fence has already activated -- too late to add a callback" and not
// properly call the Mongo write's callback.  In this test:
//  - The client invokes a method (fenceOnBeforeFireError1) which
//    - Starts an observe on a query
//    - Creates a timeout (which shares a write fence with the method)
//    - Lets the method return (firing the write fence)
//  - The timeout runs and does a Mongo write. This write is inside a write
//    fence (because timeouts preserve the fence, see dcd26415) but the write
//    fence already fired.
//  - The Mongo write's callback confirms that there is no error. This was
//    not the case before fixing the bug!  (Note that the observe was necessary
//    for the error to occur, because the error was thrown from the observe's
//    crossbar listener callback).  It puts the confirmation into a Future.
//  - The client invokes another method which reads the confirmation from
//    the future. (Well, the invocation happened earlier but the use of the
//    Future sequences it so that the confirmation only gets read at this point.)
if (Meteor.isClient) {
  testAsyncMulti("mongo-livedata - fence onBeforeFire error", [
    function (test, expect) {
      var self = this;
      self.nonce = Random.id();
      Meteor.call('fenceOnBeforeFireError1', self.nonce, expect(function (err) {
        test.isFalse(err);
      }));
    },
    function (test, expect) {
      var self = this;
      Meteor.call('fenceOnBeforeFireError2', self.nonce, expect(
        function (err, success) {
          test.isFalse(err);
          test.isTrue(success);
        }
      ));
    }
  ]);
} else {
  var fenceOnBeforeFireErrorCollection = new Mongo.Collection("FOBFE");
  var Future = Npm.require('fibers/future');
  var futuresByNonce = {};
  Meteor.methods({
    fenceOnBeforeFireError1: function (nonce) {
      futuresByNonce[nonce] = new Future;
      var observe = fenceOnBeforeFireErrorCollection.find({nonce: nonce})
            .observeChanges({added: function (){}});
      Meteor.setTimeout(function () {
        fenceOnBeforeFireErrorCollection.insert(
          {nonce: nonce},
          function (err, result) {
            var success = !err && result;
            futuresByNonce[nonce].return(success);
            observe.stop();
          }
        );
      }, 10);
    },
    fenceOnBeforeFireError2: function (nonce) {
      try {
        return futuresByNonce[nonce].wait();
      } finally {
        delete futuresByNonce[nonce];
      }
    }
  });
}

if (Meteor.isServer) {
  Tinytest.add('mongo update/upsert - returns nMatched as numberAffected', function (test, onComplete) {
    var collName = Random.id();
    var coll = new Mongo.Collection('update_nmatched'+collName);

    coll.insert({animal: 'cat', legs: 4});
    coll.insert({animal: 'dog', legs: 4});
    coll.insert({animal: 'echidna', legs: 4});
    coll.insert({animal: 'platypus', legs: 4});
    coll.insert({animal: 'starfish', legs: 5});

    var affected = coll.update({legs: 4}, {$set: {category: 'quadruped'}});
    test.equal(affected, 1);

    //Changes only 3 but matched 4 documents
    affected = coll.update({legs: 4}, {$set: {category: 'quadruped'}}, {multi: true});
    test.equal(affected, 4);

    //Again, changes nothing but returns nModified
    affected = coll.update({legs: 4}, {$set: {category: 'quadruped'}}, {multi: true});
    test.equal(affected, 4);

    //upsert:true changes nothing, 4 modified
    affected = coll.update({legs: 4}, {$set: {category: 'quadruped'}}, {multi: true, upsert:true});
    test.equal(affected, 4);

    //upsert method works as upsert:true
    var result = coll.upsert({legs: 4}, {$set: {category: 'quadruped'}}, {multi: true});
    test.equal(result.numberAffected, 4);
  });

  Tinytest.addAsync('mongo livedata - update/upsert callback returns nMatched as numberAffected', function (test, onComplete) {
    var collName = Random.id();
    var coll = new Mongo.Collection('update_nmatched'+collName);

    coll.insert({animal: 'cat', legs: 4});
    coll.insert({animal: 'dog', legs: 4});
    coll.insert({animal: 'echidna', legs: 4});
    coll.insert({animal: 'platypus', legs: 4});
    coll.insert({animal: 'starfish', legs: 5});

    var test1 = function () {
      coll.update({legs: 4}, {$set: {category: 'quadruped'}}, function (err, result) {
        test.equal(result, 1);
        test2();
      });
    };

    var test2 = function () {
      //Changes only 3 but matched 4 documents
      coll.update({legs: 4}, {$set: {category: 'quadruped'}}, {multi: true}, function (err, result) {
        test.equal(result, 4);
        test3();
      });
    };

    var test3 = function () {
      //Again, changes nothing but returns nModified
      coll.update({legs: 4}, {$set: {category: 'quadruped'}}, {multi: true}, function (err, result) {
        test.equal(result, 4);
        test4();
      });
    };

    var test4 = function () {
      //upsert:true changes nothing, 4 modified
      coll.update({legs: 4}, {$set: {category: 'quadruped'}}, {multi: true, upsert:true}, function (err, result) {
        test.equal(result, 4);
        test5();
      });
    };

    var test5 = function () {
      //upsert method works as upsert:true
      coll.upsert({legs: 4}, {$set: {category: 'quadruped'}}, {multi: true}, function (err, result) {
        test.equal(result.numberAffected, 4);
        onComplete();
      });
    };

    test1();
  });
}
