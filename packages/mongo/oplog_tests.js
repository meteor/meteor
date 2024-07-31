var randomId = Random.id();
var OplogCollection = new Mongo.Collection("oplog-" + randomId);

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
  supported(true, new Mongo.ObjectID());

  supported(true, {_id: "asdf"});
  supported(true, {_id: 1234});
  supported(true, {_id: new Mongo.ObjectID()});

  supported(true, {foo: "asdf",
                   bar: 1234,
                   baz: new Mongo.ObjectID(),
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

process.env.MONGO_OPLOG_URL && testAsyncMulti(
  "mongo-livedata - oplog - entry skipping", [
    function (test, expect) {
      var self = this;
      self.collectionName = Random.id();
      self.collection = new Mongo.Collection(self.collectionName);
      self.collection.createIndex({species: 1});

      // Fill collection with lots of irrelevant objects (red cats) and some
      // relevant ones (blue dogs).

      // After updating to mongo 3.2 with the 2.1.18 driver it was no longer
      // possible to make this test fail with TOO_FAR_BEHIND = 2000.
      // The documents waiting to be processed would hardly go beyond 1000
      // using mongo 3.2 with WiredTiger
      MongoInternals.defaultRemoteCollectionDriver()
        .mongo._oplogHandle._defineTooFarBehind(500);

      self.IRRELEVANT_SIZE = 15000;
      self.RELEVANT_SIZE = 10;
      var docs = [];
      var i;
      for (i = 0; i < self.IRRELEVANT_SIZE; ++i) {
        docs.push({
          name: "cat " + i,
          species: 'cat',
          color: 'red'
        });
      }
      for (i = 0; i < self.RELEVANT_SIZE; ++i) {
        docs.push({
          name: "dog " + i,
          species: 'dog',
          color: 'blue'
        });
      }
      // XXX implement bulk insert #1255
      var rawCollection = self.collection.rawCollection();
      rawCollection.insertMany(docs, Meteor.bindEnvironment(expect(function (err) {
        test.isFalse(err);
      })));
    },

    function (test, expect) {
      var self = this;

      test.equal(self.collection.find().count(),
                 self.IRRELEVANT_SIZE + self.RELEVANT_SIZE);

      var blueDog5Id = null;
      var gotSpot = false;

      // Watch for blue dogs.
      const gotSpotPromise = new Promise(resolve => {
        self.subHandle = self.collection.find({
          species: 'dog',
          color: 'blue',
        }).observeChanges({
          added(id, fields) {
            if (fields.name === 'dog 5') {
              blueDog5Id = id;
            }
          },
          changed(id, fields) {
            if (EJSON.equals(id, blueDog5Id) &&
                fields.name === 'spot') {
              gotSpot = true;
              resolve();
            }
          },
        });
      });

      test.isTrue(self.subHandle._multiplexer._observeDriver._usesOplog);
      test.isTrue(blueDog5Id);
      test.isFalse(gotSpot);

      self.skipped = false;
      self.skipHandle = MongoInternals.defaultRemoteCollectionDriver()
        .mongo._oplogHandle.onSkippedEntries(function () {
          self.skipped = true;
        });

      // Dye all the cats blue. This adds lots of oplog mentries that look like
      // they might in theory be relevant (since they say "something you didn't
      // know about is now blue", and who knows, maybe it's a dog) which puts
      // the OplogObserveDriver into FETCHING mode, which performs poorly.
      self.collection.update({species: 'cat'},
                             {$set: {color: 'blue'}},
                             {multi: true});
      self.collection.update(blueDog5Id, {$set: {name: 'spot'}});

      // We ought to see the spot change soon!
      return gotSpotPromise;
    },

    function (test, expect) {
      var self = this;
      test.isTrue(self.skipped);

      //This gets the TOO_FAR_BEHIND back to its initial value
      MongoInternals.defaultRemoteCollectionDriver()
        .mongo._oplogHandle._resetTooFarBehind();

      self.skipHandle.stop();
      self.subHandle.stop();
      self.collection.remove({});
    }
  ]
);

import { Mongo, MongoInternals } from 'meteor/mongo';

process.env.MONGO_OPLOG_URL && Tinytest.addAsync(
  'mongo-livedata - oplog - x - implicit collection creation',
  async test => {
    const collection = new Mongo.Collection(`oplog-implicit-${test.runId()}`);
    const { client } = MongoInternals.defaultRemoteCollectionDriver().mongo;
    test.equal(await collection.find().countAsync(), 0);
    await client.withSession(async session => {
      await session.withTransaction(async () => {
        await collection.rawCollection().insertOne({}, { session });
      });
    });
    test.equal(await collection.find().countAsync(), 1);
  },
);

const defaultOplogHandle = MongoInternals.defaultRemoteCollectionDriver().mongo._oplogHandle;
let previousMongoPackageSettings = {};

async function oplogOptionsTest({
  test,
  includeCollectionName,
  excludeCollectionName,
  mongoPackageSettings = {}
}) {
  try {
    previousMongoPackageSettings = { ...(Meteor.settings?.packages?.mongo || {}) };
    if (!Meteor.settings.packages) Meteor.settings.packages = {};
    Meteor.settings.packages.mongo = mongoPackageSettings;

    const myOplogHandle = new MongoInternals.OplogHandle(process.env.MONGO_OPLOG_URL, 'meteor');
    MongoInternals.defaultRemoteCollectionDriver().mongo._setOplogHandle(myOplogHandle);

    const IncludeCollection = new Mongo.Collection(includeCollectionName);
    const ExcludeCollection = new Mongo.Collection(excludeCollectionName);

    const shouldBeTracked = new Promise((resolve) => {
      IncludeCollection.find({ include: 'yes' }).observeChanges({
        added(id, fields) { resolve(true) }
      });
    });
    const shouldBeIgnored = new Promise((resolve, reject) => {
      ExcludeCollection.find({ include: 'no' }).observeChanges({
        added(id, fields) { 
          // should NOT fire, because this is an excluded collection:
          reject(false);
        }
      });
      // we give it just 2 seconds until we resolve this promise:
      setTimeout(() => {
        resolve(true);
      }, 2000);
    });

    // do the inserts:
    await IncludeCollection.rawCollection().insertOne({ include: 'yes', foo: 'bar' });
    await ExcludeCollection.rawCollection().insertOne({ include: 'no', foo: 'bar' });

    test.equal(await shouldBeTracked, true);
    test.equal(await shouldBeIgnored, true);
  } finally {
    // Reset:
    Meteor.settings.packages.mongo = { ...previousMongoPackageSettings };
    MongoInternals.defaultRemoteCollectionDriver().mongo._setOplogHandle(defaultOplogHandle);
  }
}

process.env.MONGO_OPLOG_URL && Tinytest.addAsync(
  'mongo-livedata - oplog - oplogSettings - oplogExcludeCollections',
  async test => {
    const collectionNameA = "oplog-a-" + Random.id();
    const collectionNameB = "oplog-b-" + Random.id();
    const mongoPackageSettings = {
      oplogExcludeCollections: [collectionNameB]
    };
    await oplogOptionsTest({
      test,
      includeCollectionName: collectionNameA,
      excludeCollectionName: collectionNameB,
      mongoPackageSettings
    });
  }
);

process.env.MONGO_OPLOG_URL && Tinytest.addAsync(
  'mongo-livedata - oplog - oplogSettings - oplogIncludeCollections',
  async test => {
    const collectionNameA = "oplog-a-" + Random.id();
    const collectionNameB = "oplog-b-" + Random.id();
    const mongoPackageSettings = {
      oplogIncludeCollections: [collectionNameB]
    };
    await oplogOptionsTest({
      test,
      includeCollectionName: collectionNameB,
      excludeCollectionName: collectionNameA,
      mongoPackageSettings
    });
  }
);

process.env.MONGO_OPLOG_URL && Tinytest.addAsync(
  'mongo-livedata - oplog - oplogSettings - oplogExcludeCollections & oplogIncludeCollections',
  async test => {
    // should fail, because we don't allow including and excluding at the same time!
    const collectionNameA = "oplog-a-" + Random.id();
    const collectionNameB = "oplog-b-" + Random.id();
    const mongoPackageSettings = {
      oplogIncludeCollections: [collectionNameA],
      oplogExcludeCollections: [collectionNameB]
    };
    try {
      await oplogOptionsTest({
        test,
        includeCollectionName: collectionNameA,
        excludeCollectionName: collectionNameB,
        mongoPackageSettings
      });
      test.fail();
    } catch (err) {
      test.expect_fail();
    }
  }
);

// Meteor.isServer && Tinytest.addAsync(
//   "mongo-livedata - oplog - _onFailover",
//   async function (test) {
//     const driver = MongoInternals.defaultRemoteCollectionDriver();
//     const failoverPromise = new Promise(resolve => {
//       driver.mongo._onFailover(() => {
//         resolve(true);
//       });
//     });
//
//
//     await driver.mongo.db.admin().command({
//       replSetStepDown: 1,
//       force: true
//     });
//
//     try {
//       const result = await failoverPromise;
//       test.isTrue(result);
//     } catch (e) {
//       test.fail({ message: "Error waiting on Promise", value: JSON.stringify(e) });
//     }
//   });
