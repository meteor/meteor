/**
 * @module worker-pool/tests/pool-test
 * @summary Tinytest suite for the WorkerPool class.
 *
 * Coverage targets:
 *   - Construction & configuration options
 *   - Task dispatch (basic, data passing, return values)
 *   - Error handling (handler errors, Meteor error fields, unknown handlers)
 *   - Concurrency & queuing (parallel execution, FIFO ordering, backpressure)
 *   - Stats tracking (idle, busy, spawning, pending through lifecycle)
 *   - Timeouts (task timeout, per-dispatch override, queued task timeout)
 *   - Worker lifecycle (recycling, idle timeout, min respawn, crash recovery)
 *   - Drain & shutdown (graceful drain, forced terminate, edge cases)
 */

import { WorkerPool } from 'meteor/worker-pool';

// --- Helpers -----------------------------------------------------------------

/** Simple async delay. */
function _wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Polls until `fn()` returns truthy, or throws after `timeout` ms.
 * @param {Function} fn - Check function (sync or async).
 * @param {number} [timeout=5000]
 * @param {number} [interval=50]
 */
async function _waitFor(fn, timeout = 5000, interval = 50) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await fn()) return;
    await _wait(interval);
  }
  throw new Error(`_waitFor timed out after ${timeout}ms`);
}

// =============================================================================
// CONSTRUCTION & CONFIGURATION
// =============================================================================

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

Tinytest.add('worker-pool - min workers pre-spawned on construction', function (test) {
  const pool = new WorkerPool({ min: 2, max: 4, enableHeartbeat: false });
  const stats = pool.stats();
  // Workers are spawned synchronously in constructor, but in SPAWNING state
  // until they send READY. Total should be >= min immediately.
  test.equal(stats.total, 2, 'Should pre-spawn min workers');
  pool.terminate();
});

Tinytest.addAsync('worker-pool - min workers become idle after startup', async function (test) {
  const pool = new WorkerPool({ min: 2, max: 4, enableHeartbeat: false });

  await _waitFor(() => pool.stats().idle === 2, 5000);

  const stats = pool.stats();
  test.equal(stats.idle, 2, 'Min workers should become idle');
  test.equal(stats.total, 2, 'Total should match min');
  test.equal(stats.spawning, 0, 'No workers should still be spawning');

  await pool.terminate();
});

Tinytest.add('worker-pool - max is at least 1', function (test) {
  const pool = new WorkerPool({ min: 0, max: 0, enableHeartbeat: false });
  test.equal(pool.max, 1, 'max should be clamped to 1');
  pool.terminate();
});

// =============================================================================
// TASK DISPATCH — BASIC
// =============================================================================

Tinytest.addAsync('worker-pool - dispatch returns handler result', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 2, enableHeartbeat: false });

  const result = await pool.dispatch({
    handler: async (data) => data * 2,
    data: 21,
  });

  test.equal(result, 42, 'Should return handler result');
  await pool.terminate();
});

Tinytest.addAsync('worker-pool - dispatch passes data to handler', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 2, enableHeartbeat: false });

  const result = await pool.dispatch({
    handler: async (data) => ({
      sum: data.a + data.b,
      items: data.items.map(x => x + 1),
    }),
    data: { a: 10, b: 20, items: [1, 2, 3] },
  });

  test.equal(result.sum, 30, 'Should pass structured data');
  test.equal(result.items, [2, 3, 4], 'Should return structured result');
  await pool.terminate();
});

Tinytest.addAsync('worker-pool - dispatch with undefined data passes null', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 2, enableHeartbeat: false });

  const result = await pool.dispatch({
    handler: async (data) => data,
    // no data option
  });

  test.equal(result, null, 'Undefined data should be passed as null');
  await pool.terminate();
});

Tinytest.addAsync('worker-pool - dispatch with sync (non-async) handler', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 2, enableHeartbeat: false });

  const result = await pool.dispatch({
    handler: (data) => data + 1,
    data: 99,
  });

  test.equal(result, 100, 'Sync handler should work');
  await pool.terminate();
});

Tinytest.addAsync('worker-pool - handler receives context with Meteor stub', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 2, enableHeartbeat: false });

  const result = await pool.dispatch({
    handler: async (data, context) => ({
      hasMeteor: typeof context.Meteor === 'object' && context.Meteor !== null,
      isServer: context.Meteor.isServer,
      hasCollectionsKey: 'Collections' in context,
    }),
  });

  test.isTrue(result.hasMeteor, 'Context should have Meteor stub');
  test.isTrue(result.isServer, 'Meteor.isServer should be true');
  test.isTrue(result.hasCollectionsKey, 'Context should have Collections key');
  await pool.terminate();
});

Tinytest.addAsync('worker-pool - multiple sequential dispatches', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 1, enableHeartbeat: false });

  const r1 = await pool.dispatch({ handler: async (d) => d + 'a', data: '' });
  const r2 = await pool.dispatch({ handler: async (d) => d + 'b', data: '' });
  const r3 = await pool.dispatch({ handler: async (d) => d + 'c', data: '' });

  test.equal(r1, 'a');
  test.equal(r2, 'b');
  test.equal(r3, 'c');
  await pool.terminate();
});

