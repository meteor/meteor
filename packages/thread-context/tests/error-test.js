import {
  BridgeError,
  BridgeTimeoutError,
  BridgeSerializationError,
  BridgeContextError,
  MeteorError,
  serializeError,
  deserializeError,
} from 'meteor/thread-context';

Tinytest.add('thread-context - errors - hierarchy', function (test) {
  const err = new BridgeError('test');
  test.instanceOf(err, Error);
  test.instanceOf(err, BridgeError);
  test.equal(err.name, 'BridgeError');
  test.equal(err.message, 'test');

  test.instanceOf(new BridgeTimeoutError('t'), BridgeError);
  test.instanceOf(new BridgeSerializationError('t'), BridgeError);
  test.instanceOf(new BridgeContextError('t'), BridgeError);
});

Tinytest.add('thread-context - errors - MeteorError', function (test) {
  const err = new MeteorError(403, 'Access denied', 'extra info');
  test.instanceOf(err, Error);
  test.equal(err.error, 403);
  test.equal(err.reason, 'Access denied');
  test.equal(err.details, 'extra info');
  test.equal(err.message, 'Access denied [403]');
  test.isTrue(err.isClientSafe);
});

Tinytest.add('thread-context - errors - MeteorError without reason', function (test) {
  const err = new MeteorError('not-found');
  test.equal(err.message, '[not-found]');
  test.equal(err.reason, undefined);
});

Tinytest.add('thread-context - errors - serialize/deserialize BridgeError', function (test) {
  const original = new BridgeError('something broke');
  const serialized = serializeError(original);
  test.equal(serialized.type, 'BridgeError');
  test.equal(serialized.message, 'something broke');

  const deserialized = deserializeError(serialized);
  test.instanceOf(deserialized, BridgeError);
  test.equal(deserialized.message, 'something broke');
});

Tinytest.add('thread-context - errors - serialize/deserialize BridgeTimeoutError', function (test) {
  const original = new BridgeTimeoutError('timed out');
  const serialized = serializeError(original);
  test.equal(serialized.type, 'BridgeTimeoutError');

  const deserialized = deserializeError(serialized);
  test.instanceOf(deserialized, BridgeTimeoutError);
  test.instanceOf(deserialized, BridgeError);
  test.equal(deserialized.message, 'timed out');
});

Tinytest.add('thread-context - errors - serialize/deserialize Meteor.Error', function (test) {
  const original = new Meteor.Error(404, 'Not Found', 'details here');
  const serialized = serializeError(original);
  test.equal(serialized.type, 'MeteorError');
  test.equal(serialized.meteorError, 404);
  test.equal(serialized.reason, 'Not Found');
  test.equal(serialized.details, 'details here');

  const deserialized = deserializeError(serialized);
  test.instanceOf(deserialized, MeteorError);
  test.equal(deserialized.error, 404);
  test.equal(deserialized.reason, 'Not Found');
  test.equal(deserialized.details, 'details here');
});

Tinytest.add('thread-context - errors - serialize generic Error', function (test) {
  const original = new TypeError('bad type');
  const serialized = serializeError(original);
  test.equal(serialized.type, 'BridgeError');
  test.equal(serialized.message, 'bad type');

  const deserialized = deserializeError(serialized);
  test.instanceOf(deserialized, BridgeError);
});

Tinytest.add('thread-context - errors - deserialize unknown type', function (test) {
  const deserialized = deserializeError({ type: 'SomeUnknownError', message: 'unknown' });
  test.instanceOf(deserialized, BridgeError);
  test.equal(deserialized.message, 'unknown');
});

Tinytest.add('thread-context - errors - stack is preserved across round-trip', function (test) {
  const original = new BridgeTimeoutError('timeout stack test');
  const serialized = serializeError(original);
  test.isTrue(typeof serialized.stack === 'string');
  test.isTrue(serialized.stack.length > 0);

  const deserialized = deserializeError(serialized);
  test.equal(deserialized.stack, original.stack);
});

Tinytest.add('thread-context - errors - Meteor.Error stack is preserved across round-trip', function (test) {
  const original = new Meteor.Error(500, 'Server error');
  const serialized = serializeError(original);
  test.isTrue(typeof serialized.stack === 'string');

  const deserialized = deserializeError(serialized);
  test.equal(deserialized.stack, serialized.stack);
});

Tinytest.add('thread-context - errors - serialize/deserialize all BridgeError subtypes', function (test) {
  const subtypes = [
    [BridgeSerializationError, 'BridgeSerializationError'],
    [BridgeContextError, 'BridgeContextError'],
  ];

  for (const [ErrorClass, expectedType] of subtypes) {
    const original = new ErrorClass(`test ${expectedType}`);
    const serialized = serializeError(original);
    test.equal(serialized.type, expectedType);

    const deserialized = deserializeError(serialized);
    test.instanceOf(deserialized, ErrorClass);
    test.instanceOf(deserialized, BridgeError);
    test.equal(deserialized.message, `test ${expectedType}`);
  }
});
