/**
 * @module jobs/tests/lifecycle-test
 * @summary Tests for lifecycle events (on/emit).
 */

const { Jobs } = require('meteor/jobs');

let _seq = 0;
function uniqueName(prefix) {
  return `test_lc_${prefix}_${++_seq}_${Date.now()}`;
}

Tinytest.addAsync('jobs - lifecycle - events fire for completed jobs', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('complete_evt');
  Jobs.register({
    name,
    retries: 0,
    run() { return 'done'; },
  });

  let completedFired = false;
  const handle = Jobs.on('completed', function (job) {
    if (job.name === name) {
      completedFired = true;
    }
  });

  const jobId = await Jobs.run(name, {});
  await Jobs.executeNow(jobId);

  // Give event handlers a tick to fire
  await new Promise(r => setTimeout(r, 50));

  test.isTrue(completedFired, 'completed event should have fired');
  handle.stop();
});

Tinytest.addAsync('jobs - lifecycle - events fire for failed jobs', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('fail_evt');
  Jobs.register({
    name,
    retries: 0,
    run() { throw new Error('test failure'); },
  });

  let failedFired = false;
  const handle = Jobs.on('failed', function (job) {
    if (job.name === name) {
      failedFired = true;
    }
  });

  const jobId = await Jobs.run(name, {});
  await Jobs.executeNow(jobId);

  await new Promise(r => setTimeout(r, 50));

  test.isTrue(failedFired, 'failed event should have fired');
  handle.stop();
});

Tinytest.addAsync('jobs - lifecycle - onComplete per-type hook fires', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  let hookCalled = false;
  let hookResult = null;

  const name = uniqueName('oncomplete');
  Jobs.register({
    name,
    retries: 0,
    onComplete(result, job) {
      hookCalled = true;
      hookResult = result;
    },
    run() { return 42; },
  });

  const jobId = await Jobs.run(name, {});
  await Jobs.executeNow(jobId);

  await new Promise(r => setTimeout(r, 50));

  test.isTrue(hookCalled, 'onComplete hook should have fired');
  test.equal(hookResult, 42);
});

Tinytest.addAsync('jobs - lifecycle - onFailure per-type hook fires', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  let hookCalled = false;
  let hookError = null;

  const name = uniqueName('onfailure');
  Jobs.register({
    name,
    retries: 0,
    onFailure(err, job) {
      hookCalled = true;
      hookError = err;
    },
    run() { throw new Error('hook test'); },
  });

  const jobId = await Jobs.run(name, {});
  await Jobs.executeNow(jobId);

  await new Promise(r => setTimeout(r, 50));

  test.isTrue(hookCalled, 'onFailure hook should have fired');
  test.matches(hookError.message, /hook test/);
});

Tinytest.addAsync('jobs - lifecycle - event handle stop() unregisters callback', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('stop_handle');
  Jobs.register({ name, retries: 0, run() { return 'ok'; } });

  let stoppedCount = 0;
  const stoppedHandle = Jobs.on('completed', function (job) {
    if (job.name === name) stoppedCount++;
  });
  test.equal(typeof stoppedHandle.stop, 'function');
  stoppedHandle.stop();

  // Independent listener verifies the completed event actually fires for this
  // job — otherwise a silent regression in emit/executeNow would make the
  // stoppedCount assertion trivially pass.
  let witnessFired = false;
  const witness = Jobs.on('completed', function (job) {
    if (job.name === name) witnessFired = true;
  });

  try {
    const jobId = await Jobs.run(name, {});
    await Jobs.executeNow(jobId);
    await new Promise(r => setTimeout(r, 50));

    test.isTrue(witnessFired, 'completed event should have fired for this job');
    test.equal(stoppedCount, 0, 'stopped listener must not have been called');
  } finally {
    witness.stop();
  }
});
