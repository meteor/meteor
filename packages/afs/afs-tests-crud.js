import { Tinytest } from 'meteor/tinytest';

// ===========================================================================
// AFS CRUD coverage tests (server-side, MockStreamProvider-backed).
//
// These tests exercise modifier coverage, update shapes, upsert, removeAsync,
// find / selector normalization, and countDocuments / estimatedDocumentCount
// for AFS.Collection. Each test builds its own provider and collection so
// they are self-contained and cannot collide with other tests.
// ===========================================================================

if (Meteor.isServer) {
  // -------------------------------------------------------------------------
  // Test helper: build a fresh MockStreamProvider-backed AFS.Collection.
  // -------------------------------------------------------------------------
  const makeCollection = () => {
    const provider = new AFS.MockStreamProvider();
    const name = 'afs-crud-' + Random.id();
    const collection = new AFS.Collection(name, {
      provider,
      connection: null,
      defineMutationMethods: false,
    });
    return { provider, name, collection };
  };

  // =========================================================================
  // Modifier coverage
  // =========================================================================

  Tinytest.addAsync('afs - crud - $inc increments existing numeric field', async (test) => {
    const { collection } = makeCollection();
    const id = await collection.insertAsync({ counter: 5 });

    const affected = await collection.updateAsync({ _id: id }, { $inc: { counter: 3 } });
    test.equal(affected, 1);

    const doc = await collection.findOneAsync({ _id: id });
    test.equal(doc.counter, 8);
  });

  Tinytest.addAsync('afs - crud - $inc creates field when absent', async (test) => {
    const { collection } = makeCollection();
    const id = await collection.insertAsync({ name: 'no-counter' });

    const affected = await collection.updateAsync({ _id: id }, { $inc: { counter: 7 } });
    test.equal(affected, 1);

    const doc = await collection.findOneAsync({ _id: id });
    test.equal(doc.counter, 7);
    test.equal(doc.name, 'no-counter');
  });

  Tinytest.addAsync('afs - crud - $push appends to array', async (test) => {
    const { collection } = makeCollection();
    const id = await collection.insertAsync({ tags: ['a', 'b'] });

    await collection.updateAsync({ _id: id }, { $push: { tags: 'c' } });

    const doc = await collection.findOneAsync({ _id: id });
    test.equal(doc.tags, ['a', 'b', 'c']);
  });

  Tinytest.addAsync('afs - crud - $push with $each pushes multiple values', async (test) => {
    const { collection } = makeCollection();
    const id = await collection.insertAsync({ tags: ['a'] });

    await collection.updateAsync(
      { _id: id },
      { $push: { tags: { $each: ['b', 'c', 'd'] } } }
    );

    const doc = await collection.findOneAsync({ _id: id });
    test.equal(doc.tags, ['a', 'b', 'c', 'd']);
  });

  Tinytest.addAsync('afs - crud - $pull removes matching elements from array', async (test) => {
    const { collection } = makeCollection();
    const id = await collection.insertAsync({ tags: ['a', 'b', 'c', 'b'] });

    await collection.updateAsync({ _id: id }, { $pull: { tags: 'b' } });

    const doc = await collection.findOneAsync({ _id: id });
    test.equal(doc.tags, ['a', 'c']);
  });

  Tinytest.addAsync('afs - crud - $addToSet adds only if not already present', async (test) => {
    const { collection } = makeCollection();
    const id = await collection.insertAsync({ tags: ['a', 'b'] });

    // Adding 'b' (already present) should not create a duplicate.
    await collection.updateAsync({ _id: id }, { $addToSet: { tags: 'b' } });
    let doc = await collection.findOneAsync({ _id: id });
    test.equal(doc.tags, ['a', 'b']);

    // Adding a new element should append it.
    await collection.updateAsync({ _id: id }, { $addToSet: { tags: 'c' } });
    doc = await collection.findOneAsync({ _id: id });
    test.equal(doc.tags, ['a', 'b', 'c']);
  });

  Tinytest.addAsync('afs - crud - $unset removes the field', async (test) => {
    const { collection } = makeCollection();
    const id = await collection.insertAsync({ name: 'keep', drop: 'gone' });

    const affected = await collection.updateAsync({ _id: id }, { $unset: { drop: '' } });
    test.equal(affected, 1);

    const doc = await collection.findOneAsync({ _id: id });
    test.equal(doc.name, 'keep');
    test.isFalse(Object.prototype.hasOwnProperty.call(doc, 'drop'));
  });

  Tinytest.addAsync('afs - crud - $rename renames field without changing value', async (test) => {
    const { collection } = makeCollection();
    const id = await collection.insertAsync({ oldName: 'value-123' });

    await collection.updateAsync({ _id: id }, { $rename: { oldName: 'newName' } });

    const doc = await collection.findOneAsync({ _id: id });
    test.equal(doc.newName, 'value-123');
    test.isFalse(Object.prototype.hasOwnProperty.call(doc, 'oldName'));
  });

  Tinytest.addAsync('afs - crud - $min only decreases the value', async (test) => {
    const { collection } = makeCollection();
    const id = await collection.insertAsync({ score: 10 });

    // $min with a higher value is a no-op.
    await collection.updateAsync({ _id: id }, { $min: { score: 20 } });
    let doc = await collection.findOneAsync({ _id: id });
    test.equal(doc.score, 10);

    // $min with a lower value decreases.
    await collection.updateAsync({ _id: id }, { $min: { score: 3 } });
    doc = await collection.findOneAsync({ _id: id });
    test.equal(doc.score, 3);
  });

  Tinytest.addAsync('afs - crud - $max only increases the value', async (test) => {
    const { collection } = makeCollection();
    const id = await collection.insertAsync({ score: 10 });

    // $max with a lower value is a no-op.
    await collection.updateAsync({ _id: id }, { $max: { score: 5 } });
    let doc = await collection.findOneAsync({ _id: id });
    test.equal(doc.score, 10);

    // $max with a higher value increases.
    await collection.updateAsync({ _id: id }, { $max: { score: 42 } });
    doc = await collection.findOneAsync({ _id: id });
    test.equal(doc.score, 42);
  });

  Tinytest.addAsync('afs - crud - combined $set and $inc in one call applies both', async (test) => {
    const { collection } = makeCollection();
    const id = await collection.insertAsync({ name: 'old', counter: 1 });

    const affected = await collection.updateAsync(
      { _id: id },
      { $set: { name: 'new' }, $inc: { counter: 4 } }
    );
    test.equal(affected, 1);

    const doc = await collection.findOneAsync({ _id: id });
    test.equal(doc.name, 'new');
    test.equal(doc.counter, 5);
  });

  // =========================================================================
  // Update shapes
  // =========================================================================

  Tinytest.addAsync('afs - crud - updateAsync multi:true updates all matching, leaves others untouched', async (test) => {
    const { collection } = makeCollection();

    const idA1 = await collection.insertAsync({ tag: 'a', val: 1 });
    const idA2 = await collection.insertAsync({ tag: 'a', val: 2 });
    const idB1 = await collection.insertAsync({ tag: 'b', val: 3 });

    const affected = await collection.updateAsync(
      { tag: 'a' },
      { $set: { touched: true } },
      { multi: true }
    );
    test.equal(affected, 2);

    const a1 = await collection.findOneAsync({ _id: idA1 });
    const a2 = await collection.findOneAsync({ _id: idA2 });
    const b1 = await collection.findOneAsync({ _id: idB1 });

    test.equal(a1.touched, true);
    test.equal(a2.touched, true);
    test.isFalse(Object.prototype.hasOwnProperty.call(b1, 'touched'));
  });

  Tinytest.addAsync('afs - crud - updateAsync default (multi omitted) updates at most one doc', async (test) => {
    const { collection } = makeCollection();

    await collection.insertAsync({ tag: 'x', val: 1 });
    await collection.insertAsync({ tag: 'x', val: 2 });
    await collection.insertAsync({ tag: 'x', val: 3 });

    const affected = await collection.updateAsync(
      { tag: 'x' },
      { $set: { touched: true } }
    );
    test.equal(affected, 1);

    const touchedCount = await collection.countDocuments({ touched: true });
    test.equal(touchedCount, 1);
  });

  Tinytest.addAsync('afs - crud - updateAsync multi:false explicitly updates at most one doc', async (test) => {
    const { collection } = makeCollection();

    await collection.insertAsync({ tag: 'y', val: 1 });
    await collection.insertAsync({ tag: 'y', val: 2 });

    const affected = await collection.updateAsync(
      { tag: 'y' },
      { $set: { touched: true } },
      { multi: false }
    );
    test.equal(affected, 1);

    const touchedCount = await collection.countDocuments({ touched: true });
    test.equal(touchedCount, 1);
  });

  Tinytest.addAsync('afs - crud - updateAsync returns numeric updateCount (no _returnObject)', async (test) => {
    // MockStreamProvider delegates to LocalCollection.update, which returns
    // a plain number (updateCount) when _returnObject is not set. This
    // documents the current contract surfaced through collection.updateAsync.
    const { collection } = makeCollection();

    // No matching docs => 0
    const noMatch = await collection.updateAsync(
      { _id: 'does-not-exist' },
      { $set: { x: 1 } }
    );
    test.equal(typeof noMatch, 'number');
    test.equal(noMatch, 0);

    // One match => 1
    const id = await collection.insertAsync({ a: 1 });
    const oneMatch = await collection.updateAsync({ _id: id }, { $set: { a: 2 } });
    test.equal(typeof oneMatch, 'number');
    test.equal(oneMatch, 1);
  });

  Tinytest.addAsync('afs - crud - updateAsync with upsert:true (non-existing) returns numeric 1', async (test) => {
    // collection.upsertAsync calls updateAsync with { upsert: true } — but
    // without _returnObject, so the provider returns a plain number (1 for
    // the inserted row). This matches LocalCollection.updateAsync behavior.
    const { collection } = makeCollection();

    const result = await collection.updateAsync(
      { _id: 'new-via-update-upsert' },
      { $set: { v: 10 } },
      { upsert: true }
    );
    test.equal(typeof result, 'number');
    test.equal(result, 1);

    const doc = await collection.findOneAsync({ _id: 'new-via-update-upsert' });
    test.equal(doc._id, 'new-via-update-upsert');
    test.equal(doc.v, 10);
  });

  // =========================================================================
  // upsert
  // =========================================================================

  Tinytest.addAsync('afs - crud - upsertAsync inserts when no doc matches', async (test) => {
    const { collection } = makeCollection();

    const result = await collection.upsertAsync(
      { _id: 'upsert-new' },
      { $set: { name: 'created', value: 42 } }
    );
    // Documented contract: numeric updateCount (no _returnObject flag is set).
    test.equal(typeof result, 'number');
    test.equal(result, 1);

    const doc = await collection.findOneAsync({ _id: 'upsert-new' });
    test.isTrue(doc !== undefined);
    test.equal(doc._id, 'upsert-new');
    test.equal(doc.name, 'created');
    test.equal(doc.value, 42);

    const count = await collection.countDocuments({});
    test.equal(count, 1);
  });

  Tinytest.addAsync('afs - crud - upsertAsync updates existing doc without duplicating', async (test) => {
    const { collection } = makeCollection();

    const id = await collection.insertAsync({ _id: 'upsert-existing', name: 'original', value: 1 });
    test.equal(id, 'upsert-existing');

    const result = await collection.upsertAsync(
      { _id: 'upsert-existing' },
      { $set: { name: 'updated', value: 99 } }
    );
    test.equal(typeof result, 'number');
    test.equal(result, 1);

    const count = await collection.countDocuments({});
    test.equal(count, 1);

    const doc = await collection.findOneAsync({ _id: 'upsert-existing' });
    test.equal(doc.name, 'updated');
    test.equal(doc.value, 99);
  });

  Tinytest.addAsync('afs - crud - upsertAsync return contract matches updateAsync with upsert:true', async (test) => {
    // Both code paths should yield the same value for the same state change.
    const { collection: c1 } = makeCollection();
    const { collection: c2 } = makeCollection();

    const r1 = await c1.upsertAsync(
      { _id: 'same-id' },
      { $set: { x: 1 } }
    );
    const r2 = await c2.updateAsync(
      { _id: 'same-id' },
      { $set: { x: 1 } },
      { upsert: true }
    );

    test.equal(r1, r2);
    test.equal(r1, 1);
  });

  Tinytest.addAsync('afs - crud - updateAsync with upsert:true behaves identically to upsertAsync (existing doc)', async (test) => {
    const { collection: c1 } = makeCollection();
    const { collection: c2 } = makeCollection();

    await c1.insertAsync({ _id: 'shared', v: 0 });
    await c2.insertAsync({ _id: 'shared', v: 0 });

    const r1 = await c1.upsertAsync({ _id: 'shared' }, { $set: { v: 5 } });
    const r2 = await c2.updateAsync({ _id: 'shared' }, { $set: { v: 5 } }, { upsert: true });

    test.equal(r1, r2);
    test.equal(r1, 1);

    const d1 = await c1.findOneAsync({ _id: 'shared' });
    const d2 = await c2.findOneAsync({ _id: 'shared' });
    test.equal(d1.v, 5);
    test.equal(d2.v, 5);

    test.equal(await c1.countDocuments({}), 1);
    test.equal(await c2.countDocuments({}), 1);
  });

  // =========================================================================
  // removeAsync
  // =========================================================================

  Tinytest.addAsync('afs - crud - removeAsync by _id removes one doc and returns 1', async (test) => {
    const { collection } = makeCollection();

    const keepId = await collection.insertAsync({ keep: true });
    const dropId = await collection.insertAsync({ keep: false });

    const removed = await collection.removeAsync({ _id: dropId });
    test.equal(removed, 1);

    test.equal(await collection.findOneAsync({ _id: dropId }), undefined);
    const kept = await collection.findOneAsync({ _id: keepId });
    test.equal(kept.keep, true);
    test.equal(await collection.countDocuments({}), 1);
  });

  Tinytest.addAsync('afs - crud - removeAsync({}) removes all docs and returns the previous count', async (test) => {
    // Document current behavior: LocalCollection.removeAsync({}) is allowed
    // and returns the number of docs that existed. AFS does not reject it.
    const { collection } = makeCollection();

    await collection.insertAsync({ a: 1 });
    await collection.insertAsync({ a: 2 });
    await collection.insertAsync({ a: 3 });

    const before = await collection.countDocuments({});
    test.equal(before, 3);

    const removed = await collection.removeAsync({});
    test.equal(removed, before);

    const after = await collection.countDocuments({});
    test.equal(after, 0);
  });

  Tinytest.addAsync('afs - crud - removeAsync with selector matching zero docs returns 0', async (test) => {
    const { collection } = makeCollection();

    await collection.insertAsync({ tag: 'keep' });

    const removed = await collection.removeAsync({ tag: 'not-a-match' });
    test.equal(removed, 0);

    // The surviving doc is still there.
    test.equal(await collection.countDocuments({}), 1);
  });

  // =========================================================================
  // find / selector normalization
  // =========================================================================

  Tinytest.addAsync('afs - crud - find(scalar) rewrites to { _id: scalar }', async (test) => {
    const { collection } = makeCollection();

    await collection.insertAsync({ _id: 'abc', name: 'chosen' });
    await collection.insertAsync({ _id: 'def', name: 'other' });

    const docs = collection.find('abc').fetch();
    test.equal(docs.length, 1);
    test.equal(docs[0]._id, 'abc');
    test.equal(docs[0].name, 'chosen');
  });

  Tinytest.addAsync('afs - crud - find([...]) throws because array selectors are rejected', async (test) => {
    const { collection } = makeCollection();

    let threw = false;
    let message = '';
    try {
      collection.find(['abc', 'def']);
    } catch (e) {
      threw = true;
      message = e.message;
    }
    test.isTrue(threw, 'expected find([...]) to throw');
    test.isTrue(/array/i.test(message), `expected error message to mention 'array', got: ${message}`);
  });

  Tinytest.addAsync('afs - crud - find with fields projection returns only _id and selected fields', async (test) => {
    const { collection } = makeCollection();

    await collection.insertAsync({ name: 'A', secret: 's1', other: 1 });
    await collection.insertAsync({ name: 'B', secret: 's2', other: 2 });

    const docs = collection.find({}, { fields: { name: 1 } }).fetch();
    test.equal(docs.length, 2);

    for (const doc of docs) {
      const keys = Object.keys(doc).sort();
      test.equal(keys, ['_id', 'name']);
    }
  });

  Tinytest.addAsync('afs - crud - find with sort descending by value returns docs in descending order', async (test) => {
    const { collection } = makeCollection();

    await collection.insertAsync({ value: 2 });
    await collection.insertAsync({ value: 5 });
    await collection.insertAsync({ value: 1 });
    await collection.insertAsync({ value: 4 });

    const docs = collection.find({}, { sort: { value: -1 } }).fetch();
    test.equal(docs.length, 4);
    test.equal(docs.map(d => d.value), [5, 4, 2, 1]);
  });

  Tinytest.addAsync('afs - crud - find with limit returns at most N docs', async (test) => {
    const { collection } = makeCollection();

    await collection.insertAsync({ value: 1 });
    await collection.insertAsync({ value: 2 });
    await collection.insertAsync({ value: 3 });
    await collection.insertAsync({ value: 4 });

    const docs = collection.find({}, { limit: 2 }).fetch();
    test.equal(docs.length, 2);
  });

  Tinytest.addAsync('afs - crud - find with skip and sort skips the first doc', async (test) => {
    const { collection } = makeCollection();

    await collection.insertAsync({ value: 10 });
    await collection.insertAsync({ value: 20 });
    await collection.insertAsync({ value: 30 });

    const docs = collection.find({}, { skip: 1, sort: { value: 1 } }).fetch();
    test.equal(docs.length, 2);
    test.equal(docs.map(d => d.value), [20, 30]);
  });

  Tinytest.addAsync('afs - crud - findOneAsync returns the single matching doc', async (test) => {
    const { collection } = makeCollection();

    const id = await collection.insertAsync({ kind: 'unique', value: 'abc' });
    await collection.insertAsync({ kind: 'other', value: 'xyz' });

    const doc = await collection.findOneAsync({ kind: 'unique' });
    test.isTrue(doc !== undefined);
    test.equal(doc._id, id);
    test.equal(doc.value, 'abc');
  });

  Tinytest.addAsync('afs - crud - findOneAsync returns undefined when no match', async (test) => {
    const { collection } = makeCollection();

    await collection.insertAsync({ kind: 'present' });

    const doc = await collection.findOneAsync({ kind: 'missing' });
    test.equal(doc, undefined);
  });

  // =========================================================================
  // countDocuments / estimatedDocumentCount
  // =========================================================================

  Tinytest.addAsync('afs - crud - countDocuments({}) returns total count after inserts', async (test) => {
    const { collection } = makeCollection();

    test.equal(await collection.countDocuments({}), 0);

    await collection.insertAsync({ v: 1 });
    await collection.insertAsync({ v: 2 });
    await collection.insertAsync({ v: 3 });

    test.equal(await collection.countDocuments({}), 3);
  });

  Tinytest.addAsync('afs - crud - countDocuments(selector) returns only matching subset', async (test) => {
    const { collection } = makeCollection();

    await collection.insertAsync({ tag: 'a', v: 1 });
    await collection.insertAsync({ tag: 'a', v: 2 });
    await collection.insertAsync({ tag: 'b', v: 3 });
    await collection.insertAsync({ tag: 'a', v: 4 });
    await collection.insertAsync({ tag: 'c', v: 5 });

    test.equal(await collection.countDocuments({ tag: 'a' }), 3);
    test.equal(await collection.countDocuments({ tag: 'b' }), 1);
    test.equal(await collection.countDocuments({ tag: 'c' }), 1);
    test.equal(await collection.countDocuments({ tag: 'none' }), 0);
  });

  Tinytest.addAsync('afs - crud - estimatedDocumentCount returns total document count', async (test) => {
    const { collection } = makeCollection();

    test.equal(await collection.estimatedDocumentCount(), 0);

    await collection.insertAsync({ v: 1 });
    await collection.insertAsync({ v: 2 });

    test.equal(await collection.estimatedDocumentCount(), 2);
  });
}
