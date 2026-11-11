/**
 * @module jobs/tests/config-validation-test
 * @summary Tests for config validation, snapshot caching, and field-level checks.
 */

const { Jobs } = require('meteor/jobs');

Tinytest.add('jobs - config - validates concurrency (positive integer)', function (test) {
  test.throws(function () {
    Jobs.configure({ concurrency: 0 });
  }, /concurrency|integer/i);

  test.throws(function () {
    Jobs.configure({ concurrency: -5 });
  }, /concurrency|integer/i);

  test.throws(function () {
    Jobs.configure({ concurrency: 3.5 });
  }, /concurrency|integer/i);

  // Valid value
  Jobs.configure({ concurrency: 10 });
  test.equal(Jobs.getConfig().concurrency, 10);

  // Restore default
  Jobs.configure({ concurrency: 20 });
});

Tinytest.add('jobs - config - validates pollInterval (positive integer)', function (test) {
  test.throws(function () {
    Jobs.configure({ pollInterval: 0 });
  });

  test.throws(function () {
    Jobs.configure({ pollInterval: -100 });
  });

  // Valid value
  Jobs.configure({ pollInterval: 3000 });
  test.equal(Jobs.getConfig().pollInterval, 3000);

  // Restore default
  Jobs.configure({ pollInterval: 5000 });
});

Tinytest.add('jobs - config - validates stalledThreshold (positive integer)', function (test) {
  test.throws(function () {
    Jobs.configure({ stalledThreshold: 0 });
  });

  // Valid value
  Jobs.configure({ stalledThreshold: 30000 });
  test.equal(Jobs.getConfig().stalledThreshold, 30000);

  // Restore default
  Jobs.configure({ stalledThreshold: 60000 });
});

Tinytest.add('jobs - config - validates heartbeatInterval (positive integer)', function (test) {
  test.throws(function () {
    Jobs.configure({ heartbeatInterval: -1 });
  });

  // Valid value
  Jobs.configure({ heartbeatInterval: 10000 });
  test.equal(Jobs.getConfig().heartbeatInterval, 10000);

  // Restore default
  Jobs.configure({ heartbeatInterval: 15000 });
});

Tinytest.add('jobs - config - retentionPeriod accepts null to disable', function (test) {
  Jobs.configure({ retentionPeriod: null });
  const config = Jobs.getConfig();
  test.isNull(config.retentionPeriod);

  // Restore default
  Jobs._resetConfig();
});

Tinytest.add('jobs - config - retentionPeriod accepts ms-compatible string', function (test) {
  Jobs.configure({ retentionPeriod: '3d' });
  const config = Jobs.getConfig();
  test.equal(config.retentionPeriod, 3 * 24 * 60 * 60 * 1000);

  // Restore default
  Jobs._resetConfig();
});

Tinytest.add('jobs - config - retentionPeriod rejects invalid string', function (test) {
  test.throws(function () {
    Jobs.configure({ retentionPeriod: 'not-a-duration' });
  }, /retentionPeriod/i);
});

Tinytest.add('jobs - config - retentionPeriod accepts positive integer', function (test) {
  Jobs.configure({ retentionPeriod: 86400000 });
  test.equal(Jobs.getConfig().retentionPeriod, 86400000);

  // Restore default
  Jobs._resetConfig();
});

Tinytest.add('jobs - config - validates leaderTimeout (positive integer)', function (test) {
  test.throws(function () {
    Jobs.configure({ leaderTimeout: 0 });
  });

  Jobs.configure({ leaderTimeout: 20000 });
  test.equal(Jobs.getConfig().leaderTimeout, 20000);

  // Restore default
  Jobs.configure({ leaderTimeout: 30000 });
});

Tinytest.add('jobs - config - validates shutdownTimeout (positive integer)', function (test) {
  test.throws(function () {
    Jobs.configure({ shutdownTimeout: -1 });
  });

  Jobs.configure({ shutdownTimeout: 15000 });
  test.equal(Jobs.getConfig().shutdownTimeout, 15000);

  // Restore default
  Jobs.configure({ shutdownTimeout: 30000 });
});

Tinytest.add('jobs - config - instanceId auto-generated on first getConfig()', function (test) {
  Jobs._resetConfig();
  const config = Jobs.getConfig();
  test.isNotNull(config.instanceId, 'instanceId should be auto-generated');
  test.equal(typeof config.instanceId, 'string');
  test.isTrue(config.instanceId.length > 0);
});

Tinytest.add('jobs - config - explicit instanceId is preserved', function (test) {
  Jobs._resetConfig();
  Jobs.configure({ instanceId: 'my-custom-id' });
  test.equal(Jobs.getConfig().instanceId, 'my-custom-id');

  // Restore default
  Jobs._resetConfig();
});

Tinytest.add('jobs - config - getConfig() returns frozen snapshot', function (test) {
  Jobs._resetConfig();
  const config = Jobs.getConfig();
  test.isTrue(Object.isFrozen(config), 'Config snapshot should be frozen');
});

Tinytest.add('jobs - config - getConfig() returns same reference until invalidated', function (test) {
  Jobs._resetConfig();
  const a = Jobs.getConfig();
  const b = Jobs.getConfig();
  test.isTrue(a === b, 'Should return cached reference');

  // After configure(), the cache should be invalidated
  Jobs.configure({ pollInterval: 7777 });
  const c = Jobs.getConfig();
  test.isFalse(a === c, 'Should return new reference after configure()');
  test.equal(c.pollInterval, 7777);

  // Restore default
  Jobs._resetConfig();
});

Tinytest.add('jobs - config - validates authorize must be a function', function (test) {
  test.throws(function () {
    Jobs.configure({ authorize: 'not-a-function' });
  });

  // Valid: function
  Jobs.configure({ authorize: () => true });

  // Valid: null
  Jobs.configure({ authorize: null });
});
