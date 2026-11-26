/**
 * @module jobs/tests/events-comprehensive-test
 * @summary Tests for all lifecycle events and event edge cases.
 */

const { Jobs } = require('meteor/jobs');

let _seq = 0;
function uniqueName(prefix) {
  return `test_evts_${prefix}_${++_seq}_${Date.now()}`;
}

// ---------------------------------------------------------------------------
// enqueued event fires on enqueue
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - events - enqueued event fires on Jobs.run()', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  let enqueuedFired = false;
  let enqueuedDoc = null;

  const name = uniqueName('enqueued');
  Jobs.register({ name, run() { return 'ok'; } });

  const handle = Jobs.on('enqueued', function (doc) {
    if (doc.name === name) {
      enqueuedFired = true;
      enqueuedDoc = doc;
    }
  });

  const jobId = await Jobs.run(name, { payload: 1 });
  await new Promise(r => setTimeout(r, 100));

  test.isTrue(enqueuedFired, 'enqueued event should fire');
  test.equal(enqueuedDoc._id, jobId);
  test.equal(enqueuedDoc.name, name);
  test.equal(enqueuedDoc.status, 'ready');

  handle.stop();
  await Jobs.cancel(jobId);
});

// ---------------------------------------------------------------------------
// started event fires on execution
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - events - started event fires on execution', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  let startedFired = false;
  let startedJobName = null;

  const name = uniqueName('started');
  Jobs.register({ name, retries: 0, run() { return 'ok'; } });

  const handle = Jobs.on('started', function (job) {
    if (job.name === name) {
      startedFired = true;
      startedJobName = job.name;
    }
  });

  const jobId = await Jobs.run(name, {});
  await Jobs.executeNow(jobId);
  await new Promise(r => setTimeout(r, 100));

  test.isTrue(startedFired, 'started event should fire');
  test.equal(startedJobName, name);

  handle.stop();
});

// ---------------------------------------------------------------------------
// completed event receives job with result
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - events - completed event receives job with result', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  let eventJob = null;

  const name = uniqueName('completed_result');
  Jobs.register({ name, retries: 0, run() { return 'completed-value'; } });

  const handle = Jobs.on('completed', function (job) {
    if (job.name === name) {
      eventJob = job;
    }
  });

  const jobId = await Jobs.run(name, {});
  await Jobs.executeNow(jobId);
  await new Promise(r => setTimeout(r, 100));

  test.isNotNull(eventJob, 'completed event should fire');
  test.equal(eventJob.status, 'completed');
  test.equal(eventJob.result, 'completed-value');

  handle.stop();
});

// ---------------------------------------------------------------------------
// failed event receives job with lastError
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - events - failed event receives job with lastError', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  let eventJob = null;

  const name = uniqueName('failed_result');
  Jobs.register({
    name,
    retries: 0,
    run() { throw new Error('event fail test'); },
  });

  const handle = Jobs.on('failed', function (job) {
    if (job.name === name) {
      eventJob = job;
    }
  });

  const jobId = await Jobs.run(name, {});
  await Jobs.executeNow(jobId);
  await new Promise(r => setTimeout(r, 100));

  test.isNotNull(eventJob, 'failed event should fire');
  test.equal(eventJob.status, 'failed');
  test.isNotNull(eventJob.lastError);
  test.matches(eventJob.lastError.message, /event fail test/);

  handle.stop();
});

// ---------------------------------------------------------------------------
// cancelled event fires with correct job data
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - events - cancelled event includes job data', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  let eventJob = null;

  const name = uniqueName('cancelled_data');
  Jobs.register({ name, run() { return 'ok'; } });

  const handle = Jobs.on('cancelled', function (job) {
    if (job.name === name) {
      eventJob = job;
    }
  });

  const jobId = await Jobs.run(name, { myField: 'test' });
  await Jobs.cancel(jobId);
  await new Promise(r => setTimeout(r, 100));

  test.isNotNull(eventJob, 'cancelled event should fire');
  test.equal(eventJob.status, 'cancelled');
  test.equal(eventJob._id, jobId);

  handle.stop();
});

// ---------------------------------------------------------------------------
// Multiple listeners on same event all fire
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - events - multiple listeners on same event all fire', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  let count1 = 0;
  let count2 = 0;

  const name = uniqueName('multi_listen');
  Jobs.register({ name, retries: 0, run() { return 'ok'; } });

  const handle1 = Jobs.on('completed', function (job) {
    if (job.name === name) count1++;
  });
  const handle2 = Jobs.on('completed', function (job) {
    if (job.name === name) count2++;
  });

  const jobId = await Jobs.run(name, {});
  await Jobs.executeNow(jobId);
  await new Promise(r => setTimeout(r, 100));

  test.equal(count1, 1, 'First listener should fire');
  test.equal(count2, 1, 'Second listener should fire');

  handle1.stop();
  handle2.stop();
});

// ---------------------------------------------------------------------------
// Stopped handle doesn't fire
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - events - stopped handle does not fire', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  let fired = false;

  const name = uniqueName('stopped');
  Jobs.register({ name, retries: 0, run() { return 'ok'; } });

  const handle = Jobs.on('completed', function (job) {
    if (job.name === name) fired = true;
  });
  handle.stop();

  const jobId = await Jobs.run(name, {});
  await Jobs.executeNow(jobId);
  await new Promise(r => setTimeout(r, 100));

  test.isFalse(fired, 'Stopped handle should not fire');
});

// ---------------------------------------------------------------------------
// Error in event handler doesn't break other handlers
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - events - error in one handler does not break others', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  let secondFired = false;

  const name = uniqueName('err_handler');
  Jobs.register({ name, retries: 0, run() { return 'ok'; } });

  const handle1 = Jobs.on('completed', function (job) {
    if (job.name === name) throw new Error('handler crash');
  });
  const handle2 = Jobs.on('completed', function (job) {
    if (job.name === name) secondFired = true;
  });

  const jobId = await Jobs.run(name, {});
  await Jobs.executeNow(jobId);
  await new Promise(r => setTimeout(r, 100));

  test.isTrue(secondFired, 'Second handler should still fire despite first handler error');

  handle1.stop();
  handle2.stop();
});

// ---------------------------------------------------------------------------
// All valid event names are accepted
// ---------------------------------------------------------------------------

Tinytest.add('jobs - events - all valid event names are accepted', function (test) {
  const validEvents = [
    'enqueued', 'started', 'completed', 'failed',
    'cancelled', 'retrying', 'stalled',
    'leader.acquired', 'leader.lost',
  ];

  const handles = [];
  for (const event of validEvents) {
    const handle = Jobs.on(event, function () {});
    test.isNotUndefined(handle, `${event} should return a handle`);
    test.equal(typeof handle.stop, 'function', `${event} handle should have stop()`);
    handles.push(handle);
  }

  // Clean up
  for (const h of handles) h.stop();
});
