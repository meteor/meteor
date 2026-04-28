import { Tinytest } from 'meteor/tinytest';

// =============================================================================
// StreamProvider._fetchModifyWrite / _fetchModifyWriteUpsert template tests.
//
// Exercises the four hooks (_lockMatching, _writeRow, _isRetryableConflict,
// _buildInsertDoc) plus the _finalizeAttempt cleanup hook against an in-memory
// MockStreamProvider subclass. Postgres-specific transactional semantics are
// out of scope here — this is the contract test for the generic loop.
// =============================================================================

if (Meteor.isServer) {

  // ---------------------------------------------------------------------------
  // Test fixture: an in-memory provider with an injectable conflict planner.
  // ---------------------------------------------------------------------------

  class FmwProbeProvider extends AFS.MockStreamProvider {
    constructor(options = {}) {
      super({ name: 'fmw-probe', ...options });
      this._store = new Map(); // collectionName → Map(_id → doc)
      // Test-controlled planners:
      // - lockPlan: array of "ok" or Error per attempt (consumed FIFO).
      // - writePlan: array of "ok" or Error per row written (consumed FIFO).
      this.lockPlan = [];
      this.writePlan = [];
      // Behavior toggles:
      this.overrideBuildInsertDoc = true;
      this.calls = {
        lockMatching: 0,
        writeRow: 0,
        finalizeAttempt: 0,
        buildInsertDoc: 0,
      };
      this.writeRowArgs = []; // log of (row snapshot, opts.isInsert) per call
    }

    _seed(collectionName, doc) {
      if (!this._store.has(collectionName)) {
        this._store.set(collectionName, new Map());
      }
      const id = doc._id || Random.id();
      const stored = { ...doc, _id: id };
      this._store.get(collectionName).set(id, stored);
      return id;
    }

    _findMatching(collectionName, selector) {
      const coll = this._store.get(collectionName);
      if (!coll) return [];
      // Trivial selector: match by exact key/value pairs (sufficient for tests).
      const out = [];
      for (const doc of coll.values()) {
        let match = true;
        for (const [k, v] of Object.entries(selector || {})) {
          if (doc[k] !== v) { match = false; break; }
        }
        if (match) out.push({ ...doc });
      }
      return out;
    }

    async _lockMatching(collectionName, selector, opts) {
      this.calls.lockMatching += 1;
      const plan = this.lockPlan.shift();
      if (plan instanceof Error) throw plan;
      return this._findMatching(collectionName, selector);
    }

    async _writeRow(collectionName, row, originalRow, opts) {
      this.calls.writeRow += 1;
      this.writeRowArgs.push({
        row: { ...row },
        isInsert: !!opts.isInsert,
        hadOriginal: originalRow !== null,
      });
      const plan = this.writePlan.shift();
      if (plan instanceof Error) throw plan;
      const coll = this._store.get(collectionName) || new Map();
      this._store.set(collectionName, coll);
      coll.set(row._id, { ...row });
    }

    _isRetryableConflict(err) {
      return !!(err && err.code === 'TEST_RETRY');
    }

    _buildInsertDoc(selector, modifier) {
      this.calls.buildInsertDoc += 1;
      if (!this.overrideBuildInsertDoc) {
        // Delegate to the base — should throw NotImplementedError.
        return super._buildInsertDoc(selector, modifier);
      }
      const doc = {};
      for (const [k, v] of Object.entries(selector || {})) {
        if (k.startsWith('$')) continue;
        if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) continue;
        doc[k] = v;
      }
      if (!doc._id) doc._id = this.generateId();
      return doc;
    }

    async _finalizeAttempt(opts, error) {
      this.calls.finalizeAttempt += 1;
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Single match, modifier applied successfully on first attempt.
  // ---------------------------------------------------------------------------

  Tinytest.addAsync(
    'afs - _fetchModifyWrite - single match applies modifier and writes once',
    async (test) => {
      const provider = new FmwProbeProvider();
      const coll = Random.id();
      provider._seed(coll, { _id: 'a', tag: 'x', count: 1 });

      const result = await provider._fetchModifyWrite(
        coll, { tag: 'x' }, { $inc: { count: 5 } }
      );

      test.equal(result.matchedCount, 1, 'one row matched');
      test.equal(result.modifiedCount, 1, 'one row written');
      test.equal(provider.calls.lockMatching, 1, 'lockMatching called once');
      test.equal(provider.calls.writeRow, 1, 'writeRow called once');
      test.equal(provider.calls.finalizeAttempt, 1, 'finalizeAttempt called once');
      test.equal(
        provider._store.get(coll).get('a').count, 6,
        'modifier applied (count incremented)'
      );

      await provider.close();
    }
  );

  // ---------------------------------------------------------------------------
  // 2. No match without upsert returns matchedCount: 0 and skips _writeRow.
  // ---------------------------------------------------------------------------

  Tinytest.addAsync(
    'afs - _fetchModifyWrite - no match returns zero counts and skips writeRow',
    async (test) => {
      const provider = new FmwProbeProvider();
      const coll = Random.id();

      const result = await provider._fetchModifyWrite(
        coll, { tag: 'missing' }, { $set: { count: 1 } }
      );

      test.equal(result.matchedCount, 0);
      test.equal(result.modifiedCount, 0);
      test.equal(provider.calls.writeRow, 0, 'writeRow must not be called');
      test.equal(provider.calls.finalizeAttempt, 1, 'finalizeAttempt still runs');

      await provider.close();
    }
  );

  // ---------------------------------------------------------------------------
  // 3. Upsert path: no match → _buildInsertDoc + _writeRow with isInsert: true.
  // ---------------------------------------------------------------------------

  Tinytest.addAsync(
    'afs - _fetchModifyWriteUpsert - no match invokes buildInsertDoc and writeRow as insert',
    async (test) => {
      const provider = new FmwProbeProvider();
      const coll = Random.id();

      const result = await provider._fetchModifyWriteUpsert(
        coll, { tag: 'fresh', name: 'Alice' }, { $set: { count: 7 } }
      );

      test.equal(result.matchedCount, 0);
      test.equal(result.modifiedCount, 0);
      test.isTrue(!!result.insertedId, 'insertedId must be set on insert path');
      test.equal(provider.calls.buildInsertDoc, 1, 'buildInsertDoc called once');
      test.equal(provider.calls.writeRow, 1, 'writeRow called once');

      const writeArg = provider.writeRowArgs[0];
      test.isTrue(writeArg.isInsert, 'writeRow received isInsert: true');
      test.isFalse(writeArg.hadOriginal, 'originalRow is null on insert path');
      test.equal(writeArg.row.tag, 'fresh', 'selector field copied to insert doc');
      test.equal(writeArg.row.name, 'Alice', 'selector field copied to insert doc');
      test.equal(writeArg.row.count, 7, 'modifier applied with isInsert: true');

      await provider.close();
    }
  );

  // ---------------------------------------------------------------------------
  // 4. Retryable conflict on attempt 1, success on attempt 2.
  // ---------------------------------------------------------------------------

  Tinytest.addAsync(
    'afs - _fetchModifyWrite - retryable conflict on attempt 1 retries and succeeds',
    async (test) => {
      const provider = new FmwProbeProvider();
      const coll = Random.id();
      provider._seed(coll, { _id: 'a', tag: 'x', count: 1 });

      // First write throws a retryable conflict; second write succeeds.
      const conflict = new Error('serialization failure');
      conflict.code = 'TEST_RETRY';
      provider.writePlan.push(conflict, 'ok');

      const result = await provider._fetchModifyWrite(
        coll, { tag: 'x' }, { $inc: { count: 1 } }
      );

      test.equal(result.matchedCount, 1);
      test.equal(result.modifiedCount, 1);
      test.equal(
        provider.calls.lockMatching, 2,
        'lockMatching called twice (once per attempt)'
      );
      test.equal(
        provider.calls.writeRow, 2,
        'writeRow called twice (failed + retry)'
      );
      test.equal(
        provider.calls.finalizeAttempt, 2,
        'finalizeAttempt called once per attempt'
      );

      await provider.close();
    }
  );

  // ---------------------------------------------------------------------------
  // 5. Retryable conflict every attempt → ConflictError after maxAttempts.
  // ---------------------------------------------------------------------------

  Tinytest.addAsync(
    'afs - _fetchModifyWrite - exhausting retries throws ConflictError with cause',
    async (test) => {
      const provider = new FmwProbeProvider();
      const coll = Random.id();
      provider._seed(coll, { _id: 'a', tag: 'x', count: 1 });

      const makeConflict = () => {
        const e = new Error('still conflicting');
        e.code = 'TEST_RETRY';
        return e;
      };
      provider.writePlan.push(makeConflict(), makeConflict(), makeConflict());

      let caught = null;
      try {
        await provider._fetchModifyWrite(
          coll, { tag: 'x' }, { $inc: { count: 1 } }, { maxAttempts: 3 }
        );
      } catch (e) {
        caught = e;
      }

      test.isTrue(caught instanceof Error, 'must throw');
      test.equal(caught && caught.name, 'ConflictError', 'must be a ConflictError');
      test.equal(caught && caught.code, 'conflict', 'error.code must be conflict');
      test.matches(caught && caught.message, /3 retries/);
      test.isTrue(
        caught && caught.cause && caught.cause.code === 'TEST_RETRY',
        'cause must preserve the underlying retryable error'
      );
      test.equal(
        provider.calls.lockMatching, 3,
        'lockMatching called maxAttempts times'
      );

      await provider.close();
    }
  );

  // ---------------------------------------------------------------------------
  // 6. Non-retryable error throws immediately, no retries.
  // ---------------------------------------------------------------------------

  Tinytest.addAsync(
    'afs - _fetchModifyWrite - non-retryable error throws immediately',
    async (test) => {
      const provider = new FmwProbeProvider();
      const coll = Random.id();
      provider._seed(coll, { _id: 'a', tag: 'x', count: 1 });

      const fatal = new Error('column does not exist');
      fatal.code = 'NOT_RETRY';
      provider.writePlan.push(fatal);

      let caught = null;
      try {
        await provider._fetchModifyWrite(
          coll, { tag: 'x' }, { $inc: { count: 1 } }
        );
      } catch (e) {
        caught = e;
      }

      test.isTrue(caught instanceof Error);
      test.equal(
        caught && caught.message,
        'column does not exist',
        'original error propagates raw — not wrapped in ConflictError'
      );
      test.notEqual(caught && caught.name, 'ConflictError');
      test.equal(provider.calls.lockMatching, 1, 'no retry — lockMatching called once');
      test.equal(provider.calls.writeRow, 1, 'writeRow called once and threw');

      await provider.close();
    }
  );

  // ---------------------------------------------------------------------------
  // 7. _buildInsertDoc not overridden + upsert miss → NotImplementedError.
  // ---------------------------------------------------------------------------

  Tinytest.addAsync(
    'afs - _fetchModifyWriteUpsert - missing _buildInsertDoc override throws NotImplementedError',
    async (test) => {
      const provider = new FmwProbeProvider();
      provider.overrideBuildInsertDoc = false; // delegate to base
      const coll = Random.id();

      let caught = null;
      try {
        await provider._fetchModifyWriteUpsert(
          coll, { tag: 'absent' }, { $set: { x: 1 } }
        );
      } catch (e) {
        caught = e;
      }

      test.isTrue(caught instanceof Error);
      test.equal(
        caught && caught.code,
        'not-implemented',
        'must surface NotImplementedError code'
      );
      test.matches(caught && caught.message, /_buildInsertDoc/);

      await provider.close();
    }
  );

  // ---------------------------------------------------------------------------
  // Hook defaults: bare base-class _isRetryableConflict returns false; the
  // other three hooks throw NotImplementedError. We exercise these via a
  // bare subclass since StreamProvider itself is abstract.
  // ---------------------------------------------------------------------------

  Tinytest.addAsync(
    'afs - StreamProvider - default fmw hooks throw NotImplementedError',
    async (test) => {
      class BareSub extends AFS.StreamProvider {
        constructor() { super({ name: 'bare' }); }
      }
      const provider = new BareSub();

      // _isRetryableConflict default — never retries.
      test.isFalse(
        provider._isRetryableConflict(new Error('x')),
        'default _isRetryableConflict returns false'
      );

      // _lockMatching default → NotImplementedError.
      let lockErr = null;
      try { await provider._lockMatching('c', {}, {}); } catch (e) { lockErr = e; }
      test.equal(lockErr && lockErr.code, 'not-implemented');

      // _writeRow default → NotImplementedError.
      let writeErr = null;
      try { await provider._writeRow('c', {}, null, {}); } catch (e) { writeErr = e; }
      test.equal(writeErr && writeErr.code, 'not-implemented');

      // _buildInsertDoc default → NotImplementedError.
      let buildErr = null;
      try { provider._buildInsertDoc({}, {}); } catch (e) { buildErr = e; }
      test.equal(buildErr && buildErr.code, 'not-implemented');

      // _finalizeAttempt default — no-op.
      let finalizeErr = null;
      try { await provider._finalizeAttempt({}, null); } catch (e) { finalizeErr = e; }
      test.isNull(finalizeErr, 'default _finalizeAttempt is a no-op');

      await provider.close();
    }
  );

}
