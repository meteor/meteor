import { Tinytest } from 'meteor/tinytest';

// ===========================================================================
// afs - adaptive - targeted coverage for AdaptiveEngine
//
// Replaces / supplements tautological tests in afs-tests.js:
//   - afs-tests.js:300-317  (throttle tracking — only asserts delay >= 0)
//   - afs-tests.js:1168-1192 (auto-attach — only asserts totalChanges > 0)
//   - afs-tests.js:1738      (tight 100ms timeout)
//
// All tests construct a *fresh* AdaptiveEngine via `new AFS.AdaptiveEngine(...)`
// where appropriate so they do not share state with the global AFS._engine.
// Where the global engine is required (auto-attach integration test) we reset
// it both before and after.
// ===========================================================================

// ---------------------------------------------------------------------------
// Throttle evolution
// ---------------------------------------------------------------------------

if (Meteor.isServer) {
  // Edge case: brand-new collection with no history returns 0 delay and is
  // not scheduled for throttling. Verify the exact value (not just >= 0).
  Tinytest.add('afs - adaptive - throttle delay is 0 for unknown collection', (test) => {
    const engine = new AFS.AdaptiveEngine({ minInterval: 50, maxInterval: 5000 });
    const name = 'afs-throttle-unknown-' + Random.id();

    test.equal(engine.getThrottleDelay(name), 0);
    test.isFalse(engine.shouldThrottle(name));
  });

  // After the FIRST recordQueryExecution (regardless of duration), the EMA
  // comparisons cannot trigger (duration > duration*2 is false, duration <
  // duration*0.5 is false), so currentInterval is seeded to minInterval.
  Tinytest.add('afs - adaptive - throttle first execution seeds minInterval', (test) => {
    const engine = new AFS.AdaptiveEngine({ minInterval: 50, maxInterval: 5000 });
    const name = 'afs-throttle-first-' + Random.id();

    engine.recordQueryExecution(name, 10); // fast
    const state = engine._throttleState.get(name);
    test.isTrue(!!state, 'state should exist after recordQueryExecution');
    test.equal(state.currentInterval, 50); // seeded to minInterval exactly
    test.equal(state.avgDuration, 10);
  });

  // Repeated FAST executions should never grow the interval above minInterval.
  Tinytest.add('afs - adaptive - throttle stays at min for steady fast queries', (test) => {
    const engine = new AFS.AdaptiveEngine({ minInterval: 50, maxInterval: 5000 });
    const name = 'afs-throttle-fast-' + Random.id();

    for (let i = 0; i < 20; i++) {
      engine.recordQueryExecution(name, 10);
    }

    const state = engine._throttleState.get(name);
    // currentInterval should be exactly minInterval (never grew, clamped on shrink).
    test.equal(state.currentInterval, 50);
  });

  // A slow spike (duration > 2x average) MUST grow the interval by 1.5x.
  // We compare the before/after interval directly — not just >= 0.
  Tinytest.add('afs - adaptive - throttle grows 1.5x on slow spike', (test) => {
    const engine = new AFS.AdaptiveEngine({ minInterval: 50, maxInterval: 5000 });
    const name = 'afs-throttle-slow-' + Random.id();

    // Seed with a fast baseline: avgDuration settles around ~10ms.
    for (let i = 0; i < 5; i++) engine.recordQueryExecution(name, 10);

    const before = engine._throttleState.get(name).currentInterval;
    const avgBefore = engine._throttleState.get(name).avgDuration;

    // Record a genuinely slow execution (>> 2x avg). With avgBefore around 10,
    // duration 500 is 50x — safely triggers the grow branch.
    engine.recordQueryExecution(name, 500);

    const after = engine._throttleState.get(name).currentInterval;
    test.isTrue(after > before, `interval should grow (before=${before}, after=${after})`);
    // The grow multiplier is 1.5x (adaptive-engine.js:193), clamped to maxInterval.
    const expected = Math.min(before * 1.5, 5000);
    test.equal(after, expected);
  });

  // Repeated slow spikes should push the interval monotonically up to maxInterval.
  Tinytest.add('afs - adaptive - throttle monotonic growth and clamps at max', (test) => {
    const engine = new AFS.AdaptiveEngine({ minInterval: 50, maxInterval: 500 });
    const name = 'afs-throttle-mono-' + Random.id();

    // Seed baseline around 10ms.
    for (let i = 0; i < 3; i++) engine.recordQueryExecution(name, 10);

    const intervals = [];
    intervals.push(engine._throttleState.get(name).currentInterval);

    // Drive slow executions. Use a growing duration so it always beats 2x avg.
    let d = 1000;
    for (let i = 0; i < 30; i++) {
      engine.recordQueryExecution(name, d);
      d *= 2;
      intervals.push(engine._throttleState.get(name).currentInterval);
    }

    // Monotonic non-decreasing.
    for (let i = 1; i < intervals.length; i++) {
      test.isTrue(
        intervals[i] >= intervals[i - 1],
        `interval decreased at step ${i}: ${intervals[i - 1]} -> ${intervals[i]}`
      );
    }
    // Eventually clamped at maxInterval.
    test.equal(intervals[intervals.length - 1], 500);
  });

  // After the interval has grown, a string of FAST executions should shrink it
  // via the 0.8x branch. Interval must DECREASE and eventually clamp at min.
  Tinytest.add('afs - adaptive - throttle shrinks 0.8x on fast recovery', (test) => {
    const engine = new AFS.AdaptiveEngine({ minInterval: 50, maxInterval: 5000 });
    const name = 'afs-throttle-recover-' + Random.id();

    // Push the interval up first.
    for (let i = 0; i < 3; i++) engine.recordQueryExecution(name, 10);
    for (let i = 0; i < 20; i++) engine.recordQueryExecution(name, 10000);

    const high = engine._throttleState.get(name).currentInterval;
    test.isTrue(high > 50, `interval should have grown above min, got ${high}`);

    // Record a long string of very fast executions (<< 0.5x avg).
    // avg will drift down via EMA; we need duration < avg*0.5 on each call.
    // Start with duration = 1ms; as avg shrinks, keep duration proportionally low.
    const intervals = [high];
    for (let i = 0; i < 100; i++) {
      const avg = engine._throttleState.get(name).avgDuration;
      // Pick a duration well under half the current avg.
      const dur = Math.max(0, avg * 0.1);
      engine.recordQueryExecution(name, dur);
      intervals.push(engine._throttleState.get(name).currentInterval);
    }

    // Interval strictly decreased at least once.
    test.isTrue(
      intervals[intervals.length - 1] < high,
      `interval should have shrunk from ${high}, ended at ${intervals[intervals.length - 1]}`
    );
    // Eventually clamped at minInterval.
    test.equal(intervals[intervals.length - 1], 50);

    // Non-increasing overall (each step either shrunk or stayed at min).
    for (let i = 1; i < intervals.length; i++) {
      test.isTrue(
        intervals[i] <= intervals[i - 1],
        `interval grew during fast recovery at step ${i}: ${intervals[i - 1]} -> ${intervals[i]}`
      );
    }
  });
}

