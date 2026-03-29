if (Meteor.isServer) {

Meteor.methods({
  'threadContext.test.echo'(arg) {
    return { echo: arg, userId: this.userId };
  },
  'threadContext.test.throws'() {
    throw new Meteor.Error(403, 'Forbidden', 'test details');
  },
  'threadContext.test.setUserId'() {
    this.setUserId('hacker');
  },
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

  await test.throwsAsync(async () => {
    await handler.handle({
      methodName: 'threadContext.test.doesNotExist',
      methodArgs: [],
    });
  });
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

} // end Meteor.isServer
