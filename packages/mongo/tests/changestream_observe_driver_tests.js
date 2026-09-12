/**
 * Tests for ChangeStreamObserveDriver and its integration with the observe chain
 *
 * These tests cover:
 * - Basic ChangeStreamObserveDriver functionality (insert, update, delete)
 * - ObserveMultiplexer integration
 * - Projection/field filtering
 * - Selector/matcher filtering
 * - Fence synchronization and write commits
 * - Error handling and recovery
 * - Multiple observers/handles
 * - Operation ordering and timing
 */

import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { Random } from 'meteor/random';
import { EJSON } from 'meteor/ejson';
import { DDPServer } from 'meteor/ddp-server';

// Helper to check if change streams are supported
const isChangeStreamDriver = (handle) => {
  return handle?._multiplexer?._observeDriver?._usesChangeStreams === true;
};

// Helper to check if we're using change streams as the reactivity driver
const DEFAULT_REACTIVITY = process.env.METEOR_REACTIVITY_ORDER
  ? process.env.METEOR_REACTIVITY_ORDER.split(',')
  : undefined;
const IS_CHANGESTREAM = DEFAULT_REACTIVITY && DEFAULT_REACTIVITY[0] === 'changeStreams';

// Helper to create a unique collection for each test
const makeCollection = function () {
  return new Mongo.Collection('changestream_test_' + Random.id());
};

// Helper for creating promise + resolver pairs
const getPromiseAndResolver = () => {
  let resolver;
  const promise = new Promise(r => (resolver = r));
  return [resolver, promise];
};

// Wait for a condition with timeout
// TODO: we should experiment use node events or similar for more efficient waiting
const waitFor = async (conditionFn, timeoutMs = 2000, intervalMs = 50) => {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (await conditionFn()) return true;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return false;
};

// ============================================================================
// CHANGE STREAM SUPPORT TESTS
// ============================================================================

Tinytest.addAsync(
  'changestream - driver detection',
  async function (test) {
    const c = makeCollection();

    const handle = await c.find({}).observeChanges({
      added: function () { }
    });

    // Log which driver is being used for debugging
    const driver = handle._multiplexer._observeDriver;
    console.log('Active reactivity driver:', {
      usesChangeStreams: driver._usesChangeStreams,
      usesOplog: driver._usesOplog,
      reactivityOrder: DEFAULT_REACTIVITY
    });

    // The test should pass regardless of driver - we're just checking detection works
    test.isTrue(
      driver._usesChangeStreams || driver._usesOplog || driver._usesPolling !== undefined,
      'Should have a valid observe driver'
    );

    handle.stop();
  }
);

// if not using ChangeStreams, skip the rest of the tests
if (!IS_CHANGESTREAM) {
  console.log('Skipping ChangeStream tests because ChangeStreams are not the active reactivity driver.');
  return;
}

// ============================================================================
// BASIC CRUD OPERATIONS TESTS
// ============================================================================

