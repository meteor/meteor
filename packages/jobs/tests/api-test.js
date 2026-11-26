/**
 * @module jobs/tests/api-test
 * @summary Tests for the Jobs public API surface — configure, has, get,
 * error classes, events, and collection.
 */

const { Jobs } = require('meteor/jobs');

let _seq = 0;
function uniqueName(prefix) {
  return `test_api_${prefix}_${++_seq}_${Date.now()}`;
}

Tinytest.add('jobs - api - Jobs.configure() merges options', function (test) {
  Jobs.configure({ log: false });
  const config = Jobs.getConfig();
  test.isFalse(config.log);

  // Merge another option without losing the first
  Jobs.configure({ pollInterval: 9999 });
  const config2 = Jobs.getConfig();
  test.isFalse(config2.log, 'log should still be false');
  test.equal(config2.pollInterval, 9999);

  // Restore defaults
  Jobs.configure({ log: true, pollInterval: 5000 });
});

Tinytest.add('jobs - api - Jobs.has() returns correct values', function (test) {
  const name = uniqueName('has');
  test.isFalse(Jobs.has(name));

  Jobs.register({ name, run() {} });
  test.isTrue(Jobs.has(name));

  test.isFalse(Jobs.has('nonexistent_job_name'));
});

Tinytest.addAsync('jobs - api - Jobs.get() returns null for missing job', async function (test) {
  const result = await Jobs.get('nonexistent_id_12345');
  test.isNull(result);
});

Tinytest.add('jobs - api - FatalError is a proper Error subclass', function (test) {
  const err = new Jobs.FatalError('test');
  test.isTrue(err instanceof Error);
  test.isTrue(err instanceof Jobs.FatalError);
  test.equal(err.message, 'test');
  test.equal(err.name, 'Jobs.FatalError');
  test.isNotUndefined(err.stack);
});

Tinytest.add('jobs - api - DuplicateError is a proper Error subclass', function (test) {
  const err = new Jobs.DuplicateError('dup test');
  test.isTrue(err instanceof Error);
  test.isTrue(err instanceof Jobs.DuplicateError);
  test.equal(err.message, 'dup test');
  test.equal(err.name, 'Jobs.DuplicateError');
  test.isNotUndefined(err.stack);
});

Tinytest.add('jobs - api - Jobs.on() registers event listeners', function (test) {
  const handle = Jobs.on('enqueued', function () {});
  test.isNotUndefined(handle, 'on() should return a handle');
  test.equal(typeof handle.stop, 'function', 'Handle should have a stop() method');
  handle.stop();
});

Tinytest.add('jobs - api - Jobs.on() throws for unknown events', function (test) {
  test.throws(function () {
    Jobs.on('nonexistent_event', function () {});
  }, /unknown event/i);
});

Tinytest.add('jobs - api - Jobs.collection exists and is a Mongo.Collection', function (test) {
  test.isNotUndefined(Jobs.collection, 'Jobs.collection should exist');
  test.isNotUndefined(Jobs.collection.find, 'Jobs.collection should have find()');
  test.isNotUndefined(Jobs.collection.findOneAsync, 'Jobs.collection should have findOneAsync()');
});

Tinytest.addAsync('jobs - api - Jobs.run() throws for unregistered job', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  try {
    await Jobs.run('completely_unregistered_job_xyz', {});
    test.fail('Should have thrown');
  } catch (err) {
    test.matches(err.message, /not.*registered/i);
  }
});

Tinytest.addAsync('jobs - api - Jobs.cancel() returns false for non-existent job', async function (test) {
  const result = await Jobs.cancel('nonexistent_id_99999');
  test.isFalse(result);
});

Tinytest.add('jobs - api - Jobs.configure() validates testMode', function (test) {
  // Valid values
  Jobs.configure({ testMode: 'inline' });
  Jobs.configure({ testMode: 'manual' });
  Jobs.configure({ testMode: null });

  // Invalid value
  test.throws(function () {
    Jobs.configure({ testMode: 'invalid' });
  });
});