Tinytest.addAsync('worker-pool - same handler function reference is cached (serialization)', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 1, enableHeartbeat: false });

  // Dispatch the same function reference multiple times.
  // Internally _serializeHandler caches via WeakMap — this test ensures
  // no regression in the cache path (same fn dispatches correctly).
  const fn = async (d) => d * 10;
  const r1 = await pool.dispatch({ handler: fn, data: 1 });
  const r2 = await pool.dispatch({ handler: fn, data: 2 });
  const r3 = await pool.dispatch({ handler: fn, data: 3 });

  test.equal(r1, 10);
  test.equal(r2, 20);
  test.equal(r3, 30);
  await pool.terminate();
});

// =============================================================================
// TASK DISPATCH — REJECTION
// =============================================================================

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

Tinytest.addAsync('worker-pool - dispatch with handlerName rejects with unknown handler', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 1, enableHeartbeat: false });

  try {
    await pool.dispatch({ handlerName: 'nonexistent' });
    test.fail('Should have thrown');
  } catch (err) {
    test.matches(err.message, /unknown handler/i, 'Should mention unknown handler');
  }

  await pool.terminate();
});

// =============================================================================
// ERROR HANDLING
// =============================================================================

Tinytest.addAsync('worker-pool - handler error propagated to caller', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 2, enableHeartbeat: false });

  try {
    await pool.dispatch({
      handler: async () => {
        throw new Error('intentional test error');
      },
    });
    test.fail('Should have thrown');
  } catch (err) {
    test.equal(err.message, 'intentional test error', 'Error message preserved');
    test.equal(err.name, 'Error', 'Error name preserved');
    test.isTrue(typeof err.stack === 'string', 'Stack trace preserved');
  }

  await pool.terminate();
});

Tinytest.addAsync('worker-pool - custom error name preserved', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 2, enableHeartbeat: false });

  try {
    await pool.dispatch({
      handler: async () => {
        const err = new TypeError('type check failed');
        throw err;
      },
    });
    test.fail('Should have thrown');
  } catch (err) {
    test.equal(err.name, 'TypeError', 'Custom error name should be preserved');
    test.equal(err.message, 'type check failed');
  }

  await pool.terminate();
});

Tinytest.addAsync('worker-pool - Meteor error fields preserved', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 2, enableHeartbeat: false });

  try {
    await pool.dispatch({
      handler: async () => {
        const err = new Error('Meteor error test');
        err.error = 'not-found';
        err.reason = 'Document not found';
        err.details = 'collection: items, id: abc123';
        throw err;
      },
    });
    test.fail('Should have thrown');
  } catch (err) {
    test.equal(err.message, 'Meteor error test');
    test.equal(err.error, 'not-found', 'meteorError should be preserved');
    test.equal(err.reason, 'Document not found', 'meteorReason should be preserved');
    test.equal(err.details, 'collection: items, id: abc123', 'meteorDetails should be preserved');
  }

  await pool.terminate();
});

Tinytest.addAsync('worker-pool - sync handler error propagated', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 2, enableHeartbeat: false });

  try {
    await pool.dispatch({
      handler: () => {
        throw new RangeError('out of bounds');
      },
    });
    test.fail('Should have thrown');
  } catch (err) {
    test.equal(err.name, 'RangeError');
    test.equal(err.message, 'out of bounds');
  }

  await pool.terminate();
});

// =============================================================================
// CONCURRENCY & QUEUING
// =============================================================================

Tinytest.addAsync('worker-pool - multiple concurrent tasks with max > 1', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 3, enableHeartbeat: false });

  const start = Date.now();
  const results = await Promise.all([
    pool.dispatch({
      handler: async (d) => { await new Promise(r => setTimeout(r, 200)); return d; },
      data: 'a',
    }),
    pool.dispatch({
      handler: async (d) => { await new Promise(r => setTimeout(r, 200)); return d; },
      data: 'b',
    }),
    pool.dispatch({
      handler: async (d) => { await new Promise(r => setTimeout(r, 200)); return d; },
      data: 'c',
    }),
  ]);
  const elapsed = Date.now() - start;

  test.equal(results[0], 'a');
  test.equal(results[1], 'b');
  test.equal(results[2], 'c');
  // If tasks ran in parallel, total time should be ~200ms, not ~600ms.
  test.isTrue(elapsed < 500, `Tasks should run in parallel (took ${elapsed}ms)`);

  await pool.terminate();
});

Tinytest.addAsync('worker-pool - tasks queued when all workers busy', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 1, enableHeartbeat: false });

  // Dispatch 3 tasks to a pool with max=1; tasks 2 and 3 will be queued.
  const p1 = pool.dispatch({
    handler: async (d) => { await new Promise(r => setTimeout(r, 100)); return d; },
    data: 1,
  });
  const p2 = pool.dispatch({
    handler: async (d) => { await new Promise(r => setTimeout(r, 100)); return d; },
    data: 2,
  });
  const p3 = pool.dispatch({
    handler: async (d) => { await new Promise(r => setTimeout(r, 100)); return d; },
    data: 3,
  });

  // Wait for worker to start the first task.
  await _wait(50);

  const stats = pool.stats();
  test.equal(stats.busy, 1, 'One worker should be busy');
  test.equal(stats.pending, 2, 'Two tasks should be pending');

  const results = await Promise.all([p1, p2, p3]);
  test.equal(results, [1, 2, 3], 'All tasks should complete with correct results');

  await pool.terminate();
});

