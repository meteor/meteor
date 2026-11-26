/**
 * @module jobs/tests/enqueue-scheduling-test
 * @summary Tests for enqueue with delay/scheduledAt, cancelAllJobs, and
 * scheduling edge cases.
 */

const { Jobs } = require('meteor/jobs');

let _seq = 0;
function uniqueName(prefix) {
  return `test_ensched_${prefix}_${++_seq}_${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Enqueue with delay (number)
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - enqueue - delay as number creates pending job', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('delay_num');
  Jobs.register({ name, run() { return 'ok'; } });

  const jobId = await Jobs.run(name, {}, { delay: 60000 });
  const job = await Jobs.get(jobId);

  test.equal(job.status, 'pending', 'Job with future delay should be pending');
  test.isTrue(
    job.scheduledAt.getTime() > Date.now(),
    'scheduledAt should be in the future'
  );

  // Clean up
  await Jobs.cancel(jobId);
});

// ---------------------------------------------------------------------------
// Enqueue with delay (string)
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - enqueue - delay as string is parsed by ms package', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('delay_str');
  Jobs.register({ name, run() { return 'ok'; } });

  const before = Date.now();
  const jobId = await Jobs.run(name, {}, { delay: '1h' });
  const job = await Jobs.get(jobId);

  test.equal(job.status, 'pending');
  // scheduledAt should be approximately 1 hour from now
  const diff = job.scheduledAt.getTime() - before;
  test.isTrue(diff >= 3600000 - 100, 'scheduledAt should be ~1h in the future');
  test.isTrue(diff <= 3600000 + 1000, 'scheduledAt should not be too far ahead');

  await Jobs.cancel(jobId);
});

// ---------------------------------------------------------------------------
// Enqueue with scheduledAt
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - enqueue - scheduledAt creates pending job at exact time', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('sched_at');
  Jobs.register({ name, run() { return 'ok'; } });

  const futureDate = new Date(Date.now() + 120000); // 2 minutes from now
  const jobId = await Jobs.run(name, {}, { scheduledAt: futureDate });
  const job = await Jobs.get(jobId);

  test.equal(job.status, 'pending');
  test.equal(job.scheduledAt.getTime(), futureDate.getTime());

  await Jobs.cancel(jobId);
});

Tinytest.addAsync('jobs - enqueue - scheduledAt in the past creates ready job', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('sched_past');
  Jobs.register({ name, run() { return 'ok'; } });

  const pastDate = new Date(Date.now() - 10000); // 10 seconds ago
  const jobId = await Jobs.run(name, {}, { scheduledAt: pastDate });
  const job = await Jobs.get(jobId);

  test.equal(job.status, 'ready', 'Past scheduledAt should create ready job');

  await Jobs.cancel(jobId);
});

// ---------------------------------------------------------------------------
// Error: both delay and scheduledAt
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - enqueue - throws when both delay and scheduledAt provided', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('both');
  Jobs.register({ name, run() { return 'ok'; } });

  try {
    await Jobs.run(name, {}, { delay: 5000, scheduledAt: new Date() });
    test.fail('Should have thrown');
  } catch (err) {
    test.matches(err.message, /mutually exclusive/i);
  }
});

// ---------------------------------------------------------------------------
// Error: invalid delay string
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - enqueue - throws on invalid delay string', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('bad_delay');
  Jobs.register({ name, run() { return 'ok'; } });

  try {
    await Jobs.run(name, {}, { delay: 'not-a-duration' });
    test.fail('Should have thrown');
  } catch (err) {
    test.matches(err.message, /parse.*delay/i);
  }
});

// ---------------------------------------------------------------------------
// Error: invalid scheduledAt
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - enqueue - throws on invalid scheduledAt', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('bad_sched');
  Jobs.register({ name, run() { return 'ok'; } });

  try {
    await Jobs.run(name, {}, { scheduledAt: 'not-a-date' });
    test.fail('Should have thrown');
  } catch (err) {
    test.matches(err.message, /scheduledAt.*Date/i);
  }
});

// ---------------------------------------------------------------------------
// Error: non-object data
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - enqueue - throws on non-object data', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('bad_data');
  Jobs.register({ name, run() { return 'ok'; } });

  try {
    await Jobs.run(name, 'string-data');
    test.fail('Should have thrown');
  } catch (err) {
    test.matches(err.message, /data.*object/i);
  }
});

// ---------------------------------------------------------------------------
// No delay/scheduledAt → immediate (ready)
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - enqueue - no scheduling options creates ready job', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('immediate');
  Jobs.register({ name, run() { return 'ok'; } });

  const jobId = await Jobs.run(name, {});
  const job = await Jobs.get(jobId);

  test.equal(job.status, 'ready', 'No delay should create ready job');
  test.isTrue(
    Math.abs(job.scheduledAt.getTime() - Date.now()) < 2000,
    'scheduledAt should be approximately now'
  );

  await Jobs.cancel(jobId);
});

// ---------------------------------------------------------------------------
// cancelAllJobs
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - enqueue - cancelAllJobs cancels multiple jobs', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('cancel_all');
  Jobs.register({ name, run() { return 'ok'; } });

  const id1 = await Jobs.run(name, { n: 1 });
  const id2 = await Jobs.run(name, { n: 2 });
  const id3 = await Jobs.run(name, { n: 3 });

  const count = await Jobs.cancelAll(name);
  test.equal(count, 3, 'Should cancel all 3 jobs');

  const job1 = await Jobs.get(id1);
  const job2 = await Jobs.get(id2);
  const job3 = await Jobs.get(id3);
  test.equal(job1.status, 'cancelled');
  test.equal(job2.status, 'cancelled');
  test.equal(job3.status, 'cancelled');
});

Tinytest.addAsync('jobs - enqueue - cancelAllJobs returns 0 when no jobs match', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const count = await Jobs.cancelAll('nonexistent_job_type_xyz_' + Date.now());
  test.equal(count, 0);
});

Tinytest.addAsync('jobs - enqueue - cancelAllJobs throws on empty name', async function (test) {
  try {
    await Jobs.cancelAll('');
    test.fail('Should have thrown');
  } catch (err) {
    test.matches(err.message, /name/i);
  }
});

Tinytest.addAsync('jobs - enqueue - cancelAllJobs does not affect completed jobs', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('cancel_skip');
  Jobs.register({ name, retries: 0, run() { return 'done'; } });

  const id1 = await Jobs.run(name, {});
  await Jobs.executeNow(id1); // completes
  const id2 = await Jobs.run(name, {});

  const count = await Jobs.cancelAll(name);
  test.equal(count, 1, 'Should only cancel the active job');

  const completed = await Jobs.get(id1);
  const cancelled = await Jobs.get(id2);
  test.equal(completed.status, 'completed');
  test.equal(cancelled.status, 'cancelled');
});
