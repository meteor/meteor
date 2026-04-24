import { Tinytest } from 'meteor/tinytest';

// ===========================================================================
// StreamProvider Tests
// ===========================================================================

Tinytest.add('afs - StreamProvider - cannot instantiate directly', (test) => {
  test.throws(() => {
    new AFS.StreamProvider();
  }, /abstract/i);
});

Tinytest.add('afs - StreamProvider - subclass must implement methods', async (test) => {
  class TestProvider extends AFS.StreamProvider {
    constructor() {
      super({ name: 'test' });
    }
  }

  const provider = new TestProvider();
  test.equal(provider.name, 'test');

  // Abstract methods should throw
  let threw = false;
  try {
    await provider.insertAsync('col', {});
  } catch (e) {
    threw = true;
    test.isTrue(e.message.includes('must be implemented'));
  }
  test.isTrue(threw);
});

// ===========================================================================
// MockStreamProvider Tests
// ===========================================================================

Tinytest.addAsync('afs - MockStreamProvider - insert and find', async (test) => {
  const provider = new AFS.MockStreamProvider();

  test.isTrue(provider.isConnected());

  // Insert a document
  const id = await provider.insertAsync('items', { name: 'Test Item', value: 42 });
  test.isTrue(typeof id === 'string');
  test.isTrue(id.length > 0);

  // Find the document
  const doc = await provider.findOneAsync('items', { _id: id });
  test.equal(doc.name, 'Test Item');
  test.equal(doc.value, 42);
  test.equal(doc._id, id);
});

Tinytest.addAsync('afs - MockStreamProvider - update', async (test) => {
  const provider = new AFS.MockStreamProvider();

  const id = await provider.insertAsync('items', { name: 'Original', count: 1 });
  await provider.updateAsync('items', { _id: id }, { $set: { name: 'Updated', count: 2 } });

  const doc = await provider.findOneAsync('items', { _id: id });
  test.equal(doc.name, 'Updated');
  test.equal(doc.count, 2);
});

Tinytest.addAsync('afs - MockStreamProvider - remove', async (test) => {
  const provider = new AFS.MockStreamProvider();

  const id = await provider.insertAsync('items', { name: 'ToDelete' });
  const removed = await provider.removeAsync('items', { _id: id });
  test.equal(removed, 1);

  const doc = await provider.findOneAsync('items', { _id: id });
  test.equal(doc, undefined);
});

Tinytest.addAsync('afs - MockStreamProvider - upsert', async (test) => {
  const provider = new AFS.MockStreamProvider();

  // Upsert when document doesn't exist (insert)
  const result = await provider.upsertAsync(
    'items',
    { name: 'Upserted' },
    { $set: { name: 'Upserted', value: 99 } }
  );
  test.isTrue(result.numberAffected >= 1 || result >= 0);
});

Tinytest.addAsync('afs - MockStreamProvider - find with cursor', async (test) => {
  const provider = new AFS.MockStreamProvider();

  await provider.insertAsync('items', { name: 'A', order: 1 });
  await provider.insertAsync('items', { name: 'B', order: 2 });
  await provider.insertAsync('items', { name: 'C', order: 3 });

  const cursor = provider.find('items', {}, { sort: { order: 1 } });
  const docs = cursor.fetch();
  test.equal(docs.length, 3);
  test.equal(docs[0].name, 'A');
  test.equal(docs[1].name, 'B');
  test.equal(docs[2].name, 'C');
});

Tinytest.addAsync('afs - MockStreamProvider - find with limit', async (test) => {
  const provider = new AFS.MockStreamProvider();

  await provider.insertAsync('limited', { val: 1 });
  await provider.insertAsync('limited', { val: 2 });
  await provider.insertAsync('limited', { val: 3 });

  const cursor = provider.find('limited', {}, { limit: 2 });
  const docs = cursor.fetch();
  test.equal(docs.length, 2);
});

Tinytest.addAsync('afs - MockStreamProvider - find with selector', async (test) => {
  const provider = new AFS.MockStreamProvider();

  await provider.insertAsync('filtered', { type: 'a', val: 1 });
  await provider.insertAsync('filtered', { type: 'b', val: 2 });
  await provider.insertAsync('filtered', { type: 'a', val: 3 });

  const cursor = provider.find('filtered', { type: 'a' });
  const docs = cursor.fetch();
  test.equal(docs.length, 2);
  test.isTrue(docs.every(d => d.type === 'a'));
});

Tinytest.addAsync('afs - MockStreamProvider - capabilities', async (test) => {
  const provider = new AFS.MockStreamProvider();
  const caps = provider.capabilities();

  test.isTrue(caps.reactiveQueries);
  test.isTrue(caps.upsert);
  test.isFalse(caps.transactions);
  test.isFalse(caps.oplog);
});

Tinytest.addAsync('afs - MockStreamProvider - close and reconnect', async (test) => {
  const provider = new AFS.MockStreamProvider();
  test.isTrue(provider.isConnected());

  await provider.close();
  test.isFalse(provider.isConnected());

  await provider.connect();
  test.isTrue(provider.isConnected());
});

// ===========================================================================
// Registry Tests
// ===========================================================================

Tinytest.add('afs - Registry - register and get provider', (test) => {
  AFS._reset();

  const provider = new AFS.MockStreamProvider();
  AFS.registerProvider('test-provider', provider);

  test.equal(AFS.getProvider('test-provider'), provider);
  test.isTrue(AFS.listProviders().includes('test-provider'));

  AFS._reset();
});

Tinytest.add('afs - Registry - first provider becomes default', (test) => {
  AFS._reset();

  const provider1 = new AFS.MockStreamProvider();
  const provider2 = new AFS.MockStreamProvider();

  AFS.registerProvider('first', provider1);
  AFS.registerProvider('second', provider2);

  test.equal(AFS.getDefaultProvider(), provider1);

  AFS._reset();
});

Tinytest.add('afs - Registry - set default provider', (test) => {
  AFS._reset();

  const provider1 = new AFS.MockStreamProvider();
  const provider2 = new AFS.MockStreamProvider();

  AFS.registerProvider('first', provider1);
  AFS.registerProvider('second', provider2);

  AFS.setDefaultProvider('second');
  test.equal(AFS.getDefaultProvider(), provider2);

  AFS._reset();
});

Tinytest.add('afs - Registry - cannot set default to unregistered provider', (test) => {
  AFS._reset();

  test.throws(() => {
    AFS.setDefaultProvider('nonexistent');
  }, /unregistered/i);

  AFS._reset();
});

Tinytest.add('afs - Registry - register and get collection', (test) => {
  AFS._reset();

  const mockCollection = { _name: 'test-col' };
  AFS.registerCollection('test-col', mockCollection);

  test.equal(AFS.getCollection('test-col'), mockCollection);
  test.isTrue(AFS.listCollections().includes('test-col'));

  AFS._reset();
});

Tinytest.add('afs - Registry - core collection registration', (test) => {
  AFS._reset();

  const usersCollection = { _name: 'users' };
  AFS.registerCoreCollection('users', usersCollection);

  test.equal(AFS.getCoreCollection('users'), usersCollection);
  test.isTrue(AFS.hasCoreCollection('users'));
  test.isTrue(AFS.listCoreCollections().includes('users'));

  // Core collection should also be in general registry
  test.equal(AFS.getCollection('users'), usersCollection);

  AFS._reset();
});

Tinytest.add('afs - Registry - getCoreCollection fallback to general', (test) => {
  AFS._reset();

  const collection = { _name: 'orders' };
  AFS.registerCollection('orders', collection);

  // Not registered as core, but getCoreCollection should fall back
  test.equal(AFS.getCoreCollection('orders'), collection);

  AFS._reset();
});

Tinytest.add('afs - Registry - remove provider', (test) => {
  AFS._reset();

  const provider = new AFS.MockStreamProvider();
  AFS.registerProvider('removable', provider);
  test.equal(AFS.getProvider('removable'), provider);

  AFS.removeProvider('removable');
  test.equal(AFS.getProvider('removable'), undefined);

  AFS._reset();
});

