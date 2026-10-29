/**
 * @module jobs/tests/claiming-test
 * @summary Tests for atomic claiming logic.
 */

const { Jobs } = require('meteor/jobs');

let _seq = 0;
function uniqueName(prefix) {
  return `test_claim_${prefix}_${++_seq}_${Date.now()}`;
}

Tinytest.addAsync('jobs - claiming - atomic claim sets correct fields', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('fields');
  Jobs.register({
    name,
    retries: 0,
    run() { return 'claimed-result'; },
  });

  const jobId = await Jobs.run(name, { payload: 1 });

  // Before execution, job should be 'ready'
  const before = await Jobs.get(jobId);
  test.equal(before.status, 'ready');
  test.isNull(before.claimedBy);
  test.isNull(before.claimedAt);
  test.equal(before.attempts, 0);

  // Execute the job
  await Jobs.executeNow(jobId);

  // After execution, job should be completed with claim fields set
  const after = await Jobs.get(jobId);
  test.equal(after.status, 'completed');
  test.isNotNull(after.claimedBy, 'claimedBy should be set');
  test.isNotNull(after.claimedAt, 'claimedAt should be set');
  test.isNotNull(after.startedAt, 'startedAt should be set');
  test.isNotNull(after.runId, 'runId should be set');
  test.equal(after.attempts, 1, 'attempts should be 1');
  test.equal(after.result, 'claimed-result');
});

Tinytest.addAsync('jobs - claiming - second claim on same job is a no-op', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('double');
  let runCount = 0;
  Jobs.register({
    name,
    retries: 0,
    run() {
      runCount++;
      return 'ok';
    },
  });

  const jobId = await Jobs.run(name, {});

  // Execute it once
  await Jobs.executeNow(jobId);
  test.equal(runCount, 1);

  // Try to execute it again (should be a no-op since it's already completed)
  await Jobs.executeNow(jobId);
  test.equal(runCount, 1, 'Job should not run twice');
});
