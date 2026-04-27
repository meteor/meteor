import { Tinytest } from 'meteor/tinytest';

// =============================================================================
// MockPollingStreamProvider tests (server only).
//
// Exercises the in-memory mock that extends PollingStreamProvider:
// CRUD, observe semantics, capability gating, retry path, lifecycle.
// Each test uses a short pollIntervalMs purely as a safety net — observe
// notifications go through requestImmediatePoll, so most assertions land
// long before the next tick.
// =============================================================================

if (Meteor.isServer) {

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function makeProvider(opts = {}) {
    return new AFS.MockPollingStreamProvider({ pollIntervalMs: 60_000, ...opts });
  }

  async function waitFor(cond, { timeoutMs = 1000, intervalMs = 5 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (cond()) return;
      await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error('waitFor: condition never satisfied within ' + timeoutMs + 'ms');
  }

  function collectStreamEvents(stream) {
    const events = [];
    for (const evt of [
      'added', 'addedBefore', 'changed', 'movedBefore', 'removed',
      'ready', 'error', 'reset',
    ]) {
      stream.on(evt, (...args) => events.push({ evt, args }));
    }
    return events;
  }

  // ---------------------------------------------------------------------------
  // 1. CRUD round-trip
  // ---------------------------------------------------------------------------
  Tinytest.addAsync(
    'afs - mock-polling - CRUD round-trip insert/find/update/remove',
    async (test) => {
      const provider = makeProvider();
      const id = await provider.insertAsync('c', { name: 'a', n: 1 });
      test.isTrue(typeof id === 'string');

      const got = await provider.findOneAsync('c', id);
      test.equal(got.name, 'a');
      test.equal(got.n, 1);

      const affected = await provider.updateAsync('c', { _id: id }, { $set: { n: 2 } });
      test.equal(affected, 1);

      const after = await provider.findOneAsync('c', { _id: id });
      test.equal(after.n, 2);

      const removed = await provider.removeAsync('c', { _id: id });
      test.equal(removed, 1);

      const gone = await provider.findOneAsync('c', id);
      test.isUndefined(gone);

      await provider.close();
    }
  );

  // ---------------------------------------------------------------------------
  // 2. Observe sees insert
  // ---------------------------------------------------------------------------
  Tinytest.addAsync(
    'afs - mock-polling - observe sees insert via immediate poll',
    async (test) => {
      const provider = makeProvider();
      const desc = { collectionName: 'obs1', selector: {}, options: {} };
      const { stream, teardown } = provider.startObserving(desc, false);
      const events = collectStreamEvents(stream);
      await waitFor(() => events.some(e => e.evt === 'ready'));

      const before = events.length;
      await provider.insertAsync('obs1', { _id: 'x', n: 7 });
      await waitFor(() => events.slice(before).some(e => e.evt === 'added' && e.args[0] === 'x'));

      const adds = events.slice(before).filter(e => e.evt === 'added');
      test.equal(adds.length, 1);
      test.equal(adds[0].args[0], 'x');
      test.equal(adds[0].args[1].n, 7);

      teardown();
      await provider.close();
    }
  );

  // ---------------------------------------------------------------------------
  // 3. Observe sees update
  // ---------------------------------------------------------------------------
  Tinytest.addAsync(
    'afs - mock-polling - observe sees update via immediate poll',
    async (test) => {
      const provider = makeProvider();
      await provider.insertAsync('obs2', { _id: 'a', n: 1 });
      const desc = { collectionName: 'obs2', selector: {}, options: {} };
      const { stream, teardown } = provider.startObserving(desc, false);
      const events = collectStreamEvents(stream);
      await waitFor(() => events.some(e => e.evt === 'ready'));

      const before = events.length;
      await provider.updateAsync('obs2', { _id: 'a' }, { $set: { n: 99 } });
      await waitFor(() => events.slice(before).some(e => e.evt === 'changed'));

      const changes = events.slice(before).filter(e => e.evt === 'changed');
      test.equal(changes.length, 1);
      test.equal(changes[0].args[0], 'a');
      test.equal(changes[0].args[1].n, 99);

      teardown();
      await provider.close();
    }
  );

  // ---------------------------------------------------------------------------
  // 4. Observe sees remove
  // ---------------------------------------------------------------------------
  Tinytest.addAsync(
    'afs - mock-polling - observe sees remove via immediate poll',
    async (test) => {
      const provider = makeProvider();
      await provider.insertAsync('obs3', { _id: 'a', n: 1 });
      const desc = { collectionName: 'obs3', selector: {}, options: {} };
      const { stream, teardown } = provider.startObserving(desc, false);
      const events = collectStreamEvents(stream);
      await waitFor(() => events.some(e => e.evt === 'ready'));

      const before = events.length;
      await provider.removeAsync('obs3', { _id: 'a' });
      await waitFor(() => events.slice(before).some(e => e.evt === 'removed'));

      const removes = events.slice(before).filter(e => e.evt === 'removed');
      test.equal(removes.length, 1);
      test.equal(removes[0].args[0], 'a');

      teardown();
      await provider.close();
    }
  );

  // ---------------------------------------------------------------------------
  // 5. Ordered observe sees move
  // ---------------------------------------------------------------------------
  Tinytest.addAsync(
    'afs - mock-polling - ordered observe sees movedBefore on sort-key change',
    async (test) => {
      const provider = makeProvider();
      // Three docs (not two): with only [a, b] → [b, a] the LCS is length 1
      // and either {a} or {b} is a valid common subsequence. Meteor's
      // diffQueryOrderedChanges resolves the tie by keeping the latest doc
      // in new_results unmoved, so it would report movedBefore('b', 'a')
      // instead of moving 'a'. Adding a stable third doc forces the LCS
      // ({b, c}) to length 2, leaving 'a' as the unambiguous moved doc.
      await provider.insertAsync('obs4', { _id: 'a', n: 1 });
      await provider.insertAsync('obs4', { _id: 'b', n: 2 });
      await provider.insertAsync('obs4', { _id: 'c', n: 3 });
      const desc = { collectionName: 'obs4', selector: {}, options: { sort: { n: 1 } } };
      const { stream, teardown } = provider.startObserving(desc, true);
      const events = collectStreamEvents(stream);
      await waitFor(() => events.some(e => e.evt === 'ready'));

      const before = events.length;
      // Bump a's sort key past b and c — a should move to the end.
      await provider.updateAsync('obs4', { _id: 'a' }, { $set: { n: 99 } });
      await waitFor(() => events.slice(before).some(e => e.evt === 'movedBefore'));

      const moves = events.slice(before).filter(e => e.evt === 'movedBefore');
      test.isTrue(moves.length >= 1, 'expected movedBefore');
      test.isTrue(moves.some(m => m.args[0] === 'a'),
        'a is the doc that should have moved');

      teardown();
      await provider.close();
    }
  );

  // ---------------------------------------------------------------------------
  // 6. Two cursors on same collection observe independently
  // ---------------------------------------------------------------------------
  Tinytest.addAsync(
    'afs - mock-polling - two cursors on same collection observe independently',
    async (test) => {
      const provider = makeProvider();
      const d1 = { collectionName: 'obs5', selector: { kind: 'a' }, options: {} };
      const d2 = { collectionName: 'obs5', selector: { kind: 'b' }, options: {} };
      const r1 = provider.startObserving(d1, false);
      const r2 = provider.startObserving(d2, false);
      const e1 = collectStreamEvents(r1.stream);
      const e2 = collectStreamEvents(r2.stream);
      await waitFor(() => e1.some(e => e.evt === 'ready'));
      await waitFor(() => e2.some(e => e.evt === 'ready'));

      await provider.insertAsync('obs5', { _id: 'a1', kind: 'a' });
      await provider.insertAsync('obs5', { _id: 'b1', kind: 'b' });

      await waitFor(() => e1.some(e => e.evt === 'added' && e.args[0] === 'a1'));
      await waitFor(() => e2.some(e => e.evt === 'added' && e.args[0] === 'b1'));

      // Cursor 1 should NOT have seen b1; cursor 2 should NOT have seen a1.
      test.isFalse(e1.some(e => e.evt === 'added' && e.args[0] === 'b1'));
      test.isFalse(e2.some(e => e.evt === 'added' && e.args[0] === 'a1'));

      r1.teardown();
      r2.teardown();
      await provider.close();
    }
  );

  // ---------------------------------------------------------------------------
  // 7. _fetchModifyWrite retry path
  // ---------------------------------------------------------------------------
  Tinytest.addAsync(
    'afs - mock-polling - _fetchModifyWrite retries on transient conflict',
    async (test) => {
      class RetryingProvider extends AFS.MockPollingStreamProvider {
        constructor() {
          super({ pollIntervalMs: 60_000 });
          this._conflictsLeft = 1; // throw once, then succeed.
          this.writeAttempts = 0;
        }
        async _writeRow(collectionName, row, originalRow, opts) {
          this.writeAttempts++;
          if (this._conflictsLeft > 0) {
            this._conflictsLeft--;
            const e = new Error('synthetic conflict');
            e.synthetic = true;
            throw e;
          }
          return super._writeRow(collectionName, row, originalRow, opts);
        }
        _isRetryableConflict(err) {
          return !!(err && err.synthetic);
        }
      }
      const provider = new RetryingProvider();
      await provider.insertAsync('r', { _id: 'a', n: 0 });
      // Use $inc — non-idempotent on retry. If _lockMatching's EJSON.clone
      // is missing, the second attempt would apply $inc on top of an
      // already-incremented row and land at n === 2.
      const affected = await provider.updateAsync('r', { _id: 'a' }, { $inc: { n: 1 } });
      test.equal(affected, 1);
      test.isTrue(provider.writeAttempts >= 2, 'expected at least one retry');

      const doc = await provider.findOneAsync('r', 'a');
      // n must equal 1, not 2 — proves each retry sees a fresh clone of the
      // original row (n: 0) rather than the half-applied attempt's mutation.
      test.equal(doc.n, 1);
      await provider.close();
    }
  );

  // ---------------------------------------------------------------------------
  // 8. Upsert no-match → insert; upsert match → update
  // ---------------------------------------------------------------------------
  Tinytest.addAsync(
    'afs - mock-polling - upsert inserts on no-match and updates on match',
    async (test) => {
      const provider = makeProvider();

      // No match → insert path.
      const r1 = await provider.upsertAsync(
        'u', { name: 'alice' }, { $set: { score: 10 } }
      );
      test.equal(r1.matchedCount, 0);
      test.isTrue(r1.insertedId !== undefined);
      const inserted = await provider.findOneAsync('u', r1.insertedId);
      test.equal(inserted.name, 'alice');
      test.equal(inserted.score, 10);

      // Match → update path.
      const r2 = await provider.upsertAsync(
        'u', { name: 'alice' }, { $set: { score: 20 } }
      );
      test.equal(r2.matchedCount, 1);
      test.equal(r2.modifiedCount, 1);
      test.isUndefined(r2.insertedId);
      const updated = await provider.findOneAsync('u', r1.insertedId);
      test.equal(updated.score, 20);

      await provider.close();
    }
  );

  // ---------------------------------------------------------------------------
  // 9. Capability gating
  // ---------------------------------------------------------------------------
  Tinytest.addAsync(
    'afs - mock-polling - rejects $where with NotSupportedError',
    async (test) => {
      const provider = makeProvider();
      let threw = null;
      try {
        await provider.fetchResults('c', { $where: 'true' }, {});
      } catch (e) {
        threw = e;
      }
      test.isTrue(!!threw, 'expected throw');
      test.equal(threw.code, 'not-supported');
      test.equal(threw.name, 'NotSupportedError');
      await provider.close();
    }
  );

  // ---------------------------------------------------------------------------
  // 10. Cursor → multiplexer → polling provider end-to-end
  //
  // Drives observeChangesAsync through AFSCursor (which calls
  // provider._getMultiplexer → _createMultiplexer). _createMultiplexer's
  // `{ stream, teardown }` discriminator is shared between postgres and
  // polling but only the postgres integration suite touched it before this
  // test. Confirms polling-path teardown wires correctly into the
  // multiplexer refcount.
  // ---------------------------------------------------------------------------
  Tinytest.addAsync(
    'afs - mock-polling - AFSCursor.observeChangesAsync drives multiplexer + polling end-to-end',
    async (test) => {
      const provider = makeProvider();
      const collName = 'mux-' + Random.id();

      // Pre-insert one doc so the initial fetch sees a non-empty snapshot.
      await provider.insertAsync(collName, { _id: 'd1', n: 1 });

      const adds = [];
      const changes = [];
      const removes = [];
      const cursor = new AFS.Cursor(provider, collName, {}, {});
      const handle = await cursor.observeChangesAsync({
        added(id, fields) { adds.push({ id, fields }); },
        changed(id, fields) { changes.push({ id, fields }); },
        removed(id) { removes.push(id); },
      });

      // Initial fetch: one `added` for d1.
      await waitFor(() => adds.length >= 1);
      test.equal(adds.length, 1);
      test.equal(adds[0].id, 'd1');
      test.equal(adds[0].fields.n, 1);

      // Insert second doc → CRUD path fires requestImmediatePoll → multiplexer
      // delivers the diff to our handle.
      await provider.insertAsync(collName, { _id: 'd2', n: 2 });
      await waitFor(() => adds.length >= 2);
      test.equal(adds.length, 2);
      test.equal(adds[1].id, 'd2');
      test.equal(adds[1].fields.n, 2);

      // Stop the observe handle. The multiplexer refcount drops to zero,
      // teardown fires, and the poller is removed.
      await handle.stop();
      test.equal(provider._pollers.size, 0,
        'poller should be evicted when multiplexer refcount hits zero');

      await provider.close();
    }
  );

  // ---------------------------------------------------------------------------
  // 11. Close lifecycle
  // ---------------------------------------------------------------------------
  Tinytest.addAsync(
    'afs - mock-polling - close clears store and rejects subsequent writes',
    async (test) => {
      const provider = makeProvider();
      await provider.insertAsync('cl', { _id: 'a' });
      const desc = { collectionName: 'cl', selector: {}, options: {} };
      const { teardown } = provider.startObserving(desc, false);

      // Sanity: ctx exists pre-close.
      test.equal(provider._pollers.size, 1);

      await provider.close();

      // Store cleared.
      test.equal(provider._store.size, 0);
      // No active pollers.
      test.equal(provider._pollers.size, 0);

      // Subsequent writes reject with ProviderClosedError.
      let threw = null;
      try { await provider.insertAsync('cl', { _id: 'b' }); }
      catch (e) { threw = e; }
      test.isTrue(!!threw, 'expected throw on closed-provider write');
      test.equal(threw.code, 'provider-closed');

      // teardown is idempotent post-close.
      teardown();
    }
  );
}
