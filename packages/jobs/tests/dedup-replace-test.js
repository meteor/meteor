/**
 * @module jobs/tests/dedup-replace-test
 * @summary Tests for deduplication replace policy and dedup key lifecycle.
 */

const { Jobs } = require('meteor/jobs');

let _seq = 0;
function uniqueName(prefix) {
  return `test_dedup_repl_${prefix}_${++_seq}_${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Replace policy: pending/ready job gets updated
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - dedup replace - replaces pending/ready job data', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('replace');
  Jobs.register({
    name,
    unique(data) { return data.key; },
    onDuplicate: 'replace',
    run() { return 'ok'; },
  });

  const id1 = await Jobs.run(name, { key: 'r1', value: 'original' });
  const id2 = await Jobs.run(name, { key: 'r1', value: 'updated' });

  // Replace returns the existing job ID
  test.equal(id1, id2, 'Replace should return existing job ID');

  // The data should be updated
  const job = await Jobs.get(id1);
  test.equal(job.data.value, 'updated', 'Data should be replaced');

  await Jobs.cancel(id1);
});

// ---------------------------------------------------------------------------
// Replace policy: running job is skipped (not replaced)
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - dedup replace - skips running job', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('replace_running');
  let resolveJob;
  const jobPromise = new Promise(r => { resolveJob = r; });

  Jobs.register({
    name,
    unique(data) { return data.key; },
    onDuplicate: 'replace',
    retries: 0,
    async run() {
      // Job will stay running until we resolve
      await jobPromise;
      return 'ok';
    },
  });

  const id1 = await Jobs.run(name, { key: 'rr1', value: 'original' });

  // Start executing (will be stuck in the handler)
  const execPromise = Jobs.executeNow(id1);

  // Give time for the job to start running
  await new Promise(r => setTimeout(r, 50));

  // Now try to enqueue a duplicate while the first is running
  const id2 = await Jobs.run(name, { key: 'rr1', value: 'updated' });

  // Running job should be skipped — returns existing ID
  test.equal(id1, id2, 'Should return existing running job ID');

  // Data should NOT be updated on a running job
  const job = await Jobs.get(id1);
  test.equal(job.data.value, 'original', 'Running job data should not be replaced');

  // Clean up: resolve the job and wait for execution to finish
  resolveJob();
  await execPromise;
});

// ---------------------------------------------------------------------------
// Dedup key cleared on completion allows re-enqueue
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - dedup replace - dedup key cleared on completion', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('clear_complete');
  Jobs.register({
    name,
    unique(data) { return data.key; },
    onDuplicate: 'error',
    retries: 0,
    run() { return 'done'; },
  });

  const id1 = await Jobs.run(name, { key: 'cc1' });
  await Jobs.executeNow(id1);

  const completed = await Jobs.get(id1);
  test.equal(completed.status, 'completed');

  // After completion, dedup key should be cleared — new enqueue should work
  const id2 = await Jobs.run(name, { key: 'cc1' });
  test.notEqual(id1, id2, 'Should get a new job ID after completion');

  await Jobs.cancel(id2);
});

// ---------------------------------------------------------------------------
// Dedup key cleared on failure allows re-enqueue
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - dedup replace - dedup key cleared on failure', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('clear_fail');
  Jobs.register({
    name,
    unique(data) { return data.key; },
    onDuplicate: 'error',
    retries: 0,
    run() { throw new Error('fail'); },
  });

  const id1 = await Jobs.run(name, { key: 'cf1' });
  await Jobs.executeNow(id1);

  const failed = await Jobs.get(id1);
  test.equal(failed.status, 'failed');

  // After failure, dedup key should be cleared
  const id2 = await Jobs.run(name, { key: 'cf1' });
  test.notEqual(id1, id2, 'Should get a new job ID after failure');

  await Jobs.cancel(id2);
});

// ---------------------------------------------------------------------------
// Replace policy: updates scheduledAt for future-scheduled replacement
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - dedup replace - updates scheduledAt on replace', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('replace_sched');
  Jobs.register({
    name,
    unique(data) { return data.key; },
    onDuplicate: 'replace',
    run() { return 'ok'; },
  });

  const id1 = await Jobs.run(name, { key: 'rs1' });
  const before = await Jobs.get(id1);
  test.equal(before.status, 'ready');

  // Replace with a future-scheduled version
  const futureDate = new Date(Date.now() + 60000);
  const id2 = await Jobs.run(name, { key: 'rs1' }, { scheduledAt: futureDate });

  test.equal(id1, id2);
  const after = await Jobs.get(id1);
  test.equal(after.status, 'pending', 'Should be pending after replacement with future date');

  await Jobs.cancel(id1);
});
