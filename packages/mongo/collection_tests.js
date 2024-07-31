
var MongoDB = Meteor.isServer && NpmModuleMongodb;

Tinytest.add(
  'collection - call Mongo.Collection without new',
  function (test) {
    test.throws(function () {
      Mongo.Collection(null);
    });
  }
);

Tinytest.add('collection - call new Mongo.Collection multiple times',
  function (test) {
    var collectionName = 'multiple_times_1_' + test.id;
    new Mongo.Collection(collectionName);

    test.throws(
      function () {
        new Mongo.Collection(collectionName);
      },
      /There is already a collection named/
    );
  }
);

Tinytest.add('collection - call new Mongo.Collection multiple times with _suppressSameNameError=true',
  function (test) {
    var collectionName = 'multiple_times_2_' + test.id;
    new Mongo.Collection(collectionName);

    try {
      new Mongo.Collection(collectionName, {_suppressSameNameError: true});
      test.ok();
    } catch (error) {
      console.log(error);
      test.fail('Expected new Mongo.Collection not to throw an error when called twice with the same name');
    }
  }
);

Tinytest.add('collection - call new Mongo.Collection with defineMutationMethods=false',
  function (test) {
    var handlerPropName = Meteor.isClient ? '_methodHandlers' : 'method_handlers';

    var methodCollectionName = 'hasmethods' + test.id;
    var hasmethods = new Mongo.Collection(methodCollectionName);
    test.equal(typeof hasmethods._connection[handlerPropName]['/' + methodCollectionName + '/insert'], 'function');

    var noMethodCollectionName = 'nomethods' + test.id;
    var nomethods = new Mongo.Collection(noMethodCollectionName, {defineMutationMethods: false});
    test.equal(nomethods._connection[handlerPropName]['/' + noMethodCollectionName + '/insert'], undefined);
  }
);

Tinytest.add('collection - call find with sort function',
  function (test) {
    var initialize = function (collection) {
      collection.insert({a: 2});
      collection.insert({a: 3});
      collection.insert({a: 1});
    };

    var sorter = function (a, b) {
      return a.a - b.a;
    };

    var getSorted = function (collection) {
      return collection.find({}, {sort: sorter}).map(function (doc) { return doc.a; });
    };

    var collectionName = 'sort' + test.id;
    var localCollection = new Mongo.Collection(null);
    var namedCollection = new Mongo.Collection(collectionName, {connection: null});

    initialize(localCollection);
    test.equal(getSorted(localCollection), [1, 2, 3]);

    initialize(namedCollection);
    test.equal(getSorted(namedCollection), [1, 2, 3]);
  }
);

Tinytest.add('collection - call native find with sort function',
  function (test) {
    var collectionName = 'sortNative' + test.id;
    var nativeCollection = new Mongo.Collection(collectionName);

    if (Meteor.isServer) {
      test.throws(
        function () {
          nativeCollection
            .find({}, {
              sort: function () {},
            })
            .map(function (doc) {
              return doc.a;
            });
        },
        /Invalid sort format: undefined Sort must be a valid object/
      );
    }
  }
);

Tinytest.addAsync('collection - calling native find with maxTimeMs should timeout',
  async function(test) {
    if (Meteor.isClient) return;
    var collectionName = 'findOptions1' + test.id;
    var collection = new Mongo.Collection(collectionName);
    await collection.insertAsync({a: 1});


    async function doTest() {
      return collection
        .find({ $where: "sleep(100) || true" }, { maxTimeMs: 50 })
        .countAsync();
    }

    await test.throwsAsync(async () => {
      await doTest();
    });
  }
);


Tinytest.addAsync('collection - calling native find with $reverse hint should reverse on server',
  async function(test) {
    var collectionName = 'findOptions2' + test.id;
    var collection = new Mongo.Collection(collectionName);
    if (Meteor.isServer) {
      await collection.insertAsync({a: 1});
      await collection.insertAsync({a: 2});
    } else {
      collection.insert({ a: 1 });
      collection.insert({ b: 1 });
    }

    function m(doc) { return doc.a; }
    var fwd = await collection.find({}, {hint: {$natural: 1}}).map(m);
    var rev = await collection.find({}, {hint: {$natural: -1}}).map(m);
    if (Meteor.isServer) {
      test.equal(fwd, rev.reverse());
    } else {
      // NOTE: should be documented that hints don't work on client
      test.equal(fwd, rev);
    }
  }
);

Tinytest.addAsync('collection - calling native find with good hint and maxTimeMs should succeed',
  async function(test, done) {
    var collectionName = 'findOptions3' + test.id;
    var collection = new Mongo.Collection(collectionName);
    if (Meteor.isServer) {
      await collection.insertAsync({ a: 1 });
    } else {
      collection.insert({ a: 1 });
    }

    return Promise.resolve(
      Meteor.isServer &&
      collection.rawCollection().createIndex({ a: 1 })
    ).then(async () => {
      test.equal(await collection.find({}, {
        hint: {a: 1},
        maxTimeMs: 1000
      }).countAsync(), 1);
      done();
    }).catch(error => test.fail(error.message));
  }
);

