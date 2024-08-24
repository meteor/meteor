import isEmpty from 'lodash.isempty';
import isObject from 'lodash.isobject';
import times from 'lodash.times';

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
    dropInsecureCollection: async function(name) {
      var c = COLLECTIONS[name];
      try {
        await c.dropCollectionAsync();
      } catch (e) {
      }
    }
  });
}

// We store the generated id, keyed by collection, for each insert
// This is so we can test the stub and the server generate the same id
var INSERTED_IDS = {};

Meteor.methods({
  insertObjects: async function(collectionName, doc, count) {
    var c = COLLECTIONS[collectionName];
    var ids = [];
    for (var i = 0; i < count; i++) {
      const id = await c.insertAsync(doc);
      INSERTED_IDS[collectionName] = (
        INSERTED_IDS[collectionName] || []
      ).concat([id]);
      ids.push(id);
    }
    return ids;
  },
  upsertObject: async function(collectionName, selector, modifier) {
    var c = COLLECTIONS[collectionName];
    return c.upsertAsync(selector, modifier);
  },
  doMeteorCall: async function(name /*, arguments */) {
    var args = Array.prototype.slice.call(arguments);

    const methodName = args.shift();

    return Meteor.applyAsync.call(null, methodName, args);
  },
});

const runInFence = async function (f) {
  if (Meteor.isClient) {
    await f();
  } else {
    const fence = new DDPServer._WriteFence;
    await DDPServer._CurrentWriteFence.withValue(fence, f);
    await fence.armAndWait();
  }
};

// Helpers for upsert tests

var stripId = function (obj) {
  delete obj._id;
};

var compareResults = function (test, skipIds, actual, expected) {
  if (skipIds) {
    actual.map(stripId);
    expected.map(stripId);
  }
  // (technically should ignore order in comparison)
  test.equal(actual, expected);
};

