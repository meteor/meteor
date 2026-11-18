import {
  createThreadContext,
  getActiveBridgeCount,
  BridgeError,
  BridgeClient,
  BridgeHost,
  createCollectionProxy,
  createMethodProxy,
} from 'meteor/thread-context';

if (Meteor.isServer) {

const bridgeTestCollName = 'thread_context_bridge_test';
const BridgeTestCol = new Mongo.Collection(bridgeTestCollName);

async function waitFor(condition, { timeout = 2000, interval = 10 } = {}) {
  const deadline = Date.now() + timeout;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('waitFor: condition not met within timeout');
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

Meteor.methods({
  'threadContext.bridge.echo'(val) {
    return { val, userId: this.userId, connectionId: this.connection?.id };
  },
});

Tinytest.addAsync('thread-context - bridge - full round-trip collection findOneAsync', async function (test) {
  await BridgeTestCol.removeAsync({});
  await BridgeTestCol.insertAsync({ _id: 'bt1', data: 'hello' });

  const ctx = createThreadContext({ userId: 'testUser' });

  const client = new BridgeClient(ctx.port, { callTimeout: 5000 });
  const Collections = createCollectionProxy(client);

  const doc = await Collections[bridgeTestCollName].findOneAsync({ _id: 'bt1' });
  test.equal(doc.data, 'hello');

  ctx.destroy();
});

Tinytest.addAsync('thread-context - bridge - full round-trip collection find.fetchAsync', async function (test) {
  await BridgeTestCol.removeAsync({});
  await BridgeTestCol.insertAsync({ _id: 'bf1', order: 2 });
  await BridgeTestCol.insertAsync({ _id: 'bf2', order: 1 });

  const ctx = createThreadContext();

  const client = new BridgeClient(ctx.port, { callTimeout: 5000 });
  const Collections = createCollectionProxy(client);

  const docs = await Collections[bridgeTestCollName].find({}, { sort: { order: 1 } }).fetchAsync();
  test.equal(docs.length, 2);
  test.equal(docs[0]._id, 'bf2');
  test.equal(docs[1]._id, 'bf1');

  ctx.destroy();
});

Tinytest.addAsync('thread-context - bridge - full round-trip method call', async function (test) {
  const ctx = createThreadContext({ userId: 'methodUser' });

  const client = new BridgeClient(ctx.port, { callTimeout: 5000 });
  const methodProxy = createMethodProxy(client);

  const result = await methodProxy.callAsync('threadContext.bridge.echo', 'test');
  test.equal(result.val, 'test');
  test.equal(result.userId, 'methodUser');

  ctx.destroy();
});

Tinytest.addAsync('thread-context - bridge - onMessage hook short-circuits', async function (test) {
  const ctx = createThreadContext({
    onMessage(msg) {
      if (msg.type === 'method' && msg.methodName === 'threadContext.bridge.echo') {
        return { intercepted: true };
      }
    }
  });

  const client = new BridgeClient(ctx.port, { callTimeout: 5000 });
  const methodProxy = createMethodProxy(client);

  const result = await methodProxy.callAsync('threadContext.bridge.echo', 'test');
  test.equal(result.intercepted, true);

  ctx.destroy();
});

Tinytest.addAsync('thread-context - bridge - onResult hook transforms result', async function (test) {
  const ctx = createThreadContext({
    onResult(msg, result) {
      if (msg.type === 'method') {
        return { ...result, transformed: true };
      }
    }
  });

  const client = new BridgeClient(ctx.port, { callTimeout: 5000 });
  const methodProxy = createMethodProxy(client);

  const result = await methodProxy.callAsync('threadContext.bridge.echo', 'hi');
  test.equal(result.val, 'hi');
  test.equal(result.transformed, true);

  ctx.destroy();
});

Tinytest.addAsync('thread-context - bridge - destroy rejects in-flight calls', async function (test) {
  const ctx = createThreadContext();

  const client = new BridgeClient(ctx.port, { callTimeout: 5000 });
  const methodProxy = createMethodProxy(client);

  const promise = methodProxy.callAsync('threadContext.bridge.echo', 'hi');
  ctx.destroy();

  try {
    await promise;
    test.fail('Expected error');
  } catch (err) {
    test.instanceOf(err, BridgeError);
    test.isTrue(err.message.includes('destroyed') || err.message.includes('timed out'));
  }
});

Tinytest.addAsync('thread-context - bridge - settings snapshot', async function (test) {
  const ctx = createThreadContext();

  test.isTrue(typeof ctx.settings === 'object');
  test.isTrue(typeof ctx.settings.public === 'object');

  ctx.destroy();
});

Tinytest.addAsync('thread-context - bridge - host destroys itself when the worker port closes', async function (test) {
  const before = getActiveBridgeCount();
  const ctx = createThreadContext();
  test.equal(getActiveBridgeCount(), before + 1);

  // Simulates the worker exiting: its transferred port goes away.
  ctx.port.close();

  await waitFor(() => getActiveBridgeCount() === before);
  test.equal(getActiveBridgeCount(), before);
});

Tinytest.add('thread-context - bridge - host reports messages it cannot deserialize', function (test) {
  const logged = [];
  const originalDebug = Meteor._debug;
  Meteor._debug = (...args) => { logged.push(args); };

  const host = new BridgeHost();
  try {
    host.port.emit('messageerror', new Error('bad payload'));
  } finally {
    Meteor._debug = originalDebug;
    host.destroy();
  }

  test.equal(logged.length, 1);
  test.isTrue(String(logged[0][0]).includes('thread-context'));
  test.equal(logged[0][1].message, 'bad payload');
});

Tinytest.add('thread-context - BridgeClient - reports responses it cannot deserialize', function (test) {
  const { MessageChannel } = require('worker_threads');
  const ch = new MessageChannel();
  const logged = [];
  const originalError = console.error;
  console.error = (...args) => { logged.push(args); };

  try {
    new BridgeClient(ch.port2);
    ch.port2.emit('messageerror', new Error('bad response'));
  } finally {
    console.error = originalError;
    ch.port1.close();
    ch.port2.close();
  }

  test.equal(logged.length, 1);
  test.isTrue(String(logged[0][0]).includes('thread-context'));
  test.equal(logged[0][1].message, 'bad response');
});

} // end Meteor.isServer
