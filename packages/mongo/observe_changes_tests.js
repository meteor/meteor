var makeCollection = function () {
  if (Meteor.isServer)
    return new Mongo.Collection(Random.id());
  else
    return new Mongo.Collection(null);
};

_.each ([{added:'added', forceOrdered: true},
         {added:'added', forceOrdered: false},
         {added: 'addedBefore', forceOrdered: false}], function (options) {
           var added = options.added;
           var forceOrdered = options.forceOrdered;
  Tinytest.addAsync("observeChanges - single id - basics "
                    + added
                    + (forceOrdered ? " force ordered" : ""),
                    function (test, onComplete) {
    var c = makeCollection();
    var counter = 0;
    var callbacks = [added, "changed", "removed"];
    if (forceOrdered)
      callbacks.push("movedBefore");
    withCallbackLogger(test,
                       callbacks,
                       Meteor.isServer,
                       function (logger) {
    var barid = c.insert({thing: "stuff"});
    var fooid = c.insert({noodles: "good", bacon: "bad", apples: "ok"});

    var handle = c.find(fooid).observeChanges(logger);
    if (added === 'added')
      logger.expectResult(added, [fooid, {noodles: "good", bacon: "bad",apples: "ok"}]);
    else
      logger.expectResult(added,
                          [fooid, {noodles: "good", bacon: "bad", apples: "ok"}, null]);
    c.update(fooid, {noodles: "alright", potatoes: "tasty", apples: "ok"});
    logger.expectResult("changed",
                        [fooid, {noodles: "alright", potatoes: "tasty", bacon: undefined}]);

    c.remove(fooid);
    logger.expectResult("removed", [fooid]);

    c.remove(barid);

    c.insert({noodles: "good", bacon: "bad", apples: "ok"});
    logger.expectNoResult();
    handle.stop();

    var badCursor = c.find({}, {fields: {noodles: 1, _id: false}});
    test.throws(function () {
      badCursor.observeChanges(logger);
    });

    onComplete();
    });
  });
});

Tinytest.addAsync("observeChanges - callback isolation", function (test, onComplete) {
  var c = makeCollection();
  withCallbackLogger(test, ["added", "changed", "removed"], Meteor.isServer, function (logger) {
    var handles = [];
    var cursor = c.find();
    handles.push(cursor.observeChanges(logger));
    // fields-tampering observer
    handles.push(cursor.observeChanges({
      added: function(id, fields) {
        fields.apples = 'green';
      },
      changed: function(id, fields) {
        fields.apples = 'green';
      },
    }));

    var fooid = c.insert({apples: "ok"});
    logger.expectResult("added", [fooid, {apples: "ok"}]);

    c.update(fooid, {apples: "not ok"})
    logger.expectResult("changed", [fooid, {apples: "not ok"}]);

    test.equal(c.findOne(fooid).apples, "not ok");

    _.each(handles, function(handle) { handle.stop(); });
    onComplete();
  });

});

Tinytest.addAsync("observeChanges - single id - initial adds", function (test, onComplete) {
  var c = makeCollection();
  withCallbackLogger(test, ["added", "changed", "removed"], Meteor.isServer, function (logger) {
  var fooid = c.insert({noodles: "good", bacon: "bad", apples: "ok"});
  var handle = c.find(fooid).observeChanges(logger);
  logger.expectResult("added", [fooid, {noodles: "good", bacon: "bad", apples: "ok"}]);
  logger.expectNoResult();
  handle.stop();
  onComplete();
  });
});



Tinytest.addAsync("observeChanges - unordered - initial adds", function (test, onComplete) {
  var c = makeCollection();
  withCallbackLogger(test, ["added", "changed", "removed"], Meteor.isServer, function (logger) {
  var fooid = c.insert({noodles: "good", bacon: "bad", apples: "ok"});
  var barid = c.insert({noodles: "good", bacon: "weird", apples: "ok"});
  var handle = c.find().observeChanges(logger);
  logger.expectResultUnordered([
    {callback: "added",
     args: [fooid, {noodles: "good", bacon: "bad", apples: "ok"}]},
    {callback: "added",
     args: [barid, {noodles: "good", bacon: "weird", apples: "ok"}]}
  ]);
  logger.expectNoResult();
  handle.stop();
  onComplete();
  });
});