const upsert = async function(coll, useUpdate, query, mod, options, callback) {
  if (!callback && typeof options === 'function') {
    callback = options;
    options = {};
  }

  const callWithCallBack = async (f, justResult) => {
    if (!callback) {
      return f();
    }
    let result, error;
    try {
      const numberAffected = await f();
      result = justResult
        ? numberAffected
        : {
            numberAffected,
          };
    } catch (e) {
      error = e;
    }
    callback(error, result);
  };

  if (useUpdate) {
    if (callback) {
      await callWithCallBack(() =>
        coll.updateAsync(query, mod, Object.assign({ upsert: true }, options))
      );
      return;
    }
    return {
      numberAffected: await coll.updateAsync(
        query,
        mod,
        Object.assign({ upsert: true }, options)
      ),
    };
  }
  return callWithCallBack(() => coll.upsertAsync(query, mod, options), true);
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
const upsertTestMethodImpl = async function(coll, useUpdate, test) {
  await coll.removeAsync({});
  const result1 = await upsert(coll, useUpdate, { foo: 'bar' }, { foo: 'bar' });

  if (!test) {
    test = {
      equal: function(a, b) {
        if (!EJSON.equals(a, b))
          throw new Error(
            'Not equal: ' + JSON.stringify(a) + ', ' + JSON.stringify(b)
          );
      },
      isTrue: function(a) {
        if (!a) throw new Error('Not truthy: ' + JSON.stringify(a));
      },
      isFalse: function(a) {
        if (a) throw new Error('Not falsey: ' + JSON.stringify(a));
      },
    };
  }

  // if we don't test this, then testing result1.numberAffected will throw,
  // which will get caught and logged and the whole test will pass!
  test.isTrue(result1);

  test.equal(result1.numberAffected, 1);
  if (!useUpdate) test.isTrue(result1.insertedId);
  const fooId = result1.insertedId;
  const obj = await coll.findOneAsync({ foo: 'bar' });
  test.isTrue(obj);
  if (!useUpdate) test.equal(obj._id, result1.insertedId);
  const result2 = await upsert(
    coll,
    useUpdate,
    { _id: fooId },
    { $set: { foo: 'baz ' } }
  );
  test.isTrue(result2);
  test.equal(result2.numberAffected, 1);
  test.isFalse(result2.insertedId);
};

if (Meteor.isServer) {
  var m = {};
  m[upsertTestMethod] = async function (run, useUpdate, options) {
    check(run, String);
    check(useUpdate, Boolean);
    upsertTestMethodColl = new Mongo.Collection(upsertTestMethod + "_collection_" + run, options);
    await upsertTestMethodImpl(upsertTestMethodColl, useUpdate);
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
Object.assign(Dog.prototype, {
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
['STRING', 'MONGO'].forEach(function(idGeneration) {

  var collectionOptions = { idGeneration: idGeneration};

  testAsyncMulti('mongo-livedata - database error reporting. ' + idGeneration, [
    async function(test, expect) {
      var ftc = Meteor._FailureTestCollection;

      var exception = function(err) {
        test.instanceOf(err, Error);
      };

      try {
        for (const op of ['insertAsync', 'removeAsync', 'updateAsync']) {
          var arg = op === 'insertAsync' ? {} : 'bla';
          var arg2 = {};

          const callOp = async function(callback) {
            try {
              if (op === 'updateAsync') {
                await ftc[op](arg, arg2);
              } else {
                await ftc[op](arg);
              }
            } catch (e) {
              callback(e);
            }
          };

          if (Meteor.isServer) {
            await test.throwsAsync(async function() {
              await callOp();
            });

            await callOp(expect(exception));
          }

          if (Meteor.isClient) {
            await callOp(expect(exception));

            // This would log to console in normal operation.
            Meteor._suppress_log(1);
          }
        }
      } catch (e) {}
    },
  ]);


  Tinytest.addAsync('mongo-livedata - basics, ' + idGeneration, async function(
    test,
    onComplete
  ) {
    var run = test.runId();
    var coll, coll2;
    if (Meteor.isClient) {
      coll = new Mongo.Collection(null, collectionOptions); // local, unmanaged
      coll2 = new Mongo.Collection(null, collectionOptions); // local, unmanaged
    } else {
      coll = new Mongo.Collection(
        'livedata_test_collection_' + run,
        collectionOptions
      );
      coll2 = new Mongo.Collection(
        'livedata_test_collection_2_' + run,
        collectionOptions
      );
    }

    var log = '';
    var obs = await coll.find({ run: run }, { sort: ['x'] }).observe({
      addedAt: function(doc, before_index, before) {
        log += 'a(' + doc.x + ',' + before_index + ',' + before + ')';
      },
      changedAt: function(new_doc, old_doc, at_index) {
        log += 'c(' + new_doc.x + ',' + at_index + ',' + old_doc.x + ')';
      },
      movedTo: function(doc, old_index, new_index) {
        log += 'm(' + doc.x + ',' + old_index + ',' + new_index + ')';
      },
      removedAt: function(doc, at_index) {
        log += 'r(' + doc.x + ',' + at_index + ')';
      },
    });

    const captureObserve = async function(f) {
      if (Meteor.isClient) {
        await f();
      } else {
        const fence = new DDPServer._WriteFence();
        await DDPServer._CurrentWriteFence.withValue(fence, f);
        await fence.armAndWait();
      }

      var ret = log;
      log = '';
      return ret;
    };

    const expectObserve = async function(expected, f) {
      if (!(expected instanceof Array)) expected = [expected];

      test.include(expected, await captureObserve(f));
    };

    test.equal(await coll.find({ run: run }).countAsync(), 0);
    test.equal(await coll.findOneAsync('abc'), undefined);
    test.equal(await coll.findOneAsync({ run: run }), undefined);

    await expectObserve('a(1,0,null)', async function() {
      const id = await coll.insertAsync({ run: run, x: 1 });
      test.equal(await coll.find({ run: run }).countAsync(), 1);
      test.equal((await coll.findOneAsync(id)).x, 1);
      test.equal((await coll.findOneAsync({ run: run })).x, 1);
    });

    await expectObserve('a(4,1,null)', async function() {
      const id2 = await coll.insertAsync({ run: run, x: 4 });
      test.equal(await coll.find({ run: run }).countAsync(), 2);
      test.equal(await coll.find({ _id: id2 }).countAsync(), 1);
      test.equal((await coll.findOneAsync(id2)).x, 4);
    });

    test.equal(
      (await coll.findOneAsync({ run: run }, { sort: ['x'], skip: 0 })).x,
      1
    );
    test.equal(
      (await coll.findOneAsync({ run: run }, { sort: ['x'], skip: 1 })).x,
      4
    );
    test.equal(
      (await coll.findOneAsync({ run: run }, { sort: { x: -1 }, skip: 0 })).x,
      4
    );
    test.equal(
      (await coll.findOneAsync({ run: run }, { sort: { x: -1 }, skip: 1 })).x,
      1
    );

    //  - applySkipLimit is no longer an option
    // Note that the current behavior is inconsistent on the client.
    //  (https://github.com/meteor/meteor/issues/1201)
    if (Meteor.isServer) {
      test.equal(await coll.find({ run: run }, { limit: 1 }).countAsync(), 1);
    }

    var cur = coll.find({ run: run }, { sort: ['x'] });
    var total = 0;
    var index = 0;
    var context = {};
    await cur.forEachAsync(async function(doc, i, cursor) {
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
        await Meteor._sleepForMs(5);
      }
      total += doc.x;
      // verify the meteor environment is set up here
      await coll2.insertAsync({ total: total });
    }, context);
    test.equal(total, 14);

    index = 0;
    test.equal(
      await cur.mapAsync(function(doc, i, cursor) {
        // XXX we could theoretically make map run its iterations in parallel or
        // something which would make this fail
        test.equal(i, index++);
        test.isTrue(cursor === cur);
        test.isTrue(context === this);
        return doc.x * 2;
      }, context),
      [2, 8]
    );

  test.equal(coll.find({run: run}, {sort: {x: -1}}).fetch().map(doc => doc.x),
             [4, 1]);

    await expectObserve('', async function() {
      var count = await coll.updateAsync(
        { run: run, x: -1 },
        { $inc: { x: 2 } },
        { multi: true }
      );
      test.equal(count, 0);
    });

    await expectObserve('c(3,0,1)c(6,1,4)', async function() {
      var count = await coll.updateAsync(
        { run: run },
        { $inc: { x: 2 } },
        { multi: true }
      );
      test.equal(count, 2);
      test.equal(
        _.pluck(await coll.find({ run: run }, { sort: { x: -1 } }).fetchAsync(), 'x'),
        [6, 3]
      );
    });

    await expectObserve(
      [
        'c(13,0,3)m(13,0,1)',
        'm(6,1,0)c(13,1,3)',
        'c(13,0,3)m(6,1,0)',
        'm(3,0,1)c(13,1,3)',
      ],
      async function() {
        await coll.updateAsync({ run: run, x: 3 }, { $inc: { x: 10 } }, { multi: true });
        test.equal(
          _.pluck(await coll.find({ run: run }, { sort: { x: -1 } }).fetchAsync(), 'x'),
          [13, 6]
        );
      }
    );

    await expectObserve('r(13,1)', async function() {
      var count = await coll.removeAsync({ run: run, x: { $gt: 10 } });
      test.equal(count, 1);
      test.equal(await coll.find({ run: run }).countAsync(), 1);
    });

    await expectObserve('r(6,0)', async function() {
      await coll.removeAsync({ run: run });
      test.equal(await coll.find({ run: run }).countAsync(), 0);
    });

    await expectObserve('', async function() {
      var count = await coll.removeAsync({ run: run });
      test.equal(count, 0);
      test.equal(await coll.find({ run: run }).countAsync(), 0);
    });

    obs.stop();
    onComplete();
  });

  Tinytest.addAsync('mongo-livedata - fuzz test, ' + idGeneration, async function(
    test,
    onComplete
  ) {
    var run = Random.id();
    var coll;
    if (Meteor.isClient) {
      coll = new Mongo.Collection(null, collectionOptions); // local, unmanaged
    } else {
      coll = new Mongo.Collection(
        'livedata_test_collection_' + run,
        collectionOptions
      );
    }

    // fuzz test of observe(), especially the server-side diffing
    var actual = [];
    var correct = [];
    var counters = { add: 0, change: 0, move: 0, remove: 0 };

    var obs = await coll.find({ run: run }, { sort: ['x'] }).observe({
      addedAt: function(doc, before_index) {
        counters.add++;
        actual.splice(before_index, 0, doc.x);
      },
      changedAt: function(new_doc, old_doc, at_index) {
        counters.change++;
        test.equal(actual[at_index], old_doc.x);
        actual[at_index] = new_doc.x;
      },
      movedTo: function(doc, old_index, new_index) {
        counters.move++;
        test.equal(actual[old_index], doc.x);
        actual.splice(old_index, 1);
        actual.splice(new_index, 0, doc.x);
      },
      removedAt: function(doc, at_index) {
        counters.remove++;
        test.equal(actual[at_index], doc.x);
        actual.splice(at_index, 1);
      },
    });

    if (Meteor.isServer) {
      // For now, has to be polling (not oplog) because it is ordered observe.
      test.isTrue(obs._multiplexer._observeDriver._suspendPolling);
    }

    var step = 0;

    // Use non-deterministic randomness so we can have a shorter fuzz
    // test (fewer iterations).  For deterministic (fully seeded)
    // randomness, remove the call to Random.fraction().
    var seededRandom = new SeededRandom('foobard' + Random.fraction());
    // Random integer in [0,n)
    var rnd = function(n) {
      return seededRandom.nextIntBetween(0, n - 1);
    };

    const finishObserve = async function(f) {
      if (Meteor.isClient) {
        await f();
      } else {
        var fence = new DDPServer._WriteFence();
        await DDPServer._CurrentWriteFence.withValue(fence, f);
        await fence.armAndWait();
      }
    };

    const doStep = async function() {
      if (step++ === 5) {
        // run N random tests
        obs.stop();
        onComplete();
        return;
      }

    var max_counters = Object.assign({}, counters);

      await finishObserve(async function() {
        if (Meteor.isServer) obs._multiplexer._observeDriver._suspendPolling();

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
            await coll.insertAsync({ run: run, x: x });
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
            await coll.updateAsync({ run: run, x: x }, { $set: { x: val } });
            correct[which] = val;
            max_counters.change++;
            max_counters.move++;
          } else {
            await coll.removeAsync({ run: run, x: correct[which] });
            correct.splice(which, 1);
            max_counters.remove++;
          }
        }
        if (Meteor.isServer) await obs._multiplexer._observeDriver._resumePolling();
      });

      // Did we actually deliver messages that mutated the array in the
      // right way?
      correct.sort(function(a, b) {
        return a - b;
      });
      test.equal(actual, correct);

    // Did we limit ourselves to one 'moved' message per change,
    // rather than O(results) moved messages?
    Object.entries(max_counters).forEach(function ([k, v]) {
      test.isTrue(max_counters[k] >= counters[k], k);
    });

      await doStep();
    };

    await doStep();
  });

  Tinytest.addAsync('mongo-livedata - scribbling, ' + idGeneration, async function(
    test,
    onComplete
  ) {
    var run = test.runId();
    var coll;
    if (Meteor.isClient) {
      coll = new Mongo.Collection(null, collectionOptions); // local, unmanaged
    } else {
      coll = new Mongo.Collection(
        'livedata_test_collection_' + run,
        collectionOptions
      );
    }

    var numAddeds = 0;
    var handle = await coll.find({ run: run }).observe({
      addedAt: function(o) {
        // test that we can scribble on the object we get back from Mongo without
        // breaking anything.  The worst possible scribble is messing with _id.
        delete o._id;
        numAddeds++;
      },
    });
    for (const abc of [123, 456, 789]) {
      await runInFence(async function() {
        await coll.insertAsync({ run: run, abc: abc });
      });
    }
    handle.stop();
    // will be 6 (1+2+3) if we broke diffing!
    test.equal(numAddeds, 3);

    onComplete();
  });

  if (Meteor.isServer) {
    Tinytest.addAsync(
      'mongo-livedata - extended scribbling, ' + idGeneration,
      async function(test, onComplete) {
        function error() {
          throw new Meteor.Error('unsafe object mutation');
        }

        const denyModifications = {
          get(target, key) {
            const type = Object.prototype.toString.call(target[key]);
            if (type === '[object Object]' || type === '[object Array]') {
              return freeze(target[key]);
            } else {
              return target[key];
            }
          },
          set: error,
          deleteProperty: error,
          defineProperty: error,
        };

        // Object.freeze only throws in silent mode
        // So we make our own version that always throws.
        function freeze(obj) {
          return new Proxy(obj, denyModifications);
        }

        const origApplyCallback = ObserveMultiplexer.prototype._applyCallback;
        ObserveMultiplexer.prototype._applyCallback = function(callback, args) {
          // Make sure that if anything touches the original object, this will throw
          return origApplyCallback.call(this, callback, freeze(args));
        };

        const run = test.runId();
        const coll = new Mongo.Collection(
          `livedata_test_scribble_collection_${run}`,
          collectionOptions
        );
        const expectMutatable = o => {
          try {
            o.a[0].c = 3;
          } catch (error) {
            test.fail();
          }
        };
        const expectNotMutatable = o => {
          try {
            o.a[0].c = 3;
            test.fail();
          } catch (error) {}
        };
        const handle = await coll.find({ run }).observe({
          addedAt: expectMutatable,
          changedAt: function(id, o) {
            expectMutatable(o);
          },
        });

        const handle2 = await coll.find({ run }).observeChanges(
          {
            added: expectNotMutatable,
            changed: function(id, o) {
              expectNotMutatable(o);
            },
          },
          { nonMutatingCallbacks: true }
        );

        await runInFence(async function() {
          await coll.insertAsync({ run, a: [{ c: 1 }] });
          await coll.updateAsync({ run }, { $set: { 'a.0.c': 2 } });
        });

        handle.stop();
        handle2.stop();

        ObserveMultiplexer.prototype._applyCallback = origApplyCallback;
        onComplete();
      }
    );
  }

  Tinytest.addAsync(
    'mongo-livedata - stop handle in callback, ' + idGeneration,
    async function(test, onComplete) {
      var run = Random.id();
      var coll;
      if (Meteor.isClient) {
        coll = new Mongo.Collection(null, collectionOptions); // local, unmanaged
      } else {
        coll = new Mongo.Collection(
          'stopHandleInCallback-' + run,
          collectionOptions
        );
      }

      var output = [];

      var handle = await coll.find().observe({
        added: function(doc) {
          output.push({ added: doc._id });
        },
        changed: function(newDoc) {
          output.push('changed');
          handle.stop();
        },
      });

      test.equal(output, []);

      // Insert a document. Observe that the added callback is called.
      var docId;
      await runInFence(async function() {
        docId = await coll.insertAsync({ foo: 42 });
      });
      test.length(output, 1);
      test.equal(output.shift(), { added: docId });

      // Update it. Observe that the changed callback is called. This should also
      // stop the observation.
      await runInFence(async function() {
        await coll.updateAsync(docId, { $set: { bar: 10 } });
      });
      test.length(output, 1);
      test.equal(output.shift(), 'changed');

      // Update again. This shouldn't call the callback because we stopped the
      // observation.
      await runInFence(async function() {
        await coll.updateAsync(docId, { $set: { baz: 40 } });
      });
      test.length(output, 0);

      test.equal(await coll.find().countAsync(), 1);
      test.equal(await coll.findOneAsync(docId), {
        _id: docId,
        foo: 42,
        bar: 10,
        baz: 40,
      });

      onComplete();
    }
  );

// This behavior isn't great, but it beats deadlock.
  if (Meteor.isServer) {
    Tinytest.addAsync(
      'mongo-livedata - recursive observe throws, ' + idGeneration,
      async function(test, onComplete) {
        var run = test.runId();
        var coll = new Mongo.Collection(
          'observeInCallback-' + run,
          collectionOptions
        );

        var callbackCalled = false;
        var handle = await coll.find({}).observe({
          added: async function(newDoc) {
            callbackCalled = true;
            await test.throwsAsync(async function() {
              await coll.find({}).observe();
            });
          },
        });
        test.isFalse(callbackCalled);
        // Insert a document. Observe that the added callback is called.
        await runInFence(async function() {
          await coll.insertAsync({ foo: 42 });
        });
        test.isTrue(callbackCalled);

        handle.stop();

        onComplete();
      }
    );

    Tinytest.addAsync(
      'mongo-livedata - cursor dedup, ' + idGeneration,
      async function(test, onComplete) {
        var run = test.runId();
        var coll = new Mongo.Collection(
          'cursorDedup-' + run,
          collectionOptions
        );

        const observer = async function(noAdded, name) {
          const output = [];
          const callbacks = {
            changed: function(newDoc) {
              output.push({ changed: newDoc._id });
            },
          };
          if (!noAdded) {
            callbacks.added = function(doc) {
              output.push({ added: doc._id });
            };
          }
          const handle = await coll.find({ foo: 22 }).observe(callbacks);
          return { output: output, handle: handle };
        };

        // Insert a doc and start observing.
        var docId1 = await coll.insertAsync({ foo: 22 });
        var o1 = await observer(false, 'o1');
        // Initial add.
        test.length(o1.output, 1);
        test.equal(o1.output.shift(), { added: docId1 });

        // Insert another doc (blocking until observes have fired).
        var docId2;
        await runInFence(async function() {
          docId2 = await coll.insertAsync({ foo: 22, bar: 5 });
        });
        // Observed add.
        test.length(o1.output, 1);
        test.equal(o1.output.shift(), { added: docId2 });

        // Second identical observe.
        var o2 = await observer(false, 'o2');

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
        await runInFence(async function() {
          await coll.updateAsync(docId1, { $set: { x: 'y' } });
        });
        test.length(o1.output, 1);
        test.length(o2.output, 1);
        test.equal(o1.output.shift(), { changed: docId1 });
        test.equal(o2.output.shift(), { changed: docId1 });

        // Stop first handle. Second handle still around.
        o1.handle.stop();
        test.length(o1.output, 0);
        test.length(o2.output, 0);

        // Another update. Just the second handle should fire.
        await runInFence(async function() {
          await coll.updateAsync(docId2, { $set: { z: 'y' } });
        });
        test.length(o1.output, 0);
        test.length(o2.output, 1);
        test.equal(o2.output.shift(), { changed: docId2 });

        // Stop second handle. Nothing should happen, but the multiplexer should
        // be stopped.
        test.isTrue(observeMultiplexer._handles); // This will change.
        await o2.handle.stop();
        test.length(o1.output, 0);
        test.length(o2.output, 0);
        // White-box: ObserveMultiplexer has nulled its _handles so you can't
        // accidentally join to it.
        test.isNull(observeMultiplexer._handles);
        // Start yet another handle on the same query.
        var o3 = await observer();
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
        var o4 = await observer(true);

        o3.handle.stop();
        o4.handle.stop();

        onComplete();
      }
    );

    Tinytest.addAsync(
      'mongo-livedata - async server-side insert, ' + idGeneration,
      async function(test, onComplete) {
        // Tests that insert returns before the callback runs. Relies on the fact
        // that mongo does not run the callback before spinning off the event loop.
        var cname = Random.id();
        var coll = new Mongo.Collection(cname);
        var doc = { foo: 'bar' };
        var x = 0;

        let resolver;
        const promise = new Promise(r => (resolver = r));

        coll.insertAsync(doc).then(() => {
          test.equal(x, 1);
          resolver();
        });
        x++;

        await promise;
      }
    );

    Tinytest.addAsync(
      'mongo-livedata - async server-side update, ' + idGeneration,
      async function(test, onComplete) {
        // Tests that update returns before the callback runs.
        var cname = Random.id();
        var coll = new Mongo.Collection(cname);
        var doc = { foo: 'bar' };
        var x = 0;
        var id = await coll.insertAsync(doc);

        let resolver;
        const promise = new Promise(r => (resolver = r));

        coll.updateAsync(id, { $set: { foo: 'baz' } }).then(result => {
          test.equal(result, 1);
          test.equal(x, 1);
          resolver();
        });

        x++;

        return promise;
      }
    );

    Tinytest.addAsync(
      'mongo-livedata - async server-side remove, ' + idGeneration,
      async function(test, onComplete) {
        // Tests that remove returns before the callback runs.
        var cname = Random.id();
        var coll = new Mongo.Collection(cname);
        var doc = { foo: 'bar' };
        var x = 0;
        var id = await coll.insertAsync(doc);

        let resolver;
        const promise = new Promise(r => (resolver = r));

        coll.removeAsync(id).then(async () => {
          test.isFalse(await coll.findOneAsync(id));
          test.equal(x, 1);
          resolver();
        });
        x++;

        return promise;
      }
    );

  // compares arrays a and b w/o looking at order
  var setsEqual = function (a, b) {
    a = a.map(EJSON.stringify);
    b = b.map(EJSON.stringify);
    return isEmpty(difference([a, b])) && isEmpty(difference([b, a]));
  };

    // This test mainly checks the correctness of oplog code dealing with limited
    // queries. Compitablity with poll-diff is added as well.
    Tinytest.addAsync(
      'mongo-livedata - observe sorted, limited ' + idGeneration,
      async function(test) {
        var run = test.runId();
        var coll = new Mongo.Collection(
          'observeLimit-' + run,
          collectionOptions
        );

        const observer = async function() {
          var state = {};
          var output = [];
          var callbacks = {
            changed: function(newDoc) {
              output.push({ changed: newDoc._id });
              state[newDoc._id] = newDoc;
            },
            added: function(newDoc) {
              output.push({ added: newDoc._id });
              state[newDoc._id] = newDoc;
            },
            removed: function(oldDoc) {
              output.push({ removed: oldDoc._id });
              delete state[oldDoc._id];
            },
          };
          var handle = await coll
            .find({ foo: 22 }, { sort: { bar: 1 }, limit: 3 })
            .observe(callbacks);

          return { output: output, handle: handle, state: state };
        };
        const clearOutput = function(o) {
          o.output.splice(0, o.output.length);
        };

        const ins = async function(doc) {
          let id;
          await runInFence(async function() {
            id = await coll.insertAsync(doc);
          });
          return id;
        };
        const rem = async function(sel) {
          await runInFence(async function() {
            await coll.removeAsync(sel);
          });
        };
        const upd = async function(sel, mod, opt) {
          await runInFence(async function() {
            await coll.updateAsync(sel, mod, opt);
          });
        };
        // tests '_id' subfields for all documents in oplog buffer
        var testOplogBufferIds = function(ids) {
          if (!usesOplog) return;
          var bufferIds = [];
          o.handle._multiplexer._observeDriver._unpublishedBuffer.forEach(
            function(x, id) {
              bufferIds.push(id);
            }
          );

          test.isTrue(
            setsEqual(ids, bufferIds),
            'expected: ' + ids + '; got: ' + bufferIds
          );
        };
        const testSafeAppendToBufferFlag = function(expected) {
          if (!usesOplog) return;
          test.equal(
            o.handle._multiplexer._observeDriver._safeAppendToBuffer,
            expected
          );
        };

        // We'll describe our state as follows.  5:1 means "the document with
        // _id=docId1 and bar=5".  We list documents as
        //   [ currently published | in the buffer ] outside the buffer
        // If safeToAppendToBuffer is true, we'll say ]! instead.

        // Insert a doc and start observing.
        var docId1 = await ins({ foo: 22, bar: 5 });
        await waitUntilOplogCaughtUp();

        // State: [ 5:1 | ]!
        var o = await observer();
        var usesOplog = o.handle._multiplexer._observeDriver._usesOplog;
        // Initial add.
        test.length(o.output, 1);
        test.equal(o.output.shift(), { added: docId1 });
        testSafeAppendToBufferFlag(true);

        // Insert another doc (blocking until observes have fired).
        // State: [ 5:1 6:2 | ]!
        var docId2 = await ins({ foo: 22, bar: 6 });
        // Observed add.
        test.length(o.output, 1);
        test.equal(o.output.shift(), { added: docId2 });
        testSafeAppendToBufferFlag(true);

        var docId3 = await ins({ foo: 22, bar: 3 });
        // State: [ 3:3 5:1 6:2 | ]!
        test.length(o.output, 1);
        test.equal(o.output.shift(), { added: docId3 });
        testSafeAppendToBufferFlag(true);

        // Add a non-matching document
        await ins({ foo: 13 });
        // It shouldn't be added
        test.length(o.output, 0);

        // Add something that matches but is too big to fit in
        var docId4 = await ins({ foo: 22, bar: 7 });
        // State: [ 3:3 5:1 6:2 | 7:4 ]!
        // It shouldn't be added but should end up in the buffer.
        test.length(o.output, 0);
        testOplogBufferIds([docId4]);
        testSafeAppendToBufferFlag(true);

        // Let's add something small enough to fit in
        var docId5 = await ins({ foo: 22, bar: -1 });
        // State: [ -1:5 3:3 5:1 | 6:2 7:4 ]!
        // We should get an added and a removed events
        test.length(o.output, 2);
        // doc 2 was removed from the published set as it is too big to be in
        test.isTrue(
          setsEqual(o.output, [{ added: docId5 }, { removed: docId2 }])
        );
        clearOutput(o);
        testOplogBufferIds([docId2, docId4]);
        testSafeAppendToBufferFlag(true);

        // Now remove something and that doc 2 should be right back
        await rem(docId5);
        // State: [ 3:3 5:1 6:2 | 7:4 ]!
        test.length(o.output, 2);
        test.isTrue(
          setsEqual(o.output, [{ removed: docId5 }, { added: docId2 }])
        );
        clearOutput(o);
        testOplogBufferIds([docId4]);
        testSafeAppendToBufferFlag(true);

        // Add some negative numbers overflowing the buffer.
        // New documents will take the published place, [3 5 6] will take the buffer
        // and 7 will be outside of the buffer in MongoDB.
        var docId6 = await ins({ foo: 22, bar: -1 });
        var docId7 = await ins({ foo: 22, bar: -2 });
        var docId8 = await ins({ foo: 22, bar: -3 });
        // State: [ -3:8 -2:7 -1:6 | 3:3 5:1 6:2 ] 7:4
        test.length(o.output, 6);
        var expected = [
          { added: docId6 },
          { removed: docId2 },
          { added: docId7 },
          { removed: docId1 },
          { added: docId8 },
          { removed: docId3 },
        ];
        test.isTrue(setsEqual(o.output, expected));
        clearOutput(o);
        testOplogBufferIds([docId1, docId2, docId3]);
        testSafeAppendToBufferFlag(false);

        // If we update first 3 docs (increment them by 20), it would be
        // interesting.
        await upd({ bar: { $lt: 0 } }, { $inc: { bar: 20 } }, { multi: true });
        // State: [ 3:3 5:1 6:2 | ] 7:4 17:8 18:7 19:6
        //   which triggers re-poll leaving us at
        // State: [ 3:3 5:1 6:2 | 7:4 17:8 18:7 ] 19:6

        // The updated documents can't find their place in published and they can't
        // be buffered as we are not aware of the situation outside of the buffer.
        // But since our buffer becomes empty, it will be refilled partially with
        // updated documents.
        test.length(o.output, 6);
        var expectedRemoves = [
          { removed: docId6 },
          { removed: docId7 },
          { removed: docId8 },
        ];
        var expectedAdds = [
          { added: docId3 },
          { added: docId1 },
          { added: docId2 },
        ];

        test.isTrue(setsEqual(o.output, expectedAdds.concat(expectedRemoves)));
        clearOutput(o);
        testOplogBufferIds([docId4, docId7, docId8]);
        testSafeAppendToBufferFlag(false);

        // Remove first 4 docs (3, 1, 2, 4) forcing buffer to become empty and
        // schedule a repoll.
        await rem({ bar: { $lt: 10 } });
        // State: [ 17:8 18:7 19:6 | ]!

        // XXX the oplog code analyzes the events one by one: one remove after
        // another. Poll-n-diff code, on the other side, analyzes the batch action
        // of multiple remove. Because of that difference, expected outputs differ.
        if (usesOplog) {
          expectedRemoves = [
            { removed: docId3 },
            { removed: docId1 },
            { removed: docId2 },
            { removed: docId4 },
          ];
          expectedAdds = [
            { added: docId4 },
            { added: docId8 },
            { added: docId7 },
            { added: docId6 },
          ];

          test.length(o.output, 8);
        } else {
          expectedRemoves = [
            { removed: docId3 },
            { removed: docId1 },
            { removed: docId2 },
          ];
          expectedAdds = [
            { added: docId8 },
            { added: docId7 },
            { added: docId6 },
          ];

          test.length(o.output, 6);
        }

        test.isTrue(setsEqual(o.output, expectedAdds.concat(expectedRemoves)));
        clearOutput(o);
        testOplogBufferIds([]);
        testSafeAppendToBufferFlag(true);

        var docId9 = await ins({ foo: 22, bar: 21 });
        var docId10 = await ins({ foo: 22, bar: 31 });
        var docId11 = await ins({ foo: 22, bar: 41 });
        var docId12 = await ins({ foo: 22, bar: 51 });
        // State: [ 17:8 18:7 19:6 | 21:9 31:10 41:11 ] 51:12

        testOplogBufferIds([docId9, docId10, docId11]);
        testSafeAppendToBufferFlag(false);
        test.length(o.output, 0);
        await upd({ bar: { $lt: 20 } }, { $inc: { bar: 5 } }, { multi: true });
        // State: [ 21:9 22:8 23:7 | 24:6 31:10 41:11 ] 51:12
        test.length(o.output, 4);
        test.isTrue(
          setsEqual(o.output, [
            { removed: docId6 },
            { added: docId9 },
            { changed: docId7 },
            { changed: docId8 },
          ])
        );
        clearOutput(o);
        testOplogBufferIds([docId6, docId10, docId11]);
        testSafeAppendToBufferFlag(false);

        await rem(docId9);
        // State: [ 22:8 23:7 24:6 | 31:10 41:11 ] 51:12
        test.length(o.output, 2);
        test.isTrue(
          setsEqual(o.output, [{ removed: docId9 }, { added: docId6 }])
        );
        clearOutput(o);
        testOplogBufferIds([docId10, docId11]);
        testSafeAppendToBufferFlag(false);

        await upd(
          { bar: { $gt: 25 } },
          { $inc: { bar: -7.5 } },
          { multi: true }
        );
        // State: [ 22:8 23:7 23.5:10 | 24:6 ] 33.5:11 43.5:12
        // 33.5 doesn't update in-place in buffer, because it the driver is not sure
        // it can do it: because the buffer does not have the safe append flag set,
        // for all it knows there is a different doc which is less than 33.5.
        test.length(o.output, 2);
        test.isTrue(
          setsEqual(o.output, [{ removed: docId6 }, { added: docId10 }])
        );
        clearOutput(o);
        testOplogBufferIds([docId6]);
        testSafeAppendToBufferFlag(false);

        // Force buffer objects to be moved into published set so we can check them
        await rem(docId7);
        await rem(docId8);
        await rem(docId10);

        // State: [ 24:6 | ] 33.5:11 43.5:12
        //    triggers repoll
        // State: [ 24:6 33.5:11 43.5:12 | ]!
        test.length(o.output, 6);
        test.isTrue(
          setsEqual(o.output, [
            { removed: docId7 },
            { removed: docId8 },
            { removed: docId10 },
            { added: docId6 },
            { added: docId11 },
            { added: docId12 },
          ])
        );

    test.length(Object.keys(o.state), 3);
    test.equal(o.state[docId6], { _id: docId6, foo: 22, bar: 24 });
    test.equal(o.state[docId11], { _id: docId11, foo: 22, bar: 33.5 });
    test.equal(o.state[docId12], { _id: docId12, foo: 22, bar: 43.5 });
    clearOutput(o);
    testOplogBufferIds([]);
    testSafeAppendToBufferFlag(true);

        var docId13 = await ins({ foo: 22, bar: 50 });
        var docId14 = await ins({ foo: 22, bar: 51 });
        var docId15 = await ins({ foo: 22, bar: 52 });
        var docId16 = await ins({ foo: 22, bar: 53 });
        // State: [ 24:6 33.5:11 43.5:12 | 50:13 51:14 52:15 ] 53:16
        test.length(o.output, 0);
        testOplogBufferIds([docId13, docId14, docId15]);
        testSafeAppendToBufferFlag(false);
        // Update something that's outside the buffer to be in the buffer, writing
        // only to the sort key.
        await upd(docId16, { $set: { bar: 10 } });

        // State: [ 10:16 24:6 33.5:11 | 43.5:12 50:13 51:14 ] 52:15
        test.length(o.output, 2);
        test.isTrue(
          setsEqual(o.output, [{ removed: docId12 }, { added: docId16 }])
        );
        clearOutput(o);
        testOplogBufferIds([docId12, docId13, docId14]);
        testSafeAppendToBufferFlag(false);

        o.handle.stop();
      }
    );

    Tinytest.addAsync(
      'mongo-livedata - observe sorted, limited, sort fields ' + idGeneration,
      async function(test, onComplete) {
        var run = test.runId();
        var coll = new Mongo.Collection(
          'observeLimit-' + run,
          collectionOptions
        );

        var observer = async function() {
          var state = {};
          var output = [];
          var callbacks = {
            changed: function(newDoc) {
              output.push({ changed: newDoc._id });
              state[newDoc._id] = newDoc;
            },
            added: function(newDoc) {
              output.push({ added: newDoc._id });
              state[newDoc._id] = newDoc;
            },
            removed: function(oldDoc) {
              output.push({ removed: oldDoc._id });
              delete state[oldDoc._id];
            },
          };
          var handle = await coll
            .find({}, { sort: { x: 1 }, limit: 2, fields: { y: 1 } })
            .observe(callbacks);

          return { output: output, handle: handle, state: state };
        };
        var clearOutput = function(o) {
          o.output.splice(0, o.output.length);
        };
        const ins = async function(doc) {
          let id;
          await runInFence(async function() {
            id = await coll.insertAsync(doc);
          });
          return id;
        };
        const rem = async function(id) {
          await runInFence(async function() {
            await coll.removeAsync(id);
          });
        };

        var o = await observer();

        var docId1 = await ins({ x: 1, y: 1222 });
        var docId2 = await ins({ x: 5, y: 5222 });

        test.length(o.output, 2);
        test.equal(o.output, [{ added: docId1 }, { added: docId2 }]);
        clearOutput(o);

        var docId3 = await ins({ x: 7, y: 7222 });
        test.length(o.output, 0);

        var docId4 = await ins({ x: -1, y: -1222 });

        // Becomes [docId4 docId1 | docId2 docId3]
        test.length(o.output, 2);
        test.isTrue(
          setsEqual(o.output, [{ added: docId4 }, { removed: docId2 }])
        );

    test.equal(Object.keys(o.state).length, 2);
    test.equal(o.state[docId4], {_id: docId4, y: -1222});
    test.equal(o.state[docId1], {_id: docId1, y: 1222});
    clearOutput(o);

        await rem(docId2);
        // Becomes [docId4 docId1 | docId3]
        test.length(o.output, 0);

        await rem(docId4);
        // Becomes [docId1 docId3]
        test.length(o.output, 2);
        test.isTrue(
          setsEqual(o.output, [{ added: docId3 }, { removed: docId4 }])
        );

    test.equal(Object.keys(o.state).length, 2);
    test.equal(o.state[docId3], {_id: docId3, y: 7222});
    test.equal(o.state[docId1], {_id: docId1, y: 1222});
    clearOutput(o);

        onComplete();
      }
    );

    Tinytest.addAsync(
      'mongo-livedata - observe sorted, limited, big initial set ' +
        idGeneration,
      async function(test) {
        var run = test.runId();
        var coll = new Mongo.Collection(
          'observeLimit-' + run,
          collectionOptions
        );

        var observer = async function() {
          var state = {};
          var output = [];
          var callbacks = {
            changed: function(newDoc) {
              output.push({ changed: newDoc._id });
              state[newDoc._id] = newDoc;
            },
            added: function(newDoc) {
              output.push({ added: newDoc._id });
              state[newDoc._id] = newDoc;
            },
            removed: function(oldDoc) {
              output.push({ removed: oldDoc._id });
              delete state[oldDoc._id];
            },
          };
          var handle = await coll
            .find({}, { sort: { x: 1, y: 1 }, limit: 3 })
            .observe(callbacks);

          return { output: output, handle: handle, state: state };
        };
        const clearOutput = function(o) {
          o.output.splice(0, o.output.length);
        };
        const ins = async function(doc) {
          let id;
          await runInFence(async function() {
            id = await coll.insertAsync(doc);
          });
          return id;
        };
        const rem = async function(id) {
          await runInFence(async function() {
            await coll.removeAsync(id);
          });
        };
        // tests '_id' subfields for all documents in oplog buffer
        var testOplogBufferIds = function(ids) {
          var bufferIds = [];
          o.handle._multiplexer._observeDriver._unpublishedBuffer.forEach(
            function(x, id) {
              bufferIds.push(id);
            }
          );

          test.isTrue(
            setsEqual(ids, bufferIds),
            'expected: ' + ids + '; got: ' + bufferIds
          );
        };
        var testSafeAppendToBufferFlag = function(expected) {
          if (expected) {
            test.isTrue(
              o.handle._multiplexer._observeDriver._safeAppendToBuffer
            );
          } else {
            test.isFalse(
              o.handle._multiplexer._observeDriver._safeAppendToBuffer
            );
          }
        };

        var ids = {};
        let i = 0;
        for (const x of [2, 4, 1, 3, 5, 5, 9, 1, 3, 2, 5]) {
          ids[i] = await ins({ x, y: i });
          i++;
        }

        // Ensure that we are past all the 'i' entries before we run the query, so
        // that we get the expected phase transitions.
        await waitUntilOplogCaughtUp();

        var o = await observer();
        var usesOplog = o.handle._multiplexer._observeDriver._usesOplog;
        //  x: [1 1 2 | 2 3 3] 4 5 5 5  9
        // id: [2 7 0 | 9 3 8] 1 4 5 10 6

        test.length(o.output, 3);

        test.isTrue(
          setsEqual(
            [{ added: ids[2] }, { added: ids[7] }, { added: ids[0] }],
            o.output
          )
        );
        usesOplog && testOplogBufferIds([ids[9], ids[3], ids[8]]);
        usesOplog && testSafeAppendToBufferFlag(false);
        clearOutput(o);

        await rem(ids[0]);
        //  x: [1 1 2 | 3 3] 4 5 5 5  9
        // id: [2 7 9 | 3 8] 1 4 5 10 6
        test.length(o.output, 2);
        test.isTrue(
          setsEqual([{ removed: ids[0] }, { added: ids[9] }], o.output)
        );
        usesOplog && testOplogBufferIds([ids[3], ids[8]]);
        usesOplog && testSafeAppendToBufferFlag(false);
        clearOutput(o);

        await rem(ids[7]);
        //  x: [1 2 3 | 3] 4 5 5 5  9
        // id: [2 9 3 | 8] 1 4 5 10 6
        test.length(o.output, 2);
        test.isTrue(
          setsEqual([{ removed: ids[7] }, { added: ids[3] }], o.output)
        );
        usesOplog && testOplogBufferIds([ids[8]]);
        usesOplog && testSafeAppendToBufferFlag(false);
        clearOutput(o);

        await rem(ids[3]);
        //  x: [1 2 3 | 4 5 5] 5  9
        // id: [2 9 8 | 1 4 5] 10 6
        test.length(o.output, 2);
        test.isTrue(
          setsEqual([{ removed: ids[3] }, { added: ids[8] }], o.output)
        );
        usesOplog && testOplogBufferIds([ids[1], ids[4], ids[5]]);
        usesOplog && testSafeAppendToBufferFlag(false);
        clearOutput(o);

        await rem({ x: { $lt: 4 } });
        //  x: [4 5 5 | 5  9]
        // id: [1 4 5 | 10 6]
        test.length(o.output, 6);
        test.isTrue(
          setsEqual(
            [
              { removed: ids[2] },
              { removed: ids[9] },
              { removed: ids[8] },
              { added: ids[5] },
              { added: ids[4] },
              { added: ids[1] },
            ],
            o.output
          )
        );
        usesOplog && testOplogBufferIds([ids[10], ids[6]]);
        usesOplog && testSafeAppendToBufferFlag(true);
        clearOutput(o);
      }
    );
  }


  testAsyncMulti('mongo-livedata - empty documents, ' + idGeneration, [
    function(test, expect) {
      this.collectionName = Random.id();
      if (Meteor.isClient) {
        Meteor.call('createInsecureCollection', this.collectionName);
        Meteor.subscribe('c-' + this.collectionName, expect());
      }
    },
    async function(test, expect) {
      const coll = new Mongo.Collection(this.collectionName, collectionOptions);

      const id = await coll.insertAsync({});
      test.isTrue(id);
      const cursor = coll.find();
      test.equal(await cursor.countAsync(), 1);
    },
  ]);

// Regression test for #2413.
  testAsyncMulti('mongo-livedata - upsert without callback, ' + idGeneration, [
    function(test, expect) {
      this.collectionName = Random.id();
      if (Meteor.isClient) {
        Meteor.call('createInsecureCollection', this.collectionName);
        Meteor.subscribe('c-' + this.collectionName, expect());
      }
    },
    async function(test, expect) {
      const coll = new Mongo.Collection(this.collectionName, collectionOptions);

      // No callback!  Before fixing #2413, this method never returned and
      // so no future DDP methods worked either.
      await coll.upsertAsync('foo', { bar: 1 });
      // Do something else on the same method and expect it to actually work.
      // (If the bug comes back, this will 'async batch timeout'.)
      await coll.insertAsync({});
    },
  ]);

// Regression test for https://github.com/meteor/meteor/issues/8666.
  testAsyncMulti(
    'mongo-livedata - upsert with an undefined selector, ' + idGeneration,
    [
      function(test, expect) {
        this.collectionName = Random.id();
        if (Meteor.isClient) {
          Meteor.call('createInsecureCollection', this.collectionName);
          Meteor.subscribe('c-' + this.collectionName, expect());
        }
      },
      async function(test, expect) {
        const coll = new Mongo.Collection(this.collectionName, collectionOptions);
        const testWidget = {
          name: 'Widget name',
        };
        const insertDetails = await coll.upsertAsync(testWidget._id, testWidget);
        test.equal(
          await coll.findOneAsync(insertDetails.insertedId),
          Object.assign({ _id: insertDetails.insertedId }, testWidget)
        );
      },
    ]
  );

// See https://github.com/meteor/meteor/issues/594.
  testAsyncMulti('mongo-livedata - document with length, ' + idGeneration, [
    function(test, expect) {
      this.collectionName = Random.id();
      if (Meteor.isClient) {
        Meteor.call(
          'createInsecureCollection',
          this.collectionName,
          collectionOptions
        );
        Meteor.subscribe('c-' + this.collectionName, expect());
      }
    },
    async function(test, expect) {
      var self = this;
      var coll = (self.coll = new Mongo.Collection(
        self.collectionName,
        collectionOptions
      ));

      const id = await coll.insertAsync({ foo: 'x', length: 0 });

      test.isTrue(id);
      self.docId = id;
      test.equal(await coll.findOneAsync(self.docId), {
        _id: self.docId,
        foo: 'x',
        length: 0,
      });
    },
    async function(test, expect) {
      const self = this;
      const coll = self.coll;
      await coll.updateAsync(self.docId, { $set: { length: 5 } });
      test.equal(await coll.findOneAsync(self.docId), {
        _id: self.docId,
        foo: 'x',
        length: 5,
      });
    },
  ]);

  testAsyncMulti('mongo-livedata - document with a date, ' + idGeneration, [
    function(test, expect) {
      this.collectionName = Random.id();
      if (Meteor.isClient) {
        Meteor.call(
          'createInsecureCollection',
          this.collectionName,
          collectionOptions
        );
        Meteor.subscribe('c-' + this.collectionName, expect());
      }
    },
    async function(test, expect) {
      var coll = new Mongo.Collection(this.collectionName, collectionOptions);
      const id = await coll.insertAsync({ d: new Date(1356152390004) });
      test.isTrue(id);
      const cursor = coll.find();
      test.equal(await cursor.countAsync(), 1);
      test.equal((await coll.findOneAsync()).d.getFullYear(), 2012);
    },
  ]);

  testAsyncMulti(
    'mongo-livedata - document goes through a transform, ' + idGeneration,
    [
      function(test, expect) {
        var self = this;
        var seconds = function(doc) {
          doc.seconds = function() {
            return doc.d.getSeconds();
          };
          return doc;
        };
        TRANSFORMS['seconds'] = seconds;
        self.collectionOptions = {
          idGeneration: idGeneration,
          transform: seconds,
          transformName: 'seconds',
        };
        this.collectionName = Random.id();
        if (Meteor.isClient) {
          Meteor.call(
            'createInsecureCollection',
            this.collectionName,
            collectionOptions
          );
          Meteor.subscribe('c-' + this.collectionName, expect());
        }
      },
      async function(test, expect) {
        const self = this;
        self.coll = new Mongo.Collection(
          self.collectionName,
          self.collectionOptions
        );
        let obs;
        const expectAdd = expect(function(doc) {
          test.equal(doc.seconds(), 50);
        });
        var expectRemove = expect(function(doc) {
          test.equal(doc.seconds(), 50);
          obs.stop();
        });
        const id = await self.coll.insertAsync(
          { d: new Date(1356152390004) },
        );
        test.isTrue(id);
        var cursor = self.coll.find();
        obs = await cursor.observe({
          added: expectAdd,
          removed: expectRemove,
        });
        test.equal(await cursor.countAsync(), 1);
        test.equal((await cursor.fetchAsync())[0].seconds(), 50);
        test.equal((await self.coll.findOneAsync()).seconds(), 50);
        test.equal(
          (await self.coll.findOneAsync({}, { transform: null })).seconds,
          undefined
        );
        test.equal(
          (await self.coll.findOneAsync(
            {},
            {
              transform: function(doc) {
                return { seconds: doc.d.getSeconds() };
              },
            }
          )).seconds,
          50
        );
        await self.coll.removeAsync(id);
      },
      async function(test, expect) {
        const self = this;
        let id = await self.coll.insertAsync({ d: new Date(1356152390004) });
        test.isTrue(id);
        self.id1 = id;

        id = await self.coll.insertAsync({ d: new Date(1356152391004) });
        self.id2 = id;
      },
    ]
  );

  testAsyncMulti(
    'mongo-livedata - transform sets _id if not present, ' + idGeneration,
    [
      function(test, expect) {
        var justId = function(doc) {
          return _.omit(doc, '_id');
        };
        TRANSFORMS['justId'] = justId;
        var collectionOptions = {
          idGeneration: idGeneration,
          transform: justId,
          transformName: 'justId',
        };
        this.collectionName = Random.id();
        if (Meteor.isClient) {
          Meteor.call(
            'createInsecureCollection',
            this.collectionName,
            collectionOptions
          );
          Meteor.subscribe('c-' + this.collectionName, expect());
        }
      },
      async function(test, expect) {
        var self = this;
        self.coll = new Mongo.Collection(
          this.collectionName,
          collectionOptions
        );
        const id = await self.coll.insertAsync({});
        test.isTrue(id);
        test.equal((await self.coll.findOneAsync())._id, id);
      },
    ]
  );

  var bin = Base64.decode(
    "TWFuIGlzIGRpc3Rpbmd1aXNoZWQsIG5vdCBvbmx5IGJ5IGhpcyBy" +
    "ZWFzb24sIGJ1dCBieSB0aGlzIHNpbmd1bGFyIHBhc3Npb24gZnJv" +
    "bSBvdGhlciBhbmltYWxzLCB3aGljaCBpcyBhIGx1c3Qgb2YgdGhl" +
    "IG1pbmQsIHRoYXQgYnkgYSBwZXJzZXZlcmFuY2Ugb2YgZGVsaWdo" +
    "dCBpbiB0aGUgY29udGludWVkIGFuZCBpbmRlZmF0aWdhYmxlIGdl" +
    "bmVyYXRpb24gb2Yga25vd2xlZGdlLCBleGNlZWRzIHRoZSBzaG9y" +
    "dCB2ZWhlbWVuY2Ugb2YgYW55IGNhcm5hbCBwbGVhc3VyZS4=");

  testAsyncMulti(
    'mongo-livedata - document with binary data, ' + idGeneration,
    [
      function(test, expect) {
        // XXX probably shouldn't use EJSON's private test symbols
        this.collectionName = Random.id();
        if (Meteor.isClient) {
          Meteor.call(
            'createInsecureCollection',
            this.collectionName,
            collectionOptions
          );
          Meteor.subscribe('c-' + this.collectionName, expect());
        }
      },
      async function(test, expect) {
        var coll = new Mongo.Collection(this.collectionName, collectionOptions);
        const id = await coll.insertAsync(
          { b: bin },
        );
        test.isTrue(id);
        const cursor = coll.find();
        test.equal(await cursor.countAsync(), 1);
        const inColl = await coll.findOneAsync();
        test.isTrue(EJSON.isBinary(inColl.b));
        test.equal(inColl.b, bin);
      },
    ]
  );

  testAsyncMulti(
    'mongo-livedata - document with a custom type, ' + idGeneration,
    [
      function(test, expect) {
        this.collectionName = Random.id();
        if (Meteor.isClient) {
          Meteor.call(
            'createInsecureCollection',
            this.collectionName,
            collectionOptions
          );
          Meteor.subscribe('c-' + this.collectionName, expect());
        }
      },

      async function(test, expect) {
        var self = this;
        self.coll = new Mongo.Collection(
          this.collectionName,
          collectionOptions
        );
        // Dog is implemented at the top of the file, outside of the idGeneration
        // loop (so that we only call EJSON.addType once).
        const d = new Dog('reginald', null);
        const id = await self.coll.insertAsync({ d: d });
        test.isTrue(id);
        self.docId = id;
        const cursor = self.coll.find();
        test.equal(await cursor.countAsync(), 1);
        const inColl = await self.coll.findOneAsync();
        test.isTrue(inColl);
        inColl && test.equal(inColl.d.speak(), 'woof');
        inColl && test.isNull(inColl.d.color);
      },

      async function(test) {
        const self = this;
        try {
          await self.coll.insertAsync(new Dog('rover', 'orange'));
        } catch (err) {
          test.isTrue(err);
        }
      },

      async function(test) {
        const self = this;
        try {
          await self.coll.updateAsync(self.docId, new Dog('rover', 'orange'));
        } catch (err) {
          test.isTrue(err);
        }
      },
    ]
  );

  if (Meteor.isServer) {
    Tinytest.addAsync(
      'mongo-livedata - update return values, ' + idGeneration,
      async function(test, onComplete) {
        var run = test.runId();
        var coll = new Mongo.Collection(
          'livedata_update_result_' + run,
          collectionOptions
        );

        await coll.insertAsync({ foo: 'bar' });
        await coll.insertAsync({ foo: 'baz' });
        test.equal(
          await coll.updateAsync({}, { $set: { foo: 'qux' } }, { multi: true }),
          2
        );
        const result = await coll.updateAsync(
          {},
          { $set: { foo: 'quux' } },
          { multi: true }
        );
        test.equal(result, 2);
        onComplete();
      }
    );

    Tinytest.addAsync(
      'mongo-livedata - remove return values, ' + idGeneration,
      async function(test, onComplete) {
        const run = test.runId();
        const coll = new Mongo.Collection(
          'livedata_update_result_' + run,
          collectionOptions
        );

        await coll.insertAsync({ foo: 'bar' });
        await coll.insertAsync({ foo: 'baz' });
        test.equal(await coll.removeAsync({}), 2);
        await coll.insertAsync({ foo: 'bar' });
        await coll.insertAsync({ foo: 'baz' });
        const result = await coll.removeAsync({});
        test.equal(result, 2);
      }
    );


    Tinytest.addAsync(
      'mongo-livedata - id-based invalidation, ' + idGeneration,
      async function(test, onComplete) {
        var run = test.runId();
        var coll = new Mongo.Collection(
          'livedata_invalidation_collection_' + run,
          collectionOptions
        );

        coll.allow({
          updateAsync: function() {
            return true;
          },
          removeAsync: function() {
            return true;
          },
        });

        const id1 = await coll.insertAsync({ x: 42, is1: true });
        const id2 = await coll.insertAsync({ x: 50, is2: true });

        let polls = {};
        const handlesToStop = [];
        const observe = async function(name, query) {
          const handle = await coll.find(query).observeChanges({
            // Make sure that we only poll on invalidation, not due to time, and
            // keep track of when we do. Note: this option disables the use of
            // oplogs (which admittedly is somewhat irrelevant to this feature).
            _testOnlyPollCallback: function() {
              polls[name] = name in polls ? polls[name] + 1 : 1;
            },
          });
          handlesToStop.push(handle);
        };

        await observe('all', {});
        await observe('id1Direct', id1);
        await observe('id1InQuery', { _id: id1, z: null });
        await observe('id2Direct', id2);
        await observe('id2InQuery', { _id: id2, z: null });
        await observe('bothIds', { _id: { $in: [id1, id2] } });

        const resetPollsAndRunInFence = async function(f) {
          polls = {};
          await runInFence(f);
        };

        // Update id1 directly. This should poll all but the "id2" queries. "all"
        // and "bothIds" increment by 2 because they are looking at both.
        await resetPollsAndRunInFence(async function() {
          await coll.updateAsync(id1, { $inc: { x: 1 } });
        });
        test.equal(polls, { all: 1, id1Direct: 1, id1InQuery: 1, bothIds: 1 });

        // Update id2 using a funny query. This should poll all but the "id1"
        // queries.
        await resetPollsAndRunInFence(async function() {
          await coll.updateAsync({ _id: id2, q: null }, { $inc: { x: 1 } });
        });
        test.equal(polls, { all: 1, id2Direct: 1, id2InQuery: 1, bothIds: 1 });

        // Update both using a $in query. Should poll each of them exactly once.
        await resetPollsAndRunInFence(async function() {
          await coll.updateAsync(
            { _id: { $in: [id1, id2] }, q: null },
            { $inc: { x: 1 } }
          );
        });
        test.equal(polls, {
          all: 1,
          id1Direct: 1,
          id1InQuery: 1,
          id2Direct: 1,
          id2InQuery: 1,
          bothIds: 1,
        });

        for (const h of handlesToStop) {
          await h.stop();
        }
        onComplete();
      }
    );

    Tinytest.addAsync(
      'mongo-livedata - upsert error parse, ' + idGeneration,
      async function(test) {
        const run = test.runId();
        const coll = new Mongo.Collection(
          'livedata_upsert_errorparse_collection_' + run,
          collectionOptions
        );

        await coll.insertAsync({ _id: 'foobar', foo: 'bar' });
        let err;
        try {
          await coll.updateAsync({ foo: 'bar' }, { _id: 'cowbar' });
        } catch (e) {
          err = e;
        }
        test.isTrue(err);
        test.isTrue(MongoInternals.Connection._isCannotChangeIdError(err));

        try {
          await coll.insertAsync({ _id: 'foobar' });
        } catch (e) {
          err = e;
        }
        test.isTrue(err);
        // duplicate id error is not same as change id error
        test.isFalse(MongoInternals.Connection._isCannotChangeIdError(err));
      }
    );

  } // end Meteor.isServer

// This test is duplicated below (with some changes) for async upserts that go
// over the network.
  Meteor.isServer ? [true, false] : [true].forEach(function(minimongo) {
    [true, false].forEach(function(useUpdate) {
      [true, false].forEach(function(useDirectCollection) {
        Tinytest.addAsync(
          'mongo-livedata - ' +
            (useUpdate ? 'update ' : '') +
            'upsert' +
            (minimongo ? ' minimongo' : '') +
            (useDirectCollection ? ' direct collection ' : '') +
            ', ' +
            idGeneration,
          async function(test) {
            const run = test.runId();
            let options = collectionOptions;
            // We don't get ids back when we use update() to upsert, or when we are
            // directly calling MongoConnection.upsert().
            var skipIds = useUpdate || (!minimongo && useDirectCollection);
            if (minimongo)
              options = Object.assign({}, collectionOptions, { connection: null });
            var coll = new Mongo.Collection(
              'livedata_upsert_collection_' +
                run +
                (useUpdate ? '_update_' : '') +
                (minimongo ? '_minimongo_' : '') +
                (useDirectCollection ? '_direct_' : '') +
                '',
              options
            );
            if (useDirectCollection) coll = coll._collection;

            const result1 = await upsert(
              coll,
              useUpdate,
              { foo: 'bar' },
              { foo: 'bar' }
            );
            test.equal(result1.numberAffected, 1);
            if (!skipIds) test.isTrue(result1.insertedId);
            compareResults(test, skipIds, await coll.find().fetchAsync(), [
              { foo: 'bar', _id: result1.insertedId },
            ]);

            const result2 = await upsert(
              coll,
              useUpdate,
              { foo: 'bar' },
              { foo: 'baz' }
            );
            test.equal(result2.numberAffected, 1);
            if (!skipIds) test.isFalse(result2.insertedId);
            compareResults(test, skipIds, await coll.find().fetchAsync(), [
              { foo: 'baz', _id: result1.insertedId },
            ]);

            await coll.removeAsync({});

            // Test values that require transformation to go into Mongo:

            const t1 = new Mongo.ObjectID();
            const t2 = new Mongo.ObjectID();
            const result3 = await upsert(
              coll,
              useUpdate,
              { foo: t1 },
              { foo: t1 }
            );
            test.equal(result3.numberAffected, 1);
            if (!skipIds) test.isTrue(result3.insertedId);
            compareResults(test, skipIds, await coll.find().fetchAsync(), [
              { foo: t1, _id: result3.insertedId },
            ]);

            const result4 = await upsert(
              coll,
              useUpdate,
              { foo: t1 },
              { foo: t2 }
            );
            test.equal(result2.numberAffected, 1);
            if (!skipIds) test.isFalse(result2.insertedId);
            compareResults(test, skipIds, await coll.find().fetchAsync(), [
              { foo: t2, _id: result3.insertedId },
            ]);

            await coll.removeAsync({});

            // Test modification by upsert

            var result5 = await upsert(
              coll,
              useUpdate,
              { name: 'David' },
              { $set: { foo: 1 } }
            );
            test.equal(result5.numberAffected, 1);
            if (!skipIds) test.isTrue(result5.insertedId);
            var davidId = result5.insertedId;
            compareResults(test, skipIds, await coll.find().fetchAsync(), [
              { name: 'David', foo: 1, _id: davidId },
            ]);

            await test.throwsAsync(async function() {
              // test that bad modifier fails fast
              await upsert(
                coll,
                useUpdate,
                { name: 'David' },
                { $blah: { foo: 2 } }
              );
            });

            const result6 = await upsert(
              coll,
              useUpdate,
              { name: 'David' },
              { $set: { foo: 2 } }
            );
            test.equal(result6.numberAffected, 1);
            if (!skipIds) test.isFalse(result6.insertedId);
            compareResults(test, skipIds, await coll.find().fetchAsync(), [
              { name: 'David', foo: 2, _id: result5.insertedId },
            ]);

            const emilyId = await coll.insertAsync({ name: 'Emily', foo: 2 });
            compareResults(test, skipIds, await coll.find().fetchAsync(), [
              { name: 'David', foo: 2, _id: davidId },
              { name: 'Emily', foo: 2, _id: emilyId },
            ]);

            // multi update by upsert
            const result7 = await upsert(
              coll,
              useUpdate,
              { foo: 2 },
              { $set: { bar: 7 }, $setOnInsert: { name: 'Fred', foo: 2 } },
              { multi: true }
            );
            test.equal(result7.numberAffected, 2);
            if (!skipIds) test.isFalse(result7.insertedId);
            compareResults(test, skipIds, await coll.find().fetchAsync(), [
              { name: 'David', foo: 2, bar: 7, _id: davidId },
              { name: 'Emily', foo: 2, bar: 7, _id: emilyId },
            ]);

            // insert by multi upsert
            const result8 = await upsert(
              coll,
              useUpdate,
              { foo: 3 },
              { $set: { bar: 7 }, $setOnInsert: { name: 'Fred', foo: 2 } },
              { multi: true }
            );
            test.equal(result8.numberAffected, 1);
            if (!skipIds) test.isTrue(result8.insertedId);
            var fredId = result8.insertedId;
            compareResults(test, skipIds, await coll.find().fetchAsync(), [
              { name: 'David', foo: 2, bar: 7, _id: davidId },
              { name: 'Emily', foo: 2, bar: 7, _id: emilyId },
              { name: 'Fred', foo: 2, bar: 7, _id: fredId },
            ]);

            // test `insertedId` option
            const result9 = await upsert(
              coll,
              useUpdate,
              { name: 'Steve' },
              { name: 'Steve' },
              { insertedId: 'steve' }
            );
            test.equal(result9.numberAffected, 1);
            if (!skipIds) test.equal(result9.insertedId, 'steve');
            compareResults(test, skipIds, await coll.find().fetchAsync(), [
              { name: 'David', foo: 2, bar: 7, _id: davidId },
              { name: 'Emily', foo: 2, bar: 7, _id: emilyId },
              { name: 'Fred', foo: 2, bar: 7, _id: fredId },
              { name: 'Steve', _id: 'steve' },
            ]);
            test.isTrue(await coll.findOneAsync('steve'));
            test.isFalse(await coll.findOneAsync('fred'));

            // Test $ operator in selectors.

            const result10 = await upsert(
              coll,
              useUpdate,
              { $or: [{ name: 'David' }, { name: 'Emily' }] },
              { $set: { foo: 3 } },
              { multi: true }
            );
            test.equal(result10.numberAffected, 2);
            if (!skipIds) test.isFalse(result10.insertedId);
            compareResults(
              test,
              skipIds,
              [
                await coll.findOneAsync({ name: 'David' }),
                await coll.findOneAsync({ name: 'Emily' }),
              ],
              [
                { name: 'David', foo: 3, bar: 7, _id: davidId },
                { name: 'Emily', foo: 3, bar: 7, _id: emilyId },
              ]
            );

            const result11 = await upsert(
              coll,
              useUpdate,
              {
                name: 'Charlie',
                $or: [{ foo: 2 }, { bar: 7 }],
              },
              { $set: { foo: 3 } }
            );
            test.equal(result11.numberAffected, 1);
            if (!skipIds) test.isTrue(result11.insertedId);
            const charlieId = result11.insertedId;
            compareResults(
              test,
              skipIds,
              await coll.find({ name: 'Charlie' }).fetchAsync(),
              [{ name: 'Charlie', foo: 3, _id: charlieId }]
            );
          }
        );
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
  Meteor.isServer ? [false] : [true, false].forEach(function(useNetwork) {
    useNetwork ? [false] : [true, false].forEach(function(useDirectCollection) {
      [true, false].forEach(function(useUpdate) {
        Tinytest.addAsync(
          asyncUpsertTestName(
            useNetwork,
            useDirectCollection,
            useUpdate,
            idGeneration
          ),
          async function(test, onComplete) {
            let resolver;
            const promise = new Promise(r => resolver = r);

            var coll;
            var run = test.runId();
            var collName =
              'livedata_upsert_collection_' +
              run +
              (useUpdate ? '_update_' : '') +
              (useNetwork ? '_network_' : '') +
              (useDirectCollection ? '_direct_' : '');

            const next0 = async function() {
              // Test starts here.
              await upsert(
                coll,
                useUpdate,
                { _id: 'foo' },
                { _id: 'foo', foo: 'bar' },
                next1
              );
            };

            if (useNetwork) {
              Meteor.call(
                'createInsecureCollection',
                collName,
                collectionOptions
              );
              coll = new Mongo.Collection(collName, collectionOptions);
              Meteor.subscribe('c-' + collName, next0);
            } else {
              var opts = _.clone(collectionOptions);
              if (Meteor.isClient) opts.connection = null;
              coll = new Mongo.Collection(collName, opts);
              if (useDirectCollection) coll = coll._collection;
            }

            var t1, t2, result2;
            var next2 = async function(err, result) {
              result2 = result;
              test.equal(result2.numberAffected, 1);
              if (!useUpdate) test.isFalse(result2.insertedId);
              compareResults(test, useUpdate, await coll.find().fetchAsync(), [
                { foo: 'baz', _id: result1.insertedId },
              ]);
              await coll.removeAsync({ _id: 'foo' });
              compareResults(test, useUpdate, await coll.find().fetchAsync(), []);

              // Test values that require transformation to go into Mongo:

              t1 = new Mongo.ObjectID();
              t2 = new Mongo.ObjectID();
              await upsert(
                coll,
                useUpdate,
                { _id: t1 },
                { _id: t1, foo: 'bar' },
                next3
              );
            };

            var result1;
            var next1 = async function(err, result) {
              result1 = result;
              test.equal(result1.numberAffected, 1);
              if (!useUpdate) {
                test.isTrue(result1.insertedId);
                test.equal(result1.insertedId, 'foo');
              }
              compareResults(test, useUpdate, await coll.find().fetchAsync(), [
                { foo: 'bar', _id: 'foo' },
              ]);

              await upsert(coll, useUpdate, { _id: 'foo' }, { foo: 'baz' }, next2);

            };
            if (!useNetwork) {
              await next0();
            }

            var result3;
            var next3 = async function(err, result) {
              result3 = result;
              test.equal(result3.numberAffected, 1);
              if (!useUpdate) {
                test.isTrue(result3.insertedId);
                test.equal(t1, result3.insertedId);
              }
              compareResults(test, useUpdate, await coll.find().fetchAsync(), [
                { _id: t1, foo: 'bar' },
              ]);

              await upsert(coll, useUpdate, { _id: t1 }, { foo: t2 }, next4);
            };

            const next4 = async function(err, result4) {
              test.equal(result2.numberAffected, 1);
              if (!useUpdate) test.isFalse(result2.insertedId);
              compareResults(test, useUpdate, await coll.find().fetchAsync(), [
                { foo: t2, _id: result3.insertedId },
              ]);

              await coll.removeAsync({ _id: t1 });

              // Test modification by upsert
              await upsert(
                coll,
                useUpdate,
                { _id: 'David' },
                { $set: { foo: 1 } },
                next5
              );
            };

            var result5;
            var next5 = async function(err, result) {
              result5 = result;
              test.equal(result5.numberAffected, 1);
              if (!useUpdate) {
                test.isTrue(result5.insertedId);
                test.equal(result5.insertedId, 'David');
              }
              var davidId = result5.insertedId;
              compareResults(test, useUpdate, await coll.find().fetchAsync(), [
                { foo: 1, _id: davidId },
              ]);

              if (!Meteor.isClient && useDirectCollection) {
                // test that bad modifier fails
                // The stub throws an exception about the invalid modifier, which
                // livedata logs (so we suppress it).
                Meteor._suppress_log(1);
                await upsert(
                  coll,
                  useUpdate,
                  { _id: 'David' },
                  { $blah: { foo: 2 } },
                  async function(err) {
                    if (!(Meteor.isClient && useDirectCollection))
                      test.isTrue(err);
                    await upsert(
                      coll,
                      useUpdate,
                      { _id: 'David' },
                      { $set: { foo: 2 } },
                      next6
                    );
                  }
                );
              } else {
                // XXX skip this test for now for LocalCollection; the fact that
                // we're in a nested sequence of callbacks means we're inside a
                // Meteor.defer, which means the exception just gets
                // logged. Something should be done about this at some point?  Maybe
                // LocalCollection callbacks don't really have to be deferred.
                await upsert(
                  coll,
                  useUpdate,
                  { _id: 'David' },
                  { $set: { foo: 2 } },
                  next6
                );
              }
            };

            var result6;
            var next6 = async function(err, result) {
              result6 = result;
              test.equal(result6.numberAffected, 1);
              if (!useUpdate) test.isFalse(result6.insertedId);
              compareResults(test, useUpdate, await coll.find().fetchAsync(), [
                { _id: 'David', foo: 2 },
              ]);

              var emilyId = await coll.insertAsync({ _id: 'Emily', foo: 2 });
              compareResults(test, useUpdate, await coll.find().fetchAsync(), [
                { _id: 'David', foo: 2 },
                { _id: 'Emily', foo: 2 },
              ]);

              // multi update by upsert.
              // We can't actually update multiple documents since we have to do it by
              // id, but at least make sure the multi flag doesn't mess anything up.
              await upsert(
                coll,
                useUpdate,
                { _id: 'Emily' },
                { $set: { bar: 7 }, $setOnInsert: { name: 'Fred', foo: 2 } },
                { multi: true },
                next7
              );
            };

            var result7;
            var next7 = async function(err, result) {
              result7 = result;
              test.equal(result7.numberAffected, 1);
              if (!useUpdate) test.isFalse(result7.insertedId);
              compareResults(test, useUpdate, await coll.find().fetchAsync(), [
                { _id: 'David', foo: 2 },
                { _id: 'Emily', foo: 2, bar: 7 },
              ]);

              // insert by multi upsert
              await upsert(
                coll,
                useUpdate,
                { _id: 'Fred' },
                { $set: { bar: 7 }, $setOnInsert: { name: 'Fred', foo: 2 } },
                { multi: true },
                next8
              );
            };

            var result8;
            var next8 = async function(err, result) {
              result8 = result;

              test.equal(result8.numberAffected, 1);
              if (!useUpdate) {
                test.isTrue(result8.insertedId);
                test.equal(result8.insertedId, 'Fred');
              }
              var fredId = result8.insertedId;
              compareResults(test, useUpdate, await coll.find().fetchAsync(), [
                { _id: 'David', foo: 2 },
                { _id: 'Emily', foo: 2, bar: 7 },
                { name: 'Fred', foo: 2, bar: 7, _id: fredId },
              ]);
              resolver()
            };
            await promise;
          }
        );
      });
    });
  });

  if (Meteor.isClient) {
    Tinytest.addAsync(
      'mongo-livedata - async update/remove return values over network ' +
        idGeneration,
      function(test, onComplete) {
        var coll;
        var run = test.runId();
        var collName = 'livedata_upsert_collection_' + run;
        Meteor.call('createInsecureCollection', collName, collectionOptions);
        coll = new Mongo.Collection(collName, collectionOptions);
        Meteor.subscribe('c-' + collName, async function() {
          await coll.insertAsync({ _id: 'foo' });
          await coll.insertAsync({ _id: 'bar' });
          await coll
            .updateAsync({ _id: 'foo' }, { $set: { foo: 1 } }, { multi: true })
            .then(function(result) {
              test.equal(result, 1);
              coll
                .updateAsync({ _id: 'foo' }, { _id: 'foo', foo: 2 })
                .then(function(result) {
                  test.equal(result, 1);
                  coll
                    .updateAsync({ _id: 'baz' }, { $set: { foo: 1 } })
                    .then(function(result) {
                      test.equal(result, 0);
                      coll.removeAsync({ _id: 'foo' }).then(function(result) {
                        test.equal(result, 1);
                        coll.removeAsync({ _id: 'baz' }).then(function(result) {
                          test.equal(result, 0);
                          onComplete();
                        });
                      });
                    });
                });
            });
        });
      }
    );
  }

// Runs a method and its stub which do some upserts. The method throws an error
// if we don't get the right return values.
  if (Meteor.isClient) {
    [true, false].forEach(function(useUpdate) {
      Tinytest.addAsync(
        'mongo-livedata - ' +
          (useUpdate ? 'update ' : '') +
          'upsert in method, ' +
          idGeneration,
        async function(test, onComplete) {
          var run = test.runId();
          upsertTestMethodColl = new Mongo.Collection(
            upsertTestMethod + '_collection_' + run,
            collectionOptions
          );
          var m = {};
          delete Meteor.connection._methodHandlers[upsertTestMethod];
          m[upsertTestMethod] = async function(run, useUpdate, options) {
            await upsertTestMethodImpl(upsertTestMethodColl, useUpdate, test);
          };
          Meteor.methods(m);
          await Meteor.callAsync(
            upsertTestMethod,
            run,
            useUpdate,
            collectionOptions
          );
        }
      );
    });
  }

  Meteor.isServer ? [true, false] : [true].forEach(function(minimongo) {
    [true, false].forEach(function(useUpdate) {
      Tinytest.addAsync(
        'mongo-livedata - ' +
          (useUpdate ? 'update ' : '') +
          'upsert by id' +
          (minimongo ? ' minimongo' : '') +
          ', ' +
          idGeneration,
        async function(test) {
          var run = test.runId();
          var options = collectionOptions;
          if (minimongo)
            options = Object.assign({}, collectionOptions, { connection: null });
          var coll = new Mongo.Collection(
            'livedata_upsert_by_id_collection_' + run,
            options
          );

          var ret;
          ret = await upsert(coll, useUpdate, { _id: 'foo' }, { $set: { x: 1 } });
          test.equal(ret.numberAffected, 1);
          if (!useUpdate) test.equal(ret.insertedId, 'foo');
          compareResults(test, useUpdate, await coll.find().fetchAsync(), [
            { _id: 'foo', x: 1 },
          ]);

          ret = await upsert(coll, useUpdate, { _id: 'foo' }, { $set: { x: 2 } });
          test.equal(ret.numberAffected, 1);
          if (!useUpdate) test.isFalse(ret.insertedId);
          compareResults(test, useUpdate, await coll.find().fetchAsync(), [
            { _id: 'foo', x: 2 },
          ]);

          ret = await upsert(coll, useUpdate, { _id: 'bar' }, { $set: { x: 1 } });
          test.equal(ret.numberAffected, 1);
          if (!useUpdate) test.equal(ret.insertedId, 'bar');
          compareResults(test, useUpdate, await coll.find().fetchAsync(), [
            { _id: 'foo', x: 2 },
            { _id: 'bar', x: 1 },
          ]);

          await coll.removeAsync({});
          ret = await upsert(coll, useUpdate, { _id: 'traq' }, { x: 1 });

          test.equal(ret.numberAffected, 1);
          var myId = ret.insertedId;
          if (useUpdate) {
            myId = (await coll.findOneAsync())._id;
          }
          // Starting with Mongo 2.6, upsert with entire document takes _id from the
          // query, so the above upsert actually does an insert with _id traq
          // instead of a random _id.  Whenever we are using our simulated upsert,
          // we have this behavior (whether running against Mongo 2.4 or 2.6).
          // https://jira.mongodb.org/browse/SERVER-5289
          test.equal(myId, 'traq');
          compareResults(test, useUpdate, await coll.find().fetchAsync(), [
            { x: 1, _id: 'traq' },
          ]);

          // this time, insert as _id 'traz'
          ret = await upsert(coll, useUpdate, { _id: 'traz' }, { _id: 'traz', x: 2 });
          test.equal(ret.numberAffected, 1);
          if (!useUpdate) test.equal(ret.insertedId, 'traz');
          compareResults(test, useUpdate, await coll.find().fetchAsync(), [
            { x: 1, _id: 'traq' },
            { x: 2, _id: 'traz' },
          ]);

          // now update _id 'traz'
          ret = await upsert(coll, useUpdate, { _id: 'traz' }, { x: 3 });
          test.equal(ret.numberAffected, 1);
          test.isFalse(ret.insertedId);
          compareResults(test, useUpdate, await coll.find().fetchAsync(), [
            { x: 1, _id: 'traq' },
            { x: 3, _id: 'traz' },
          ]);

          // now update, passing _id (which is ok as long as it's the same)
          ret = await upsert(coll, useUpdate, { _id: 'traz' }, { _id: 'traz', x: 4 });
          test.equal(ret.numberAffected, 1);
          test.isFalse(ret.insertedId);
          compareResults(test, useUpdate, await coll.find().fetchAsync(), [
            { x: 1, _id: 'traq' },
            { x: 4, _id: 'traz' },
          ]);
        }
      );
    });
  });

});  // end idGeneration parametrization

Tinytest.add('mongo-livedata - rewrite selector', function(test) {
  test.equal(Mongo.Collection._rewriteSelector('foo'), { _id: 'foo' });

  var oid = new Mongo.ObjectID();
  test.equal(Mongo.Collection._rewriteSelector(oid), { _id: oid });

  test.matches(
    Mongo.Collection._rewriteSelector({ _id: null })._id,
    /^\S+$/,
    'Passing in a falsey selector _id should return a selector with a new ' +
      'auto-generated _id string'
  );
  test.equal(
    Mongo.Collection._rewriteSelector({ _id: null }, { fallbackId: oid }),
    { _id: oid },
    'Passing in a falsey selector _id and a fallback ID should return a ' +
      'selector with an _id using the fallback ID'
  );
});

testAsyncMulti("mongo-livedata - specified _id", [
  function (test, expect) {
    this.collectionName = Random.id();
    if (Meteor.isClient) {
      Meteor.call('createInsecureCollection', this.collectionName);
      Meteor.subscribe('c-' + this.collectionName);
    }
  },
  async function (test) {
    const expectError = async function (err, result) {
      test.isTrue(err);

      const doc = await coll.findOneAsync();
      test.equal(doc.name, 'foo');
    };
    const coll = new Mongo.Collection(this.collectionName);
    const id = await coll.insertAsync({ _id: 'foo', name: 'foo' });
    test.equal(id, 'foo');
    const doc = await coll.findOneAsync();
    test.equal(doc._id, 'foo');
    Meteor._suppress_log(1);
    await coll.insertAsync({ _id: 'foo', name: 'bar' }).catch(expectError);
  },
]);


// Consistent id generation tests
async function collectionInsert (test, expect, coll, index) {
  const id = await coll.insertAsync({name: "foo"});
  const o = await coll.findOneAsync(id) || {};
  test.isTrue(isObject(o));
  test.equal(o.name, 'foo');
}

async function collectionUpsert(test, expect, coll, index) {
  const upsertId = '123456' + index;

  const result = await coll.upsertAsync(upsertId, { $set: { name: 'foo' } });
  test.equal(result.insertedId, upsertId);
  test.equal(result.numberAffected, 1);

  const o = await coll.findOneAsync(upsertId);
  test.isTrue(isObject(o));
  test.equal(o.name, 'foo');
}

async function collectionUpsertExisting(test, expect, coll, index) {
  const id = await coll.insertAsync({ name: 'foo' });

  const o = await coll.findOneAsync(id);
  test.isTrue(isObject(o));

  const result = await coll.upsertAsync(id, { $set: { name: 'bar' } });
  test.equal(result.insertedId, id);
  test.equal(result.numberAffected, 1);

  const ob = await coll.findOneAsync(id);
  test.isTrue(isObject(ob));
  test.equal(ob.name, 'bar');
}

async function functionCallsInsert(test, expect, coll, index) {
  const ids = await Meteor.callAsync(
    'insertObjects',
    coll._name,
    { name: 'foo' },
    1,
  );

  test.notEqual((INSERTED_IDS[coll._name] || []).length, 0);
  var stubId = INSERTED_IDS[coll._name][index];

  test.equal(ids.length, 1);
  test.equal(ids[0], stubId);

  const o = await coll.findOneAsync(stubId);
  test.isTrue(isObject(o));
  test.equal(o.name, 'foo');
}

async function functionCallsUpsert(test, expect, coll, index) {
  const upsertId = '123456' + index;
  const result = await Meteor.callAsync(
    'upsertObject',
    coll._name,
    upsertId,
    {
      $set: { name: 'foo' },
    }
  );
  test.equal(result.insertedId, upsertId);
  test.equal(result.numberAffected, 1);

  const o = await coll.findOneAsync(upsertId);
  test.isTrue(isObject(o));
  test.equal(o.name, 'foo');
}

async function functionCallsUpsertExisting(test, expect, coll, index) {
  const id = await coll.insertAsync({ name: 'foo' });

  const o = await coll.findOneAsync(id);
  test.notEqual(null, o);
  test.equal(o.name, 'foo');

  const result = await Meteor.callAsync(
    'upsertObject',
    coll._name,
    id,
    {
      $set: { name: 'bar' },
    }
  );
  test.equal(result.numberAffected, 1);
  test.equal(result.insertedId, undefined);

  const ob = await coll.findOneAsync(id);
  test.isTrue(isObject(ob));
  test.equal(ob.name, 'bar');
}

async function functionCalls3Inserts(test, expect, coll, index) {
  const ids = await Meteor.callAsync(
    'insertObjects',
    coll._name,
    { name: 'foo' },
    3
  );
  test.notEqual((INSERTED_IDS[coll._name] || []).length, 0);
  test.equal(ids.length, 3);

  for (var i = 0; i < 3; i++) {
    var stubId = INSERTED_IDS[coll._name][3 * index + i];
    test.equal(ids[i], stubId);

    var o = await coll.findOneAsync(stubId);
    test.isTrue(isObject(o));
    test.equal(o.name, 'foo');
  }
}

async function functionChainInsert(test, expect, coll, index) {
  const ids = await Meteor.callAsync(
    'doMeteorCall',
    'insertObjects',
    coll._name,
    { name: 'foo' },
    1,
  );
  test.notEqual((INSERTED_IDS[coll._name] || []).length, 0);
  var stubId = INSERTED_IDS[coll._name][index];

  test.equal(ids.length, 1);
  test.equal(ids[0], stubId);

  await Meteor._sleepForMs(100);

  var o = await coll.findOneAsync(stubId);
  test.isTrue(isObject(o));
  test.equal(o.name, 'foo');
}

async function functionChain2Insert(test, expect, coll, index) {
  const ids = await Meteor.callAsync(
    'doMeteorCall',
    'doMeteorCall',
    'insertObjects',
    coll._name,
    { name: 'foo' },
    1
  );
  test.notEqual((INSERTED_IDS[coll._name] || []).length, 0);
  var stubId = INSERTED_IDS[coll._name][index];

  test.equal(ids.length, 1);
  test.equal(ids[0], stubId);

  await Meteor._sleepForMs(100);

  const o = await coll.findOneAsync(stubId);
  test.isTrue(isObject(o));
  test.equal(o.name, 'foo');
}

async function functionChain2Upsert(test, expect, coll, index) {
  const upsertId = '123456' + index;
  const result = await Meteor.callAsync(
    'doMeteorCall',
    'doMeteorCall',
    'upsertObject',
    coll._name,
    upsertId,
    { $set: { name: 'foo' } }
  );
  test.equal(result.insertedId, upsertId);
  test.equal(result.numberAffected, 1);
  await Meteor._sleepForMs(100);
  const o = await coll.findOneAsync(upsertId);
  test.isTrue(isObject(o));
  test.equal(o.name, 'foo');
}

Object.entries({
  collectionInsert: collectionInsert,
  collectionUpsert: collectionUpsert,
  functionCallsInsert: functionCallsInsert,
  functionCallsUpsert: functionCallsUpsert,
  functionCallsUpsertExisting: functionCallsUpsertExisting,
  functionCalls3Insert: functionCalls3Inserts,
  functionChainInsert: functionChainInsert,
  functionChain2Insert: functionChain2Insert,
  functionChain2Upsert: functionChain2Upsert
}).forEach(function([name, fn]) {
  [1, 3].forEach(function(repetitions) {
      [1, 3].forEach(function(collectionCount) {
          ['STRING', 'MONGO'].forEach(function(idGeneration) {

              testAsyncMulti('mongo-livedata - consistent _id generation ' + name + ', ' + repetitions + ' repetitions on ' + collectionCount + ' collections, idGeneration=' + idGeneration, [function(test, expect) {
                  var collectionOptions = {
                      idGeneration: idGeneration
                  };

                  var cleanups = this.cleanups = [];
                  this.collections = times(collectionCount, function() {
                      var collectionName = "consistentid_" + Random.id();
                      if (Meteor.isClient) {
                          Meteor.call('createInsecureCollection', collectionName, collectionOptions);
                          Meteor.subscribe('c-' + collectionName, expect());
                          cleanups.push(function(expect) {
                              Meteor.call('dropInsecureCollection', collectionName, expect(function() {}));
                          });
                      }

                      var collection = new Mongo.Collection(collectionName, collectionOptions);
                      if (Meteor.isServer) {
                          cleanups.push(function() {
                              collection._dropCollection();
                          });
                      }
                      COLLECTIONS[collectionName] = collection;
                      return collection;
                  });
              }, function(test, expect) {
                  // now run the actual test
                  for (var i = 0; i < repetitions; i++) {
                      for (var j = 0; j < collectionCount; j++) {
                          fn(test, expect, this.collections[j], i);
                      }
                  }
              }, function(test, expect) {
                  // Run any registered cleanup functions (e.g. to drop collections)
                  this.cleanups.forEach(function(cleanup) {
                      cleanup(expect);
                  });
              }]);

          });
      });
  });
});




testAsyncMulti('mongo-livedata - empty string _id', [
  async function(test) {
    var self = this;
    self.collectionName = Random.id();
    if (Meteor.isClient) {
      Meteor.call('createInsecureCollection', self.collectionName);
      Meteor.subscribe('c-' + self.collectionName);
    }
    self.coll = new Mongo.Collection(self.collectionName);
    try {
      await self.coll.insertAsync({ _id: '', f: 'foo' });
      test.fail('Insert with an empty _id should fail');
    } catch (e) {
      // ok
    }
    const res = await self.coll.insertAsync(
      { _id: 'realid', f: 'bar' },
    );
    test.equal(res, 'realid');
  },
  async function(test, expect) {
    var self = this;
    var docs = await self.coll.find().fetchAsync();
    test.equal(docs, [{ _id: 'realid', f: 'bar' }]);
  },
  async function(test, expect) {
    var self = this;
    if (Meteor.isServer) {
      await self.coll._collection.insertAsync({ _id: '', f: 'baz' });
      test.equal((await self.coll.find().fetchAsync()).length, 2);
    }
  },
]);


if (Meteor.isServer) {
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

    async function (test, expect) {
      var self = this;
      if (self.miniC) {
        self.obs = await self.miniC.find().observeChanges({
          added: async function (id, fields) {
            self.events.push({evt: "a", id: id});
            await Meteor._sleepForMs(200);
            self.events.push({evt: "b", id: id});
            if (! self.two) {
              self.two = await self.C.insertAsync({});
            }
          }
        });
        self.one = await self.C.insertAsync({});
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

Tinytest.addAsync(
  'mongo-livedata - local collections with different connections',
  async function(test, onComplete) {
    var cname = Random.id();
    var cname2 = Random.id();
    var coll1 = new Mongo.Collection(cname);
    var doc = { foo: 'bar' };
    var coll2 = new Mongo.Collection(cname2, { connection: null });
    await coll2.insertAsync(doc);
    test.equal(await coll1.find(doc).countAsync(), 0);
    test.equal(await coll2.find(doc).countAsync(), 1);
  }
);

if (Meteor.isClient) {
  Tinytest.addAsync(
    'mongo-livedata - local collection with null connection, w/ callback',
    function(test, onComplete) {
      const cname = Random.id();
      const coll1 = new Mongo.Collection(cname, { connection: null });
      const doc = { foo: 'bar' };
      const docId = coll1.insert(doc, function(err, id) {
        test.equal(docId, id);
        test.equal(coll1.findOne(doc)._id, id);
        onComplete();
      });
    }
  );
}

Tinytest.addAsync(
  'mongo-livedata - local collection with null connection, w/o callback',
  async function(test, onComplete) {
    const cname = Random.id();
    const coll1 = new Mongo.Collection(cname, { connection: null });
    const doc = { foo: 'bar' };
    const docId = await coll1.insertAsync(doc);
    test.equal((await coll1.findOneAsync(doc))._id, docId);
  }
);

testAsyncMulti('mongo-livedata - update handles $push with $each correctly', [
  async function(test, expect) {
    var self = this;
    var collectionName = Random.id();
    if (Meteor.isClient) {
      Meteor.call('createInsecureCollection', collectionName);
      Meteor.subscribe('c-' + collectionName);
    }

    self.collection = new Mongo.Collection(collectionName);

    self.id = await self.collection.insertAsync(
      {
        name: 'jens',
        elements: ['X', 'Y'],
      },
      { returnServerResultPromise: true }
    );
  },
  async function(test, expect) {
    var self = this;
    await self.collection.updateAsync(
      self.id,
      {
        $push: {
          elements: {
            $each: ['A', 'B', 'C'],
            $slice: -4,
          },
        },
      },
      {returnServerResultPromise: true}
    );
    test.equal(await self.collection.findOneAsync(self.id), {
      _id: self.id,
      name: 'jens',
      elements: ['Y', 'A', 'B', 'C'],
    });
  },
]);

if (Meteor.isServer) {
  Tinytest.addAsync(
    'mongo-livedata - upsert handles $push with $each correctly',
    async function(test) {
      var collection = new Mongo.Collection(Random.id());

      var result = await collection.upsertAsync(
        { name: 'jens' },
        {
          $push: {
            elements: {
              $each: ['A', 'B', 'C'],
              $slice: -4,
            },
          },
        }
      );

      test.equal(await collection.findOneAsync(result.insertedId), {
        _id: result.insertedId,
        name: 'jens',
        elements: ['A', 'B', 'C'],
      });

      var id = await collection.insertAsync({ name: 'david', elements: ['X', 'Y'] });
      result = await collection.upsertAsync(
        { name: 'david' },
        {
          $push: {
            elements: {
              $each: ['A', 'B', 'C'],
              $slice: -4,
            },
          },
        }
      );

      test.equal(await collection.findOneAsync(id), {
        _id: id,
        name: 'david',
        elements: ['Y', 'A', 'B', 'C'],
      });
    }
  );

  Tinytest.addAsync(
    'mongo-livedata - upsert handles dotted selectors corrrectly',
    async function(test) {
      var collection = new Mongo.Collection(Random.id());

      var result1 = await collection.upsertAsync(
        {
          'subdocument.a': 1,
        },
        {
          $set: { message: 'upsert 1' },
        }
      );

      test.equal(await collection.findOneAsync(result1.insertedId), {
        _id: result1.insertedId,
        subdocument: { a: 1 },
        message: 'upsert 1',
      });

      var result2 = await collection.upsertAsync(
        {
          'subdocument.a': 1,
        },
        {
          $set: { message: 'upsert 2' },
        }
      );

      test.equal(result2, { numberAffected: 1 });

      test.equal(await collection.findOneAsync(result1.insertedId), {
        _id: result1.insertedId,
        subdocument: { a: 1 },
        message: 'upsert 2',
      });

      var result3 = await collection.upsertAsync(
        {
          'subdocument.a.b': 1,
          'subdocument.c': 2,
        },
        {
          $set: { message: 'upsert3' },
        }
      );

      test.equal(await collection.findOneAsync(result3.insertedId), {
        _id: result3.insertedId,
        subdocument: { a: { b: 1 }, c: 2 },
        message: 'upsert3',
      });

      var result4 = await collection.upsertAsync(
        {
          'subdocument.a': 4,
        },
        {
          $set: { 'subdocument.a': 'upsert 4' },
        }
      );

      test.equal(await collection.findOneAsync(result4.insertedId), {
        _id: result4.insertedId,
        subdocument: { a: 'upsert 4' },
      });

      var result5 = await collection.upsertAsync(
        {
          'subdocument.a': 'upsert 4',
        },
        {
          $set: { 'subdocument.a': 'upsert 5' },
        }
      );

      test.equal(result5, { numberAffected: 1 });

      test.equal(await collection.findOneAsync(result4.insertedId), {
        _id: result4.insertedId,
        subdocument: { a: 'upsert 5' },
      });

      var result6 = await collection.upsertAsync(
        {
          'subdocument.a': 'upsert 5',
        },
        {
          $set: { subdocument: 'upsert 6' },
        }
      );

      test.equal(result6, { numberAffected: 1 });

      test.equal(await collection.findOneAsync(result4.insertedId), {
        _id: result4.insertedId,
        subdocument: 'upsert 6',
      });

      var result7 = await collection.upsertAsync(
        {
          'subdocument.a.b': 7,
        },
        {
          $set: {
            'subdocument.a.c': 'upsert7',
          },
        }
      );

      test.equal(await collection.findOneAsync(result7.insertedId), {
        _id: result7.insertedId,
        subdocument: {
          a: { b: 7, c: 'upsert7' },
        },
      });

      var result8 = await collection.upsertAsync(
        {
          'subdocument.a.b': 7,
        },
        {
          $set: {
            'subdocument.a.c': 'upsert8',
          },
        }
      );

      test.equal(result8, { numberAffected: 1 });

      test.equal(await collection.findOneAsync(result7.insertedId), {
        _id: result7.insertedId,
        subdocument: {
          a: { b: 7, c: 'upsert8' },
        },
      });

      var result9 = await collection.upsertAsync(
        {
          'subdocument.a.b': 7,
        },
        {
          $set: {
            'subdocument.a.b': 'upsert9',
          },
        }
      );

      test.equal(result9, { numberAffected: 1 });

      test.equal(await collection.findOneAsync(result7.insertedId), {
        _id: result7.insertedId,
        subdocument: {
          a: { b: 'upsert9', c: 'upsert8' },
        },
      });
    }
  );
}

// This is a VERY white-box test.
Meteor.isServer &&
  Tinytest.addAsync('mongo-livedata - oplog - _disableOplog', async function(test) {
    var collName = Random.id();
    var coll = new Mongo.Collection(collName);
    if (MongoInternals.defaultRemoteCollectionDriver().mongo._oplogHandle) {
      var observeWithOplog = await coll
        .find({ x: 5 })
        .observeChanges({ added: function() {} });
      test.isTrue(observeWithOplog._multiplexer._observeDriver._usesOplog);
      await observeWithOplog.stop();
    }
    var observeWithoutOplog = await coll
      .find({ x: 6 }, { _disableOplog: true })
      .observeChanges({ added: function() {} });
    test.isFalse(observeWithoutOplog._multiplexer._observeDriver._usesOplog);
    await observeWithoutOplog.stop();
  });

Meteor.isServer &&
  Tinytest.addAsync(
    'mongo-livedata - oplog - include selector fields',
    async function(test) {
      var collName = 'includeSelector' + Random.id();
      var coll = new Mongo.Collection(collName);

      var docId = await coll.insertAsync({ a: 1, b: [3, 2], c: 'foo' });
      test.isTrue(docId);

      // Wait until we've processed the insert oplog entry. (If the insert shows up
      // during the observeChanges, the bug in question is not consistently
      // reproduced.) We don't have to do this for polling observe (eg
      // --disable-oplog).
      await waitUntilOplogCaughtUp();

      var output = [];
      var handle = await coll
        .find({ a: 1, b: 2 }, { fields: { c: 1 } })
        .observeChanges({
          added: function(id, fields) {
            output.push(['added', id, fields]);
          },
          changed: function(id, fields) {
            output.push(['changed', id, fields]);
          },
          removed: function(id) {
            output.push(['removed', id]);
          },
        });
      // Initially should match the document.
      test.length(output, 1);
      test.equal(output.shift(), ['added', docId, { c: 'foo' }]);

      // Update in such a way that, if we only knew about the published field 'c'
      // and the changed field 'b' (but not the field 'a'), we would think it didn't
      // match any more.  (This is a regression test for a bug that existed because
      // we used to not use the shared projection in the initial query.)
      await runInFence(async function() {
        await coll.updateAsync(docId, { $set: { 'b.0': 2, c: 'bar' } });
      });
      test.length(output, 1);
      test.equal(output.shift(), ['changed', docId, { c: 'bar' }]);

      handle.stop();
    }
  );

Meteor.isServer &&
  Tinytest.addAsync('mongo-livedata - oplog - transform', async function(test) {
    var collName = 'oplogTransform' + Random.id();
    var coll = new Mongo.Collection(collName);

    var docId = await coll.insertAsync({ a: 25, x: { x: 5, y: 9 } });
    test.isTrue(docId);

    // Wait until we've processed the insert oplog entry. (If the insert shows up
    // during the observeChanges, the bug in question is not consistently
    // reproduced.) We don't have to do this for polling observe (eg
    // --disable-oplog).
    await waitUntilOplogCaughtUp();

    var cursor = coll.find(
      {},
      {
        transform: function(doc) {
          return doc.x;
        },
      }
    );

    var changesOutput = [];
    var changesHandle = await cursor.observeChanges({
      added: function(id, fields) {
        changesOutput.push(['added', fields]);
      },
    });
    // We should get untransformed fields via observeChanges.
    test.length(changesOutput, 1);
    test.equal(changesOutput.shift(), ['added', { a: 25, x: { x: 5, y: 9 } }]);
    await changesHandle.stop();

    var transformedOutput = [];
    var transformedHandle = await cursor.observe({
      added: function(doc) {
        transformedOutput.push(['added', doc]);
      },
    });
    test.length(transformedOutput, 1);
    test.equal(transformedOutput.shift(), ['added', { x: 5, y: 9 }]);
    await transformedHandle.stop();
  });


Meteor.isServer &&
  Tinytest.addAsync('mongo-livedata - oplog - drop collection/db', async function(test) {
    // This test uses a random database, so it can be dropped without affecting
    // anything else.
    var mongodbUri = Npm.require('mongodb-uri');
    var parsedUri = mongodbUri.parse(process.env.MONGO_URL);
    parsedUri.database = 'dropDB' + Random.id();
    var driver = new MongoInternals.RemoteCollectionDriver(
      mongodbUri.format(parsedUri),
      {
        oplogUrl: process.env.MONGO_OPLOG_URL,
      }
    );

    var collName = 'dropCollection' + Random.id();
    var coll = new Mongo.Collection(collName, { _driver: driver });

    var doc1Id = await coll.insertAsync({ a: 'foo', c: 1 });
    var doc2Id = await coll.insertAsync({ b: 'bar' });
    var doc3Id = await coll.insertAsync({ a: 'foo', c: 2 });
    var tmp;

    var output = [];
    var handle = await coll.find({ a: 'foo' }).observeChanges({
      added: function(id, fields) {
        output.push(['added', id, fields]);
      },
      changed: function(id) {
        output.push(['changed']);
      },
      removed: function(id) {
        output.push(['removed', id]);
      },
    });
    test.length(output, 2);
    // make order consistent
    if (output.length === 2 && output[0][1] === doc3Id) {
      tmp = output[0];
      output[0] = output[1];
      output[1] = tmp;
    }
    test.equal(output.shift(), ['added', doc1Id, { a: 'foo', c: 1 }]);
    test.equal(output.shift(), ['added', doc3Id, { a: 'foo', c: 2 }]);

    // Wait until we've processed the insert oplog entry, so that we are in a
    // steady state (and we don't see the dropped docs because we are FETCHING).
    await waitUntilOplogCaughtUp();

    // Drop the collection. Should remove all docs.
    await runInFence(async function() {
      await coll.dropCollectionAsync();
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
    await runInFence(async function() {
      doc4Id = await coll.insertAsync({ a: 'foo', c: 3 });
    });

    test.length(output, 1);
    test.equal(output.shift(), ['added', doc4Id, { a: 'foo', c: 3 }]);

    // XXX: this was intermittently failing for unknown reasons.
    // Now drop the database. Should remove all docs again.
    // runInFence(function () {
    //   driver.mongo.dropDatabase();
    // });
    //
    // test.length(output, 1);
    // test.equal(output.shift(), ['removed', doc4Id]);

    await handle.stop();
    driver.mongo.close();
  });

var TestCustomType = function (head, tail) {
  // use different field names on the object than in JSON, to ensure we are
  // actually treating this as an opaque object.
  this.myHead = head;
  this.myTail = tail;
};
Object.assign(TestCustomType.prototype, {
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

testAsyncMulti('mongo-livedata - oplog - update EJSON', [
  async function(test, expect) {
    var self = this;
    var collectionName = 'ejson' + Random.id();
    if (Meteor.isClient) {
      await Meteor.callAsync('createInsecureCollection', collectionName);
      Meteor.subscribe('c-' + collectionName, expect());
    }

    self.collection = new Mongo.Collection(collectionName);
    self.date = new Date();
    self.objId = new Mongo.ObjectID();

    self.id = await self.collection.insertAsync(
      {
        d: self.date,
        oi: self.objId,
        custom: new TestCustomType('a', 'b'),
      },
    );
  },
  async function(test, expect) {
    var self = this;
    self.changes = [];
    self.handle = await self.collection.find({}).observeChanges({
      added: function(id, fields) {
        self.changes.push(['a', id, fields]);
      },
      changed: function(id, fields) {
        self.changes.push(['c', id, fields]);
      },
      removed: function(id) {
        self.changes.push(['r', id]);
      },
    });
    test.length(self.changes, 1);
    test.equal(self.changes.shift(), [
      'a',
      self.id,
      { d: self.date, oi: self.objId, custom: new TestCustomType('a', 'b') },
    ]);

    // First, replace the entire custom object.
    // (runInFence is useful for the server, using expect() is useful for the
    // client)
    await runInFence(async function() {
      await self.collection.updateAsync(
        self.id,
        {
          $set: { custom: new TestCustomType('a', 'c') },
        },
        { returnServerResultPromise: true }
      );
    });
  },
  async function(test, expect) {
    var self = this;
    test.length(self.changes, 1);
    test.equal(self.changes.shift(), [
      'c',
      self.id,
      { custom: new TestCustomType('a', 'c') },
    ]);

    // Now, sneakily replace just a piece of it. Meteor won't do this, but
    // perhaps you are accessing Mongo directly.
    await runInFence(async function() {
      await self.collection.updateAsync(
        self.id,
        {
          $set: { 'custom.EJSON$value.EJSONtail': 'd' },
        },
        { returnServerResultPromise: true }
      );
    });
  },
  async function(test, expect) {
    var self = this;
    test.length(self.changes, 1);
    test.equal(self.changes.shift(), [
      'c',
      self.id,
      { custom: new TestCustomType('a', 'd') },
    ]);

    // Update a date and an ObjectID too.
    self.date2 = new Date(self.date.valueOf() + 1000);
    self.objId2 = new Mongo.ObjectID();
    await runInFence(async function() {
      await self.collection.updateAsync(
        self.id,
        {
          $set: { d: self.date2, oi: self.objId2 },
        },
        { returnServerResultPromise: true }
      );
    });
  },
  function(test, expect) {
    var self = this;
    test.length(self.changes, 1);
    test.equal(self.changes.shift(), [
      'c',
      self.id,
      { d: self.date2, oi: self.objId2 },
    ]);

    self.handle.stop();
  },
]);


async function waitUntilOplogCaughtUp() {
  var oplogHandle =
        MongoInternals.defaultRemoteCollectionDriver().mongo._oplogHandle;
  if (oplogHandle)
    await oplogHandle.waitUntilCaughtUp();
}


Meteor.isServer &&
  Tinytest.addAsync('mongo-livedata - cursor dedup stop', async function(test) {
    var coll = new Mongo.Collection(Random.id());
    times(100, async function() {
      await coll.insertAsync({ foo: 'baz' });
    });
    var handler = await coll.find({}).observeChanges({
      added: async function(id) {
        await coll.updateAsync(id, { $set: { foo: 'bar' } });
      },
    });
    await handler.stop();
    // Previously, this would print
    //    Exception in queued task: TypeError: Object.keys called on non-object
    // Unfortunately, this test didn't fail before the bugfix, but it at least
    // would print the error and no longer does.
    // See https://github.com/meteor/meteor/issues/2070
  });

testAsyncMulti('mongo-livedata - undefined find options', [
  function(test, expect) {
    var self = this;
    self.collName = Random.id();
    if (Meteor.isClient) {
      Meteor.call('createInsecureCollection', self.collName);
      Meteor.subscribe('c-' + self.collName);
    }
  },
  async function(test, expect) {
    var self = this;
    self.coll = new Mongo.Collection(self.collName);
    self.doc = { foo: 1, bar: 2, _id: 'foobar' };
    await self.coll.insertAsync(self.doc);
  },
  async function(test, expect) {
    var self = this;
    var result = await self.coll.findOneAsync(
      { foo: 1 },
      {
        fields: undefined,
        sort: undefined,
        limit: undefined,
        skip: undefined,
      }
    );
    test.equal(result, self.doc);
  },
]);

// Regression test for #2274.
Meteor.isServer &&
  testAsyncMulti('mongo-livedata - observe limit bug', [
    async function(test, expect) {
      var self = this;
      self.coll = new Mongo.Collection(Random.id());
      var state = {};
      var callbacks = {
        changed: function(newDoc) {
          state[newDoc._id] = newDoc;
        },
        added: function(newDoc) {
          state[newDoc._id] = newDoc;
        },
        removed: function(oldDoc) {
          delete state[oldDoc._id];
        },
      };
      self.observe = await self.coll
        .find({}, { limit: 1, sort: { sortField: -1 } })
        .observe(callbacks);

      // Insert some documents.
      await runInFence(async function() {
        self.id0 = await self.coll.insertAsync({
          sortField: 0,
          toDelete: true,
        });
        self.id1 = await self.coll.insertAsync({
          sortField: 1,
          toDelete: true,
        });
        self.id2 = await self.coll.insertAsync({
          sortField: 2,
          toDelete: true,
        });
      });
      test.equal(_.keys(state), [self.id2]);

      // Mutate the one in the unpublished buffer and the one below the
      // buffer. Before the fix for #2274, this left the observe state machine in
      // a broken state where the buffer was empty but it wasn't try to re-fill
      // it.
      await runInFence(async function() {
        await self.coll.updateAsync(
          { _id: { $ne: self.id2 } },
          { $set: { toDelete: false } },
          { multi: 1 }
        );
      });
      test.equal(Object.keys(state), [self.id2]);

      // Now remove the one published document. This should slide up id1 from the
      // buffer, but this didn't work before the #2274 fix.
      await runInFence(async function() {
        await self.coll.removeAsync({ toDelete: true });
      });
      test.equal(Object.keys(state), [self.id1]);
    },
  ]);

Meteor.isServer &&
  testAsyncMulti('mongo-livedata - update with replace forbidden', [
    async function(test, expect) {
      var c = new Mongo.Collection(Random.id());

      var id = await c.insertAsync({ foo: 'bar' });

      await c.updateAsync(id, { foo2: 'bar2' });
      test.equal(await c.findOneAsync(id), { _id: id, foo2: 'bar2' });

      await test.throwsAsync(async function() {
        await c.updateAsync(id, { foo3: 'bar3' }, { _forbidReplace: true });
      }, 'Replacements are forbidden');
      test.equal(await c.findOneAsync(id), { _id: id, foo2: 'bar2' });

      await test.throwsAsync(async function() {
        await c.updateAsync(id, { foo3: 'bar3', $set: { blah: 1 } });
      }, 'cannot have both modifier and non-modifier fields');
      test.equal(await c.findOneAsync(id), { _id: id, foo2: 'bar2' });
    },
  ]);

Meteor.isServer &&
  Tinytest.addAsync('mongo-livedata - connection failure throws', async function(
    test
  ) {
    // Exception happens in 30s
    await test.throwsAsync(async function() {
      const connection = new MongoInternals.Connection(
        'mongodb://this-does-not-exist.test/asdf'
      );

      // Same as `MongoInternals.defaultRemoteCollectionDriver`.
      await connection.client.connect();
    });
  });

Meteor.isServer &&
  Tinytest.add('mongo-livedata - npm modules', function(test) {
    // Make sure the version number looks like a version number.
    test.matches(MongoInternals.NpmModules.mongodb.version, /^4\.(\d+)\.(\d+)/);
    test.equal(typeof MongoInternals.NpmModules.mongodb.module, 'object');
    test.equal(
      typeof MongoInternals.NpmModules.mongodb.module.ObjectID,
      'function'
    );

    var c = new Mongo.Collection(Random.id());
    var rawCollection = c.rawCollection();
    test.isTrue(rawCollection);
    test.isTrue(rawCollection.findOneAndUpdate);
    var rawDb = c.rawDatabase();
    test.isTrue(rawDb);
    test.isTrue(rawDb.admin);
  });

if (Meteor.isServer) {
  Tinytest.addAsync(
    "mongo-livedata - update/remove don't accept an array as a selector #4804",
    async function(test) {
      var collection = new Mongo.Collection(Random.id());

    times(10, function () {
      collection.insert({ data: "Hello" });
    });

    test.equal(collection.find().count(), 10);

      // Test several array-related selectors
      for (const selector of [[], [1, 2, 3], [{}]]) {
        await test.throwsAsync(async function() {
          await collection.removeAsync(selector);
        });

        await test.throwsAsync(async function() {
          await collection.updateAsync(selector, { $set: 5 });
        });
      }

      test.equal(await collection.find().countAsync(), 10);
    }
  );
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
  testAsyncMulti('mongo-livedata - fence onBeforeFire error', [
    async function(test, expect) {
      var self = this;
      self.nonce = Random.id();
      const r = await Meteor.callAsync('fenceOnBeforeFireError1', self.nonce);
      test.isTrue(r);
    },
    async function(test, expect) {
      var self = this;
      const r = await Meteor.callAsync('fenceOnBeforeFireError2', self.nonce);
      test.isTrue(r);
    },
  ]);
} else {
  var fenceOnBeforeFireErrorCollection = new Mongo.Collection('FOBFE');
  var futuresByNonce = {};
  Meteor.methods({
    fenceOnBeforeFireError1: async function(nonce) {
      let resolver;
      futuresByNonce[nonce] = new Promise(r => (resolver = r));
      var observe = await fenceOnBeforeFireErrorCollection
        .find({ nonce: nonce })
        .observeChanges({ added: function() {} });
      Meteor.setTimeout(async function() {
        try {
          await fenceOnBeforeFireErrorCollection.insertAsync({ nonce });
          resolver(true);
        } catch (e) {
          resolver(false);
          console.error(e);
          observe.stop();
        }
      }, 10);
      return futuresByNonce[nonce];
    },
    fenceOnBeforeFireError2: function(nonce) {
      try {
        return futuresByNonce[nonce];
      } finally {
        delete futuresByNonce[nonce];
      }
    },
  });
}

if (Meteor.isServer) {
  Tinytest.addAsync(
    'mongo update/upsert - returns nMatched as numberAffected',
    async function(test, onComplete) {
      var collName = Random.id();
      var coll = new Mongo.Collection('update_nmatched' + collName);

      await coll.insertAsync({ animal: 'cat', legs: 4 });
      await coll.insertAsync({ animal: 'dog', legs: 4 });
      await coll.insertAsync({ animal: 'echidna', legs: 4 });
      await coll.insertAsync({ animal: 'platypus', legs: 4 });
      await coll.insertAsync({ animal: 'starfish', legs: 5 });

      var affected = await coll.updateAsync(
        { legs: 4 },
        { $set: { category: 'quadruped' } }
      );
      test.equal(affected, 1);

      //Changes only 3 but matched 4 documents
      affected = await coll.updateAsync(
        { legs: 4 },
        { $set: { category: 'quadruped' } },
        { multi: true }
      );
      test.equal(affected, 4);

      //Again, changes nothing but returns nModified
      affected = await coll.updateAsync(
        { legs: 4 },
        { $set: { category: 'quadruped' } },
        { multi: true }
      );
      test.equal(affected, 4);

      //upsert:true changes nothing, 4 modified
      affected = await coll.updateAsync(
        { legs: 4 },
        { $set: { category: 'quadruped' } },
        { multi: true, upsert: true }
      );
      test.equal(affected, 4);

      //upsert method works as upsert:true
      var result = await coll.upsertAsync(
        { legs: 4 },
        { $set: { category: 'quadruped' } },
        { multi: true }
      );
      test.equal(result.numberAffected, 4);
    }
  );

  Tinytest.addAsync(
    'mongo livedata - update/upsert callback returns nMatched as numberAffected',
    async function(test, onComplete) {
      var collName = Random.id();
      var coll = new Mongo.Collection('update_nmatched' + collName);

      await coll.insertAsync({ animal: 'cat', legs: 4 });
      await coll.insertAsync({ animal: 'dog', legs: 4 });
      await coll.insertAsync({ animal: 'echidna', legs: 4 });
      await coll.insertAsync({ animal: 'platypus', legs: 4 });
      await coll.insertAsync({ animal: 'starfish', legs: 5 });

      var test1 = async function() {
        const result = await coll.updateAsync(
          { legs: 4 },
          { $set: { category: 'quadruped' } }
        );
        test.equal(result, 1);
        return test2();
      };

      var test2 = async function() {
        //Changes only 3 but matched 4 documents
        const result = await coll.updateAsync(
          { legs: 4 },
          { $set: { category: 'quadruped' } },
          { multi: true }
        );
        test.equal(result, 4);
        return test3();
      };

      var test3 = async function() {
        //Again, changes nothing but returns nModified
        const result = await coll.updateAsync(
          { legs: 4 },
          { $set: { category: 'quadruped' } },
          { multi: true }
        );
        test.equal(result, 4);
        return test4();
      };

      var test4 = async function() {
        //upsert:true changes nothing, 4 modified
        const result = await coll.updateAsync(
          { legs: 4 },
          { $set: { category: 'quadruped' } },
          { multi: true, upsert: true }
        );
        test.equal(result, 4);
        return test5();
      };

      var test5 = async function() {
        //upsert method works as upsert:true
        const result = await coll.upsertAsync(
          { legs: 4 },
          { $set: { category: 'quadruped' } },
          { multi: true }
        );
        test.equal(result.numberAffected, 4);
      };

      await test1();
    }
  );
}

if (Meteor.isServer) {
  Tinytest.addAsync('mongo-livedata - transaction', async function(test) {
    const { client } = MongoInternals.defaultRemoteCollectionDriver().mongo;

    const Collection = new Mongo.Collection(`transaction_test_${test.runId()}`);
    const rawCollection = Collection.rawCollection();

    await Collection.insertAsync({ _id: 'a' });
    await Collection.insertAsync({ _id: 'b' });

    let changeCount = 0;

    return new Promise(async resolve => {
      async function finalize() {
        await observeHandle.stop();
        Meteor.clearTimeout(timeout);
        resolve();
      }

      const observeHandle = await Collection.find().observeChanges({
        async changed(id, fields) {
          let expectedValue;

          if (id === 'a') {
            expectedValue = 'updated1';
          } else if (id === 'b') {
            expectedValue = 'updated2';
          }

          test.equal(fields.field, expectedValue);
          changeCount += 1;

          if (changeCount === 2) {
            await finalize();
          }
        },
      });

      const timeout = Meteor.setTimeout(() => {
        test.fail("Didn't receive all transaction operations in two seconds.");
        finalize();
      }, 2000);

      const session = client.startSession();
      session
        .withTransaction(session => {
          let promise = Promise.resolve();
          ['a', 'b'].forEach((id, index) => {
            promise = promise.then(() =>
              rawCollection.updateMany(
                { _id: id },
                { $set: { field: `updated${index + 1}` } },
                { session }
              )
            );
          });
          return promise;
        })
        .finally(() => {
          session.endSession();
        });
    });
  });
}

if (Meteor.isServer) {
  Tinytest.addAsync('mongo-livedata - asyncIterator', async function(test) {
    const Collection = new Mongo.Collection(`asynciterator_test_${test.runId()}`);

    await Collection.insertAsync({ _id: 'a' });
    await Collection.insertAsync({ _id: 'b' });

    let itemIds = [];
    for await (const item of Collection.find()) {
      itemIds.push(item._id);
    }
    test.equal(itemIds.length, 2);
    test.equal(itemIds, ['a', 'b']);
  });
}

Tinytest.addAsync(
  'mongo-livedata - maintained isomorphism on collection operations for both client and server',
  async function (test) {
    const Collection = new Mongo.Collection(
      `maintained_col_op_iso${test.runId()}`,
      { resolverType: 'stub' }
    );

    await Collection.insertAsync({ _id: 'a' });
    await Collection.insertAsync({ _id: 'b' });

    let items = await Collection.find().fetchAsync();
    let itemIds = items.map(_item => _item._id);

    test.equal(itemIds, ['a', 'b']);

    await Collection.updateAsync({ _id: 'a' }, { $set: { num: 1 } });
    await Collection.updateAsync({ _id: 'b' }, { $set: { num: 2 } });

    items = await Collection.find().fetchAsync();
    itemIds = items.map(_item => _item.num);

    test.equal(itemIds, [1, 2]);

    await Collection.removeAsync({ _id: 'a' });
    await Collection.removeAsync({ _id: 'b' });

    items = await Collection.find().fetchAsync();

    test.equal(items, []);
  },
);

testAsyncMulti(
  'mongo-livedata - collection async operations data persistence',
  [
    async function (test) {
      // Using remote collection
      const Collection = new Mongo.Collection(
        `remoteop_persistence${test.runId()}`,
        {
          resolverType: Meteor.isClient ? 'stub' : 'server',
        },
      );

      // Using remote collection
      await Collection.insertAsync({ _id: 'a' });
      await Collection.insertAsync({ _id: 'b' });

      let items = await Collection.find().fetchAsync();
      let itemIds = items.map(_item => _item._id);

      test.equal(itemIds, ['a', 'b']);

      if (Meteor.isClient) {
        return waitUntil(async () => {
          items = await Collection.find().fetchAsync();
          itemIds = items.map(_item => _item._id);
          return itemIds?.length === []?.length; // data IS NOT persisted
        }, { description: 'data IS NOT persisted'});
      }

      return Promise.resolve();
    },
    async function (test) {
      // Using local collection
      const Collection = new Mongo.Collection(
        `localop_persistence${test.runId()}`,
      );

      await Collection._collection.insertAsync({ _id: 'a' });
      await Collection._collection.updateAsync(
        { _id: 'a' },
        { $set: { num: 1 } },
      );
      const insertedId = await Collection._collection.insertAsync({ num: 2 });

      let items = await Collection.find().fetchAsync();
      let itemIds = items.map(_item => _item._id);
      test.equal(itemIds, ['a', insertedId]); // temporary data accessible

      const aItem = items[0];
      const insertedItem = items[1];
      test.equal(aItem?.num, 1);
      test.equal(insertedItem?.num, 2);

      await Collection._collection.removeAsync({ _id: insertedId });

      items = await Collection.find().fetchAsync();
      itemIds = items.map(_item => _item._id);

      test.equal(itemIds, ['a']); // temporary data accessible

      if (Meteor.isClient) {
        return waitUntil(async () => {
          items = await Collection.find().fetchAsync();
          itemIds = items.map(_item => _item._id);
          return itemIds?.length === 1 && itemIds[0] === 'a'; // data is persisted
        }, { description: 'data is persisted'});
      }

      return Promise.resolve();
    },
    async function (test) {
      // Using methods
      const Collection = new Mongo.Collection(
        `methodop_persistence${test.runId()}`,
      );
      Collection.allow({
        insertAsync() {
          return true;
        },
        insert() {
          return true;
        },
      });

      Meteor.methods({
        [`insertMethodPersistence${test.runId()}`]: async () => {
          await Collection.insertAsync({ _id: 'a' });
        },
      });

      const promise = Meteor.callAsync(
        `insertMethodPersistence${test.runId()}`,
      );

      let items;
      let itemIds;
      if (Meteor.isServer) {
        await promise;

        items = await Collection.find().fetchAsync();
        itemIds = items.map(_item => _item._id);

        test.equal(itemIds, ['a']); // temporary data accessible
      }

      if (Meteor.isClient) {
        await promise.stubPromise;

        items = await Collection.find().fetchAsync();
        itemIds = items.map(_item => _item._id);

        test.equal(itemIds, ['a']); // temporary data accessible

        try {
          await promise.serverPromise;
        } catch (e) {
          // error as no insert method enabled on server
          return waitUntil(async () => {
            items = await Collection.find().fetchAsync();
            itemIds = items.map(_item => _item._id);
            return itemIds?.length === []?.length ; // data IS NOT persisted
          }, { description: 'data IS NOT persisted'});
        }
      } else {
        return Promise.resolve();
      }
    },
  ],
);

testAsyncMulti(
  "mongo-livedata - support observeChangesAsync and observeAsync to keep isomorphism on client and server",
  [
    async (test) => {
      const Collection = new Mongo.Collection(
        `observe_changes_async${test.runId()}`,
        { resolverType: 'stub' }
      );
      const id = 'a';
      await Collection.insertAsync({ _id: id, foo: { bar: 123 } });

      return new Promise(async (resolve) => {
        const obs = await Collection.find(id).observeChangesAsync({
          async changed(_id, fields) {
            await obs.stop();
            resolve();
            test.equal(_id, id);
            test.equal(fields?.foo?.bar, 456);
          },
        });
        await Collection.updateAsync(id, { $set: { 'foo.bar': 456 } });
      });
    },
    async (test) => {
      const Collection = new Mongo.Collection(`observe_async${test.runId()}`, {
        resolverType: 'stub',
      });
      const id = 'a';
      await Collection.insertAsync({ _id: id, foo: { bar: 123 } });

      return new Promise(async (resolve) => {
        const obs = await Collection.find(id).observeAsync({
          async changed(newDocument) {
            await obs.stop();
            test.equal(newDocument._id, id);
            test.equal(newDocument?.foo?.bar, 456);
            resolve();
          },
        });
        await Collection.updateAsync(id, { $set: { 'foo.bar': 456 } });
      });
    },
  ]
);


Meteor.methods({
  [`methodThrowException`]: async () => {
    if (Meteor.isClient) {
      throw new Meteor.Error('Throw on client');
    }
  },
});

Tinytest.addAsync(
  'mongo-livedata - both stub and server promise throw exceptions when client errors',
  async function (test) {
    const promise = Meteor.callAsync('methodThrowException');
    if (Meteor.isClient) {
      try {
        await promise.stubPromise;
      } catch (err) {
        test.equal(err.error, 'Throw on client');
      }

      try {
        await promise.serverPromise;
      } catch (err) {
        test.equal(err.error, 'Throw on client');
      }
    }
  },
);