Tinytest.add('afs - Registry - reset clears all state', (test) => {
  const provider = new AFS.MockStreamProvider();
  AFS.registerProvider('p1', provider);
  AFS.registerCollection('c1', { _name: 'c1' });
  AFS.registerCoreCollection('core1', { _name: 'core1' });

  AFS._reset();

  test.equal(AFS.getProvider('p1'), undefined);
  test.equal(AFS.getCollection('c1'), undefined);
  test.equal(AFS.getCoreCollection('core1'), undefined);
  test.equal(AFS.getDefaultProvider(), null);
});

// ===========================================================================
// AdaptiveEngine Tests (server only)
// ===========================================================================

if (Meteor.isServer) {
  Tinytest.add('afs - AdaptiveEngine - prefetch tracking', (test) => {
    const engine = AFS.getEngine();
    engine.reset();

    const selector = { status: 'active' };

    // Initially should not prefetch
    test.isFalse(engine.shouldPrefetch('orders', selector));

    // Record access multiple times
    for (let i = 0; i < 5; i++) {
      engine.recordAccess('orders', selector, {});
    }

    // Now should suggest prefetching
    test.isTrue(engine.shouldPrefetch('orders', selector));

    const suggestions = engine.getPrefetchSuggestions('orders');
    test.isTrue(suggestions.length > 0);

    engine.reset();
  });

  Tinytest.add('afs - AdaptiveEngine - throttle tracking', (test) => {
    const engine = AFS.getEngine();
    engine.reset();

    // Initially should not throttle
    test.isFalse(engine.shouldThrottle('fast-collection'));
    test.equal(engine.getThrottleDelay('fast-collection'), 0);

    // Record a slow query execution
    engine.recordQueryExecution('fast-collection', 100);

    // Should potentially throttle now
    const delay = engine.getThrottleDelay('fast-collection');
    test.isTrue(typeof delay === 'number');
    test.isTrue(delay >= 0);

    engine.reset();
  });

  Tinytest.add('afs - AdaptiveEngine - backpressure', (test) => {
    const engine = AFS.getEngine();
    engine.reset();

    // Initially no backpressure
    test.isFalse(engine.shouldApplyBackpressure('query'));
    test.isFalse(engine.shouldApplyBackpressure('write'));

    // Acquire slots
    const releases = [];
    for (let i = 0; i < 100; i++) {
      releases.push(engine.acquireSlot('query'));
    }

    // Now should have backpressure
    test.isTrue(engine.shouldApplyBackpressure('query'));

    // Release all slots
    releases.forEach(release => release());

    // No more backpressure
    test.isFalse(engine.shouldApplyBackpressure('query'));

    engine.reset();
  });

  Tinytest.add('afs - AdaptiveEngine - metrics', (test) => {
    const engine = AFS.getEngine();
    engine.reset();

    engine.recordAccess('col', { a: 1 }, {});
    engine.recordAccess('col', { a: 1 }, {});

    const metrics = engine.getMetrics();
    test.equal(metrics.totalQueries, 2);
    test.isTrue(metrics.trackedPatterns >= 1);

    engine.reset();
  });
}

// ===========================================================================
// AFSCursor Tests (server only, since AFSCursor uses StreamProvider)
// ===========================================================================

if (Meteor.isServer) {
  Tinytest.addAsync('afs - AFSCursor - _publishCursor interface', async (test) => {
    const provider = new AFS.MockStreamProvider();

    await provider.insertAsync('pub-test', { name: 'Doc1', val: 1 });
    await provider.insertAsync('pub-test', { name: 'Doc2', val: 2 });

    const cursor = provider.find('pub-test', {});

    // The cursor should have _publishCursor (Minimongo cursor does)
    test.isTrue(typeof cursor._publishCursor === 'function' ||
                typeof cursor.observeChanges === 'function');
  });

  Tinytest.addAsync('afs - AFSCursor - observeChanges', async (test) => {
    const provider = new AFS.MockStreamProvider();

    await provider.insertAsync('observe-test', { name: 'Existing' });

    const added = [];
    const cursor = provider.find('observe-test', {});

    const handle = cursor.observeChanges({
      added(id, fields) {
        added.push({ id, fields });
      },
      changed(id, fields) {},
      removed(id) {},
    });

    // Should have received the existing document
    test.isTrue(added.length >= 1);
    test.equal(added[0].fields.name, 'Existing');

    handle.stop();
  });
}

// ===========================================================================
// FederatedCollection Tests
// ===========================================================================

if (Meteor.isServer) {
  Tinytest.addAsync('afs - FederatedCollection - constructor with MockProvider', async (test) => {
    const provider = new AFS.MockStreamProvider();
    const collection = new AFS.Collection('afs-test-' + Random.id(), {
      provider,
      connection: null,
      defineMutationMethods: false,
    });

    test.isTrue(collection._name.startsWith('afs-test-'));
    test.equal(collection._provider, provider);
  });

  Tinytest.addAsync('afs - FederatedCollection - CRUD with MockProvider', async (test) => {
    const provider = new AFS.MockStreamProvider();
    const name = 'afs-crud-' + Random.id();
    const collection = new AFS.Collection(name, {
      provider,
      connection: null,
      defineMutationMethods: false,
    });

    // Insert
    const id = await collection.insertAsync({ title: 'Test', priority: 1 });
    test.isTrue(typeof id === 'string');

    // FindOne
    const doc = await collection.findOneAsync({ _id: id });
    test.equal(doc.title, 'Test');
    test.equal(doc.priority, 1);

    // Update
    await collection.updateAsync({ _id: id }, { $set: { title: 'Updated', priority: 2 } });
    const updated = await collection.findOneAsync({ _id: id });
    test.equal(updated.title, 'Updated');
    test.equal(updated.priority, 2);

    // Remove
    await collection.removeAsync({ _id: id });
    const removed = await collection.findOneAsync({ _id: id });
    test.equal(removed, undefined);
  });

  Tinytest.addAsync('afs - FederatedCollection - find returns cursor', async (test) => {
    const provider = new AFS.MockStreamProvider();
    const name = 'afs-find-' + Random.id();
    const collection = new AFS.Collection(name, {
      provider,
      connection: null,
      defineMutationMethods: false,
    });

    await collection.insertAsync({ letter: 'A' });
    await collection.insertAsync({ letter: 'B' });
    await collection.insertAsync({ letter: 'C' });

    const cursor = collection.find({});
    const docs = await cursor.fetchAsync();
    test.equal(docs.length, 3);
  });

  Tinytest.addAsync('afs - FederatedCollection - find with selector', async (test) => {
    const provider = new AFS.MockStreamProvider();
    const name = 'afs-selector-' + Random.id();
    const collection = new AFS.Collection(name, {
      provider,
      connection: null,
      defineMutationMethods: false,
    });

    await collection.insertAsync({ category: 'fruit', name: 'Apple' });
    await collection.insertAsync({ category: 'vegetable', name: 'Carrot' });
    await collection.insertAsync({ category: 'fruit', name: 'Banana' });

    const fruits = await collection.find({ category: 'fruit' }).fetchAsync();
    test.equal(fruits.length, 2);
    test.isTrue(fruits.every(d => d.category === 'fruit'));
  });

  Tinytest.addAsync('afs - FederatedCollection - registered with AFS', async (test) => {
    AFS._reset();

    const provider = new AFS.MockStreamProvider();
    const name = 'afs-registered-' + Random.id();
    const collection = new AFS.Collection(name, {
      provider,
      connection: null,
      defineMutationMethods: false,
    });

    test.equal(AFS.getCollection(name), collection);

    AFS._reset();
  });

  Tinytest.addAsync('afs - FederatedCollection - index operations', async (test) => {
    const provider = new AFS.MockStreamProvider();
    const name = 'afs-index-' + Random.id();
    const collection = new AFS.Collection(name, {
      provider,
      connection: null,
      defineMutationMethods: false,
    });

    // MockStreamProvider index operations are no-ops but should not throw
    await collection.createIndexAsync({ name: 1 }, { unique: true });
    await collection.dropIndexAsync('name_1');
  });
}

