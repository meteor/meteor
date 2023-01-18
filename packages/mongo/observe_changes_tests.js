var makeCollection = function () {
  if (Meteor.isServer) {
    return new Mongo.Collection(Random.id());
  } else {
    return new Mongo.Collection(null);
  }
};

_.each ([
    {added: 'added', forceOrdered: true},
    {added: 'added', forceOrdered: false},
    {added: 'addedBefore', forceOrdered: false}
], function (options) {
  var added = options.added;
  var forceOrdered = options.forceOrdered;

  Tinytest.addAsync("observeChanges - single id - basics " + added
                    + (forceOrdered ? " force ordered" : ""),
                    async function (test, onComplete) {
    console.log({added});
      var c = makeCollection();
      var counter = 0;
      var callbacks = [added, "changed", "removed"];
      if (forceOrdered)
        callbacks.push("movedBefore");
      await withCallbackLogger(test,
                         callbacks,
                         Meteor.isServer,
                         async function (logger) {
        var barid = await c.insertAsync({thing: "stuff"});
        var fooid = await c.insertAsync({noodles: "good", bacon: "bad", apples: "ok"});

        var handle = await c.find(fooid).observeChanges(logger);
        if (added === 'added') {
          await logger.expectResult(added, [fooid, {noodles: "good", bacon: "bad", apples: "ok"}]);
        } else {
          await logger.expectResult(added,
                              [fooid, {noodles: "good", bacon: "bad", apples: "ok"}, null]);
        }
        await c.updateAsync(fooid, {noodles: "alright", potatoes: "tasty", apples: "ok"});
        await logger.expectResult("changed",
                            [fooid, {noodles: "alright", potatoes: "tasty", bacon: undefined}]);

        await c.removeAsync(fooid);
        await logger.expectResult("removed", [fooid]);
        await logger.expectNoResult(async () => {
          await c.removeAsync(barid);
          await c.insertAsync({noodles: "good", bacon: "bad", apples: "ok"});
        });


       await handle.stop();

       const badCursor = c.find({}, {fields: {noodles: 1, _id: false}});
       await test.throwsAsync(function () {
         return badCursor.observeChanges(logger);
       });
    });
    onComplete();
  });
});

Tinytest.addAsync("observeChanges - callback isolation", async function (test, onComplete) {
  var c = makeCollection();
  await withCallbackLogger(test, ["added", "changed", "removed"], Meteor.isServer, async function (logger) {
    var handles = [];
    var cursor = c.find();
    handles.push(await cursor.observeChanges(logger));
    // fields-tampering observer
    handles.push(await cursor.observeChanges({
      added: function(id, fields) {
        fields.apples = 'green';
      },
      changed: function(id, fields) {
        fields.apples = 'green';
      },
    }));
    var fooid = await c.insertAsync({apples: "ok"});
    await logger.expectResult("added", [fooid, {apples: "ok"}], 1);

    await c.updateAsync(fooid, {apples: "not ok"});
    await logger.expectResult("changed", [fooid, {apples: "not ok"}], 1);

    test.equal((await c.findOneAsync(fooid)).apples, "not ok");
    await Promise.all(handles.map(h => h.stop())).then(() => onComplete());
    //_.each(handles, async function(handle) { await handle.stop(); });
    //onComplete();
  });
});

Tinytest.addAsync("observeChanges - single id - initial adds", async function (test, onComplete) {
  var c = makeCollection();
  await withCallbackLogger(test, ["added", "changed", "removed"], Meteor.isServer, async function (logger) {
    var fooid = await c.insertAsync({noodles: "good", bacon: "bad", apples: "ok"});
    var handle = await c.find(fooid).observeChanges(logger);
    await logger.expectResult("added", [fooid, {noodles: "good", bacon: "bad", apples: "ok"}]);
    await logger.expectNoResult();
    await handle.stop();
  });
  onComplete();
});



