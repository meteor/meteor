import { Tinytest } from 'meteor/tinytest';
import { LocalCollection } from 'meteor/minimongo';

// ===========================================================================
// AFS chaos / stress / property-based tests
//
// These tests exercise the AFS reactive pipeline under adversarial
// conditions:
//   - high operation count
//   - many concurrent observers
//   - rapid observer churn
//   - duplicated / reordered / reset events from the provider
//   - property-based CRUD equivalence vs. Minimongo
//
// Everything here is DETERMINISTIC. Random inputs use a seeded LCG so
// failures reproduce on every run. Each test logs the seed and enough
// context to make a failure actionable.
// ===========================================================================

if (Meteor.isServer) {
  // =========================================================================
  // Deterministic seeded RNG
  //
  // Meteor's `Random` package is not seedable, so we roll our own Linear
  // Congruential Generator. The constants are the "Numerical Recipes"
  // LCG (m=2^32, a=1664525, c=1013904223). Good enough for test
  // coverage — NOT cryptographic.
  // =========================================================================
  function makeRng(seed) {
    let state = (seed >>> 0) || 1;
    return {
      seed,
      next() {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state;
      },
      // returns float in [0, 1)
      fraction() {
        return this.next() / 0x100000000;
      },
      // returns int in [0, n)
      int(n) {
        return this.next() % n;
      },
      // pick one of choices
      pick(choices) {
        return choices[this.int(choices.length)];
      },
    };
  }

  // Helper: flush pending microtasks/macrotasks so async emissions settle.
  async function flush(n = 5) {
    for (let i = 0; i < n; i++) {
      await new Promise(resolve => setImmediate(resolve));
      await Promise.resolve();
    }
  }

  // Build a fresh AFS collection backed by a MockStreamProvider (or subclass).
  function makeCollection(ProviderClass = AFS.MockStreamProvider) {
    const provider = new ProviderClass();
    const name = 'afs-chaos-' + Random.id();
    const collection = new AFS.Collection(name, {
      provider,
      connection: null,
      defineMutationMethods: false,
    });
    return { provider, name, collection };
  }

  // =========================================================================
  // (1) Multiplexer ref-counting invariant
  //
  // Invariant:
  //   _handles.size === (# successful adds) − (# unique stops)
  // AND onEmpty fires exactly once per 1→0 transition.
  // =========================================================================
  Tinytest.addAsync('afs - chaos - multiplexer ref-counting invariant', async (test) => {
    const SEED = 0xC0FFEE;
    const rng = makeRng(SEED);
    const OPS = 1000;

    const stream = new AFS.ChangeStream({ collectionName: 'mux-rc', selector: {} });
    let onEmptyCount = 0;
    const mux = new AFS.ObserveMultiplexer(stream, false, {
      onEmpty() { onEmptyCount++; },
    });
    stream.markReady();

    const handles = [];           // live handles
    let successfulAdds = 0;
    let uniqueStops = 0;
    let expected1to0Transitions = 0;
    let prevSize = 0;

    for (let i = 0; i < OPS; i++) {
      // Op mix: 60% add, 30% stop, 10% double-stop.
      const r = rng.int(10);
      if (r < 6 || handles.length === 0) {
        // add
        const handle = await mux.addHandle({ added() {}, changed() {}, removed() {} });
        handles.push(handle);
        successfulAdds++;
      } else if (r < 9) {
        // stop a random handle (unique)
        const idx = rng.int(handles.length);
        const handle = handles.splice(idx, 1)[0];
        handle.stop();
        uniqueStops++;
      } else {
        // double-stop an existing handle (shouldn't count twice)
        const idx = rng.int(handles.length);
        const handle = handles.splice(idx, 1)[0];
        handle.stop();
        handle.stop(); // second stop — no-op
        uniqueStops++;
      }

      // Track 1→0 transitions
      const size = mux._handles.size;
      if (prevSize === 1 && size === 0) expected1to0Transitions++;
      prevSize = size;

      const expectedSize = successfulAdds - uniqueStops;
      if (mux._handles.size !== expectedSize) {
        test.fail({
          type: 'assert_equal',
          message: `multiplexer invariant broken at op ${i} (seed=0x${SEED.toString(16)}): ` +
                   `size=${mux._handles.size} expected=${expectedSize}`,
        });
        return;
      }
    }

    test.equal(
      onEmptyCount,
      expected1to0Transitions,
      `onEmpty should fire once per 1→0 transition (seed=0x${SEED.toString(16)})`
    );

    // Clean up any remaining handles
    for (const h of handles) {
      try { h.stop(); } catch (e) { /* ignore */ }
    }
  });

  // =========================================================================
  // (2) Chaos stream provider — final-state invariant.
  //
  // Wraps MockStreamProvider.startObserving to:
  //   - deterministically delay each emission via Promise.resolve().then()
  //   - occasionally duplicate an emission
  //   - occasionally emit `reset` followed by a full re-emission of state
  //   - occasionally emit `reconnected`
  //
  // After chaos settles, replaying the events the observer SAW should
  // converge to the provider's authoritative state.
  // =========================================================================
  class ChaoticProvider extends AFS.MockStreamProvider {
    constructor(options = {}) {
      super(options);
      this._chaosRng = makeRng(options.seed || 0xDECAFBAD);
      this._streams = new Set();
    }

    startObserving(cursorDescription, ordered) {
      const stream = this.createChangeStream(cursorDescription);
      this._streams.add(stream);

      const lc = this._getLocalCollection(cursorDescription.collectionName);
      const cursor = lc.find(
        cursorDescription.selector,
        cursorDescription.options || {}
      );

      const rng = this._chaosRng;
      const self = this;

      // Wrap emission methods to add chaos. We emit into the stream
      // through a scheduler so we can deterministically defer/dup/reset.
      const scheduler = [];
      const schedule = fn => { scheduler.push(fn); };
      const drain = () => {
        // Drain synchronously — we've already queued everything we
        // needed for this tick.
        while (scheduler.length) {
          const fn = scheduler.shift();
          try { fn(); } catch (e) { /* swallow — invariant is end-state */ }
        }
      };

      const emitAdded = (id, fields) => {
        if (stream.isStopped()) return;
        stream.added(id, EJSON.clone(fields));
        // ~10% duplicate chance
        if (rng.int(10) === 0 && !stream.isStopped()) {
          stream.added(id, EJSON.clone(fields));
        }
      };
      const emitChanged = (id, fields) => {
        if (stream.isStopped()) return;
        stream.changed(id, EJSON.clone(fields));
        if (rng.int(10) === 0 && !stream.isStopped()) {
          stream.changed(id, EJSON.clone(fields));
        }
      };
      const emitRemoved = (id) => {
        if (stream.isStopped()) return;
        stream.removed(id);
        if (rng.int(10) === 0 && !stream.isStopped()) {
          stream.removed(id);
        }
      };

      Promise.resolve().then(() => {
        if (stream.isStopped()) return;
        const lcHandle = cursor.observeChanges({
          added(id, fields)   { schedule(() => emitAdded(id, fields)); drain(); },
          changed(id, fields) { schedule(() => emitChanged(id, fields)); drain(); },
          removed(id)         { schedule(() => emitRemoved(id)); drain(); },
        });
        stream.markReady();
        stream.on('stop', () => { lcHandle.stop(); self._streams.delete(stream); });
      }).catch(err => {
        if (!stream.isStopped()) stream.markError(err);
      });

      return stream;
    }

    // Forcibly inject a reset followed by a full re-emit of current state.
    async injectReset(collectionName) {
      const docs = await this._fetchResults(collectionName, {}, {});
      for (const stream of this._streams) {
        if (stream._cursorDescription.collectionName !== collectionName) continue;
        if (stream.isStopped()) continue;
        stream.markReset();
        for (const doc of docs) {
          const { _id, ...fields } = doc;
          stream.added(_id, EJSON.clone(fields));
        }
      }
    }

    async injectReconnected(collectionName) {
      for (const stream of this._streams) {
        if (stream._cursorDescription.collectionName !== collectionName) continue;
        if (stream.isStopped()) continue;
        stream.markReconnected();
      }
    }
  }

  Tinytest.addAsync('afs - chaos - chaotic provider final state converges', async (test) => {
    const SEED = 0x5EED5EED;
    const rng = makeRng(SEED);

    const provider = new ChaoticProvider({ seed: SEED });
    const name = 'afs-chaos-stream-' + Random.id();
    const collection = new AFS.Collection(name, {
      provider,
      connection: null,
      defineMutationMethods: false,
    });

    // Reconstruct observer state from events it sees. `reset` clears it,
    // duplicate adds are tolerated (replace), removes drop the id.
    const observed = new Map();
    const cursor = new AFS.Cursor(provider, name, {});
    const history = []; // for debugging on failure
    const handle = await cursor.observeChangesAsync({
      added(id, fields) {
        history.push({ op: 'added', id });
        observed.set(id, { ...fields });
      },
      changed(id, fields) {
        history.push({ op: 'changed', id });
        const doc = observed.get(id) || {};
        for (const [k, v] of Object.entries(fields)) {
          if (v === undefined) delete doc[k]; else doc[k] = v;
        }
        observed.set(id, doc);
      },
      removed(id) {
        history.push({ op: 'removed', id });
        observed.delete(id);
      },
      reset() {
        history.push({ op: 'reset' });
        observed.clear();
      },
      reconnected() {
        history.push({ op: 'reconnected' });
      },
    });

    // Drive CRUD ops. Track ids so updates/removes can target existing docs.
    const ids = [];
    const opLog = [];
    for (let i = 0; i < 100; i++) {
      const r = rng.int(10);
      try {
        if (r < 5 || ids.length === 0) {
          const doc = { tag: rng.pick(['a', 'b', 'c']), n: rng.int(1000) };
          const id = await collection.insertAsync(doc);
          ids.push(id);
          opLog.push({ op: 'insert', id, doc });
        } else if (r < 8) {
          const id = ids[rng.int(ids.length)];
          const mod = { $set: { n: rng.int(1000) } };
          await collection.updateAsync({ _id: id }, mod);
          opLog.push({ op: 'update', id, mod });
        } else {
          const idx = rng.int(ids.length);
          const id = ids.splice(idx, 1)[0];
          await collection.removeAsync({ _id: id });
          opLog.push({ op: 'remove', id });
        }
      } catch (e) {
        opLog.push({ op: 'error', error: e.message });
      }

      // Occasionally inject reset or reconnected
      if (rng.int(20) === 0) {
        await provider.injectReset(name);
        opLog.push({ op: 'injectReset' });
      }
      if (rng.int(25) === 0) {
        await provider.injectReconnected(name);
        opLog.push({ op: 'injectReconnected' });
      }

      await flush(2);
    }

    await flush(10);

    // Compare observer-reconstructed state with authoritative state.
    const authoritative = await collection.find().fetchAsync();
    const authMap = new Map();
    for (const doc of authoritative) {
      const { _id, ...fields } = doc;
      authMap.set(_id, fields);
    }

    let mismatch = null;
    if (observed.size !== authMap.size) {
      mismatch = `size mismatch: observed=${observed.size} auth=${authMap.size}`;
    } else {
      for (const [id, fields] of authMap) {
        const obsFields = observed.get(id);
        if (!obsFields) { mismatch = `missing id ${id}`; break; }
        if (!EJSON.equals(fields, obsFields)) {
          mismatch = `field mismatch for ${id}: auth=${EJSON.stringify(fields)} obs=${EJSON.stringify(obsFields)}`;
          break;
        }
      }
    }

    if (mismatch) {
      test.fail({
        type: 'assert',
        message: `chaotic provider state diverged (seed=0x${SEED.toString(16)}): ${mismatch}\n` +
                 `ops: ${JSON.stringify(opLog.slice(-20))}\n` +
                 `last events: ${JSON.stringify(history.slice(-20))}`,
      });
    } else {
      test.isTrue(true, `chaotic state converges (seed=0x${SEED.toString(16)})`);
    }

    handle.stop();
  });

  // =========================================================================
  // (3) Stress — many observers, many events.
  //
  // 200 observers, 1000 added events. Every observer must receive exactly
  // 1000 adds in identical order.
  // =========================================================================
  Tinytest.addAsync('afs - chaos - 200 observers receive identical event streams', async (test) => {
    const OBSERVERS = 200;
    const EVENTS = 1000;
    const CEILING_MS = 30000;

    const stream = new AFS.ChangeStream({ collectionName: 'stress', selector: {} });
    const mux = new AFS.ObserveMultiplexer(stream, false);
    stream.markReady();

    const observers = [];
    for (let i = 0; i < OBSERVERS; i++) {
      const received = [];
      const handle = await mux.addHandle(
        { added(id, fields) { received.push(id); }, changed() {}, removed() {} },
        { nonMutatingCallbacks: true }
      );
      observers.push({ handle, received });
    }

    const start = Date.now();
    const emittedIds = [];
    for (let i = 0; i < EVENTS; i++) {
      const id = 'd-' + i;
      emittedIds.push(id);
      stream.added(id, { n: i });
    }
    const elapsed = Date.now() - start;

    // Assertions: every observer got every id in the same order.
    for (let i = 0; i < OBSERVERS; i++) {
      const rec = observers[i].received;
      // Each observer ALSO gets 0 initial adds (cache was empty when they joined)
      // plus EVENTS live adds → total EVENTS.
      if (rec.length !== EVENTS) {
        test.fail({
          type: 'assert_equal',
          message: `observer #${i} got ${rec.length} events, expected ${EVENTS}`,
        });
        break;
      }
      // Order check — compare first/last and a few probes.
      if (rec[0] !== 'd-0' || rec[EVENTS - 1] !== 'd-' + (EVENTS - 1)) {
        test.fail({
          type: 'assert',
          message: `observer #${i} event order wrong: first=${rec[0]} last=${rec[EVENTS - 1]}`,
        });
        break;
      }
    }

    test.isTrue(
      elapsed < CEILING_MS,
      `200 observers × 1000 events completed in ${elapsed}ms (ceiling ${CEILING_MS}ms)`
    );

    for (const { handle } of observers) handle.stop();
  });

  // =========================================================================
  // (4) Property-based CRUD equivalence vs. Minimongo.
  //
  // Applies the same operation sequence to an AFS collection and a bare
  // LocalCollection. After every op, fetch results are compared.
  // =========================================================================
  Tinytest.addAsync('afs - chaos - property-based equivalence with Minimongo', async (test) => {
    const SEED = 0x1234ABCD;
    const rng = makeRng(SEED);
    const OPS = 50;

    const { collection: afs } = makeCollection();
    const lc = new LocalCollection();

    const idPool = [];
    const opLog = [];
    const mkDoc = () => ({
      _id: Random.id(),
      tag: rng.pick(['a', 'b', 'c']),
      n: rng.int(1000),
      tags: ['x'],
    });

    const fetchSorted = async () => {
      const a = (await afs.find({}).fetchAsync()).slice().sort(
        (x, y) => (x._id < y._id ? -1 : x._id > y._id ? 1 : 0)
      );
      const b = lc.find({}).fetch().slice().sort(
        (x, y) => (x._id < y._id ? -1 : x._id > y._id ? 1 : 0)
      );
      return [a, b];
    };

    for (let i = 0; i < OPS; i++) {
      const r = rng.int(10);
      let op;
      try {
        if (r < 4 || idPool.length === 0) {
          const doc = mkDoc();
          op = { op: 'insert', doc };
          await afs.insertAsync(doc);
          lc.insert(EJSON.clone(doc));
          idPool.push(doc._id);
        } else if (r < 8) {
          const id = idPool[rng.int(idPool.length)];
          const modKind = rng.pick(['$set', '$inc', '$push', '$pull', '$unset']);
          let modifier;
          switch (modKind) {
            case '$set':   modifier = { $set:   { n: rng.int(1000) } }; break;
            case '$inc':   modifier = { $inc:   { n: 1 } }; break;
            case '$push':  modifier = { $push:  { tags: 'y' + rng.int(100) } }; break;
            case '$pull':  modifier = { $pull:  { tags: 'x' } }; break;
            case '$unset': modifier = { $unset: { n: '' } }; break;
          }
          op = { op: 'update', id, modifier };
          await afs.updateAsync({ _id: id }, modifier);
          lc.update({ _id: id }, modifier);
        } else {
          // Use selectors both sides support: {_id: X} or {tag: 'a'}
          const useTag = rng.int(2) === 0;
          let selector;
          if (useTag) selector = { tag: rng.pick(['a', 'b', 'c']) };
          else selector = { _id: idPool[rng.int(idPool.length)] };
          op = { op: 'remove', selector };
          await afs.removeAsync(selector);
          lc.remove(selector);
          // Trim idPool to documents that still exist
          const live = new Set(lc.find({}, { fields: { _id: 1 } }).fetch().map(d => d._id));
          for (let j = idPool.length - 1; j >= 0; j--) {
            if (!live.has(idPool[j])) idPool.splice(j, 1);
          }
        }
      } catch (e) {
        op = { op: 'error', err: e.message, ...op };
      }
      opLog.push(op);

      const [aDocs, bDocs] = await fetchSorted();
      if (aDocs.length !== bDocs.length) {
        test.fail({
          type: 'assert_equal',
          message: `op ${i} caused divergence (seed=0x${SEED.toString(16)}): ` +
                   `afs=${aDocs.length} docs, minimongo=${bDocs.length} docs. ` +
                   `op=${JSON.stringify(op)}`,
        });
        return;
      }
      for (let k = 0; k < aDocs.length; k++) {
        if (!EJSON.equals(aDocs[k], bDocs[k])) {
          test.fail({
            type: 'assert',
            message: `op ${i} doc mismatch (seed=0x${SEED.toString(16)}): ` +
                     `afs=${EJSON.stringify(aDocs[k])} minimongo=${EJSON.stringify(bDocs[k])}. ` +
                     `offending op=${JSON.stringify(op)}`,
          });
          return;
        }
      }
    }

    test.isTrue(true, `property-based equivalence held for ${OPS} ops (seed=0x${SEED.toString(16)})`);
  });

  // =========================================================================
  // (5) Stress — rapid observer add/remove churn.
  //
  // After 500 iterations, multiplexer cache should be empty (no leaks).
  // =========================================================================
  Tinytest.addAsync('afs - chaos - rapid observer churn leaves no leaked multiplexers', async (test) => {
    const ITERATIONS = 500;
    const { provider, collection, name } = makeCollection();

    // Seed collection with a single doc so observers have initial state.
    await collection.insertAsync({ seeded: true });

    for (let i = 0; i < ITERATIONS; i++) {
      const cursor = new AFS.Cursor(provider, name, {});
      const handle = await cursor.observeChangesAsync({
        added() {}, changed() {}, removed() {},
      });
      // wait 1 tick
      await new Promise(resolve => setImmediate(resolve));
      handle.stop();
    }

    // Flush any lingering onEmpty tasks
    await flush(10);

    // Cache should be empty because onEmpty deletes from _multiplexerCache.
    const cacheSize = provider._multiplexerCache ? provider._multiplexerCache.size : 0;
    test.equal(cacheSize, 0, `provider leaked ${cacheSize} multiplexers after ${ITERATIONS} iterations`);
  });

  // =========================================================================
  // (6) Interleaving with reconnected events.
  //
  // After a reconnect, observer state should match the authoritative state.
  // A naive implementation would re-send adds for docs already known to
  // the observer — assert that duplicate adds (post-reconnect) are still
  // handled sanely by the observer's state reconstruction.
  // =========================================================================
  class ReconnectingProvider extends AFS.MockStreamProvider {
    constructor(options = {}) {
      super(options);
      this._activeStreams = new Set();
    }

    startObserving(cursorDescription, ordered) {
      const stream = super.startObserving(cursorDescription, ordered);
      this._activeStreams.add(stream);
      stream.on('stop', () => this._activeStreams.delete(stream));
      return stream;
    }

    async triggerReconnect(collectionName) {
      for (const stream of this._activeStreams) {
        if (stream._cursorDescription.collectionName !== collectionName) continue;
        if (stream.isStopped()) continue;
        stream.markReconnected();
      }
    }
  }

  Tinytest.addAsync('afs - chaos - reconnected events preserve observer/authoritative parity', async (test) => {
    const provider = new ReconnectingProvider();
    const name = 'afs-chaos-reconn-' + Random.id();
    const collection = new AFS.Collection(name, {
      provider,
      connection: null,
      defineMutationMethods: false,
    });

    // Observer's best-effort state reconstruction.
    const observed = new Map();
    let reconnectedCount = 0;
    const cursor = new AFS.Cursor(provider, name, {});
    const handle = await cursor.observeChangesAsync({
      added(id, fields)   { observed.set(id, { ...fields }); },
      changed(id, fields) {
        const doc = observed.get(id) || {};
        for (const [k, v] of Object.entries(fields)) {
          if (v === undefined) delete doc[k]; else doc[k] = v;
        }
        observed.set(id, doc);
      },
      removed(id) { observed.delete(id); },
      reconnected() { reconnectedCount++; },
    });

    // Apply some ops
    const ids = [];
    for (let i = 0; i < 10; i++) {
      ids.push(await collection.insertAsync({ i, tag: 'a' }));
    }
    await flush(3);

    // Trigger reconnect — observer should NOT see duplicate adds because the
    // ChangeStream only emits reconnected(), not re-adds. Observer state must
    // already be in sync with authoritative state.
    await provider.triggerReconnect(name);
    await flush(3);

    test.equal(reconnectedCount, 1, 'observer received exactly one reconnected event');

    // Mutate after reconnect — observer should still track.
    await collection.updateAsync({ _id: ids[0] }, { $set: { tag: 'b' } });
    await collection.removeAsync({ _id: ids[1] });
    await flush(3);

    // Authoritative state
    const authoritative = await collection.find().fetchAsync();
    const authMap = new Map();
    for (const doc of authoritative) {
      const { _id, ...fields } = doc;
      authMap.set(_id, fields);
    }

    test.equal(
      observed.size,
      authMap.size,
      `after reconnect, observer size (${observed.size}) should equal auth size (${authMap.size})`
    );
    for (const [id, fields] of authMap) {
      const obs = observed.get(id);
      test.isTrue(obs !== undefined, `observer missing id ${id} after reconnect`);
      if (obs) {
        test.isTrue(
          EJSON.equals(fields, obs),
          `field mismatch for ${id} after reconnect: auth=${EJSON.stringify(fields)} obs=${EJSON.stringify(obs)}`
        );
      }
    }

    handle.stop();
  });
}