Tinytest.add('collection - calling find with a valid readPreference',
  function(test) {
    if (Meteor.isServer) {
      const defaultReadPreference = 'primary';
      const customReadPreference = 'secondaryPreferred';
      const collection = new Mongo.Collection('readPreferenceTest' + test.id);
      const defaultCursor = collection.find();
      const customCursor = collection.find(
        {},
        { readPreference: customReadPreference }
      );

      // Trigger the creation of _synchronousCursor
      defaultCursor.fetch();
      customCursor.fetch();

      // defaultCursor._synchronousCursor._dbCursor.operation is not an option anymore
      // as the cursor options are now private
      // You can check on abstract_cursor.ts the exposed public getters
      test.equal(
        defaultCursor._synchronousCursor._dbCursor.readPreference
          .mode,
        defaultReadPreference
      );
      test.equal(
        customCursor._synchronousCursor._dbCursor.readPreference.mode,
        customReadPreference
      );
    }
  }
);

Tinytest.addAsync('collection - calling find with an invalid readPreference',
  async function(test) {
    if (Meteor.isServer) {
      const invalidReadPreference = 'INVALID';
      const collection = new Mongo.Collection('readPreferenceTest2' + test.id);
      const cursor = collection.find(
        {},
        { readPreference: invalidReadPreference }
      );

      await test.throwsAsync(async function() {
        // Trigger the creation of _synchronousCursor
        await cursor.countAsync();
      }, `Invalid read preference mode "${invalidReadPreference}"`);
    }
  }
);

Tinytest.addAsync('collection - inserting a document with a binary should return a document with a binary',
  async function(test) {
    if (Meteor.isServer) {
      const collection = new Mongo.Collection('testBinary1' + test.id);
      const _id = Random.id();
      await collection.insertAsync({
        _id,
        binary: new MongoDB.Binary(Buffer.from('hello world'), 6)
      });

      const doc = await collection.findOneAsync({ _id });
      test.ok(
        doc.binary instanceof MongoDB.Binary
      );
      test.equal(
        doc.binary.buffer,
        Buffer.from('hello world')
      );
    }
  }
);

Tinytest.addAsync('collection - inserting a document with a binary (sub type 0) should return a document with a uint8array',
  async function(test) {
    if (Meteor.isServer) {
      const collection = new Mongo.Collection('testBinary8' + test.id);
      const _id = Random.id();
      await collection.insertAsync({
        _id,
        binary: new MongoDB.Binary(Buffer.from('hello world'), 0)
      });

      const doc = await collection.findOneAsync({ _id });
      test.ok(
        doc.binary instanceof Uint8Array
      );
      test.equal(
        doc.binary,
        new Uint8Array(Buffer.from('hello world'))
      );
    }
  }
);

Tinytest.addAsync('collection - updating a document with a binary should return a document with a binary',
  async function(test) {
    if (Meteor.isServer) {
      const collection = new Mongo.Collection('testBinary2' + test.id);
      const _id = Random.id();
      await collection.insertAsync({
        _id
      });

      await collection.updateAsync({ _id }, { $set: { binary: new MongoDB.Binary(Buffer.from('hello world'), 6) } });

      const doc = await collection.findOneAsync({ _id });
      test.ok(
        doc.binary instanceof MongoDB.Binary
      );
      test.equal(
        doc.binary.buffer,
        Buffer.from('hello world')
      );
    }
  }
);

Tinytest.addAsync('collection - updating a document with a binary (sub type 0) should return a document with a uint8array',
  async function(test) {
    if (Meteor.isServer) {
      const collection = new Mongo.Collection('testBinary7' + test.id);
      const _id = Random.id();
      await collection.insertAsync({
        _id
      });

      await collection.updateAsync({ _id }, { $set: { binary: new MongoDB.Binary(Buffer.from('hello world'), 0) } });

      const doc = await collection.findOneAsync({ _id });
      test.ok(
        doc.binary instanceof Uint8Array
      );
      test.equal(
        doc.binary,
        new Uint8Array(Buffer.from('hello world'))
      );
    }
  }
);

Tinytest.addAsync('collection - inserting a document with a uint8array should return a document with a uint8array',
  async function(test) {
    if (Meteor.isServer) {
      const collection = new Mongo.Collection('testBinary3' + test.id);
      const _id = Random.id();
      await collection.insertAsync({
        _id,
        binary: new Uint8Array(Buffer.from('hello world'))
      });

      const doc = await collection.findOneAsync({ _id });
      test.ok(
        doc.binary instanceof Uint8Array
      );
      test.equal(
        doc.binary,
        new Uint8Array(Buffer.from('hello world'))
      );
    }
  }
);

