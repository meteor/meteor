if (Meteor.isServer) {

Tinytest.add('thread-context - ConnectionProxy - id returns connectionId', function (test) {
  const { createConnectionProxy } = require('meteor/thread-context');
  const proxy = createConnectionProxy('conn-123');

  test.equal(proxy.id, 'conn-123');
});

Tinytest.add('thread-context - ConnectionProxy - DDP property throws BridgeContextError', function (test) {
  const { createConnectionProxy } = require('meteor/thread-context');
  const { BridgeContextError } = require('meteor/thread-context');
  const proxy = createConnectionProxy('conn-123');

  test.throws(() => {
    // eslint-disable-next-line no-unused-expressions
    proxy.clientAddress;
  }, 'not available in worker');

  test.throws(() => {
    // eslint-disable-next-line no-unused-expressions
    proxy.httpHeaders;
  }, 'not available in worker');

  try {
    // eslint-disable-next-line no-unused-expressions
    proxy.clientAddress;
    test.fail('Expected BridgeContextError');
  } catch (err) {
    test.instanceOf(err, BridgeContextError);
    test.isTrue(err.message.includes('clientAddress'));
  }
});

Tinytest.add('thread-context - ConnectionProxy - Symbol properties return undefined', function (test) {
  const { createConnectionProxy } = require('meteor/thread-context');
  const proxy = createConnectionProxy('conn-123');

  test.equal(proxy[Symbol.toPrimitive], undefined);
  test.equal(proxy[Symbol.toStringTag], undefined);
  test.equal(proxy[Symbol.iterator], undefined);
});

Tinytest.add('thread-context - ConnectionProxy - introspection properties return undefined', function (test) {
  const { createConnectionProxy } = require('meteor/thread-context');
  const proxy = createConnectionProxy('conn-123');

  // These must not throw — they're accessed by JSON.stringify, util.inspect, Promise coercion, etc.
  test.equal(proxy.then, undefined);
  test.equal(proxy.toJSON, undefined);
  test.equal(proxy.inspect, undefined);
  test.equal(proxy.constructor, undefined);
  test.equal(proxy.valueOf, undefined);
  test.equal(proxy.toString, undefined);
  test.equal(proxy.nodeType, undefined);
});

Tinytest.add('thread-context - ConnectionProxy - null connectionId', function (test) {
  const { createConnectionProxy } = require('meteor/thread-context');
  const proxy = createConnectionProxy(null);

  test.equal(proxy.id, null);
});

} // end Meteor.isServer
