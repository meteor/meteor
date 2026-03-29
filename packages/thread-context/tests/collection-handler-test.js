const testCollName = 'thread_context_col_test';
const TestCollection = new Mongo.Collection(testCollName);

if (Meteor.isServer) {

Tinytest.addAsync('thread-context - CollectionHandler - findOneAsync', async function (test) {
  const { CollectionHandler } = require('meteor/thread-context');
  await TestCollection.removeAsync({});
  await TestCollection.insertAsync({ _id: 'doc1', value: 42 });

  const handler = new CollectionHandler({ userId: null, connectionId: null });
  const result = await handler.handle({
    collectionName: testCollName,
    op: 'findOneAsync',
    args: [{ _id: 'doc1' }],
  });

  test.equal(result.value, 42);
});

Tinytest.addAsync('thread-context - CollectionHandler - insertAsync', async function (test) {
  const { CollectionHandler } = require('meteor/thread-context');
  await TestCollection.removeAsync({});

  const handler = new CollectionHandler({ userId: null, connectionId: null });
  const id = await handler.handle({
    collectionName: testCollName,
    op: 'insertAsync',
    args: [{ value: 'inserted' }],
  });

  test.isTrue(typeof id === 'string');
  const doc = await TestCollection.findOneAsync({ _id: id });
  test.equal(doc.value, 'inserted');
});

Tinytest.addAsync('thread-context - CollectionHandler - updateAsync', async function (test) {
  const { CollectionHandler } = require('meteor/thread-context');
  await TestCollection.removeAsync({});
  await TestCollection.insertAsync({ _id: 'u1', count: 0 });

  const handler = new CollectionHandler({ userId: null, connectionId: null });
  const affected = await handler.handle({
    collectionName: testCollName,
    op: 'updateAsync',
    args: [{ _id: 'u1' }, { $set: { count: 5 } }],
  });

  test.equal(affected, 1);
  const doc = await TestCollection.findOneAsync({ _id: 'u1' });
  test.equal(doc.count, 5);
});

Tinytest.addAsync('thread-context - CollectionHandler - removeAsync', async function (test) {
  const { CollectionHandler } = require('meteor/thread-context');
  await TestCollection.removeAsync({});
  await TestCollection.insertAsync({ _id: 'r1' });

  const handler = new CollectionHandler({ userId: null, connectionId: null });
  const removed = await handler.handle({
    collectionName: testCollName,
    op: 'removeAsync',
    args: [{ _id: 'r1' }],
  });

  test.equal(removed, 1);
});

Tinytest.addAsync('thread-context - CollectionHandler - upsertAsync', async function (test) {
  const { CollectionHandler } = require('meteor/thread-context');
  await TestCollection.removeAsync({});

  const handler = new CollectionHandler({ userId: null, connectionId: null });
  const result = await handler.handle({
    collectionName: testCollName,
    op: 'upsertAsync',
    args: [{ _id: 'ups1' }, { $set: { value: 'upserted' } }],
  });

  test.isTrue(result.numberAffected >= 1);
  const doc = await TestCollection.findOneAsync({ _id: 'ups1' });
  test.equal(doc.value, 'upserted');
});

Tinytest.addAsync('thread-context - CollectionHandler - find.fetchAsync', async function (test) {
  const { CollectionHandler } = require('meteor/thread-context');
  await TestCollection.removeAsync({});
  await TestCollection.insertAsync({ _id: 'f1', sort: 1 });
  await TestCollection.insertAsync({ _id: 'f2', sort: 2 });

  const handler = new CollectionHandler({ userId: null, connectionId: null });
  const docs = await handler.handle({
    collectionName: testCollName,
    op: 'find.fetchAsync',
    args: [{}, { sort: { sort: 1 } }],
  });

  test.equal(docs.length, 2);
  test.equal(docs[0]._id, 'f1');
  test.equal(docs[1]._id, 'f2');
});

Tinytest.addAsync('thread-context - CollectionHandler - find.countAsync', async function (test) {
  const { CollectionHandler } = require('meteor/thread-context');
  await TestCollection.removeAsync({});
  await TestCollection.insertAsync({ _id: 'c1' });
  await TestCollection.insertAsync({ _id: 'c2' });

  const handler = new CollectionHandler({ userId: null, connectionId: null });
  const count = await handler.handle({
    collectionName: testCollName,
    op: 'find.countAsync',
    args: [{}],
  });

  test.equal(count, 2);
});

Tinytest.addAsync('thread-context - CollectionHandler - aggregate', async function (test) {
  const { CollectionHandler } = require('meteor/thread-context');
  await TestCollection.removeAsync({});
  await TestCollection.insertAsync({ _id: 'a1', group: 'x', val: 10 });
  await TestCollection.insertAsync({ _id: 'a2', group: 'x', val: 20 });
  await TestCollection.insertAsync({ _id: 'a3', group: 'y', val: 5 });

  const handler = new CollectionHandler({ userId: null, connectionId: null });
  const result = await handler.handle({
    collectionName: testCollName,
    op: 'aggregate',
    args: [[
      { $group: { _id: '$group', total: { $sum: '$val' } } },
      { $sort: { _id: 1 } },
    ]],
  });

  test.equal(result.length, 2);
  test.equal(result[0]._id, 'x');
  test.equal(result[0].total, 30);
  test.equal(result[1]._id, 'y');
  test.equal(result[1].total, 5);
});

Tinytest.addAsync('thread-context - CollectionHandler - unknown collection', async function (test) {
  const { CollectionHandler } = require('meteor/thread-context');
  const handler = new CollectionHandler({ userId: null, connectionId: null });

  await test.throwsAsync(async () => {
    await handler.handle({
      collectionName: 'nonexistent_collection_xyz',
      op: 'findOneAsync',
      args: [{}],
    });
  });
});

Tinytest.addAsync('thread-context - CollectionHandler - unknown operation', async function (test) {
  const { CollectionHandler } = require('meteor/thread-context');
  const handler = new CollectionHandler({ userId: null, connectionId: null });

  await test.throwsAsync(async () => {
    await handler.handle({
      collectionName: testCollName,
      op: 'badOp',
      args: [],
    });
  });
});

} // end Meteor.isServer
