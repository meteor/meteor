var OplogCollection = new Meteor.Collection("oplog-" + Random.id());

Tinytest.add("mongo-livedata - oplog - cursorSupported", function (test) {
  var supported = function (expected, selector) {
    var cursor = OplogCollection.find(selector);
    test.equal(
      MongoTest.OplogObserveDriver.cursorSupported(cursor._cursorDescription),
      expected);
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

  supported(false, {$and: [{foo: "asdf"}, {bar: "baz"}]});
  supported(false, {foo: {x: 1}});
  supported(false, {foo: {$gt: 1}});
  supported(false, {foo: [1, 2, 3]});
});
