import { Tinytest } from 'meteor/tinytest';

// ============================================================================
// AFS observe / ObserveMultiplexer coverage gap tests
//
// These tests focus on behavior that is either untested or only weakly
// asserted in `afs-tests.js`. They exercise:
//   - ordered observe() callbacks (addedAt / changedAt / removedAt / movedTo)
//   - ObserveMultiplexer._handlesNeedCloning() fan-out isolation
//   - async-callback error paths that should not crash the multiplexer
//   - stopping a handle from inside another handle's callback
//   - handle reference counting / onEmpty semantics
//   - initial-adds sequencing and error tolerance
//
// All tests are server-only because ObserveMultiplexer is a server concept
// (client-side collections use Minimongo cursors directly).
// ============================================================================

if (Meteor.isServer) {
  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  /**
   * Monkey-patch console.error and Meteor._debug for the duration of a test
   * body. Returns a restore function plus the captured log array.
   */
  function captureConsoleErrors() {
    const logs = [];
    const origConsoleError = console.error;
    const origMeteorDebug = Meteor._debug;
    console.error = (...args) => { logs.push({ kind: 'console.error', args }); };
    Meteor._debug = (...args) => { logs.push({ kind: 'Meteor._debug', args }); };
    return {
      logs,
      restore() {
        console.error = origConsoleError;
        Meteor._debug = origMeteorDebug;
      },
    };
  }

  /**
   * Wait one microtask tick — used after synchronous event emits to let
   * any .catch() handlers on rejected-promise callbacks run.
   */
  function flushMicrotasks() {
    return Promise.resolve().then(() => Promise.resolve());
  }

  // --------------------------------------------------------------------------
  // Ordered observe() callbacks
  // --------------------------------------------------------------------------

  Tinytest.addAsync('afs - observe - addedAt fires for single insert with atIndex=0 and before=null', async (test) => {
    const provider = new AFS.MockStreamProvider();
    const name = 'addedAt-single-' + Random.id();

    const cursor = new AFS.Cursor(provider, name, {});
    const events = [];
    const handle = await cursor.observeAsync({
      addedAt(doc, atIndex, before) {
        events.push({ type: 'addedAt', id: doc._id, name: doc.name, atIndex, before });
      },
      changedAt() {},
      removedAt() {},
      movedTo() {},
    });

    // Initial state empty — insert ONE doc.
    const id = await provider.insertAsync(name, { name: 'Only' });
    await flushMicrotasks();

    test.equal(events.length, 1);
    test.equal(events[0].type, 'addedAt');
    test.equal(events[0].id, id);
    test.equal(events[0].name, 'Only');
    test.equal(events[0].atIndex, 0);
    test.equal(events[0].before, null);

    handle.stop();
  });

  Tinytest.addAsync('afs - observe - addedAt fires for each initial doc with correct atIndex and before (sorted)', async (test) => {
    const provider = new AFS.MockStreamProvider();
    const collName = 'addedAt-initial-' + Random.id();

    // Insert BEFORE observing so we exercise the initial-adds path.
    const idA = await provider.insertAsync(collName, { name: 'A', order: 1 });
    const idB = await provider.insertAsync(collName, { name: 'B', order: 2 });
    const idC = await provider.insertAsync(collName, { name: 'C', order: 3 });

    const cursor = new AFS.Cursor(provider, collName, {}, { sort: { order: 1 } });

    const events = [];
    const handle = await cursor.observeAsync({
      addedAt(doc, atIndex, before) {
        events.push({ id: doc._id, name: doc.name, atIndex, before });
      },
      changedAt() {},
      removedAt() {},
      movedTo() {},
    });

    // Three initial addedAt, delivered in order with correct atIndex and
    // before values for a sorted set.
    test.equal(events.length, 3);
    test.equal(events[0].id, idA);
    test.equal(events[0].atIndex, 0);
    test.equal(events[1].id, idB);
    test.equal(events[1].atIndex, 1);
    test.equal(events[2].id, idC);
    test.equal(events[2].atIndex, 2);

    // In _observeFromObserveChanges, addedAt carries the `before` id of the
    // doc that this one should be inserted before (null for append-to-end).
    // The last doc always has before=null.
    test.equal(events[events.length - 1].before, null);

    handle.stop();
  });

  Tinytest.addAsync('afs - observe - live insert in sorted middle gets correct atIndex', async (test) => {
    const provider = new AFS.MockStreamProvider();
    const collName = 'addedAt-middle-' + Random.id();

    await provider.insertAsync(collName, { name: 'A', order: 1 });
    await provider.insertAsync(collName, { name: 'C', order: 3 });

    const cursor = new AFS.Cursor(provider, collName, {}, { sort: { order: 1 } });

    const events = [];
    const handle = await cursor.observeAsync({
      addedAt(doc, atIndex, before) {
        events.push({ phase: 'addedAt', name: doc.name, atIndex, before });
      },
      changedAt() {},
      removedAt() {},
      movedTo() {},
    });

    // After initial adds — two events.
    test.equal(events.length, 2);
    test.equal(events[0].name, 'A');
    test.equal(events[0].atIndex, 0);
    test.equal(events[1].name, 'C');
    test.equal(events[1].atIndex, 1);

    // Insert B which belongs between A and C.
    await provider.insertAsync(collName, { name: 'B', order: 2 });
    await flushMicrotasks();

    // Expect a third addedAt for B at index 1.
    test.equal(events.length, 3);
    const bEvent = events[2];
    test.equal(bEvent.name, 'B');
    test.equal(bEvent.atIndex, 1);

    handle.stop();
  });

  Tinytest.addAsync('afs - observe - changedAt fires when sort order is preserved', async (test) => {
    const provider = new AFS.MockStreamProvider();
    const collName = 'changedAt-' + Random.id();

    const idA = await provider.insertAsync(collName, { name: 'A', order: 1, extra: 'first' });
    const idB = await provider.insertAsync(collName, { name: 'B', order: 2, extra: 'second' });

    const cursor = new AFS.Cursor(provider, collName, {}, { sort: { order: 1 } });

    const events = [];
    const handle = await cursor.observeAsync({
      addedAt() {},
      changedAt(newDoc, oldDoc, atIndex) {
        events.push({ type: 'changedAt', newExtra: newDoc.extra, oldExtra: oldDoc.extra, atIndex });
      },
      removedAt() {},
      movedTo() {
        events.push({ type: 'movedTo' });
      },
    });

    // Mutate `extra` on B — no effect on sort (which is by `order`).
    await provider.updateAsync(collName, { _id: idB }, { $set: { extra: 'second-updated' } });
    await flushMicrotasks();

    test.equal(events.length, 1);
    test.equal(events[0].type, 'changedAt');
    test.equal(events[0].newExtra, 'second-updated');
    test.equal(events[0].oldExtra, 'second');
    test.equal(events[0].atIndex, 1);

    // Ensure no movedTo fired.
    test.isFalse(events.some(e => e.type === 'movedTo'));

    handle.stop();
  });

  Tinytest.addAsync('afs - observe - movedTo fires when sort order changes', async (test) => {
    const provider = new AFS.MockStreamProvider();
    const collName = 'movedTo-' + Random.id();

    const idA = await provider.insertAsync(collName, { name: 'A', order: 1 });
    const idB = await provider.insertAsync(collName, { name: 'B', order: 2 });

    const cursor = new AFS.Cursor(provider, collName, {}, { sort: { order: 1 } });

    const moves = [];
    const changes = [];
    const handle = await cursor.observeAsync({
      addedAt() {},
      changedAt(newDoc, oldDoc, atIndex) { changes.push({ atIndex }); },
      removedAt() {},
      movedTo(newDoc, oldIndex, newIndex, before) {
        moves.push({ id: newDoc._id, oldIndex, newIndex, before });
      },
    });

    // Flip the sort order: push A's order past B's.
    await provider.updateAsync(collName, { _id: idA }, { $set: { order: 3 } });
    await flushMicrotasks();

    test.equal(moves.length, 1);
    test.equal(moves[0].id, idA);
    test.equal(moves[0].oldIndex, 0);
    test.equal(moves[0].newIndex, 1);
    // After the move A is at the end, so `before` should be null.
    test.equal(moves[0].before, null);

    handle.stop();
  });

  Tinytest.addAsync('afs - observe - removedAt fires with correct atIndex', async (test) => {
    const provider = new AFS.MockStreamProvider();
    const collName = 'removedAt-' + Random.id();

    await provider.insertAsync(collName, { name: 'A', order: 1 });
    const idB = await provider.insertAsync(collName, { name: 'B', order: 2 });
    await provider.insertAsync(collName, { name: 'C', order: 3 });

    const cursor = new AFS.Cursor(provider, collName, {}, { sort: { order: 1 } });

    const removed = [];
    const handle = await cursor.observeAsync({
      addedAt() {},
      changedAt() {},
      removedAt(oldDoc, atIndex) {
        removed.push({ id: oldDoc._id, name: oldDoc.name, atIndex });
      },
      movedTo() {},
    });

    await provider.removeAsync(collName, { _id: idB });
    await flushMicrotasks();

    test.equal(removed.length, 1);
    test.equal(removed[0].id, idB);
    test.equal(removed[0].name, 'B');
    test.equal(removed[0].atIndex, 1);

    handle.stop();
  });

  Tinytest.addAsync('afs - observe - observeChanges does not receive *At callbacks', async (test) => {
    const provider = new AFS.MockStreamProvider();
    const collName = 'observeChanges-no-at-' + Random.id();

    await provider.insertAsync(collName, { name: 'A' });
    const cursor = new AFS.Cursor(provider, collName, {});

    const fired = { added: 0, changed: 0, removed: 0, addedAt: 0, changedAt: 0, removedAt: 0, movedTo: 0 };

    const handle = await cursor.observeChangesAsync({
      added() { fired.added++; },
      changed() { fired.changed++; },
      removed() { fired.removed++; },
      // These should never fire on the observeChanges path; include them so
      // we can assert they remain at zero even if the impl leaked them.
      addedAt() { fired.addedAt++; },
      changedAt() { fired.changedAt++; },
      removedAt() { fired.removedAt++; },
      movedTo() { fired.movedTo++; },
    });

    // Initial add should fire on `added`, NOT `addedAt`.
    test.equal(fired.added, 1);
    test.equal(fired.addedAt, 0);

    await provider.insertAsync(collName, { name: 'B' });
    await flushMicrotasks();
    test.equal(fired.added, 2);
    test.equal(fired.addedAt, 0);
    test.equal(fired.changedAt, 0);
    test.equal(fired.removedAt, 0);
    test.equal(fired.movedTo, 0);

    handle.stop();
  });

  // --------------------------------------------------------------------------
  // Multiplexer fan-out isolation (_handlesNeedCloning)
  // --------------------------------------------------------------------------

  Tinytest.addAsync('afs - observe - multiplexer clones fields when at least one handle is mutating', async (test) => {
    // Two handles, both mutating. A mutates its copy — B must still see original.
    const stream = new AFS.ChangeStream({ collectionName: 't', selector: {} });
    const multiplexer = new AFS.ObserveMultiplexer(stream, false);
    stream.markReady();

    const seenByA = [];
    const seenByB = [];

    const handleA = await multiplexer.addHandle({
      added(id, fields) {
        seenByA.push({ id, before: fields.name });
        fields.name = 'A-mutated';
      },
    });

    const handleB = await multiplexer.addHandle({
      added(id, fields) {
        seenByB.push({ id, name: fields.name });
      },
    });

    // Both A and B are mutating (default) and size > 1, so the multiplexer
    // must clone before broadcasting — B should NOT see A's mutation.
    stream.added('doc1', { name: 'original' });

    test.equal(seenByA.length, 1);
    test.equal(seenByA[0].before, 'original');
    test.equal(seenByB.length, 1);
    test.equal(seenByB[0].name, 'original');

    handleA.stop();
    handleB.stop();
  });

  Tinytest.addAsync('afs - observe - multiplexer skips clone when all handles are nonMutating', async (test) => {
    // Invariant under test: when every handle opts into nonMutatingCallbacks,
    // _handlesNeedCloning() returns false and the raw args object is passed
    // directly to each handle (no EJSON.clone). We verify this by asserting
    // identity: fields === origFields.
    const stream = new AFS.ChangeStream({ collectionName: 't', selector: {} });
    const multiplexer = new AFS.ObserveMultiplexer(stream, false);
    stream.markReady();

    const seenByA = [];
    const seenByB = [];

    const handleA = await multiplexer.addHandle(
      { added(id, fields) { seenByA.push(fields); } },
      { nonMutatingCallbacks: true }
    );
    const handleB = await multiplexer.addHandle(
      { added(id, fields) { seenByB.push(fields); } },
      { nonMutatingCallbacks: true }
    );

    const origFields = { name: 'original', n: 42 };
    stream.added('doc1', origFields);

    test.equal(seenByA.length, 1);
    test.equal(seenByB.length, 1);
    // Both handles should have received the EXACT same object reference as
    // was emitted by the producer. This proves no defensive clone happened.
    test.isTrue(seenByA[0] === origFields);
    test.isTrue(seenByB[0] === origFields);

    handleA.stop();
    handleB.stop();
  });

  Tinytest.addAsync('afs - observe - mixed mutating + non-mutating: non-mutating is not affected', async (test) => {
    const stream = new AFS.ChangeStream({ collectionName: 't', selector: {} });
    const multiplexer = new AFS.ObserveMultiplexer(stream, false);
    stream.markReady();

    const seenByA = [];
    const seenByB = [];

    // A is non-mutating. B is mutating (default).
    const handleA = await multiplexer.addHandle(
      { added(id, fields) { seenByA.push({ name: fields.name }); } },
      { nonMutatingCallbacks: true }
    );
    const handleB = await multiplexer.addHandle(
      { added(id, fields) {
          seenByB.push({ name: fields.name });
          fields.name = 'B-mutated';
        } }
    );

    // Because B is mutating and there is >1 handle, _handlesNeedCloning() is
    // true. B gets a clone and mutates THAT clone. A gets... also OK because
    // even though A could reuse args, the code path gives A the args-as-is
    // (nonMutatingCallbacks), and the clone is only built for mutating
    // handles. If the impl iterated in A-first order, A observes 'original'.
    // If B-first, A still observes 'original' because B mutates its private
    // clone, not the original args.
    stream.added('doc1', { name: 'original' });

    test.equal(seenByA.length, 1);
    test.equal(seenByA[0].name, 'original');
    test.equal(seenByB.length, 1);
    test.equal(seenByB[0].name, 'original');

    handleA.stop();
    handleB.stop();
  });

  // --------------------------------------------------------------------------
  // Async callback error path
  // --------------------------------------------------------------------------

  Tinytest.addAsync('afs - observe - async callback rejection is logged and does not block other handles', async (test) => {
    const cap = captureConsoleErrors();
    try {
      const stream = new AFS.ChangeStream({ collectionName: 't', selector: {} });
      const multiplexer = new AFS.ObserveMultiplexer(stream, false);
      stream.markReady();

      const seenByB = [];

      const handleA = await multiplexer.addHandle({
        async added(id, fields) {
          throw new Error('async-added-rejected');
        },
      });

      const handleB = await multiplexer.addHandle({
        added(id, fields) { seenByB.push(id); },
      });

      // Fire a live event — A's async callback rejects, B should still
      // receive it in the same synchronous fan-out.
      stream.added('docX', { v: 1 });

      // B receives synchronously regardless of A's rejection.
      test.equal(seenByB, ['docX']);

      // Fire a second event — prove the multiplexer is not wedged.
      stream.added('docY', { v: 2 });
      test.equal(seenByB, ['docX', 'docY']);

      // Let the rejected-promise `.catch()` handler run.
      await flushMicrotasks();

      // At least one log entry mentioning the rejection should have
      // been produced via console.error (per observe-multiplexer.js).
      const rejectionLogs = cap.logs.filter(l =>
        l.kind === 'console.error' &&
        l.args.some(a => a instanceof Error && /async-added-rejected/.test(a.message))
      );
      test.isTrue(rejectionLogs.length >= 1);

      handleA.stop();
      handleB.stop();
    } finally {
      cap.restore();
    }
  });

  // --------------------------------------------------------------------------
  // Handle stop inside callback
  // --------------------------------------------------------------------------

  Tinytest.addAsync('afs - observe - handle A can stop handle B during fan-out; B skipped, A keeps receiving', async (test) => {
    const stream = new AFS.ChangeStream({ collectionName: 't', selector: {} });
    const multiplexer = new AFS.ObserveMultiplexer(stream, false);
    stream.markReady();

    const seenA = [];
    const seenB = [];
    let handleB;

    const handleA = await multiplexer.addHandle({
      added(id, fields) {
        seenA.push(id);
        // Stop B from inside A's callback.
        if (handleB && id === 'trigger') handleB.stop();
      },
    });

    handleB = await multiplexer.addHandle({
      added(id, fields) { seenB.push(id); },
    });

    // Baseline: both receive this.
    stream.added('pre', { v: 1 });
    test.equal(seenA, ['pre']);
    test.equal(seenB, ['pre']);

    // A stops B mid fan-out. B must NOT receive 'trigger' in either of two
    // valid cases:
    //   - Map iteration order is insertion order; A is inserted first, so
    //     when A's callback runs and calls handleB.stop(), the code both
    //     sets B._stopped = true AND deletes B from _handles. Map iterator
    //     semantics then skip deleted entries.
    //   - Even if iteration had already advanced past A, the _stopped check
    //     on line 87 guards B.
    stream.added('trigger', { v: 2 });

    test.equal(seenA, ['pre', 'trigger']);
    test.equal(seenB, ['pre']); // did NOT receive 'trigger'

    // A continues to receive subsequent events normally.
    stream.added('after', { v: 3 });
    test.equal(seenA, ['pre', 'trigger', 'after']);
    test.equal(seenB, ['pre']);

    // Multiplexer's internal _handles count decreased by exactly 1.
    test.equal(multiplexer._handles.size, 1);

    handleA.stop();
  });

  Tinytest.addAsync('afs - observe - error callback may call its own handle.stop() without crashing', async (test) => {
    const cap = captureConsoleErrors();
    try {
      const stream = new AFS.ChangeStream({ collectionName: 't', selector: {} });
      // Attach a no-op error listener so the ChangeStream does not log
      // "unhandled error" itself.
      stream.on('error', () => {});

      let onEmptyCount = 0;
      const multiplexer = new AFS.ObserveMultiplexer(stream, false, {
        onEmpty() { onEmptyCount++; },
      });
      stream.markReady();

      let handle;
      handle = await multiplexer.addHandle({
        added() {},
        error(err) {
          // Self-stop from inside error callback.
          handle.stop();
        },
      });

      test.equal(multiplexer._handles.size, 1);

      stream.markError(new Error('boom'));
      await flushMicrotasks();

      // Handle removed itself; onEmpty fired exactly once.
      test.equal(multiplexer._handles.size, 0);
      test.equal(onEmptyCount, 1);
    } finally {
      cap.restore();
    }
  });

  Tinytest.addAsync('afs - observe - reset/paused/resumed callbacks may self-stop the handle', async (test) => {
    for (const evt of ['reset', 'paused', 'resumed']) {
      const stream = new AFS.ChangeStream({ collectionName: 't', selector: {} });
      let onEmptyCount = 0;
      const multiplexer = new AFS.ObserveMultiplexer(stream, false, {
        onEmpty() { onEmptyCount++; },
      });
      stream.markReady();

      let handle;
      const cbs = { added() {} };
      cbs[evt] = () => { handle.stop(); };
      handle = await multiplexer.addHandle(cbs);

      // Trigger the matching stream lifecycle event.
      if (evt === 'reset')   stream.markReset();
      if (evt === 'paused')  stream.markPaused();
      if (evt === 'resumed') stream.markResumed();

      test.equal(multiplexer._handles.size, 0, `after ${evt}: handles cleared`);
      test.equal(onEmptyCount, 1, `after ${evt}: onEmpty fired once`);
    }
  });

  // --------------------------------------------------------------------------
  // Reference counting
  // --------------------------------------------------------------------------

  Tinytest.addAsync('afs - observe - onEmpty fires exactly once after N adds and N stops', async (test) => {
    const stream = new AFS.ChangeStream({ collectionName: 't', selector: {} });
    let onEmptyCount = 0;
    const multiplexer = new AFS.ObserveMultiplexer(stream, false, {
      onEmpty() { onEmptyCount++; },
    });
    stream.markReady();

    const handles = [];
    for (let i = 0; i < 4; i++) {
      handles.push(await multiplexer.addHandle({ added() {} }));
    }
    test.equal(multiplexer._handles.size, 4);
    test.equal(onEmptyCount, 0);

    // Stop one at a time. onEmpty should fire exactly once, on the LAST.
    handles[0].stop();
    test.equal(onEmptyCount, 0);
    handles[1].stop();
    test.equal(onEmptyCount, 0);
    handles[2].stop();
    test.equal(onEmptyCount, 0);
    handles[3].stop();
    test.equal(onEmptyCount, 1);

    test.equal(multiplexer._handles.size, 0);
  });

  Tinytest.addAsync('afs - observe - double stop on the same handle does not double-fire onEmpty', async (test) => {
    const stream = new AFS.ChangeStream({ collectionName: 't', selector: {} });
    let onEmptyCount = 0;
    const multiplexer = new AFS.ObserveMultiplexer(stream, false, {
      onEmpty() { onEmptyCount++; },
    });
    stream.markReady();

    const handle = await multiplexer.addHandle({ added() {} });

    handle.stop();
    test.equal(onEmptyCount, 1);
    test.equal(multiplexer._handles.size, 0);

    // Second stop must be a no-op: no throw, no double-fire.
    let threw = false;
    try {
      handle.stop();
    } catch (e) {
      threw = true;
    }
    test.isFalse(threw);
    test.equal(onEmptyCount, 1);
    test.equal(multiplexer._handles.size, 0);
  });

  Tinytest.addAsync('afs - observe - after onEmpty, a fresh observeChanges builds a new multiplexer', async (test) => {
    const provider = new AFS.MockStreamProvider();
    const collName = 'fresh-mux-' + Random.id();
    await provider.insertAsync(collName, { name: 'A' });

    // First observeChanges: creates and caches a multiplexer.
    const cursor1 = new AFS.Cursor(provider, collName, {});
    const handle1 = await cursor1.observeChangesAsync({ added() {} });
    test.equal(provider._multiplexerCache.size, 1);
    const firstMuxKey = Array.from(provider._multiplexerCache.keys())[0];
    const firstMux = provider._multiplexerCache.get(firstMuxKey);

    // Drop the handle — onEmpty should evict the multiplexer from the cache.
    handle1.stop();
    test.equal(provider._multiplexerCache.size, 0);
    test.equal(firstMux._handles.size, 0);

    // Second observeChanges: must build a fresh multiplexer (not reuse the
    // torn-down one) and deliver events correctly.
    const received = [];
    const cursor2 = new AFS.Cursor(provider, collName, {});
    const handle2 = await cursor2.observeChangesAsync({
      added(id, fields) { received.push({ id, name: fields.name }); },
    });

    // Initial add from the cache should have fired.
    test.equal(received.length, 1);
    test.equal(received[0].name, 'A');

    // New multiplexer is a DIFFERENT object from firstMux.
    test.equal(provider._multiplexerCache.size, 1);
    const secondMux = provider._multiplexerCache.get(
      Array.from(provider._multiplexerCache.keys())[0]
    );
    test.isFalse(secondMux === firstMux);
    test.equal(secondMux._handles.size, 1);

    // Live update flows through the fresh multiplexer.
    await provider.insertAsync(collName, { name: 'B' });
    await flushMicrotasks();
    test.equal(received.length, 2);

    handle2.stop();
  });

  // --------------------------------------------------------------------------
  // Initial-adds sequencing (replaces weak tests at ~1283-1310)
  // --------------------------------------------------------------------------

  Tinytest.addAsync('afs - observe - initial adds emitted pre-markReady are delivered in order, exactly once', async (test) => {
    const stream = new AFS.ChangeStream({ collectionName: 't', selector: {} });
    const multiplexer = new AFS.ObserveMultiplexer(stream, false);

    const emitted = [];
    const N = 5;
    for (let i = 0; i < N; i++) {
      const id = 'pre-' + i;
      emitted.push(id);
      stream.added(id, { i });
    }
    stream.markReady();

    const delivered = [];
    const handle = await multiplexer.addHandle({
      added(id, fields) { delivered.push(id); },
    });

    // Exact count, exact order, no duplicates, no drops.
    test.equal(delivered.length, N);
    test.equal(delivered, emitted);

    handle.stop();
  });

  Tinytest.addAsync('afs - observe - event emitted during addHandle is not duplicated and arrives after initial adds', async (test) => {
    const stream = new AFS.ChangeStream({ collectionName: 't', selector: {} });
    const multiplexer = new AFS.ObserveMultiplexer(stream, false);

    stream.added('doc1', { name: 'D1' });
    stream.markReady();

    const delivered = [];
    // Begin addHandle. Stream is already ready so _readyPromise resolves
    // immediately; _sendInitialAdds runs, THEN the handle is registered.
    const handlePromise = multiplexer.addHandle({
      added(id, fields) { delivered.push(id); },
    });

    // Emit doc2 BEFORE awaiting handlePromise. Because addHandle is
    // synchronous in everything up to the first `await`, doc2 is NOT
    // delivered until the handle is registered in _handles — which happens
    // after initial adds. So: either doc2 arrives through the live path
    // (after registration) or not at all; it must never be delivered twice.
    stream.added('doc2', { name: 'D2' });

    const handle = await handlePromise;

    // doc1 from initial cache must be present exactly once.
    const d1Count = delivered.filter(id => id === 'doc1').length;
    const d2Count = delivered.filter(id => id === 'doc2').length;
    test.equal(d1Count, 1);
    // doc2 may have arrived through the cache (if the cache recorded it
    // before markReady) OR through the live path once the handle was
    // registered; either way, NEVER more than once.
    test.isTrue(d2Count <= 1);

    // Order invariant: if doc2 appears, it comes strictly after doc1.
    if (d2Count === 1) {
      test.isTrue(delivered.indexOf('doc1') < delivered.indexOf('doc2'));
    }

    // Emit a genuinely new event after the handle is registered and verify
    // ordinary live delivery still works.
    stream.added('doc3', { name: 'D3' });
    test.equal(delivered.filter(id => id === 'doc3').length, 1);

    handle.stop();
  });

  // --------------------------------------------------------------------------
  // Initial add throws — fan-out continues, error logged
  // --------------------------------------------------------------------------

  Tinytest.addAsync('afs - observe - initial-add throw on one observer does not prevent others from receiving', async (test) => {
    const cap = captureConsoleErrors();
    try {
      const stream = new AFS.ChangeStream({ collectionName: 't', selector: {} });
      const multiplexer = new AFS.ObserveMultiplexer(stream, false);

      stream.added('a', { v: 1 });
      stream.added('b', { v: 2 });
      stream.added('c', { v: 3 });
      stream.markReady();

      const seen1 = [];
      const seen2 = [];
      const seen3 = [];

      // Observer 1: throws on every initial add.
      const h1 = await multiplexer.addHandle({
        added(id, fields) {
          seen1.push(id);
          throw new Error('observer-1-init-throw');
        },
      });

      // Observer 2 and 3 should still see all three initial adds. Each
      // multiplexer.addHandle() call drives its own _sendInitialAdds pass
      // using the CACHED state, so observer 1's throw has no effect on
      // what the others receive.
      const h2 = await multiplexer.addHandle({
        added(id, fields) { seen2.push(id); },
      });
      const h3 = await multiplexer.addHandle({
        added(id, fields) { seen3.push(id); },
      });

      test.equal(seen1.length, 3);
      test.equal(seen2.length, 3);
      test.equal(seen3.length, 3);
      test.equal(seen2, ['a', 'b', 'c']);
      test.equal(seen3, ['a', 'b', 'c']);

      // The initial-add throw must have been logged. This catches a
      // regression where someone deletes the try/catch in _sendInitialAdds.
      const throwLogs = cap.logs.filter(l =>
        l.kind === 'console.error' &&
        l.args.some(a => a instanceof Error && /observer-1-init-throw/.test(a.message))
      );
      test.isTrue(throwLogs.length >= 1);

      h1.stop();
      h2.stop();
      h3.stop();
    } finally {
      cap.restore();
    }
  });

  // --------------------------------------------------------------------------
  // Ordered multiplexer: initial-adds preserve correct `before` values
  // --------------------------------------------------------------------------

  Tinytest.addAsync('afs - observe - ordered initial adds set before=null on last and prev-id on earlier entries', async (test) => {
    const stream = new AFS.ChangeStream({ collectionName: 't', selector: {} });
    const multiplexer = new AFS.ObserveMultiplexer(stream, true);

    // Populate in a specific order: doc1 first, then doc2 after doc1, then
    // doc3 after doc2. This yields cache order: [doc1, doc2, doc3].
    stream.addedBefore('doc1', { n: 1 }, null);
    stream.addedBefore('doc2', { n: 2 }, null); // null means "append"
    stream.addedBefore('doc3', { n: 3 }, null);
    stream.markReady();

    const events = [];
    const handle = await multiplexer.addHandle({
      addedBefore(id, fields, before) {
        events.push({ id, before });
      },
    });

    // _sendInitialAdds walks the cache in insertion order and, for each
    // index i, uses ids[i+1] as `before` (or null if last). So for the
    // cache [doc1, doc2, doc3] we expect:
    //   i=0: doc1 before doc2
    //   i=1: doc2 before doc3
    //   i=2: doc3 before null
    test.equal(events.length, 3);
    test.equal(events[0].id, 'doc1');
    test.equal(events[0].before, 'doc2');
    test.equal(events[1].id, 'doc2');
    test.equal(events[1].before, 'doc3');
    test.equal(events[2].id, 'doc3');
    test.equal(events[2].before, null);

    handle.stop();
  });
}