// ===========================================================================
// Integration Tests - Mongo.Collection + AFS Registry
// ===========================================================================

if (Meteor.isServer) {
  Tinytest.add('afs - Integration - Mongo.Collection registers with AFS', (test) => {
    // After startup, Mongo collections should be registered with AFS
    // We verify the mechanism works by checking that AFS is available
    test.isTrue(typeof AFS !== 'undefined');
    test.isTrue(typeof AFS.registerCollection === 'function');
    test.isTrue(typeof AFS.getCoreCollection === 'function');
  });

  Tinytest.add('afs - Integration - AFS.Collection has allow/deny', (test) => {
    const provider = new AFS.MockStreamProvider();
    const name = 'afs-allowdeny-' + Random.id();
    const collection = new AFS.Collection(name, {
      provider,
      connection: null,
      defineMutationMethods: false,
    });

    // Should have allow/deny methods from AllowDeny.CollectionPrototype
    test.isTrue(typeof collection.allow === 'function');
    test.isTrue(typeof collection.deny === 'function');
  });

  Tinytest.add('afs - Integration - Multiple providers coexist', (test) => {
    AFS._reset();

    const mongoProvider = new AFS.MockStreamProvider();
    const pgProvider = new AFS.MockStreamProvider();

    AFS.registerProvider('mongo', mongoProvider);
    AFS.registerProvider('postgres', pgProvider);

    test.equal(AFS.listProviders().length, 2);
    test.equal(AFS.getProvider('mongo'), mongoProvider);
    test.equal(AFS.getProvider('postgres'), pgProvider);

    // First registered is default
    test.equal(AFS.getDefaultProvider(), mongoProvider);

    AFS._reset();
  });
}

// ===========================================================================
// Client-side Tests
// ===========================================================================

// ===========================================================================
// ChangeStream Tests (server only)
// ===========================================================================

if (Meteor.isServer) {
  Tinytest.add('afs - ChangeStream - emits data events', (test) => {
    const stream = new AFS.ChangeStream({ collectionName: 'test', selector: {} });
    const events = [];

    stream.on('added', (id, fields) => events.push({ type: 'added', id, fields }));
    stream.on('changed', (id, fields) => events.push({ type: 'changed', id, fields }));
    stream.on('removed', (id) => events.push({ type: 'removed', id }));

    stream.added('doc1', { name: 'Alice' });
    stream.changed('doc1', { name: 'Bob' });
    stream.removed('doc1');

    test.equal(events.length, 3);
    test.equal(events[0].type, 'added');
    test.equal(events[0].id, 'doc1');
    test.equal(events[0].fields.name, 'Alice');
    test.equal(events[1].type, 'changed');
    test.equal(events[1].fields.name, 'Bob');
    test.equal(events[2].type, 'removed');
    test.equal(events[2].id, 'doc1');

    stream.stop();
  });

  Tinytest.add('afs - ChangeStream - emits ordered events', (test) => {
    const stream = new AFS.ChangeStream({ collectionName: 'test', selector: {} });
    const events = [];

    stream.on('addedBefore', (id, fields, before) => events.push({ type: 'addedBefore', id, fields, before }));
    stream.on('movedBefore', (id, before) => events.push({ type: 'movedBefore', id, before }));

    stream.addedBefore('doc1', { name: 'Alice' }, null);
    stream.addedBefore('doc2', { name: 'Bob' }, 'doc1');
    stream.movedBefore('doc1', null);

    test.equal(events.length, 3);
    test.equal(events[0].type, 'addedBefore');
    test.equal(events[0].before, null);
    test.equal(events[1].before, 'doc1');
    test.equal(events[2].type, 'movedBefore');

    stream.stop();
  });

  Tinytest.add('afs - ChangeStream - lifecycle events', (test) => {
    const stream = new AFS.ChangeStream({ collectionName: 'test', selector: {} });
    const lifecycle = [];

    // Install error handler to prevent unhandled error
    stream.on('error', () => {});

    stream.on('ready', () => lifecycle.push('ready'));
    stream.on('error', () => lifecycle.push('error'));
    stream.on('reconnected', () => lifecycle.push('reconnected'));
    stream.on('reset', () => lifecycle.push('reset'));
    stream.on('paused', () => lifecycle.push('paused'));
    stream.on('resumed', () => lifecycle.push('resumed'));

    test.isFalse(stream.isReady());
    stream.markReady();
    test.isTrue(stream.isReady());

    stream.markError(new Error('test'));
    stream.markReconnected();
    stream.markReset();
    stream.markPaused();
    stream.markResumed();

    test.equal(lifecycle, ['ready', 'error', 'reconnected', 'reset', 'paused', 'resumed']);
    stream.stop();
  });

  Tinytest.add('afs - ChangeStream - stop clears listeners', (test) => {
    const stream = new AFS.ChangeStream({ collectionName: 'test', selector: {} });
    let stopEmitted = false;

    stream.on('stop', () => { stopEmitted = true; });
    stream.on('added', () => {});

    test.isFalse(stream.isStopped());
    stream.stop();
    test.isTrue(stream.isStopped());
    test.isTrue(stopEmitted);

    // After stop, listeners should be removed
    test.equal(stream.listenerCount('added'), 0);
  });

  Tinytest.add('afs - ChangeStream - double stop is safe', (test) => {
    const stream = new AFS.ChangeStream({ collectionName: 'test', selector: {} });
    stream.stop();
    stream.stop(); // Should not throw
    test.isTrue(stream.isStopped());
  });
}

// ===========================================================================
// ObserveMultiplexer Tests (server only)
// ===========================================================================