Tinytest.addAsync("observeChanges - unordered - basics", function (test, onComplete) {
  var c = makeCollection();
  withCallbackLogger(test, ["added", "changed", "removed"], Meteor.isServer, function (logger) {
  var handle = c.find().observeChanges(logger);
  var barid = c.insert({thing: "stuff"});
  logger.expectResultOnly("added", [barid, {thing: "stuff"}]);

  var fooid = c.insert({noodles: "good", bacon: "bad", apples: "ok"});

  logger.expectResultOnly("added", [fooid, {noodles: "good", bacon: "bad", apples: "ok"}]);

  c.update(fooid, {noodles: "alright", potatoes: "tasty", apples: "ok"});
  c.update(fooid, {noodles: "alright", potatoes: "tasty", apples: "ok"});
  logger.expectResultOnly("changed",
                      [fooid, {noodles: "alright", potatoes: "tasty", bacon: undefined}]);
  c.remove(fooid);
  logger.expectResultOnly("removed", [fooid]);
  c.remove(barid);
  logger.expectResultOnly("removed", [barid]);

  fooid = c.insert({noodles: "good", bacon: "bad", apples: "ok"});

  logger.expectResult("added", [fooid, {noodles: "good", bacon: "bad", apples: "ok"}]);
  logger.expectNoResult();
  handle.stop();
  onComplete();
  });
});

if (Meteor.isServer) {
  Tinytest.addAsync("observeChanges - unordered - specific fields", function (test, onComplete) {
    var c = makeCollection();
    withCallbackLogger(test, ["added", "changed", "removed"], Meteor.isServer, function (logger) {
      var handle = c.find({}, {fields:{noodles: 1, bacon: 1}}).observeChanges(logger);
      var barid = c.insert({thing: "stuff"});
      logger.expectResultOnly("added", [barid, {}]);

      var fooid = c.insert({noodles: "good", bacon: "bad", apples: "ok"});

      logger.expectResultOnly("added", [fooid, {noodles: "good", bacon: "bad"}]);

      c.update(fooid, {noodles: "alright", potatoes: "tasty", apples: "ok"});
      logger.expectResultOnly("changed",
                              [fooid, {noodles: "alright", bacon: undefined}]);
      c.update(fooid, {noodles: "alright", potatoes: "meh", apples: "ok"});
      c.remove(fooid);
      logger.expectResultOnly("removed", [fooid]);
      c.remove(barid);
      logger.expectResultOnly("removed", [barid]);

      fooid = c.insert({noodles: "good", bacon: "bad"});

      logger.expectResult("added", [fooid, {noodles: "good", bacon: "bad"}]);
      logger.expectNoResult();
      handle.stop();
      onComplete();
    });
  });

  Tinytest.addAsync("observeChanges - unordered - specific fields + selector on excluded fields", function (test, onComplete) {
    var c = makeCollection();
    withCallbackLogger(test, ["added", "changed", "removed"], Meteor.isServer, function (logger) {
      var handle = c.find({ mac: 1, cheese: 2 },
                          {fields:{noodles: 1, bacon: 1, eggs: 1}}).observeChanges(logger);
      var barid = c.insert({thing: "stuff", mac: 1, cheese: 2});
      logger.expectResultOnly("added", [barid, {}]);

      var fooid = c.insert({noodles: "good", bacon: "bad", apples: "ok", mac: 1, cheese: 2});

      logger.expectResultOnly("added", [fooid, {noodles: "good", bacon: "bad"}]);

      c.update(fooid, {noodles: "alright", potatoes: "tasty", apples: "ok", mac: 1, cheese: 2});
      logger.expectResultOnly("changed",
                              [fooid, {noodles: "alright", bacon: undefined}]);

      // Doesn't get update event, since modifies only hidden fields
      c.update(fooid, {noodles: "alright", potatoes: "meh", apples: "ok", mac: 1, cheese: 2});
      logger.expectNoResult();

      c.remove(fooid);
      logger.expectResultOnly("removed", [fooid]);
      c.remove(barid);
      logger.expectResultOnly("removed", [barid]);

      fooid = c.insert({noodles: "good", bacon: "bad", mac: 1, cheese: 2});

      logger.expectResult("added", [fooid, {noodles: "good", bacon: "bad"}]);
      logger.expectNoResult();
      handle.stop();
      onComplete();
    });
  });
}

Tinytest.addAsync("observeChanges - unordered - specific fields + modify on excluded fields", function (test, onComplete) {
  var c = makeCollection();
  withCallbackLogger(test, ["added", "changed", "removed"], Meteor.isServer, function (logger) {
    var handle = c.find({ mac: 1, cheese: 2 },
                        {fields:{noodles: 1, bacon: 1, eggs: 1}}).observeChanges(logger);
    var fooid = c.insert({noodles: "good", bacon: "bad", apples: "ok", mac: 1, cheese: 2});

    logger.expectResultOnly("added", [fooid, {noodles: "good", bacon: "bad"}]);


    // Noodles go into shadow, mac appears as eggs
    c.update(fooid, {$rename: { noodles: 'shadow', apples: 'eggs' }});
    logger.expectResultOnly("changed",
                            [fooid, {eggs:"ok", noodles: undefined}]);

    c.remove(fooid);
    logger.expectResultOnly("removed", [fooid]);
    logger.expectNoResult();
    handle.stop();
    onComplete();
  });
});