// ---------------------------------------------------------------------------
// waitForSlot FIFO & backpressure re-entry
// ---------------------------------------------------------------------------

if (Meteor.isServer) {
  // With concurrency of 1, queue four waiters. Each release should drain
  // exactly one (FIFO). The others must remain pending until later releases.
  Tinytest.addAsync('afs - adaptive - waitForSlot FIFO with concurrency 1', async (test) => {
    const engine = new AFS.AdaptiveEngine({ maxPendingQueries: 1 });

    // Acquire the one available slot.
    const release0 = engine.acquireSlot('query');
    test.isTrue(engine.shouldApplyBackpressure('query'));

    // Queue four waiters without awaiting. Track resolution order.
    const resolved = [];
    const waiters = [0, 1, 2, 3].map(i =>
      engine.waitForSlot('query', 10000).then(release => {
        resolved.push(i);
        return release;
      })
    );

    // Give the queueing microtasks a chance to register.
    await new Promise(r => setTimeout(r, 20));
    test.equal(resolved.length, 0, 'no waiter should resolve before any release');
    test.equal(engine._waitingForSlot.query.length, 4);

    // Release once. Exactly one waiter should drain (and re-acquire the slot).
    release0();
    // Wait for waiter 0 to resolve.
    const r0 = await waiters[0];
    test.equal(resolved, [0], 'only the first queued waiter should have drained');
    test.equal(engine._waitingForSlot.query.length, 3);
    // The slot is now held by waiter 0 again — still under backpressure.
    test.isTrue(engine.shouldApplyBackpressure('query'));

    // Release waiter 0's slot → waiter 1 drains.
    r0();
    const r1 = await waiters[1];
    test.equal(resolved, [0, 1]);

    r1();
    const r2 = await waiters[2];
    test.equal(resolved, [0, 1, 2]);

    r2();
    const r3 = await waiters[3];
    test.equal(resolved, [0, 1, 2, 3], 'FIFO order preserved across all releases');

    r3();
    test.isFalse(engine.shouldApplyBackpressure('query'));
  });

  // After draining, new waiters queued while the slot is held must remain
  // pending (backpressure blocks re-entry via _notifySlotAvailable's guard).
  Tinytest.addAsync('afs - adaptive - waitForSlot pending while backpressure active', async (test) => {
    const engine = new AFS.AdaptiveEngine({ maxPendingQueries: 1 });

    const release0 = engine.acquireSlot('query');

    // Queue two waiters.
    let resolvedA = false;
    let resolvedB = false;
    const waiterA = engine.waitForSlot('query', 10000).then(r => { resolvedA = true; return r; });
    const waiterB = engine.waitForSlot('query', 10000).then(r => { resolvedB = true; return r; });

    await new Promise(r => setTimeout(r, 20));
    test.isFalse(resolvedA);
    test.isFalse(resolvedB);

    // Release — A drains and takes the slot.
    release0();
    const rA = await waiterA;
    test.isTrue(resolvedA);
    test.isFalse(resolvedB, 'B must stay queued because A now holds the only slot');
    test.isTrue(engine.shouldApplyBackpressure('query'));

    // Queue another waiter C AFTER backpressure is active.
    let resolvedC = false;
    const waiterC = engine.waitForSlot('query', 10000).then(r => { resolvedC = true; return r; });
    await new Promise(r => setTimeout(r, 20));
    test.isFalse(resolvedC, 'C queued during active backpressure must remain pending');

    rA();
    const rB = await waiterB;
    test.isTrue(resolvedB);
    test.isFalse(resolvedC);

    rB();
    const rC = await waiterC;
    test.isTrue(resolvedC);

    rC();
  });
}