Tinytest.addAsync("observeChanges - unordered - initial adds", async function (test) {
  var c = makeCollection();
  await withCallbackLogger(test, ["added", "changed", "removed"], Meteor.isServer, async function (logger) {
    var fooid = await c.insertAsync({noodles: "good", bacon: "bad", apples: "ok"});
    var barid = await c.insertAsync({noodles: "good", bacon: "weird", apples: "ok"});
    var handle = await c.find().observeChanges(logger);
    await logger.expectResultUnordered([
      {callback: "added",
       args: [fooid, {noodles: "good", bacon: "bad", apples: "ok"}]},
      {callback: "added",
       args: [barid, {noodles: "good", bacon: "weird", apples: "ok"}]}
    ]);
    await logger.expectNoResult();
    await handle.stop();
  });
});

Tinytest.addAsync("observeChanges - unordered - basics", async function (test) {
  var c = makeCollection();
  await withCallbackLogger(test, ["added", "changed", "removed"], Meteor.isServer, async function (logger) {
    var handle = await c.find().observeChanges(logger);
    var barid = await c.insertAsync({thing: "stuff"});
    await logger.expectResultOnly("added", [barid, {thing: "stuff"}]);

    var fooid = await c.insertAsync({noodles: "good", bacon: "bad", apples: "ok"});

    await logger.expectResultOnly("added", [fooid, {noodles: "good", bacon: "bad", apples: "ok"}]);

    await c.updateAsync(fooid, {noodles: "alright", potatoes: "tasty", apples: "ok"});
    await c.updateAsync(fooid, {noodles: "alright", potatoes: "tasty", apples: "ok"});
    await logger.expectResultOnly("changed",
                        [fooid, {noodles: "alright", potatoes: "tasty", bacon: undefined}]);
    await c.removeAsync(fooid);
    await logger.expectResultOnly("removed", [fooid]);
    await c.removeAsync(barid);
    await logger.expectResultOnly("removed", [barid]);

    fooid = await c.insertAsync({noodles: "good", bacon: "bad", apples: "ok"});

    await logger.expectResult("added", [fooid, {noodles: "good", bacon: "bad", apples: "ok"}]);
    await logger.expectNoResult();
    await handle.stop();
    //onComplete();
  });
});

if (Meteor.isServer) {
  Tinytest.addAsync("observeChanges - unordered - specific fields", async function (test) {
    var c = makeCollection();
    await withCallbackLogger(test, ["added", "changed", "removed"], Meteor.isServer, async function (logger) {
      var handle = await c.find({}, {fields:{noodles: 1, bacon: 1}}).observeChanges(logger);
      var barid = await c.insertAsync({thing: "stuff"});
      await logger.expectResultOnly("added", [barid, {}]);

      var fooid = await c.insertAsync({noodles: "good", bacon: "bad", apples: "ok"});

      await logger.expectResultOnly("added", [fooid, {noodles: "good", bacon: "bad"}]);

      await c.updateAsync(fooid, {noodles: "alright", potatoes: "tasty", apples: "ok"});
      await logger.expectResultOnly("changed",
                              [fooid, {noodles: "alright", bacon: undefined}]);
      await c.updateAsync(fooid, {noodles: "alright", potatoes: "meh", apples: "ok"});
      await c.removeAsync(fooid);
      await logger.expectResultOnly("removed", [fooid]);
      await c.removeAsync(barid);
      await logger.expectResultOnly("removed", [barid]);

      fooid = await c.insertAsync({noodles: "good", bacon: "bad"});

      await logger.expectResult("added", [fooid, {noodles: "good", bacon: "bad"}]);
      await logger.expectNoResult();
      await handle.stop();
    });
  });

  Tinytest.addAsync("observeChanges - unordered - specific fields + selector on excluded fields", async function (test, onComplete) {
    var c = makeCollection();
    await withCallbackLogger(test, ["added", "changed", "removed"], Meteor.isServer, async  function (logger) {
      var handle = await c.find({ mac: 1, cheese: 2 },
                          {fields:{noodles: 1, bacon: 1, eggs: 1}}).observeChanges(logger);
      var barid = await c.insertAsync({thing: "stuff", mac: 1, cheese: 2});
      await logger.expectResultOnly("added", [barid, {}]);
      var fooid = await c.insertAsync({noodles: "good", bacon: "bad", apples: "ok", mac: 1, cheese: 2});

      await logger.expectResultOnly("added", [fooid, {noodles: "good", bacon: "bad"}]);

      await c.updateAsync(fooid, {noodles: "alright", potatoes: "tasty", apples: "ok", mac: 1, cheese: 2});
      await logger.expectResultOnly("changed",
                              [fooid, {noodles: "alright", bacon: undefined}]);

      // Doesn't get update event, since modifies only hidden fields
      await logger.expectNoResult(async () =>
        await c.updateAsync(fooid, {
          noodles: "alright",
          potatoes: "meh",
          apples: "ok",
          mac: 1,
          cheese: 2
        })
      );

      await c.removeAsync(fooid);
      await logger.expectResultOnly("removed", [fooid]);
      await c.removeAsync(barid);
      await logger.expectResultOnly("removed", [barid]);

      fooid = await c.insertAsync({noodles: "good", bacon: "bad", mac: 1, cheese: 2});

      await logger.expectResult("added", [fooid, {noodles: "good", bacon: "bad"}]);
      await logger.expectNoResult();
      await handle.stop();
      onComplete();
    })
  });
}

