import { Tinytest } from 'meteor/tinytest';

// =============================================================================
// Driver-caching hoist — startObserving teardown contract
//
// Verifies that providers can return either a bare ChangeStream (legacy) or
// { stream, teardown } (new), and that afs invokes teardown at the right
// time, exactly once, with errors caught.
// =============================================================================

if (Meteor.isServer) {

  // ---------------------------------------------------------------------------
  // Test fixtures
  // ---------------------------------------------------------------------------

  // A StreamProvider that lets each test configure what startObserving
  // returns and what its teardown does. Records every call so tests can
  // assert ordering and at-most-once invocation.
  class TeardownTestProvider extends AFS.StreamProvider {
    constructor(options = {}) {
      super({ name: 'teardown-test', ...options });
      this._connected = true;
      // What shape startObserving returns:
      //   'bare'            — legacy ChangeStream
      //   'bundle'          — { stream, teardown }
      //   'garbage'         — opts.garbageValue (anything non-conforming)
      //   'already-stopped' — { stream, teardown } where stream is pre-stopped
      this.shape = options.shape || 'bundle';
      this.garbageValue = options.garbageValue;
      // If true, teardown throws when invoked.
      this.teardownThrows = !!options.teardownThrows;
      // Recording — populated as the test runs.
      this.events = [];
      this.teardownCallCount = 0;
      this.lastStream = null;
    }

    supportsEventEmitter() { return true; }

    startObserving(cursorDescription, ordered) {
      const stream = new AFS.ChangeStream(cursorDescription);
      this.lastStream = stream;
      stream.on('stop', () => { this.events.push('stream:stop'); });

      // Defer markReady to next microtask to honor the sync-emission contract.
      Promise.resolve().then(() => {
        if (!stream.isStopped()) stream.markReady();
      });

      const teardown = () => {
        this.events.push('teardown');
        this.teardownCallCount++;
        if (this.teardownThrows) {
          throw new Error('teardown boom');
        }
      };

      if (this.shape === 'bare') {
        return stream;
      }
      if (this.shape === 'garbage') {
        return this.garbageValue;
      }
      if (this.shape === 'already-stopped') {
        stream.stop();
        return { stream, teardown };
      }
      return { stream, teardown };
    }

    async fetchResults() { return []; }
  }

  // Wait two microtasks — gives ObserveMultiplexer time to install its
  // listeners and the deferred markReady to fire.
  function flushMicrotasks() {
    return Promise.resolve().then(() => Promise.resolve());
  }

  // Capture Meteor._debug so tests can assert that thrown teardowns log.
  function captureDebug() {
    const logs = [];
    const orig = Meteor._debug;
    Meteor._debug = (...args) => { logs.push(args); };
    return { logs, restore() { Meteor._debug = orig; } };
  }

  // ---------------------------------------------------------------------------
  // Tests
  // ---------------------------------------------------------------------------

  // Test 1: Bare ChangeStream return is preserved (regression guard for
  // mock + mongo providers, which return ChangeStream directly).
  Tinytest.addAsync(
    'afs - teardown - bare ChangeStream return still works',
    async (test) => {
      const provider = new TeardownTestProvider({ shape: 'bare' });
      const desc = { collectionName: 'c', selector: {}, options: {} };

      const mux = await provider._getMultiplexer(desc, false);
      test.isTrue(!!mux, 'multiplexer constructed');

      const handle = await mux.addHandle({
        added() {}, changed() {}, removed() {},
      }, {});
      handle.stop();
      await flushMicrotasks();

      test.equal(provider.teardownCallCount, 0,
        'no teardown invoked for bare-stream provider');
      await provider.close();
    }
  );

  // Test 2: Teardown fires on last-handle detach.
  Tinytest.addAsync(
    'afs - teardown - fires when last handle detaches (onEmpty path)',
    async (test) => {
      const provider = new TeardownTestProvider();
      const desc = { collectionName: 'c', selector: {}, options: {} };

      const mux = await provider._getMultiplexer(desc, false);
      const noop = { added() {}, changed() {}, removed() {} };
      const h1 = await mux.addHandle(noop, {});
      const h2 = await mux.addHandle(noop, {});

      h1.stop();
      await flushMicrotasks();
      test.equal(provider.teardownCallCount, 0,
        'teardown not yet — h2 still attached');

      h2.stop();
      await flushMicrotasks();
      test.equal(provider.teardownCallCount, 1,
        'teardown fired exactly once after last handle detached');

      await provider.close();
    }
  );

  // Test 3: Teardown fires BEFORE stream.stop() on the onEmpty path.
  Tinytest.addAsync(
    'afs - teardown - teardown precedes stream stop on onEmpty path',
    async (test) => {
      const provider = new TeardownTestProvider();
      const desc = { collectionName: 'c', selector: {}, options: {} };

      const mux = await provider._getMultiplexer(desc, false);
      const handle = await mux.addHandle({
        added() {}, changed() {}, removed() {},
      }, {});
      handle.stop();
      await flushMicrotasks();

      const tdIdx = provider.events.indexOf('teardown');
      const stIdx = provider.events.indexOf('stream:stop');
      test.notEqual(tdIdx, -1, 'teardown event recorded');
      test.notEqual(stIdx, -1, 'stream:stop event recorded');
      test.isTrue(tdIdx < stIdx,
        'teardown must run before stream.stop() on onEmpty path');

      await provider.close();
    }
  );

  // Test 4: Teardown fires on provider close (safety-net path).
  // _closeMultiplexers stops the stream directly, bypassing onEmpty.
  Tinytest.addAsync(
    'afs - teardown - fires when provider.close() stops streams directly',
    async (test) => {
      const provider = new TeardownTestProvider();
      const desc = { collectionName: 'c', selector: {}, options: {} };

      const mux = await provider._getMultiplexer(desc, false);
      const handle = await mux.addHandle({
        added() {}, changed() {}, removed() {},
      }, {});

      // Don't stop the handle. provider.close() invokes _closeMultiplexers,
      // which stops the underlying stream directly without going through
      // the multiplexer's onEmpty.
      await provider.close();
      await flushMicrotasks();

      test.equal(provider.teardownCallCount, 1,
        'safety-net stream.once("stop") fired teardown on close path');

      // Defensive: stop the still-attached handle so the test harness
      // doesn't see a dangling reference.
      try { handle.stop(); } catch (e) { /* multiplexer already stopped */ }
    }
  );

  // Test 5: Teardown fires when the provider self-stops the stream
  // (e.g. fatal-error path inside the provider's init microtask).
  Tinytest.addAsync(
    'afs - teardown - fires when provider self-stops the stream',
    async (test) => {
      const provider = new TeardownTestProvider();
      const desc = { collectionName: 'c', selector: {}, options: {} };

      const mux = await provider._getMultiplexer(desc, false);
      const handle = await mux.addHandle({
        added() {}, changed() {}, removed() {},
      }, {});

      // Provider stops its own stream — simulates a driver that hits
      // a fatal error and calls stream.stop() itself.
      provider.lastStream.stop();
      await flushMicrotasks();

      test.equal(provider.teardownCallCount, 1,
        'safety-net listener fired teardown on provider self-stop');

      try { handle.stop(); } catch (e) { /* expected */ }
      await provider.close();
    }
  );

  // Test 6: At-most-once. Trigger both onEmpty and stream-stop paths.
  Tinytest.addAsync(
    'afs - teardown - invoked at most once even if multiple paths trigger',
    async (test) => {
      const provider = new TeardownTestProvider();
      const desc = { collectionName: 'c', selector: {}, options: {} };

      const mux = await provider._getMultiplexer(desc, false);
      const handle = await mux.addHandle({
        added() {}, changed() {}, removed() {},
      }, {});

      handle.stop();   // triggers onEmpty → safeTeardown + stream.stop()
      await flushMicrotasks();
      provider.lastStream.stop();  // already stopped, no-op
      await flushMicrotasks();

      test.equal(provider.teardownCallCount, 1,
        'at-most-once guaranteed across onEmpty + redundant stream.stop()');

      await provider.close();
    }
  );

  // Test 7: A throwing teardown is caught and logged; stream.stop() still runs.
  Tinytest.addAsync(
    'afs - teardown - throwing teardown is caught and logged',
    async (test) => {
      const provider = new TeardownTestProvider({ teardownThrows: true });
      const desc = { collectionName: 'c', selector: {}, options: {} };
      const cap = captureDebug();

      try {
        const mux = await provider._getMultiplexer(desc, false);
        const handle = await mux.addHandle({
          added() {}, changed() {}, removed() {},
        }, {});
        handle.stop();
        await flushMicrotasks();

        test.equal(provider.teardownCallCount, 1, 'teardown was invoked');
        test.isTrue(provider.events.includes('stream:stop'),
          'stream.stop() still ran despite throwing teardown');

        const logged = cap.logs.some(
          args => typeof args[0] === 'string' &&
            args[0].includes('teardown threw') &&
            args[0].includes('TeardownTestProvider')
        );
        test.isTrue(logged,
          'Meteor._debug logged the teardown failure with provider class name');
      } finally {
        cap.restore();
        await provider.close();
      }
    }
  );

  // Test 8: Garbage return shape throws TypeError naming the provider class.
  // Covers null, undefined, wrong-shape object, non-function teardown,
  // and the already-stopped-stream defensive case.
  Tinytest.addAsync(
    'afs - teardown - garbage startObserving return throws TypeError',
    async (test) => {
      const cases = [
        { label: 'null',       shape: 'garbage', garbageValue: null },
        { label: 'undefined',  shape: 'garbage', garbageValue: undefined },
        { label: 'plain {}',   shape: 'garbage', garbageValue: {} },
        { label: '{stream:notStream, teardown:fn}',
          shape: 'garbage',
          garbageValue: { stream: { foo: 1 }, teardown: () => {} } },
        { label: '{stream, teardown:"not-a-function"}',
          shape: 'garbage',
          garbageValue: null /* set per-iteration below */ },
      ];

      for (const c of cases) {
        const provider = new TeardownTestProvider({
          shape: c.shape,
          garbageValue: c.label.startsWith('{stream, teardown:"not-a-')
            ? { stream: new AFS.ChangeStream({}), teardown: 'not-a-function' }
            : c.garbageValue,
        });
        const desc = { collectionName: 'c', selector: {}, options: {} };

        let threw = null;
        try {
          await provider._getMultiplexer(desc, false);
        } catch (e) {
          threw = e;
        }
        test.isTrue(threw instanceof TypeError,
          `${c.label}: must throw TypeError`);
        test.isTrue(
          threw && threw.message.includes('TeardownTestProvider'),
          `${c.label}: TypeError message must name the offending provider class`);

        await provider.close();
      }

      // Already-stopped stream: separate Error type per spec ("returned an
      // already-stopped stream"), still names the provider class. The
      // teardown for the bundle MUST still run.
      const provider = new TeardownTestProvider({ shape: 'already-stopped' });
      const desc = { collectionName: 'c', selector: {}, options: {} };
      let threw = null;
      try {
        await provider._getMultiplexer(desc, false);
      } catch (e) {
        threw = e;
      }
      test.isTrue(threw instanceof Error, 'already-stopped: throws Error');
      test.isTrue(
        threw && threw.message.includes('already-stopped') &&
          threw.message.includes('TeardownTestProvider'),
        'already-stopped: error message names class and condition');
      test.equal(provider.teardownCallCount, 1,
        'already-stopped: teardown still ran (defensive cleanup)');
      await provider.close();
    }
  );

  // Test 9: Multiplexer construction failure still runs teardown.
  // Force ObserveMultiplexer's constructor to throw by replacing its
  // prototype's _bindStreamEvents (called late in the constructor) for
  // the duration of the test. Because the prototype is shared between
  // AFS.ObserveMultiplexer and the lexically-imported ObserveMultiplexer
  // inside stream-provider.js, the throw propagates out of the
  // constructor regardless of how the call site looks it up.
  Tinytest.addAsync(
    'afs - teardown - multiplexer construction failure runs teardown',
    async (test) => {
      const provider = new TeardownTestProvider();
      const desc = { collectionName: 'c', selector: {}, options: {} };

      const proto = AFS.ObserveMultiplexer.prototype;
      const originalBind = proto._bindStreamEvents;
      proto._bindStreamEvents = function () {
        throw new Error('forced constructor failure');
      };

      let threw = null;
      try {
        await provider._getMultiplexer(desc, false);
      } catch (e) {
        threw = e;
      } finally {
        proto._bindStreamEvents = originalBind;
      }

      test.isTrue(threw instanceof Error,
        'expected error from forced multiplexer failure');
      test.equal(threw.message, 'forced constructor failure');
      test.equal(provider.teardownCallCount, 1,
        'teardown ran in the construction-failure catch branch');
      test.isTrue(provider.events.indexOf('teardown') <
        provider.events.indexOf('stream:stop'),
        'teardown precedes stream.stop() on the construction-failure path');

      await provider.close();
    }
  );

  // ---------------------------------------------------------------------------
  // close() lifecycle contract — hook order, transitional state, idempotency
  // ---------------------------------------------------------------------------

  // A minimal MockStreamProvider subclass that records when each lifecycle
  // hook fires and lets the test gate `_drainPendingWrites` on a deferred
  // promise. Used to verify the canonical teardown order on the base class.
  class LifecycleProbeProvider extends AFS.MockStreamProvider {
    constructor(options = {}) {
      super(options);
      this.events = [];
      // If set, _drainPendingWrites awaits this promise before resolving.
      // Lets a test put close() into the 'closing' state and probe behavior
      // mid-flight.
      this._drainGate = null;
      // Snapshot of _state taken at the moment each hook fires.
      this.stateAtMultiplexerClose = null;
      this.stateAtDrain = null;
      this.stateAtTransport = null;
      this._closeMultiplexersCalls = 0;
      this._drainCalls = 0;
      this._transportCalls = 0;
    }

    _closeMultiplexers() {
      this._closeMultiplexersCalls++;
      this.stateAtMultiplexerClose = this._state;
      this.events.push('closeMultiplexers');
      return super._closeMultiplexers();
    }

    async _drainPendingWrites() {
      this._drainCalls++;
      this.stateAtDrain = this._state;
      this.events.push('drainPendingWrites');
      if (this._drainGate) await this._drainGate;
    }

    async _closeTransport() {
      this._transportCalls++;
      this.stateAtTransport = this._state;
      this.events.push('closeTransport');
      // Defer to base mock cleanup so post-close re-use still works.
      await super._closeTransport();
    }
  }

  // Test 10: hooks fire in the documented order and _state reflects each step.
  Tinytest.addAsync(
    'afs - close lifecycle - hooks run in canonical order',
    async (test) => {
      const provider = new LifecycleProbeProvider();
      test.equal(provider._state, 'open', 'starts open');

      await provider.close();

      test.equal(
        provider.events.join(','),
        'closeMultiplexers,drainPendingWrites,closeTransport',
        'hook order: multiplexers → drain → transport'
      );
      test.equal(provider.stateAtMultiplexerClose, 'closing',
        '_state is "closing" during _closeMultiplexers');
      test.equal(provider.stateAtDrain, 'closing',
        '_state is "closing" during _drainPendingWrites');
      test.equal(provider.stateAtTransport, 'closing',
        '_state is "closing" during _closeTransport');
      test.equal(provider._state, 'closed',
        '_state flips to "closed" only after all hooks settle');
    }
  );

  // Test 11: a CRUD write started after close() begins fails fast with
  // ProviderClosedError, even though _state is 'closing' (not yet 'closed').
  Tinytest.addAsync(
    'afs - close lifecycle - writes during closing reject with ProviderClosedError',
    async (test) => {
      const provider = new LifecycleProbeProvider();
      let resolveDrain;
      provider._drainGate = new Promise((resolve) => { resolveDrain = resolve; });

      const closePromise = provider.close();
      // Yield once so close() reaches the await on _drainPendingWrites.
      await flushMicrotasks();
      test.equal(provider._state, 'closing',
        'provider is mid-close, in transitional "closing" state');

      let threw = null;
      try {
        await provider.insertAsync('c', { _id: 'late', x: 1 });
      } catch (e) {
        threw = e;
      }
      test.isTrue(threw instanceof AFS.ProviderClosedError,
        'insertAsync during closing throws ProviderClosedError');
      test.equal(threw && threw.code, 'provider-closed',
        'error has the canonical code');

      // Release the drain so close() can finish.
      resolveDrain();
      await closePromise;
      test.equal(provider._state, 'closed', 'close() completes after drain');
    }
  );

  // Test 12: close() is idempotent. A second call is a no-op and the hooks
  // run exactly once total.
  Tinytest.addAsync(
    'afs - close lifecycle - close() is idempotent',
    async (test) => {
      const provider = new LifecycleProbeProvider();

      const [a, b] = await Promise.all([provider.close(), provider.close()]);
      test.equal(a, undefined, 'first close resolves');
      test.equal(b, undefined, 'second close resolves');
      test.equal(provider._closeMultiplexersCalls, 1,
        '_closeMultiplexers ran exactly once');
      test.equal(provider._drainCalls, 1,
        '_drainPendingWrites ran exactly once');
      test.equal(provider._transportCalls, 1,
        '_closeTransport ran exactly once');
      test.equal(provider._state, 'closed', 'ends in "closed"');

      // A third sequential call is also a no-op.
      await provider.close();
      test.equal(provider._closeMultiplexersCalls, 1,
        'third close is still a no-op');
    }
  );

  // Test 13: an observe attempt arriving during 'closing' rejects with
  // ProviderClosedError (via _getMultiplexer's _assertOpen guard). Uses a
  // FederatedCollection-style cursor over the provider to mirror the path
  // a real subscription would take.
  Tinytest.addAsync(
    'afs - close lifecycle - observes during closing reject with ProviderClosedError',
    async (test) => {
      const provider = new LifecycleProbeProvider();
      let resolveDrain;
      provider._drainGate = new Promise((resolve) => { resolveDrain = resolve; });

      const collectionName = 'teardown-observe-' + Random.id();
      const collection = new AFS.Collection(collectionName, {
        provider,
      });

      const closePromise = provider.close();
      await flushMicrotasks();
      test.equal(provider._state, 'closing',
        'provider is mid-close, in transitional "closing" state');

      let threw = null;
      try {
        const cursor = collection.find({});
        await cursor.observeChangesAsync({
          added() {}, changed() {}, removed() {},
        });
      } catch (e) {
        threw = e;
      }
      test.isTrue(threw instanceof AFS.ProviderClosedError,
        'observeChangesAsync during closing throws ProviderClosedError');
      // Sharper: the failure must come from _getMultiplexer's _assertOpen
      // guard, not from find()'s assertProviderSupports walking the AST.
      // _closeMultiplexers ran exactly once and the cache is empty —
      // no new multiplexer was constructed for the late observe attempt.
      test.equal(provider._closeMultiplexersCalls, 1,
        '_closeMultiplexers ran exactly once');
      test.equal(provider._multiplexerCache.size, 0,
        '_multiplexerCache is empty — late observe never installed an entry');

      resolveDrain();
      await closePromise;

      // Registry cleanup so this collection name doesn't pollute later tests.
      AFS.removeCollection(collectionName);
    }
  );

  // Test 12b: concurrent close() returns the same in-flight promise.
  // Caller B awaiting after caller A has already started close() must
  // observe the same teardown — _state must be 'closed' the moment B's
  // await resolves, and each hook fires exactly once.
  Tinytest.addAsync(
    'afs - close lifecycle - concurrent close() shares the in-flight promise',
    async (test) => {
      const provider = new LifecycleProbeProvider();
      let resolveDrain;
      provider._drainGate = new Promise((resolve) => { resolveDrain = resolve; });

      const callerA = provider.close();
      // Yield once so close() reaches the await on _drainPendingWrites.
      await flushMicrotasks();
      test.equal(provider._state, 'closing',
        'first call put the provider into "closing"');

      // Second caller arrives mid-flight. It must NOT resolve until A finishes.
      const callerB = provider.close();
      test.equal(callerA, callerB,
        'concurrent close() returns the SAME promise');

      // Release the drain so both callers settle.
      resolveDrain();
      await callerB;

      // After awaiting B, A's teardown is fully done.
      test.equal(provider._state, 'closed',
        'caller B observes _state === "closed" after its await resolves');
      test.equal(provider._closeMultiplexersCalls, 1,
        '_closeMultiplexers ran exactly once across concurrent callers');
      test.equal(provider._drainCalls, 1,
        '_drainPendingWrites ran exactly once');
      test.equal(provider._transportCalls, 1,
        '_closeTransport ran exactly once');

      await callerA; // already settled; no-op.
    }
  );

  // Test 14: _drainPendingWrites rejects. _closeTransport MUST still run,
  // close() rejects with the drain error, _state ends in 'closed'.
  Tinytest.addAsync(
    'afs - close lifecycle - drain failure still runs transport, surfaces drain error',
    async (test) => {
      const provider = new LifecycleProbeProvider();
      provider._drainPendingWrites = async function () {
        this._drainCalls++;
        this.stateAtDrain = this._state;
        this.events.push('drainPendingWrites');
        throw new Error('drain');
      };

      let threw = null;
      try {
        await provider.close();
      } catch (e) {
        threw = e;
      }

      test.isTrue(threw instanceof Error, 'close() rejected');
      test.equal(threw && threw.message, 'drain',
        'close() rejected with the drain error');
      test.equal(provider._transportCalls, 1,
        '_closeTransport STILL fired exactly once despite drain failure');
      test.equal(provider._state, 'closed', '_state ends in "closed"');
    }
  );

  // Test 15: _closeTransport rejects. close() rejects with the transport
  // error, _state ends in 'closed'.
  Tinytest.addAsync(
    'afs - close lifecycle - transport failure surfaces transport error',
    async (test) => {
      const provider = new LifecycleProbeProvider();
      provider._closeTransport = async function () {
        this._transportCalls++;
        this.stateAtTransport = this._state;
        this.events.push('closeTransport');
        throw new Error('transport');
      };

      let threw = null;
      try {
        await provider.close();
      } catch (e) {
        threw = e;
      }

      test.isTrue(threw instanceof Error, 'close() rejected');
      test.equal(threw && threw.message, 'transport',
        'close() rejected with the transport error');
      test.equal(provider._state, 'closed', '_state ends in "closed"');
    }
  );

}
