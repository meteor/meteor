/**
 * @module jobs/tests/retry-test
 * @summary Tests for FatalError skipping retries and Jobs.retry() API.
 */

const { Jobs } = require('meteor/jobs');

let _seq = 0;
function uniqueName(prefix) {
  return `test_retry_${prefix}_${++_seq}_${Date.now()}`;
}

Tinytest.add('jobs - retry - FatalError is a proper Error subclass', function (test) {
  const err = new Jobs.FatalError('fatal test');
  test.isTrue(err instanceof Error, 'FatalError should be an Error');
  test.isTrue(err instanceof Jobs.FatalError, 'Should be instanceof FatalError');
  test.equal(err.message, 'fatal test');
  test.equal(err.name, 'Jobs.FatalError');
});

Tinytest.addAsync('jobs - retry - FatalError skips retries (inline mode)', async function (test) {
  Jobs.configure({ testMode: 'inline' });

  const name = uniqueName('fatal');
  Jobs.register({
    name,
    retries: 5,
    run() {
      throw new Jobs.FatalError('no retries');
    },
  });

  try {
    await Jobs.run(name, {});
    test.fail('Should have thrown');
  } catch (err) {
    // In inline mode, the FatalError propagates directly
    test.isTrue(err instanceof Jobs.FatalError, 'Should be a FatalError');
    test.matches(err.message, /no retries/);
  }
});

Tinytest.addAsync('jobs - retry - Jobs.retry() throws on non-failed job', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('retry_nonfailed');
  Jobs.register({
    name,
    run() { return 'ok'; },
  });

  // Enqueue a job (it will stay in 'ready' status in manual mode)
  const jobId = await Jobs.run(name, {});

  try {
    await Jobs.retry(jobId);
    test.fail('Should have thrown');
  } catch (err) {
    test.matches(err.message, /failed|cancelled/i);
  }

  // Clean up
  await Jobs.cancel(jobId);
});

Tinytest.addAsync('jobs - retry - Jobs.retry() succeeds on failed job', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('retry_ok');
  Jobs.register({
    name,
    retries: 0,
    run() { throw new Error('fail'); },
  });

  // Enqueue and execute to create a failed job
  const jobId = await Jobs.run(name, {});
  await Jobs.executeNow(jobId);

  const failedJob = await Jobs.get(jobId);
  test.equal(failedJob.status, 'failed');

  // Retry it
  const retryResult = await Jobs.retry(jobId);
  test.equal(retryResult, jobId);

  const retriedJob = await Jobs.get(jobId);
  test.equal(retriedJob.status, 'ready');
  test.equal(retriedJob.attempts, 0);
  test.equal(retriedJob.source, 'retry');
});