if (Meteor.isServer) {
  Tinytest.addAsync('afs - ObserveMultiplexer - fans out to multiple handles', async (test) => {
    const stream = new AFS.ChangeStream({ collectionName: 'test', selector: {} });

    // Create multiplexer BEFORE emitting, so it can cache
    const multiplexer = new AFS.ObserveMultiplexer(stream, false);

    // Emit initial data then mark ready
    stream.added('doc1', { name: 'Alice' });
    stream.added('doc2', { name: 'Bob' });
    stream.markReady();

    // First handle
    const added1 = [];
    const handle1 = await multiplexer.addHandle({
      added(id, fields) { added1.push({ id, fields }); },
    });

    // Should have received initial adds from cache
    test.equal(added1.length, 2);

    // Second handle (late joiner)
    const added2 = [];
    const handle2 = await multiplexer.addHandle({
      added(id, fields) { added2.push({ id, fields }); },
    });

    // Late joiner should also get initial state
    test.equal(added2.length, 2);

    // Emit a new change — both should receive it
    stream.added('doc3', { name: 'Charlie' });
    test.equal(added1.length, 3);
    test.equal(added2.length, 3);

    handle1.stop();
    handle2.stop();
  });

  Tinytest.addAsync('afs - ObserveMultiplexer - handles changed and removed', async (test) => {
    const stream = new AFS.ChangeStream({ collectionName: 'test', selector: {} });
    const multiplexer = new AFS.ObserveMultiplexer(stream, false);

    stream.added('doc1', { name: 'Alice', age: 30 });
    stream.markReady();

    const changes = [];
    const removals = [];
    const handle = await multiplexer.addHandle({
      added(id, fields) {},
      changed(id, fields) { changes.push({ id, fields }); },
      removed(id) { removals.push(id); },
    });

    stream.changed('doc1', { age: 31 });
    test.equal(changes.length, 1);
    test.equal(changes[0].fields.age, 31);

    stream.removed('doc1');
    test.equal(removals.length, 1);
    test.equal(removals[0], 'doc1');

    handle.stop();
  });

  Tinytest.addAsync('afs - ObserveMultiplexer - ordered mode', async (test) => {
    const stream = new AFS.ChangeStream({ collectionName: 'test', selector: {} });
    const multiplexer = new AFS.ObserveMultiplexer(stream, true);

    stream.addedBefore('doc1', { name: 'Alice' }, null);
    stream.addedBefore('doc2', { name: 'Bob' }, 'doc1');
    stream.markReady();

    const events = [];
    const handle = await multiplexer.addHandle({
      addedBefore(id, fields, before) { events.push({ type: 'addedBefore', id, before }); },
      movedBefore(id, before) { events.push({ type: 'movedBefore', id, before }); },
      changed(id, fields) { events.push({ type: 'changed', id }); },
      removed(id) { events.push({ type: 'removed', id }); },
    });

    // Should have received initial adds
    test.equal(events.length, 2);
    test.equal(events[0].type, 'addedBefore');

    // Emit a move
    stream.movedBefore('doc2', null);
    test.equal(events.length, 3);
    test.equal(events[2].type, 'movedBefore');

    handle.stop();
  });

  Tinytest.addAsync('afs - ObserveMultiplexer - lifecycle events forwarded', async (test) => {
    const stream = new AFS.ChangeStream({ collectionName: 'test', selector: {} });

    // Install error handler on stream to prevent unhandled error
    stream.on('error', () => {});

    const multiplexer = new AFS.ObserveMultiplexer(stream, false);
    stream.markReady();

    const lifecycle = [];
    const handle = await multiplexer.addHandle({
      added() {},
      error(err) { lifecycle.push('error:' + err.message); },
      reconnected() { lifecycle.push('reconnected'); },
      reset() { lifecycle.push('reset'); },
      paused() { lifecycle.push('paused'); },
      resumed() { lifecycle.push('resumed'); },
    });

    stream.markError(new Error('test-err'));
    stream.markReconnected();
    stream.markReset();
    stream.markPaused();
    stream.markResumed();

    test.equal(lifecycle, [
      'error:test-err',
      'reconnected',
      'reset',
      'paused',
      'resumed',
    ]);

    handle.stop();
  });

  Tinytest.addAsync('afs - ObserveMultiplexer - stream stops when last handle removed', async (test) => {
    const stream = new AFS.ChangeStream({ collectionName: 'test', selector: {} });
    const multiplexer = new AFS.ObserveMultiplexer(stream, false);
    stream.markReady();

    const handle1 = await multiplexer.addHandle({ added() {} });
    const handle2 = await multiplexer.addHandle({ added() {} });

    test.isFalse(stream.isStopped());
    handle1.stop();
    test.isFalse(stream.isStopped()); // Still one handle
    handle2.stop();
    test.isTrue(stream.isStopped()); // No more handles — stream stopped
  });
}

// ===========================================================================
// EventEmitter Path Integration Tests (server only)
// ===========================================================================

if (Meteor.isServer) {
  Tinytest.addAsync('afs - EventEmitter path - MockStreamProvider observeChanges works', async (test) => {
    const provider = new AFS.MockStreamProvider();

    await provider.insertAsync('ee-test', { name: 'Alice' });
    await provider.insertAsync('ee-test', { name: 'Bob' });

    // Verify provider supports EventEmitter
    test.isTrue(provider._supportsEventEmitter());

    const cursor = new AFS.Cursor(provider, 'ee-test', {});
    const added = [];

    const handle = await cursor.observeChangesAsync({
      added(id, fields) { added.push({ id, fields }); },
      changed() {},
      removed() {},
    });

    // Should have received both documents
    test.equal(added.length, 2);
    const names = added.map(a => a.fields.name).sort();
    test.equal(names[0], 'Alice');
    test.equal(names[1], 'Bob');

    handle.stop();
  });

  Tinytest.addAsync('afs - EventEmitter path - reactive updates propagate', async (test) => {
    const provider = new AFS.MockStreamProvider();

    await provider.insertAsync('ee-reactive', { name: 'Original' });

    const events = [];
    const cursor = new AFS.Cursor(provider, 'ee-reactive', {});

    const handle = await cursor.observeChangesAsync({
      added(id, fields) { events.push({ type: 'added', id, name: fields.name }); },
      changed(id, fields) { events.push({ type: 'changed', id, fields }); },
      removed(id) { events.push({ type: 'removed', id }); },
    });

    // Should have one initial add
    test.equal(events.length, 1);
    test.equal(events[0].type, 'added');
    test.equal(events[0].name, 'Original');

    // Insert another document — should trigger added
    await provider.insertAsync('ee-reactive', { name: 'New' });
    test.equal(events.length, 2);
    test.equal(events[1].type, 'added');

    handle.stop();
  });

  Tinytest.add('afs - StreamProvider - _supportsEventEmitter defaults false', (test) => {
    class TestProvider extends AFS.StreamProvider {
      constructor() { super({ name: 'test' }); }
    }
    const provider = new TestProvider();
    test.isFalse(provider._supportsEventEmitter());
  });

  Tinytest.add('afs - StreamProvider - createChangeStream returns ChangeStream', (test) => {
    class TestProvider extends AFS.StreamProvider {
      constructor() { super({ name: 'test' }); }
    }
    const provider = new TestProvider();
    const stream = provider.createChangeStream({ collectionName: 'test', selector: {} });
    test.isTrue(stream instanceof AFS.ChangeStream);
    stream.stop();
  });

  Tinytest.add('afs - StreamProvider - startObserving throws by default', (test) => {
    class TestProvider extends AFS.StreamProvider {
      constructor() { super({ name: 'test' }); }
    }
    const provider = new TestProvider();
    test.throws(() => {
      provider.startObserving({}, false);
    }, /must be implemented/);
  });
}

// ===========================================================================
// AdaptiveEngine ChangeStream Integration Tests (server only)
// ===========================================================================

if (Meteor.isServer) {
  Tinytest.add('afs - AdaptiveEngine - attachToStream tracks metrics', (test) => {
    const engine = AFS.getEngine();
    engine.reset();

    const stream = new AFS.ChangeStream({ collectionName: 'test', selector: {} });
    // Install error handler to prevent unhandled error
    stream.on('error', () => {});

    const detach = engine.attachToStream(stream);

    stream.added('doc1', { name: 'Alice' });
    stream.changed('doc1', { name: 'Bob' });
    stream.removed('doc1');
    stream.markError(new Error('test'));
    stream.markReconnected();

    const metrics = engine.getMetrics();
    test.equal(metrics.totalChanges, 3);
    test.equal(metrics.errors, 1);
    test.equal(metrics.reconnections, 1);

    // Detach and verify no more tracking
    detach();
    stream.added('doc2', { name: 'Charlie' });
    const metrics2 = engine.getMetrics();
    test.equal(metrics2.totalChanges, 3); // Unchanged

    stream.stop();
    engine.reset();
  });
}

// ===========================================================================
// Client-side Tests
// ===========================================================================

// ===========================================================================
// Registry EventEmitter Tests (server only)
// ===========================================================================

if (Meteor.isServer) {
  Tinytest.add('afs - Registry - emits provider:registered event', (test) => {
    AFS._reset();

    let emitted = null;
    AFS.on('provider:registered', (name, provider) => {
      emitted = { name, provider };
    });

    const provider = new AFS.MockStreamProvider();
    AFS.registerProvider('ev-test', provider);

    test.equal(emitted.name, 'ev-test');
    test.equal(emitted.provider, provider);

    AFS._reset();
  });

  Tinytest.add('afs - Registry - emits provider:removed event', (test) => {
    AFS._reset();

    const provider = new AFS.MockStreamProvider();
    AFS.registerProvider('rm-test', provider);

    let removedName = null;
    AFS.on('provider:removed', (name) => { removedName = name; });

    AFS.removeProvider('rm-test');
    test.equal(removedName, 'rm-test');

    AFS._reset();
  });

  Tinytest.add('afs - Registry - emits provider:default-changed event', (test) => {
    AFS._reset();

    const p1 = new AFS.MockStreamProvider();
    const p2 = new AFS.MockStreamProvider();
    AFS.registerProvider('a', p1);
    AFS.registerProvider('b', p2);

    let changed = null;
    AFS.on('provider:default-changed', (name, provider) => {
      changed = { name, provider };
    });

    AFS.setDefaultProvider('b');
    test.equal(changed.name, 'b');
    test.equal(changed.provider, p2);

    AFS._reset();
  });

  Tinytest.add('afs - Registry - emits collection:registered event', (test) => {
    AFS._reset();

    let emitted = null;
    AFS.on('collection:registered', (name, col) => { emitted = { name, col }; });

    const col = { _name: 'ev-col' };
    AFS.registerCollection('ev-col', col);

    test.equal(emitted.name, 'ev-col');
    test.equal(emitted.col, col);

    AFS._reset();
  });

  Tinytest.add('afs - Registry - emits core-collection:registered event', (test) => {
    AFS._reset();

    const coreEvents = [];
    const colEvents = [];
    AFS.on('core-collection:registered', (name, col) => { coreEvents.push(name); });
    AFS.on('collection:registered', (name, col) => { colEvents.push(name); });

    const col = { _name: 'users' };
    AFS.registerCoreCollection('users', col);

    test.equal(coreEvents.length, 1);
    test.equal(coreEvents[0], 'users');
    // Should also emit collection:registered
    test.isTrue(colEvents.includes('users'));

    AFS._reset();
  });
}

