import { createThreadContext, BridgeError, BridgeClient, createCollectionProxy, createMethodProxy, getActiveBridgeCount } from 'meteor/thread-context';

if (Meteor.isServer) {

const bridgeTestCollName = 'thread_context_bridge_test';
const BridgeTestCol = new Mongo.Collection(bridgeTestCollName);

Meteor.methods({
  'threadContext.bridge.echo'(val) {
    return { val, userId: this.userId };
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

} // end Meteor.isServer
