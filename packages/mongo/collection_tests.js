
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
    test.equal(typeof hasmethods._connection[handlerPropName]['/' + methodCollectionName + '/insertAsync'], 'function');

    var noMethodCollectionName = 'nomethods' + test.id;
    var nomethods = new Mongo.Collection(noMethodCollectionName, {defineMutationMethods: false});
    test.equal(nomethods._connection[handlerPropName]['/' + noMethodCollectionName + '/insertAsync'], undefined);
  }
);

Tinytest.addAsync('collection - call find with sort function',
  async function (test) {
    var initialize = async function (collection) {
        await collection.insertAsync({a: 2});
        await collection.insertAsync({a: 3});
        await collection.insertAsync({a: 1});
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

    await initialize(localCollection);
    test.equal(await getSorted(localCollection), [1, 2, 3]);

    await initialize(namedCollection);
    test.equal(await getSorted(namedCollection), [1, 2, 3]);
  }
);

Tinytest.addAsync('collection - call native find with sort function',
  async function (test) {
    var collectionName = 'sortNative' + test.id;
    var nativeCollection = new Mongo.Collection(collectionName);

    if (Meteor.isServer) {
        await test.throwsAsync(
        function () {
          return nativeCollection
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
    var collectionName = 'findOptions1' + test.id;
    var collection = new Mongo.Collection(collectionName);
    await collection.insertAsync({a: 1});

    function doTest() {
      return collection.find({$where: "sleep(100) || true"}, {maxTimeMs: 50}).count();
    }
    if (Meteor.isServer) {
      await test.throwsAsync(doTest);
    }
  }
);


Tinytest.addAsync('collection - calling native find with $reverse hint should reverse on server',
  async function(test) {
    var collectionName = 'findOptions2' + test.id;
    var collection = new Mongo.Collection(collectionName);
    await collection.insertAsync({a: 1});
    await collection.insertAsync({a: 2});

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
    await collection.insertAsync({a: 1});

    if (Meteor.isServer) {
        await collection.rawCollection().createIndex({ a: 1 });
        const count = await collection.find({}, {
            hint: {a: 1},
            maxTimeMs: 1000
        }).count();
        test.equal(count , 1);
        done();
    }
  }
);

Tinytest.addAsync('collection - calling find with a valid readPreference',
  async function(test) {
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
      await defaultCursor.count();
      await customCursor.count();

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
        return await cursor.count();
      }, `Invalid read preference mode "${invalidReadPreference}"`);
    }
  }
);

Tinytest.addAsync('collection - inserting a document with a binary should return a document with a binary',
  async function(test) {
    if (Meteor.isServer) {
      const collection = new Mongo.Collection('testBinary1');
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
      const collection = new Mongo.Collection('testBinary8');
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
      const collection = new Mongo.Collection('testBinary2');
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
      const collection = new Mongo.Collection('testBinary7');
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
      const collection = new Mongo.Collection('testBinary3');
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
      const collection = new Mongo.Collection('testBinary4');
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
      const collection = new Mongo.Collection('testBinary5');
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
      const collection = new Mongo.Collection('testBinary6');
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