Tinytest.addAsync(
  "observeChanges - unordered - unset parent of observed field",
  function (test, onComplete) {
    var c = makeCollection();
    withCallbackLogger(
      test, ['added', 'changed', 'removed'], Meteor.isServer,
      function (logger) {
        var handle = c.find({}, {fields: {'type.name': 1}}).observeChanges(logger);
        var id = c.insert({ type: { name: 'foobar' } });
        logger.expectResultOnly('added', [id, { type: { name: 'foobar' } }]);

        c.update(id, { $unset: { type: 1 } });
        test.equal(c.find().fetch(), [{ _id: id }]);
        logger.expectResultOnly('changed', [id, { type: undefined }]);

        handle.stop();
        onComplete();
      }
    );
  }
);



Tinytest.addAsync("observeChanges - unordered - enters and exits result set through change", function (test, onComplete) {
  var c = makeCollection();
  withCallbackLogger(test, ["added", "changed", "removed"], Meteor.isServer, function (logger) {
  var handle = c.find({noodles: "good"}).observeChanges(logger);
  var barid = c.insert({thing: "stuff"});

  var fooid = c.insert({noodles: "good", bacon: "bad", apples: "ok"});
  logger.expectResultOnly("added", [fooid, {noodles: "good", bacon: "bad", apples: "ok"}]);

  c.update(fooid, {noodles: "alright", potatoes: "tasty", apples: "ok"});
  logger.expectResultOnly("removed",
                      [fooid]);
  c.remove(fooid);
  c.remove(barid);

  fooid = c.insert({noodles: "ok", bacon: "bad", apples: "ok"});
  c.update(fooid, {noodles: "good", potatoes: "tasty", apples: "ok"});
  logger.expectResult("added", [fooid, {noodles: "good", potatoes: "tasty", apples: "ok"}]);
  logger.expectNoResult();
  handle.stop();
  onComplete();
  });
});


if (Meteor.isServer) {
  testAsyncMulti("observeChanges - tailable", [
    function (test, expect) {
      var self = this;
      var collName = "cap_" + Random.id();
      var coll = new Mongo.Collection(collName);
      coll._createCappedCollection(1000000);
      self.xs = [];
      self.expects = [];
      self.insert = function (fields) {
        coll.insert(_.extend({ts: new MongoInternals.MongoTimestamp(0, 0)},
                             fields));
      };

      // Tailable observe shouldn't show things that are in the initial
      // contents.
      self.insert({x: 1});
      // Wait for one added call before going to the next test function.
      self.expects.push(expect());

      var cursor = coll.find({y: {$ne: 7}}, {tailable: true});
      self.handle = cursor.observeChanges({
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
    },
    function (test, expect) {
      var self = this;
      // The cursors sees the first element.
      test.equal(self.xs, [1]);
      self.xs = [];

      self.insert({x: 2, y: 3});
      self.insert({x: 3, y: 7});  // filtered out by the query
      self.insert({x: 4});
      // Expect two added calls to happen.
      self.expects = [expect(), expect()];
    },
    function (test, expect) {
      var self = this;
      test.equal(self.xs, [2, 4]);
      self.xs = [];
      self.handle.stop();

      self.insert({x: 5});
      // XXX This timeout isn't perfect but it's pretty hard to prove that an
      // event WON'T happen without something like a write fence.
      Meteor.setTimeout(expect(), 1000);
    },
    function (test, expect) {
      var self = this;
      test.equal(self.xs, []);
    }
  ]);
}


testAsyncMulti("observeChanges - bad query", [
  function (test, expect) {
    var c = makeCollection();
    var observeThrows = function () {
      test.throws(function () {
        c.find({__id: {$in: null}}).observeChanges({
          added: function () {
            test.fail("added shouldn't be called");
          }
        });
      }, '$in needs an array');
    };

    if (Meteor.isClient) {
      observeThrows();
      return;
    }

    // Test that if two copies of the same bad observeChanges run in parallel
    // and are de-duped, both observeChanges calls will throw.
    var Fiber = Npm.require('fibers');
    var Future = Npm.require('fibers/future');
    var f1 = new Future;
    var f2 = new Future;
    Fiber(function () {
      // The observeChanges call in here will yield when we talk to mongod,
      // which will allow the second Fiber to start and observe a duplicate
      // query.
      observeThrows();
      f1['return']();
    }).run();
    Fiber(function () {
      test.isFalse(f1.isResolved());  // first observe hasn't thrown yet
      observeThrows();
      f2['return']();
    }).run();
    f1.wait();
    f2.wait();
  }
]);
