// Tests for MongoDB collation support in the mongo package.
// These test that collation options flow through to the MongoDB driver
// and that observeChanges works correctly with collation-aware Minimongo.

var makeCollection = function () {
  return new Mongo.Collection('collation_' + Random.id());
};

if (Meteor.isServer) {

  Tinytest.addAsync(
    'mongo collation - find with case-insensitive collation',
    async function (test) {
      var c = makeCollection();
      var collation = { locale: 'en', strength: 2 };

      await c.insertAsync({ _id: 'a', name: 'Alice' });
      await c.insertAsync({ _id: 'b', name: 'bob' });
      await c.insertAsync({ _id: 'c', name: 'Charlie' });

      // Case-insensitive equality
      var docs = await c.find(
        { name: 'alice' },
        { collation: collation }
      ).fetchAsync();
      test.equal(docs.length, 1);
      test.equal(docs[0].name, 'Alice');

      // Case-insensitive findOne
      var doc = await c.findOneAsync(
        { name: 'BOB' },
        { collation: collation }
      );
      test.isTrue(doc);
      test.equal(doc.name, 'bob');

      // Without collation, no match
      var noMatch = await c.findOneAsync({ name: 'alice' });
      test.isFalse(noMatch);

      await c.dropCollectionAsync();
    }
  );

  Tinytest.addAsync(
    'mongo collation - find with $in operator',
    async function (test) {
      var c = makeCollection();
      var collation = { locale: 'en', strength: 2 };

      await c.insertAsync({ _id: 'a', name: 'Alice' });
      await c.insertAsync({ _id: 'b', name: 'Bob' });
      await c.insertAsync({ _id: 'c', name: 'Charlie' });

      var docs = await c.find(
        { name: { $in: ['alice', 'charlie'] } },
        { collation: collation, sort: { _id: 1 } }
      ).fetchAsync();
      test.equal(docs.length, 2);
      test.equal(docs[0].name, 'Alice');
      test.equal(docs[1].name, 'Charlie');

      await c.dropCollectionAsync();
    }
  );

  Tinytest.addAsync(
    'mongo collation - sort with collation',
    async function (test) {
      var c = makeCollection();
      var collation = { locale: 'en', strength: 2 };

      await c.insertAsync({ _id: 'a', name: 'banana' });
      await c.insertAsync({ _id: 'b', name: 'Apple' });
      await c.insertAsync({ _id: 'c', name: 'cherry' });

      // With collation, sort is case-insensitive
      var docs = await c.find(
        {},
        { collation: collation, sort: { name: 1 } }
      ).fetchAsync();
      test.equal(docs.length, 3);
      test.equal(docs[0].name, 'Apple');
      test.equal(docs[1].name, 'banana');
      test.equal(docs[2].name, 'cherry');

      await c.dropCollectionAsync();
    }
  );

  Tinytest.addAsync(
    'mongo collation - sort with numericOrdering',
    async function (test) {
      var c = makeCollection();
      var collation = { locale: 'en', numericOrdering: true };

      await c.insertAsync({ _id: 'a', val: '2' });
      await c.insertAsync({ _id: 'b', val: '10' });
      await c.insertAsync({ _id: 'c', val: '1' });

      var docs = await c.find(
        {},
        { collation: collation, sort: { val: 1 } }
      ).fetchAsync();
      test.equal(docs.length, 3);
      // Numeric ordering: '1' < '2' < '10'
      test.equal(docs[0].val, '1');
      test.equal(docs[1].val, '2');
      test.equal(docs[2].val, '10');

      await c.dropCollectionAsync();
    }
  );

  Tinytest.addAsync(
    'mongo collation - inequality operators with collation',
    async function (test) {
      var c = makeCollection();
      var collation = { locale: 'en', strength: 2 };

      await c.insertAsync({ _id: 'a', name: 'Alice' });
      await c.insertAsync({ _id: 'b', name: 'Bob' });
      await c.insertAsync({ _id: 'c', name: 'Charlie' });

      // $gt with collation (case-insensitive ordering)
      var docs = await c.find(
        { name: { $gt: 'bob' } },
        { collation: collation, sort: { name: 1 } }
      ).fetchAsync();
      test.equal(docs.length, 1);
      test.equal(docs[0].name, 'Charlie');

      // $lte with collation
      docs = await c.find(
        { name: { $lte: 'bob' } },
        { collation: collation, sort: { name: 1 } }
      ).fetchAsync();
      test.equal(docs.length, 2);
      test.equal(docs[0].name, 'Alice');
      test.equal(docs[1].name, 'Bob');

      await c.dropCollectionAsync();
    }
  );

  Tinytest.addAsync(
    'mongo collation - createIndex with collation',
    async function (test) {
      var c = makeCollection();
      var collation = { locale: 'en', strength: 2 };

      // Create an index with collation
      await c.createIndexAsync(
        { name: 1 },
        { collation: collation }
      );

      // Insert data and verify the index is used
      await c.insertAsync({ _id: 'a', name: 'Alice' });
      await c.insertAsync({ _id: 'b', name: 'Bob' });

      // Queries using the same collation should work
      var doc = await c.findOneAsync(
        { name: 'alice' },
        { collation: collation }
      );
      test.isTrue(doc);
      test.equal(doc.name, 'Alice');

      await c.dropCollectionAsync();
    }
  );

  Tinytest.addAsync(
    'mongo collation - strength 1 ignores accents and case',
    async function (test) {
      var c = makeCollection();
      var collation = { locale: 'en', strength: 1 };

      await c.insertAsync({ _id: 'a', name: 'café' });
      await c.insertAsync({ _id: 'b', name: 'resume' });

      // Strength 1: base characters only (ignore case + accents)
      var doc = await c.findOneAsync(
        { name: 'CAFE' },
        { collation: collation }
      );
      test.isTrue(doc);
      test.equal(doc.name, 'café');

      var doc2 = await c.findOneAsync(
        { name: 'résumé' },
        { collation: collation }
      );
      test.isTrue(doc2);
      test.equal(doc2.name, 'resume');

      await c.dropCollectionAsync();
    }
  );

  Tinytest.addAsync(
    'mongo collation - observeChanges with collation',
    async function (test) {
      var c = makeCollection();
      var collation = { locale: 'en', strength: 2 };
      var addedDocs = [];
      var changedDocs = [];
      var removedIds = [];

      // Insert a document that matches via collation
      await c.insertAsync({ _id: 'x', name: 'Alice' });
      // Insert a document that does NOT match
      await c.insertAsync({ _id: 'y', name: 'Bob' });

      var handle = await c.find(
        { name: 'alice' },
        { collation: collation }
      ).observeChangesAsync({
        added: function (id, fields) {
          addedDocs.push({ id: id, fields: fields });
        },
        changed: function (id, fields) {
          changedDocs.push({ id: id, fields: fields });
        },
        removed: function (id) {
          removedIds.push(id);
        }
      });

      // Initial result should include Alice (matched case-insensitively)
      test.equal(addedDocs.length, 1);
      test.equal(addedDocs[0].id, 'x');
      test.equal(addedDocs[0].fields.name, 'Alice');

      // Update Alice's other field — should trigger changed
      await c.updateAsync('x', { $set: { age: 30 } });
      // Give the observer a moment to fire
      await new Promise(resolve => setTimeout(resolve, 200));
      test.equal(changedDocs.length, 1);
      test.equal(changedDocs[0].id, 'x');
      test.equal(changedDocs[0].fields.age, 30);

      // Insert another doc that matches via collation
      await c.insertAsync({ _id: 'z', name: 'ALICE' });
      await new Promise(resolve => setTimeout(resolve, 200));
      test.equal(addedDocs.length, 2);
      test.equal(addedDocs[1].id, 'z');
      test.equal(addedDocs[1].fields.name, 'ALICE');

      // Remove original Alice — should trigger removed
      await c.removeAsync('x');
      await new Promise(resolve => setTimeout(resolve, 200));
      test.equal(removedIds.length, 1);
      test.equal(removedIds[0], 'x');

      handle.stop();
      await c.dropCollectionAsync();
    }
  );

  Tinytest.addAsync(
    'mongo collation - oplog cursorSupported with collation',
    async function (test) {
      var oplogEnabled = !!MongoInternals.defaultRemoteCollectionDriver().mongo
        ._oplogHandle;

      var c = new Mongo.Collection('collation_oplog_' + Random.id());
      var collation = { locale: 'en', strength: 2 };

      // Collation queries should be supported by oplog (since Minimongo
      // now supports collation natively)
      var handle = await c.find(
        { name: 'test' },
        { collation: collation }
      ).observeChanges({ added: function () {} });

      if (oplogEnabled) {
        test.isTrue(
          handle._multiplexer._observeDriver._usesOplog,
          'Collation queries should use oplog'
        );
      }

      handle.stop();
      await c.dropCollectionAsync();
    }
  );

  Tinytest.addAsync(
    'mongo collation - countDocuments with collation',
    async function (test) {
      var c = makeCollection();
      var collation = { locale: 'en', strength: 2 };

      await c.insertAsync({ _id: 'a', name: 'Alice' });
      await c.insertAsync({ _id: 'b', name: 'alice' });
      await c.insertAsync({ _id: 'c', name: 'Bob' });

      // countDocuments respects collation
      var count = await c.countDocuments(
        { name: 'ALICE' },
        { collation: collation }
      );
      test.equal(count, 2);

      // Without collation, no match
      var noCount = await c.countDocuments({ name: 'ALICE' });
      test.equal(noCount, 0);

      await c.dropCollectionAsync();
    }
  );
}
