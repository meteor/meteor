/**
 * @module jobs/tests/cancel-comprehensive-test
 * @summary Tests for cancel edge cases, cancelled event, and cancel lifecycle.
 */

const { Jobs } = require('meteor/jobs');

let _seq = 0;
function uniqueName(prefix) {
  return `test_cancel_${prefix}_${++_seq}_${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Cancel pending job
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - cancel - cancels pending job', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('pending');
  Jobs.register({ name, run() { return 'ok'; } });

  const jobId = await Jobs.run(name, {}, { delay: 60000 });
  const before = await Jobs.get(jobId);
  test.equal(before.status, 'pending');

  const result = await Jobs.cancel(jobId);
  test.isTrue(result, 'Should return true');

  const after = await Jobs.get(jobId);
  test.equal(after.status, 'cancelled');
  test.isNotNull(after.cancelledAt);
  test.isTrue(after.cancelledAt instanceof Date);
});

// ---------------------------------------------------------------------------
// Cancel ready job
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - cancel - cancels ready job', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('ready');
  Jobs.register({ name, run() { return 'ok'; } });

  const jobId = await Jobs.run(name, {});
  const before = await Jobs.get(jobId);
  test.equal(before.status, 'ready');

  const result = await Jobs.cancel(jobId);
  test.isTrue(result);

  const after = await Jobs.get(jobId);
  test.equal(after.status, 'cancelled');
  test.isNotNull(after.cancelledAt);
});

// ---------------------------------------------------------------------------
// Cancel already-completed job returns false
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - cancel - returns false for completed job', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('completed');
  Jobs.register({ name, retries: 0, run() { return 'done'; } });

  const jobId = await Jobs.run(name, {});
  await Jobs.executeNow(jobId);

  const result = await Jobs.cancel(jobId);
  test.isFalse(result, 'Should return false for already-completed job');
});

// ---------------------------------------------------------------------------
// Cancel already-failed job returns false
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - cancel - returns false for failed job', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('failed');
  Jobs.register({ name, retries: 0, run() { throw new Error('fail'); } });

  const jobId = await Jobs.run(name, {});
  await Jobs.executeNow(jobId);

  const result = await Jobs.cancel(jobId);
  test.isFalse(result, 'Should return false for already-failed job');
});

// ---------------------------------------------------------------------------
// Cancel already-cancelled job returns false
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - cancel - returns false for already-cancelled job', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('re_cancel');
  Jobs.register({ name, run() { return 'ok'; } });

  const jobId = await Jobs.run(name, {});
  await Jobs.cancel(jobId);

  const result = await Jobs.cancel(jobId);
  test.isFalse(result, 'Should return false for already-cancelled job');
});

// ---------------------------------------------------------------------------
// Cancelled event fires
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - cancel - cancelled event fires', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('cancel_evt');
  Jobs.register({ name, run() { return 'ok'; } });

  let resolveCancelled;
  let timer;
  const cancelledPromise = new Promise((resolve, reject) => {
    resolveCancelled = resolve;
    timer = setTimeout(() => reject(new Error('cancelled event did not fire within 2s')), 2000);
  });

  const handle = Jobs.on('cancelled', function (job) {
    if (job.name === name) {
      resolveCancelled(job);
    }
  });

  try {
    const jobId = await Jobs.run(name, {});
    await Jobs.cancel(jobId);

    const job = await cancelledPromise;
    test.equal(job._id, jobId);
  } finally {
    clearTimeout(timer);
    handle.stop();
  }
});

// ---------------------------------------------------------------------------
// Cancel clears dedup key
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - cancel - clears dedup key on cancellation', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('cancel_dedup');
  Jobs.register({
    name,
    unique(data) { return data.key; },
    onDuplicate: 'error',
    run() { return 'ok'; },
  });

  const id1 = await Jobs.run(name, { key: 'cd1' });
  await Jobs.cancel(id1);

  // After cancel, should be able to enqueue with same dedup key
  const id2 = await Jobs.run(name, { key: 'cd1' });
  test.notEqual(id1, id2, 'New job should be created after cancel cleared dedup key');

  await Jobs.cancel(id2);
});