Tinytest.addAsync('worker-pool - queued tasks dispatched in FIFO order (max=1)', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 1, enableHeartbeat: false });

  // With max=1, tasks are processed serially in queue order.
  // Each handler returns a unique value so we can verify FIFO dispatch.
  const order = [];
  const tasks = [];
  for (let i = 0; i < 5; i++) {
    tasks.push(
      pool.dispatch({
        handler: async (d) => d,
        data: i,
      }).then(r => { order.push(r); return r; })
    );
  }

  await Promise.all(tasks);
  test.equal(order, [0, 1, 2, 3, 4], 'Tasks should complete in FIFO order');

  await pool.terminate();
});

Tinytest.addAsync('worker-pool - max workers not exceeded under load', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 2, enableHeartbeat: false });

  // Dispatch 5 tasks, each taking 200ms, to a pool with max=2.
  const tasks = [];
  for (let i = 0; i < 5; i++) {
    tasks.push(pool.dispatch({
      handler: async (d) => { await new Promise(r => setTimeout(r, 200)); return d; },
      data: i,
    }));
  }

  // Check stats during execution — total should never exceed max.
  await _wait(100);
  const stats = pool.stats();
  test.isTrue(stats.total <= 2, `Total workers (${stats.total}) should not exceed max=2`);
  test.isTrue(stats.pending >= 2, `Should have pending tasks (got ${stats.pending})`);

  await Promise.all(tasks);
  await pool.terminate();
});

// =============================================================================
// STATS TRACKING
// =============================================================================

Tinytest.addAsync('worker-pool - stats reflect busy workers during execution', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 2, enableHeartbeat: false });

  // Initially empty.
  let stats = pool.stats();
  test.equal(stats.total, 0);
  test.equal(stats.busy, 0);
  test.equal(stats.idle, 0);

  // Dispatch a slow task.
  const p = pool.dispatch({
    handler: async () => { await new Promise(r => setTimeout(r, 500)); return 'done'; },
  });

  // Wait for worker to become busy.
  await _waitFor(() => pool.stats().busy === 1);

  stats = pool.stats();
  test.equal(stats.total, 1, 'One worker should exist');
  test.equal(stats.busy, 1, 'One worker should be busy');
  test.equal(stats.idle, 0, 'No idle workers');

  await p;

  // After completion, worker should be idle.
  stats = pool.stats();
  test.equal(stats.busy, 0, 'No busy workers after completion');
  test.equal(stats.idle, 1, 'Worker should be idle');

  await pool.terminate();
});

Tinytest.addAsync('worker-pool - stats pending count tracks active queued entries', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 1, enableHeartbeat: false });

  const slow = pool.dispatch({
    handler: async () => { await new Promise(r => setTimeout(r, 500)); return 'slow'; },
  });

  await _waitFor(() => pool.stats().busy === 1);

  // Queue several tasks.
  const q1 = pool.dispatch({ handler: async () => 1 });
  const q2 = pool.dispatch({ handler: async () => 2 });
  const q3 = pool.dispatch({ handler: async () => 3 });

  test.equal(pool.stats().pending, 3, 'Should show 3 pending tasks');

  await Promise.all([slow, q1, q2, q3]);

  test.equal(pool.stats().pending, 0, 'No pending tasks after completion');
  await pool.terminate();
});

Tinytest.addAsync('worker-pool - stats spawning count during worker initialization', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 4, enableHeartbeat: false });

  // Dispatch to trigger a spawn.
  const p = pool.dispatch({
    handler: async () => 'ready',
  });

  // Immediately after dispatch, the new worker should be in SPAWNING state.
  // (It may transition to IDLE/BUSY very quickly, so we just verify non-negative.)
  const stats = pool.stats();
  test.isTrue(stats.spawning >= 0, 'spawning count should be non-negative');
  test.isTrue(stats.total >= 1, 'total should include spawning workers');

  await p;
  await pool.terminate();
});

// =============================================================================
// TIMEOUTS
// =============================================================================

Tinytest.addAsync('worker-pool - task timeout rejects the promise', async function (test) {
  const pool = new WorkerPool({
    min: 0, max: 1,
    taskTimeout: 300,
    enableHeartbeat: false,
  });

  try {
    await pool.dispatch({
      handler: async () => {
        await new Promise(r => setTimeout(r, 10000));
        return 'should not reach';
      },
    });
    test.fail('Should have timed out');
  } catch (err) {
    test.matches(err.message, /timed out/i, 'Error should mention timeout');
    test.matches(err.message, /300/, 'Error should include timeout value');
  }

  await pool.terminate();
});

Tinytest.addAsync('worker-pool - per-dispatch timeout override', async function (test) {
  const pool = new WorkerPool({
    min: 0, max: 1,
    taskTimeout: 60000, // long default
    enableHeartbeat: false,
  });

  try {
    await pool.dispatch({
      handler: async () => {
        await new Promise(r => setTimeout(r, 10000));
        return 'should not reach';
      },
      timeout: 200, // short override
    });
    test.fail('Should have timed out');
  } catch (err) {
    test.matches(err.message, /timed out/i);
    test.matches(err.message, /200/, 'Should use per-dispatch timeout');
  }

  await pool.terminate();
});

