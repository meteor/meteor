import { Tinytest } from 'meteor/tinytest';
import { SubscriptionRegistry } from '../subscription-registry';

// =============================================================================
// SubscriptionRegistry — per-key serialization queue tests
// =============================================================================

if (Meteor.isServer) {

  function deferred() {
    let resolve, reject;
    const p = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise: p, resolve, reject };
  }

  Tinytest.addAsync(
    'afs - subscription-registry - run() - single key, sequential ordering',
    async (test) => {
      const reg = new SubscriptionRegistry();
      const events = [];
      const gate = deferred();

      const p1 = reg.run('k', async () => {
        events.push('fn1:start');
        await gate.promise;
        events.push('fn1:end');
        return 'r1';
      });
      const p2 = reg.run('k', async () => {
        events.push('fn2:start');
        return 'r2';
      });

      // fn2 must NOT have started yet — fn1 is still blocked on gate.
      await Promise.resolve();
      await Promise.resolve();
      test.equal(events, ['fn1:start']);

      gate.resolve();
      const [r1, r2] = await Promise.all([p1, p2]);
      test.equal(r1, 'r1');
      test.equal(r2, 'r2');
      test.equal(events, ['fn1:start', 'fn1:end', 'fn2:start']);
    }
  );

  Tinytest.addAsync(
    'afs - subscription-registry - run() - two keys run in parallel',
    async (test) => {
      const reg = new SubscriptionRegistry();
      const gateA = deferred();
      const gateB = deferred();
      const events = [];

      const pA = reg.run('a', async () => {
        events.push('a:start');
        await gateA.promise;
        events.push('a:end');
      });
      const pB = reg.run('b', async () => {
        events.push('b:start');
        await gateB.promise;
        events.push('b:end');
      });

      // Both should have started — different keys do not block each other.
      await Promise.resolve();
      await Promise.resolve();
      test.include(events, 'a:start');
      test.include(events, 'b:start');

      // Resolve in reverse order to prove they truly are independent.
      gateB.resolve();
      gateA.resolve();
      await Promise.all([pA, pB]);
      test.include(events, 'a:end');
      test.include(events, 'b:end');
    }
  );

  Tinytest.addAsync(
    'afs - subscription-registry - run() - failure does not break later ops on same key',
    async (test) => {
      const reg = new SubscriptionRegistry();
      const events = [];

      const p1 = reg.run('k', async () => {
        events.push('fn1');
        throw new Error('boom');
      });
      const p2 = reg.run('k', async () => {
        events.push('fn2');
        return 'r2';
      });

      let caught1 = null;
      try { await p1; } catch (e) { caught1 = e; }
      test.isTrue(caught1 instanceof Error);
      test.equal(caught1.message, 'boom');

      const r2 = await p2;
      test.equal(r2, 'r2');
      test.equal(events, ['fn1', 'fn2']);
    }
  );

  Tinytest.addAsync(
    'afs - subscription-registry - dropAtomically() - after settle and no more ops, key is not busy',
    async (test) => {
      // Contract: dropAtomically is structurally identical to run — it's a
      // labeled call that signals "this op is the last for this key." The
      // empty-key cleanup happens once nothing newer owns the slot. So:
      // after dropAtomically settles AND no further ops are queued,
      // isBusy(key) MUST return false (the same outcome as run).
      const reg = new SubscriptionRegistry();
      const dropped = [];

      await reg.dropAtomically('k', async () => {
        dropped.push('teardown');
      });
      // Allow the finally-handler microtask to run before asserting.
      await Promise.resolve();
      await Promise.resolve();

      test.equal(dropped, ['teardown']);
      test.isFalse(reg.isBusy('k'));
    }
  );

  Tinytest.addAsync(
    'afs - subscription-registry - dropAtomically() - removes key on throw, next run() proceeds',
    async (test) => {
      const reg = new SubscriptionRegistry();

      let caught = null;
      try {
        await reg.dropAtomically('k', async () => {
          throw new Error('drop-failure');
        });
      } catch (e) { caught = e; }
      test.isTrue(caught instanceof Error);
      test.equal(caught.message, 'drop-failure');

      // Slot must be released even though the op failed — next run for the
      // same key should execute fresh (no phantom queueing).
      let ran = false;
      await reg.run('k', async () => { ran = true; });
      test.isTrue(ran);
    }
  );

  Tinytest.addAsync(
    'afs - subscription-registry - drain() - resolves after all queues settle',
    async (test) => {
      const reg = new SubscriptionRegistry();
      const gateA = deferred();
      const gateB = deferred();

      let aDone = false, bDone = false;
      reg.run('a', async () => { await gateA.promise; aDone = true; });
      reg.run('b', async () => { await gateB.promise; bDone = true; });

      let drained = false;
      const drainPromise = reg.drain().then(() => { drained = true; });

      // Drain should still be waiting because both keys are blocked.
      await Promise.resolve();
      await Promise.resolve();
      test.isFalse(drained);

      gateA.resolve();
      gateB.resolve();
      await drainPromise;
      test.isTrue(aDone);
      test.isTrue(bDone);
      test.isTrue(drained);
    }
  );

  Tinytest.addAsync(
    'afs - subscription-registry - recursive run(key,...) inside an op deadlocks if awaited',
    async (test) => {
      const reg = new SubscriptionRegistry();

      // If an op awaits a recursive run() on the same key, it deadlocks:
      // the inner is queued behind the outer's tail, but the outer cannot
      // settle until the inner does. We prove the outer never settles by
      // racing it against a timeout.
      const timeoutSentinel = Symbol('TIMEOUT');

      const outer = reg.run('k', async () => {
        // Awaiting the inner would block the outer from ever returning —
        // and the inner itself can't run until the outer's chain settles.
        await reg.run('k', async () => 'inner-result');
        return 'outer-result';
      });
      // Don't await `outer` at top level — it's the deadlock under test.
      // Suppress unhandled-rejection noise if test runner watches it.
      outer.catch(() => {});

      const winner = await Promise.race([
        outer.then((r) => ({ settled: r }), (e) => ({ failed: e })),
        new Promise((res) => setTimeout(() => res(timeoutSentinel), 50)),
      ]);
      test.equal(winner, timeoutSentinel,
        'recursive awaited run() on the same key should hang (deadlock by design)');

      // We intentionally leave `outer` pending. Tinytest tolerates
      // dangling promises; we cannot rescue this op without changing the
      // contract under test.
    }
  );

}
