
var MongoDB = NpmModuleMongodb;

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

Tinytest.add('collection - calling native find with maxTimeMs should timeout',
  function(test) {
    var collectionName = 'findOptions1' + test.id;
    var collection = new Mongo.Collection(collectionName);
    collection.insert({a: 1});

    function doTest() {
      return collection.find({$where: "sleep(100) || true"}, {maxTimeMs: 50}).count();
    }
    if (Meteor.isServer) {
      test.throws(doTest);
    }
  }
);


Tinytest.add('collection - calling native find with $reverse hint should reverse on server',
  function(test) {
    var collectionName = 'findOptions2' + test.id;
    var collection = new Mongo.Collection(collectionName);
    collection.insert({a: 1});
    collection.insert({a: 2});

    function m(doc) { return doc.a; }
    var fwd = collection.find({}, {hint: {$natural: 1}}).map(m);
    var rev = collection.find({}, {hint: {$natural: -1}}).map(m);
    if (Meteor.isServer) {
      test.equal(fwd, rev.reverse());
    } else {
      // NOTE: should be documented that hints don't work on client
      test.equal(fwd, rev);
    }
  }
);

Tinytest.addAsync('collection - calling native find with good hint and maxTimeMs should succeed',
  function(test, done) {
    var collectionName = 'findOptions3' + test.id;
    var collection = new Mongo.Collection(collectionName);
    collection.insert({a: 1});

    Promise.resolve(
      Meteor.isServer &&
        collection.rawCollection().createIndex({ a: 1 })
    ).then(() => {
      test.equal(collection.find({}, {
        hint: {a: 1},
        maxTimeMs: 1000
      }).count(), 1);
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

Tinytest.add('collection - calling find with an invalid readPreference',
  function(test) {
    if (Meteor.isServer) {
      const invalidReadPreference = 'INVALID';
      const collection = new Mongo.Collection('readPreferenceTest2' + test.id);
      const cursor = collection.find(
        {},
        { readPreference: invalidReadPreference }
      );

      test.throws(function() {
        // Trigger the creation of _synchronousCursor
        cursor.count();
      }, `Invalid read preference mode "${invalidReadPreference}"`);
    }
  }
);

Tinytest.add('collection - inserting a document with a binary should return a document with a binary',
  function(test) {
    if (Meteor.isServer) {
      const collection = new Mongo.Collection('testBinary1');
      const _id = Random.id();
      collection.insert({
        _id,
        binary: new MongoDB.Binary(Buffer.from('hello world'), 6)
      });

      const doc = collection.findOne({ _id });
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

Tinytest.add('collection - inserting a document with a binary (sub type 0) should return a document with a uint8array',
  function(test) {
    if (Meteor.isServer) {
      const collection = new Mongo.Collection('testBinary8');
      const _id = Random.id();
      collection.insert({
        _id,
        binary: new MongoDB.Binary(Buffer.from('hello world'), 0)
      });

      const doc = collection.findOne({ _id });
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

Tinytest.add('collection - updating a document with a binary should return a document with a binary',
  function(test) {
    if (Meteor.isServer) {
      const collection = new Mongo.Collection('testBinary2');
      const _id = Random.id();
      collection.insert({
        _id
      });

      collection.update({ _id }, { $set: { binary: new MongoDB.Binary(Buffer.from('hello world'), 6) } });

      const doc = collection.findOne({ _id });
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

Tinytest.add('collection - updating a document with a binary (sub type 0) should return a document with a uint8array',
  function(test) {
    if (Meteor.isServer) {
      const collection = new Mongo.Collection('testBinary7');
      const _id = Random.id();
      collection.insert({
        _id
      });

      collection.update({ _id }, { $set: { binary: new MongoDB.Binary(Buffer.from('hello world'), 0) } });

      const doc = collection.findOne({ _id });
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

Tinytest.add('collection - inserting a document with a uint8array should return a document with a uint8array',
  function(test) {
    if (Meteor.isServer) {
      const collection = new Mongo.Collection('testBinary3');
      const _id = Random.id();
      collection.insert({
        _id,
        binary: new Uint8Array(Buffer.from('hello world'))
      });

      const doc = collection.findOne({ _id });
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

Tinytest.add('collection - updating a document with a uint8array should return a document with a uint8array',
  function(test) {
    if (Meteor.isServer) {
      const collection = new Mongo.Collection('testBinary4');
      const _id = Random.id();
      collection.insert({
        _id
      });

      collection.update(
        { _id },
        { $set: { binary: new Uint8Array(Buffer.from('hello world')) } }
      )

      const doc = collection.findOne({ _id });
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

Tinytest.add('collection - finding with a query with a uint8array field should return the correct document',
  function(test) {
    if (Meteor.isServer) {
      const collection = new Mongo.Collection('testBinary5');
      const _id = Random.id();
      collection.insert({
        _id,
        binary: new Uint8Array(Buffer.from('hello world'))
      });

      const doc = collection.findOne({ binary: new Uint8Array(Buffer.from('hello world')) });
      test.equal(
        doc._id,
        _id
      );
      collection.remove({});
    }
  }
);

Tinytest.add('collection - finding with a query with a binary field should return the correct document',
  function(test) {
    if (Meteor.isServer) {
      const collection = new Mongo.Collection('testBinary6');
      const _id = Random.id();
      collection.insert({
        _id,
        binary: new MongoDB.Binary(Buffer.from('hello world'), 6)
      });

      const doc = collection.findOne({ binary: new MongoDB.Binary(Buffer.from('hello world'), 6) });
      test.equal(
        doc._id,
        _id
      );
      collection.remove({});
    }
  }
);


Tinytest.add('collection - count should release the session',
  function(test) {
    const client = MongoInternals.defaultRemoteCollectionDriver().mongo.client;
    var collectionName = 'count' + test.id;
    var collection = new Mongo.Collection(collectionName);
    collection.insert({ _id: '1' });
    collection.insert({ _id: '2' });
    collection.insert({ _id: '3' });
    const preCount = client.s.activeSessions.size;

    test.equal(collection.find().count(), 3);

    // options and selector still work
    test.equal(collection.find({ _id: { $ne: '1' } }, { skip: 1 }).count(), 1);

    // cursor reuse
    const cursor1 = collection.find({ _id: { $ne: '1' } }, { skip: 1 });
    test.equal(cursor1.count(), 1);
    test.equal(cursor1.fetch().length, 1);

    const cursor2 = collection.find({ _id: { $ne: '1' } }, { skip: 1 });
    test.equal(cursor2.fetch().length, 1);
    test.equal(cursor2.count(), 1);

    const postCount = client.s.activeSessions.size;
    test.equal(preCount, postCount);
  }
);


Tinytest.addAsync('collection - should not block on cursor mismatch (#12516)',
  async function(test) {
    if (!Meteor.isServer) {
      return;
    }

    // Setup
    const collection = new Mongo.Collection('test' + test.id);
    Array.from({ length: 5 }).forEach((_, i) => {
      collection.insert({ name: "Test-" + i });
    });

    // Test
    const cursor = collection.find({ name: undefined });

    let subscription;
    const promise = new Promise((resolve) => {
      setTimeout(() => {
        test.ok(!!subscription);
        resolve();
      }, 500);
    });
    subscription = cursor.observe({});
    subscription.stop();
    await promise;
  }
);



Meteor.isServer && Tinytest.addAsync('collection - simple add', async function(test){ 
  var collectionName = 'add' + test.id;
  var collection = new Mongo.Collection(collectionName);
  var id = await collection.insertAsync({a: 1});
  test.equal((await collection.findOneAsync(id)).a, 1);
  collection.upsertAsync(id, {$set: {a: 2}});
  id = await collection.insertAsync({a: 2});
  test.equal((await collection.findOneAsync(id)).a, 2);
  await collection.removeAsync({});
  
})