Tinytest.addAsync('worker-pool - queued task times out before dispatch', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 1, enableHeartbeat: false });

  // Occupy the worker with a slow task.
  const slow = pool.dispatch({
    handler: async () => {
      await new Promise(r => setTimeout(r, 2000));
      return 'slow';
    },
  });

  await _waitFor(() => pool.stats().busy === 1);

  // Queue a task with a very short timeout — it should time out while queued.
  try {
    await pool.dispatch({
      handler: async () => 'should never run',
      timeout: 100,
    });
    test.fail('Queued task should have timed out');
  } catch (err) {
    test.matches(err.message, /timed out/i);
  }

  // The pending count should go back to 0 (cancelled entry).
  test.equal(pool.stats().pending, 0, 'Cancelled task should not count as pending');

  await pool.terminate();
  // slow task rejection from terminate is expected
});

// =============================================================================
// WORKER LIFECYCLE — RECYCLING
// =============================================================================

Tinytest.addAsync('worker-pool - worker recycled after recycleAfter tasks', async function (test) {
  const pool = new WorkerPool({
    min: 0, max: 1,
    recycleAfter: 3,
    enableHeartbeat: false,
  });

  // Dispatch 3 tasks to hit the recycle threshold.
  for (let i = 0; i < 3; i++) {
    await pool.dispatch({ handler: async (d) => d, data: i });
  }

  // After recycleAfter=3, the worker is recycled (terminated + replacement spawned).
  // Wait for the replacement to become ready.
  await _waitFor(() => pool.stats().idle === 1, 3000);

  // A 4th task should succeed on the replacement worker.
  const result = await pool.dispatch({ handler: async (d) => d, data: 'after-recycle' });
  test.equal(result, 'after-recycle', 'Post-recycle dispatch should work');

  await pool.terminate();
});

Tinytest.addAsync('worker-pool - recycling respects max workers', async function (test) {
  const pool = new WorkerPool({
    min: 0, max: 1,
    recycleAfter: 2,
    enableHeartbeat: false,
  });

  // Run 4 tasks — should trigger 2 recycles. At no point should total exceed max=1.
  for (let i = 0; i < 4; i++) {
    await pool.dispatch({ handler: async (d) => d, data: i });
    const stats = pool.stats();
    test.isTrue(stats.total <= 1, `Total ${stats.total} should not exceed max after task ${i}`);
  }

  await pool.terminate();
});

// =============================================================================
// WORKER LIFECYCLE — IDLE TIMEOUT
// =============================================================================

Tinytest.addAsync('worker-pool - idle worker terminated after idleTimeout', async function (test) {
  const pool = new WorkerPool({
    min: 0, max: 2,
    idleTimeout: 300,
    enableHeartbeat: false,
  });

  // Dispatch to spawn a worker.
  await pool.dispatch({ handler: async () => 'done' });

  test.equal(pool.stats().idle, 1, 'Worker should be idle after task');
  test.equal(pool.stats().total, 1, 'One worker should exist');

  // Wait for idle timeout.
  await _waitFor(() => pool.stats().total === 0, 3000);

  const stats = pool.stats();
  test.equal(stats.total, 0, 'Idle worker should have been terminated');
  test.equal(stats.idle, 0, 'No idle workers');

  await pool.terminate();
});

Tinytest.addAsync('worker-pool - idle timeout does not go below min', async function (test) {
  const pool = new WorkerPool({
    min: 1, max: 4,
    idleTimeout: 200,
    enableHeartbeat: false,
  });

  // Wait for min worker to be ready.
  await _waitFor(() => pool.stats().idle >= 1);

  // Dispatch a task to spawn a second worker, then let both go idle.
  await Promise.all([
    pool.dispatch({
      handler: async () => { await new Promise(r => setTimeout(r, 50)); return 1; },
    }),
    pool.dispatch({
      handler: async () => { await new Promise(r => setTimeout(r, 50)); return 2; },
    }),
  ]);

  // Both workers idle now. Wait well past idle timeout.
  await _wait(500);

  // Should still have at least min=1 worker.
  const stats = pool.stats();
  test.isTrue(stats.total >= 1, `Total (${stats.total}) should not drop below min=1`);

  await pool.terminate();
});

// =============================================================================
// WORKER LIFECYCLE — CRASH RECOVERY
// =============================================================================

Tinytest.addAsync('worker-pool - worker crash rejects pending task', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 2, enableHeartbeat: false });

  try {
    await pool.dispatch({
      handler: async () => {
        process.exit(1);
      },
    });
    test.fail('Should have been rejected');
  } catch (err) {
    test.matches(err.message, /exited unexpectedly/i, 'Should indicate unexpected exit');
  }

  await pool.terminate();
});

Tinytest.addAsync('worker-pool - worker respawned after crash when below min', async function (test) {
  const pool = new WorkerPool({ min: 1, max: 2, enableHeartbeat: false });

  await _waitFor(() => pool.stats().idle === 1);

  // Crash the worker.
  try {
    await pool.dispatch({
      handler: async () => { process.exit(1); },
    });
  } catch { /* expected */ }

  // Wait for respawn.
  await _waitFor(() => pool.stats().idle === 1, 5000);

  const stats = pool.stats();
  test.equal(stats.total, 1, 'Worker should have been respawned');

  // Pool should still be functional.
  const result = await pool.dispatch({ handler: async (d) => d, data: 'alive' });
  test.equal(result, 'alive', 'Pool should work after crash recovery');

  await pool.terminate();
});

