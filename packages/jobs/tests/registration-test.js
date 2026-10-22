/**
 * @module jobs/tests/registration-test
 * @summary Tests for Jobs.register() — validation, defaults, duplicates.
 */

const { Jobs } = require('meteor/jobs');

// Helper: unique name per test to avoid cross-test collisions.
let _seq = 0;
function uniqueName(prefix) {
  return `test_reg_${prefix}_${++_seq}_${Date.now()}`;
}

Tinytest.add('jobs - registration - registers a job successfully', function (test) {
  const name = uniqueName('ok');
  Jobs.register({
    name,
    run() { return 'done'; },
  });
  test.isTrue(Jobs.has(name));
});

Tinytest.add('jobs - registration - throws on missing name', function (test) {
  test.throws(function () {
    Jobs.register({ run() {} });
  }, /name/i);
});

Tinytest.add('jobs - registration - throws on missing run function', function (test) {
  const name = uniqueName('no_run');
  test.throws(function () {
    Jobs.register({ name });
  }, /run/i);
});

Tinytest.add('jobs - registration - throws on invalid cron expression', function (test) {
  const name = uniqueName('bad_cron');
  test.throws(function () {
    Jobs.register({
      name,
      schedule: 'not a cron',
      run() {},
    });
  }, /cron/i);
});

Tinytest.add('jobs - registration - throws on duplicate registration', function (test) {
  const name = uniqueName('dup');
  Jobs.register({ name, run() {} });

  test.throws(function () {
    Jobs.register({ name, run() {} });
  }, /already registered/i);
});

Tinytest.add('jobs - registration - applies default values', function (test) {
  const name = uniqueName('defaults');
  Jobs.register({ name, run() {} });

  const def = Jobs._getDefinition(name);
  test.isNotUndefined(def);
  test.equal(def.retries, 3);
  test.equal(def.backoff, 'exponential');
  test.equal(def.backoffDelay, 1000);
  test.equal(def.timeout, 300000);
  test.equal(def.offload, false);
  test.equal(def.missedRun, 'run-once');
  test.equal(def.onDuplicate, 'skip');
});

Tinytest.add('jobs - registration - validates option types', function (test) {
  // timeout must be a positive integer
  test.throws(function () {
    Jobs.register({
      name: uniqueName('bad_timeout'),
      run() {},
      timeout: -1,
    });
  }, /timeout/i);

  // retries must be non-negative integer
  test.throws(function () {
    Jobs.register({
      name: uniqueName('bad_retries'),
      run() {},
      retries: -1,
    });
  }, /retries/i);

  // backoff must be valid
  test.throws(function () {
    Jobs.register({
      name: uniqueName('bad_backoff'),
      run() {},
      backoff: 'invalid',
    });
  }, /backoff/i);

  // onDuplicate must be valid
  test.throws(function () {
    Jobs.register({
      name: uniqueName('bad_ondup'),
      run() {},
      onDuplicate: 'invalid',
    });
  }, /onDuplicate/i);

  // unique must be a function
  test.throws(function () {
    Jobs.register({
      name: uniqueName('bad_unique'),
      run() {},
      unique: 'not-a-function',
    });
  }, /unique/i);
});

Tinytest.add('jobs - registration - accepts valid cron expression', function (test) {
  const name = uniqueName('good_cron');
  Jobs.register({
    name,
    schedule: '*/5 * * * *',
    run() {},
  });
  test.isTrue(Jobs.has(name));
  const def = Jobs._getDefinition(name);
  test.equal(def.schedule, '*/5 * * * *');
});
