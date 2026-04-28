import { Tinytest } from 'meteor/tinytest';

// ===========================================================================
// afs - adaptive - targeted coverage for AdaptiveEngine
//
// The engine is now a metrics collector only (no prefetch / throttle /
// backpressure decisions). These tests cover what remains:
//   - recordAccess + LRU eviction + canonical pattern keys
//   - recordQueryExecution EMA tracking
//   - attachToStream change/error/reconnect counting
// ===========================================================================

// ---------------------------------------------------------------------------
// recordQueryExecution EMA
// ---------------------------------------------------------------------------

if (Meteor.isServer) {
  Tinytest.add('afs - adaptive - recordQueryExecution seeds avgDuration on first call', (test) => {
    const engine = new AFS.AdaptiveEngine();
    const name = 'afs-ema-seed-' + Random.id();

    engine.recordQueryExecution(name, 10);
    const state = engine._throttleState.get(name);
    test.isTrue(!!state, 'state should exist after recordQueryExecution');
    test.equal(state.avgDuration, 10);
  });

  Tinytest.add('afs - adaptive - recordQueryExecution converges to steady duration', (test) => {
    const engine = new AFS.AdaptiveEngine();
    const name = 'afs-ema-steady-' + Random.id();

    // EMA: avg = avg * 0.7 + duration * 0.3. With constant duration, avg
    // converges to that duration.
    for (let i = 0; i < 50; i++) {
      engine.recordQueryExecution(name, 100);
    }
    const state = engine._throttleState.get(name);
    test.isTrue(Math.abs(state.avgDuration - 100) < 0.01,
      `avg ${state.avgDuration} should converge to 100`);
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
// Replacement for the tautological "auto-attaches" test.
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

// ---------------------------------------------------------------------------
// _patternKey is canonical (key order insensitive)
// ---------------------------------------------------------------------------

if (Meteor.isServer) {
  Tinytest.add('afs - adaptive - patternKey canonicalizes key order', (test) => {
    const engine = new AFS.AdaptiveEngine();
    const k1 = engine._patternKey('col', { a: 1, b: 2 });
    const k2 = engine._patternKey('col', { b: 2, a: 1 });
    test.equal(k1, k2, 'same selector with different key order must produce the same pattern key');

    // Nested objects must also canonicalize.
    const k3 = engine._patternKey('col', { outer: { a: 1, b: 2 }, top: true });
    const k4 = engine._patternKey('col', { top: true, outer: { b: 2, a: 1 } });
    test.equal(k3, k4);
  });

  Tinytest.add('afs - adaptive - recordAccess with reordered keys shares a single counter', (test) => {
    const engine = new AFS.AdaptiveEngine();
    const name = 'afs-canon-' + Random.id();

    engine.recordAccess(name, { a: 1, b: 2 }, {});
    engine.recordAccess(name, { b: 2, a: 1 }, {});
    engine.recordAccess(name, { a: 1, b: 2 }, {});

    // All three must collapse into one pattern entry with count 3.
    const key = engine._patternKey(name, { a: 1, b: 2 });
    const pattern = engine._accessPatterns.get(key);
    test.isTrue(!!pattern);
    test.equal(pattern.count, 3);
    test.equal(engine._accessPatterns.size, 1);
  });
}

// ---------------------------------------------------------------------------
// _accessPatterns is bounded by maxPatterns (LRU eviction)
// ---------------------------------------------------------------------------

if (Meteor.isServer) {
  Tinytest.add('afs - adaptive - accessPatterns evicts LRU when over maxPatterns cap', (test) => {
    const cap = 16;
    const engine = new AFS.AdaptiveEngine({ maxPatterns: cap });

    // Insert many more distinct selectors than the cap allows.
    const total = cap * 10;
    for (let i = 0; i < total; i++) {
      engine.recordAccess('col', { i }, {});
      test.isTrue(
        engine._accessPatterns.size <= cap,
        `size ${engine._accessPatterns.size} exceeded cap ${cap} at step ${i}`
      );
    }

    test.equal(engine._accessPatterns.size, cap, 'final size should be exactly the cap');

    // Oldest entries (i = 0 .. total-cap-1) must have been evicted; newest
    // cap entries must still be present.
    for (let i = 0; i < total - cap; i++) {
      const key = engine._patternKey('col', { i });
      test.isFalse(engine._accessPatterns.has(key), `old entry i=${i} should be evicted`);
    }
    for (let i = total - cap; i < total; i++) {
      const key = engine._patternKey('col', { i });
      test.isTrue(engine._accessPatterns.has(key), `recent entry i=${i} should be retained`);
    }
  });

  Tinytest.add('afs - adaptive - accessPatterns refreshes LRU position on repeat access', (test) => {
    const engine = new AFS.AdaptiveEngine({ maxPatterns: 3 });

    engine.recordAccess('col', { k: 'a' }, {});
    engine.recordAccess('col', { k: 'b' }, {});
    engine.recordAccess('col', { k: 'c' }, {});
    test.equal(engine._accessPatterns.size, 3);

    // Touch 'a' so it becomes most-recently-used.
    engine.recordAccess('col', { k: 'a' }, {});

    // Add 'd' — oldest should now be 'b', not 'a'.
    engine.recordAccess('col', { k: 'd' }, {});
    test.equal(engine._accessPatterns.size, 3);

    const keyA = engine._patternKey('col', { k: 'a' });
    const keyB = engine._patternKey('col', { k: 'b' });
    const keyC = engine._patternKey('col', { k: 'c' });
    const keyD = engine._patternKey('col', { k: 'd' });

    test.isTrue(engine._accessPatterns.has(keyA), 'a must survive because it was just accessed');
    test.isFalse(engine._accessPatterns.has(keyB), 'b must be evicted (least recently used)');
    test.isTrue(engine._accessPatterns.has(keyC));
    test.isTrue(engine._accessPatterns.has(keyD));
  });
}
