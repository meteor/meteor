/**
 * @module jobs/tests/job-document-test
 * @summary Tests for job document structure, field defaults, and base fields.
 */

const { Jobs } = require('meteor/jobs');

let _seq = 0;
function uniqueName(prefix) {
  return `test_doc_${prefix}_${++_seq}_${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Job document has all expected fields
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - document - has all expected fields on creation', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('fields');
  Jobs.register({
    name,
    retries: 2,
    timeout: 60000,
    run() { return 'ok'; },
  });

  const jobId = await Jobs.run(name, { myData: 'test' });
  const job = await Jobs.get(jobId);

  // Identity
  test.isNotNull(job._id);
  test.equal(job.name, name);

  // Status
  test.equal(job.status, 'ready');
  test.equal(job.source, 'manual');

  // Data
  test.equal(job.data.myData, 'test');

  // Configuration
  test.equal(job.maxAttempts, 3, 'maxAttempts = retries + 1');
  test.equal(job.timeout, 60000);
  test.equal(job.offload, false);
  test.equal(job.priority, 0);

  // Counters
  test.equal(job.attempts, 0);

  // Timestamps
  test.isNotNull(job.createdAt);
  test.isTrue(job.createdAt instanceof Date);
  test.isNotNull(job.scheduledAt);
  test.isNull(job.completedAt);
  test.isNull(job.failedAt);
  test.isNull(job.cancelledAt);

  // Claim fields (null before claim)
  test.isNull(job.claimedBy);
  test.isNull(job.claimedAt);
  test.isNull(job.heartbeatAt);
  test.isNull(job.startedAt);
  test.isNull(job.runId);

  // Error/retry fields
  test.isNull(job.result);
  test.isNull(job.lastError);
  test.isNull(job.nextRetryAt);

  // Cron fields (null for manual jobs)
  test.isNull(job.cronSchedule);
  test.isNull(job.timezone);

  await Jobs.cancel(jobId);
});

// ---------------------------------------------------------------------------
// After execution: claim fields are populated
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - document - claim fields populated after execution', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('claim_fields');
  Jobs.register({ name, retries: 0, run() { return 'ok'; } });

  const jobId = await Jobs.run(name, {});
  await Jobs.executeNow(jobId);

  const job = await Jobs.get(jobId);
  test.equal(job.status, 'completed');
  test.isNotNull(job.claimedBy, 'claimedBy should be set');
  test.isNotNull(job.claimedAt, 'claimedAt should be set');
  test.isNotNull(job.startedAt, 'startedAt should be set');
  test.isNotNull(job.runId, 'runId should be set');
  test.isNotNull(job.heartbeatAt, 'heartbeatAt should be set from claim');
  test.equal(job.attempts, 1);
});

// ---------------------------------------------------------------------------
// maxAttempts calculation: retries + 1
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - document - maxAttempts is retries + 1', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name0 = uniqueName('max0');
  Jobs.register({ name: name0, retries: 0, run() { return 'ok'; } });
  const id0 = await Jobs.run(name0, {});
  test.equal((await Jobs.get(id0)).maxAttempts, 1);
  await Jobs.cancel(id0);

  const name5 = uniqueName('max5');
  Jobs.register({ name: name5, retries: 5, run() { return 'ok'; } });
  const id5 = await Jobs.run(name5, {});
  test.equal((await Jobs.get(id5)).maxAttempts, 6);
  await Jobs.cancel(id5);
});

// ---------------------------------------------------------------------------
// Source field tracks origin
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - document - source is manual for Jobs.run()', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('source_manual');
  Jobs.register({ name, run() { return 'ok'; } });

  const jobId = await Jobs.run(name, {});
  const job = await Jobs.get(jobId);
  test.equal(job.source, 'manual');

  await Jobs.cancel(jobId);
});

Tinytest.addAsync('jobs - document - source is retry after Jobs.retry()', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('source_retry');
  Jobs.register({ name, retries: 0, run() { throw new Error('fail'); } });

  const jobId = await Jobs.run(name, {});
  await Jobs.executeNow(jobId);

  await Jobs.retry(jobId);
  const job = await Jobs.get(jobId);
  test.equal(job.source, 'retry');
});

// ---------------------------------------------------------------------------
// Null data defaults to empty object
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - document - null data stored as empty object', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('null_data');
  Jobs.register({ name, run() { return 'ok'; } });

  const jobId = await Jobs.run(name, null);
  const job = await Jobs.get(jobId);
  test.isNotNull(job.data, 'job.data should not be null');
  test.equal(Object.prototype.toString.call(job.data), '[object Object]');
  test.equal(Object.keys(job.data).length, 0);

  await Jobs.cancel(jobId);
});

// ---------------------------------------------------------------------------
// Default data is empty object
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - document - default data is empty object', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('default_data');
  Jobs.register({ name, run() { return 'ok'; } });

  const jobId = await Jobs.run(name);
  const job = await Jobs.get(jobId);
  test.isNotNull(job.data, 'job.data should not be null');
  test.equal(Object.prototype.toString.call(job.data), '[object Object]');
  test.equal(Object.keys(job.data).length, 0);

  await Jobs.cancel(jobId);
});
