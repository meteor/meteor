import { Tinytest } from 'meteor/tinytest';

// ===========================================================================
// AFS - DDP / publication / replication coverage tests
//
// Closes gaps in:
//   - AFSCursor._publishCursor lifecycle forwarding (cursor.js ~252-289)
//   - FederatedCollection autopublish branch (collection.js ~618-628)
//   - FederatedCollection remote-connection mutation paths
//     (collection.js ~246,271,294 and sync twins ~335,356,373)
//   - FederatedCollection._maybeSetUpReplication store methods
//     (collection.js ~669-876)
// ===========================================================================

if (Meteor.isServer) {

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Build a spy object mirroring the DDP `sub` interface used by
   * AFSCursor._publishCursor. Records every invocation in order.
   */
  function makeMockSub() {
    const events = [];
    const sub = {
      _onStopFns: [],
      added(collection, id, fields) {
        events.push({ type: 'added', collection, id, fields });
      },
      changed(collection, id, fields) {
        events.push({ type: 'changed', collection, id, fields });
      },
      removed(collection, id) {
        events.push({ type: 'removed', collection, id });
      },
      ready() {
        events.push({ type: 'ready' });
      },
      error(err) {
        events.push({ type: 'error', err });
      },
      onStop(fn) {
        sub._onStopFns.push(fn);
      },
      // Drive the onStop fns (to simulate subscription stop)
      async _runStopFns() {
        for (const fn of sub._onStopFns) {
          await fn();
        }
      },
    };
    sub.events = events;
    return sub;
  }

  /**
   * Build a fake DDP connection suitable for FederatedCollection options.connection.
   * - Not === Meteor.server, so _isRemoteCollection() returns true.
   * - Exposes registerStoreClient/registerStoreServer so _maybeSetUpReplication
   *   installs the replication store and we can capture it.
   * - Exposes methods() (no-op) so _defineMutationMethods succeeds.
   * - Exposes apply/applyAsync which record dispatched method calls.
   */
  function makeFakeConnection() {
    const conn = {
      _stores: Object.create(null),
      _capturedStore: null,
      _capturedStoreName: null,
      _registeredMethods: Object.create(null),
      applied: [],
      appliedAsync: [],

      registerStoreClient(name, wrappedStore) {
        conn._capturedStore = wrappedStore;
        conn._capturedStoreName = name;
        conn._stores[name] = wrappedStore;
        return true;
      },
      async registerStoreServer(name, wrappedStore) {
        conn._capturedStore = wrappedStore;
        conn._capturedStoreName = name;
        conn._stores[name] = wrappedStore;
        return true;
      },
      methods(handlers) {
        Object.assign(conn._registeredMethods, handlers);
      },
      apply(name, args, options, callback) {
        conn.applied.push({ name, args, options });
        if (typeof options === 'function') {
          callback = options;
        }
        if (callback) callback(null, undefined);
        return undefined;
      },
      applyAsync(name, args, options) {
        conn.appliedAsync.push({ name, args, options });
        // Simulate server result promise shape:
        // return a promise for server result (Meteor 3 style).
        return Promise.resolve(
          args && args[0] && args[0]._id ? args[0]._id : undefined
        );
      },
      // stubStream-like marker used by allow-deny to decide whether to wait on
      // a real server result. We flag ourselves as a stub so the test harness
      // doesn't try to reach a real server.
      _stream: { _isStub: true },
      // Publish stub used by autopublish path (not all tests exercise this).
      publish(name, handler, options) {
        conn._publishCalls = conn._publishCalls || [];
        conn._publishCalls.push({ name, handler, options });
      },
    };
    return conn;
  }

  // -------------------------------------------------------------------------
  // _publishCursor — full lifecycle
  // -------------------------------------------------------------------------

  Tinytest.addAsync(
    'afs - ddp - _publishCursor initial adds forward to sub.added',
    async (test) => {
      const collName = Random.id();
      const provider = new AFS.MockStreamProvider();
      await provider.insertAsync(collName, { _id: 'a1', name: 'Alice' });
      await provider.insertAsync(collName, { _id: 'a2', name: 'Bob' });

      const cursor = new AFS.Cursor(provider, collName, {});
      const sub = makeMockSub();

      const handle = await cursor._publishCursor(sub);

      const addEvents = sub.events.filter(e => e.type === 'added');
      test.equal(addEvents.length, 2, 'two initial adds');

      // Every event is addressed to the collection name
      for (const e of addEvents) {
        test.equal(e.collection, collName);
      }
      const names = addEvents.map(e => e.fields.name).sort();
      test.equal(names, ['Alice', 'Bob']);

      handle.stop();
      await provider.close();
    }
  );

  Tinytest.addAsync(
    'afs - ddp - _publishCursor live add forwards new doc to sub.added',
    async (test) => {
      const collName = Random.id();
      const provider = new AFS.MockStreamProvider();
      await provider.insertAsync(collName, { _id: 'seed', name: 'Seed' });

      const cursor = new AFS.Cursor(provider, collName, {});
      const sub = makeMockSub();
      const handle = await cursor._publishCursor(sub);

      const before = sub.events.filter(e => e.type === 'added').length;
      await provider.insertAsync(collName, { _id: 'live', name: 'Live' });

      // Poll briefly for the live add (observe events flush in microtasks).
      const deadline = Date.now() + 1000;
      while (
        Date.now() < deadline &&
        sub.events.filter(e => e.type === 'added').length <= before
      ) {
        await new Promise(r => setTimeout(r, 10));
      }

      const addEvents = sub.events.filter(e => e.type === 'added');
      test.equal(addEvents.length, before + 1, 'received one live add');
      const live = addEvents.find(e => e.id === 'live');
      test.isTrue(!!live, 'live add was for the new doc');
      test.equal(live.collection, collName);
      test.equal(live.fields.name, 'Live');

      handle.stop();
      await provider.close();
    }
  );

  Tinytest.addAsync(
    'afs - ddp - _publishCursor live change forwards delta fields only',
    async (test) => {
      const collName = Random.id();
      const provider = new AFS.MockStreamProvider();
      await provider.insertAsync(collName, {
        _id: 'doc1',
        name: 'Original',
        age: 30,
      });

      const cursor = new AFS.Cursor(provider, collName, {});
      const sub = makeMockSub();
      const handle = await cursor._publishCursor(sub);

      const before = sub.events.filter(e => e.type === 'changed').length;
      await provider.updateAsync(
        collName,
        { _id: 'doc1' },
        { $set: { name: 'Updated' } }
      );

      const deadline = Date.now() + 1000;
      while (
        Date.now() < deadline &&
        sub.events.filter(e => e.type === 'changed').length <= before
      ) {
        await new Promise(r => setTimeout(r, 10));
      }

      const changeEvents = sub.events.filter(e => e.type === 'changed');
      test.equal(changeEvents.length, before + 1, 'received one change');
      const ev = changeEvents[changeEvents.length - 1];
      test.equal(ev.collection, collName);
      test.equal(ev.id, 'doc1');
      // Only the changed field is forwarded — 'age' must NOT be present.
      test.equal(ev.fields.name, 'Updated');
      test.isFalse(
        Object.prototype.hasOwnProperty.call(ev.fields, 'age'),
        'unchanged field not included'
      );

      handle.stop();
      await provider.close();
    }
  );

  Tinytest.addAsync(
    'afs - ddp - _publishCursor live remove forwards to sub.removed',
    async (test) => {
      const collName = Random.id();
      const provider = new AFS.MockStreamProvider();
      await provider.insertAsync(collName, { _id: 'kill-me', name: 'X' });

      const cursor = new AFS.Cursor(provider, collName, {});
      const sub = makeMockSub();
      const handle = await cursor._publishCursor(sub);

      await provider.removeAsync(collName, { _id: 'kill-me' });

      const deadline = Date.now() + 1000;
      while (
        Date.now() < deadline &&
        !sub.events.some(e => e.type === 'removed')
      ) {
        await new Promise(r => setTimeout(r, 10));
      }

      const removeEvents = sub.events.filter(e => e.type === 'removed');
      test.equal(removeEvents.length, 1);
      test.equal(removeEvents[0].collection, collName);
      test.equal(removeEvents[0].id, 'kill-me');

      handle.stop();
      await provider.close();
    }
  );

  Tinytest.addAsync(
    'afs - ddp - _publishCursor stream error forwards to sub.error',
    async (test) => {
      const collName = Random.id();
      const provider = new AFS.MockStreamProvider();
      await provider.insertAsync(collName, { _id: 'x', name: 'X' });

      const cursor = new AFS.Cursor(provider, collName, {});
      const sub = makeMockSub();
      const handle = await cursor._publishCursor(sub);

      // Reach through to the underlying multiplexer's stream and force an error.
      const key = EJSON.stringify(
        { ...cursor.getCursorDescription(), ordered: false },
        { canonical: true }
      );
      const mux = provider._multiplexerCache.get(key);
      test.isTrue(!!mux, 'multiplexer cached');
      mux._stream.markError(new Error('boom'));

      // The error is fanned out synchronously via EventEmitter.emit.
      const errEvents = sub.events.filter(e => e.type === 'error');
      test.equal(errEvents.length, 1, 'sub.error called once');
      // _publishCursor wraps the error as Meteor.Error('observe-error', ...)
      test.equal(errEvents[0].err.error, 'observe-error');
      test.equal(errEvents[0].err.reason, 'boom');

      handle.stop();
      await provider.close();
    }
  );

  Tinytest.addAsync(
    'afs - ddp - _publishCursor onStop stops observer and evicts multiplexer',
    async (test) => {
      const collName = Random.id();
      const provider = new AFS.MockStreamProvider();
      await provider.insertAsync(collName, { _id: 'x', name: 'X' });

      const cursor = new AFS.Cursor(provider, collName, {});
      const sub = makeMockSub();
      const handle = await cursor._publishCursor(sub);

      // onStop handler was registered
      test.equal(sub._onStopFns.length, 1, 'sub.onStop(fn) was called once');

      // The publisher registered its own onStop that calls observeHandle.stop
      // on the real handle from observeChangesAsync. We can't intercept that
      // closed-over reference directly — instead verify the cache-eviction
      // side effect (which only happens when the underlying observe handle
      // is stopped and the multiplexer's onEmpty fires).
      const key = EJSON.stringify(
        { ...cursor.getCursorDescription(), ordered: false },
        { canonical: true }
      );
      test.isTrue(provider._multiplexerCache.has(key), 'mux cached');

      await sub._runStopFns();

      // Last handle gone -> onEmpty fires -> multiplexer evicted from cache.
      test.isFalse(
        provider._multiplexerCache.has(key),
        'multiplexer evicted after last handle stops'
      );

      // Avoid stopping again — the sub's onStop already stopped the observer.
      void handle;

      await provider.close();
    }
  );

  Tinytest.addAsync(
    'afs - ddp - _publishCursor does not auto-call sub.ready',
    async (test) => {
      const collName = Random.id();
      const provider = new AFS.MockStreamProvider();
      await provider.insertAsync(collName, { _id: 'x', name: 'X' });
      const cursor = new AFS.Cursor(provider, collName, {});

      const sub = makeMockSub();
      const handle = await cursor._publishCursor(sub);

      test.isFalse(
        sub.events.some(e => e.type === 'ready'),
        'publication handler is responsible for ready — cursor must not call it'
      );

      handle.stop();
      await provider.close();
    }
  );

  // -------------------------------------------------------------------------
  // Autopublish branch
  // -------------------------------------------------------------------------

  Tinytest.addAsync(
    'afs - ddp - autopublish branch behaves correctly for current env',
    async (test) => {
      const hasAutopublish =
        typeof Package !== 'undefined' && !!Package.autopublish;

      const fakeConn = makeFakeConnection();
      const collName = Random.id();
      const provider = new AFS.MockStreamProvider();

      // Build collection with explicit fake connection so autopublish check
      // sees a `connection.publish` method.
      const col = new AFS.Collection(collName, {
        connection: fakeConn,
        provider,
        defineMutationMethods: false,
      });
      await col._settingUpReplicationPromise;

      if (hasAutopublish) {
        test.isTrue(
          Array.isArray(fakeConn._publishCalls) &&
            fakeConn._publishCalls.length === 1,
          'autopublish invoked connection.publish exactly once'
        );
        test.equal(fakeConn._publishCalls[0].name, null);
        test.equal(fakeConn._publishCalls[0].options.is_auto, true);
      } else {
        test.isTrue(
          !fakeConn._publishCalls,
          'autopublish not present: no publish invoked'
        );
        // Document why this branch is skipped
        Meteor._debug(
          'afs-tests-ddp: autopublish package not loaded — ' +
            'the autopublish branch path cannot be exercised in this env.'
        );
      }

      await provider.close();
    }
  );

  // -------------------------------------------------------------------------
  // Remote-connection mutation paths (_isRemoteCollection === true)
  // -------------------------------------------------------------------------

  Tinytest.addAsync(
    'afs - ddp - remote collection: insertAsync dispatches via applyAsync',
    async (test) => {
      const fakeConn = makeFakeConnection();
      const collName = Random.id();
      const provider = new AFS.MockStreamProvider();

      // Keep defineMutationMethods enabled so allow-deny sets self._prefix,
      // which _callMutatorMethodAsync uses to build '/<name>/<method>'.
      // On the server with a non-Meteor.server connection, allow-deny skips
      // registering any actual methods, so our fakeConn stays clean.
      const col = new AFS.Collection(collName, {
        connection: fakeConn,
        provider,
      });
      await col._settingUpReplicationPromise;

      test.isTrue(col._isRemoteCollection(), '_isRemoteCollection() is true');

      await col.insertAsync({ _id: 'rid1', name: 'Hello' });

      test.equal(
        fakeConn.appliedAsync.length,
        1,
        'exactly one applyAsync call'
      );
      const call = fakeConn.appliedAsync[0];
      test.equal(call.name, '/' + collName + '/insertAsync');
      test.equal(call.args[0]._id, 'rid1');
      test.equal(call.args[0].name, 'Hello');

      // Did NOT go straight to the provider
      const localDoc = await provider.findOneAsync(collName, { _id: 'rid1' });
      test.isUndefined(localDoc, 'provider untouched on remote insertAsync');

      await provider.close();
    }
  );

  Tinytest.addAsync(
    'afs - ddp - remote collection: updateAsync dispatches via applyAsync',
    async (test) => {
      const fakeConn = makeFakeConnection();
      const collName = Random.id();
      const provider = new AFS.MockStreamProvider();

      const col = new AFS.Collection(collName, {
        connection: fakeConn,
        provider,
      });
      await col._settingUpReplicationPromise;

      await col.updateAsync(
        { _id: 'rid1' },
        { $set: { name: 'Updated' } }
      );

      test.equal(fakeConn.appliedAsync.length, 1);
      const call = fakeConn.appliedAsync[0];
      test.equal(call.name, '/' + collName + '/updateAsync');
      test.equal(call.args[0]._id, 'rid1');
      test.equal(call.args[1].$set.name, 'Updated');

      await provider.close();
    }
  );

  Tinytest.addAsync(
    'afs - ddp - remote collection: removeAsync dispatches via applyAsync',
    async (test) => {
      const fakeConn = makeFakeConnection();
      const collName = Random.id();
      const provider = new AFS.MockStreamProvider();

      const col = new AFS.Collection(collName, {
        connection: fakeConn,
        provider,
      });
      await col._settingUpReplicationPromise;

      await col.removeAsync({ _id: 'rid1' });

      test.equal(fakeConn.appliedAsync.length, 1);
      const call = fakeConn.appliedAsync[0];
      test.equal(call.name, '/' + collName + '/removeAsync');
      test.equal(call.args[0]._id, 'rid1');

      await provider.close();
    }
  );

  // -------------------------------------------------------------------------
  // Replication store (server wrappedStore)
  // -------------------------------------------------------------------------

  async function buildReplicatedCollection() {
    const fakeConn = makeFakeConnection();
    const collName = Random.id();
    const provider = new AFS.MockStreamProvider();
    const col = new AFS.Collection(collName, {
      connection: fakeConn,
      provider,
      defineMutationMethods: false,
    });
    await col._settingUpReplicationPromise;
    return { col, fakeConn, collName, provider };
  }

  Tinytest.addAsync(
    'afs - ddp - replication: beginUpdate emits batch-started and may reset',
    async (test) => {
      const { col, fakeConn, collName, provider } =
        await buildReplicatedCollection();

      // Seed a document so we can verify reset=true clears it.
      await provider.insertAsync(collName, { _id: 'seed', name: 'S' });

      const started = [];
      col.on('replication:batch-started', (info) => started.push(info));

      const store = fakeConn._capturedStore;
      test.isTrue(!!store, 'store was captured');

      await store.beginUpdate(3, false);
      test.equal(started.length, 1, 'batch-started emitted');
      test.equal(started[0].batchSize, 3);
      test.equal(started[0].reset, false);

      // Seed survived (reset=false)
      const stillThere = await provider.findOneAsync(collName, { _id: 'seed' });
      test.isTrue(!!stillThere, 'seed not cleared when reset=false');

      await store.beginUpdate(1, true);
      test.equal(started.length, 2);
      test.equal(started[1].reset, true);
      const cleared = await provider.findOneAsync(collName, { _id: 'seed' });
      test.isUndefined(cleared, 'seed cleared when reset=true');

      await provider.close();
    }
  );

  Tinytest.addAsync(
    'afs - ddp - replication: update(added) inserts local doc',
    async (test) => {
      const { col, fakeConn, collName, provider } =
        await buildReplicatedCollection();

      const store = fakeConn._capturedStore;
      await store.update({
        msg: 'added',
        id: 'srv-1',
        fields: { name: 'FromServer', age: 42 },
      });

      const found = await col.findOneAsync('srv-1');
      test.isTrue(!!found, 'doc created');
      test.equal(found._id, 'srv-1');
      test.equal(found.name, 'FromServer');
      test.equal(found.age, 42);

      await provider.close();
    }
  );

  Tinytest.addAsync(
    'afs - ddp - replication: update(added) on existing doc throws invariant',
    async (test) => {
      const { col, fakeConn, collName, provider } =
        await buildReplicatedCollection();

      await provider.insertAsync(collName, { _id: 'dup', name: 'Existing' });
      const store = fakeConn._capturedStore;

      let threw = null;
      try {
        await store.update({
          msg: 'added',
          id: 'dup',
          fields: { name: 'Replacement' },
        });
      } catch (e) {
        threw = e;
      }
      test.isTrue(threw, 'added on existing doc throws');
      test.isTrue(
        /not to find a document already present/.test(threw.message),
        'threw the expected invariant message'
      );

      await provider.close();
    }
  );

  Tinytest.addAsync(
    'afs - ddp - replication: update(changed) applies field delta',
    async (test) => {
      const { col, fakeConn, collName, provider } =
        await buildReplicatedCollection();

      await provider.insertAsync(collName, {
        _id: 'c1',
        name: 'Old',
        age: 30,
      });

      const store = fakeConn._capturedStore;
      await store.update({
        msg: 'changed',
        id: 'c1',
        fields: { name: 'New' },
      });

      const doc = await col.findOneAsync('c1');
      test.equal(doc.name, 'New');
      test.equal(doc.age, 30, 'unchanged field preserved');

      // undefined in fields means $unset
      await store.update({
        msg: 'changed',
        id: 'c1',
        fields: { age: undefined },
      });
      const doc2 = await col.findOneAsync('c1');
      test.isUndefined(doc2.age, 'age unset');

      await provider.close();
    }
  );

  Tinytest.addAsync(
    'afs - ddp - replication: update(removed) deletes the doc',
    async (test) => {
      const { col, fakeConn, collName, provider } =
        await buildReplicatedCollection();

      await provider.insertAsync(collName, { _id: 'rm1', name: 'X' });

      const store = fakeConn._capturedStore;
      await store.update({ msg: 'removed', id: 'rm1' });

      const doc = await col.findOneAsync('rm1');
      test.isUndefined(doc);

      await provider.close();
    }
  );

  Tinytest.addAsync(
    'afs - ddp - replication: update(replace) inserts when no prior doc',
    async (test) => {
      const { col, fakeConn, collName, provider } =
        await buildReplicatedCollection();

      const store = fakeConn._capturedStore;
      await store.update({
        msg: 'replace',
        id: 'rp1',
        replace: { _id: 'rp1', name: 'Fresh' },
      });

      const doc = await col.findOneAsync('rp1');
      test.isTrue(!!doc, 'replace inserted');
      test.equal(doc.name, 'Fresh');

      await provider.close();
    }
  );

  Tinytest.addAsync(
    'afs - ddp - replication: update(replace) updates existing doc',
    async (test) => {
      const { col, fakeConn, collName, provider } =
        await buildReplicatedCollection();

      await provider.insertAsync(collName, { _id: 'rp2', name: 'Old' });

      const store = fakeConn._capturedStore;
      await store.update({
        msg: 'replace',
        id: 'rp2',
        replace: { _id: 'rp2', name: 'New' },
      });

      const doc = await col.findOneAsync('rp2');
      test.equal(doc.name, 'New');

      await provider.close();
    }
  );

  Tinytest.addAsync(
    'afs - ddp - replication: update(replace) with null removes existing doc',
    async (test) => {
      const { col, fakeConn, collName, provider } =
        await buildReplicatedCollection();

      await provider.insertAsync(collName, { _id: 'rp3', name: 'Gone' });

      const store = fakeConn._capturedStore;
      await store.update({
        msg: 'replace',
        id: 'rp3',
        replace: null,
      });

      const doc = await col.findOneAsync('rp3');
      test.isUndefined(doc, 'null replace removes the doc');

      await provider.close();
    }
  );

  Tinytest.addAsync(
    'afs - ddp - replication: unknown msg throws',
    async (test) => {
      const { fakeConn, provider } = await buildReplicatedCollection();
      const store = fakeConn._capturedStore;

      let threw = null;
      try {
        await store.update({ msg: 'bogus', id: 'x' });
      } catch (e) {
        threw = e;
      }
      test.isTrue(threw, 'threw for unknown msg type');

      await provider.close();
    }
  );

  Tinytest.addAsync(
    'afs - ddp - replication: endUpdate emits batch-ended and ordering holds',
    async (test) => {
      const { col, fakeConn, collName, provider } =
        await buildReplicatedCollection();

      const timeline = [];
      col.on('replication:batch-started', () =>
        timeline.push('batch-started')
      );
      col.on('replication:update', (info) =>
        timeline.push('update:' + info.msg)
      );
      col.on('replication:batch-ended', () => timeline.push('batch-ended'));

      const store = fakeConn._capturedStore;
      await store.beginUpdate(2, false);
      await store.update({
        msg: 'added',
        id: 'e1',
        fields: { name: 'A' },
      });
      await store.update({
        msg: 'added',
        id: 'e2',
        fields: { name: 'B' },
      });
      await store.endUpdate();

      test.equal(
        timeline,
        ['batch-started', 'update:added', 'update:added', 'batch-ended'],
        'events fired in correct order'
      );

      await provider.close();
    }
  );

  // -------------------------------------------------------------------------
  // Real DDP end-to-end (best effort)
  // -------------------------------------------------------------------------
  //
  // We attempt a loopback DDP round-trip via DDP.connect(Meteor.absoluteUrl()).
  // This is best-effort: if Meteor.absoluteUrl() is not available in the test
  // environment (e.g., ROOT_URL not set), the test degrades to a no-op with a
  // logged note. The store-level tests above provide the authoritative
  // coverage for the replication protocol.

  Tinytest.addAsync(
    'afs - ddp - real DDP e2e (best effort) — absoluteUrl availability',
    async (test) => {
      let absUrl = null;
      try {
        absUrl = Meteor.absoluteUrl();
      } catch (e) {
        absUrl = null;
      }

      if (!absUrl) {
        Meteor._debug(
          'afs-tests-ddp: Meteor.absoluteUrl() unavailable — ' +
            'falling back to store-level replication tests (documented).'
        );
        test.isTrue(
          true,
          'e2e skipped (no absoluteUrl); store-level tests cover the protocol'
        );
        return;
      }

      // When a URL IS available we simply verify DDP.connect returns an
      // object with subscribe() — a full loopback subscription requires a
      // server-side publish handler that cannot be registered from within a
      // single test file without touching package.js, so we stop here.
      let conn = null;
      try {
        conn = DDP.connect(absUrl);
        test.isTrue(
          !!conn && typeof conn.subscribe === 'function',
          'DDP.connect yielded a connection with subscribe()'
        );
      } finally {
        if (conn && typeof conn.disconnect === 'function') {
          conn.disconnect();
        }
      }
    }
  );
}
