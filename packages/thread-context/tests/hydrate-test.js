import {
  createThreadContext,
  resetSettingsSnapshot,
  hydrateContext,
  BridgeClient,
  createMethodProxy,
  MeteorError,
  BridgeTimeoutError,
} from 'meteor/thread-context';

if (Meteor.isServer) {

// ---------------------------------------------------------------------------
// hydrateContext
// ---------------------------------------------------------------------------

Tinytest.add('thread-context - hydrateContext - returns Collections and Meteor', function (test) {
  const ctx = createThreadContext();

  const hydrated = hydrateContext(ctx.port, {
    settings: { public: { appName: 'test' } },
    userId: 'u1',
    callTimeout: 3000,
  });

  test.isTrue(typeof hydrated.Collections === 'object');
  test.isTrue(typeof hydrated.Meteor === 'object');
  test.isTrue(typeof hydrated.Meteor.callAsync === 'function');
  test.equal(hydrated.Meteor.userId(), 'u1');
  test.equal(hydrated.Meteor.isServer, true);
  test.equal(hydrated.Meteor.isClient, false);
  test.equal(hydrated.Meteor.isSimulation, false);

  ctx.destroy();
});

Tinytest.add('thread-context - hydrateContext - Meteor.settings is frozen', function (test) {
  const ctx = createThreadContext();
  const settings = { public: { key: 'val' }, private: { secret: 's' } };

  const { Meteor: M } = hydrateContext(ctx.port, { settings });

  test.equal(M.settings.public.key, 'val');
  test.equal(M.settings.private.secret, 's');
  test.isTrue(Object.isFrozen(M.settings));

  // Mutation should be silently ignored (strict mode would throw)
  try { M.settings.newProp = 'x'; } catch { /* strict mode */ }
  test.equal(M.settings.newProp, undefined);

  ctx.destroy();
});

Tinytest.add('thread-context - hydrateContext - Meteor.settings is deeply frozen', function (test) {
  const ctx = createThreadContext();
  const settings = { public: { nested: { deep: 'val' } } };
  const { Meteor: M } = hydrateContext(ctx.port, { settings });

  test.isTrue(Object.isFrozen(M.settings));
  test.isTrue(Object.isFrozen(M.settings.public));
  test.isTrue(Object.isFrozen(M.settings.public.nested));

  try { M.settings.public.newProp = 'mutated'; } catch { /* strict mode */ }
  test.equal(M.settings.public.newProp, undefined);

  ctx.destroy();
});

Tinytest.add('thread-context - hydrateContext - Meteor.Error is MeteorError', function (test) {
  const ctx = createThreadContext();
  const { Meteor: M } = hydrateContext(ctx.port);

  test.equal(M.Error, MeteorError);

  const err = new M.Error(404, 'Not found', 'details');
  test.equal(err.error, 404);
  test.equal(err.reason, 'Not found');
  test.equal(err.details, 'details');
  test.isTrue(err.isClientSafe);

  ctx.destroy();
});

Tinytest.add('thread-context - hydrateContext - defaults without options', function (test) {
  const ctx = createThreadContext();
  const { Meteor: M } = hydrateContext(ctx.port);

  test.equal(M.userId(), null);
  test.isTrue(Object.isFrozen(M.settings));
  test.equal(typeof M.settings, 'object');

  ctx.destroy();
});

Tinytest.add('thread-context - hydrateContext - Meteor.userId() is callable like on the host', function (test) {
  const ctx = createThreadContext();
  try {
    const { Meteor: M } = hydrateContext(ctx.port, { userId: 'fn-user' });

    test.equal(typeof M.userId, 'function');
    test.equal(M.userId(), 'fn-user');
  } finally {
    ctx.destroy();
  }
});

Tinytest.addAsync('thread-context - hydrateContext - accepts the workerData object directly', async function (test) {
  const ctx = createThreadContext({ userId: 'wd-hydrate', callTimeout: 5000 });
  try {
    const { Meteor: M } = hydrateContext(ctx.workerData);

    test.equal(M.userId(), 'wd-hydrate');
    test.isTrue(Object.isFrozen(M.settings));

    // Uses method defined in bridge-test.js
    const result = await M.callAsync('threadContext.bridge.echo', 'via-workerData');
    test.equal(result.val, 'via-workerData');
    test.equal(result.userId, 'wd-hydrate');
  } finally {
    ctx.destroy();
  }
});

Tinytest.addAsync('thread-context - hydrateContext - Collections proxy bridges to host', async function (test) {
  const collName = 'thread_context_hydrate_test';
  let resolvedCol = Mongo.getCollection(collName);
  if (!resolvedCol) {
    resolvedCol = new Mongo.Collection(collName);
  }
  await resolvedCol.removeAsync({});
  await resolvedCol.insertAsync({ _id: 'h1', val: 'hydrated' });

  const ctx = createThreadContext();
  const { Collections } = hydrateContext(ctx.port, { callTimeout: 5000 });

  const doc = await Collections[collName].findOneAsync({ _id: 'h1' });
  test.equal(doc.val, 'hydrated');

  ctx.destroy();
});

Tinytest.addAsync('thread-context - hydrateContext - Meteor.callAsync bridges to host', async function (test) {
  const ctx = createThreadContext({ userId: 'hydrate-user' });
  const { Meteor: M } = hydrateContext(ctx.port, { callTimeout: 5000 });

  // Uses method defined in bridge-test.js
  const result = await M.callAsync('threadContext.bridge.echo', 'from-hydrate');
  test.equal(result.val, 'from-hydrate');
  test.equal(result.userId, 'hydrate-user');

  ctx.destroy();
});

// ---------------------------------------------------------------------------
// createThreadContext return shape
// ---------------------------------------------------------------------------

Tinytest.add('thread-context - createThreadContext - returned fields reflect options', function (test) {
  const ctx = createThreadContext({
    userId: 'ctx-user',
    connectionId: 'ctx-conn',
    callTimeout: 12345,
  });

  test.equal(ctx.userId, 'ctx-user');
  test.equal(ctx.connectionId, 'ctx-conn');
  test.equal(ctx.callTimeout, 12345);
  test.isTrue(typeof ctx.port === 'object');
  test.isTrue(typeof ctx.settings === 'object');
  test.isTrue(typeof ctx.destroy === 'function');

  ctx.destroy();
});

Tinytest.add('thread-context - createThreadContext - defaults when no options', function (test) {
  const ctx = createThreadContext();

  test.equal(ctx.userId, null);
  test.equal(ctx.connectionId, null);
  test.equal(ctx.callTimeout, 60000);

  ctx.destroy();
});

Tinytest.add('thread-context - createThreadContext - workerData carries the host-side identity', function (test) {
  const { existsSync } = require('fs');
  const { fileURLToPath } = require('url');
  const ctx = createThreadContext({
    userId: 'wd-user',
    connectionId: 'wd-conn',
    callTimeout: 4321,
  });
  try {
    test.equal(Object.keys(ctx.workerData).sort(), [
      'bridgeModuleUrl', 'callTimeout', 'connectionId', 'port', 'settings', 'userId',
    ]);
    test.isTrue(ctx.workerData.port === ctx.port);
    test.isTrue(ctx.workerData.settings === ctx.settings);
    test.equal(ctx.workerData.userId, 'wd-user');
    test.equal(ctx.workerData.connectionId, 'wd-conn');
    test.equal(ctx.workerData.callTimeout, 4321);

    // The worker-side entry module ships with the package and is addressed
    // by a file URL so the worker can import() it on any platform.
    test.isTrue(ctx.workerData.bridgeModuleUrl.startsWith('file://'));
    const bridgeModulePath = fileURLToPath(ctx.workerData.bridgeModuleUrl);
    test.isTrue(bridgeModulePath.endsWith('worker.js'));
    test.isTrue(existsSync(bridgeModulePath));
  } finally {
    ctx.destroy();
  }
});

Tinytest.add('thread-context - createThreadContext - settings snapshot is deeply frozen', function (test) {
  const originalSettings = Meteor.settings;
  Meteor.settings = { public: { nested: { deep: 'val' } }, list: [{ item: 1 }] };
  resetSettingsSnapshot();

  try {
    const ctx = createThreadContext();

    test.isTrue(Object.isFrozen(ctx.settings));
    test.isTrue(Object.isFrozen(ctx.settings.public));
    test.isTrue(Object.isFrozen(ctx.settings.public.nested));
    test.isTrue(Object.isFrozen(ctx.settings.list));
    test.isTrue(Object.isFrozen(ctx.settings.list[0]));

    // A caller mutating the shared snapshot must not affect later contexts.
    try { ctx.settings.public.nested.deep = 'mutated'; } catch { /* strict mode */ }
    ctx.destroy();

    const ctx2 = createThreadContext();
    test.equal(ctx2.settings.public.nested.deep, 'val');
    ctx2.destroy();
  } finally {
    Meteor.settings = originalSettings;
    resetSettingsSnapshot();
  }
});

Tinytest.add('thread-context - createThreadContext - settings snapshot is shared across contexts', function (test) {
  const ctx1 = createThreadContext();
  const ctx2 = createThreadContext();

  // Same object reference — cloned once, reused
  test.isTrue(ctx1.settings === ctx2.settings);

  ctx1.destroy();
  ctx2.destroy();
});

// ---------------------------------------------------------------------------
// BridgeClient timeout
// ---------------------------------------------------------------------------

Tinytest.addAsync('thread-context - BridgeClient - timeout rejects with BridgeTimeoutError', async function (test) {
  const { MessageChannel } = require('worker_threads');
  const ch = new MessageChannel();

  // No host listening on port1 — the message goes nowhere,
  // so the timeout is the only way the promise can settle.
  const client = new BridgeClient(ch.port2, { callTimeout: 50 });
  const methodProxy = createMethodProxy(client);

  try {
    await methodProxy.callAsync('threadContext.nonexistent.method.for.timeout');
    test.fail('Expected BridgeTimeoutError');
  } catch (err) {
    test.instanceOf(err, BridgeTimeoutError);
    test.isTrue(err.message.includes('timed out'));
    test.isTrue(err.message.includes('50ms'));
  }

  ch.port1.close();
  ch.port2.close();
});

// ---------------------------------------------------------------------------
// BridgeHost hooks — onMessage pass-through
// ---------------------------------------------------------------------------

Tinytest.addAsync('thread-context - bridge - onMessage returning undefined does not short-circuit', async function (test) {
  let hookCalled = false;

  const ctx = createThreadContext({
    userId: 'hookUser',
    onMessage() {
      hookCalled = true;
      // Return undefined — should NOT short-circuit, handler proceeds normally
      return undefined;
    }
  });

  const client = new BridgeClient(ctx.port, { callTimeout: 5000 });
  const methodProxy = createMethodProxy(client);

  const result = await methodProxy.callAsync('threadContext.bridge.echo', 'passthrough');
  test.isTrue(hookCalled);
  test.equal(result.val, 'passthrough');
  test.equal(result.userId, 'hookUser');

  ctx.destroy();
});

// ---------------------------------------------------------------------------
// BridgeHost — unknown message type
// ---------------------------------------------------------------------------

Tinytest.addAsync('thread-context - bridge - unknown message type returns BridgeError', async function (test) {
  const ctx = createThreadContext();

  const client = new BridgeClient(ctx.port, { callTimeout: 5000 });

  try {
    await client.call({ type: 'unknown_type', data: 'test' });
    test.fail('Expected BridgeError');
  } catch (err) {
    test.isTrue(err.message.includes('Unknown message type'));
    test.isTrue(err.message.includes('unknown_type'));
  }

  ctx.destroy();
});

// ---------------------------------------------------------------------------
// Multiple concurrent in-flight calls
// ---------------------------------------------------------------------------

Tinytest.addAsync('thread-context - bridge - multiple concurrent calls resolve independently', async function (test) {
  const ctx = createThreadContext({ userId: 'concurrent' });

  const client = new BridgeClient(ctx.port, { callTimeout: 5000 });
  const methodProxy = createMethodProxy(client);

  const [r1, r2, r3] = await Promise.all([
    methodProxy.callAsync('threadContext.bridge.echo', 'a'),
    methodProxy.callAsync('threadContext.bridge.echo', 'b'),
    methodProxy.callAsync('threadContext.bridge.echo', 'c'),
  ]);

  test.equal(r1.val, 'a');
  test.equal(r2.val, 'b');
  test.equal(r3.val, 'c');

  ctx.destroy();
});

// ---------------------------------------------------------------------------
// Handler with connectionId
// ---------------------------------------------------------------------------

Tinytest.addAsync('thread-context - bridge - connectionId is forwarded without error', async function (test) {
  const ctx = createThreadContext({
    userId: 'connUser',
    connectionId: 'conn-abc-123',
  });

  const client = new BridgeClient(ctx.port, { callTimeout: 5000 });
  const methodProxy = createMethodProxy(client);

  // If connectionProxy integration is broken, this would throw
  const result = await methodProxy.callAsync('threadContext.bridge.echo', 'connTest');
  test.equal(result.val, 'connTest');
  test.equal(result.userId, 'connUser');
  test.equal(result.connectionId, 'conn-abc-123');

  ctx.destroy();
});

Tinytest.add('thread-context - resetSettingsSnapshot - forces re-clone', function (test) {
  const ctx1 = createThreadContext();
  const settings1 = ctx1.settings;
  ctx1.destroy();

  resetSettingsSnapshot();

  const ctx2 = createThreadContext();
  const settings2 = ctx2.settings;
  ctx2.destroy();

  test.isTrue(settings1 !== settings2);
});

} // end Meteor.isServer