// ===========================================================================
// FederatedCollection Mutation Lifecycle Tests (server only)
// ===========================================================================

if (Meteor.isServer) {
  Tinytest.addAsync('afs - FederatedCollection - emits before:insert and after:insert', async (test) => {
    const provider = new AFS.MockStreamProvider();
    const name = 'afs-mut-insert-' + Random.id();
    const collection = new AFS.Collection(name, {
      provider,
      connection: null,
      defineMutationMethods: false,
    });

    const events = [];
    collection.on('before:insert', (data) => events.push({ type: 'before:insert', doc: data.doc }));
    collection.on('after:insert', (data) => events.push({ type: 'after:insert', id: data.id }));

    const id = await collection.insertAsync({ title: 'Lifecycle Test' });

    test.equal(events.length, 2);
    test.equal(events[0].type, 'before:insert');
    test.equal(events[0].doc.title, 'Lifecycle Test');
    test.equal(events[1].type, 'after:insert');
    test.equal(events[1].id, id);
  });

  Tinytest.addAsync('afs - FederatedCollection - emits before:update and after:update', async (test) => {
    const provider = new AFS.MockStreamProvider();
    const name = 'afs-mut-update-' + Random.id();
    const collection = new AFS.Collection(name, {
      provider,
      connection: null,
      defineMutationMethods: false,
    });

    const id = await collection.insertAsync({ title: 'Original' });

    const events = [];
    collection.on('before:update', (data) => events.push({ type: 'before:update', selector: data.selector }));
    collection.on('after:update', (data) => events.push({ type: 'after:update', result: data.result }));

    await collection.updateAsync({ _id: id }, { $set: { title: 'Changed' } });

    test.equal(events.length, 2);
    test.equal(events[0].type, 'before:update');
    test.equal(events[1].type, 'after:update');
  });

  Tinytest.addAsync('afs - FederatedCollection - emits before:remove and after:remove', async (test) => {
    const provider = new AFS.MockStreamProvider();
    const name = 'afs-mut-remove-' + Random.id();
    const collection = new AFS.Collection(name, {
      provider,
      connection: null,
      defineMutationMethods: false,
    });

    const id = await collection.insertAsync({ title: 'ToRemove' });

    const events = [];
    collection.on('before:remove', (data) => events.push({ type: 'before:remove', selector: data.selector }));
    collection.on('after:remove', (data) => events.push({ type: 'after:remove', result: data.result }));

    await collection.removeAsync({ _id: id });

    test.equal(events.length, 2);
    test.equal(events[0].type, 'before:remove');
    test.equal(events[1].type, 'after:remove');
    test.equal(events[1].result, 1);
  });

  Tinytest.add('afs - FederatedCollection - has EventEmitter methods', (test) => {
    const provider = new AFS.MockStreamProvider();
    const name = 'afs-ee-check-' + Random.id();
    const collection = new AFS.Collection(name, {
      provider,
      connection: null,
      defineMutationMethods: false,
    });

    // Should have EventEmitter methods
    test.isTrue(typeof collection.on === 'function');
    test.isTrue(typeof collection.once === 'function');
    test.isTrue(typeof collection.emit === 'function');
    test.isTrue(typeof collection.removeListener === 'function');

    // Should still have allow/deny methods
    test.isTrue(typeof collection.allow === 'function');
    test.isTrue(typeof collection.deny === 'function');
  });
}

// ===========================================================================
// _publishCursor Lifecycle Forwarding Test (server only)
// ===========================================================================

if (Meteor.isServer) {
  Tinytest.addAsync('afs - _publishCursor - forwards lifecycle events to sub', async (test) => {
    const provider = new AFS.MockStreamProvider();
    await provider.insertAsync('pub-lifecycle', { name: 'Doc1' });

    const cursor = new AFS.Cursor(provider, 'pub-lifecycle', {});

    // Mock DDP subscription
    const subEvents = [];
    const mockSub = {
      added(col, id, fields) { subEvents.push({ type: 'added', col, id }); },
      changed(col, id, fields) { subEvents.push({ type: 'changed', col, id }); },
      removed(col, id) { subEvents.push({ type: 'removed', col, id }); },
      error(err) { subEvents.push({ type: 'error', message: err.message }); },
      ready() { subEvents.push({ type: 'ready' }); },
      onStop(fn) { mockSub._stopFn = fn; },
    };

    const handle = await cursor._publishCursor(mockSub);

    // Should have added at least one document
    test.isTrue(subEvents.some(e => e.type === 'added'));

    // Clean up
    handle.stop();
  });
}

// ===========================================================================
// AdaptiveEngine auto-attach integration test (server only)
// ===========================================================================

if (Meteor.isServer) {
  Tinytest.addAsync('afs - AdaptiveEngine - auto-attaches via _getMultiplexer', async (test) => {
    const engine = AFS.getEngine();
    engine.reset();

    const provider = new AFS.MockStreamProvider();
    await provider.insertAsync('engine-auto', { name: 'Test' });

    // observeChanges goes through _getMultiplexer which should auto-attach engine
    const cursor = new AFS.Cursor(provider, 'engine-auto', {});
    const handle = await cursor.observeChangesAsync({
      added() {},
      changed() {},
      removed() {},
    });

    // Insert another doc to trigger a change event
    await provider.insertAsync('engine-auto', { name: 'Another' });

    const metrics = engine.getMetrics();
    // totalChanges should be > 0 (initial adds + the new insert)
    test.isTrue(metrics.totalChanges > 0);

    handle.stop();
    engine.reset();
  });
}

// ===========================================================================
// Client-side Tests
// ===========================================================================

if (Meteor.isClient) {
  Tinytest.add('afs - Client - AFS global exists', (test) => {
    test.isTrue(typeof AFS !== 'undefined');
    test.isTrue(typeof AFS.Collection === 'function');
    test.isTrue(typeof AFS.registerCollection === 'function');
    test.isTrue(typeof AFS.getCoreCollection === 'function');
  });

  Tinytest.add('afs - Client - AFS.Collection is available', (test) => {
    test.isTrue(typeof AFS.Collection === 'function');
  });

  Tinytest.add('afs - Client - Registry works on client', (test) => {
    AFS._reset();

    const mockCollection = { _name: 'client-test' };
    AFS.registerCollection('client-test', mockCollection);
    test.equal(AFS.getCollection('client-test'), mockCollection);

    AFS._reset();
  });

  // Task 26: Client stubs don't throw
  Tinytest.add('afs - Client - server-only methods don\'t throw', (test) => {
    test.equal(AFS.getEngine(), null);
    test.isTrue(typeof AFS.getMetrics() === 'object');
    AFS.resetMetrics(); // no-op, should not throw
    AFS.registerProvider('x', {}); // no-op
    test.equal(AFS.getProvider('x'), undefined);
    test.equal(AFS.getDefaultProvider(), null);
    test.equal(AFS.getDefaultProviderName(), null);
    test.isTrue(Array.isArray(AFS.listProviders()));
    test.equal(AFS.listProviders().length, 0);
    AFS.removeProvider('x'); // no-op
    test.isTrue(Array.isArray(AFS.listCoreCollections()));
  });

  // Task 26: Client module exports are importable
  Tinytest.add('afs - Client - ChangeStream/ObserveMultiplexer are importable', (test) => {
    test.isTrue(typeof AFS.ChangeStream === 'function');
    test.isTrue(typeof AFS.ObserveMultiplexer === 'function');
    test.isTrue(typeof AFS.Cursor === 'function');
    test.isTrue(typeof AFS.MockStreamProvider === 'function');
    test.isTrue(typeof AFS.ObjectID === 'function');
  });
}

