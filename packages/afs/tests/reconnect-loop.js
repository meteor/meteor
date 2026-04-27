import { Tinytest } from 'meteor/tinytest';

// =============================================================================
// ReconnectLoop tests
//
// Uses an injected sleepFn (via setTimeoutFn / clearTimeoutFn) where timing
// matters, so tests don't burn wall-clock time. For "real timer" coverage we
// also keep a minimal end-to-end test with initialMs=1.
// =============================================================================

if (Meteor.isServer) {

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  // Build a setTimeoutFn / clearTimeoutFn pair that records every scheduled
  // delay and lets the test resolve them on demand. The "queue" lets us assert
  // delay ordering without sleeping.
  function makeFakeTimers() {
    let nextHandle = 1;
    const pending = new Map(); // handle -> { ms, fire }
    const delays = [];

    return {
      delays,
      pending,
      setTimeoutFn: (ms, fn) => {
        const handle = nextHandle++;
        delays.push(ms);
        pending.set(handle, { ms, fire: fn });
        return handle;
      },
      clearTimeoutFn: (handle) => {
        pending.delete(handle);
      },
      // Fire the oldest still-pending timer.
      fireOldest: () => {
        const [handle, entry] = pending.entries().next().value || [];
        if (!handle) return false;
        pending.delete(handle);
        entry.fire();
        return true;
      },
      // Yield until a timer is scheduled (caller sets one up via async work).
      waitForPending: async () => {
        for (let i = 0; i < 50; i++) {
          if (pending.size > 0) return;
          await Promise.resolve();
        }
        throw new Error('Expected a pending timer but none was scheduled');
      },
    };
  }

  // Records lifecycle events for assertions.
  function makeEventCollector() {
    const events = [];
    return {
      events,
      onEvent: (evt, payload) => events.push({ evt, payload }),
      names: () => events.map(e => e.evt),
    };
  }

  // ---------------------------------------------------------------------------
  // Cases
  // ---------------------------------------------------------------------------

  // 1. Success on first attempt — 'success' fires, doReplay runs once, resolves.
  Tinytest.addAsync('afs - reconnect-loop - success on first attempt', async (test) => {
    const timers = makeFakeTimers();
    const collector = makeEventCollector();
    let reconnectCalls = 0;
    let replayCalls = 0;

    const loop = new AFS.ReconnectLoop({
      doReconnect: async () => { reconnectCalls += 1; },
      doReplay: async () => { replayCalls += 1; },
      onEvent: collector.onEvent,
      backoff: { initialMs: 100, maxMs: 1000, factor: 2, jitter: 0 },
      setTimeoutFn: timers.setTimeoutFn,
      clearTimeoutFn: timers.clearTimeoutFn,
    });

    const startPromise = loop.start();
    await timers.waitForPending();
    timers.fireOldest(); // first sleep -> doReconnect runs
    const result = await startPromise;

    test.equal(result, { aborted: false });
    test.equal(reconnectCalls, 1);
    test.equal(replayCalls, 1);
    test.include(collector.names(), 'success');
    test.isFalse(collector.names().includes('gave-up'));
    test.isFalse(loop.running);
  });

  // 2. Success after N retries — backoff delays grow, 'attempt' fires N times.
  Tinytest.addAsync('afs - reconnect-loop - success after retries with growing backoff', async (test) => {
    const timers = makeFakeTimers();
    const collector = makeEventCollector();
    let calls = 0;

    const loop = new AFS.ReconnectLoop({
      doReconnect: async () => {
        calls += 1;
        if (calls < 3) throw new Error('flake ' + calls);
      },
      onEvent: collector.onEvent,
      backoff: { initialMs: 100, maxMs: 10000, factor: 2, jitter: 0 },
      setTimeoutFn: timers.setTimeoutFn,
      clearTimeoutFn: timers.clearTimeoutFn,
    });

    const startPromise = loop.start();
    // Three attempts -> three sleeps -> three fires.
    for (let i = 0; i < 3; i++) {
      await timers.waitForPending();
      timers.fireOldest();
    }
    const result = await startPromise;

    test.equal(result, { aborted: false });
    test.equal(calls, 3);
    // initialMs * factor^0=100, 100*2=200, 100*4=400, jitter=0 so exact match.
    test.equal(timers.delays.slice(0, 3), [100, 200, 400]);

    const attempts = collector.events.filter(e => e.evt === 'attempt');
    test.equal(attempts.length, 3);
    test.equal(attempts[0].payload.attempt, 1);
    test.equal(attempts[1].payload.attempt, 2);
    test.equal(attempts[2].payload.attempt, 3);
  });

  // 3. shouldRetry returns false -> 'gave-up' fires, start() rejects.
  Tinytest.addAsync('afs - reconnect-loop - non-retryable error rejects', async (test) => {
    const timers = makeFakeTimers();
    const collector = makeEventCollector();
    const fatal = new Error('fatal');

    const loop = new AFS.ReconnectLoop({
      doReconnect: async () => { throw fatal; },
      shouldRetry: () => false,
      onEvent: collector.onEvent,
      backoff: { initialMs: 50, jitter: 0 },
      setTimeoutFn: timers.setTimeoutFn,
      clearTimeoutFn: timers.clearTimeoutFn,
    });

    const startPromise = loop.start();
    await timers.waitForPending();
    timers.fireOldest();

    let caught = null;
    try { await startPromise; } catch (e) { caught = e; }
    test.equal(caught, fatal);
    test.include(collector.names(), 'gave-up');
    const giveUp = collector.events.find(e => e.evt === 'gave-up');
    test.equal(giveUp.payload.error, fatal);
    test.equal(giveUp.payload.attempts, 1);
  });

  // 4. maxAttempts: 3 exhausted -> 'gave-up' fires, start() rejects.
  Tinytest.addAsync('afs - reconnect-loop - maxAttempts exhausted rejects', async (test) => {
    const timers = makeFakeTimers();
    const collector = makeEventCollector();
    let lastErr = null;
    let calls = 0;

    const loop = new AFS.ReconnectLoop({
      doReconnect: async () => {
        calls += 1;
        const e = new Error('fail ' + calls);
        lastErr = e;
        throw e;
      },
      onEvent: collector.onEvent,
      backoff: { initialMs: 10, maxMs: 100, factor: 2, jitter: 0, maxAttempts: 3 },
      setTimeoutFn: timers.setTimeoutFn,
      clearTimeoutFn: timers.clearTimeoutFn,
    });

    const startPromise = loop.start();
    for (let i = 0; i < 3; i++) {
      await timers.waitForPending();
      timers.fireOldest();
    }

    let caught = null;
    try { await startPromise; } catch (e) { caught = e; }
    test.equal(caught, lastErr);
    test.equal(calls, 3);
    const giveUp = collector.events.find(e => e.evt === 'gave-up');
    test.isTrue(!!giveUp);
    test.equal(giveUp.payload.attempts, 3);
  });

  // 5. stop() during sleep -> 'aborted', resolves to { aborted: true },
  //    pending sleep does NOT complete (its timer is cleared).
  Tinytest.addAsync('afs - reconnect-loop - stop during sleep aborts', async (test) => {
    const timers = makeFakeTimers();
    const collector = makeEventCollector();
    let reconnectCalls = 0;

    const loop = new AFS.ReconnectLoop({
      doReconnect: async () => { reconnectCalls += 1; },
      onEvent: collector.onEvent,
      backoff: { initialMs: 1000, jitter: 0 },
      setTimeoutFn: timers.setTimeoutFn,
      clearTimeoutFn: timers.clearTimeoutFn,
    });

    const startPromise = loop.start();
    await timers.waitForPending();
    test.equal(timers.pending.size, 1);

    loop.stop();

    const result = await startPromise;
    test.equal(result, { aborted: true });
    test.equal(reconnectCalls, 0);
    test.equal(timers.pending.size, 0); // timer was cleared
    test.include(collector.names(), 'aborted');
    test.isFalse(collector.names().includes('success'));
  });

  // 6. stop() during doReconnect — current attempt completes but no new attempt
  //    starts; resolves to { aborted: true }.
  Tinytest.addAsync('afs - reconnect-loop - stop during doReconnect honors after attempt', async (test) => {
    const timers = makeFakeTimers();
    const collector = makeEventCollector();
    let reconnectCalls = 0;
    let releaseReconnect;
    const reconnectGate = new Promise(resolve => { releaseReconnect = resolve; });

    const loop = new AFS.ReconnectLoop({
      doReconnect: async () => {
        reconnectCalls += 1;
        await reconnectGate;
        // Throw so the loop would normally retry — but stop() should prevent that.
        throw new Error('flake');
      },
      onEvent: collector.onEvent,
      backoff: { initialMs: 50, jitter: 0 },
      setTimeoutFn: timers.setTimeoutFn,
      clearTimeoutFn: timers.clearTimeoutFn,
    });

    const startPromise = loop.start();
    await timers.waitForPending();
    timers.fireOldest(); // first sleep done -> doReconnect runs and awaits gate

    // Yield so reconnect actually enters the gate before we call stop()
    await Promise.resolve();
    await Promise.resolve();
    test.equal(reconnectCalls, 1);

    loop.stop();
    releaseReconnect();

    const result = await startPromise;
    test.equal(result, { aborted: true });
    test.equal(reconnectCalls, 1); // no second attempt
    test.include(collector.names(), 'aborted');
  });

  // 7. stop() before start() -> start() resolves immediately to { aborted: true }.
  Tinytest.addAsync('afs - reconnect-loop - stop before start resolves immediately', async (test) => {
    const collector = makeEventCollector();
    const loop = new AFS.ReconnectLoop({
      doReconnect: async () => { throw new Error('should not run'); },
      onEvent: collector.onEvent,
    });

    loop.stop();
    const result = await loop.start();
    test.equal(result, { aborted: true });
    test.equal(collector.events.length, 0); // never even emitted 'reconnecting'
  });

  // 8. Idempotent start() — second start() returns the same in-flight promise.
  Tinytest.addAsync('afs - reconnect-loop - start is idempotent while running', async (test) => {
    const timers = makeFakeTimers();
    const loop = new AFS.ReconnectLoop({
      doReconnect: async () => {},
      backoff: { initialMs: 50, jitter: 0 },
      setTimeoutFn: timers.setTimeoutFn,
      clearTimeoutFn: timers.clearTimeoutFn,
    });

    const p1 = loop.start();
    const p2 = loop.start();
    test.isTrue(p1 === p2);

    await timers.waitForPending();
    timers.fireOldest();
    await p1;
  });

  // 9. Backoff math — delays grow exponentially up to maxMs (jitter=0 makes it
  //    deterministic; the "with jitter" branch is sanity-checked via random=0.5).
  Tinytest.addAsync('afs - reconnect-loop - backoff caps at maxMs', async (test) => {
    const timers = makeFakeTimers();
    let calls = 0;

    const loop = new AFS.ReconnectLoop({
      doReconnect: async () => {
        calls += 1;
        if (calls < 6) throw new Error('flake');
      },
      backoff: { initialMs: 100, maxMs: 500, factor: 2, jitter: 0 },
      setTimeoutFn: timers.setTimeoutFn,
      clearTimeoutFn: timers.clearTimeoutFn,
    });

    const startPromise = loop.start();
    for (let i = 0; i < 6; i++) {
      await timers.waitForPending();
      timers.fireOldest();
    }
    await startPromise;

    // 100, 200, 400, 500, 500, 500 — capped at maxMs from attempt 4 onward.
    test.equal(timers.delays.slice(0, 6), [100, 200, 400, 500, 500, 500]);
  });

  // 9b. Jitter applied — random()=0.5 yields jitterMul=1, random()=0 yields 1-jitter.
  Tinytest.add('afs - reconnect-loop - jitter applied to delay', (test) => {
    const samples = [];
    const loop = new AFS.ReconnectLoop({
      doReconnect: async () => {},
      backoff: { initialMs: 1000, maxMs: 100000, factor: 1, jitter: 0.2 },
      random: () => 0, // jitterMul = 1 + 0.2*(0*2 - 1) = 0.8
    });
    samples.push(loop._computeDelay(0));

    const loop2 = new AFS.ReconnectLoop({
      doReconnect: async () => {},
      backoff: { initialMs: 1000, maxMs: 100000, factor: 1, jitter: 0.2 },
      random: () => 1, // jitterMul = 1 + 0.2*(1*2 - 1) = 1.2
    });
    samples.push(loop2._computeDelay(0));

    test.equal(samples[0], 800);
    test.equal(samples[1], 1200);
  });

  // 10. End-to-end with real timers (sanity that the default code path works).
  Tinytest.addAsync('afs - reconnect-loop - real timer success', async (test) => {
    let calls = 0;
    const loop = new AFS.ReconnectLoop({
      doReconnect: async () => {
        calls += 1;
        if (calls < 2) throw new Error('flake');
      },
      backoff: { initialMs: 1, maxMs: 5, factor: 2, jitter: 0 },
    });

    const result = await loop.start();
    test.equal(result, { aborted: false });
    test.equal(calls, 2);
  });

  // 11. running flag transitions correctly.
  Tinytest.addAsync('afs - reconnect-loop - running flag', async (test) => {
    const timers = makeFakeTimers();
    const loop = new AFS.ReconnectLoop({
      doReconnect: async () => {},
      backoff: { initialMs: 50, jitter: 0 },
      setTimeoutFn: timers.setTimeoutFn,
      clearTimeoutFn: timers.clearTimeoutFn,
    });

    test.isFalse(loop.running);
    const p = loop.start();
    test.isTrue(loop.running);
    await timers.waitForPending();
    timers.fireOldest();
    await p;
    test.isFalse(loop.running);
  });

}
