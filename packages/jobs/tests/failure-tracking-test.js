/**
 * @module jobs/tests/failure-tracking-test
 * @summary Tests for lastError fields, isTimeout, error codes, and failure metadata.
 */

const { Jobs } = require('meteor/jobs');

let _seq = 0;
function uniqueName(prefix) {
  return `test_fail_track_${prefix}_${++_seq}_${Date.now()}`;
}

// ---------------------------------------------------------------------------
// lastError has all expected fields
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - failure tracking - lastError has message, stack, timestamp', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('fields');
  Jobs.register({
    name,
    retries: 0,
    run() { throw new Error('tracking test'); },
  });

  const jobId = await Jobs.run(name, {});
  await Jobs.executeNow(jobId);

  const job = await Jobs.get(jobId);
  test.equal(job.status, 'failed');
  test.isNotNull(job.lastError);
  test.equal(typeof job.lastError.message, 'string');
  test.matches(job.lastError.message, /tracking test/);
  test.isNotNull(job.lastError.stack, 'stack should be present');
  test.isNotNull(job.lastError.timestamp, 'timestamp should be present');
  test.isTrue(job.lastError.timestamp instanceof Date);
});

// ---------------------------------------------------------------------------
// lastError.isTimeout is false for normal errors
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - failure tracking - isTimeout is false for normal errors', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('no_timeout');
  Jobs.register({
    name,
    retries: 0,
    run() { throw new Error('normal error'); },
  });

  const jobId = await Jobs.run(name, {});
  await Jobs.executeNow(jobId);

  const job = await Jobs.get(jobId);
  test.isFalse(job.lastError.isTimeout, 'isTimeout should be false for normal errors');
});

// ---------------------------------------------------------------------------
// lastError.isTimeout is true for AbortError (timeout)
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - failure tracking - isTimeout is true for AbortError', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('abort_err');
  Jobs.register({
    name,
    retries: 0,
    run() {
      const err = new Error('timed out');
      err.name = 'AbortError';
      throw err;
    },
  });

  const jobId = await Jobs.run(name, {});
  await Jobs.executeNow(jobId);

  const job = await Jobs.get(jobId);
  test.isTrue(job.lastError.isTimeout, 'isTimeout should be true for AbortError');
});

// ---------------------------------------------------------------------------
// lastError.code is preserved
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - failure tracking - error code is preserved in lastError', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('code');
  Jobs.register({
    name,
    retries: 0,
    run() {
      const err = new Error('with code');
      err.code = 'ECONNREFUSED';
      throw err;
    },
  });

  const jobId = await Jobs.run(name, {});
  await Jobs.executeNow(jobId);

  const job = await Jobs.get(jobId);
  test.equal(job.lastError.code, 'ECONNREFUSED');
});

// ---------------------------------------------------------------------------
// lastError.isTimeout is true for STALLED code
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - failure tracking - isTimeout is true for STALLED code', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('stalled_code');
  Jobs.register({
    name,
    retries: 0,
    run() {
      const err = new Error('stalled');
      err.code = 'STALLED';
      throw err;
    },
  });

  const jobId = await Jobs.run(name, {});
  await Jobs.executeNow(jobId);

  const job = await Jobs.get(jobId);
  test.isTrue(job.lastError.isTimeout, 'isTimeout should be true for STALLED code');
});

// ---------------------------------------------------------------------------
// lastError.code is null when not set
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - failure tracking - code is null when not set on error', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('no_code');
  Jobs.register({
    name,
    retries: 0,
    run() { throw new Error('no code'); },
  });

  const jobId = await Jobs.run(name, {});
  await Jobs.executeNow(jobId);

  const job = await Jobs.get(jobId);
  test.isNull(job.lastError.code, 'code should be null when not set');
});

// ---------------------------------------------------------------------------
// lastError is set on retryable failure too
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - failure tracking - lastError set on retryable failure (pending)', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('retry_err');
  Jobs.register({
    name,
    retries: 3,
    backoff: 'fixed',
    backoffDelay: 5000,
    run() { throw new Error('retry error'); },
  });

  const jobId = await Jobs.run(name, {});
  await Jobs.executeNow(jobId);

  const job = await Jobs.get(jobId);
  test.equal(job.status, 'pending', 'Should be pending (retryable)');
  test.isNotNull(job.lastError, 'lastError should be set even on retryable failure');
  test.matches(job.lastError.message, /retry error/);
});

// ---------------------------------------------------------------------------
// FatalError preserves error message in lastError
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - failure tracking - FatalError message in lastError', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('fatal_msg');
  Jobs.register({
    name,
    retries: 5,
    run() { throw new Jobs.FatalError('fatal error message'); },
  });

  const jobId = await Jobs.run(name, {});
  await Jobs.executeNow(jobId);

  const job = await Jobs.get(jobId);
  test.equal(job.status, 'failed');
  test.matches(job.lastError.message, /fatal error message/);
});

// ---------------------------------------------------------------------------
// completedAt and result are set on success
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - failure tracking - completedAt and result set on success', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('complete_fields');
  Jobs.register({
    name,
    retries: 0,
    run() { return { data: 42 }; },
  });

  const jobId = await Jobs.run(name, {});
  await Jobs.executeNow(jobId);

  const job = await Jobs.get(jobId);
  test.equal(job.status, 'completed');
  test.isNotNull(job.completedAt);
  test.isTrue(job.completedAt instanceof Date);
  test.equal(job.result.data, 42);
  test.isNull(job.failedAt, 'failedAt should be null on success');
  test.isNull(job.lastError, 'lastError should be null on success');
});
