if (Meteor.isServer) {

Tinytest.addAsync('thread-context - CursorProxy - fetchAsync calls bridge', async function (test) {
  const { createCollectionProxy } = require('meteor/thread-context');

  let capturedMsg = null;
  const mockClient = {
    call(msg) {
      capturedMsg = msg;
      return Promise.resolve([{ _id: '1' }, { _id: '2' }]);
    }
  };

  const Collections = createCollectionProxy(mockClient);
  const result = await Collections.TestCol.find({ active: true }, { limit: 10 }).fetchAsync();

  test.equal(result.length, 2);
  test.equal(capturedMsg.type, 'collection');
  test.equal(capturedMsg.collectionName, 'TestCol');
  test.equal(capturedMsg.op, 'find.fetchAsync');
  test.equal(capturedMsg.args[0].active, true);
  test.equal(capturedMsg.args[1].limit, 10);
});

Tinytest.addAsync('thread-context - CursorProxy - countAsync', async function (test) {
  const { createCollectionProxy } = require('meteor/thread-context');

  const mockClient = { call: () => Promise.resolve(42) };
  const Collections = createCollectionProxy(mockClient);
  const count = await Collections.TestCol.find({}).countAsync();

  test.equal(count, 42);
});

Tinytest.addAsync('thread-context - CursorProxy - forEachAsync runs callback locally', async function (test) {
  const { createCollectionProxy } = require('meteor/thread-context');

  const mockClient = {
    call: () => Promise.resolve([{ _id: '1', name: 'a' }, { _id: '2', name: 'b' }])
  };

  const Collections = createCollectionProxy(mockClient);
  const names = [];
  await Collections.TestCol.find({}).forEachAsync(doc => {
    names.push(doc.name);
  });

  test.equal(names, ['a', 'b']);
});

Tinytest.addAsync('thread-context - CursorProxy - mapAsync runs transform locally', async function (test) {
  const { createCollectionProxy } = require('meteor/thread-context');

  const mockClient = {
    call: () => Promise.resolve([{ _id: '1', val: 10 }, { _id: '2', val: 20 }])
  };

  const Collections = createCollectionProxy(mockClient);
  const doubled = await Collections.TestCol.find({}).mapAsync(doc => doc.val * 2);

  test.equal(doubled, [20, 40]);
});

Tinytest.add('thread-context - CursorProxy - observe throws BridgeError', function (test) {
  const { createCollectionProxy } = require('meteor/thread-context');

  const mockClient = { call: () => Promise.resolve([]) };
  const Collections = createCollectionProxy(mockClient);

  test.throws(() => {
    Collections.TestCol.find({}).observe({});
  }, 'not supported');
});

Tinytest.add('thread-context - CursorProxy - observeChanges throws BridgeError', function (test) {
  const { createCollectionProxy } = require('meteor/thread-context');

  const mockClient = { call: () => Promise.resolve([]) };
  const Collections = createCollectionProxy(mockClient);

  test.throws(() => {
    Collections.TestCol.find({}).observeChanges({});
  }, 'not supported');
});

Tinytest.addAsync('thread-context - CollectionProxy - direct async ops', async function (test) {
  const { createCollectionProxy } = require('meteor/thread-context');

  let capturedMsg = null;
  const mockClient = {
    call(msg) {
      capturedMsg = msg;
      return Promise.resolve('result');
    }
  };

  const Collections = createCollectionProxy(mockClient);
  await Collections.TestCol.insertAsync({ foo: 'bar' });

  test.equal(capturedMsg.type, 'collection');
  test.equal(capturedMsg.collectionName, 'TestCol');
  test.equal(capturedMsg.op, 'insertAsync');
  test.equal(capturedMsg.args[0].foo, 'bar');
});

Tinytest.addAsync('thread-context - CollectionProxy - aggregate', async function (test) {
  const { createCollectionProxy } = require('meteor/thread-context');

  let capturedMsg = null;
  const mockClient = {
    call(msg) {
      capturedMsg = msg;
      return Promise.resolve([{ _id: 'x', total: 30 }]);
    }
  };

  const Collections = createCollectionProxy(mockClient);
  const result = await Collections.TestCol.aggregate([{ $group: { _id: '$g' } }]);

  test.equal(capturedMsg.op, 'aggregate');
  test.equal(result[0].total, 30);
});

Tinytest.add('thread-context - CollectionProxy - non-string property returns undefined', function (test) {
  const { createCollectionProxy } = require('meteor/thread-context');
  const mockClient = { call: () => Promise.resolve(null) };
  const Collections = createCollectionProxy(mockClient);

  test.equal(Collections[Symbol.iterator], undefined);
});

Tinytest.add('thread-context - CollectionProxy - inner proxy is cached per collection name', function (test) {
  const { createCollectionProxy } = require('meteor/thread-context');
  const mockClient = { call: () => Promise.resolve(null) };
  const Collections = createCollectionProxy(mockClient);

  const first = Collections.MyCollection;
  const second = Collections.MyCollection;
  test.equal(first, second); // same Proxy reference
});

Tinytest.addAsync('thread-context - CursorProxy - forEachAsync executes callbacks sequentially', async function (test) {
  const { createCollectionProxy } = require('meteor/thread-context');

  const mockClient = {
    call: () => Promise.resolve([{ _id: '1' }, { _id: '2' }, { _id: '3' }])
  };

  const Collections = createCollectionProxy(mockClient);
  const order = [];
  await Collections.TestCol.find({}).forEachAsync(async (doc) => {
    // Simulate async work — each callback should complete before the next starts
    await new Promise(resolve => setTimeout(resolve, 5));
    order.push(doc._id);
  });

  test.equal(order, ['1', '2', '3']);
});

Tinytest.addAsync('thread-context - CursorProxy - mapAsync executes callbacks sequentially', async function (test) {
  const { createCollectionProxy } = require('meteor/thread-context');

  const mockClient = {
    call: () => Promise.resolve([{ _id: '1', v: 10 }, { _id: '2', v: 20 }])
  };

  const Collections = createCollectionProxy(mockClient);
  const order = [];
  const results = await Collections.TestCol.find({}).mapAsync(async (doc) => {
    await new Promise(resolve => setTimeout(resolve, 5));
    order.push(doc._id);
    return doc.v * 3;
  });

  test.equal(order, ['1', '2']);
  test.equal(results, [30, 60]);
});

Tinytest.add('thread-context - CollectionProxy - unknown op returns undefined', function (test) {
  const { createCollectionProxy } = require('meteor/thread-context');
  const mockClient = { call: () => Promise.resolve(null) };
  const Collections = createCollectionProxy(mockClient);

  test.equal(Collections.TestCol.notAMethod, undefined);
  test.equal(typeof Collections.TestCol.find, 'function');
  test.equal(Collections.TestCol.randomProp, undefined);
});

} // end Meteor.isServer