Tinytest.addAsync('collection - updating a document with a uint8array should return a document with a uint8array',
  async function(test) {
    if (Meteor.isServer) {
      const collection = new Mongo.Collection('testBinary4' + test.id);
      const _id = Random.id();
      await collection.insertAsync({
        _id
      });

      await collection.updateAsync(
        { _id },
        { $set: { binary: new Uint8Array(Buffer.from('hello world')) } }
      )

      const doc = await collection.findOneAsync({ _id });
      test.ok(
        doc.binary instanceof Uint8Array
      );
      test.equal(
        doc.binary,
        new Uint8Array(Buffer.from('hello world'))
      );
    }
  }
);

Tinytest.addAsync('collection - finding with a query with a uint8array field should return the correct document',
  async function(test) {
    if (Meteor.isServer) {
      const collection = new Mongo.Collection('testBinary5' + test.id);
      const _id = Random.id();
      await collection.insertAsync({
        _id,
        binary: new Uint8Array(Buffer.from('hello world'))
      });

      const doc = await collection.findOneAsync({ binary: new Uint8Array(Buffer.from('hello world')) });
      test.equal(
        doc._id,
        _id
      );
      await collection.removeAsync({});
    }
  }
);

Tinytest.addAsync('collection - finding with a query with a binary field should return the correct document',
  async function(test) {
    if (Meteor.isServer) {
      const collection = new Mongo.Collection('testBinary6' + test.id);
      const _id = Random.id();
      await collection.insertAsync({
        _id,
        binary: new MongoDB.Binary(Buffer.from('hello world'), 6)
      });

      const doc = await collection.findOneAsync({ binary: new MongoDB.Binary(Buffer.from('hello world'), 6) });
      test.equal(
        doc._id,
        _id
      );
      await collection.removeAsync({});
    }
  }
);


Tinytest.addAsync(
  'collection - count should release the session',
  async function(test) {
    if (Meteor.isServer) {
      const client = MongoInternals.defaultRemoteCollectionDriver().mongo
        .client;
      var collectionName = 'count' + test.id;
      var collection = new Mongo.Collection(collectionName);
      await collection.insertAsync({ _id: '1' });
      await collection.insertAsync({ _id: '2' });
      await collection.insertAsync({ _id: '3' });
      const preCount = client.s.activeSessions.size;

      test.equal(await collection.find().countAsync(), 3);
      // options and selector still work
      test.equal(
        await collection.find({ _id: { $ne: '1' } }, { skip: 1 }).countAsync(),
        1
      );

      // cursor reuse
      const cursor1 = collection.find({ _id: { $ne: '1' } }, { skip: 1 });
      test.equal(await cursor1.countAsync(), 1);
      test.equal((await cursor1.fetchAsync()).length, 1);

      const cursor2 = collection.find({ _id: { $ne: '1' } }, { skip: 1 });
      test.equal((await cursor2.fetchAsync()).length, 1);
      test.equal(await cursor2.countAsync(), 1);

      const postCount = client.s.activeSessions.size;
      test.equal(preCount, postCount);
    }
  }
);


Tinytest.addAsync('collection - should not block on cursor mismatch (#12516)',
  async function(test) {
    if (!Meteor.isServer) {
      return;
    }

    // Setup
    const collection = new Mongo.Collection('test' + test.id);
    for (let i = 0; i < 5; i++) {
      await collection.insertAsync({ name: "Test-" + i });
    }

    // Test
    const cursor = collection.find({ name: undefined });

    let subscription;
    const promise = new Promise((resolve) => {
      setTimeout(() => {
        test.ok(!!subscription);
        resolve();
      }, 500);
    });
    subscription = await cursor.observe({});
    subscription.stop();
    await promise;
  }
);

Tinytest.add('collection - get collection by name',
    function (test) {
        const collectionName = 'get' + test.id;
        const collection = new Mongo.Collection(collectionName);

        test.ok(Mongo.getCollection(collectionName) instanceof Mongo.Collection);
        test.equal(Mongo.getCollection(collectionName), collection);
    }
);


Meteor.isServer && Tinytest.addAsync('collection - simple add', async function(test){
  var collectionName = 'add' + test.id;
  var collection = new Mongo.Collection(collectionName);
  var id = await collection.insertAsync({a: 1});
  test.equal((await collection.findOneAsync(id)).a, 1);
  await collection.upsertAsync(id, {$set: {a: 2}});
  id = await collection.insertAsync({a: 2});
  test.equal((await collection.findOneAsync(id)).a, 2);
  await collection.removeAsync({});
});