// ---------------------------------------------------------------------------
// waitForSlot timeout — use generous ceiling, not a tight 100ms race.
// ---------------------------------------------------------------------------

if (Meteor.isServer) {
  Tinytest.addAsync('afs - adaptive - waitForSlot rejects within timeout window', async (test) => {
    const engine = new AFS.AdaptiveEngine({ maxPendingQueries: 1 });
    const release = engine.acquireSlot('query');

    const timeout = 300;
    const start = Date.now();
    let err = null;
    try {
      await engine.waitForSlot('query', timeout);
    } catch (e) {
      err = e;
    }
    const elapsed = Date.now() - start;

    test.isTrue(!!err, 'waitForSlot should reject when timeout expires');
    test.equal(err && err.error, 'backpressure');
    // Must have waited at least the timeout, but not egregiously longer.
    test.isTrue(elapsed >= timeout - 50, `elapsed ${elapsed}ms < timeout-slack`);
    test.isTrue(elapsed <= timeout + 500, `elapsed ${elapsed}ms > timeout+500ms ceiling`);

    // Ensure waiter was removed from the queue on timeout.
    test.equal(engine._waitingForSlot.query.length, 0);

    // Backpressure event was recorded.
    test.equal(engine.getMetrics().backpressureEvents, 1);

    release();
  });
}