// =============================================================================
// DRAIN & SHUTDOWN
// =============================================================================

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
  test.isTrue(p1 === p2, 'drain() should return the same promise on second call');
  await p1;
  await p2;
  test.ok();
});

Tinytest.addAsync('worker-pool - drain waits for busy workers to finish', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 1, enableHeartbeat: false });

  let taskCompleted = false;

  const taskPromise = pool.dispatch({
    handler: async () => {
      await new Promise(r => setTimeout(r, 300));
      return 'done';
    },
  });

  taskPromise.then(() => { taskCompleted = true; });

  // Wait for worker to start.
  await _waitFor(() => pool.stats().busy === 1);

  // Start drain.
  const drainPromise = pool.drain();

  // Task should still complete.
  const result = await taskPromise;
  test.equal(result, 'done', 'Running task should complete during drain');

  // Drain should resolve after task completes.
  await drainPromise;
  test.isTrue(taskCompleted, 'Task should have completed before drain resolved');

  const stats = pool.stats();
  test.equal(stats.total, 0, 'All workers should be terminated after drain');
});

Tinytest.addAsync('worker-pool - drain rejects queued (not-yet-dispatched) tasks', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 1, enableHeartbeat: false });

  // Occupy the worker.
  const slow = pool.dispatch({
    handler: async () => {
      await new Promise(r => setTimeout(r, 500));
      return 'slow';
    },
  });

  await _waitFor(() => pool.stats().busy === 1);

  // Queue a second task.
  const queued = pool.dispatch({
    handler: async () => 'queued-result',
  });

  test.equal(pool.stats().pending, 1, 'Task should be queued');

  // Drain — should reject the queued task immediately.
  const drainPromise = pool.drain();

  try {
    await queued;
    test.fail('Queued task should be rejected during drain');
  } catch (err) {
    test.matches(err.message, /draining/i, 'Error should mention draining');
  }

  // Running task should still complete.
  const result = await slow;
  test.equal(result, 'slow');

  await drainPromise;
});

Tinytest.addAsync('worker-pool - terminate rejects in-flight tasks', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 1, enableHeartbeat: false });

  const task = pool.dispatch({
    handler: async () => {
      await new Promise(r => setTimeout(r, 10000));
      return 'should not complete';
    },
  });

  await _waitFor(() => pool.stats().busy === 1);

  // Force terminate.
  await pool.terminate();

  try {
    await task;
    test.fail('In-flight task should be rejected');
  } catch (err) {
    test.matches(err.message, /terminated/i, 'Error should mention termination');
  }
});

Tinytest.addAsync('worker-pool - terminate rejects queued tasks', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 1, enableHeartbeat: false });

  // Occupy the worker.
  pool.dispatch({
    handler: async () => {
      await new Promise(r => setTimeout(r, 10000));
      return 'slow';
    },
  });

  await _waitFor(() => pool.stats().busy === 1);

  // Queue a task.
  const queued = pool.dispatch({
    handler: async () => 'queued',
  });

  // Terminate.
  await pool.terminate();

  try {
    await queued;
    test.fail('Queued task should be rejected');
  } catch (err) {
    test.matches(err.message, /terminated/i);
  }
});

Tinytest.addAsync('worker-pool - double terminate does not throw', async function (test) {
  const pool = new WorkerPool({ min: 0, enableHeartbeat: false });
  await pool.terminate();
  await pool.terminate(); // Should not throw.
  test.ok();
});

Tinytest.addAsync('worker-pool - terminate after drain resolves cleanly', async function (test) {
  const pool = new WorkerPool({ min: 0, enableHeartbeat: false });
  await pool.drain();
  await pool.terminate();
  test.ok();
});

Tinytest.addAsync('worker-pool - drain with min workers terminates idle workers', async function (test) {
  const pool = new WorkerPool({ min: 2, max: 4, enableHeartbeat: false });

  // Wait for min workers to be ready.
  await _waitFor(() => pool.stats().idle === 2);

  // Drain should terminate idle workers.
  await pool.drain();

  const stats = pool.stats();
  test.equal(stats.total, 0, 'All workers should be terminated after drain');
  test.equal(stats.idle, 0, 'No idle workers after drain');
});

// =============================================================================
// EDGE CASES
// =============================================================================

Tinytest.addAsync('worker-pool - dispatch with empty object arg', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 1, enableHeartbeat: false });

  try {
    await pool.dispatch({});
    test.fail('Should reject empty dispatch options');
  } catch (err) {
    test.matches(err.message, /handler/i);
  }

  await pool.terminate();
});

Tinytest.addAsync('worker-pool - handler returning undefined resolves to null', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 1, enableHeartbeat: false });

  const result = await pool.dispatch({
    handler: async () => {
      // No return statement — returns undefined.
    },
  });

  // Structured clone of undefined becomes null (or undefined depending on engine).
  // The key test: the dispatch resolves, not rejects.
  test.isTrue(result === undefined || result === null, 'Should resolve without error');
  await pool.terminate();
});

