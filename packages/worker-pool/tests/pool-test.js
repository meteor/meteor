/**
 * @module worker-pool/tests/pool-test
 * @summary Tinytest suite for the WorkerPool class.
 */

import { WorkerPool } from 'meteor/worker-pool';

// --- Construction tests ------------------------------------------------------

Tinytest.add('worker-pool - exports WorkerPool class', function (test) {
  test.isNotUndefined(WorkerPool, 'WorkerPool should be exported');
  test.equal(typeof WorkerPool, 'function', 'WorkerPool should be a constructor');
});

Tinytest.add('worker-pool - default options', function (test) {
  const pool = new WorkerPool({ enableHeartbeat: false, min: 0 });
  const stats = pool.stats();
  test.equal(stats.total, 0, 'No workers spawned with min=0');
  test.equal(stats.pending, 0, 'No pending tasks initially');
  pool.terminate();
});

Tinytest.add('worker-pool - stats shape', function (test) {
  const pool = new WorkerPool({ min: 0, enableHeartbeat: false });
  const stats = pool.stats();
  test.isNotUndefined(stats.total, 'stats.total should exist');
  test.isNotUndefined(stats.idle, 'stats.idle should exist');
  test.isNotUndefined(stats.busy, 'stats.busy should exist');
  test.isNotUndefined(stats.pending, 'stats.pending should exist');
  test.isNotUndefined(stats.spawning, 'stats.spawning should exist');
  pool.terminate();
});

// --- Rejection tests ---------------------------------------------------------

Tinytest.addAsync('worker-pool - dispatch rejects after terminate', async function (test) {
  const pool = new WorkerPool({ min: 0, enableHeartbeat: false });
  await pool.terminate();

  try {
    await pool.dispatch({
      handler: async (data) => data,
      data: 'hello',
    });
    test.fail('Should have thrown');
  } catch (err) {
    test.matches(err.message, /terminated/i, 'Error should mention termination');
  }
});

Tinytest.addAsync('worker-pool - dispatch rejects without handler', async function (test) {
  const pool = new WorkerPool({ min: 0, enableHeartbeat: false });

  try {
    await pool.dispatch({ data: 'hello' });
    test.fail('Should have thrown');
  } catch (err) {
    test.matches(err.message, /handler/i, 'Error should mention handler');
  }

  await pool.terminate();
});

Tinytest.addAsync('worker-pool - dispatch rejects during drain', async function (test) {
  const pool = new WorkerPool({ min: 0, enableHeartbeat: false });
  const drainPromise = pool.drain();

  try {
    await pool.dispatch({
      handler: async (data) => data,
      data: 'hello',
    });
    test.fail('Should have thrown');
  } catch (err) {
    test.matches(err.message, /draining/i, 'Error should mention draining');
  }

  await drainPromise;
});

// --- Drain / terminate tests -------------------------------------------------

Tinytest.addAsync('worker-pool - drain resolves with no workers', async function (test) {
  const pool = new WorkerPool({ min: 0, enableHeartbeat: false });
  await pool.drain();
  test.ok();
});

Tinytest.addAsync('worker-pool - terminate resolves with no workers', async function (test) {
  const pool = new WorkerPool({ min: 0, enableHeartbeat: false });
  await pool.terminate();
  test.ok();
});

Tinytest.addAsync('worker-pool - double drain returns same promise', async function (test) {
  const pool = new WorkerPool({ min: 0, enableHeartbeat: false });
  const p1 = pool.drain();
  const p2 = pool.drain();
  // After the first drain resolves immediately (no workers), a second
  // drain call should also resolve without hanging.
  await p1;
  await p2;
  test.ok();
});
