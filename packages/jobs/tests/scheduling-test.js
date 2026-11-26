/**
 * @module jobs/tests/scheduling-test
 * @summary Tests for cron scheduling validation and scheduled job queries.
 */

const { Jobs } = require('meteor/jobs');

let _seq = 0;
function uniqueName(prefix) {
  return `test_sched_${prefix}_${++_seq}_${Date.now()}`;
}

Tinytest.add('jobs - scheduling - cron expressions are validated at registration', function (test) {
  // Valid expression should not throw
  const name = uniqueName('valid');
  Jobs.register({
    name,
    schedule: '0 0 * * *',
    run() {},
  });
  test.isTrue(Jobs.has(name));

  // Invalid expression should throw
  test.throws(function () {
    Jobs.register({
      name: uniqueName('invalid'),
      schedule: '99 99 99 99 99',
      run() {},
    });
  }, /cron/i);
});

Tinytest.add('jobs - scheduling - registered job preserves schedule and timezone', function (test) {
  const name = uniqueName('tz');
  Jobs.register({
    name,
    schedule: '30 2 * * *',
    timezone: 'America/New_York',
    run() {},
  });

  const def = Jobs._getDefinition(name);
  test.equal(def.schedule, '30 2 * * *');
  test.equal(def.timezone, 'America/New_York');
});

Tinytest.add('jobs - scheduling - missedRun defaults to run-once', function (test) {
  const name = uniqueName('missed');
  Jobs.register({
    name,
    schedule: '0 * * * *',
    run() {},
  });
  const def = Jobs._getDefinition(name);
  test.equal(def.missedRun, 'run-once');
});

Tinytest.add('jobs - scheduling - missedRun validates allowed values', function (test) {
  test.throws(function () {
    Jobs.register({
      name: uniqueName('bad_missed'),
      schedule: '0 * * * *',
      missedRun: 'invalid',
      run() {},
    });
  }, /missedRun/i);
});
