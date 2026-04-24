/**
 * @module jobs/tests/run-and-wait-test
 * @summary Tests for Jobs.runAndWait() — enqueue and wait for terminal status.
 */

const { Jobs } = require('meteor/jobs');

let _seq = 0;
function uniqueName(prefix) {
  return `test_rw_${prefix}_${++_seq}_${Date.now()}`;
}

/**
 * Poll for a ready job by name. Replaces fixed-interval sleeps so slow CI
 * doesn't produce null-deref on `job._id`.
 */
async function waitForReadyJob(name, { timeoutMs = 5000, intervalMs = 20 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await Jobs._collection.findOneAsync({ name, status: 'ready' });
    if (job) return job;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return null;
}

// ---------------------------------------------------------------------------
// runAndWait: successful job returns result
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - runAndWait - resolves with result on completion', async function (test) {
  // runAndWait needs the engine to actually execute the job.
  // We use manual mode + executeNow to simulate.
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('success');
  Jobs.register({
    name,
    retries: 0,
    run(data) { return { answer: data.x * 2 }; },
  });

  // Start runAndWait in background, then execute the job
  const waitPromise = Jobs.runAndWait(name, { x: 21 }, { waitTimeout: 5000 });

  // Give the observer a moment to set up
  await new Promise(r => setTimeout(r, 100));

  // Find the job and execute it
  const job = await Jobs._collection.findOneAsync({ name, status: 'ready' });
  test.isNotNull(job, 'Job should exist in collection');
  await Jobs.executeNow(job._id);

  const result = await waitPromise;
  test.equal(result.answer, 42);
});

// ---------------------------------------------------------------------------
// runAndWait: failed job rejects with error
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - runAndWait - rejects on failure', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('fail');
  Jobs.register({
    name,
    retries: 0,
    run() { throw new Error('runAndWait failure'); },
  });

  const waitPromise = Jobs.runAndWait(name, {}, { waitTimeout: 5000 });

  const job = await waitForReadyJob(name);
  test.isNotNull(job, 'Job should exist in collection');
  await Jobs.executeNow(job._id);

  try {
    await waitPromise;
    test.fail('Should have rejected');
  } catch (err) {
    test.matches(err.message, /runAndWait failure|failed/i);
  }
});

// ---------------------------------------------------------------------------
// runAndWait: cancelled job rejects
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - runAndWait - rejects on cancellation', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('cancel');
  Jobs.register({
    name,
    retries: 0,
    run() { return 'ok'; },
  });

  const waitPromise = Jobs.runAndWait(name, {}, { waitTimeout: 5000 });

  const job = await waitForReadyJob(name);
  test.isNotNull(job, 'Job should exist in collection');
  await Jobs.cancel(job._id);

  try {
    await waitPromise;
    test.fail('Should have rejected');
  } catch (err) {
    test.matches(err.message, /cancel/i);
  }
});

// ---------------------------------------------------------------------------
// runAndWait: timeout rejects
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - runAndWait - rejects on timeout', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('timeout');
  Jobs.register({
    name,
    retries: 0,
    run() { return 'ok'; },
  });

  // Use a very short timeout
  try {
    await Jobs.runAndWait(name, {}, { waitTimeout: 200 });
    test.fail('Should have rejected');
  } catch (err) {
    test.matches(err.message, /timed? ?out/i);
  }
});
