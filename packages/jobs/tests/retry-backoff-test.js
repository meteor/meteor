/**
 * @module jobs/tests/retry-backoff-test
 * @summary Tests for retry scheduling, backoff behavior, and retry edge cases.
 */

const { Jobs } = require('meteor/jobs');

let _seq = 0;
function uniqueName(prefix) {
  return `test_backoff_${prefix}_${++_seq}_${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Job with retries schedules retry on failure
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - retry backoff - failed job with retries goes to pending', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('retry_pending');
  Jobs.register({
    name,
    retries: 3,
    backoff: 'fixed',
    backoffDelay: 5000,
    run() { throw new Error('fail for retry'); },
  });

  const jobId = await Jobs.run(name, {});
  await Jobs.executeNow(jobId);

  // After first failure, job should be in pending (scheduled for retry)
  const job = await Jobs.get(jobId);
  test.equal(job.status, 'pending', 'Should be pending after retryable failure');
  test.equal(job.source, 'retry');
  test.equal(job.attempts, 1, 'Should have 1 attempt');
  test.isNotNull(job.nextRetryAt, 'nextRetryAt should be set');
  test.isNotNull(job.lastError, 'lastError should be set');
  test.matches(job.lastError.message, /fail for retry/);
  test.isNotNull(job.scheduledAt, 'scheduledAt should be set for retry');
  test.isTrue(
    job.scheduledAt.getTime() > Date.now(),
    'scheduledAt should be in the future (backoff)'
  );
});

// ---------------------------------------------------------------------------
// Job exhausts all retries → terminal failure
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - retry backoff - exhausted retries marks failed', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('exhaust');
  Jobs.register({
    name,
    retries: 1,  // maxAttempts = 2
    backoff: 'fixed',
    backoffDelay: 10,
    run() { throw new Error('always fail'); },
  });

  const jobId = await Jobs.run(name, {});

  // First attempt
  await Jobs.executeNow(jobId);
  let job = await Jobs.get(jobId);
  test.equal(job.status, 'pending', 'First failure should schedule retry');

  // Promote pending→ready so we can execute again
  await Jobs._collection.updateAsync(jobId, { $set: { status: 'ready', scheduledAt: new Date() } });

  // Second attempt (should exhaust retries)
  await Jobs.executeNow(jobId);
  job = await Jobs.get(jobId);
  test.equal(job.status, 'failed', 'Should be terminally failed after exhausting retries');
  test.equal(job.attempts, 2);
  test.isNotNull(job.failedAt);
});

// ---------------------------------------------------------------------------
// FatalError skips retries even with retries > 0
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - retry backoff - FatalError skips retries immediately', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('fatal_skip');
  Jobs.register({
    name,
    retries: 10,
    run() { throw new Jobs.FatalError('fatal!'); },
  });

  const jobId = await Jobs.run(name, {});
  await Jobs.executeNow(jobId);

  const job = await Jobs.get(jobId);
  test.equal(job.status, 'failed', 'FatalError should skip retries');
  test.equal(job.attempts, 1, 'Should have only 1 attempt');
  test.isNotNull(job.failedAt);
});

// ---------------------------------------------------------------------------
// Retry of cancelled job
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - retry backoff - retry of cancelled job works', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('retry_cancel');
  Jobs.register({
    name,
    retries: 0,
    run() { return 'ok'; },
  });

  const jobId = await Jobs.run(name, {});
  await Jobs.cancel(jobId);

  const cancelled = await Jobs.get(jobId);
  test.equal(cancelled.status, 'cancelled');

  // Retry the cancelled job
  await Jobs.retry(jobId);
  const retried = await Jobs.get(jobId);
  test.equal(retried.status, 'ready');
  test.equal(retried.attempts, 0);
  test.equal(retried.source, 'retry');
});

// ---------------------------------------------------------------------------
// Retry throws for non-existent job
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - retry backoff - retry throws for non-existent job', async function (test) {
  try {
    await Jobs.retry('nonexistent_id_' + Date.now());
    test.fail('Should have thrown');
  } catch (err) {
    test.matches(err.message, /not found/i);
  }
});

// ---------------------------------------------------------------------------
// Fixed backoff produces constant delay
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - retry backoff - fixed backoff uses constant delay', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('fixed');
  const DELAY = 10000;
  Jobs.register({
    name,
    retries: 3,
    backoff: 'fixed',
    backoffDelay: DELAY,
    run() { throw new Error('fail'); },
  });

  const before = Date.now();
  const jobId = await Jobs.run(name, {});
  await Jobs.executeNow(jobId);

  const job = await Jobs.get(jobId);
  test.equal(job.status, 'pending');

  // scheduledAt should be approximately DELAY ms from now
  const retryDelay = job.scheduledAt.getTime() - before;
  test.isTrue(retryDelay >= DELAY - 100, `Delay should be >= ${DELAY}ms (got ${retryDelay})`);
  test.isTrue(retryDelay <= DELAY + 2000, `Delay should be close to ${DELAY}ms (got ${retryDelay})`);
});

// ---------------------------------------------------------------------------
// Custom backoff function
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - retry backoff - custom backoff function is called', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  let backoffCalled = false;
  let backoffAttempt = null;

  const name = uniqueName('custom');
  Jobs.register({
    name,
    retries: 3,
    backoff(attempt, error) {
      backoffCalled = true;
      backoffAttempt = attempt;
      return 7777;
    },
    run() { throw new Error('fail'); },
  });

  const before = Date.now();
  const jobId = await Jobs.run(name, {});
  await Jobs.executeNow(jobId);

  test.isTrue(backoffCalled, 'Custom backoff function should be called');
  test.equal(backoffAttempt, 1, 'Should receive attempt number');

  const job = await Jobs.get(jobId);
  const retryDelay = job.scheduledAt.getTime() - before;
  test.isTrue(retryDelay >= 7700, 'Should use custom backoff delay');
  test.isTrue(retryDelay <= 8000, 'Should use custom backoff delay');
});

// ---------------------------------------------------------------------------
// retrying event fires on scheduled retry
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - retry backoff - retrying event fires', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  let retryingFired = false;
  let retryingJobName = null;
  let retryingNextRetryAt = null;

  const name = uniqueName('retrying_evt');
  Jobs.register({
    name,
    retries: 3,
    backoff: 'fixed',
    backoffDelay: 5000,
    run() { throw new Error('retry event test'); },
  });

  const handle = Jobs.on('retrying', function (job, error, nextRetryAt) {
    if (job.name === name) {
      retryingFired = true;
      retryingJobName = job.name;
      retryingNextRetryAt = nextRetryAt;
    }
  });

  const jobId = await Jobs.run(name, {});
  await Jobs.executeNow(jobId);

  // Give event handlers a tick to fire
  await new Promise(r => setTimeout(r, 100));

  test.isTrue(retryingFired, 'retrying event should fire');
  test.equal(retryingJobName, name);
  test.isNotNull(retryingNextRetryAt, 'nextRetryAt should be passed to event');
  test.isTrue(retryingNextRetryAt instanceof Date);

  handle.stop();
});
