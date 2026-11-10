if (Meteor.isServer) {

Meteor.methods({
  'threadContext.test.echo'(arg) {
    return { echo: arg, userId: this.userId };
  },
  'threadContext.test.throws'() {
    throw new Meteor.Error(403, 'Forbidden', 'test details');
  },
  async 'threadContext.test.setUserId'() {
    await this.setUserId('hacker');
  },
  'threadContext.test.randomSeed'() {
    return this.randomSeed;
  },
});

const SESSION_METHODS = [
  'login',
  'logout',
  'logoutOtherClients',
  'getNewToken',
  'removeOtherTokens',
  'configureLoginService',
];

Tinytest.addAsync('thread-context - MethodHandler - refuses DDP session management methods', async function (test) {
  const { MethodHandler, BridgeContextError } = require('meteor/thread-context');
  const handler = new MethodHandler({ userId: 'u1', connectionId: 'conn-1' });

  for (const methodName of SESSION_METHODS) {
    try {
      await handler.handle({ methodName, methodArgs: [] });
      test.fail(`Expected BridgeContextError for '${methodName}'`);
    } catch (err) {
      test.instanceOf(err, BridgeContextError, methodName);
      test.isTrue(err.message.includes(methodName), methodName);
    }
  }
});

Tinytest.addAsync('thread-context - MethodHandler - ignores inherited Object.prototype names', async function (test) {
  const { MethodHandler } = require('meteor/thread-context');
  const handler = new MethodHandler({ userId: null, connectionId: null });

  for (const methodName of ['constructor', 'hasOwnProperty', '__proto__']) {
    try {
      await handler.handle({ methodName, methodArgs: [] });
      test.fail(`Expected 404 for '${methodName}'`);
    } catch (err) {
      test.instanceOf(err, Meteor.Error, methodName);
      test.equal(err.error, 404, methodName);
    }
  }
});

Tinytest.addAsync('thread-context - MethodHandler - invocation carries a per-call randomSeed', async function (test) {
  const { MethodHandler } = require('meteor/thread-context');
  const handler = new MethodHandler({ userId: null, connectionId: null });

  const seed1 = await handler.handle({ methodName: 'threadContext.test.randomSeed', methodArgs: [] });
  const seed2 = await handler.handle({ methodName: 'threadContext.test.randomSeed', methodArgs: [] });

  test.matches(seed1, /^[0-9a-f]{20}$/);
  test.matches(seed2, /^[0-9a-f]{20}$/);
  test.notEqual(seed1, seed2);
});

Tinytest.addAsync('thread-context - MethodHandler - call method with userId', async function (test) {
  const { MethodHandler } = require('meteor/thread-context');
  const handler = new MethodHandler({ userId: 'user123', connectionId: null });

  const result = await handler.handle({
    methodName: 'threadContext.test.echo',
    methodArgs: ['hello'],
  });

  test.equal(result.echo, 'hello');
  test.equal(result.userId, 'user123');
});

Tinytest.addAsync('thread-context - MethodHandler - call method with null userId', async function (test) {
  const { MethodHandler } = require('meteor/thread-context');
  const handler = new MethodHandler({ userId: null, connectionId: null });

  const result = await handler.handle({
    methodName: 'threadContext.test.echo',
    methodArgs: ['world'],
  });

  test.equal(result.echo, 'world');
  test.equal(result.userId, null);
});

Tinytest.addAsync('thread-context - MethodHandler - method not found', async function (test) {
  const { MethodHandler } = require('meteor/thread-context');
  const handler = new MethodHandler({ userId: null, connectionId: null });

  try {
    await handler.handle({
      methodName: 'threadContext.test.doesNotExist',
      methodArgs: [],
    });
    test.fail('Expected error');
  } catch (err) {
    test.instanceOf(err, Meteor.Error);
    test.equal(err.error, 404);
    test.matches(err.message, /threadContext\.test\.doesNotExist/);
  }
});

Tinytest.addAsync('thread-context - MethodHandler - method throws Meteor.Error', async function (test) {
  const { MethodHandler } = require('meteor/thread-context');
  const handler = new MethodHandler({ userId: null, connectionId: null });

  try {
    await handler.handle({
      methodName: 'threadContext.test.throws',
      methodArgs: [],
    });
    test.fail('Expected error');
  } catch (err) {
    test.equal(err.error, 403);
    test.equal(err.reason, 'Forbidden');
    test.equal(err.details, 'test details');
  }
});

Tinytest.addAsync('thread-context - MethodHandler - setUserId throws BridgeContextError', async function (test) {
  const { MethodHandler, BridgeContextError } = require('meteor/thread-context');
  const handler = new MethodHandler({ userId: null, connectionId: null });

  try {
    await handler.handle({
      methodName: 'threadContext.test.setUserId',
      methodArgs: [],
    });
    test.fail('Expected error');
  } catch (err) {
    test.instanceOf(err, BridgeContextError);
  }
});

Tinytest.addAsync('thread-context - MethodHandler - concurrent calls get independent invocations', async function (test) {
  const { MethodHandler } = require('meteor/thread-context');
  const handlerA = new MethodHandler({ userId: 'concurrent-user-1', connectionId: null });
  const handlerB = new MethodHandler({ userId: 'concurrent-user-2', connectionId: null });

  const [r1, r2] = await Promise.all([
    handlerA.handle({ methodName: 'threadContext.test.echo', methodArgs: ['first'] }),
    handlerB.handle({ methodName: 'threadContext.test.echo', methodArgs: ['second'] }),
  ]);

  test.equal(r1.echo, 'first');
  test.equal(r1.userId, 'concurrent-user-1');
  test.equal(r2.echo, 'second');
  test.equal(r2.userId, 'concurrent-user-2');
});

} // end Meteor.isServer
