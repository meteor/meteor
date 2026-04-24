import { Tinytest } from 'meteor/tinytest';

// =============================================================================
// Stream-provider cache & lifecycle coverage tests (server only)
//
// These tests close gaps identified in a test-coverage review of
//   - stream-provider.js (_getMultiplexer, _createMultiplexer, _closeMultiplexers)
//   - change-stream.js   (markError fallback to Meteor._debug)
//   - mock-stream-provider.js (microtask deferral of initial observe setup)
// =============================================================================

if (Meteor.isServer) {

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  // Build a simple non-caching spy wrapper around startObserving. Returns an
  // object that tracks call count, the last cursorDescription, and a reference
  // to the most recently created stream. Delegates to the provider's original
  // startObserving for actual behavior.
  function spyStartObserving(provider) {
    const spy = {
      calls: 0,
      lastDescription: null,
      lastOrdered: null,
      lastStream: null,
    };
    const original = provider.startObserving.bind(provider);
    provider.startObserving = (cursorDescription, ordered) => {
      spy.calls += 1;
      spy.lastDescription = cursorDescription;
      spy.lastOrdered = ordered;
      const stream = original(cursorDescription, ordered);
      spy.lastStream = stream;
      return stream;
    };
    return spy;
  }

  // ---------------------------------------------------------------------------
  // Cache-key correctness
  // ---------------------------------------------------------------------------

  Tinytest.addAsync(
    'afs - stream-provider - cache key stable across description key order',
    async (test) => {
      const provider = new AFS.MockStreamProvider();
      const collName = Random.id();
      await provider.insertAsync(collName, { n: 1 });

      // Two descriptions with logically identical content but different
      // insertion order of keys. If the cache key is stable (either because
      // EJSON.stringify sorts keys, or because the provider normalizes before
      // hashing), these MUST resolve to the same multiplexer instance.
      const descA = {
        collectionName: collName,
        selector: { a: 1, b: 2 },
        options: { limit: 10, sort: { n: 1 } },
      };
      const descB = {
        // Reversed top-level key order
        options: { sort: { n: 1 }, limit: 10 },
        selector: { b: 2, a: 1 },
        collectionName: collName,
      };

      const m1 = await provider._getMultiplexer(descA, false);
      const m2 = await provider._getMultiplexer(descB, false);

      test.equal(
        m1,
        m2,
        'Identical-content descriptions should map to the same multiplexer ' +
        'regardless of key insertion order (EJSON.stringify must produce a ' +
        'stable key for equivalent objects)'
      );

      await provider.close();
    }
  );

  Tinytest.addAsync(
    'afs - stream-provider - ordered true vs false produce distinct cache entries',
    async (test) => {
      const provider = new AFS.MockStreamProvider();
      const collName = Random.id();
      await provider.insertAsync(collName, { n: 1 });

      const desc = { collectionName: collName, selector: {}, options: {} };

      const mUnordered = await provider._getMultiplexer(desc, false);
      const mOrdered = await provider._getMultiplexer(desc, true);

      test.notEqual(
        mUnordered,
        mOrdered,
        'ordered:true and ordered:false must NOT share a multiplexer'
      );
      test.isTrue(provider._multiplexerCache.size >= 2);

      await provider.close();
    }
  );

  Tinytest.addAsync(
    'afs - stream-provider - different projection/fields produce distinct multiplexers',
    async (test) => {
      const provider = new AFS.MockStreamProvider();
      const collName = Random.id();
      await provider.insertAsync(collName, { a: 1, b: 2 });

      const desc1 = {
        collectionName: collName,
        selector: {},
        options: { projection: { a: 1 } },
      };
      const desc2 = {
        collectionName: collName,
        selector: {},
        options: { projection: { b: 1 } },
      };

      const m1 = await provider._getMultiplexer(desc1, false);
      const m2 = await provider._getMultiplexer(desc2, false);

      test.notEqual(m1, m2, 'different projections must not share a multiplexer');

      await provider.close();
    }
  );

  Tinytest.addAsync(
    'afs - stream-provider - different limit or sort produce distinct multiplexers',
    async (test) => {
      const provider = new AFS.MockStreamProvider();
      const collName = Random.id();
      await provider.insertAsync(collName, { n: 1 });

      const descLimit10 = {
        collectionName: collName,
        selector: {},
        options: { limit: 10 },
      };
      const descLimit20 = {
        collectionName: collName,
        selector: {},
        options: { limit: 20 },
      };

      const mL10 = await provider._getMultiplexer(descLimit10, false);
      const mL20 = await provider._getMultiplexer(descLimit20, false);
      test.notEqual(mL10, mL20, 'different limit must not share a multiplexer');

      const descSortAsc = {
        collectionName: collName,
        selector: {},
        options: { sort: { n: 1 } },
      };
      const descSortDesc = {
        collectionName: collName,
        selector: {},
        options: { sort: { n: -1 } },
      };

      const mAsc = await provider._getMultiplexer(descSortAsc, false);
      const mDesc = await provider._getMultiplexer(descSortDesc, false);
      test.notEqual(mAsc, mDesc, 'different sort must not share a multiplexer');

      await provider.close();
    }
  );

  // ---------------------------------------------------------------------------
  // Pending-call dedupe
  // ---------------------------------------------------------------------------

  Tinytest.addAsync(
    'afs - stream-provider - concurrent _getMultiplexer dedupes startObserving',
    async (test) => {
      const provider = new AFS.MockStreamProvider();
      const collName = Random.id();
      await provider.insertAsync(collName, { n: 1 });

      const spy = spyStartObserving(provider);

      const desc = { collectionName: collName, selector: {}, options: {} };

      // Fire two calls back-to-back WITHOUT awaiting between them — the second
      // call must hit the pending-promise path, NOT invoke startObserving a
      // second time.
      const p1 = provider._getMultiplexer(desc, false);
      const p2 = provider._getMultiplexer(desc, false);

      const [m1, m2] = await Promise.all([p1, p2]);

      test.equal(m1, m2, 'concurrent callers should get the same multiplexer');
      test.equal(
        spy.calls,
        1,
        'startObserving must be invoked exactly once for deduped concurrent calls'
      );

      await provider.close();
    }
  );

  // ---------------------------------------------------------------------------
  // _createMultiplexer failure & retry
  // ---------------------------------------------------------------------------

  Tinytest.addAsync(
    'afs - stream-provider - synchronous startObserving throw rejects and retries',
    async (test) => {
      const provider = new AFS.MockStreamProvider();
      const collName = Random.id();
      await provider.insertAsync(collName, { n: 1 });

      let calls = 0;
      const originalStartObserving = provider.startObserving.bind(provider);
      provider.startObserving = (desc, ordered) => {
        calls += 1;
        if (calls === 1) {
          throw new Error('sync-boom');
        }
        return originalStartObserving(desc, ordered);
      };

      const desc = { collectionName: collName, selector: {}, options: {} };

      // First call should reject with the sync error.
      let firstErr = null;
      try {
        await provider._getMultiplexer(desc, false);
      } catch (e) {
        firstErr = e;
      }
      test.isTrue(firstErr instanceof Error, 'first call must reject');
      test.matches(firstErr.message, /sync-boom/);

      // The failed attempt must not leak into either map.
      test.equal(
        provider._multiplexerPending.size,
        0,
        '_multiplexerPending must be cleaned up after a failed sync attempt'
      );
      test.equal(
        provider._multiplexerCache.size,
        0,
        '_multiplexerCache must not contain the failed attempt'
      );

      // Second call must RETRY (invoke startObserving again), not surface the
      // cached rejection.
      const m = await provider._getMultiplexer(desc, false);
      test.isTrue(!!m, 'retry must produce a multiplexer');
      test.equal(calls, 2, 'startObserving must be called a second time on retry');

      await provider.close();
    }
  );

  Tinytest.addAsync(
    'afs - stream-provider - async startObserving rejection cleans pending and retries',
    async (test) => {
      const provider = new AFS.MockStreamProvider();
      const collName = Random.id();
      await provider.insertAsync(collName, { n: 1 });

      // Wrap _createMultiplexer so its async side-path rejects on the first
      // call. This exercises the pending-cleanup `finally` path in
      // _getMultiplexer.
      let createCalls = 0;
      const originalCreate = provider._createMultiplexer.bind(provider);
      provider._createMultiplexer = async (desc, ordered, key) => {
        createCalls += 1;
        if (createCalls === 1) {
          // Defer rejection so it goes through the pending-promise path.
          await Promise.resolve();
          throw new Error('async-boom');
        }
        return originalCreate(desc, ordered, key);
      };

      const desc = { collectionName: collName, selector: {}, options: {} };

      let firstErr = null;
      try {
        await provider._getMultiplexer(desc, false);
      } catch (e) {
        firstErr = e;
      }
      test.isTrue(firstErr instanceof Error, 'first call must reject asynchronously');
      test.matches(firstErr.message, /async-boom/);

      test.equal(
        provider._multiplexerPending.size,
        0,
        '_multiplexerPending must not leak entries after async failure'
      );
      test.equal(
        provider._multiplexerCache.size,
        0,
        '_multiplexerCache must not contain the failed attempt'
      );

      // Second call retries successfully.
      const m = await provider._getMultiplexer(desc, false);
      test.isTrue(!!m, 'retry must succeed');
      test.equal(createCalls, 2, '_createMultiplexer must be invoked again on retry');

      await provider.close();
    }
  );

  // ---------------------------------------------------------------------------
  // Cache eviction & rebuild
  // ---------------------------------------------------------------------------

  Tinytest.addAsync(
    'afs - stream-provider - last-handle stop evicts multiplexer; next observeChanges builds fresh',
    async (test) => {
      const provider = new AFS.MockStreamProvider();
      const collName = Random.id();
      await provider.insertAsync(collName, { name: 'A' });

      const cursor1 = new AFS.Cursor(provider, collName, {});
      const handle1 = await cursor1.observeChangesAsync({
        added() {},
        changed() {},
        removed() {},
      });

      test.equal(
        provider._multiplexerCache.size,
        1,
        'a multiplexer should be cached after first observeChanges'
      );

      // Grab the cached instance.
      const firstMultiplexer = Array.from(provider._multiplexerCache.values())[0];
      test.isTrue(!!firstMultiplexer);

      // Stop the only handle — the ObserveMultiplexer's onEmpty will evict it
      // from the provider's cache and stop the stream.
      handle1.stop();

      test.equal(
        provider._multiplexerCache.size,
        0,
        'cache must be empty after last handle stops'
      );

      // Re-observe with the same cursor description — this must build a FRESH
      // multiplexer, not resurrect the old (already-stopped) one.
      const cursor2 = new AFS.Cursor(provider, collName, {});
      const handle2 = await cursor2.observeChangesAsync({
        added() {},
        changed() {},
        removed() {},
      });

      test.equal(provider._multiplexerCache.size, 1);
      const secondMultiplexer = Array.from(provider._multiplexerCache.values())[0];
      test.notEqual(
        secondMultiplexer,
        firstMultiplexer,
        'a fresh multiplexer must be built after eviction; old one must not be reused'
      );
      test.isFalse(
        secondMultiplexer._stream.isStopped(),
        'the fresh multiplexer must have a live ChangeStream'
      );

      handle2.stop();
      await provider.close();
    }
  );

  // ---------------------------------------------------------------------------
  // Proper "startObserving error propagates" (replaces the mis-named test at
  // afs-tests.js:1433, which only exercised markError on a manually-created
  // ChangeStream and never went through _getMultiplexer).
  // ---------------------------------------------------------------------------

  Tinytest.addAsync(
    'afs - stream-provider - startObserving async error propagates to awaiting caller',
    async (test) => {
      const provider = new AFS.MockStreamProvider();
      const collName = Random.id();
      await provider.insertAsync(collName, { n: 1 });

      const sentinel = new Error('startObserving exploded');

      // Override startObserving to create the ChangeStream, then asynchronously
      // reject it via markError. _getMultiplexer eventually awaits readiness
      // through ObserveMultiplexer.addHandle, but here we observe the error
      // directly on the stream since _createMultiplexer returns the multiplexer
      // synchronously after startObserving.
      //
      // To actually exercise error propagation to the AWAITING CALLER we go
      // through cursor.observeChangesAsync, which awaits the multiplexer's
      // _readyPromise, and deliver the error via the error callback path.
      provider.startObserving = function (cursorDescription) {
        const stream = this.createChangeStream(cursorDescription);
        Promise.resolve().then(() => {
          if (!stream.isStopped()) stream.markError(sentinel);
        });
        return stream;
      };

      const cursor = new AFS.Cursor(provider, collName, {});

      let receivedErr = null;
      let readyFired = false;

      // observeChangesAsync resolves once addHandle completes. addHandle awaits
      // the multiplexer's _readyPromise; if startObserving never calls
      // markReady() but instead emits 'error', the handle registers an error
      // callback to capture it.
      //
      // We attach an error callback and race readiness against the error.
      const handlePromise = cursor.observeChangesAsync({
        added() {},
        changed() {},
        removed() {},
        error(err) { receivedErr = err; },
      });

      // Also wait on the stream error so we can assert even if readiness never
      // resolves.
      const errorSeen = new Promise((resolve) => {
        const tryAttach = () => {
          const mult = Array.from(provider._multiplexerCache.values())[0] ||
                       Array.from(provider._multiplexerPending.values())[0];
          if (mult && mult.then) {
            // pending promise — wait for it
            mult.then((m) => {
              m._stream.on('error', (err) => resolve(err));
            }).catch((err) => resolve(err));
          } else if (mult) {
            mult._stream.on('error', (err) => resolve(err));
          } else {
            setTimeout(tryAttach, 5);
          }
        };
        tryAttach();
      });

      // Give the startObserving microtask a chance to fire markError.
      await new Promise((resolve) => setTimeout(resolve, 50));

      const err = await errorSeen;
      test.isTrue(err instanceof Error, 'caller must receive an Error object');
      test.equal(err, sentinel, 'caller must receive the exact error identity');
      test.matches(err.message, /startObserving exploded/);

      // Cleanup: resolve handlePromise if it is still hanging (markReady never
      // fired, so addHandle would wait forever otherwise). We stop the stream
      // which does NOT resolve _readyPromise, so also cancel the test's wait.
      // Stop the pending multiplexer's stream to let close() tear down.
      for (const m of provider._multiplexerCache.values()) {
        if (!m._stream.isStopped()) m._stream.stop();
      }
      // handlePromise may remain pending because addHandle awaits readiness;
      // we intentionally do not await it. Mark readyFired used to avoid lint.
      void handlePromise;
      void readyFired;

      await provider.close();
    }
  );

  // ---------------------------------------------------------------------------
  // ChangeStream error emission path — unlistened 'error' events must route to
  // Meteor._debug (not crash, and not silently drop).
  // ---------------------------------------------------------------------------

  Tinytest.add(
    'afs - stream-provider - ChangeStream markError without listener routes to Meteor._debug (silentErrors opt-in)',
    (test) => {
      // Under the restored Node default semantics an unlistened 'error' will
      // throw; callers that want the old silent behavior must opt in via
      // { silentErrors: true }.
      const stream = new AFS.ChangeStream(
        { collectionName: Random.id(), selector: {} },
        { silentErrors: true }
      );

      const originalDebug = Meteor._debug;
      const debugCalls = [];
      Meteor._debug = function (...args) {
        debugCalls.push(args);
      };

      try {
        stream.markError(new Error('boom'));
      } finally {
        Meteor._debug = originalDebug;
      }

      test.equal(debugCalls.length, 1, 'Meteor._debug must be called exactly once');
      const [message, errArg] = debugCalls[0];
      test.isTrue(
        typeof message === 'string' &&
          (/error/i.test(message) || /boom/.test(message)),
        'debug message should reference error/boom'
      );
      test.isTrue(errArg instanceof Error, 'the original Error should be passed');
      test.matches(errArg.message, /boom/);

      stream.stop();
    }
  );

  Tinytest.add(
    'afs - stream-provider - ChangeStream unlistened error throws by default (Node semantics)',
    (test) => {
      // Default: silentErrors === false — an unlistened 'error' must throw,
      // matching Node's EventEmitter contract.
      const stream = new AFS.ChangeStream({
        collectionName: Random.id(),
        selector: {},
      });

      let threw = null;
      try {
        stream.markError(new Error('node-default-boom'));
      } catch (e) {
        threw = e;
      }
      test.isTrue(threw instanceof Error, 'unlistened error must throw');
      test.matches(threw && threw.message, /node-default-boom/);

      stream.stop();
    }
  );

  // ---------------------------------------------------------------------------
  // C2 — base close() cleanup is safe to call from a subclass.
  // ---------------------------------------------------------------------------

  Tinytest.addAsync(
    'afs - StreamProvider - close() cleanup is safe to call from subclass',
    async (test) => {
      // A subclass that does its own cleanup and then calls super.close() as
      // the last step (per the documented contract) must not throw.
      let subclassCleanupRan = false;
      class Sub extends AFS.StreamProvider {
        constructor() {
          super({ name: 'sub-for-close-test' });
        }
        // startObserving is unused in this test but required by the contract.
        startObserving() { return new AFS.ChangeStream({ collectionName: 'x', selector: {} }); }
        _supportsEventEmitter() { return true; }
        async close() {
          // Subclass-specific cleanup first.
          subclassCleanupRan = true;
          // Then delegate to the base. Per the new contract this must not throw.
          await super.close();
        }
      }

      const provider = new Sub();
      test.equal(provider._state, 'open', 'provider starts in open state');

      let threw = null;
      try {
        await provider.close();
      } catch (e) {
        threw = e;
      }
      test.isNull(threw, 'super.close() must not throw');
      test.isTrue(subclassCleanupRan, 'subclass cleanup ran');
      test.equal(provider._state, 'closed', 'provider state is closed after close()');

      // Second close is a safe no-op.
      let secondThrew = null;
      try {
        await provider.close();
      } catch (e) {
        secondThrew = e;
      }
      test.isNull(secondThrew, 'repeated close() must be idempotent');
    }
  );

  Tinytest.addAsync(
    'afs - StreamProvider - abstract methods on a closed provider throw ProviderClosedError',
    async (test) => {
      // A minimal abstract subclass — when closed, its inherited base methods
      // (find, startObserving, insertAsync, …) must throw provider-closed
      // instead of the generic "must be implemented" error.
      class BareSub extends AFS.StreamProvider {
        constructor() { super({ name: 'bare-sub' }); }
      }
      const provider = new BareSub();
      await provider.close();

      const callers = [
        () => provider.find('x'),
        () => provider.startObserving({ collectionName: 'x', selector: {} }, false),
      ];
      for (const call of callers) {
        let caught = null;
        try { call(); } catch (e) { caught = e; }
        test.isTrue(caught instanceof Error, 'method on closed provider must throw');
        test.equal(
          caught.code,
          'provider-closed',
          'error code should be provider-closed, not a must-implement message'
        );
      }

      // Async variant.
      let asyncCaught = null;
      try {
        await provider.insertAsync('x', {});
      } catch (e) {
        asyncCaught = e;
      }
      test.isTrue(asyncCaught instanceof Error, 'async method on closed provider must reject');
      test.equal(asyncCaught.code, 'provider-closed');
    }
  );

  // ---------------------------------------------------------------------------
  // Microtask ordering invariant for MockStreamProvider.startObserving.
  // The implementation defers `cursor.observeChanges` to a microtask so that
  // the ObserveMultiplexer can attach its listeners before initial adds fire.
  // This test asserts the ordering explicitly.
  // ---------------------------------------------------------------------------

  Tinytest.addAsync(
    'afs - stream-provider - MockStreamProvider defers initial adds until after listener attachment',
    async (test) => {
      class OrderingMockProvider extends AFS.MockStreamProvider {
        constructor(opts) {
          super(opts);
          this.events = []; // shared event log
        }

        startObserving(cursorDescription, ordered) {
          const events = this.events;
          const stream = super.startObserving(cursorDescription, ordered);

          // Monkey-patch stream.on to record when the 'added' listener is
          // attached. Then record when any 'added' event is actually emitted.
          const originalOn = stream.on.bind(stream);
          stream.on = (event, handler) => {
            if (event === 'added') {
              events.push({ kind: 'listener-attached', event });
              const wrapped = (...args) => {
                events.push({ kind: 'event-emitted', event, args });
                return handler(...args);
              };
              return originalOn(event, wrapped);
            }
            return originalOn(event, handler);
          };

          return stream;
        }
      }

      const provider = new OrderingMockProvider();
      const collName = Random.id();
      // Seed some data so initial adds will fire.
      await provider.insertAsync(collName, { n: 1 });
      await provider.insertAsync(collName, { n: 2 });

      // Go through _getMultiplexer so ObserveMultiplexer attaches 'added'
      // listeners in its constructor; then addHandle awaits readiness.
      const desc = { collectionName: collName, selector: {}, options: {} };
      const multiplexer = await provider._getMultiplexer(desc, false);

      const gotAdds = [];
      const handle = await multiplexer.addHandle({
        added(id, fields) { gotAdds.push({ id, fields }); },
        changed() {},
        removed() {},
      });

      // At this point initial adds should have been delivered. Find the index
      // of the first listener-attached and first event-emitted entries.
      const attachedIdx = provider.events.findIndex(
        (e) => e.kind === 'listener-attached'
      );
      const emittedIdx = provider.events.findIndex(
        (e) => e.kind === 'event-emitted'
      );

      test.notEqual(attachedIdx, -1, '"added" listener must have been attached');
      test.notEqual(emittedIdx, -1, '"added" event must have been emitted');
      test.isTrue(
        attachedIdx < emittedIdx,
        'listener attachment must precede event emission (microtask deferral invariant)'
      );
      test.equal(
        gotAdds.length,
        2,
        'both seeded docs must reach the handle via initial adds'
      );

      handle.stop();
      await provider.close();
    }
  );

  // ---------------------------------------------------------------------------
  // close() stops all cached multiplexers across multiple queries.
  // ---------------------------------------------------------------------------

  Tinytest.addAsync(
    'afs - stream-provider - close stops all cached multiplexers on multiple queries',
    async (test) => {
      const provider = new AFS.MockStreamProvider();
      const collName = Random.id();
      await provider.insertAsync(collName, { tag: 'x', n: 1 });
      await provider.insertAsync(collName, { tag: 'y', n: 2 });

      const cursorX = new AFS.Cursor(provider, collName, { tag: 'x' });
      const cursorY = new AFS.Cursor(provider, collName, { tag: 'y' });

      const handleX = await cursorX.observeChangesAsync({
        added() {}, changed() {}, removed() {},
      });
      const handleY = await cursorY.observeChangesAsync({
        added() {}, changed() {}, removed() {},
      });

      test.equal(
        provider._multiplexerCache.size,
        2,
        'two distinct queries must produce two cached multiplexers'
      );

      // Snapshot the underlying ChangeStreams so we can verify each was
      // stopped independently by close().
      const streams = [];
      let stopSignals = 0;
      for (const m of provider._multiplexerCache.values()) {
        streams.push(m._stream);
        m._stream.on('stop', () => { stopSignals += 1; });
      }
      test.equal(streams.length, 2);
      test.isFalse(streams[0].isStopped());
      test.isFalse(streams[1].isStopped());

      await provider.close();

      test.equal(
        provider._multiplexerCache.size,
        0,
        '_multiplexerCache must be empty after close()'
      );
      test.equal(
        provider._multiplexerPending.size,
        0,
        '_multiplexerPending must be empty after close()'
      );
      test.isTrue(streams[0].isStopped(), 'first multiplexer stream must be stopped');
      test.isTrue(streams[1].isStopped(), 'second multiplexer stream must be stopped');
      test.equal(
        stopSignals,
        2,
        'each cached multiplexer must have received its own stop signal'
      );

      // Stale handles should no longer keep anything alive; calling stop on
      // them is idempotent and must not throw.
      handleX.stop();
      handleY.stop();
    }
  );

}