Tinytest.addAsync("observeChanges - unordered - specific fields + modify on excluded fields", async function (test, onComplete) {
  var c = makeCollection();
  await withCallbackLogger(test, ["added", "changed", "removed"], Meteor.isServer, async function (logger) {
    var handle = await c.find({ mac: 1, cheese: 2 },
                        {fields:{noodles: 1, bacon: 1, eggs: 1}}).observeChanges(logger);
    var fooid = await c.insertAsync({noodles: "good", bacon: "bad", apples: "ok", mac: 1, cheese: 2});

    await logger.expectResultOnly("added", [fooid, {noodles: "good", bacon: "bad"}]);


    // Noodles go into shadow, mac appears as eggs
    await c.updateAsync(fooid, {$rename: { noodles: 'shadow', apples: 'eggs' }});
    await logger.expectResultOnly("changed",
                            [fooid, {eggs:"ok", noodles: undefined}]);

    await c.removeAsync(fooid);
    await logger.expectResultOnly("removed", [fooid]);
    await logger.expectNoResult();
    await handle.stop();
  });
});

Tinytest.addAsync(
  "observeChanges - unordered - unset parent of observed field",
  async function (test) {
    var c = makeCollection();
    await withCallbackLogger(
      test, ['added', 'changed', 'removed'], Meteor.isServer,
      async function (logger) {
        var handle = await c.find({}, {fields: {'type.name': 1}}).observeChanges(logger);
        var id = await c.insertAsync({ type: { name: 'foobar' } });
        await logger.expectResultOnly('added', [id, { type: { name: 'foobar' } }]);

        await c.updateAsync(id, { $unset: { type: 1 } });
        test.equal(await c.find().fetch(), [{ _id: id }]);
        await logger.expectResultOnly('changed', [id, { type: undefined }]);

        await handle.stop();
      }
    );
  }
);



Tinytest.addAsync("observeChanges - unordered - enters and exits result set through change", async function (test) {
  var c = makeCollection();
  await withCallbackLogger(test, ["added", "changed", "removed"], Meteor.isServer, async function (logger) {
    var handle = await c.find({noodles: "good"}).observeChanges(logger);
    var barid = await c.insertAsync({thing: "stuff"});

    var fooid = await c.insertAsync({noodles: "good", bacon: "bad", apples: "ok"});
    await logger.expectResultOnly("added", [fooid, {noodles: "good", bacon: "bad", apples: "ok"}]);

    await c.updateAsync(fooid, {noodles: "alright", potatoes: "tasty", apples: "ok"});
    await logger.expectResultOnly("removed",
                      [fooid]);
    await c.removeAsync(fooid);
    await c.removeAsync(barid);

    fooid = await c.insertAsync({noodles: "ok", bacon: "bad", apples: "ok"});
    await c.updateAsync(fooid, {noodles: "good", potatoes: "tasty", apples: "ok"});
    await logger.expectResult("added", [fooid, {noodles: "good", potatoes: "tasty", apples: "ok"}]);
    await logger.expectNoResult();
    await handle.stop();
  });
});

