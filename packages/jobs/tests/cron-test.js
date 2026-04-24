/**
 * @module jobs/tests/cron-test
 * @summary Tests for cron scheduling: fire time insertion, dedup key format,
 * missed run detection, scheduler start/stop, and timezone warning.
 */

const { Jobs } = require('meteor/jobs');

let _seq = 0;
function uniqueName(prefix) {
  return `test_cron_${prefix}_${++_seq}_${Date.now()}`;
}

// Reset config and registry before cron tests to ensure clean state.
Jobs._resetConfig();
Jobs._resetRegistry();
Jobs.configure({ testMode: 'manual' });

// ---------------------------------------------------------------------------
// Cron job insertion at fire time
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - cron - inserts a job document at fire time', async function (test) {
  Jobs._resetConfig();
  Jobs._resetRegistry();
  Jobs.configure({ testMode: 'manual' });

  const { Random } = require('meteor/random');
  const name = uniqueName('fire');
  Jobs.register({
    name,
    schedule: '* * * * *',
    timezone: 'UTC',
    missedRun: 'run-once',
    run() { return 'ok'; },
  });

  // Seed a pretend prior cron run two minutes in the past. _startCron's
  // detectMissedRuns will compute the next fire time after this timestamp,
  // see that it is already in the past, and synchronously insert a
  // catch-up cron-sourced document — giving this test a deterministic
  // assertion target without waiting on a minute-boundary timer.
  const priorRun = new Date(Date.now() - 2 * 60 * 1000);
  await Jobs._collection.insertAsync({
    _id: Random.id(),
    name,
    status: 'completed',
    source: 'cron',
    data: {},
    scheduledAt: priorRun,
    cronSchedule: '* * * * *',
    timezone: 'UTC',
    dedupKey: `cron:${name}:${priorRun.toISOString()}`,
    result: null,
    offload: false,
    priority: 0,
    timeout: 300000,
    attempts: 1,
    maxAttempts: 1,
    lastError: null,
    nextRetryAt: null,
    onDuplicate: null,
    claimedBy: null,
    claimedAt: null,
    heartbeatAt: null,
    createdAt: priorRun,
    startedAt: null,
    completedAt: new Date(),
    failedAt: null,
    runId: null,
  });

  try {
    await Jobs._startCron();

    const catchUp = await Jobs._collection.findOneAsync({
      name,
      source: 'cron',
      scheduledAt: { $gt: priorRun },
    });
    test.isNotNull(catchUp, 'a cron-sourced catch-up document should exist');
    test.equal(catchUp && catchUp.status, 'ready');
  } finally {
    Jobs._stopCron();
    await Jobs._collection.removeAsync({ name });
  }
});

// ---------------------------------------------------------------------------
// Dedup key format
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - cron - dedup key format is cron:{name}:{isoTime}', async function (test) {
  Jobs._resetConfig();
  Jobs._resetRegistry();
  Jobs.configure({ testMode: 'manual' });

  const { Random } = require('meteor/random');
  const name = uniqueName('dedup');
  Jobs.register({
    name,
    schedule: '0 0 * * *', // Daily at midnight UTC
    timezone: 'UTC',
    missedRun: 'run-once',
    run() { return 'ok'; },
  });

  // Seed a prior midnight-UTC run three days ago so detectMissedRuns will
  // compute the next fire time (the following midnight) and insert a
  // catch-up document. Asserting against *that* scheduler-generated
  // document validates the real dedup-key producer, not our own input.
  const priorRun = new Date();
  priorRun.setUTCHours(0, 0, 0, 0);
  priorRun.setUTCDate(priorRun.getUTCDate() - 3);

  await Jobs._collection.insertAsync({
    _id: Random.id(),
    name,
    status: 'completed',
    source: 'cron',
    data: {},
    scheduledAt: priorRun,
    cronSchedule: '0 0 * * *',
    timezone: 'UTC',
    dedupKey: `cron:${name}:${priorRun.toISOString()}`,
    result: null,
    offload: false,
    priority: 0,
    timeout: 300000,
    attempts: 1,
    maxAttempts: 1,
    lastError: null,
    nextRetryAt: null,
    onDuplicate: null,
    claimedBy: null,
    claimedAt: null,
    heartbeatAt: null,
    createdAt: priorRun,
    startedAt: null,
    completedAt: new Date(),
    failedAt: null,
    runId: null,
  });

  try {
    await Jobs._startCron();

    const inserted = await Jobs._collection.findOneAsync({
      name,
      source: 'cron',
      scheduledAt: { $gt: priorRun },
    });
    test.isNotNull(inserted, 'scheduler should have inserted a catch-up doc');
    test.equal(
      inserted.dedupKey,
      `cron:${name}:${inserted.scheduledAt.toISOString()}`,
      'dedup key must be cron:{name}:{scheduledAt-ISO}'
    );
    test.matches(
      inserted.dedupKey,
      /^cron:.+:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
  } finally {
    Jobs._stopCron();
    await Jobs._collection.removeAsync({ name });
  }
});

// ---------------------------------------------------------------------------
// stopCronScheduler cancels timers
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - cron - stopCronScheduler cancels timers', async function (test) {
  Jobs._resetConfig();
  Jobs._resetRegistry();
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('stop');
  Jobs.register({
    name,
    schedule: '* * * * *',
    timezone: 'UTC',
    run() { return 'ok'; },
  });

  await Jobs._startCron();

  // The cron module's timer Map is module-private, so observe behaviour
  // through clearTimeout. The first stop must clear the armed timer(s);
  // the second stop must not clear anything further (no double-clearing of
  // already-freed handles).
  const originalClearTimeout = global.clearTimeout;
  let clearTimeoutCalls = 0;
  global.clearTimeout = function (handle) {
    clearTimeoutCalls++;
    return originalClearTimeout(handle);
  };

  try {
    const baseline = clearTimeoutCalls;
    Jobs._stopCron();
    const afterFirstStop = clearTimeoutCalls;
    Jobs._stopCron();
    const afterSecondStop = clearTimeoutCalls;

    test.isTrue(
      afterFirstStop > baseline,
      'first stop should cancel at least one timer'
    );
    test.equal(
      afterSecondStop,
      afterFirstStop,
      'second stop must not attempt to clear already-cleared timers'
    );
  } finally {
    global.clearTimeout = originalClearTimeout;
  }
});

// ---------------------------------------------------------------------------
// Timezone warning when no timezone set
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - cron - warns when no timezone set', async function (test) {
  Jobs._resetConfig();
  Jobs._resetRegistry();
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('tz_warn');

  Jobs.register({
    name,
    schedule: '0 0 * * *',
    // No timezone set intentionally
    run() { return 'ok'; },
  });

  const originalWarn = console.warn;
  const warnCalls = [];
  console.warn = (...args) => { warnCalls.push(args); };

  try {
    await Jobs._startCron();
    Jobs._stopCron();
  } finally {
    console.warn = originalWarn;
  }

  const match = warnCalls.find(
    args => typeof args[0] === 'string' && args[0].includes(`"${name}"`)
  );
  test.isTrue(match, 'console.warn should be called for the un-timezoned job');
  test.matches(match[0], /no timezone set/i);
});