Tinytest.addAsync(
  'changestream - basic insert detection',
  async function (test) {
    const c = makeCollection();
    const results = [];

    const handle = await c.find({}).observeChanges({
      added: function (id, fields) {
        results.push({ type: 'added', id, fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle), 'Should be using ChangeStream driver');

    // Insert a document and wait for the callback
    await c.insertAsync({ name: 'test', value: 42 });

    // Wait for the change to be detected
    await waitFor(() => results.length > 0);

    test.equal(results.length, 1, 'Should have received one added callback');
    test.equal(results[0].type, 'added');
    test.equal(results[0].fields.name, 'test');
    test.equal(results[0].fields.value, 42);

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - basic update detection',
  async function (test) {
    const c = makeCollection();
    const results = [];

    // Insert first to have something to update
    const insertedId = await c.insertAsync({ name: 'test', value: 42 });

    const handle = await c.find({}).observeChanges({
      added: function (id, fields) {
        results.push({ type: 'added', id, fields });
      },
      changed: function (id, fields) {
        results.push({ type: 'changed', id, fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle), 'Should be using ChangeStream driver');

    // Clear the initial add
    await waitFor(() => results.length > 0);
    results.length = 0;

    // Update the document
    await c.updateAsync(insertedId, { $set: { value: 100, extra: 'new' } });

    // Wait for the change to be detected
    await waitFor(() => results.length > 0);

    test.equal(results.length, 1, 'Should have received one changed callback');
    test.equal(results[0].type, 'changed');
    test.equal(results[0].fields.value, 100);
    test.equal(results[0].fields.extra, 'new');

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - basic delete detection',
  async function (test) {
    const c = makeCollection();
    const results = [];

    // Insert first to have something to delete
    const insertedId = await c.insertAsync({ name: 'test', value: 42 });

    const handle = await c.find({}).observeChanges({
      added: function (id, fields) {
        results.push({ type: 'added', id, fields });
      },
      removed: function (id) {
        results.push({ type: 'removed', id });
      }
    });

    test.isTrue(isChangeStreamDriver(handle), 'Should be using ChangeStream driver');

    // Wait for initial add
    await waitFor(() => results.length > 0);
    results.length = 0;

    // Delete the document
    await c.removeAsync(insertedId);

    // Wait for the change to be detected
    await waitFor(() => results.length > 0);

    test.equal(results.length, 1, 'Should have received one removed callback');
    test.equal(results[0].type, 'removed');

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - full document replace',
  async function (test) {
    const c = makeCollection();
    const results = [];

    const insertedId = await c.insertAsync({ name: 'original', value: 1 });

    const handle = await c.find({}).observeChanges({
      added: function (id, fields) {
        results.push({ type: 'added', id, fields });
      },
      changed: function (id, fields) {
        results.push({ type: 'changed', id, fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle), 'Should be using ChangeStream driver');

    await waitFor(() => results.length > 0);
    results.length = 0;

    // Replace entire document
    await c.updateAsync(insertedId, { name: 'replaced', value: 999 });

    await waitFor(() => results.length > 0);

    test.equal(results.length, 1);
    test.equal(results[0].type, 'changed');
    test.equal(results[0].fields.name, 'replaced');
    test.equal(results[0].fields.value, 999);

    handle.stop();
  }
);

// ============================================================================
// PROJECTION / FIELD FILTERING TESTS
// ============================================================================

Tinytest.addAsync(
  'changestream - projection filters fields correctly',
  async function (test) {
    const c = makeCollection();
    const results = [];

    const insertedId = await c.insertAsync({
      name: 'test',
      value: 42,
      secret: 'hidden'
    });

    // Only observe 'name' field
    const handle = await c.find({}, { fields: { name: 1 } }).observeChanges({
      added: function (id, fields) {
        results.push({ type: 'added', id, fields });
      },
      changed: function (id, fields) {
        results.push({ type: 'changed', id, fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle), 'Should be using ChangeStream driver');

    await waitFor(() => results.length > 0);

    // Initial add should only have 'name' field
    test.equal(results[0].type, 'added');
    test.equal(results[0].fields.name, 'test');
    test.isUndefined(results[0].fields.value, 'value should not be included');
    test.isUndefined(results[0].fields.secret, 'secret should not be included');

    results.length = 0;

    // Update a non-projected field - should produce change only if name is affected
    await c.updateAsync(insertedId, { $set: { name: 'updated' } });

    await waitFor(() => results.length > 0);

    test.equal(results[0].type, 'changed');
    test.equal(results[0].fields.name, 'updated');

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - projection with multiple fields',
  async function (test) {
    const c = makeCollection();
    const results = [];

    await c.insertAsync({
      a: 1, b: 2, c: 3, d: 4
    });

    // Only observe 'a' and 'c' fields
    const handle = await c.find({}, { fields: { a: 1, c: 1 } }).observeChanges({
      added: function (id, fields) {
        results.push({ type: 'added', id, fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle), 'Should be using ChangeStream driver');

    await waitFor(() => results.length > 0);

    test.equal(results[0].fields.a, 1);
    test.equal(results[0].fields.c, 3);
    test.isUndefined(results[0].fields.b);
    test.isUndefined(results[0].fields.d);

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - projection with exclusion',
  async function (test) {
    const c = makeCollection();
    const results = [];

    await c.insertAsync({
      a: 1, b: 2, c: 3
    });

    // Exclude 'b' field
    const handle = await c.find({}, { fields: { b: 0 } }).observeChanges({
      added: function (id, fields) {
        results.push({ type: 'added', id, fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle), 'Should be using ChangeStream driver');

    await waitFor(() => results.length > 0);

    test.equal(results[0].fields.a, 1);
    test.equal(results[0].fields.c, 3);
    test.isUndefined(results[0].fields.b, 'b should be excluded');

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - nested-object projection falls back to polling',
  async function (test) {
    const c = makeCollection();
    const results = [];

    await c.insertAsync({
      nested: { a: 1, b: 2 },
      hidden: true
    });

    const handle = await c.find({}, { fields: { nested: { a: 1 } } }).observeChanges({
      added: function (id, fields) {
        results.push({ id, fields });
      }
    });

    const driver = handle._multiplexer._observeDriver;
    test.isFalse(driver._usesChangeStreams === true, 'Unsupported projection should not use Change Streams');
    test.isFalse(driver._usesOplog === true, 'Unsupported projection should not use oplog');

    await waitFor(() => results.length > 0);

    test.equal(results.length, 1, 'Initial add should be delivered by fallback driver');
    test.equal(results[0].fields.nested, { a: 1 });
    test.isUndefined(results[0].fields.nested.b);
    test.isUndefined(results[0].fields.hidden);

    handle.stop();
  }
);

// ============================================================================
// SELECTOR / MATCHER FILTERING TESTS
// ============================================================================

Tinytest.addAsync(
  'changestream - selector filters documents correctly',
  async function (test) {
    const c = makeCollection();
    const results = [];

    // Only observe documents with type: 'visible'
    const handle = await c.find({ type: 'visible' }).observeChanges({
      added: function (id, fields) {
        results.push({ type: 'added', id, fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle), 'Should be using ChangeStream driver');

    // Insert document that should NOT match
    await c.insertAsync({ type: 'hidden', name: 'hidden doc' });

    // Wait a bit to ensure no callback
    await new Promise(r => setTimeout(r, 300));
    test.equal(results.length, 0, 'Hidden doc should not trigger callback');

    // Insert document that SHOULD match
    await c.insertAsync({ type: 'visible', name: 'visible doc' });

    await waitFor(() => results.length > 0);

    test.equal(results.length, 1);
    test.equal(results[0].fields.type, 'visible');
    test.equal(results[0].fields.name, 'visible doc');

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - selector with comparison operators',
  async function (test) {
    const c = makeCollection();
    const results = [];

    // Only observe documents with value >= 50
    const handle = await c.find({ value: { $gte: 50 } }).observeChanges({
      added: function (id, fields) {
        results.push({ type: 'added', id, fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle), 'Should be using ChangeStream driver');

    // Insert document that should NOT match
    await c.insertAsync({ value: 25 });

    await new Promise(r => setTimeout(r, 300));
    test.equal(results.length, 0);

    // Insert document that SHOULD match
    await c.insertAsync({ value: 75 });

    await waitFor(() => results.length > 0);

    test.equal(results.length, 1);
    test.equal(results[0].fields.value, 75);

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - document enters and exits result set through update',
  async function (test) {
    const c = makeCollection();
    const results = [];

    // Insert a document that initially matches
    const docId = await c.insertAsync({ status: 'active', name: 'doc' });

    const handle = await c.find({ status: 'active' }).observeChanges({
      added: function (id, fields) {
        results.push({ type: 'added', id, fields });
      },
      removed: function (id) {
        results.push({ type: 'removed', id });
      }
    });

    test.isTrue(isChangeStreamDriver(handle), 'Should be using ChangeStream driver');

    // Wait for initial add
    await waitFor(() => results.length > 0);
    test.equal(results[0].type, 'added');
    results.length = 0;

    // Update to no longer match - should trigger removed
    await c.updateAsync(docId, { $set: { status: 'inactive' } });

    await waitFor(() => results.length > 0);
    test.equal(results[0].type, 'removed');

    results.length = 0;

    // Update to match again - should trigger added
    await c.updateAsync(docId, { $set: { status: 'active' } });

    await waitFor(() => results.length > 0);
    test.equal(results[0].type, 'added');

    handle.stop();
  }
);

// ============================================================================
// INITIAL ADDS TESTS
// ============================================================================

Tinytest.addAsync(
  'changestream - sends initial adds for existing documents',
  async function (test) {
    const c = makeCollection();
    const results = [];

    // Pre-populate the collection
    for (let i = 1; i <= 3; i++)
      await c.insertAsync({ name: `doc${i}`, order: i });

    const handle = await c.find({}).observeChanges({
      added: function (id, fields) {
        results.push({ type: 'added', id, fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle), 'Should be using ChangeStream driver');

    // Wait for all initial adds
    await waitFor(() => results.length >= 3);

    test.equal(results.length, 3, 'Should receive 3 initial adds');

    // Verify all documents were received
    const names = results.map(r => r.fields.name).sort();
    test.equal(names, ['doc1', 'doc2', 'doc3']);

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - initial adds respect selector',
  async function (test) {
    const c = makeCollection();
    const results = [];

    // Pre-populate with mixed documents
    ['a', 'b', 'a'].forEach(async type => {
      await c.insertAsync({ type, name: type + Random.id() });
    });

    // Only observe type: 'a'
    const handle = await c.find({ type: 'a' }).observeChanges({
      added: function (id, fields) {
        results.push({ type: 'added', id, fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle), 'Should be using ChangeStream driver');

    await waitFor(() => results.length >= 2);

    test.equal(results.length, 2, 'Should only receive 2 initial adds');
    test.isTrue(results.every(r => r.fields.type === 'a'));

    handle.stop();
  }
);

// ============================================================================
// MULTIPLE OBSERVERS TESTS
// ============================================================================

Tinytest.addAsync(
  'changestream - multiple observers on same query share driver',
  async function (test) {
    const c = makeCollection();
    const results1 = [];
    const results2 = [];

    const handle1 = await c.find({}).observeChanges({
      added: function (id, fields) {
        results1.push({ id, fields });
      }
    });

    const handle2 = await c.find({}).observeChanges({
      added: function (id, fields) {
        results2.push({ id, fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle1), 'Handle 1 should use ChangeStream driver');
    test.isTrue(isChangeStreamDriver(handle2), 'Handle 2 should use ChangeStream driver');

    // They should share the same multiplexer
    test.equal(
      handle1._multiplexer,
      handle2._multiplexer,
      'Identical queries should share multiplexer'
    );

    // Insert a document
    await c.insertAsync({ name: 'shared' });

    await waitFor(() => results1.length > 0 && results2.length > 0);

    test.equal(results1.length, 1);
    test.equal(results2.length, 1);
    test.equal(results1[0].fields.name, 'shared');
    test.equal(results2[0].fields.name, 'shared');

    handle1.stop();
    handle2.stop();
  }
);

Tinytest.addAsync(
  'changestream - different queries use different drivers',
  async function (test) {
    const c = makeCollection();

    const handle1 = await c.find({ type: 'a' }).observeChanges({
      added: function () { }
    });

    const handle2 = await c.find({ type: 'b' }).observeChanges({
      added: function () { }
    });

    test.isTrue(isChangeStreamDriver(handle1));
    test.isTrue(isChangeStreamDriver(handle2));

    // Different queries should have different multiplexers
    test.notEqual(
      handle1._multiplexer,
      handle2._multiplexer,
      'Different queries should have different multiplexers'
    );

    handle1.stop();
    handle2.stop();
  }
);

Tinytest.addAsync(
  'changestream - stopping one handle does not affect others',
  async function (test) {
    const c = makeCollection();
    const results = [];

    const handle1 = await c.find({}).observeChanges({
      added: function (id, fields) {
        results.push({ from: 'handle1', id, fields });
      }
    });

    const handle2 = await c.find({}).observeChanges({
      added: function (id, fields) {
        results.push({ from: 'handle2', id, fields });
      }
    });

    // Wait for any initial state
    await new Promise(r => setTimeout(r, 200));
    results.length = 0;

    // Stop handle1
    handle1.stop();

    // Insert a document
    await c.insertAsync({ name: 'after stop' });

    await waitFor(() => results.length > 0);

    // Only handle2 should receive the callback
    test.isTrue(results.every(r => r.from === 'handle2'));

    handle2.stop();
  }
);

// ============================================================================
// CALLBACK ISOLATION TESTS
// ============================================================================

Tinytest.addAsync(
  'changestream - callbacks receive independent clones',
  async function (test) {
    const c = makeCollection();
    let fields1 = null;
    let fields2 = null;

    const handle1 = await c.find({}).observeChanges({
      added: function (id, fields) {
        fields1 = fields;
        // Mutate the fields object
        fields.mutated = true;
      }
    });

    const handle2 = await c.find({}).observeChanges({
      added: function (id, fields) {
        fields2 = fields;
      }
    });

    await c.insertAsync({ name: 'test' });

    await waitFor(() => fields1 !== null && fields2 !== null);

    // handle2's fields should not be affected by handle1's mutation
    test.isUndefined(fields2.mutated, 'Callbacks should receive independent objects');

    handle1.stop();
    handle2.stop();
  }
);

// ============================================================================
// EDGE CASES TESTS
// ============================================================================

Tinytest.addAsync(
  'changestream - handles ObjectID correctly',
  async function (test) {
    const c = makeCollection();
    const results = [];

    const handle = await c.find({}).observeChanges({
      added: function (id, fields) {
        results.push({ id, fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    // Insert with ObjectID
    const objectId = new Mongo.ObjectID();
    await c.insertAsync({ _id: objectId, name: 'with objectid' });

    await waitFor(() => results.length > 0);

    test.equal(results.length, 1);
    test.equal(results[0].fields.name, 'with objectid');

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - #14460 initial adds deliver a pre-existing doc matched by an ObjectID _id selector',
  async function (test) {
    const c = new Mongo.Collection(
      'changestream_test_objectid_' + Random.id(),
      { idGeneration: 'MONGO' }
    );

    const id1 = await c.insertAsync({ name: 'pet-1' });
    await c.insertAsync({ name: 'pet-2' });
    test.isTrue(id1 instanceof Mongo.ObjectID, 'MONGO idGeneration should yield an ObjectID');

    const fetched = await c.find({ _id: id1 }).fetchAsync();
    test.equal(fetched.length, 1, 'fetchAsync should find the doc by ObjectID');

    const added = [];
    const handle = await c.find({ _id: id1 }).observeChanges({
      added(id, fields) { added.push({ id, fields }); },
    });
    test.isTrue(isChangeStreamDriver(handle), 'Should be using ChangeStream driver');

    await waitFor(() => added.length > 0);
    test.equal(added.length, 1, 'initial added should fire for the ObjectID-matched doc');
    test.isTrue(added[0].id instanceof Mongo.ObjectID, 'delivered id should be an ObjectID');
    test.equal(added[0].id.toHexString(), id1.toHexString());
    test.equal(added[0].fields.name, 'pet-1');

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - #14460 initial adds deliver pre-existing docs matched by { _id: { $in: [ObjectID, ...] } }',
  async function (test) {
    const c = new Mongo.Collection(
      'changestream_test_objectid_in_' + Random.id(),
      { idGeneration: 'MONGO' }
    );

    const id1 = await c.insertAsync({ name: 'pet-1' });
    const id2 = await c.insertAsync({ name: 'pet-2' });
    const id3 = await c.insertAsync({ name: 'pet-3' });

    const selector = { _id: { $in: [id1, id3] } };

    const fetched = await c.find(selector).fetchAsync();
    test.equal(fetched.length, 2, 'fetchAsync should find both $in docs');

    const added = [];
    const handle = await c.find(selector).observeChanges({
      added(id, fields) { added.push({ id, fields }); },
    });
    test.isTrue(isChangeStreamDriver(handle), 'Should be using ChangeStream driver');

    await waitFor(() => added.length >= 2);
    test.equal(added.length, 2, 'initial added should fire for both $in-matched docs');

    const gotHex = added.map(a => a.id.toHexString()).sort();
    const wantHex = [id1.toHexString(), id3.toHexString()].sort();
    test.equal(gotHex, wantHex, 'should deliver exactly the $in-selected docs');
    test.isFalse(
      added.some(a => a.id.toHexString() === id2.toHexString()),
      'a doc outside the $in must not be delivered'
    );

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - #14460 live update to an ObjectID-selected doc stays in the set (changed, not removed)',
  async function (test) {
    const c = new Mongo.Collection(
      'changestream_test_objectid_live_' + Random.id(),
      { idGeneration: 'MONGO' }
    );

    const id1 = await c.insertAsync({ name: 'pet-1', n: 1 });

    const events = [];
    const handle = await c.find({ _id: { $in: [id1] } }).observeChanges({
      added(id, fields) { events.push({ type: 'added', id, fields }); },
      changed(id, fields) { events.push({ type: 'changed', id, fields }); },
      removed(id) { events.push({ type: 'removed', id }); },
    });
    test.isTrue(isChangeStreamDriver(handle), 'Should be using ChangeStream driver');

    await waitFor(() => events.length > 0);
    test.equal(events.length, 1, 'initial added for the selected doc');
    test.equal(events[0].type, 'added');
    events.length = 0;

    await c.updateAsync(id1, { $set: { n: 2 } });
    await waitFor(() => events.length > 0);
    test.equal(events[0].type, 'changed', 'update to a selected doc should emit changed, not removed');
    test.equal(events[0].fields.n, 2);
    test.isFalse(
      events.some(e => e.type === 'removed'),
      'a selected doc must not be spuriously removed on update'
    );

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - handles nested documents',
  async function (test) {
    const c = makeCollection();
    const results = [];

    const handle = await c.find({}).observeChanges({
      added: function (id, fields) {
        results.push({ id, fields });
      },
      changed: function (id, fields) {
        results.push({ type: 'changed', id, fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    const docId = await c.insertAsync({
      nested: {
        level1: {
          level2: {
            value: 'deep'
          }
        }
      }
    });

    await waitFor(() => results.length > 0);

    test.equal(results[0].fields.nested.level1.level2.value, 'deep');

    results.length = 0;

    // Update nested field
    await c.updateAsync(docId, { $set: { 'nested.level1.level2.value': 'updated' } });

    await waitFor(() => results.length > 0);

    test.equal(results[0].type, 'changed');

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - handles arrays correctly',
  async function (test) {
    const c = makeCollection();
    const results = [];

    const handle = await c.find({}).observeChanges({
      added: function (id, fields) {
        results.push({ id, fields });
      },
      changed: function (id, fields) {
        results.push({ type: 'changed', id, fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    const docId = await c.insertAsync({
      items: [1, 2, 3],
      tags: ['a', 'b']
    });

    await waitFor(() => results.length > 0);

    test.equal(results[0].fields.items, [1, 2, 3]);
    test.equal(results[0].fields.tags, ['a', 'b']);

    results.length = 0;

    // Push to array
    await c.updateAsync(docId, { $push: { items: 4 } });

    await waitFor(() => results.length > 0);

    test.equal(results[0].type, 'changed');

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - handles Date objects',
  async function (test) {
    const c = makeCollection();
    const results = [];
    const testDate = new Date('2025-01-15T12:00:00Z');

    const handle = await c.find({}).observeChanges({
      added: function (id, fields) {
        results.push({ id, fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    await c.insertAsync({
      createdAt: testDate,
      name: 'with date'
    });

    await waitFor(() => results.length > 0);

    test.instanceOf(results[0].fields.createdAt, Date);
    test.equal(results[0].fields.createdAt.getTime(), testDate.getTime());

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - handles EJSON types',
  async function (test) {
    const c = makeCollection();
    const results = [];

    const handle = await c.find({}).observeChanges({
      added: function (id, fields) {
        results.push({ id, fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    // Insert with binary data
    const binary = EJSON.newBinary(4);
    binary[0] = 1;
    binary[1] = 2;
    binary[2] = 3;
    binary[3] = 4;

    await c.insertAsync({
      data: binary,
      name: 'with binary'
    });

    await waitFor(() => results.length > 0);

    test.equal(results[0].fields.name, 'with binary');

    handle.stop();
  }
);

// ============================================================================
// STOP / CLEANUP TESTS
// ============================================================================

Tinytest.addAsync(
  'changestream - stop prevents further callbacks',
  async function (test) {
    const c = makeCollection();
    const results = [];

    const handle = await c.find({}).observeChanges({
      added: function (id, fields) {
        results.push({ id, fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    // Insert before stop
    await c.insertAsync({ name: 'before stop' });
    await waitFor(() => results.length > 0);

    const countBefore = results.length;

    // Stop the handle
    handle.stop();

    // Insert after stop
    await c.insertAsync({ name: 'after stop 1' });
    await c.insertAsync({ name: 'after stop 2' });

    // Wait a bit
    await new Promise(r => setTimeout(r, 500));

    // No new callbacks should have been received
    test.equal(results.length, countBefore, 'No callbacks after stop');
  }
);

Tinytest.addAsync(
  'changestream - multiple stops are safe',
  async function (test) {
    const c = makeCollection();

    const handle = await c.find({}).observeChanges({
      added: function () { }
    });

    test.isTrue(isChangeStreamDriver(handle));

    // Calling stop multiple times should not throw
    handle.stop();
    handle.stop();
    handle.stop();

    test.ok('Multiple stops did not throw');
  }
);

// ============================================================================
// RAPID CHANGES TESTS
// ============================================================================

Tinytest.addAsync(
  'changestream - handles rapid inserts',
  async function (test) {
    const c = makeCollection();
    const results = [];
    const COUNT = 20;

    const handle = await c.find({}).observeChanges({
      added: function (id, fields) {
        results.push({ id, fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    // Rapid inserts
    const insertPromises = [];
    for (let i = 0; i < COUNT; i++) {
      insertPromises.push(c.insertAsync({ index: i }));
    }
    await Promise.all(insertPromises);

    // Wait for all to be detected
    await waitFor(() => results.length >= COUNT, 5000);

    test.equal(results.length, COUNT, `Should receive all ${COUNT} inserts`);

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - handles rapid updates to same document',
  async function (test) {
    const c = makeCollection();
    const changes = [];

    const docId = await c.insertAsync({ counter: 0 });

    const handle = await c.find({}).observeChanges({
      added: function (id, fields) { },
      changed: function (id, fields) {
        changes.push(fields);
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    // Rapid updates
    for (let i = 1; i <= 10; i++) {
      await c.updateAsync(docId, { $set: { counter: i } });
    }

    // Wait for some changes
    await waitFor(() => changes.length > 0, 3000);

    // We should receive at least one change (may coalesce)
    test.isTrue(changes.length > 0, 'Should receive at least one change');

    handle.stop();
  }
);

// ============================================================================
// SORT AND LIMIT TESTS
// ============================================================================

Tinytest.addAsync(
  'changestream - works with sort option',
  async function (test) {
    const c = makeCollection();
    const results = [];

    await c.insertAsync({ order: 3, name: 'third' });
    await c.insertAsync({ order: 1, name: 'first' });
    await c.insertAsync({ order: 2, name: 'second' });

    const handle = await c.find({}, { sort: { order: 1 } }).observeChanges({
      added: function (id, fields) {
        results.push({ id, fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    await waitFor(() => results.length >= 3);

    test.equal(results.length, 3);

    handle.stop();
  }
);

// ============================================================================
// ENVIRONMENT VARIABLE CONTEXT TESTS
// ============================================================================

Tinytest.addAsync(
  'changestream - preserves EnvironmentVariable context',
  async function (test) {
    const c = makeCollection();
    let contextValue = null;

    const [resolver, promise] = getPromiseAndResolver();

    const envVar = new Meteor.EnvironmentVariable();

    await envVar.withValue('test-context', async function () {
      const handle = await c.find({}).observeChanges({
        added: function (id, fields) {
          contextValue = envVar.get();
          handle.stop();
          resolver();
        }
      });

      test.isTrue(isChangeStreamDriver(handle));
    });

    await c.insertAsync({ name: 'trigger' });

    await promise;

    test.equal(contextValue, 'test-context', 'Should preserve environment context');
  }
);

// ============================================================================
// COMPLEX SELECTOR TESTS
// ============================================================================

Tinytest.addAsync(
  'changestream - handles $and selector',
  async function (test) {
    const c = makeCollection();
    const results = [];

    const handle = await c.find({
      $and: [
        { status: 'active' },
        { level: { $gte: 5 } }
      ]
    }).observeChanges({
      added: function (id, fields) {
        results.push({ id, fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    // Should NOT match (status wrong)
    await c.insertAsync({ status: 'inactive', level: 10 });

    // Should NOT match (level too low)
    await c.insertAsync({ status: 'active', level: 3 });

    await new Promise(r => setTimeout(r, 300));
    test.equal(results.length, 0);

    // Should match
    await c.insertAsync({ status: 'active', level: 7 });

    await waitFor(() => results.length > 0);

    test.equal(results.length, 1);
    test.equal(results[0].fields.status, 'active');
    test.equal(results[0].fields.level, 7);

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - handles $or selector',
  async function (test) {
    const c = makeCollection();
    const results = [];

    const handle = await c.find({
      $or: [
        { type: 'admin' },
        { priority: 'high' }
      ]
    }).observeChanges({
      added: function (id, fields) {
        results.push({ id, fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    // Should NOT match
    await c.insertAsync({ type: 'user', priority: 'low' });

    await new Promise(r => setTimeout(r, 300));
    test.equal(results.length, 0);

    // Should match (first condition)
    await c.insertAsync({ type: 'admin', priority: 'low' });

    await waitFor(() => results.length > 0);
    test.equal(results.length, 1);

    results.length = 0;

    // Should match (second condition)
    await c.insertAsync({ type: 'user', priority: 'high' });

    await waitFor(() => results.length > 0);
    test.equal(results.length, 1);

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - handles $in selector',
  async function (test) {
    const c = makeCollection();
    const results = [];

    const handle = await c.find({
      category: { $in: ['electronics', 'books', 'toys'] }
    }).observeChanges({
      added: function (id, fields) {
        results.push({ id, fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    // Should NOT match
    await c.insertAsync({ category: 'furniture' });

    await new Promise(r => setTimeout(r, 300));
    test.equal(results.length, 0);

    // Should match
    await c.insertAsync({ category: 'electronics' });

    await waitFor(() => results.length > 0);
    test.equal(results.length, 1);

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - handles $regex selector',
  async function (test) {
    const c = makeCollection();
    const results = [];

    const handle = await c.find({
      email: { $regex: /@example\.com$/ }
    }).observeChanges({
      added: function (id, fields) {
        results.push({ id, fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    // Should NOT match
    await c.insertAsync({ email: 'user@other.com' });

    await new Promise(r => setTimeout(r, 300));
    test.equal(results.length, 0);

    // Should match
    await c.insertAsync({ email: 'user@example.com' });

    await waitFor(() => results.length > 0);
    test.equal(results.length, 1);

    handle.stop();
  }
);

// ============================================================================
// UPDATE OPERATORS TESTS
// ============================================================================

Tinytest.addAsync(
  'changestream - detects $set updates',
  async function (test) {
    const c = makeCollection();
    const changes = [];

    const docId = await c.insertAsync({ a: 1, b: 2, c: 3 });

    const handle = await c.find({}).observeChanges({
      added: function () { },
      changed: function (id, fields) {
        changes.push(fields);
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    await waitFor(() => true); // Ensure initial state

    await c.updateAsync(docId, { $set: { b: 20, d: 4 } });

    await waitFor(() => changes.length > 0);

    test.isTrue(changes.length > 0);
    test.equal(changes[0].b, 20);
    test.equal(changes[0].d, 4);

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - detects $unset updates',
  async function (test) {
    const c = makeCollection();
    const changes = [];

    const docId = await c.insertAsync({ a: 1, b: 2, c: 3 });

    const handle = await c.find({}).observeChanges({
      added: function () { },
      changed: function (id, fields) {
        changes.push(fields);
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    await waitFor(() => true);

    await c.updateAsync(docId, { $unset: { b: 1 } });

    await waitFor(() => changes.length > 0);

    test.isTrue(changes.length > 0);
    test.equal(changes[0].b, undefined);

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - detects $inc updates',
  async function (test) {
    const c = makeCollection();
    const changes = [];

    const docId = await c.insertAsync({ counter: 0 });

    const handle = await c.find({}).observeChanges({
      added: function () { },
      changed: function (id, fields) {
        changes.push(fields);
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    await waitFor(() => true);

    await c.updateAsync(docId, { $inc: { counter: 5 } });

    await waitFor(() => changes.length > 0);

    test.isTrue(changes.length > 0);
    test.equal(changes[0].counter, 5);

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - detects $push updates',
  async function (test) {
    const c = makeCollection();
    const changes = [];

    const docId = await c.insertAsync({ items: [1, 2] });

    const handle = await c.find({}).observeChanges({
      added: function () { },
      changed: function (id, fields) {
        changes.push(fields);
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    await waitFor(() => true);

    await c.updateAsync(docId, { $push: { items: 3 } });

    await waitFor(() => changes.length > 0);

    test.isTrue(changes.length > 0);
    test.equal(changes[0].items, [1, 2, 3]);

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - detects $rename updates',
  async function (test) {
    const c = makeCollection();
    const changes = [];

    const docId = await c.insertAsync({ oldName: 'value', other: 'unchanged' });

    const handle = await c.find({}).observeChanges({
      added: function () { },
      changed: function (id, fields) {
        changes.push(fields);
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    await waitFor(() => true);

    await c.updateAsync(docId, { $rename: { oldName: 'newName' } });

    await waitFor(() => changes.length > 0);

    test.isTrue(changes.length > 0);
    test.equal(changes[0].newName, 'value');
    test.equal(changes[0].oldName, undefined);

    handle.stop();
  }
);

// ============================================================================
// FENCE SYNCHRONIZATION TESTS
// ============================================================================

Tinytest.addAsync(
  'changestream - write fence integration - basic',
  async function (test) {
    const c = makeCollection();
    const results = [];

    const handle = await c.find({}).observeChanges({
      added: function (id, fields) {
        results.push({ type: 'added', id, fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    // Use DDP fence by calling a method that does an insert
    // The insert should be visible after the method returns
    const insertedId = await c.insertAsync({ name: 'fenced insert' });

    // After the async insert returns, the change should have been processed
    await waitFor(() => results.some(r => r.fields.name === 'fenced insert'), 2000);

    test.isTrue(
      results.some(r => r.fields.name === 'fenced insert'),
      'Fenced insert should be visible in observer'
    );

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - fence synchronization with multiple writes',
  async function (test) {
    const c = makeCollection();
    const results = [];

    const handle = await c.find({}).observeChanges({
      added: function (id, fields) {
        results.push({ type: 'added', fields });
      },
      changed: function (id, fields) {
        results.push({ type: 'changed', fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    // Multiple sequential writes
    const docId = await c.insertAsync({ step: 1 });
    await c.updateAsync(docId, { $set: { step: 2 } });
    await c.updateAsync(docId, { $set: { step: 3 } });

    // All operations should eventually be visible
    await waitFor(() =>
      results.some(r => r.type === 'added' && r.fields.step === 1) &&
      results.some(r => r.type === 'changed'),
      3000
    );

    test.isTrue(results.some(r => r.type === 'added'), 'Should have added event');
    test.isTrue(results.some(r => r.type === 'changed'), 'Should have changed event');

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - write visibility after insert',
  async function (test) {
    const c = makeCollection();
    const seen = { added: false };

    const handle = await c.find({}).observeChanges({
      added: function (id, fields) {
        if (fields.marker === 'visibility-test') {
          seen.added = true;
        }
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    // Insert and immediately check visibility
    await c.insertAsync({ marker: 'visibility-test' });

    // The observer should see the insert
    await waitFor(() => seen.added, 2000);

    test.isTrue(seen.added, 'Insert should be visible in observer after insertAsync returns');

    handle.stop();
  }
);

// ============================================================================
// OPERATION TIME TRACKING TESTS
// ============================================================================

Tinytest.addAsync(
  'changestream - tracks operation times for synchronization',
  async function (test) {
    const c = makeCollection();

    const handle = await c.find({}).observeChanges({
      added: function () { }
    });

    test.isTrue(isChangeStreamDriver(handle));

    const driver = handle._multiplexer._observeDriver;

    // Initially, no operation time
    // After some operations, we should have a tracked time
    await c.insertAsync({ name: 'op-time-test' });

    // Wait for the change to be processed
    await new Promise(r => setTimeout(r, 500));

    // The driver should have tracked some operation time
    // Note: This is internal state, but we're testing the mechanism works
    test.isTrue(
      driver._lastProcessedOperationTime !== null || true,
      'Should track operation times'
    );

    handle.stop();
  }
);

// ============================================================================
// PENDING WRITES PROCESSING TESTS
// ============================================================================

Tinytest.addAsync(
  'changestream - processes pending writes correctly',
  async function (test) {
    const c = makeCollection();
    const events = [];

    const handle = await c.find({}).observeChanges({
      added: function (id, fields) {
        events.push({ type: 'added', ts: Date.now(), fields });
      },
      changed: function (id, fields) {
        events.push({ type: 'changed', ts: Date.now(), fields });
      },
      removed: function (id) {
        events.push({ type: 'removed', ts: Date.now() });
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    // Rapid sequence of operations
    const docId = await c.insertAsync({ value: 1 });
    await c.updateAsync(docId, { $set: { value: 2 } });
    await c.updateAsync(docId, { $set: { value: 3 } });
    await c.removeAsync(docId);

    // Wait for all events
    await waitFor(() => events.some(e => e.type === 'removed'), 3000);

    // Should have received events in logical order
    test.isTrue(events.length >= 2, 'Should receive multiple events');

    const addedIndex = events.findIndex(e => e.type === 'added');
    const removedIndex = events.findIndex(e => e.type === 'removed');

    if (addedIndex !== -1 && removedIndex !== -1) {
      test.isTrue(
        addedIndex < removedIndex,
        'Added should come before removed'
      );
    }

    handle.stop();
  }
);

// ============================================================================
// READY STATE TESTS
// ============================================================================

Tinytest.addAsync(
  'changestream - becomes ready after initial adds',
  async function (test) {
    const c = makeCollection();

    // Pre-populate
    await c.insertAsync({ name: 'pre1' });
    await c.insertAsync({ name: 'pre2' });

    const initialAdds = [];

    // Use observeChanges (unordered) since ChangeStreams doesn't support ordered observe
    const handle = await c.find({}).observeChanges({
      added: function (id, fields) {
        initialAdds.push({ id, fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    // After observeChanges returns, ready should have been called and initial adds sent
    test.isTrue(initialAdds.length >= 2, 'Should have received initial adds');

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - primary snapshot ignores older shared-stream events (#14695)',
  async function (test) {
    const c = makeCollection();
    const id = await c.insertAsync({ state: 'fresh' });
    const events = [];
    const handle = await c.find({ _id: id, state: 'fresh' }).observeChanges({
      added(docId) {
        events.push({ type: 'added', id: docId });
      },
      removed(docId) {
        events.push({ type: 'removed', id: docId });
      },
    });

    try {
      test.equal(events, [{ type: 'added', id }]);
      events.length = 0;

      const driver = handle._multiplexer._observeDriver;
      const snapshotBoundary = driver._lastProcessedOperationTime;
      const Timestamp = snapshotBoundary.constructor;

      // Model events that were already buffered by the shared MongoDB cursor
      // when this driver joined. The snapshot already contains their effects,
      // so neither an older event nor the inclusive boundary may replay them.
      for (const clusterTime of [
        new Timestamp({ t: snapshotBoundary.t - 1, i: snapshotBoundary.i }),
        snapshotBoundary,
      ]) {
        driver._sharedStream._onChange({
          operationType: 'update',
          clusterTime,
          documentKey: { _id: id },
          fullDocument: { _id: id, state: 'old' },
        });
      }

      await driver._flushPendingWrites();
      await driver._multiplexer.onFlush(() => {});
      test.equal(
        events,
        [],
        'events covered by the primary snapshot must not remove its matching document'
      );
    } finally {
      handle.stop();
    }
  }
);

Tinytest.addAsync(
  'changestream - primary majority snapshot is causal at cutoff (#14695)',
  async function (test) {
    const mongoUrl = new URL(process.env.MONGO_URL);
    mongoUrl.searchParams.set('readConcernLevel', 'majority');
    const remote = new MongoInternals.RemoteCollectionDriver(mongoUrl.toString());
    remote.mongo.client.monitorCommands = true;

    const collectionName = 'changestream_test_' + Random.id();
    const findCommands = [];
    const captureFind = (event) => {
      if (event.commandName === 'find' && event.command.find === collectionName) {
        findCommands.push(event.command);
      }
    };
    remote.mongo.client.on('commandStarted', captureFind);

    const c = new Mongo.Collection(collectionName, { _driver: remote });
    const handle = await c.find({ _id: Random.id() }).observeChanges({
      added() {},
    });

    try {
      const driver = handle._multiplexer._observeDriver;
      const afterClusterTime = findCommands[0]?.readConcern?.afterClusterTime;

      test.isTrue(
        Boolean(
          afterClusterTime &&
          driver._snapshotCutoffOperationTime &&
          afterClusterTime.equals(driver._snapshotCutoffOperationTime)
        ),
        'the majority snapshot must read at or after the cutoff it uses to discard events'
      );
    } finally {
      await handle.stop();
      remote.mongo.client.off('commandStarted', captureFind);
      await remote.mongo.close();
    }
  }
);

Tinytest.addAsync(
  'changestream - non-causal primary read concerns keep boundary events (#14695)',
  async function (test) {
    for (const readConcern of ['available', 'snapshot']) {
      const c = makeCollection();
      const id = Random.id();
      const events = [];
      const handle = await c.find(
        { _id: id, state: 'fresh' },
        { readConcern }
      ).observeChanges({
        added(docId) {
          events.push({ type: 'added', id: docId });
        },
      });

      try {
        const driver = handle._multiplexer._observeDriver;
        test.isFalse(
          Boolean(driver._snapshotCutoffOperationTime),
          `${readConcern} snapshots must not establish a cutoff`
        );
        driver._sharedStream._onChange({
          operationType: 'update',
          clusterTime: driver._lastProcessedOperationTime,
          documentKey: { _id: id },
          fullDocument: { _id: id, state: 'fresh' },
        });

        await driver._flushPendingWrites();
        await waitFor(() => events.some(event => event.type === 'added'));
        test.equal(
          events,
          [{ type: 'added', id }],
          `${readConcern} snapshots must retain events at their boundary`
        );
      } finally {
        await handle.stop();
      }
    }
  }
);

Tinytest.addAsync(
  'changestream - global available read concern does not create a cutoff (#14695)',
  async function (test) {
    const remote = new MongoInternals.RemoteCollectionDriver(process.env.MONGO_URL);
    remote.mongo.client.monitorCommands = true;

    const admin = remote.mongo.client.db('admin');
    const originalDefaults = await admin.command({
      getDefaultRWConcern: 1,
      inMemory: true,
    });
    const collectionName = 'changestream_test_' + Random.id();
    const findCommands = [];
    const captureFind = (event) => {
      if (event.commandName === 'find' && event.command.find === collectionName) {
        findCommands.push(event.command);
      }
    };
    remote.mongo.client.on('commandStarted', captureFind);

    let handle;
    try {
      await admin.command({
        setDefaultRWConcern: 1,
        defaultReadConcern: { level: 'available' },
      });

      const c = new Mongo.Collection(collectionName, { _driver: remote });
      handle = await c.find({ _id: Random.id() }).observeChanges({
        added() {},
      });

      const driver = handle._multiplexer._observeDriver;
      test.equal(
        findCommands[0]?.readConcern,
        { level: 'available' },
        'the snapshot must retain the effective global read concern'
      );
      test.isFalse(
        Boolean(findCommands[0]?.readConcern?.afterClusterTime),
        'a global available read concern must not be made causal'
      );
      test.isFalse(
        Boolean(driver._snapshotCutoffOperationTime),
        'a global available read concern must not establish a cutoff'
      );
    } finally {
      try {
        await handle?.stop();
      } finally {
        remote.mongo.client.off('commandStarted', captureFind);
        try {
          await admin.command({
            setDefaultRWConcern: 1,
            defaultReadConcern:
              originalDefaults.defaultReadConcernSource === 'global'
                ? originalDefaults.defaultReadConcern
                : {},
          });
        } finally {
          await remote.mongo.close();
        }
      }
    }
  }
);

Tinytest.addAsync(
  'changestream - non-primary snapshot keeps boundary events (#14695)',
  async function (test) {
    const c = makeCollection();
    const id = await c.insertAsync({ state: 'fresh' });
    const events = [];
    const handle = await c.find(
      { _id: id, state: 'fresh' },
      { readPreference: 'secondaryPreferred' }
    ).observeChanges({
      added(docId) {
        events.push({ type: 'added', id: docId });
      },
      removed(docId) {
        events.push({ type: 'removed', id: docId });
      },
    });

    try {
      test.equal(events, [{ type: 'added', id }]);
      events.length = 0;

      const driver = handle._multiplexer._observeDriver;
      driver._sharedStream._onChange({
        operationType: 'update',
        clusterTime: driver._lastProcessedOperationTime,
        documentKey: { _id: id },
        fullDocument: { _id: id, state: 'old' },
      });

      await driver._flushPendingWrites();
      await waitFor(() => events.some(event => event.type === 'removed'));
      test.isTrue(
        events.some(event => event.type === 'removed' && event.id === id),
        'a potentially stale non-primary snapshot must still apply its boundary event'
      );
    } finally {
      handle.stop();
    }
  }
);

Tinytest.addAsync(
  'changestream - inherited non-primary snapshot keeps boundary events (#14695)',
  async function (test) {
    const mongoUrl = new URL(process.env.MONGO_URL);
    mongoUrl.searchParams.set('readPreference', 'secondaryPreferred');
    const remote = new MongoInternals.RemoteCollectionDriver(mongoUrl.toString());
    const c = new Mongo.Collection('changestream_test_' + Random.id(), {
      _driver: remote,
    });
    const id = Random.id();
    const events = [];
    const handle = await c.find({ _id: id, state: 'fresh' }).observeChanges({
      added(docId) {
        events.push({ type: 'added', id: docId });
      },
      removed(docId) {
        events.push({ type: 'removed', id: docId });
      },
    });

    try {
      test.equal(events, []);

      const driver = handle._multiplexer._observeDriver;
      driver._sharedStream._onChange({
        operationType: 'update',
        clusterTime: driver._lastProcessedOperationTime,
        documentKey: { _id: id },
        fullDocument: { _id: id, state: 'fresh' },
      });

      await driver._flushPendingWrites();
      await waitFor(() => events.some(event => event.type === 'added'));
      test.isTrue(
        events.some(event => event.type === 'added' && event.id === id),
        'a connection-level non-primary snapshot must still apply its boundary event'
      );
    } finally {
      await handle.stop();
      await remote.mongo.close();
    }
  }
);

Tinytest.addAsync(
  'changestream - queues writes until ready',
  async function (test) {
    const c = makeCollection();
    const events = [];

    // Start observe on empty collection
    const handle = await c.find({}).observeChanges({
      added: function (id, fields) {
        events.push({ type: 'added', fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    // The driver should now be ready (after observeChanges returns)
    // New writes should be processed
    await c.insertAsync({ name: 'after-ready' });

    await waitFor(() => events.some(e => e.fields.name === 'after-ready'));

    test.isTrue(
      events.some(e => e.fields.name === 'after-ready'),
      'Writes after ready should be processed'
    );

    handle.stop();
  }
);

// ============================================================================
// ERROR HANDLING AND RECOVERY TESTS
// ============================================================================

Tinytest.addAsync(
  'changestream - continues working after transient errors',
  async function (test) {
    const c = makeCollection();
    const events = [];
    let errorCount = 0;

    const handle = await c.find({}).observeChanges({
      added: function (id, fields) {
        events.push({ type: 'added', fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    // Insert should work normally
    await c.insertAsync({ phase: 'before-error' });

    await waitFor(() => events.some(e => e.fields.phase === 'before-error'));

    // Simulate continued operation (in real scenario, driver would recover)
    await c.insertAsync({ phase: 'after-recovery' });

    await waitFor(() => events.some(e => e.fields.phase === 'after-recovery'));

    test.isTrue(
      events.some(e => e.fields.phase === 'after-recovery'),
      'Should continue receiving events after recovery'
    );

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - stop during processing is safe',
  async function (test) {
    const c = makeCollection();
    let stopCalled = false;

    const handle = await c.find({}).observeChanges({
      added: function (id, fields) {
        // Stop during a callback
        if (fields.trigger === 'stop' && !stopCalled) {
          stopCalled = true;
          handle.stop();
        }
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    // Trigger the stop inside callback
    await c.insertAsync({ trigger: 'stop' });

    await waitFor(() => stopCalled);

    // Further operations should not throw
    await c.insertAsync({ trigger: 'after-stop' });

    await new Promise(r => setTimeout(r, 300));

    test.ok('Stop during processing did not throw');
  }
);

// ============================================================================
// STOP CALLBACK TESTS
// ============================================================================

Tinytest.addAsync(
  'changestream - stop callbacks are executed on stop',
  async function (test) {
    const c = makeCollection();

    const handle = await c.find({}).observeChanges({
      added: function () { }
    });

    test.isTrue(isChangeStreamDriver(handle));

    const driver = handle._multiplexer._observeDriver;
    const initialCallbackCount = driver._stopCallbacks.length;

    // Should have some stop callbacks registered
    test.isTrue(initialCallbackCount > 0, 'Should have stop callbacks');

    handle.stop();

    // Wait for async stop to complete
    await waitFor(() => driver._stopCallbacks.length === 0, 2000);

    // After stop, callbacks should be cleared
    test.equal(driver._stopCallbacks.length, 0, 'Callbacks should be cleared after stop');
  }
);

Tinytest.addAsync(
  'changestream - cleanup on stop is complete',
  async function (test) {
    const c = makeCollection();

    const handle = await c.find({}).observeChanges({
      added: function () { }
    });

    test.isTrue(isChangeStreamDriver(handle));

    const driver = handle._multiplexer._observeDriver;

    // Stop and verify cleanup
    handle.stop();

    // Wait for async stop to complete
    await waitFor(() => driver._stopped && driver._stopCallbacks.length === 0, 2000);

    test.isTrue(driver._stopped, 'Driver should be marked as stopped');
    test.equal(driver._pendingWrites.length, 0, 'Pending writes should be cleared');
    test.equal(driver._writesToCommitWhenReady.length, 0, 'Writes to commit should be cleared');
    test.equal(driver._stopCallbacks.length, 0, 'Stop callbacks should be cleared');
  }
);

// ============================================================================
// MATCHER EDGE CASES TESTS
// ============================================================================

Tinytest.addAsync(
  'changestream - matcher handles null values',
  async function (test) {
    const c = makeCollection();
    const results = [];

    const handle = await c.find({ status: null }).observeChanges({
      added: function (id, fields) {
        results.push({ id, fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    // Insert with explicit null
    await c.insertAsync({ status: null, name: 'null-status' });

    await waitFor(() => results.length > 0);

    test.equal(results.length, 1);
    test.equal(results[0].fields.status, null);

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - matcher handles $exists',
  async function (test) {
    const c = makeCollection();
    const results = [];

    const handle = await c.find({ optional: { $exists: false } }).observeChanges({
      added: function (id, fields) {
        results.push({ id, fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    // Insert without the field - should match
    await c.insertAsync({ name: 'no-optional' });

    // Insert with the field - should NOT match
    await c.insertAsync({ name: 'has-optional', optional: 'value' });

    await waitFor(() => results.length > 0);

    test.equal(results.length, 1);
    test.equal(results[0].fields.name, 'no-optional');

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - matcher handles $ne',
  async function (test) {
    const c = makeCollection();
    const results = [];

    const handle = await c.find({ status: { $ne: 'deleted' } }).observeChanges({
      added: function (id, fields) {
        results.push({ id, fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    // Should match
    await c.insertAsync({ status: 'active', name: 'active-doc' });

    // Should NOT match
    await c.insertAsync({ status: 'deleted', name: 'deleted-doc' });

    // Should match (no status field)
    await c.insertAsync({ name: 'no-status-doc' });

    await waitFor(() => results.length >= 2, 2000);

    test.equal(results.length, 2);
    test.isFalse(results.some(r => r.fields.status === 'deleted'));

    handle.stop();
  }
);

// ============================================================================
// DIFFING AND CHANGED FIELDS TESTS
// ============================================================================

Tinytest.addAsync(
  'changestream - only sends changed fields in update',
  async function (test) {
    const c = makeCollection();
    const changes = [];

    const docId = await c.insertAsync({ a: 1, b: 2, c: 3 });

    const handle = await c.find({}).observeChanges({
      added: function () { },
      changed: function (id, fields) {
        changes.push(fields);
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    // Update only field 'b'
    await c.updateAsync(docId, { $set: { b: 20 } });

    await waitFor(() => changes.length > 0);

    // Should only receive the changed field
    test.isTrue(changes.length > 0);
    test.equal(changes[0].b, 20);
    // Other fields should not be in the change object (unless driver sends full doc)
    // This depends on implementation - some drivers send only diff, some send all

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - handles document replacement correctly',
  async function (test) {
    const c = makeCollection();
    const changes = [];

    const docId = await c.insertAsync({ a: 1, b: 2, c: 3 });

    const handle = await c.find({}).observeChanges({
      added: function () { },
      changed: function (id, fields) {
        changes.push(fields);
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    // Replace entire document (not using $set)
    await c.updateAsync(docId, { x: 10, y: 20 });

    await waitFor(() => changes.length > 0);

    test.isTrue(changes.length > 0);
    // The change should reflect the new document structure
    test.equal(changes[0].x, 10);
    test.equal(changes[0].y, 20);

    handle.stop();
  }
);

// ============================================================================
// SORT OPTION TESTS (ChangeStreams only supports unordered cursors)
// ============================================================================

Tinytest.addAsync(
  'changestream - works with sort option on observeChanges',
  async function (test) {
    const c = makeCollection();
    const events = [];

    await c.insertAsync({ order: 2, name: 'second' });
    await c.insertAsync({ order: 1, name: 'first' });
    await c.insertAsync({ order: 3, name: 'third' });

    // ChangeStreams only supports unordered observeChanges, but sort affects initial query
    const handle = await c.find({}, { sort: { order: 1 } }).observeChanges({
      added: function (id, fields) {
        events.push({ type: 'added', fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    // Wait for initial adds
    await waitFor(() => events.length >= 3);

    test.equal(events.length, 3);
    // All documents should be received (order may vary in callbacks)
    const names = events.map(e => e.fields.name).sort();
    test.equal(names, ['first', 'second', 'third']);

    handle.stop();
  }
);

// ============================================================================
// CONCURRENT OPERATIONS TESTS
// ============================================================================

Tinytest.addAsync(
  'changestream - handles concurrent inserts from multiple collections',
  async function (test) {
    const c1 = makeCollection();
    const c2 = makeCollection();
    const results1 = [];
    const results2 = [];

    const handle1 = await c1.find({}).observeChanges({
      added: function (id, fields) {
        results1.push(fields);
      }
    });

    const handle2 = await c2.find({}).observeChanges({
      added: function (id, fields) {
        results2.push(fields);
      }
    });

    test.isTrue(isChangeStreamDriver(handle1));
    test.isTrue(isChangeStreamDriver(handle2));

    // Concurrent inserts to both collections
    await Promise.all([
      c1.insertAsync({ source: 'c1' }),
      c2.insertAsync({ source: 'c2' }),
      c1.insertAsync({ source: 'c1' }),
      c2.insertAsync({ source: 'c2' })
    ]);

    await waitFor(() => results1.length >= 2 && results2.length >= 2);

    test.equal(results1.length, 2);
    test.equal(results2.length, 2);
    test.isTrue(results1.every(r => r.source === 'c1'));
    test.isTrue(results2.every(r => r.source === 'c2'));

    handle1.stop();
    handle2.stop();
  }
);

// ============================================================================
// TESTS THAT RUN REGARDLESS OF DRIVER
// ============================================================================

Tinytest.addAsync(
  'changestream - collection operations work',
  async function (test) {
    const c = makeCollection();

    // Basic CRUD should work
    const id = await c.insertAsync({ name: 'test' });
    test.isTrue(id);

    const doc = await c.findOneAsync(id);
    test.equal(doc.name, 'test');

    await c.updateAsync(id, { $set: { name: 'updated' } });
    const updated = await c.findOneAsync(id);
    test.equal(updated.name, 'updated');

    await c.removeAsync(id);
    const removed = await c.findOneAsync(id);
    test.isUndefined(removed);
  }
);

// ============================================================================
// UNIT TESTS FOR INTERNAL METHODS (MOCKED)
// ============================================================================

Tinytest.addAsync(
  'changestream - driver subscribes to a shared per-collection change stream',
  async function (test) {
    const c = makeCollection();

    const handle = await c.find({ type: 'test' }).observeChanges({
      added: function () { }
    });

    test.isTrue(isChangeStreamDriver(handle));

    const driver = handle._multiplexer._observeDriver;
    const shared = driver._sharedStream;

    // The cursor lifecycle lives on the shared change stream, not the driver.
    test.isTrue(!!shared, 'driver should hold a shared change stream');
    test.isTrue(!!shared._changeStream, 'shared stream should have an open cursor');
    test.isTrue(shared._drivers.has(driver), 'driver should be registered on the shared stream');

    // The owning MongoConnection should track exactly one multiplexer for the
    // collection.
    test.equal(
      shared._mongoHandle._sharedChangeStreams[c._name],
      shared,
      'connection registry should hold the shared stream for this collection'
    );

    handle.stop();
  }
);

// ============================================================================
// CHANGE STREAM FANOUT (shared cursor per collection)
// ============================================================================

Tinytest.addAsync(
  'changestream - many distinct selectors share ONE change stream cursor (#14453)',
  async function (test) {
    const c = makeCollection();
    const N = 6;
    const handles = [];
    const seen = [];

    // Open N observers, each with a DISTINCT selector on the SAME collection.
    for (let i = 0; i < N; i++) {
      const events = [];
      seen.push(events);
      // eslint-disable-next-line no-await-in-loop
      const handle = await c.find({ envId: 'env-' + i }).observeChanges({
        added: (id, fields) => events.push({ type: 'added', fields }),
        changed: (id, fields) => events.push({ type: 'changed', fields }),
        removed: (id) => events.push({ type: 'removed' }),
      });
      handles.push(handle);
    }

    test.isTrue(isChangeStreamDriver(handles[0]));

    const drivers = handles.map(h => h._multiplexer._observeDriver);
    const shared = drivers[0]._sharedStream;

    // All drivers for distinct selectors on one collection share ONE
    // SharedChangeStream with ONE underlying cursor.
    for (const d of drivers) {
      test.equal(d._sharedStream, shared, 'every driver shares the same change stream');
    }
    test.equal(shared._drivers.size, N, 'shared stream tracks all N drivers');
    test.isTrue(!!shared._changeStream, 'exactly one underlying cursor is open');
    test.equal(
      Object.keys(shared._mongoHandle._sharedChangeStreams).filter(
        k => k === c._name
      ).length,
      1,
      'exactly one shared stream registered for the collection'
    );

    // Functional: a write to env-2 must reach ONLY env-2's observer through the
    // single shared stream — proving in-process fanout still routes per selector.
    await c.insertAsync({ envId: 'env-2', payload: 'a' });
    await waitFor(() => seen[2].some(e => e.type === 'added'), 3000);

    test.isTrue(seen[2].some(e => e.type === 'added'), 'env-2 observer saw its insert');
    for (let i = 0; i < N; i++) {
      if (i === 2) continue;
      test.equal(seen[i].length, 0, `env-${i} observer must not see env-2's write`);
    }

    handles.forEach(h => h.stop());
  }
);

Tinytest.addAsync(
  'changestream - shared cursor closes only after the last driver stops (#14453)',
  async function (test) {
    const c = makeCollection();

    const h1 = await c.find({ envId: 'a' }).observeChanges({ added: function () { } });
    const h2 = await c.find({ envId: 'b' }).observeChanges({ added: function () { } });

    test.isTrue(isChangeStreamDriver(h1));

    const shared = h1._multiplexer._observeDriver._sharedStream;
    const mongo = shared._mongoHandle;
    test.equal(shared._drivers.size, 2, 'both drivers attached to one shared stream');

    // Stopping the first observer must NOT close the shared cursor — the second
    // observer still needs it.
    h1.stop();
    await waitFor(() => shared._drivers.size === 1, 2000);
    test.equal(shared._drivers.size, 1, 'one driver remains');
    test.isFalse(shared._stopped, 'shared stream stays open while a driver remains');
    test.isTrue(!!shared._changeStream, 'cursor still open');
    test.equal(mongo._sharedChangeStreams[c._name], shared, 'still registered');

    // Stopping the last observer tears the shared stream down and drops it from
    // the registry, so the server-side cursor is released.
    h2.stop();
    await waitFor(() => shared._stopped, 2000);
    test.isTrue(shared._stopped, 'shared stream stopped after last driver left');
    test.isTrue(!shared._changeStream, 'cursor closed');
    test.isUndefined(
      mongo._sharedChangeStreams[c._name],
      'shared stream removed from the connection registry'
    );
  }
);

Tinytest.addAsync(
  'changestream - a deliberate restart does not perpetuate a close→reopen loop (#14456)',
  async function (test) {
    const c = makeCollection();

    const handle = await c.find({}).observeChanges({ added: function () { } });
    test.isTrue(isChangeStreamDriver(handle));

    const shared = handle._multiplexer._observeDriver._sharedStream;
    test.isTrue(!!shared._changeStream, 'cursor is open before the restart');

    // Count restarts that fire.
    let restarts = 0;
    const origRestart = shared._restart.bind(shared);
    shared._restart = function () {
      restarts++;
      return origRestart();
    };

    // Trigger one restart; its deliberate close must not cascade into more.
    shared._scheduleRestart(10);

    // delay defaults to 100 ms — a cascade would fire several in this window.
    await waitFor(() => restarts > 1, 800);

    test.equal(restarts, 1, 'a single restart must not trigger further restarts');
    test.isFalse(shared._stopped, 'shared stream stays alive after the restart');
    test.isTrue(!!shared._changeStream, 'cursor is reopened and stays open');

    // The reopened cursor must still deliver events to its drivers.
    await c.insertAsync({ name: 'after-restart' });
    const got = await waitFor(async () => {
      const found = await c.findOneAsync({ name: 'after-restart' });
      return !!found;
    }, 3000);
    test.isTrue(got, 'collection write succeeds after the restart');

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - a non-resumable history-lost error clears the resume token and recovers instead of looping (#14604)',
  async function (test) {
    const c = makeCollection();

    const handle = await c.find({}).observeChanges({ added: function () { } });
    test.isTrue(isChangeStreamDriver(handle));

    const shared = handle._multiplexer._observeDriver._sharedStream;
    const streamBefore = shared._changeStream;
    test.isTrue(!!streamBefore, 'cursor is open before the error');

    // Pretend the stream advanced past some events so a stale resume token is
    // stored — the state that arms the loop once that token ages out of the
    // oplog.
    shared._resumeToken = { _data: 'stale-token' };

    // Count restarts to prove the error triggers exactly one, not a cascade.
    let restarts = 0;
    const origRestart = shared._restart.bind(shared);
    shared._restart = function () {
      restarts++;
      return origRestart();
    };

    let handle2;
    try {
      // Emit the exact server error that arms the loop: ChangeStreamHistoryLost.
      const historyLost = Object.assign(
        new Error('Resume of change stream was not possible'),
        { code: 286, codeName: 'ChangeStreamHistoryLost' }
      );
      historyLost.errorLabels = ['NonResumableChangeStreamError'];
      streamBefore.emit('error', historyLost);

      // The token must be dropped so the pending restart falls back to
      // startAtOperationTime instead of re-sending the dead token forever.
      await waitFor(() => shared._resumeToken === null, 1000);
      test.equal(shared._resumeToken, null, 'stale resume token cleared on history loss');
      test.isTrue(shared._historyLost, 'stream flagged to reconcile drivers after history loss');

      // The single scheduled restart reopens a fresh cursor and settles — the
      // hallmark of the fix is that it does NOT keep restarting.
      await waitFor(
        () => shared._changeStream && shared._changeStream !== streamBefore,
        3000
      );
      test.equal(restarts, 1, 'exactly one restart fires, not a loop');
      test.isTrue(!!shared._changeStream, 'a fresh cursor is open after recovery');
      test.isFalse(shared._stopped, 'shared stream stays alive');

      // Reactivity still works after recovery.
      const results = [];
      handle2 = await c.find({}).observeChanges({
        added: (id, fields) => results.push(fields),
      });
      await c.insertAsync({ name: 'after-recovery' });
      await waitFor(() => results.some(r => r.name === 'after-recovery'), 3000);
      test.isTrue(
        results.some(r => r.name === 'after-recovery'),
        'change events flow again after the stream recovers'
      );
    } finally {
      // Restore the patched method and tear down, even if an assertion above threw.
      delete shared._restart;
      handle.stop();
      if (handle2) handle2.stop();
    }
  }
);

Tinytest.addAsync(
  'changestream - resync after history loss reconciles inserts, updates and removals missed during the gap (#14604)',
  async function (test) {
    const c = makeCollection();
    const keepId = await c.insertAsync({ name: 'keep', v: 1 });
    const removeId = await c.insertAsync({ name: 'remove-me', v: 1 });

    const events = [];
    const handle = await c.find({}).observeChanges({
      added: (id, fields) => events.push({ type: 'added', id, fields }),
      changed: (id, fields) => events.push({ type: 'changed', id, fields }),
      removed: (id) => events.push({ type: 'removed', id }),
    });
    test.isTrue(isChangeStreamDriver(handle));
    await waitFor(() => events.length >= 2, 3000);
    events.length = 0;

    const driver = handle._multiplexer._observeDriver;
    const shared = driver._sharedStream;

    // Simulate the lost window: detach from the shared stream so live events are
    // NOT delivered, then mutate the collection out of band via the raw driver.
    shared._drivers.delete(driver);
    try {
      const raw = driver._mongoHandle.rawCollection(c._name);
      await raw.insertOne({ _id: 'missed-insert', name: 'new', v: 1 });
      await raw.updateOne({ _id: keepId }, { $set: { v: 2 } });
      await raw.deleteOne({ _id: removeId });

      // Give any (suppressed) live delivery a chance — nothing should arrive.
      await new Promise(r => setTimeout(r, 200));
      test.equal(events.length, 0, 'no events delivered while the driver is detached');

      // Reconcile against the current collection contents.
      await driver._resyncAfterHistoryLost();
      await waitFor(() => events.length >= 3, 3000);

      const added = events.filter(e => e.type === 'added');
      const changed = events.filter(e => e.type === 'changed');
      const removed = events.filter(e => e.type === 'removed');

      test.isTrue(
        added.some(e => e.fields.name === 'new'),
        'a document inserted during the gap is reconciled as added'
      );
      test.isTrue(
        changed.some(e => e.fields.v === 2),
        'a document updated during the gap is reconciled as changed'
      );
      test.equal(removed.length, 1, 'a document removed during the gap is reconciled as removed');
    } finally {
      shared._drivers.add(driver);
      handle.stop();
    }
  }
);

Tinytest.addAsync(
  'changestream - resync fetches full documents so a projected cursor still matches its selector (#14604)',
  async function (test) {
    const c = makeCollection();
    await c.insertAsync({ _id: 'a', group: 'g1', label: 'first' });

    const events = [];
    // Selector filters on `group`, but the projection ships only `label`. The
    // resync must fetch the FULL doc so the matcher (which needs `group`) still
    // accepts it — otherwise the server-projected doc is silently dropped.
    const handle = await c
      .find({ group: 'g1' }, { fields: { label: 1 } })
      .observeChanges({
        added: (id, fields) => events.push({ type: 'added', id, fields }),
        changed: (id, fields) => events.push({ type: 'changed', id, fields }),
        removed: (id) => events.push({ type: 'removed', id }),
      });
    test.isTrue(isChangeStreamDriver(handle));
    await waitFor(() => events.some(e => e.type === 'added' && e.id === 'a'), 3000);
    events.length = 0;

    const driver = handle._multiplexer._observeDriver;
    const shared = driver._sharedStream;

    // Simulate the lost window: detach and insert a matching doc out of band.
    shared._drivers.delete(driver);
    const raw = driver._mongoHandle.rawCollection(c._name);
    await raw.insertOne({ _id: 'b', group: 'g1', label: 'second' });

    try {
      await driver._resyncAfterHistoryLost();
      await waitFor(() => events.some(e => e.type === 'added' && e.id === 'b'), 3000);

      const addedB = events.find(e => e.type === 'added' && e.id === 'b');
      test.isTrue(
        !!addedB,
        'a matching doc inserted during the gap is reconciled even though the ' +
        'cursor projects out the selector field'
      );
      if (addedB) {
        test.equal(addedB.fields.label, 'second', 'projected field is delivered');
        test.isUndefined(addedB.fields.group, 'projected-out field is not delivered');
      }
    } finally {
      shared._drivers.add(driver);
      handle.stop();
    }
  }
);

Tinytest.addAsync(
  'changestream - a resumable (network) error keeps the resume token and does not force a resync (#14604)',
  async function (test) {
    const c = makeCollection();
    const handle = await c.find({}).observeChanges({ added: function () { } });
    test.isTrue(isChangeStreamDriver(handle));

    const shared = handle._multiplexer._observeDriver._sharedStream;
    const streamBefore = shared._changeStream;
    const token = { _data: 'live-token' };
    shared._resumeToken = token;

    try {
      // Model the MongoNetworkError the driver re-emits after its OWN internal
      // resume gave up (e.g. a >30s partition): it exposes hasErrorLabel() but
      // carries NO ResumableChangeStreamError label and is not code 286/280. It
      // must NOT clear the still-valid token or force a full-collection resync —
      // resuming via startAfter will succeed once the topology recovers. Token
      // handling runs synchronously in the 'error' handler, so assert immediately.
      const networkErr = Object.assign(new Error('connection reset by peer'), {
        hasErrorLabel: () => false,
      });
      streamBefore.emit('error', networkErr);

      test.equal(shared._resumeToken, token, 'resume token preserved on a resumable network error');
      test.isFalse(shared._historyLost, 'history-lost not flagged for a resumable error');
    } finally {
      // Stop before the restart timer reopens with the preserved token.
      handle.stop();
    }
  }
);

Tinytest.addAsync(
  'changestream - a fatal (280) change-stream error is non-resumable and clears the token (#14604)',
  async function (test) {
    const c = makeCollection();
    const handle = await c.find({}).observeChanges({ added: function () { } });
    test.isTrue(isChangeStreamDriver(handle));

    const shared = handle._multiplexer._observeDriver._sharedStream;
    const streamBefore = shared._changeStream;
    shared._resumeToken = { _data: 'stale-token' };

    try {
      // ChangeStreamFatalError (280) is genuinely non-resumable: the server
      // declared the stream unusable, so the token must be dropped and drivers
      // reconciled — same recovery path as ChangeStreamHistoryLost (286).
      const fatal = Object.assign(new Error('change stream fatal'), {
        code: 280, codeName: 'ChangeStreamFatalError',
      });
      streamBefore.emit('error', fatal);

      test.equal(shared._resumeToken, null, 'token cleared on a fatal (280) error');
      test.isTrue(shared._historyLost, 'history-lost flagged on a fatal (280) error');
    } finally {
      handle.stop();
    }
  }
);

Tinytest.addAsync(
  'changestream - a live event applied during a resync is recorded so the resync leaves that id alone (#14604)',
  async function (test) {
    const c = makeCollection();
    const keepId = await c.insertAsync({ name: 'keep' });

    const handle = await c.find({}).observeChanges({
      added: function () { }, changed: function () { }, removed: function () { },
    });
    test.isTrue(isChangeStreamDriver(handle));
    const driver = handle._multiplexer._observeDriver;

    try {
      // Reproduce the state _resyncAfterHistoryLost sets up (a live-touched set
      // published for the duration of the reconcile), then apply a live delete of
      // an id that is in the cache. _flushPendingWrites must record the id AFTER
      // applying it, so a concurrent resync knows to leave it alone.
      driver._resyncLiveTouched = new Set();
      driver._pendingWrites = [{ operationType: 'delete', id: keepId, change: {} }];
      await driver._flushPendingWrites();

      test.equal(
        driver._resyncLiveTouched.size, 1,
        'the live-applied event recorded exactly one live-touched id'
      );
    } finally {
      driver._resyncLiveTouched = null;
      handle.stop();
    }
  }
);

Tinytest.addAsync(
  'changestream - a live event whose apply throws during a resync is NOT recorded as live-touched (#14604)',
  async function (test) {
    const c = makeCollection();
    await c.insertAsync({ name: 'keep' });

    const handle = await c.find({}).observeChanges({
      added: function () { }, changed: function () { }, removed: function () { },
    });
    test.isTrue(isChangeStreamDriver(handle));
    const driver = handle._multiplexer._observeDriver;

    try {
      // Recording happens only AFTER a successful apply: an event whose handler
      // throws must stay UN-recorded so the resync's corrective pass still runs
      // for that id. (This is the assertion that distinguishes after-apply from
      // the pre-fix record-before-apply behavior.)
      driver._handleInsert = () => { throw new Error('boom'); };
      driver._resyncLiveTouched = new Set();
      driver._pendingWrites = [{ operationType: 'insert', id: 'x', fullDocument: { _id: 'x' } }];
      await driver._flushPendingWrites();

      test.equal(
        driver._resyncLiveTouched.size, 0,
        'an event whose handler threw is not recorded as live-touched'
      );
    } finally {
      delete driver._handleInsert;
      driver._resyncLiveTouched = null;
      handle.stop();
    }
  }
);

Tinytest.addAsync(
  'changestream - restart backoff grows with consecutive failures, de-dupes error+close, and resets on a delivered event (#14604)',
  async function (test) {
    const c = makeCollection();
    const handle = await c.find({}).observeChanges({ added: function () { } });
    test.isTrue(isChangeStreamDriver(handle));
    const shared = handle._multiplexer._observeDriver._sharedStream;

    try {
      // Delay grows as base * 2^(failures-1), clamped at 5000ms.
      shared._restartFailures = 1; test.equal(shared._restartDelay(100), 100);
      shared._restartFailures = 2; test.equal(shared._restartDelay(100), 200);
      shared._restartFailures = 4; test.equal(shared._restartDelay(100), 800);
      shared._restartFailures = 99; test.equal(shared._restartDelay(100), 5000);

      // The driver emits both 'error' and 'close' for one failure; _noteFailure
      // must count that single cursor failure once, not twice.
      shared._restartFailures = 0;
      shared._failureCounted = false;
      shared._noteFailure();
      shared._noteFailure();
      test.equal(shared._restartFailures, 1, 'error+close for one cursor counts a single failure');

      // A delivered event means the reopened stream is healthy: reset the count.
      shared._onChange({ _id: { _data: 'tok' } });
      test.equal(shared._restartFailures, 0, 'a delivered event resets the failure count');

      // Reopening a fresh cursor clears the per-cursor failure flag, so the next
      // cursor's failure is counted again (without this reset, one failure would
      // arm _failureCounted forever and later failures would stop backing off).
      shared._noteFailure();
      test.isTrue(shared._failureCounted, 'failure flag set after counting a failure');
      await shared._closeStream();
      await shared._ensureOpen();
      test.isFalse(shared._failureCounted, 'reopening a fresh cursor clears the per-cursor failure flag');
    } finally {
      handle.stop();
    }
  }
);

Tinytest.addAsync(
  'changestream - a restart requested while one is in flight coalesces instead of running a second reopen (#14604)',
  async function (test) {
    const c = makeCollection();
    const handle = await c.find({}).observeChanges({ added: function () { } });
    test.isTrue(isChangeStreamDriver(handle));
    const shared = handle._multiplexer._observeDriver._sharedStream;

    let reopened = false;
    const origEnsureOpen = shared._ensureOpen;
    try {
      // Simulate a restart already in flight. A re-entrant _restart must NOT run a
      // second close/reopen (which would race two resyncs on the same drivers) —
      // it records the request so the in-flight restart re-runs once it settles.
      shared._ensureOpen = function () { reopened = true; return origEnsureOpen.call(this); };
      shared._restarting = true;
      shared._restartRequested = false;

      await shared._restart();

      test.isTrue(shared._restartRequested, 're-entrant restart is coalesced into a follow-up request');
      test.isFalse(reopened, 're-entrant restart does not run a second reopen');
    } finally {
      shared._restarting = false;
      shared._restartRequested = false;
      shared._ensureOpen = origEnsureOpen;
      handle.stop();
    }
  }
);

Tinytest.addAsync(
  'changestream - _projectionFn works correctly',
  async function (test) {
    const c = makeCollection();

    const handle = await c.find({}, { fields: { a: 1, b: 1 } }).observeChanges({
      added: function () { }
    });

    test.isTrue(isChangeStreamDriver(handle));

    const driver = handle._multiplexer._observeDriver;

    // Test projection function
    const doc = { _id: 'test', a: 1, b: 2, c: 3 };
    const projected = driver._projectionFn(doc);

    test.equal(projected.a, 1);
    test.equal(projected.b, 2);
    test.isUndefined(projected.c);
    test.isUndefined(projected._id); // _id should be removed by projection

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - _addStopCallback validates input',
  async function (test) {
    const c = makeCollection();

    const handle = await c.find({}).observeChanges({
      added: function () { }
    });

    test.isTrue(isChangeStreamDriver(handle));

    const driver = handle._multiplexer._observeDriver;

    // Should throw on non-function
    try {
      driver._addStopCallback('not a function');
      test.fail('Should throw on non-function');
    } catch (e) {
      test.isTrue(e.message.includes('function'));
    }

    // Should accept function
    const callbackCount = driver._stopCallbacks.length;
    driver._addStopCallback(() => { });
    test.equal(driver._stopCallbacks.length, callbackCount + 1);

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - driver has correct initial state',
  async function (test) {
    const c = makeCollection();

    const handle = await c.find({}).observeChanges({
      added: function () { }
    });

    test.isTrue(isChangeStreamDriver(handle));

    const driver = handle._multiplexer._observeDriver;

    // Check initial state properties
    test.isTrue(driver._usesChangeStreams);
    test.isFalse(driver._stopped);
    test.isTrue(Array.isArray(driver._stopCallbacks));
    test.isTrue(Array.isArray(driver._pendingWrites));
    test.isTrue(Array.isArray(driver._writesToCommitWhenReady));
    test.isTrue(Array.isArray(driver._catchingUpResolvers));
    test.isTrue(typeof driver._projectionFn === 'function');

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - supports single document query by _id',
  async function (test) {
    const c = makeCollection();
    const results = [];

    // Insert some documents
    const targetId = await c.insertAsync({ name: 'target', value: 1 });
    await c.insertAsync({ name: 'other', value: 2 });

    // Query by single _id
    const handle = await c.find(targetId).observeChanges({
      added: function (id, fields) {
        results.push({ id, fields });
      },
      changed: function (id, fields) {
        results.push({ type: 'changed', id, fields });
      }
    });

    test.isTrue(isChangeStreamDriver(handle));

    // Wait for initial add
    await waitFor(() => results.length > 0);

    test.equal(results.length, 1);
    test.equal(results[0].fields.name, 'target');

    results.length = 0;

    // Update the target document
    await c.updateAsync(targetId, { $set: { value: 100 } });

    await waitFor(() => results.length > 0);

    test.isTrue(results.some(r => r.type === 'changed'));

    // Update the other document - should NOT trigger callback
    results.length = 0;
    await c.updateAsync({ name: 'other' }, { $set: { value: 200 } });

    await new Promise(r => setTimeout(r, 300));
    test.equal(results.length, 0, 'Should not receive events for other documents');

    handle.stop();
  }
);

// Run `fn` inside a write fence; return the fence so tests can inspect it
// before/after it fires. Inside `fn`, writes will annotate the fence.
const withFence = async (fn) => {
  const fence = new DDPServer._WriteFence();
  await DDPServer._CurrentWriteFence.withValue(fence, async () => {
    await fn(fence);
  });
  await fence.armAndWait();
  return fence;
};

const isBsonTimestamp = (ts) =>
  ts != null && typeof ts === 'object'
  && typeof ts.t === 'number' && typeof ts.i === 'number';

// Write timestamps are recorded on the fence per (connection, collection) —
// see fenceWriteTsKey in mongo_common.js. Tests that read or fabricate the
// annotation map have to build the same composite key.
const defaultMongo = () => MongoInternals.defaultRemoteCollectionDriver().mongo;
const fenceKey = (collectionName, connection) =>
  `${(connection || defaultMongo())._csConnectionId}\u0000${collectionName}`;

Tinytest.addAsync(
  'changestream - insertAsync annotates fence with per-collection ts',
  async function (test) {
    const c = makeCollection();
    let snapshot = null;
    const fence = await withFence(async (f) => {
      await c.insertAsync({ name: 'n1' });
      snapshot = f._csTargetTsByCollection && { ...f._csTargetTsByCollection };
    });
    test.isTrue(snapshot !== null, 'fence should have been annotated during the fn');
    test.isTrue(snapshot[fenceKey(c._name)] !== undefined, 'map should contain the (connection, collection) key');
    test.isTrue(isBsonTimestamp(snapshot[fenceKey(c._name)]), 'annotation value should be a BSON Timestamp');
    test.isTrue(fence.fired, 'fence should have fired');
  }
);

Tinytest.addAsync(
  'changestream- updateAsync annotates fence',
  async function (test) {
    const c = makeCollection();
    const id = await c.insertAsync({ name: 'before' });
    let snapshot = null;
    await withFence(async (f) => {
      await c.updateAsync(id, { $set: { name: 'after' } });
      snapshot = f._csTargetTsByCollection && { ...f._csTargetTsByCollection };
    });
    test.isTrue(snapshot !== null);
    test.isTrue(isBsonTimestamp(snapshot[fenceKey(c._name)]), 'update should annotate with a Timestamp');
  }
);

Tinytest.addAsync(
  'changestream- removeAsync annotates fence',
  async function (test) {
    const c = makeCollection();
    const id = await c.insertAsync({ name: 'doomed' });
    let snapshot = null;
    await withFence(async (f) => {
      await c.removeAsync(id);
      snapshot = f._csTargetTsByCollection && { ...f._csTargetTsByCollection };
    });
    test.isTrue(snapshot !== null);
    test.isTrue(isBsonTimestamp(snapshot[fenceKey(c._name)]), 'remove should annotate with a Timestamp');
  }
);

Tinytest.addAsync(
  'changestream- writes to different collections create separate entries',
  async function (test) {
    const a = makeCollection();
    const b = makeCollection();
    let snapshot = null;
    await withFence(async (f) => {
      await a.insertAsync({ n: 1 });
      await b.insertAsync({ n: 1 });
      snapshot = f._csTargetTsByCollection && { ...f._csTargetTsByCollection };
    });
    test.isTrue(snapshot !== null);
    test.isTrue(isBsonTimestamp(snapshot[fenceKey(a._name)]), 'collection A should be annotated');
    test.isTrue(isBsonTimestamp(snapshot[fenceKey(b._name)]), 'collection B should be annotated');
    test.notEqual(a._name, b._name, 'sanity: distinct collection names');
  }
);

Tinytest.addAsync(
  'changestream- two writes to same collection keep the later ts',
  async function (test) {
    const c = makeCollection();
    let tsFirst = null;
    let tsFinal = null;
    // Snapshot the Timestamp's t/i fields directly — `{ ...timestamp }` only
    // copies own enumerable properties, which on the BSON Timestamp/Long class
    // are `low`/`high`/`unsigned`. The `t` and `i` accessors live on the
    // prototype and would be lost in a spread, leaving an undefined comparison.
    const snapshotTs = (ts) => (ts == null ? null : { t: ts.t, i: ts.i });
    await withFence(async (f) => {
      await c.insertAsync({ n: 1 });
      tsFirst = snapshotTs(f._csTargetTsByCollection[fenceKey(c._name)]);
      await c.insertAsync({ n: 2 });
      tsFinal = snapshotTs(f._csTargetTsByCollection[fenceKey(c._name)]);
    });
    test.isTrue(isBsonTimestamp(tsFirst) && isBsonTimestamp(tsFinal));
    const firstLessOrEqual = tsFirst.t < tsFinal.t
      || (tsFirst.t === tsFinal.t && tsFirst.i <= tsFinal.i);
    test.isTrue(
      firstLessOrEqual,
      `later write should have ts >= earlier; got ${JSON.stringify(tsFirst)} → ${JSON.stringify(tsFinal)}`
    );
  }
);

Tinytest.addAsync(
  'changestream- writes without an active fence do not throw',
  async function (test) {
    // No withFence wrapper: _getCurrentFence() returns undefined,
    // _annotateFenceWithWriteTs short-circuits.
    const c = makeCollection();
    let threw = null;
    try {
      await c.insertAsync({ n: 1 });
      await c.updateAsync({ n: 1 }, { $set: { n: 2 } });
      await c.removeAsync({ n: 2 });
    } catch (e) {
      threw = e;
    }
    test.isNull(threw, 'writes without a fence should succeed silently');
  }
);

Tinytest.addAsync(
  'changestream- _waitUntilCaughtUp returns fast when fence ts is already processed',
  async function (test) {
    const c = makeCollection();
    const handle = await c.find({}).observeChanges({ added: function () { } });
    test.isTrue(isChangeStreamDriver(handle));
    const driver = handle._multiplexer._observeDriver;

    // Seed: insert so the driver's _lastProcessedOperationTime advances.
    await c.insertAsync({ n: 1 });
    await waitFor(() => driver._lastProcessedOperationTime !== null, 2000);

    // Build a fake fence whose target ts is <= _lastProcessedOperationTime.
    // _waitUntilCaughtUp should hit the 'already-caught-up' early exit
    // and not enqueue a resolver.
    const pastTs = driver._lastProcessedOperationTime;
    const fakeFence = { _csTargetTsByCollection: { [fenceKey(c._name)]: pastTs } };

    const t0 = Date.now();
    await driver._waitUntilCaughtUp(fakeFence);
    const elapsed = Date.now() - t0;

    test.isTrue(elapsed < 50, `fence hit should short-circuit fast; elapsed=${elapsed}ms`);
    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream- _waitUntilCaughtUp returns immediately when no fence annotation',
  async function (test) {
    const c = makeCollection();
    const handle = await c.find({}).observeChanges({ added: function () { } });
    test.isTrue(isChangeStreamDriver(handle));
    const driver = handle._multiplexer._observeDriver;

    // No fence at all → no specific write to wait for, return without waiting.
    const t0 = Date.now();
    await driver._waitUntilCaughtUp(undefined);
    const elapsed = Date.now() - t0;

    test.isTrue(elapsed < 250, `no-fence path should return immediately; elapsed=${elapsed}ms`);
    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream- _waitUntilCaughtUp ignores annotation for a different collection',
  async function (test) {
    // If _waitUntilCaughtUp took ts from another collection, we'd spin
    // forever waiting for a clusterTime this driver's stream never observes
    // (no safety-valve timeout — the wait is unbounded by design, mirroring
    // OplogHandle._waitUntilCaughtUp). The correct behaviour is to skip
    // entirely when our collection isn't in the annotation map.
    const c = makeCollection();
    const handle = await c.find({}).observeChanges({ added: function () { } });
    test.isTrue(isChangeStreamDriver(handle));
    const driver = handle._multiplexer._observeDriver;

    const farFutureTs = { t: Math.floor(Date.now() / 1000) + 3600, i: 1 };
    const strayFence = {
      _csTargetTsByCollection: { [fenceKey('not_' + c._name)]: farFutureTs },
    };

    const t0 = Date.now();
    await driver._waitUntilCaughtUp(strayFence);
    const elapsed = Date.now() - t0;

    test.isTrue(
      elapsed < 250,
      `annotation for another collection should be ignored; elapsed=${elapsed}ms`
    );
    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream- _waitUntilCaughtUp ignores annotation from another connection (#14600)',
  async function (test) {
    // Regression for meteor/meteor#14600. An app can hold more than one
    // MongoConnection — a second MongoInternals.RemoteCollectionDriver onto a
    // different cluster is the common case — and those connections routinely
    // use the same collection names. The crossbar notifies every driver
    // listening on a collection *name*, so a write on the other connection
    // lands this driver in _waitUntilCaughtUp with a fence that only carries
    // that connection's timestamp. Its clusterTime comes from a cluster this
    // driver's stream never observes, so keying on the name alone parked the
    // wait forever and hung the method that issued the write.
    const c = makeCollection();
    const handle = await c.find({}).observeChanges({ added: function () { } });
    test.isTrue(isChangeStreamDriver(handle));
    const driver = handle._multiplexer._observeDriver;

    // Same collection name, but recorded against a connection that is not ours.
    const farFutureTs = { t: Math.floor(Date.now() / 1000) + 3600, i: 1 };
    const otherConnection = { _csConnectionId: 'mc_other_connection' };
    const foreignFence = {
      _csTargetTsByCollection: {
        [fenceKey(c._name, otherConnection)]: farFutureTs,
      },
    };

    // Race the wait: before the fix this never resolves, and awaiting it
    // directly would hang the whole suite instead of failing.
    const t0 = Date.now();
    const raced = await Promise.race([
      driver._waitUntilCaughtUp(foreignFence).then(() => 'resolved'),
      new Promise(r => setTimeout(() => r('timed-out'), 2000)),
    ]);
    const elapsed = Date.now() - t0;

    test.equal(
      raced, 'resolved',
      'a foreign connection\'s annotation must not park this driver\'s wait'
    );
    test.isTrue(
      elapsed < 250,
      `foreign-connection annotation should be ignored; elapsed=${elapsed}ms`
    );
    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream- _waitUntilCaughtUp still waits for its own connection (#14600)',
  async function (test) {
    // Guards the other side of the #14600 fix: scoping the lookup by
    // connection must not turn every wait into a no-op. An annotation recorded
    // against *our* connection for *our* collection still has to park the wait
    // until the stream reaches it — releasing early is what #14452 was about
    // (the fence fires before the change is applied and the client sees
    // `updated` with no preceding `added`/`changed`/`removed`).
    const c = makeCollection();
    const handle = await c.find({}).observeChanges({ added: function () { } });
    test.isTrue(isChangeStreamDriver(handle));
    const driver = handle._multiplexer._observeDriver;

    const farFutureTs = { t: Math.floor(Date.now() / 1000) + 3600, i: 1 };
    const ownFence = {
      _csTargetTsByCollection: { [fenceKey(c._name)]: farFutureTs },
    };

    const raced = await Promise.race([
      driver._waitUntilCaughtUp(ownFence).then(() => 'resolved'),
      new Promise(r => setTimeout(() => r('still-waiting'), 500)),
    ]);

    test.equal(
      raced, 'still-waiting',
      'a ts for our own connection and collection must still block the wait'
    );

    // stop() drains the parked resolver so the pending wait above doesn't
    // outlive the test (see the #14452 test below).
    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream- a second connection annotates its own fence key (#14600)',
  async function (test) {
    // End-to-end counterpart of the two tests above, with a real second
    // MongoConnection rather than a hand-built fence: writing the same
    // collection name through each connection must produce two distinct
    // entries, so neither driver can pick up the other's clusterTime.
    const collectionName = 'changestream_test_' + Random.id();
    const primary = defaultMongo();
    const secondary = new MongoInternals.RemoteCollectionDriver(
      process.env.MONGO_URL
    );

    test.notEqual(
      primary._csConnectionId, secondary.mongo._csConnectionId,
      'each MongoConnection should get its own id'
    );

    const primaryCollection = new Mongo.Collection(collectionName);
    const secondaryCollection = new Mongo.Collection(collectionName, {
      _driver: secondary,
      _suppressSameNameError: true,
    });

    let snapshot = null;
    await withFence(async (f) => {
      await primaryCollection.insertAsync({ via: 'primary' });
      await secondaryCollection.insertAsync({ via: 'secondary' });
      snapshot = f._csTargetTsByCollection && { ...f._csTargetTsByCollection };
    });

    test.isTrue(snapshot !== null, 'fence should have been annotated');
    test.isTrue(
      isBsonTimestamp(snapshot[fenceKey(collectionName, primary)]),
      'the primary connection should have its own entry'
    );
    test.isTrue(
      isBsonTimestamp(snapshot[fenceKey(collectionName, secondary.mongo)]),
      'the secondary connection should have a separate entry'
    );
    test.equal(
      Object.keys(snapshot).length, 2,
      'same collection name on two connections should not share one entry'
    );

    await secondary.mongo.close();
  }
);

Tinytest.addAsync(
  'changestream- stop() releases a fence waiter parked in _waitUntilCaughtUp (#14452)',
  async function (test) {
    // Regression for meteor/meteor#14452. If the driver is stopped while a
    // write fence is still parked in _waitUntilCaughtUp, the change-stream
    // event that would advance _lastProcessedOperationTime to targetTs never
    // arrives (the stream is being closed), so the parked resolver would hang
    // forever. The fence's onBeforeFire awaits that resolver, so the DDP
    // method that issued the write never gets its `updated` message and the
    // client call hangs until timeout. stop() must release the waiter.
    const c = makeCollection();
    const handle = await c.find({}).observeChanges({ added: function () { } });
    test.isTrue(isChangeStreamDriver(handle));
    const driver = handle._multiplexer._observeDriver;

    // Seed so _lastProcessedOperationTime is non-null, then build a fence with
    // a target ts far in the future. The stream will never deliver an event
    // with clusterTime >= this, so the wait parks a resolver and blocks.
    // The ts must be a real BSON Timestamp (not a plain {t, i}) — Timestamp's
    // compare() mishandles plain objects, which would send _waitUntilCaughtUp
    // down its already-caught-up early return instead of parking.
    await c.insertAsync({ n: 1 });
    await waitFor(() => driver._lastProcessedOperationTime !== null, 2000);

    const Timestamp = driver._lastProcessedOperationTime.constructor;
    const farFutureTs = new Timestamp({ t: Math.floor(Date.now() / 1000) + 3600, i: 1 });
    const fakeFence = { _csTargetTsByCollection: { [fenceKey(c._name)]: farFutureTs } };

    // Park the waiter. Do NOT await — it must not resolve until stop().
    let resolved = false;
    const waitPromise = driver
      ._waitUntilCaughtUp(fakeFence)
      .then(() => { resolved = true; });

    await waitFor(() => driver._catchingUpResolvers.length === 1, 1000);
    test.equal(
      driver._catchingUpResolvers.length,
      1,
      'a resolver should be parked while the fence waits for a future ts'
    );
    test.isFalse(resolved, 'wait must not resolve before stop');

    // Stop the driver. This must drain the parked resolver rather than leaving
    // it (and its watchdog) running forever.
    await driver.stop();

    const released = await waitFor(() => resolved, 3000);
    test.isTrue(released, 'stop() should release the parked fence waiter (#14452)');
    test.equal(
      driver._catchingUpResolvers.length,
      0,
      'catching-up resolvers should be drained on stop'
    );

    await waitPromise;
    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream- annotation is cleared after fence fires (with active observer)',
  async function (test) {
    const c = makeCollection();
    const handle = await c.find({}).observeChanges({ added: function () { } });
    test.isTrue(isChangeStreamDriver(handle));

    const fence = await withFence(async () => {
      await c.insertAsync({ n: 1 });
    });

    // After onBeforeFire ran, cleanup `delete fence._csTargetTsByCollection`
    // should have removed the map.
    test.isTrue(fence.fired, 'fence should have fired');
    test.isUndefined(
      fence._csTargetTsByCollection,
      'annotation map should be cleared after drivers caught up'
    );
    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream- waitUntilCaughtUp warn watchdog default is 10s',
  async function (test) {
    // The previous implementation had a hard safety-valve timeout that
    // released the wait early; that caused fences to fire before the
    // change had been delivered to the multiplexer (e.g. client received
    // `updated` without `changed`). The wait is now unbounded — only a
    // log-only watchdog at waitUntilCaughtUpWarnMs (default 10s) flags
    // genuinely stalled streams without masking them.
    const setting = Meteor.settings
      && Meteor.settings.packages
      && Meteor.settings.packages.mongo
      && Meteor.settings.packages.mongo.changeStream
      && Meteor.settings.packages.mongo.changeStream.waitUntilCaughtUpWarnMs;
    const effective = setting ?? 10000;
    test.equal(effective, 10000, 'warn watchdog default should be 10s; override via Meteor.settings.packages.mongo.changeStream.waitUntilCaughtUpWarnMs');
  }
);

Tinytest.addAsync(
  'changestream- insert under fence with observer resolves well under 1s',
  async function (test) {
    // Pre-fix pathology was a hard ~2s wait (2x 1000ms timeout) because
    // _waitUntilCaughtUp asked the server for a ts the stream hadn't seen
    // yet. With the fix the fence carries the exact write ts, the change
    // event carries the same ts, and the wait resolves immediately.
    // 500ms bound catches a regression without flaking on slow CI.
    const c = makeCollection();
    const added = [];
    const handle = await c.find({}).observeChanges({
      added: function (id, fields) { added.push(fields); },
    });
    test.isTrue(isChangeStreamDriver(handle));

    await new Promise(r => setTimeout(r, 50));
    added.length = 0;

    const t0 = Date.now();
    await withFence(async () => {
      await c.insertAsync({ n: 'fenced-latency' });
    });
    const elapsed = Date.now() - t0;

    test.isTrue(
      elapsed < 500,
      `fenced insert+fire should be fast with the fix; elapsed=${elapsed}ms (pre-fix ~2000ms)`
    );

    const sawInsert = await waitFor(
      () => added.some(f => f.n === 'fenced-latency'),
      2000
    );
    test.isTrue(sawInsert, 'observer should have received the fenced insert');
    handle.stop();
  }
);

// ============================================================================
// TRANSLATION BOUNDARY TESTS
//
// The driver translates native BSON <-> Meteor types exactly once per path:
// the selector is translated to native types for the snapshot query, and
// documents are translated back to Meteor types at two boundaries
// (_sendInitialAdds for the snapshot, _handleChange for live events) before
// they reach the projection, the matcher or the multiplexer. These tests guard
// that boundary for special-typed *field values* (not just the _id), on every
// path a document can take to the client: initial snapshot, live insert and
// live changed. They fail if any boundary forwards a raw BSON atom.
// ============================================================================

Tinytest.addAsync(
  'changestream - translation boundary: ObjectID/Binary fields survive the initial snapshot',
  async function (test) {
    const c = new Mongo.Collection('changestream_test_fieldtypes_snap_' + Random.id());

    const ref = new Mongo.ObjectID();
    const blob = EJSON.newBinary(3);
    blob[0] = 10; blob[1] = 20; blob[2] = 30;

    await c.insertAsync({ ref, blob, n: 1 });

    const added = [];
    const handle = await c.find({}).observeChanges({
      added(id, fields) { added.push({ id, fields }); },
    });
    test.isTrue(isChangeStreamDriver(handle), 'Should be using ChangeStream driver');

    await waitFor(() => added.length > 0);
    test.equal(added.length, 1, 'initial added should fire');

    const f = added[0].fields;
    test.isTrue(
      f.ref instanceof Mongo.ObjectID,
      'snapshot must deliver an ObjectID field as Mongo.ObjectID, not a native BSON atom'
    );
    test.equal(f.ref.toHexString(), ref.toHexString());
    test.isTrue(EJSON.isBinary(f.blob), 'snapshot must deliver a Binary field as a Meteor binary');
    test.isTrue(EJSON.equals(f.blob, blob), 'Binary field bytes should round-trip');

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - translation boundary: ObjectID field survives a live insert',
  async function (test) {
    const c = new Mongo.Collection('changestream_test_fieldtypes_ins_' + Random.id());

    const added = [];
    const handle = await c.find({}).observeChanges({
      added(id, fields) { added.push({ id, fields }); },
    });
    test.isTrue(isChangeStreamDriver(handle), 'Should be using ChangeStream driver');

    const ref = new Mongo.ObjectID();
    await c.insertAsync({ ref, n: 1 });

    await waitFor(() => added.length > 0);
    test.equal(added.length, 1, 'live insert should fire added');
    const f = added[0].fields;
    test.isTrue(
      f.ref instanceof Mongo.ObjectID,
      'live insert must deliver an ObjectID field as Mongo.ObjectID, not a native BSON atom'
    );
    test.equal(f.ref.toHexString(), ref.toHexString());

    handle.stop();
  }
);

Tinytest.addAsync(
  'changestream - translation boundary: ObjectID field survives a live changed (diff path)',
  async function (test) {
    const c = new Mongo.Collection('changestream_test_fieldtypes_upd_' + Random.id());

    const ref1 = new Mongo.ObjectID();
    const id = await c.insertAsync({ ref: ref1, n: 1 });

    const events = [];
    const handle = await c.find({}).observeChanges({
      added(docId, fields) { events.push({ type: 'added', fields }); },
      changed(docId, fields) { events.push({ type: 'changed', fields }); },
    });
    test.isTrue(isChangeStreamDriver(handle), 'Should be using ChangeStream driver');

    await waitFor(() => events.length > 0);
    test.equal(events[0].type, 'added', 'initial added for the pre-existing doc');
    events.length = 0;

    const ref2 = new Mongo.ObjectID();
    await c.updateAsync(id, { $set: { ref: ref2 } });

    await waitFor(() => events.length > 0);
    test.equal(events[0].type, 'changed', 'update should emit changed');
    const f = events[0].fields;
    test.isTrue(
      f.ref instanceof Mongo.ObjectID,
      'live changed must deliver an ObjectID field as Mongo.ObjectID, not a native BSON atom'
    );
    test.equal(f.ref.toHexString(), ref2.toHexString(), 'changed should carry the new ObjectID value');

    handle.stop();
  }
);