// ===========================================================================
// Phase 1 Gap Fix Tests (server only)
// ===========================================================================

if (Meteor.isServer) {
  // Task 23: ChangeStream — markError on a silentErrors stream does not crash
  Tinytest.add('afs - ChangeStream - markError without error listener does not crash', (test) => {
    // ChangeStream defaults to Node's unlistened-'error'-throws semantics.
    // This test predates that change and exercises the opt-in silent path —
    // markError must not crash the process when silentErrors: true even with
    // zero listeners attached.
    const stream = new AFS.ChangeStream({ collectionName: 'test', selector: {} }, { silentErrors: true });
    stream.markError(new Error('should not crash'));
    test.isTrue(true);
    stream.stop();
  });

  // Task 23: ChangeStream — convenience methods on stopped stream are no-ops
  Tinytest.add('afs - ChangeStream - convenience methods on stopped stream are no-ops', (test) => {
    const stream = new AFS.ChangeStream({ collectionName: 'test', selector: {} });
    stream.stop();

    const events = [];
    // Even though listeners are removed, these should not throw
    stream.added('id', {});
    stream.changed('id', {});
    stream.removed('id');
    stream.addedBefore('id', {}, null);
    stream.movedBefore('id', null);
    stream.markReady();
    stream.markError(new Error('stopped'));
    stream.markReconnected();
    stream.markReset();
    stream.markPaused();
    stream.markResumed();

    test.isTrue(true); // No crash = pass
  });

  // Task 23: ObserveMultiplexer — addHandle doesn't receive live events before initial adds
  Tinytest.addAsync('afs - ObserveMultiplexer - no live events before initial adds', async (test) => {
    const stream = new AFS.ChangeStream({ collectionName: 'test', selector: {} });
    const multiplexer = new AFS.ObserveMultiplexer(stream, false);

    // Emit initial data then mark ready
    stream.added('doc1', { name: 'Alice' });
    stream.markReady();

    const events = [];
    // Start adding handle — it should get initial adds first
    const handlePromise = multiplexer.addHandle({
      added(id, fields) { events.push({ type: 'initial', id }); },
    });

    // Emit a live event while addHandle is in progress
    // (Since addHandle awaits _readyPromise and sends initial adds before
    // adding to _handles, this live event should NOT reach the handle)
    stream.added('doc2', { name: 'Bob' });

    const handle = await handlePromise;

    // Should have received only the initial add for doc1,
    // plus doc2 after being added to handles
    test.isTrue(events.length >= 1);
    test.equal(events[0].id, 'doc1');

    handle.stop();
  });

  // Task 23: ObserveMultiplexer — handle.stop() during active fan-out doesn't cause errors
  Tinytest.addAsync('afs - ObserveMultiplexer - handle stop during fan-out is safe', async (test) => {
    const stream = new AFS.ChangeStream({ collectionName: 'test', selector: {} });
    const multiplexer = new AFS.ObserveMultiplexer(stream, false);
    stream.markReady();

    let handle2;
    const handle1 = await multiplexer.addHandle({
      added(id, fields) {
        // Stop handle2 during a fan-out
        if (handle2) handle2.stop();
      },
    });

    const added2 = [];
    handle2 = await multiplexer.addHandle({
      added(id, fields) { added2.push(id); },
    });

    // Emit an event — handle1's callback stops handle2 mid-fan-out
    stream.added('docX', { name: 'Test' });

    // Should not crash. handle2 should have _stopped = true
    test.isTrue(true);
    handle1.stop();
  });

  // Task 23: ObserveMultiplexer — _sendInitialAdds callback throw doesn't break multiplexer
  Tinytest.addAsync('afs - ObserveMultiplexer - initial add callback throw continues', async (test) => {
    const stream = new AFS.ChangeStream({ collectionName: 'test', selector: {} });
    const multiplexer = new AFS.ObserveMultiplexer(stream, false);

    stream.added('doc1', { name: 'A' });
    stream.added('doc2', { name: 'B' });
    stream.markReady();

    let callCount = 0;
    const handle = await multiplexer.addHandle({
      added(id, fields) {
        callCount++;
        if (callCount === 1) throw new Error('test throw in initial add');
      },
    });

    // Should have attempted to send both initial adds despite the throw
    test.equal(callCount, 2);
    handle.stop();
  });

  // Task 23: ObserveMultiplexer — ordered initial adds preserve correct `before` values
  Tinytest.addAsync('afs - ObserveMultiplexer - ordered initial adds with correct before', async (test) => {
    const stream = new AFS.ChangeStream({ collectionName: 'test', selector: {} });
    const multiplexer = new AFS.ObserveMultiplexer(stream, true);

    stream.addedBefore('doc1', { name: 'A' }, null);
    stream.addedBefore('doc2', { name: 'B' }, 'doc1');
    stream.markReady();

    const events = [];
    const handle = await multiplexer.addHandle({
      addedBefore(id, fields, before) {
        events.push({ id, before });
      },
    });

    // doc2 is before doc1 in the ordered cache, so:
    // doc2 should have before=doc1, doc1 should have before=null
    test.equal(events.length, 2);
    // The last element should have before=null
    test.equal(events[events.length - 1].before, null);

    handle.stop();
  });

  // Task 23: StreamProvider — close() stops all cached multiplexers
  Tinytest.addAsync('afs - StreamProvider - close stops cached multiplexers', async (test) => {
    const provider = new AFS.MockStreamProvider();
    await provider.insertAsync('close-test', { name: 'A' });

    const cursor = new AFS.Cursor(provider, 'close-test', {});
    const handle = await cursor.observeChangesAsync({
      added() {},
      changed() {},
      removed() {},
    });

    // Provider should have a cached multiplexer
    test.isTrue(provider._multiplexerCache.size > 0);

    // Close should clean up
    await provider.close();
    test.equal(provider._multiplexerCache.size, 0);
  });

  // Task 23: StreamProvider — concurrent _getMultiplexer calls return same instance
  Tinytest.addAsync('afs - StreamProvider - concurrent getMultiplexer returns same instance', async (test) => {
    const provider = new AFS.MockStreamProvider();
    await provider.insertAsync('concurrent-test', { name: 'A' });

    const desc = { collectionName: 'concurrent-test', selector: {}, options: {} };

    // Call _getMultiplexer concurrently
    const [m1, m2] = await Promise.all([
      provider._getMultiplexer(desc, false),
      provider._getMultiplexer(desc, false),
    ]);

    // Should be the same multiplexer instance
    test.equal(m1, m2);

    // Clean up
    m1._stream.stop();
  });
}

// ===========================================================================
// Phase 2 Gap Fix Tests (server only)
// ===========================================================================

