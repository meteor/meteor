var OplogCollection = new Meteor.Collection("oplog-" + Random.id());

Tinytest.add("mongo-livedata - oplog - cursorSupported", function (test) {
  var oplogEnabled =
        !!MongoInternals.defaultRemoteCollectionDriver().mongo._oplogHandle;

  var supported = function (expected, selector, options) {
    var cursor = OplogCollection.find(selector, options);
    var handle = cursor.observeChanges({added: function () {}});
    // If there's no oplog at all, we shouldn't ever use it.
    if (!oplogEnabled)
      expected = false;
    test.equal(!!handle._multiplexer._observeDriver._usesOplog, expected);
    handle.stop();
  };

  supported(true, "asdf");
  supported(true, 1234);
  supported(true, new Meteor.Collection.ObjectID());

  supported(true, {_id: "asdf"});
  supported(true, {_id: 1234});
  supported(true, {_id: new Meteor.Collection.ObjectID()});

  supported(true, {foo: "asdf",
                   bar: 1234,
                   baz: new Meteor.Collection.ObjectID(),
                   eeney: true,
                   miney: false,
                   moe: null});

  supported(true, {});

  supported(true, {$and: [{foo: "asdf"}, {bar: "baz"}]});
  supported(true, {foo: {x: 1}});
  supported(true, {foo: {$gt: 1}});
  supported(true, {foo: [1, 2, 3]});

  // No $where.
  supported(false, {$where: "xxx"});
  supported(false, {$and: [{foo: "adsf"}, {$where: "xxx"}]});
  // No geoqueries.
  supported(false, {x: {$near: [1,1]}});
  // Nothing Minimongo doesn't understand.  (Minimongo happens to fail to
  // implement $elemMatch inside $all which MongoDB supports.)
  supported(false, {x: {$all: [{$elemMatch: {y: 2}}]}});

  supported(true, {}, { sort: {x:1} });
  supported(true, {}, { sort: {x:1}, limit: 5 });
  supported(false, {}, { sort: {$natural:1}, limit: 5 });
  supported(false, {}, { limit: 5 });
  supported(false, {}, { skip: 2, limit: 5 });
  supported(false, {}, { skip: 2 });
});