// ---------------------------------------------------------------------------
// _patternKey EJSON catch branch
// ---------------------------------------------------------------------------

if (Meteor.isServer) {
  Tinytest.add('afs - adaptive - patternKey survives circular selector', (test) => {
    const engine = new AFS.AdaptiveEngine();
    const obj = { a: 1 };
    obj.self = obj; // circular

    let key;
    let threw = false;
    try {
      key = engine._patternKey('coll', obj);
    } catch (_e) {
      threw = true;
    }
    test.isFalse(threw, '_patternKey must not throw on circular selectors');
    test.isTrue(typeof key === 'string');
    // Catch branch returns `${collectionName}:*` (adaptive-engine.js:372).
    test.equal(key, 'coll:*');
  });

  Tinytest.add('afs - adaptive - patternKey fallback on EJSON.stringify throw', (test) => {
    const engine = new AFS.AdaptiveEngine();

    // Monkey-patch EJSON.stringify to force the catch branch. Save/restore.
    const origStringify = EJSON.stringify;
    EJSON.stringify = () => { throw new Error('forced'); };
    try {
      const key = engine._patternKey('things', { a: 1 });
      test.equal(key, 'things:*');
    } finally {
      EJSON.stringify = origStringify;
    }
  });

  // Non-circular selectors should use the EJSON-stringified form.
  Tinytest.add('afs - adaptive - patternKey stable for ordinary selectors', (test) => {
    const engine = new AFS.AdaptiveEngine();
    const k1 = engine._patternKey('col', { a: 1, b: 2 });
    const k2 = engine._patternKey('col', { a: 1, b: 2 });
    test.equal(k1, k2);
    test.isTrue(k1.startsWith('col:'));
    test.isFalse(k1.endsWith(':*')); // took the success branch
  });
}

// ---------------------------------------------------------------------------
// shouldApplyBackpressure
// ---------------------------------------------------------------------------

if (Meteor.isServer) {
  Tinytest.add('afs - adaptive - backpressure flips at threshold and clears on release', (test) => {
    const engine = new AFS.AdaptiveEngine({ maxPendingQueries: 3, maxPendingWrites: 2 });

    test.isFalse(engine.shouldApplyBackpressure('query'));
    test.isFalse(engine.shouldApplyBackpressure('write'));

    const r1 = engine.acquireSlot('query');
    test.isFalse(engine.shouldApplyBackpressure('query'));
    const r2 = engine.acquireSlot('query');
    test.isFalse(engine.shouldApplyBackpressure('query'));
    const r3 = engine.acquireSlot('query');
    test.isTrue(engine.shouldApplyBackpressure('query'), 'at threshold backpressure is on');

    // Release a single slot → under threshold again.
    r3();
    test.isFalse(engine.shouldApplyBackpressure('query'));

    r1();
    r2();
    test.isFalse(engine.shouldApplyBackpressure('query'));
  });

  Tinytest.add('afs - adaptive - backpressure isolates query vs write counters', (test) => {
    const engine = new AFS.AdaptiveEngine({ maxPendingQueries: 2, maxPendingWrites: 2 });

    // Saturate queries.
    const rq1 = engine.acquireSlot('query');
    const rq2 = engine.acquireSlot('query');
    test.isTrue(engine.shouldApplyBackpressure('query'));
    test.isFalse(engine.shouldApplyBackpressure('write'), 'writes unaffected by query saturation');

    // Saturate writes independently.
    const rw1 = engine.acquireSlot('write');
    const rw2 = engine.acquireSlot('write');
    test.isTrue(engine.shouldApplyBackpressure('write'));

    // Releasing a query does not affect the write counter.
    rq1();
    test.isFalse(engine.shouldApplyBackpressure('query'));
    test.isTrue(engine.shouldApplyBackpressure('write'));

    rq2();
    rw1();
    rw2();
    test.isFalse(engine.shouldApplyBackpressure('query'));
    test.isFalse(engine.shouldApplyBackpressure('write'));
  });
}

