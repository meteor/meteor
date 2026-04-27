import { Tinytest } from 'meteor/tinytest';

// =============================================================================
// PollingStreamProvider tests (server only)
//
// A test subclass exposes a `setSnapshot()` queue and an `errorOnce()` /
// `errorAlways()` knob, then we drive _runPoll directly to avoid burning
// wall-clock time on the cadence timer. The cadence-timer behavior IS still
// covered (coalesce test) using a tiny pollIntervalMs and microtask flushes.
// =============================================================================

if (Meteor.isServer) {

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Test subclass: snapshot is supplied per-fetch via setSnapshot()
   * (queue-style). errorOnce / errorAlways inject failures.
   */
  function makeTestProvider(opts = {}) {
    class TestPollingProvider extends AFS.PollingStreamProvider {
      constructor(o = {}) {
        super({ name: 'test-polling', ...o });
        this._snapshotQueue = [];
        this._defaultSnapshot = [];
        this._errorOnceErr = null;
        this._errorAlwaysErr = null;
        this._fatalChecker = (err) => err && err.fatal === true;
        this._fetchCalls = 0;
        this._fetchDelayMs = 0;
        this._pushAttachCalls = 0;
        this._pushDetachCalls = 0;
      }
      async _fetchSnapshot(_cursorDescription) {
        this._fetchCalls += 1;
        if (this._fetchDelayMs > 0) {
          await new Promise(r => setTimeout(r, this._fetchDelayMs));
        }
        if (this._errorOnceErr) {
          const e = this._errorOnceErr;
          this._errorOnceErr = null;
          throw e;
        }
        if (this._errorAlwaysErr) {
          throw this._errorAlwaysErr;
        }
        if (this._snapshotQueue.length > 0) {
          return this._snapshotQueue.shift();
        }
        return this._defaultSnapshot;
      }
      _isFatalFetchError(err) {
        return this._fatalChecker(err);
      }
      _attachPushSignal(_cursorDescription, onChange) {
        this._pushAttachCalls += 1;
        this._pushSignalCb = onChange;
        return () => { this._pushDetachCalls += 1; this._pushSignalCb = null; };
      }
      enqueueSnapshot(snap) { this._snapshotQueue.push(snap); }
      setDefaultSnapshot(snap) { this._defaultSnapshot = snap; }
      // Exposed for tests
      _getCtx(cursorDescription) {
        return this._pollers.get(this._cursorKey(cursorDescription));
      }
    }
    return new TestPollingProvider(opts);
  }

  // Collect every event emitted on the stream.
  function collectStreamEvents(stream) {
    const events = [];
    const all = [
      'added', 'addedBefore', 'changed', 'movedBefore', 'removed',
      'ready', 'error', 'reset',
      'reconnecting', 'reconnected',
    ];
    for (const evt of all) {
      stream.on(evt, (...args) => events.push({ evt, args }));
    }
    return events;
  }

  // Bind a multiplexer so the stream's emissions aren't dropped (multiplexer
  // also exercises the more realistic data path for added/changed/removed
  // delivery). For tests that just want the raw stream, skip the multiplexer.
  async function startObserve(provider, cursorDescription, ordered = false) {
    const result = provider.startObserving(cursorDescription, ordered);
    return result; // { stream, teardown }
  }

  function flushMicrotasks(n = 4) {
    let p = Promise.resolve();
    for (let i = 0; i < n; i++) p = p.then(() => undefined);
    return p;
  }

  // Wait until `cond()` returns truthy or `timeoutMs` elapses (default 1s).
  async function waitFor(cond, { timeoutMs = 1000, intervalMs = 5 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (cond()) return;
      await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error('waitFor: condition never satisfied within ' + timeoutMs + 'ms');
  }

  // ---------------------------------------------------------------------------
  // 1. Initial snapshot fires `added` for all rows + `markReady`.
  // ---------------------------------------------------------------------------
  Tinytest.addAsync(
    'afs - polling - initial snapshot fires added for each doc + markReady',
    async (test) => {
      const provider = makeTestProvider({ pollIntervalMs: 60_000 });
      provider.setDefaultSnapshot([
        { _id: 'a', n: 1 },
        { _id: 'b', n: 2 },
      ]);
      const desc = { collectionName: 'c', selector: {}, options: {} };
      const { stream, teardown } = await startObserve(provider, desc, false);
      const events = collectStreamEvents(stream);

      await waitFor(() => events.some(e => e.evt === 'ready'));

      const adds = events.filter(e => e.evt === 'added');
      test.equal(adds.length, 2);
      test.equal(adds[0].args[0], 'a');
      test.equal(adds[0].args[1].n, 1);
      test.equal(adds[1].args[0], 'b');
      test.equal(adds[1].args[1].n, 2);
      test.isTrue(events.some(e => e.evt === 'ready'));

      teardown();
    }
  );

  // ---------------------------------------------------------------------------
  // 2. Subsequent identical snapshot fires no events.
  // ---------------------------------------------------------------------------
  Tinytest.addAsync(
    'afs - polling - identical second snapshot fires no events',
    async (test) => {
      const provider = makeTestProvider({ pollIntervalMs: 60_000 });
      provider.setDefaultSnapshot([{ _id: 'a', n: 1 }]);
      const desc = { collectionName: 'c', selector: {}, options: {} };
      const { stream, teardown } = await startObserve(provider, desc, false);
      const events = collectStreamEvents(stream);

      await waitFor(() => events.some(e => e.evt === 'ready'));

      // Snapshot identical → second poll should produce nothing.
      const before = events.length;
      const ctx = provider._getCtx(desc);
      await provider._runPoll(ctx);

      const after = events.slice(before);
      test.equal(after.filter(e => e.evt === 'added').length, 0);
      test.equal(after.filter(e => e.evt === 'changed').length, 0);
      test.equal(after.filter(e => e.evt === 'removed').length, 0);

      teardown();
    }
  );

  // ---------------------------------------------------------------------------
  // 3. Doc added in second snapshot fires `added`.
  // ---------------------------------------------------------------------------
  Tinytest.addAsync(
    'afs - polling - new doc in 2nd snapshot fires added',
    async (test) => {
      const provider = makeTestProvider({ pollIntervalMs: 60_000 });
      provider.setDefaultSnapshot([{ _id: 'a', n: 1 }]);
      const desc = { collectionName: 'c', selector: {}, options: {} };
      const { stream, teardown } = await startObserve(provider, desc, false);
      const events = collectStreamEvents(stream);
      await waitFor(() => events.some(e => e.evt === 'ready'));

      const before = events.length;
      provider.setDefaultSnapshot([{ _id: 'a', n: 1 }, { _id: 'b', n: 2 }]);
      const ctx = provider._getCtx(desc);
      await provider._runPoll(ctx);

      const newAdds = events.slice(before).filter(e => e.evt === 'added');
      test.equal(newAdds.length, 1);
      test.equal(newAdds[0].args[0], 'b');
      test.equal(newAdds[0].args[1].n, 2);

      teardown();
    }
  );

  // ---------------------------------------------------------------------------
  // 4. Doc removed in second snapshot fires `removed`.
  // ---------------------------------------------------------------------------
  Tinytest.addAsync(
    'afs - polling - missing doc in 2nd snapshot fires removed',
    async (test) => {
      const provider = makeTestProvider({ pollIntervalMs: 60_000 });
      provider.setDefaultSnapshot([{ _id: 'a' }, { _id: 'b' }]);
      const desc = { collectionName: 'c', selector: {}, options: {} };
      const { stream, teardown } = await startObserve(provider, desc, false);
      const events = collectStreamEvents(stream);
      await waitFor(() => events.some(e => e.evt === 'ready'));

      const before = events.length;
      provider.setDefaultSnapshot([{ _id: 'a' }]);
      const ctx = provider._getCtx(desc);
      await provider._runPoll(ctx);

      const removes = events.slice(before).filter(e => e.evt === 'removed');
      test.equal(removes.length, 1);
      test.equal(removes[0].args[0], 'b');

      teardown();
    }
  );

  // ---------------------------------------------------------------------------
  // 5. Doc changed in second snapshot fires `changed`.
  // ---------------------------------------------------------------------------
  Tinytest.addAsync(
    'afs - polling - field change fires changed with delta',
    async (test) => {
      const provider = makeTestProvider({ pollIntervalMs: 60_000 });
      provider.setDefaultSnapshot([{ _id: 'a', n: 1, k: 'x' }]);
      const desc = { collectionName: 'c', selector: {}, options: {} };
      const { stream, teardown } = await startObserve(provider, desc, false);
      const events = collectStreamEvents(stream);
      await waitFor(() => events.some(e => e.evt === 'ready'));

      const before = events.length;
      provider.setDefaultSnapshot([{ _id: 'a', n: 2, k: 'x' }]);
      const ctx = provider._getCtx(desc);
      await provider._runPoll(ctx);

      const changes = events.slice(before).filter(e => e.evt === 'changed');
      test.equal(changes.length, 1);
      test.equal(changes[0].args[0], 'a');
      // changed delivers a fields delta — only `n` should be in it.
      test.equal(changes[0].args[1].n, 2);
      test.isUndefined(changes[0].args[1].k);

      teardown();
    }
  );

  // ---------------------------------------------------------------------------
  // 6. Ordered observe: doc moved fires `movedBefore`.
  // ---------------------------------------------------------------------------
  Tinytest.addAsync(
    'afs - polling - ordered: moved doc fires movedBefore',
    async (test) => {
      const provider = makeTestProvider({ pollIntervalMs: 60_000 });
      provider.setDefaultSnapshot([
        { _id: 'a', n: 1 },
        { _id: 'b', n: 2 },
        { _id: 'c', n: 3 },
      ]);
      const desc = { collectionName: 'c', selector: {}, options: {} };
      const { stream, teardown } = await startObserve(provider, desc, true);
      const events = collectStreamEvents(stream);
      await waitFor(() => events.some(e => e.evt === 'ready'));

      // Initial: 3 addedBefore.
      const initialAdds = events.filter(e => e.evt === 'addedBefore');
      test.equal(initialAdds.length, 3);

      // Reorder: c moves before a.
      const before = events.length;
      provider.setDefaultSnapshot([
        { _id: 'c', n: 3 },
        { _id: 'a', n: 1 },
        { _id: 'b', n: 2 },
      ]);
      const ctx = provider._getCtx(desc);
      await provider._runPoll(ctx);

      const moves = events.slice(before).filter(e => e.evt === 'movedBefore');
      test.isTrue(moves.length >= 1, 'at least one movedBefore should fire');
      test.isTrue(moves.some(m => m.args[0] === 'c'),
        'c is the doc that moved to the front');

      teardown();
    }
  );

  // ---------------------------------------------------------------------------
  // 7. Coalesce: ticks during a slow fetch produce one extra poll.
  // ---------------------------------------------------------------------------
  Tinytest.addAsync(
    'afs - polling - coalesces overlapping requestImmediatePoll calls',
    async (test) => {
      const provider = makeTestProvider({ pollIntervalMs: 60_000 });
      provider.setDefaultSnapshot([{ _id: 'a' }]);
      const desc = { collectionName: 'c', selector: {}, options: {} };
      const { stream, teardown } = await startObserve(provider, desc, false);
      const events = collectStreamEvents(stream);
      await waitFor(() => events.some(e => e.evt === 'ready'));

      const fetchesAfterReady = provider._fetchCalls;
      // Slow next fetch.
      provider._fetchDelayMs = 30;
      const ctx = provider._getCtx(desc);
      // Manually start one poll (don't await) — it will be in-flight while we
      // request more.
      const inFlight = provider._runPoll(ctx);
      // Race in two more requests while the poll is in flight.
      provider.requestImmediatePoll(desc);
      provider.requestImmediatePoll(desc);
      provider.requestImmediatePoll(desc);
      await inFlight;
      // Allow the coalesced repoll microtask to run.
      await flushMicrotasks(8);
      // Wait for repoll's fetch to actually complete.
      provider._fetchDelayMs = 0;
      await waitFor(() => provider._fetchCalls >= fetchesAfterReady + 2);

      // We expect: 1 in-flight poll + 1 coalesced repoll = 2 fetches added.
      // Even though we asked 3 extra times, coalesce should drop to 1.
      const delta = provider._fetchCalls - fetchesAfterReady;
      test.equal(delta, 2, 'expected exactly 2 fetches: original + 1 coalesced repoll');

      teardown();
    }
  );

  // ---------------------------------------------------------------------------
  // 8. Fetch failure → markReconnecting → recovery → markReconnected.
  // ---------------------------------------------------------------------------
  Tinytest.addAsync(
    'afs - polling - transient failure engages reconnect loop and recovers',
    async (test) => {
      const provider = makeTestProvider({
        pollIntervalMs: 60_000,
        backoff: { initialMs: 1, maxMs: 5, factor: 1, jitter: 0, immediateFirst: true },
      });
      provider.setDefaultSnapshot([{ _id: 'a' }]);
      const desc = { collectionName: 'c', selector: {}, options: {} };
      const { stream, teardown } = await startObserve(provider, desc, false);
      const events = collectStreamEvents(stream);
      await waitFor(() => events.some(e => e.evt === 'ready'));

      // Inject a one-shot transient failure and run a poll. Reconnect loop
      // engages; on next attempt fetch succeeds (errorOnce cleared itself).
      provider._errorOnceErr = new Error('boom');
      const ctx = provider._getCtx(desc);
      await provider._runPoll(ctx);
      // Reconnect loop runs in background — wait for it to finish.
      await waitFor(() => events.some(e => e.evt === 'reconnected'));

      test.isTrue(events.some(e => e.evt === 'reconnecting'),
        'expected reconnecting event');
      test.isTrue(events.some(e => e.evt === 'reconnected'),
        'expected reconnected event after recovery');
      test.isFalse(events.some(e => e.evt === 'reset'),
        'should not reset on successful recovery');

      teardown();
    }
  );

  // ---------------------------------------------------------------------------
  // 9. Fetch failure with maxAttempts exhausted → markReset + teardown.
  // ---------------------------------------------------------------------------
  Tinytest.addAsync(
    'afs - polling - exhausted reconnect loop emits markReset and stops',
    async (test) => {
      const provider = makeTestProvider({
        pollIntervalMs: 60_000,
        backoff: { initialMs: 1, maxMs: 5, factor: 1, jitter: 0, maxAttempts: 2, immediateFirst: true },
      });
      provider.setDefaultSnapshot([{ _id: 'a' }]);
      const desc = { collectionName: 'c', selector: {}, options: {} };
      const { stream, teardown } = await startObserve(provider, desc, false);
      const events = collectStreamEvents(stream);
      await waitFor(() => events.some(e => e.evt === 'ready'));

      // Permanent transient failure (still classified as transient because
      // _isFatalFetchError defaults to false; it's the maxAttempts that
      // ends the loop).
      provider._errorAlwaysErr = new Error('always-fail');
      const ctx = provider._getCtx(desc);
      await provider._runPoll(ctx);
      await waitFor(() => events.some(e => e.evt === 'reset'));
      // markError fires right after markReset on exhaustion; wait for it
      // before asserting on order.
      await waitFor(() => events.some(e => e.evt === 'error'));

      test.isTrue(events.some(e => e.evt === 'reconnecting'));
      test.isTrue(events.some(e => e.evt === 'reset'));
      // Both markReset AND markError should have fired, with reset BEFORE
      // error — the order matches "snapshot is invalid, here is why."
      test.isTrue(events.some(e => e.evt === 'error'),
        'markError should also fire on reconnect-loop exhaustion');
      const resetIdx = events.findIndex(e => e.evt === 'reset');
      const errorIdx = events.findIndex(e => e.evt === 'error');
      test.isTrue(resetIdx >= 0 && errorIdx >= 0,
        'both reset and error events must be present');
      test.isTrue(resetIdx < errorIdx,
        'markReset must be emitted before markError on exhaustion');
      // Poller should be cleaned up.
      test.isUndefined(provider._getCtx(desc),
        'poller should be removed from registry after exhaustion');

      teardown();
    }
  );

  // ---------------------------------------------------------------------------
  // 10. requestImmediatePoll triggers an out-of-cycle poll.
  // ---------------------------------------------------------------------------
  Tinytest.addAsync(
    'afs - polling - requestImmediatePoll fires out-of-cycle fetch',
    async (test) => {
      const provider = makeTestProvider({ pollIntervalMs: 60_000 });
      provider.setDefaultSnapshot([]);
      const desc = { collectionName: 'c', selector: {}, options: {} };
      const { stream, teardown } = await startObserve(provider, desc, false);
      const events = collectStreamEvents(stream);
      await waitFor(() => events.some(e => e.evt === 'ready'));

      const fetchesAfterReady = provider._fetchCalls;
      // _attachPushSignal should have run.
      test.equal(provider._pushAttachCalls, 1);
      // Add a doc and ask for an immediate poll.
      provider.setDefaultSnapshot([{ _id: 'late', n: 99 }]);
      provider.requestImmediatePoll(desc);
      await waitFor(() => provider._fetchCalls > fetchesAfterReady);
      // Wait for diff to land.
      await waitFor(() => events.some(e => e.evt === 'added' && e.args[0] === 'late'));

      const lateAdd = events.find(e => e.evt === 'added' && e.args[0] === 'late');
      test.isTrue(!!lateAdd, 'requestImmediatePoll should produce the new added event');

      teardown();
    }
  );

  // ---------------------------------------------------------------------------
  // 11. Teardown cancels timer + awaits in-flight poll.
  // ---------------------------------------------------------------------------
  Tinytest.addAsync(
    'afs - polling - teardown clears timer, detaches push signal, stops loop',
    async (test) => {
      const provider = makeTestProvider({
        pollIntervalMs: 5,  // short cadence to ensure a timer is armed.
        backoff: { initialMs: 1, maxMs: 5, factor: 1, jitter: 0, immediateFirst: true },
      });
      provider.setDefaultSnapshot([{ _id: 'a' }]);
      const desc = { collectionName: 'c', selector: {}, options: {} };
      const { stream, teardown } = await startObserve(provider, desc, false);
      const events = collectStreamEvents(stream);
      await waitFor(() => events.some(e => e.evt === 'ready'));

      const ctx = provider._getCtx(desc);
      test.isTrue(!!ctx, 'ctx exists pre-teardown');
      // A timer should have been armed for the next cadence tick.
      test.isTrue(ctx.timer !== null || ctx.polling || ctx.repollNeeded);

      teardown();

      test.isTrue(ctx.stopped, 'ctx marked stopped');
      test.isNull(ctx.timer, 'cadence timer cleared');
      test.equal(provider._pushDetachCalls, 1, 'push signal detached on teardown');
      test.isUndefined(provider._getCtx(desc), 'ctx removed from registry');

      // Even after teardown, no further fetches should land. Wait a bit and
      // check no new events accumulate.
      const before = provider._fetchCalls;
      await new Promise(r => setTimeout(r, 30));
      test.equal(provider._fetchCalls, before, 'no fetches after teardown');
    }
  );
}