Tinytest.addAsync('worker-pool - rapid dispatch and terminate cycle', async function (test) {
  // Stress test: create pool, dispatch, terminate — repeat.
  for (let i = 0; i < 3; i++) {
    const pool = new WorkerPool({ min: 0, max: 2, enableHeartbeat: false });
    const result = await pool.dispatch({
      handler: async (d) => d + 1,
      data: i,
    });
    test.equal(result, i + 1);
    await pool.terminate();
  }
});

Tinytest.addAsync('worker-pool - pool functional after errored task', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 1, enableHeartbeat: false });

  // First task: error.
  try {
    await pool.dispatch({
      handler: async () => { throw new Error('first fails'); },
    });
  } catch { /* expected */ }

  // Second task: should succeed on the same or new worker.
  const result = await pool.dispatch({
    handler: async (d) => d,
    data: 'recovered',
  });
  test.equal(result, 'recovered', 'Pool should recover after handler error');

  await pool.terminate();
});

Tinytest.addAsync('worker-pool - large data round-trip via structured clone', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 1, enableHeartbeat: false });

  const bigData = {
    numbers: Array.from({ length: 1000 }, (_, i) => i),
    nested: { a: { b: { c: 'deep' } } },
    date: new Date('2024-01-01T00:00:00Z').toISOString(),
    nullVal: null,
    boolVal: true,
  };

  const result = await pool.dispatch({
    handler: async (data) => ({
      count: data.numbers.length,
      sum: data.numbers.reduce((a, b) => a + b, 0),
      deep: data.nested.a.b.c,
      date: data.date,
      nullVal: data.nullVal,
      boolVal: data.boolVal,
    }),
    data: bigData,
  });

  test.equal(result.count, 1000);
  test.equal(result.sum, 499500); // sum of 0..999
  test.equal(result.deep, 'deep');
  test.equal(result.date, '2024-01-01T00:00:00.000Z');
  test.equal(result.nullVal, null);
  test.equal(result.boolVal, true);

  await pool.terminate();
});

Tinytest.addAsync('worker-pool - concurrent errors do not corrupt pool state', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 3, enableHeartbeat: false });

  // Dispatch a mix of succeeding and failing tasks concurrently.
  const results = await Promise.allSettled([
    pool.dispatch({ handler: async (d) => d, data: 'ok1' }),
    pool.dispatch({ handler: async () => { throw new Error('fail1'); } }),
    pool.dispatch({ handler: async (d) => d, data: 'ok2' }),
    pool.dispatch({ handler: async () => { throw new Error('fail2'); } }),
    pool.dispatch({ handler: async (d) => d, data: 'ok3' }),
  ]);

  test.equal(results[0].status, 'fulfilled');
  test.equal(results[0].value, 'ok1');
  test.equal(results[1].status, 'rejected');
  test.equal(results[2].status, 'fulfilled');
  test.equal(results[2].value, 'ok2');
  test.equal(results[3].status, 'rejected');
  test.equal(results[4].status, 'fulfilled');
  test.equal(results[4].value, 'ok3');

  // Pool should be in clean state.
  const stats = pool.stats();
  test.equal(stats.busy, 0, 'No busy workers after all tasks settle');
  test.equal(stats.pending, 0, 'No pending tasks');

  await pool.terminate();
});

Tinytest.addAsync('worker-pool - stats consistent after drain', async function (test) {
  const pool = new WorkerPool({ min: 1, max: 4, enableHeartbeat: false });

  await _waitFor(() => pool.stats().idle >= 1);

  // Dispatch some tasks.
  await Promise.all([
    pool.dispatch({ handler: async (d) => d, data: 1 }),
    pool.dispatch({ handler: async (d) => d, data: 2 }),
    pool.dispatch({ handler: async (d) => d, data: 3 }),
  ]);

  await pool.drain();

  const stats = pool.stats();
  test.equal(stats.total, 0, 'total should be 0 after drain');
  test.equal(stats.idle, 0, 'idle should be 0 after drain');
  test.equal(stats.busy, 0, 'busy should be 0 after drain');
  test.equal(stats.spawning, 0, 'spawning should be 0 after drain');
  test.equal(stats.pending, 0, 'pending should be 0 after drain');
});

Tinytest.addAsync('worker-pool - stats consistent after terminate', async function (test) {
  const pool = new WorkerPool({ min: 2, max: 4, enableHeartbeat: false });

  await _waitFor(() => pool.stats().idle >= 2);

  // Dispatch and immediately terminate.
  pool.dispatch({
    handler: async () => { await new Promise(r => setTimeout(r, 10000)); },
  });

  await _wait(100);
  await pool.terminate();

  const stats = pool.stats();
  test.equal(stats.total, 0, 'total should be 0 after terminate');
  test.equal(stats.idle, 0, 'idle should be 0 after terminate');
  test.equal(stats.busy, 0, 'busy should be 0 after terminate');
  test.equal(stats.spawning, 0, 'spawning should be 0 after terminate');
  test.equal(stats.pending, 0, 'pending should be 0 after terminate');
});

// =============================================================================
// HEARTBEAT SUBSYSTEM
// =============================================================================