// ---------------------------------------------------------------------------
// Replacement for the tautological "auto-attaches" test (afs-tests.js:1168).
// Assert an EXACT count of totalChanges, not > 0.
// ---------------------------------------------------------------------------

if (Meteor.isServer) {
  Tinytest.addAsync('afs - adaptive - auto-attach records exact change count', async (test) => {
    const engine = AFS.getEngine();
    engine.reset();

    const provider = new AFS.MockStreamProvider();
    const collName = 'afs-auto-attach-' + Random.id();

    // Pre-populate ONE document before observing.
    await provider.insertAsync(collName, { name: 'pre-existing' });

    const cursor = new AFS.Cursor(provider, collName, {});

    // Collect events so we know exactly when initial adds have fired.
    const events = { added: 0, changed: 0, removed: 0 };
    const handle = await cursor.observeChangesAsync({
      added() { events.added++; },
      changed() { events.changed++; },
      removed() { events.removed++; },
    });

    // Wait for initial adds to be delivered (bridge defers to a microtask;
    // a small real-time wait is sufficient — no timers are stacked here).
    await new Promise(r => setTimeout(r, 50));
    test.equal(events.added, 1, 'exactly one initial added for the pre-existing doc');

    const changesAfterInit = engine.getMetrics().totalChanges;

    // Insert TWO more documents — each should bump totalChanges by exactly 1.
    await provider.insertAsync(collName, { name: 'doc-2' });
    await provider.insertAsync(collName, { name: 'doc-3' });

    await new Promise(r => setTimeout(r, 50));

    // Events seen by the observer: 2 additional adds.
    test.equal(events.added, 3, 'three total added events (1 initial + 2 inserts)');

    const totalNow = engine.getMetrics().totalChanges;
    // Engine counts added/changed/removed all as totalChanges. Two inserts
    // after initialization ⇒ totalChanges increased by EXACTLY 2.
    test.equal(
      totalNow - changesAfterInit,
      2,
      `expected exactly 2 change events, got ${totalNow - changesAfterInit}`
    );

    handle.stop();
    engine.reset();
  });
}

// ---------------------------------------------------------------------------
// recordAccess concurrency/isolation between patterns
// ---------------------------------------------------------------------------

if (Meteor.isServer) {
  Tinytest.add('afs - adaptive - recordAccess isolates counters per pattern', (test) => {
    const engine = new AFS.AdaptiveEngine();

    const colA = 'afs-rec-A-' + Random.id();
    const colB = 'afs-rec-B-' + Random.id();
    const selA = { kind: 'a' };
    const selB = { kind: 'b' };

    // Interleave recordAccess calls across two patterns.
    for (let i = 0; i < 10; i++) {
      engine.recordAccess(colA, selA, {});
      engine.recordAccess(colB, selB, {});
      engine.recordAccess(colA, selA, {});
    }

    const keyA = engine._patternKey(colA, selA);
    const keyB = engine._patternKey(colB, selB);

    const patternA = engine._accessPatterns.get(keyA);
    const patternB = engine._accessPatterns.get(keyB);

    test.isTrue(!!patternA);
    test.isTrue(!!patternB);
    test.equal(patternA.count, 20, 'pattern A counted exactly 20 times');
    test.equal(patternB.count, 10, 'pattern B counted exactly 10 times');

    // totalQueries sums both.
    test.equal(engine.getMetrics().totalQueries, 30);

    // Different selectors under the same collection are tracked separately.
    const colC = 'afs-rec-C-' + Random.id();
    engine.recordAccess(colC, { kind: 'x' }, {});
    engine.recordAccess(colC, { kind: 'y' }, {});
    engine.recordAccess(colC, { kind: 'x' }, {});

    const keyCx = engine._patternKey(colC, { kind: 'x' });
    const keyCy = engine._patternKey(colC, { kind: 'y' });
    test.equal(engine._accessPatterns.get(keyCx).count, 2);
    test.equal(engine._accessPatterns.get(keyCy).count, 1);
  });
}