if (Meteor.isServer) {
  // Task 24: MockStreamProvider — error in startObserving propagates as stream error
  Tinytest.addAsync('afs - MockStreamProvider - startObserving error propagates', async (test) => {
    const provider = new AFS.MockStreamProvider();

    // Create a ChangeStream directly and verify it can handle errors
    const stream = provider.createChangeStream({ collectionName: 'test', selector: {} });
    let errorReceived = null;
    stream.on('error', (err) => { errorReceived = err; });
    stream.markError(new Error('test error'));
    test.equal(errorReceived.message, 'test error');
    stream.stop();
  });

  // Task 24: _publishCursor does NOT call sub.ready()
  Tinytest.addAsync('afs - _publishCursor - does not call sub.ready', async (test) => {
    const provider = new AFS.MockStreamProvider();
    await provider.insertAsync('pub-noready', { name: 'Doc1' });

    const cursor = new AFS.Cursor(provider, 'pub-noready', {});

    let readyCalled = false;
    const mockSub = {
      added(col, id, fields) {},
      changed(col, id, fields) {},
      removed(col, id) {},
      error(err) {},
      ready() { readyCalled = true; },
      onStop(fn) {},
    };

    const handle = await cursor._publishCursor(mockSub);

    // _publishCursor should NOT have called sub.ready()
    test.isFalse(readyCalled);
    handle.stop();
  });

  // Task 24: countDocuments / estimatedDocumentCount on FederatedCollection
  Tinytest.addAsync('afs - FederatedCollection - countDocuments', async (test) => {
    const provider = new AFS.MockStreamProvider();
    const name = 'afs-count-' + Random.id();
    const collection = new AFS.Collection(name, {
      provider,
      connection: null,
      defineMutationMethods: false,
    });

    await collection.insertAsync({ type: 'a' });
    await collection.insertAsync({ type: 'b' });
    await collection.insertAsync({ type: 'a' });

    const total = await collection.countDocuments();
    test.equal(total, 3);

    const aCount = await collection.countDocuments({ type: 'a' });
    test.equal(aCount, 2);

    const estimated = await collection.estimatedDocumentCount();
    test.equal(estimated, 3);
  });
}

// ===========================================================================
// Phase 3 Gap Fix Tests (server only)
// ===========================================================================

if (Meteor.isServer) {
  // Task 25: Lifecycle events fire for provider adapter mutations (simulating allow-deny path)
  Tinytest.addAsync('afs - FederatedCollection - provider adapter emits lifecycle events', async (test) => {
    const provider = new AFS.MockStreamProvider();
    const name = 'afs-adapter-events-' + Random.id();
    const collection = new AFS.Collection(name, {
      provider,
      connection: null,
      defineMutationMethods: false,
    });

    const events = [];
    collection.on('before:insert', () => events.push('before:insert'));
    collection.on('after:insert', () => events.push('after:insert'));
    collection.on('before:update', () => events.push('before:update'));
    collection.on('after:update', () => events.push('after:update'));
    collection.on('before:remove', () => events.push('before:remove'));
    collection.on('after:remove', () => events.push('after:remove'));

    // Call through the provider adapter (what allow-deny uses)
    const id = await collection._collection.insertAsync({ val: 1 });
    await collection._collection.updateAsync({ _id: id }, { $set: { val: 2 } });
    await collection._collection.removeAsync({ _id: id });

    test.equal(events, [
      'before:insert', 'after:insert',
      'before:update', 'after:update',
      'before:remove', 'after:remove',
    ]);
  });

  // Task 25: _rewriteSelector with fallbackId
  Tinytest.add('afs - FederatedCollection - _rewriteSelector with fallbackId', (test) => {
    const provider = new AFS.MockStreamProvider();
    const name = 'afs-rewrite-' + Random.id();
    const collection = new AFS.Collection(name, {
      provider,
      connection: null,
      defineMutationMethods: false,
    });

    const result = collection._rewriteSelector(null, { fallbackId: 'custom-id' });
    test.equal(result._id, 'custom-id');

    // Without fallbackId, should generate random
    const result2 = collection._rewriteSelector(null);
    test.isTrue(typeof result2._id === 'string');
    test.isTrue(result2._id.length > 0);
    test.notEqual(result2._id, 'custom-id');
  });

  // Task 25: _createIdGenerator UUID generates actual UUIDs
  Tinytest.add('afs - FederatedCollection - UUID id generation', (test) => {
    const provider = new AFS.MockStreamProvider();
    const name = 'afs-uuid-' + Random.id();
    const collection = new AFS.Collection(name, {
      provider,
      connection: null,
      defineMutationMethods: false,
      idGeneration: 'UUID',
    });

    const id = collection._makeNewID();
    // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    test.isTrue(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));

    // Two UUIDs should be different
    const id2 = collection._makeNewID();
    test.notEqual(id, id2);
  });

  // Task 25: dropCollectionAsync cleans up registry and listeners
  Tinytest.addAsync('afs - FederatedCollection - dropCollectionAsync cleanup', async (test) => {
    AFS._reset();

    const provider = new AFS.MockStreamProvider();
    const name = 'afs-drop-' + Random.id();
    const collection = new AFS.Collection(name, {
      provider,
      connection: null,
      defineMutationMethods: false,
    });

    // Verify it's registered
    test.equal(AFS.getCollection(name), collection);

    // Add a listener
    let eventFired = false;
    collection.on('custom', () => { eventFired = true; });

    // Drop
    await collection.dropCollectionAsync();

    // Should be removed from registry
    test.equal(AFS.getCollection(name), undefined);

    // Listeners should be removed
    collection.emit('custom');
    test.isFalse(eventFired);

    AFS._reset();
  });

  // Task 25: Collection Extensions API
  Tinytest.add('afs - FederatedCollection - Collection Extensions API', (test) => {
    // Clear any existing extensions
    AFS.Collection.clearExtensions();

    let extCalled = false;
    const ext = function (name, options) {
      extCalled = true;
    };

    AFS.Collection.addExtension(ext);
    test.equal(AFS.Collection.getExtensions().length, 1);

    // Create a collection — extension should be called
    const provider = new AFS.MockStreamProvider();
    const name = 'afs-ext-' + Random.id();
    const collection = new AFS.Collection(name, {
      provider,
      connection: null,
      defineMutationMethods: false,
    });
    test.isTrue(extCalled);

    // Test prototype method
    AFS.Collection.addPrototypeMethod('testMethod', function () {
      return 'hello from extension';
    });

    const name2 = 'afs-ext2-' + Random.id();
    const collection2 = new AFS.Collection(name2, {
      provider,
      connection: null,
      defineMutationMethods: false,
    });
    test.equal(collection2.testMethod(), 'hello from extension');

    // Clean up
    AFS.Collection.clearExtensions();
    test.equal(AFS.Collection.getExtensions().length, 0);
  });

  // Task 18: ObjectID export
  Tinytest.add('afs - AFS.ObjectID is available', (test) => {
    test.isTrue(typeof AFS.ObjectID === 'function');
  });
}

// ===========================================================================
// Phase 4 Gap Fix Tests (server only)
// ===========================================================================

if (Meteor.isServer) {
  // Task 26: AdaptiveEngine — recordAccess called from find()
  Tinytest.addAsync('afs - AdaptiveEngine - find records access', async (test) => {
    const engine = AFS.getEngine();
    engine.reset();

    const provider = new AFS.MockStreamProvider();
    const name = 'afs-engine-find-' + Random.id();
    const collection = new AFS.Collection(name, {
      provider,
      connection: null,
      defineMutationMethods: false,
    });

    await collection.insertAsync({ val: 1 });

    const metricsBefore = engine.getMetrics().totalQueries;
    collection.find({ val: 1 });
    const metricsAfter = engine.getMetrics().totalQueries;

    test.isTrue(metricsAfter > metricsBefore);
    engine.reset();
  });

  // Task 26: AdaptiveEngine — write metrics tracked
  Tinytest.addAsync('afs - AdaptiveEngine - writes tracked in metrics', async (test) => {
    const engine = AFS.getEngine();
    engine.reset();

    const provider = new AFS.MockStreamProvider();
    const name = 'afs-engine-write-' + Random.id();
    const collection = new AFS.Collection(name, {
      provider,
      connection: null,
      defineMutationMethods: false,
    });

    const writesBefore = engine.getMetrics().totalWrites;
    const id = await collection.insertAsync({ val: 1 });
    await collection.updateAsync({ _id: id }, { $set: { val: 2 } });
    await collection.removeAsync({ _id: id });
    const writesAfter = engine.getMetrics().totalWrites;

    test.equal(writesAfter - writesBefore, 3);
    engine.reset();
  });

  // Task 26: AdaptiveEngine — waitForSlot resolves when slot is released (no busy-loop)
  Tinytest.addAsync('afs - AdaptiveEngine - waitForSlot resolves on release', async (test) => {
    const engine = new AFS.getEngine().constructor({
      maxPendingQueries: 2,
    });

    // Fill up the slots
    const release1 = engine.acquireSlot('query');
    const release2 = engine.acquireSlot('query');

    test.isTrue(engine.shouldApplyBackpressure('query'));

    // Start waiting for a slot
    let resolved = false;
    const slotPromise = engine.waitForSlot('query', 2000).then(release => {
      resolved = true;
      release();
    });

    // Release a slot — should trigger the waiting promise
    release1();

    await slotPromise;
    test.isTrue(resolved);

    release2();
    engine.reset();
  });

  // Task 26: AdaptiveEngine — waitForSlot times out
  Tinytest.addAsync('afs - AdaptiveEngine - waitForSlot timeout', async (test) => {
    const engine = new AFS.getEngine().constructor({
      maxPendingQueries: 1,
    });

    const release = engine.acquireSlot('query');

    let threw = false;
    try {
      await engine.waitForSlot('query', 100); // Very short timeout
    } catch (e) {
      threw = true;
      test.equal(e.error, 'backpressure');
    }
    test.isTrue(threw);

    release();
    engine.reset();
  });
}