// TODO How to implement this test?
if (Meteor.isServer) {
  testAsyncMulti("observeChanges - tailable", [
    async function f1(test, expect) {
      var self = this;
      var collName = "cap_" + Random.id();
      var coll = new Mongo.Collection(collName);
      await coll.createCappedCollectionAsync(1000000);
      self.xs = [];
      self.expects = [];
      self.insertAsync = async function (fields) {
        await coll.insertAsync(_.extend({ts: new MongoInternals.MongoTimestamp(0, 0)},
                             fields));
      };

      // Tailable observe shouldn't show things that are in the initial
      // contents.
      self.insertAsync({x: 1});
      // Wait for one added call before going to the next test function.
      self.expects.push(expect());

      var cursor = coll.find({y: {$ne: 7}}, {tailable: true});
      self.handle = await cursor.observeChanges({
        added: function (id, fields) {
          self.xs.push(fields.x);
          test.notEqual(self.expects.length, 0);
          self.expects.pop()();
        },
        changed: function () {
          test.fail({unexpected: "changed"});
        },
        removed: function () {
          test.fail({unexpected: "removed"});
        }
      });

      // Nothing happens synchronously.
      test.equal(self.xs, []);
      let resolve;
      const waitFor = new Promise(r => resolve = r);
      Meteor.setTimeout(resolve, 100);
      return waitFor;
    },
    async function f2(test, expect) {
      var self = this;
      // The cursors sees the first element.
      test.equal(self.xs, [1]);
      self.xs = [];

      self.insertAsync({x: 2, y: 3});
      self.insertAsync({x: 3, y: 7});  // filtered out by the query
      self.insertAsync({x: 4});
       // Expect two added calls to happen.
      self.expects = [expect(), expect()];

      let resolve;
      const waitFor = new Promise(r => resolve = r);
      Meteor.setTimeout(resolve, 100);
      return waitFor;
    },
    async function f3(test, expect) {
      var self = this;
      test.equal(self.xs, [2, 4]);
      self.xs = [];
      await self.handle.stop();

      await self.insertAsync({x: 5});
      // XXX This timeout isn't perfect but it's pretty hard to prove that an
      // event WON'T happen without something like a write fence.
      let resolve;
      const waitFor = new Promise(r => resolve = r);
      Meteor.setTimeout(resolve, 100);
      return waitFor;
    },
    function f4(test, expect) {
      var self = this;
      test.equal(self.xs, []);
    }
  ]);
}


testAsyncMulti("observeChanges - bad query", [
  async function (test, expect) {
    var c = makeCollection();
    var observeThrows = async function () {
      await test.throwsAsync(async function () {
        await c.find({__id: {$in: null}}).observeChanges({
          added: function added() {
            test.fail("added shouldn't be called");
          }
        });
      }, '$in needs an array');

    };

    if (Meteor.isClient) {
      await observeThrows();
      return;
    }

    // Test that if two copies of the same bad observeChanges run in parallel
    // and are de-duped, both observeChanges calls will throw.

    await Promise.all([observeThrows(), observeThrows()]);
  }
]);

if (Meteor.isServer) {
  Tinytest.addAsync(
    "observeChanges - EnvironmentVariable",
    function (test, onComplete) {
      var c = makeCollection();
      var environmentVariable = new Meteor.EnvironmentVariable;
      environmentVariable.withValue(true, async function() {
        var handle = await c.find({}, { fields: { 'type.name': 1 }}).observeChanges({
          added: async function() {
            test.isTrue(environmentVariable.get());
            await handle.stop();
            onComplete();
          }
        });
      }).then(async () => {
        await c.insertAsync({ type: { name: 'foobar' } });
      });
    }
  );
}
