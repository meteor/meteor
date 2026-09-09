// Tests for MongoDB collation support in the mongo package.
//
// Client tests use Mongo.Collection(null) (local-only, backed by Minimongo)
// to verify that the Mongo.Collection API correctly passes collation through.
//
// Server tests use real MongoDB collections to verify the full integration
// path through the MongoDB driver (createIndex, oplog, countDocuments, etc.).

// ── Client tests (Mongo.Collection(null) → Minimongo) ──────────────────────

if (Meteor.isClient) {

  Tinytest.add(
    'mongo collation - client - find with case-insensitive collation',
    function (test) {
      var c = new Mongo.Collection(null);
      var collation = { locale: 'en', strength: 2 };

      c.insert({ _id: 'a', name: 'Alice' });
      c.insert({ _id: 'b', name: 'bob' });
      c.insert({ _id: 'c', name: 'Charlie' });

      // Case-insensitive equality
      var docs = c.find(
        { name: 'alice' },
        { collation: collation }
      ).fetch();
      test.equal(docs.length, 1);
      test.equal(docs[0].name, 'Alice');

      // Case-insensitive findOne
      var doc = c.findOne(
        { name: 'BOB' },
        { collation: collation }
      );
      test.isTrue(doc);
      test.equal(doc.name, 'bob');

      // Without collation, no match
      var noMatch = c.findOne({ name: 'alice' });
      test.isFalse(noMatch);
    }
  );

  Tinytest.add(
    'mongo collation - client - find with $in operator',
    function (test) {
      var c = new Mongo.Collection(null);
      var collation = { locale: 'en', strength: 2 };

      c.insert({ _id: 'a', name: 'Alice' });
      c.insert({ _id: 'b', name: 'Bob' });
      c.insert({ _id: 'c', name: 'Charlie' });

      var docs = c.find(
        { name: { $in: ['alice', 'charlie'] } },
        { collation: collation, sort: { _id: 1 } }
      ).fetch();
      test.equal(docs.length, 2);
      test.equal(docs[0].name, 'Alice');
      test.equal(docs[1].name, 'Charlie');
    }
  );

  Tinytest.add(
    'mongo collation - client - sort with collation',
    function (test) {
      var c = new Mongo.Collection(null);
      var collation = { locale: 'en', strength: 2 };

      c.insert({ _id: 'a', name: 'banana' });
      c.insert({ _id: 'b', name: 'Apple' });
      c.insert({ _id: 'c', name: 'cherry' });

      var docs = c.find(
        {},
        { collation: collation, sort: { name: 1 } }
      ).fetch();
      test.equal(docs.length, 3);
      test.equal(docs[0].name, 'Apple');
      test.equal(docs[1].name, 'banana');
      test.equal(docs[2].name, 'cherry');
    }
  );

  Tinytest.add(
    'mongo collation - client - sort with numericOrdering',
    function (test) {
      var c = new Mongo.Collection(null);
      var collation = { locale: 'en', numericOrdering: true };

      c.insert({ _id: 'a', val: '2' });
      c.insert({ _id: 'b', val: '10' });
      c.insert({ _id: 'c', val: '1' });

      var docs = c.find(
        {},
        { collation: collation, sort: { val: 1 } }
      ).fetch();
      test.equal(docs.length, 3);
      test.equal(docs[0].val, '1');
      test.equal(docs[1].val, '2');
      test.equal(docs[2].val, '10');
    }
  );

  Tinytest.add(
    'mongo collation - client - inequality operators with collation',
    function (test) {
      var c = new Mongo.Collection(null);
      var collation = { locale: 'en', strength: 2 };

      c.insert({ _id: 'a', name: 'Alice' });
      c.insert({ _id: 'b', name: 'Bob' });
      c.insert({ _id: 'c', name: 'Charlie' });

      // $gt with collation (case-insensitive ordering)
      var docs = c.find(
        { name: { $gt: 'bob' } },
        { collation: collation, sort: { name: 1 } }
      ).fetch();
      test.equal(docs.length, 1);
      test.equal(docs[0].name, 'Charlie');

      // $lte with collation
      docs = c.find(
        { name: { $lte: 'bob' } },
        { collation: collation, sort: { name: 1 } }
      ).fetch();
      test.equal(docs.length, 2);
      test.equal(docs[0].name, 'Alice');
      test.equal(docs[1].name, 'Bob');
    }
  );

  Tinytest.add(
    'mongo collation - client - strength 1 ignores accents and case',
    function (test) {
      var c = new Mongo.Collection(null);
      var collation = { locale: 'en', strength: 1 };

      c.insert({ _id: 'a', name: 'café' });
      c.insert({ _id: 'b', name: 'resume' });

      var doc = c.findOne(
        { name: 'CAFE' },
        { collation: collation }
      );
      test.isTrue(doc);
      test.equal(doc.name, 'café');

      var doc2 = c.findOne(
        { name: 'résumé' },
        { collation: collation }
      );
      test.isTrue(doc2);
      test.equal(doc2.name, 'resume');
    }
  );

}

// ── Server tests (real MongoDB) ─────────────────────────────────────────────

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
      await waitUntil(
        () => changedDocs.length === 1,
        { description: 'observer received changed callback after update' }
      );
      test.equal(changedDocs[0].id, 'x');
      test.equal(changedDocs[0].fields.age, 30);

      // Insert another doc that matches via collation
      await c.insertAsync({ _id: 'z', name: 'ALICE' });
      await waitUntil(
        () => addedDocs.length === 2,
        { description: 'observer received added callback for ALICE insert' }
      );
      test.equal(addedDocs[1].id, 'z');
      test.equal(addedDocs[1].fields.name, 'ALICE');

      // Remove original Alice — should trigger removed
      await c.removeAsync('x');
      await waitUntil(
        () => removedIds.length === 1,
        { description: 'observer received removed callback after removing original Alice' }
      );
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

      // Collation queries should be supported by a reactive driver
      // (oplog or change streams), not fall back to polling.
      var handle = await c.find(
        { name: 'test' },
        { collation: collation }
      ).observeChanges({ added: function () {} });

      if (oplogEnabled) {
        var driver = handle._multiplexer._observeDriver;
        test.isTrue(
          driver._usesOplog || driver._usesChangeStreams,
          'Collation queries should use oplog or change streams, not polling'
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
