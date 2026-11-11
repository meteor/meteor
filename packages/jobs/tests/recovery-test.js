/**
 * @module jobs/tests/recovery-test
 * @summary Tests for stalled/crash recovery.
 *
 * Full stalled detection requires timing-dependent behavior that is
 * difficult to test reliably in tinytest. These tests verify the
 * related data structures and document states.
 */

const { Jobs } = require('meteor/jobs');

let _seq = 0;
function uniqueName(prefix) {
  return `test_recov_${prefix}_${++_seq}_${Date.now()}`;
}

Tinytest.add('jobs - recovery - stalledThreshold config is accepted', function (test) {
  // Should not throw
  Jobs.configure({ stalledThreshold: 45000 });
  const config = Jobs.getConfig();
  test.equal(config.stalledThreshold, 45000);
});

Tinytest.addAsync('jobs - recovery - running job count is zero when idle', async function (test) {
  const count = Jobs._runningJobCount();
  // There should be no running jobs in the test context
  test.equal(typeof count, 'number');
  test.equal(count, 0);
});

Tinytest.addAsync('jobs - recovery - running job IDs set is empty when idle', async function (test) {
  const ids = Jobs._runningJobIds();
  test.isTrue(ids instanceof Set);
  test.equal(ids.size, 0);
});

Tinytest.addAsync('jobs - recovery - completed jobs have completedAt set', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('completed_at');
  Jobs.register({
    name,
    retries: 0,
    run() { return 'done'; },
  });

  const jobId = await Jobs.run(name, {});
  await Jobs.executeNow(jobId);

  const job = await Jobs.get(jobId);
  test.equal(job.status, 'completed');
  test.isNotNull(job.completedAt, 'completedAt should be set on completed jobs');
  test.isTrue(job.completedAt instanceof Date);
});

Tinytest.addAsync('jobs - recovery - failed jobs have failedAt and lastError set', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('failed_at');
  Jobs.register({
    name,
    retries: 0,
    run() { throw new Error('recovery test error'); },
  });

  const jobId = await Jobs.run(name, {});
  await Jobs.executeNow(jobId);

  const job = await Jobs.get(jobId);
  test.equal(job.status, 'failed');
  test.isNotNull(job.failedAt, 'failedAt should be set on failed jobs');
  test.isNotNull(job.lastError, 'lastError should be set on failed jobs');
  test.equal(typeof job.lastError.message, 'string');
  test.matches(job.lastError.message, /recovery test error/);
  test.isNotNull(job.lastError.timestamp);
});