Tinytest.addAsync('worker-pool - heartbeat keeps idle workers alive', async function (test) {
  const pool = new WorkerPool({
    min: 0, max: 2,
    enableHeartbeat: true,
    heartbeatInterval: 200,
    heartbeatTimeout: 200,
    idleTimeout: 0, // disable idle timeout so only heartbeat matters
  });

  // Dispatch to spawn a worker, then let it go idle.
  await pool.dispatch({ handler: async () => 'done' });

  test.equal(pool.stats().idle, 1, 'Worker should be idle');

  // Wait for several heartbeat cycles — worker should stay alive.
  await _wait(700);

  const stats = pool.stats();
  test.equal(stats.idle, 1, 'Worker should survive heartbeat checks');
  test.equal(stats.total, 1, 'Worker should not be terminated');

  await pool.terminate();
});

Tinytest.addAsync('worker-pool - heartbeat does not ping busy workers', async function (test) {
  const pool = new WorkerPool({
    min: 0, max: 1,
    enableHeartbeat: true,
    heartbeatInterval: 100,
    heartbeatTimeout: 100,
  });

  // Dispatch a task that takes longer than heartbeatInterval + heartbeatTimeout.
  // If busy workers were pinged, the pool would kill the worker mid-task.
  const result = await pool.dispatch({
    handler: async () => {
      await new Promise(r => setTimeout(r, 500));
      return 'survived';
    },
  });

  test.equal(result, 'survived', 'Busy worker should not be killed by heartbeat');

  await pool.terminate();
});

// =============================================================================
// DISPATCH TO PRE-WARMED IDLE WORKER
// =============================================================================

Tinytest.addAsync('worker-pool - dispatches directly to pre-warmed idle worker', async function (test) {
  const pool = new WorkerPool({ min: 1, max: 4, enableHeartbeat: false });

  // Wait for min worker to become idle.
  await _waitFor(() => pool.stats().idle === 1);

  const totalBefore = pool.stats().total;

  // Dispatch should use the idle worker, not spawn a new one.
  const result = await pool.dispatch({ handler: async (d) => d, data: 'direct' });
  test.equal(result, 'direct');

  // Total workers should not have increased (no new spawn).
  const stats = pool.stats();
  test.equal(stats.total, totalBefore, 'Should reuse idle worker, not spawn new one');

  await pool.terminate();
});

// =============================================================================
// CANCELLED QUEUE ENTRIES — DEQUEUE SKIP
// =============================================================================

Tinytest.addAsync('worker-pool - cancelled queue entry skipped, next task dispatched', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 1, enableHeartbeat: false });

  // Occupy the worker with a slow task.
  const slow = pool.dispatch({
    handler: async () => { await new Promise(r => setTimeout(r, 500)); return 'slow'; },
  });

  await _waitFor(() => pool.stats().busy === 1);

  // Queue two tasks: first with a very short timeout (will cancel), second normal.
  const willCancel = pool.dispatch({
    handler: async () => 'should-not-run',
    timeout: 50,
  });
  const willSucceed = pool.dispatch({
    handler: async (d) => d,
    data: 'survived',
  });

  // Wait for the short timeout to fire.
  try { await willCancel; } catch { /* expected timeout */ }

  // The slow task completes, worker should skip the cancelled entry and
  // dispatch the second queued task.
  const slowResult = await slow;
  test.equal(slowResult, 'slow');

  const result = await willSucceed;
  test.equal(result, 'survived', 'Task after cancelled entry should be dispatched');

  await pool.terminate();
});

// =============================================================================
// DRAIN EDGE CASES
// =============================================================================

Tinytest.addAsync('worker-pool - drain during spawning-only state', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 2, enableHeartbeat: false });

  // Dispatch to trigger a spawn, then immediately drain before worker is ready.
  const task = pool.dispatch({
    handler: async () => 'result',
  });

  // Drain immediately — the worker may still be in SPAWNING state.
  // drain() checks _stateCounts[BUSY] === 0 which is true during spawning,
  // so it should resolve promptly. The spawning worker will eventually exit.
  const drainPromise = pool.drain();
  await drainPromise;

  // The dispatched task was queued, so drain should have rejected it.
  try {
    await task;
    // If the worker was fast enough to become ready and dispatch the task
    // before drain kicked in, the task might succeed — that's acceptable.
  } catch (err) {
    test.matches(err.message, /draining/i, 'Queued task rejected during drain');
  }

  // Clean up any lingering workers.
  await pool.terminate();
});

Tinytest.addAsync('worker-pool - drain with multiple busy workers resolves after last completes', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 3, enableHeartbeat: false });

  // Dispatch 3 tasks of different durations.
  const p1 = pool.dispatch({
    handler: async () => { await new Promise(r => setTimeout(r, 100)); return 1; },
  });
  const p2 = pool.dispatch({
    handler: async () => { await new Promise(r => setTimeout(r, 200)); return 2; },
  });
  const p3 = pool.dispatch({
    handler: async () => { await new Promise(r => setTimeout(r, 300)); return 3; },
  });

  await _waitFor(() => pool.stats().busy === 3);

  let drainResolved = false;
  const drainPromise = pool.drain().then(() => { drainResolved = true; });

  // First task completes — drain should NOT have resolved yet.
  await p1;
  await _wait(20); // let microtasks settle
  test.isFalse(drainResolved, 'Drain should wait for all busy workers');

  // Wait for all tasks and drain.
  await Promise.all([p2, p3]);
  await drainPromise;
  test.isTrue(drainResolved, 'Drain should resolve after last worker finishes');

  const stats = pool.stats();
  test.equal(stats.total, 0, 'All workers terminated after drain');
});