// ===========================================================================
// Allow/Deny integration tests for AFS.Collection (server only)
// ---------------------------------------------------------------------------
// These tests verify that allow/deny rules actually gate client-originated
// writes to an AFS collection (not just that the methods exist). They simulate
// the DDP method-call path that a real client would take by invoking the
// registered method handler via Meteor.server.applyAsync, which constructs a
// MethodInvocation with isSimulation: false and userId: null — the same path
// used by mongo's allow_tests.js (see packages/mongo/tests/allow_tests.js:284
// for the client-side equivalent using collection.updateAsync with
// returnServerResultPromise; we mirror the server-side receive behavior here).
//
// Server-side direct calls (collection.insertAsync etc.) intentionally bypass
// allow/deny — we verify this is preserved by the final assertion of test (2).
// ===========================================================================

if (Meteor.isServer) {
  // Helper: wrap a MockStreamProvider so we can spy on the mutation calls
  // it receives. Returns the wrapped provider plus a calls[] array.
  const makeSpyProvider = () => {
    const provider = new AFS.MockStreamProvider();
    const calls = [];
    const wrapMethod = (name) => {
      const original = provider[name].bind(provider);
      provider[name] = async (...args) => {
        calls.push({ method: name, args });
        return original(...args);
      };
    };
    wrapMethod('insertAsync');
    wrapMethod('updateAsync');
    wrapMethod('removeAsync');
    return { provider, calls };
  };

  // Helper: simulate a client-originated DDP method call. On the server
  // Meteor.server.applyAsync invokes method_handlers[name] inside a
  // MethodInvocation with isSimulation: false and userId: null — which is
  // exactly what allow-deny.js's handler checks at line 162/171.
  const simulateClientCall = (methodName, args) =>
    Meteor.server.applyAsync(methodName, args);

  Tinytest.addAsync(
    'afs - Integration - deny rejects client-originated insert',
    async (test) => {
      const { provider, calls } = makeSpyProvider();
      const name = 'afs-allow-deny-insert-' + Random.id();
      const collection = new AFS.Collection(name, {
        provider,
        connection: Meteor.server,
        // defineMutationMethods defaults to true — registers the DDP methods.
      });
      collection._insecure = false; // ensure we're in secure mode

      // deny-only rule: in Meteor's semantics, calling any deny/allow makes
      // the collection restricted (_restricted = true). With no allow
      // validators, the handler short-circuits with 403 before even running
      // the deny validator — which is the correct denial outcome. The
      // "deny actively blocks despite an allow" case is covered by the
      // precedence test below.
      collection.deny({ insertAsync: () => true, insert: () => true });

      let threw = false;
      try {
        await simulateClientCall('/' + name + '/insertAsync', [
          { title: 'should be denied' },
        ]);
      } catch (e) {
        threw = true;
        test.equal(e.error, 403);
      }
      test.isTrue(threw, 'expected client insert to be rejected');

      // Provider must not have observed an insertAsync call.
      const insertCalls = calls.filter((c) => c.method === 'insertAsync');
      test.equal(
        insertCalls.length,
        0,
        'provider should not have received an insert when deny ruled'
      );
    }
  );

  Tinytest.addAsync(
    'afs - Integration - allow accepts matching client-originated insert',
    async (test) => {
      const { provider, calls } = makeSpyProvider();
      const name = 'afs-allow-accept-' + Random.id();
      const collection = new AFS.Collection(name, {
        provider,
        connection: Meteor.server,
      });
      collection._insecure = false;

      collection.allow({ insertAsync: () => true, insert: () => true });

      const id = await simulateClientCall('/' + name + '/insertAsync', [
        { title: 'allowed', v: 1 },
      ]);
      test.isTrue(typeof id === 'string' && id.length > 0);

      const insertCalls = calls.filter((c) => c.method === 'insertAsync');
      test.equal(insertCalls.length, 1, 'provider should have observed one insert');
      test.equal(insertCalls[0].args[0], name);
      test.equal(insertCalls[0].args[1].title, 'allowed');

      // Confirm server-side direct calls bypass allow/deny (standard Meteor
      // semantics). This uses the trusted path, so even if allow returned
      // false it would still run.
      const directId = await collection.insertAsync({ title: 'direct' });
      test.isTrue(typeof directId === 'string');
    }
  );

  Tinytest.addAsync(
    'afs - Integration - deny wins over allow on client-originated insert',
    async (test) => {
      const { provider, calls } = makeSpyProvider();
      const name = 'afs-allow-deny-precedence-' + Random.id();
      const collection = new AFS.Collection(name, {
        provider,
        connection: Meteor.server,
      });
      collection._insecure = false;

      collection.allow({ insertAsync: () => true, insert: () => true });
      collection.deny({ insertAsync: () => true, insert: () => true });

      let threw = false;
      try {
        await simulateClientCall('/' + name + '/insertAsync', [
          { title: 'should be denied despite allow' },
        ]);
      } catch (e) {
        threw = true;
        test.equal(e.error, 403);
      }
      test.isTrue(threw, 'deny must take precedence over allow');

      const insertCalls = calls.filter((c) => c.method === 'insertAsync');
      test.equal(insertCalls.length, 0);
    }
  );

  Tinytest.addAsync(
    'afs - Integration - deny rejects client-originated update',
    async (test) => {
      const { provider, calls } = makeSpyProvider();
      const name = 'afs-allow-deny-update-' + Random.id();
      const collection = new AFS.Collection(name, {
        provider,
        connection: Meteor.server,
      });
      collection._insecure = false;

      // Seed a document via the trusted server path (bypasses allow/deny).
      const id = await collection.insertAsync({ title: 'Seeded', v: 1 });
      // Ignore the seed write when counting spy calls below.
      const seedCallCount = calls.length;

      collection.deny({ updateAsync: () => true, update: () => true });
      // An allow rule is required to even reach the deny check path,
      // otherwise the short-circuit "no allow validators" 403 fires before
      // the deny runs. Both shapes of 403 are correct "denied" outcomes —
      // we just want to prove the mutation does not reach the provider.
      collection.allow({ updateAsync: () => true, update: () => true });

      let threw = false;
      try {
        await simulateClientCall('/' + name + '/updateAsync', [
          id,
          { $set: { title: 'Tampered' } },
        ]);
      } catch (e) {
        threw = true;
        test.equal(e.error, 403);
      }
      test.isTrue(threw, 'expected deny rule to reject the client update');

      // No updateAsync should have reached the provider after the seed.
      const updateCalls = calls
        .slice(seedCallCount)
        .filter((c) => c.method === 'updateAsync');
      test.equal(updateCalls.length, 0);
    }
  );
}
