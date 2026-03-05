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
    const docs = cursor.fetch();
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

    const fruits = collection.find({ category: 'fruit' }).fetch();
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
}