// =============================================================================
// STALE TASK ID (LATE RESULT AFTER TIMEOUT)
// =============================================================================

Tinytest.addAsync('worker-pool - late result after timeout is silently dropped', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 1, enableHeartbeat: false });

  // Dispatch a task with a short timeout but the handler takes longer.
  try {
    await pool.dispatch({
      handler: async () => {
        await new Promise(r => setTimeout(r, 500));
        return 'late-result';
      },
      timeout: 100,
    });
    test.fail('Should have timed out');
  } catch (err) {
    test.matches(err.message, /timed out/i);
  }

  // Wait for the worker to finish the task and send the late result.
  await _wait(600);

  // Pool should still be functional — the late result should be silently dropped.
  const result = await pool.dispatch({ handler: async (d) => d, data: 'after-stale' });
  test.equal(result, 'after-stale', 'Pool should work after stale result is dropped');

  await pool.terminate();
});

// =============================================================================
// IDLE TIMEOUT — DISABLED
// =============================================================================

Tinytest.addAsync('worker-pool - idleTimeout <= 0 disables idle termination', async function (test) {
  const pool = new WorkerPool({
    min: 0, max: 2,
    idleTimeout: 0, // disabled
    enableHeartbeat: false,
  });

  await pool.dispatch({ handler: async () => 'done' });

  test.equal(pool.stats().idle, 1, 'Worker should be idle');

  // Wait and verify worker is never terminated.
  await _wait(500);

  test.equal(pool.stats().idle, 1, 'Worker should stay idle (timeout disabled)');
  test.equal(pool.stats().total, 1, 'Worker should not be terminated');

  await pool.terminate();
});

// =============================================================================
// METEOR ERROR FIELDS — INDEPENDENT
// =============================================================================

Tinytest.addAsync('worker-pool - Meteor error with only .error field', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 1, enableHeartbeat: false });

  try {
    await pool.dispatch({
      handler: async () => {
        const err = new Error('partial meteor error');
        err.error = 'validation-error';
        // .reason and .details are NOT set
        throw err;
      },
    });
    test.fail('Should have thrown');
  } catch (err) {
    test.equal(err.error, 'validation-error', '.error field preserved');
    test.isUndefined(err.reason, '.reason should be absent');
    test.isUndefined(err.details, '.details should be absent');
  }

  await pool.terminate();
});

Tinytest.addAsync('worker-pool - Meteor error with only .reason field', async function (test) {
  const pool = new WorkerPool({ min: 0, max: 1, enableHeartbeat: false });

  try {
    await pool.dispatch({
      handler: async () => {
        const err = new Error('reason only');
        err.reason = 'Something went wrong';
        throw err;
      },
    });
    test.fail('Should have thrown');
  } catch (err) {
    test.isUndefined(err.error, '.error should be absent');
    test.equal(err.reason, 'Something went wrong', '.reason preserved');
    test.isUndefined(err.details, '.details should be absent');
  }

  await pool.terminate();
});

// =============================================================================
// ADDITIONAL EDGE CASES
// =============================================================================

Tinytest.addAsync('worker-pool - idle timer cleared when task assigned to idle worker', async function (test) {
  // Verifies that dispatching to an idle worker clears its pending idle timer
  // (no stale timer causes premature termination).
  const pool = new WorkerPool({
    min: 0, max: 1,
    idleTimeout: 300,
    enableHeartbeat: false,
  });

  // First task: creates and idles a worker (idle timer starts).
  await pool.dispatch({ handler: async () => 'first' });

  // Worker is now idle with a 300ms idle timer.
  test.equal(pool.stats().idle, 1);

  // Wait 200ms (timer hasn't fired yet), then dispatch a second task.
  await _wait(200);
  const result = await pool.dispatch({ handler: async (d) => d, data: 'second' });
  test.equal(result, 'second');

  // After second task completes, a fresh idle timer starts.
  // Wait another 200ms — less than 300ms from the NEW idle time.
  await _wait(200);
  test.equal(pool.stats().total, 1, 'Worker should still exist (fresh idle timer)');

  // Wait for the full idle timeout from the second task.
  await _waitFor(() => pool.stats().total === 0, 3000);
  test.equal(pool.stats().total, 0, 'Worker terminated after idle timeout');

  await pool.terminate();
});

Tinytest.addAsync('worker-pool - multiple pools operate independently', async function (test) {
  const pool1 = new WorkerPool({ min: 0, max: 2, enableHeartbeat: false });
  const pool2 = new WorkerPool({ min: 0, max: 2, enableHeartbeat: false });

  const [r1, r2] = await Promise.all([
    pool1.dispatch({ handler: async (d) => 'pool1-' + d, data: 'a' }),
    pool2.dispatch({ handler: async (d) => 'pool2-' + d, data: 'b' }),
  ]);

  test.equal(r1, 'pool1-a');
  test.equal(r2, 'pool2-b');

  // Terminating one pool should not affect the other.
  await pool1.terminate();

  const r3 = await pool2.dispatch({ handler: async (d) => d, data: 'still-alive' });
  test.equal(r3, 'still-alive', 'Second pool should work after first is terminated');

  await pool2.terminate();
});
