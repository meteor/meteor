import { Tinytest } from 'meteor/tinytest';

// ===========================================================================
// AFS Registry, ID generation, and miscellaneous coverage-gap tests.
//
// These tests fill gaps identified in a coverage review:
//   - registry default-rebinding semantics in removeProvider (registry.js:109)
//   - getCoreCollection third-tier fallback to Mongo.getCollection (registry.js:203)
//   - registry event payloads (provider:registered/removed/default-changed,
//     collection:registered, core-collection:registered)
//   - listener cleanup behavior of AFS._reset() (registry.js:234)
//   - _createIdGenerator STRING path (collection.js:478-481)
//   - _createIdGenerator UUID client fallback path (collection.js:469-475)
//   - createIndexAsync / dropIndexAsync failure paths (collection.js:399-417)
//   - StreamProvider default countAsync (stream-provider.js:154-157)
//   - _rewriteSelector edge cases: {}, undefined, { _id: null }
//
// Each test is self-contained and uses Random.id() for collection names so
// there can be no cross-test collisions.
// ===========================================================================

// Shared UUID v4 regex (case-insensitive, explicit version & variant nibbles).
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ===========================================================================
// Registry — default-rebinding in removeProvider (registry.js:105-113)
// ===========================================================================

Tinytest.add(
  'afs - registry - removeProvider rebinds default to remaining provider',
  (test) => {
    AFS._reset();

    const providerA = new AFS.MockStreamProvider();
    const providerB = new AFS.MockStreamProvider();

    AFS.registerProvider('A', providerA);
    AFS.registerProvider('B', providerB);

    // A was registered first, so it is the default.
    test.equal(AFS.getDefaultProviderName(), 'A');
    test.equal(AFS.getDefaultProvider(), providerA);

    AFS.removeProvider('A');

    // A is gone entirely.
    test.equal(AFS.getProvider('A'), undefined);
    test.isFalse(AFS.listProviders().includes('A'));

    // Default should have rebound to B (the remaining provider), not left
    // dangling as a stale reference to A.
    test.equal(AFS.getDefaultProviderName(), 'B');
    test.equal(AFS.getDefaultProvider(), providerB);

    AFS._reset();
  }
);

Tinytest.add(
  'afs - registry - removeProvider picks first remaining provider (insertion order)',
  (test) => {
    AFS._reset();

    const providerA = new AFS.MockStreamProvider();
    const providerB = new AFS.MockStreamProvider();
    const providerC = new AFS.MockStreamProvider();

    AFS.registerProvider('A', providerA);
    AFS.registerProvider('B', providerB);
    AFS.registerProvider('C', providerC);

    test.equal(AFS.getDefaultProviderName(), 'A');

    // registry.js:109 uses this._providers.keys().next().value which, for a
    // JS Map, is insertion order. After removing A, B is first — so B wins.
    AFS.removeProvider('A');

    test.equal(AFS.getDefaultProviderName(), 'B');
    test.equal(AFS.getDefaultProvider(), providerB);

    AFS._reset();
  }
);

Tinytest.add(
  'afs - registry - removing last provider leaves default null',
  (test) => {
    AFS._reset();

    const provider = new AFS.MockStreamProvider();
    AFS.registerProvider('only', provider);

    test.equal(AFS.getDefaultProviderName(), 'only');

    AFS.removeProvider('only');

    test.equal(AFS.getProvider('only'), undefined);
    test.equal(AFS.listProviders().length, 0);
    // getDefaultProvider() returns null when no default name is set.
    test.equal(AFS.getDefaultProvider(), null);
    test.equal(AFS.getDefaultProviderName(), null);

    AFS._reset();
  }
);

Tinytest.add(
  'afs - registry - removing a non-default provider leaves default untouched',
  (test) => {
    AFS._reset();

    const providerA = new AFS.MockStreamProvider();
    const providerB = new AFS.MockStreamProvider();

    AFS.registerProvider('A', providerA);
    AFS.registerProvider('B', providerB);

    test.equal(AFS.getDefaultProviderName(), 'A');

    // Remove the non-default provider; the default must not move.
    AFS.removeProvider('B');

    test.equal(AFS.getDefaultProviderName(), 'A');
    test.equal(AFS.getDefaultProvider(), providerA);

    AFS._reset();
  }
);

// ===========================================================================
// Registry — getCoreCollection third-tier fallback (registry.js:193-208)
// ===========================================================================

Tinytest.add(
  'afs - registry - getCoreCollection falls back to Mongo.getCollection',
  (test) => {
    AFS._reset();

    // The third-tier fallback requires the mongo package. Skip gracefully
    // if it's not loaded for some reason.
    if (typeof Mongo === 'undefined' || typeof Mongo.getCollection !== 'function') {
      return;
    }

    // Create a Mongo.Collection so it registers itself in Mongo._collections.
    // Use a unique name so it doesn't collide with anything else.
    const name = 'afs-core-fallback-' + Random.id();
    // connection: null -> purely in-memory, no DDP / no server state needed.
    const mongoColl = new Mongo.Collection(name, { connection: null });

    // Nothing is registered in AFS for this name; fallback to Mongo.getCollection
    // should resolve it.
    const resolved = AFS.getCoreCollection(name);
    test.isTrue(!!resolved, 'expected a truthy collection from Mongo fallback');
    test.equal(resolved, mongoColl);

    AFS._reset();
  }
);

Tinytest.add(
  'afs - registry - getCoreCollection returns undefined for unknown name',
  (test) => {
    AFS._reset();

    const unknown = 'afs-nonexistent-core-' + Random.id();
    const resolved = AFS.getCoreCollection(unknown);
    // When nothing matches in any tier, the fallback chain returns undefined.
    // Mongo.getCollection itself returns undefined for unknown names, which
    // the fallback returns verbatim.
    test.equal(resolved, undefined);

    AFS._reset();
  }
);

// ===========================================================================
// Registry — event payloads and listener cleanup on _reset
// ===========================================================================

Tinytest.add(
  'afs - registry - provider:registered event payload is (name, provider)',
  (test) => {
    AFS._reset();

    // NOTE: the review referred to this as 'provider-changed' with a
    // { name, provider } object payload. The actual event name is
    // 'provider:registered' (colon-separated) and arguments are positional:
    // (name, provider). See registry.js:52.
    const captured = [];
    AFS.on('provider:registered', (name, provider) => {
      captured.push({ name, provider });
    });

    const provider = new AFS.MockStreamProvider();
    AFS.registerProvider('evt-reg', provider);

    test.equal(captured.length, 1);
    test.equal(captured[0].name, 'evt-reg');
    test.equal(captured[0].provider, provider);

    AFS._reset();
  }
);

Tinytest.add(
  'afs - registry - provider:removed event carries only the name',
  (test) => {
    AFS._reset();

    // NOTE: the review claimed the payload is { name, provider: null }.
    // In fact registry.js:112 emits only (name) — no provider argument.
    const provider = new AFS.MockStreamProvider();
    AFS.registerProvider('evt-rm', provider);

    const captured = [];
    AFS.on('provider:removed', (...args) => { captured.push(args); });

    AFS.removeProvider('evt-rm');

    test.equal(captured.length, 1);
    test.equal(captured[0][0], 'evt-rm');
    // Second arg is undefined — no provider payload.
    test.equal(captured[0][1], undefined);

    AFS._reset();
  }
);

Tinytest.add(
  'afs - registry - provider:default-changed fires only on setDefaultProvider',
  (test) => {
    AFS._reset();

    // NOTE: the review claimed payload includes old and new provider names.
    // Actual emit (registry.js:73) is (name, provider) — only the new one.
    // Also: it fires only from setDefaultProvider. registerProvider sets the
    // very first provider as default silently, without emitting this event.
    // And removeProvider does not emit it either when rebinding the default.
    const providerA = new AFS.MockStreamProvider();
    const providerB = new AFS.MockStreamProvider();

    AFS.registerProvider('A', providerA);
    AFS.registerProvider('B', providerB);

    const events = [];
    AFS.on('provider:default-changed', (name, provider) => {
      events.push({ name, provider });
    });

    AFS.setDefaultProvider('B');

    test.equal(events.length, 1);
    test.equal(events[0].name, 'B');
    test.equal(events[0].provider, providerB);

    // Rebinding the default via removeProvider does NOT emit
    // provider:default-changed under the current implementation.
    AFS.removeProvider('B');
    test.equal(events.length, 1);

    AFS._reset();
  }
);

Tinytest.add(
  'afs - registry - _reset drops listeners so pre-reset callbacks do not fire',
  (test) => {
    AFS._reset();

    // registry.js:239 calls _registryEmitter.removeAllListeners() during reset.
    // A listener registered before _reset() should therefore NOT fire for
    // registrations that occur after _reset().
    let firedForPreReset = 0;
    AFS.on('provider:registered', () => { firedForPreReset += 1; });

    AFS._reset();

    const provider = new AFS.MockStreamProvider();
    AFS.registerProvider('post-reset', provider);

    test.equal(firedForPreReset, 0);

    // A listener registered *after* reset still works normally.
    let firedForPostReset = 0;
    AFS.on('provider:registered', () => { firedForPostReset += 1; });

    AFS.registerProvider('post-reset-2', new AFS.MockStreamProvider());
    test.equal(firedForPostReset, 1);

    AFS._reset();
  }
);

// ===========================================================================
// _createIdGenerator — STRING path (collection.js:478-481)
// ===========================================================================

Tinytest.add(
  'afs - idgen - STRING generator produces distinct IDs between two collections sharing a name',
  (test) => {
    const name = 'afs-idgen-string-' + Random.id();

    const c1 = new AFS.Collection(name, {
      connection: null,
      defineMutationMethods: false,
      idGeneration: 'STRING',
    });
    const c2 = new AFS.Collection(name, {
      connection: null,
      defineMutationMethods: false,
      idGeneration: 'STRING',
    });

    const id1 = c1._makeNewID();
    const id2 = c2._makeNewID();

    test.isTrue(typeof id1 === 'string');
    test.isTrue(typeof id2 === 'string');
    test.isTrue(id1.length > 0);
    test.isTrue(id2.length > 0);

    // Even sharing a name (same DDP.randomStream key), successive calls
    // advance the stream and yield distinct IDs.
    test.notEqual(id1, id2);
  }
);

Tinytest.add(
  'afs - idgen - STRING generator produces unique string IDs over many calls',
  (test) => {
    const name = 'afs-idgen-string-many-' + Random.id();
    const collection = new AFS.Collection(name, {
      connection: null,
      defineMutationMethods: false,
      idGeneration: 'STRING',
    });

    const N = 50;
    const ids = new Set();
    for (let i = 0; i < N; i += 1) {
      const id = collection._makeNewID();
      test.isTrue(typeof id === 'string', 'id must be a string');
      // Random.id() default length is 17 chars; be flexible but sanity-check
      // that it looks like an id string.
      test.isTrue(id.length >= 8 && id.length <= 64);
      ids.add(id);
    }

    test.equal(ids.size, N, 'all generated STRING ids must be unique');
  }
);

// ===========================================================================
// _createIdGenerator — UUID client-fallback path (collection.js:469-475)
// ===========================================================================
//
// On the server, 'UUID' idGeneration delegates to crypto.randomUUID() — that
// path is already covered in afs-tests.js:1550. The hand-rolled UUID v4
// assembly in collection.js:469-475 runs only on the CLIENT, so we register
// the following test under Meteor.isClient.
//
// If this file is ever loaded server-only, the assertions below are simply
// not registered; the only way to exercise the client fallback is to run the
// Tinytest suite in a browser.

if (Meteor.isClient) {
  Tinytest.add(
    'afs - idgen - UUID client fallback produces v4 UUIDs',
    (test) => {
      const name = 'afs-idgen-uuid-client-' + Random.id();
      const collection = new AFS.Collection(name, {
        connection: null,
        defineMutationMethods: false,
        idGeneration: 'UUID',
      });

      const id = collection._makeNewID();
      test.isTrue(typeof id === 'string');
      test.isTrue(
        UUID_V4_RE.test(id),
        'client-side UUID fallback must match v4 shape, got: ' + id
      );

      // Two successive UUIDs must differ.
      const id2 = collection._makeNewID();
      test.notEqual(id, id2);
      test.isTrue(UUID_V4_RE.test(id2));
    }
  );

  Tinytest.add(
    'afs - idgen - UUID client fallback ids are unique over many calls',
    (test) => {
      const name = 'afs-idgen-uuid-many-' + Random.id();
      const collection = new AFS.Collection(name, {
        connection: null,
        defineMutationMethods: false,
        idGeneration: 'UUID',
      });

      const N = 50;
      const ids = new Set();
      for (let i = 0; i < N; i += 1) {
        const id = collection._makeNewID();
        test.isTrue(UUID_V4_RE.test(id));
        ids.add(id);
      }
      test.equal(ids.size, N);
    }
  );
}

// ===========================================================================
// createIndexAsync / dropIndexAsync — error paths (collection.js:399-417)
// ===========================================================================
//
// When a collection has NO provider AND its backing storage does not
// implement createIndexAsync / dropIndexAsync, these calls must throw with
// the documented error messages.
//
// These tests register server-only because creating an AFS.Collection with
// an explicit `connection: null` and no provider routes storage through a
// LocalCollection — whose behavior around index methods is what we assert.

if (Meteor.isServer) {
  Tinytest.addAsync(
    'afs - misc - createIndexAsync throws when neither provider nor storage supports it',
    async (test) => {
      const name = 'afs-no-index-' + Random.id();
      const collection = new AFS.Collection(name, {
        connection: null,
        defineMutationMethods: false,
      });

      // Remove any createIndexAsync that LocalCollection might expose so we
      // deterministically hit the throw path at collection.js:406.
      if (collection._collection && collection._collection.createIndexAsync) {
        delete collection._collection.createIndexAsync;
      }

      let err;
      try {
        await collection.createIndexAsync({ name: 1 });
      } catch (e) {
        err = e;
      }
      test.isTrue(err instanceof Error);
      test.equal(err.message, 'createIndexAsync is not available on this collection');
    }
  );

  Tinytest.addAsync(
    'afs - misc - dropIndexAsync throws when neither provider nor storage supports it',
    async (test) => {
      const name = 'afs-no-drop-index-' + Random.id();
      const collection = new AFS.Collection(name, {
        connection: null,
        defineMutationMethods: false,
      });

      if (collection._collection && collection._collection.dropIndexAsync) {
        delete collection._collection.dropIndexAsync;
      }

      let err;
      try {
        await collection.dropIndexAsync('some_index');
      } catch (e) {
        err = e;
      }
      test.isTrue(err instanceof Error);
      test.equal(err.message, 'dropIndexAsync is not available on this collection');
    }
  );
}

// ===========================================================================
// StreamProvider default countAsync (stream-provider.js:154-157)
// ===========================================================================
//
// A provider that only overrides _fetchResults (not countAsync) must still
// be able to report counts — the base class fetches and returns .length.

Tinytest.addAsync(
  'afs - misc - StreamProvider default countAsync returns length of _fetchResults',
  async (test) => {
    class FetchOnlyProvider extends AFS.StreamProvider {
      constructor() {
        super({ name: 'fetch-only' });
        this._docs = [
          { _id: 'a', kind: 'x' },
          { _id: 'b', kind: 'x' },
          { _id: 'c', kind: 'y' },
        ];
      }
      async _fetchResults(collectionName, selector, options) {
        if (!selector || Object.keys(selector).length === 0) {
          return this._docs.slice();
        }
        // Crude filter — matches only the 'kind' key used in this test.
        return this._docs.filter((d) => {
          for (const k of Object.keys(selector)) {
            if (d[k] !== selector[k]) return false;
          }
          return true;
        });
      }
    }

    const provider = new FetchOnlyProvider();

    const totalCount = await provider.countAsync('anything', {});
    test.equal(totalCount, 3);

    const xCount = await provider.countAsync('anything', { kind: 'x' });
    test.equal(xCount, 2);

    const yCount = await provider.countAsync('anything', { kind: 'y' });
    test.equal(yCount, 1);

    const zCount = await provider.countAsync('anything', { kind: 'z' });
    test.equal(zCount, 0);
  }
);

// ===========================================================================
// _rewriteSelector — edge cases (collection.js:631-646)
// ===========================================================================

Tinytest.add(
  'afs - misc - _rewriteSelector preserves {} (no false _id injected)',
  (test) => {
    const name = 'afs-rewrite-empty-' + Random.id();
    const collection = new AFS.Collection(name, {
      connection: null,
      defineMutationMethods: false,
    });

    // An empty-object selector has no '_id' key and is truthy, so the
    // rewrite returns it unchanged. Critically, NO random _id is injected —
    // that would silently turn "match everything" into "match nothing".
    const rewritten = collection._rewriteSelector({});
    test.equal(rewritten, {});
    test.isFalse('_id' in rewritten);
  }
);

Tinytest.add(
  'afs - misc - _rewriteSelector replaces undefined selector with fallbackId when given',
  (test) => {
    const name = 'afs-rewrite-undef-' + Random.id();
    const collection = new AFS.Collection(name, {
      connection: null,
      defineMutationMethods: false,
    });

    // undefined is falsy -> branch at collection.js:641-643 fires.
    // With a fallbackId, it must be used verbatim.
    const withFallback = collection._rewriteSelector(undefined, { fallbackId: 'my-fb' });
    test.equal(withFallback._id, 'my-fb');

    // Without a fallbackId, _id is a random string.
    const withoutFallback = collection._rewriteSelector(undefined);
    test.isTrue(typeof withoutFallback._id === 'string');
    test.isTrue(withoutFallback._id.length > 0);
  }
);

Tinytest.add(
  'afs - misc - _rewriteSelector replaces { _id: null } with generated _id',
  (test) => {
    const name = 'afs-rewrite-null-id-' + Random.id();
    const collection = new AFS.Collection(name, {
      connection: null,
      defineMutationMethods: false,
    });

    // '_id' in selector is true AND selector._id is falsy -> branch at
    // collection.js:641-643 fires. The null _id is replaced with a fresh
    // Random.id(); it is NOT kept as null (which would otherwise be an
    // accidental "match documents with _id=null" query).
    const rewritten = collection._rewriteSelector({ _id: null });
    test.isTrue(typeof rewritten._id === 'string');
    test.notEqual(rewritten._id, null);
    test.isTrue(rewritten._id.length > 0);

    // fallbackId wins over a generated id in this branch too.
    const rewrittenFb = collection._rewriteSelector(
      { _id: null },
      { fallbackId: 'fb-id' }
    );
    test.equal(rewrittenFb._id, 'fb-id');
  }
);

Tinytest.add(
  'afs - misc - _rewriteSelector replaces { _id: undefined } with generated _id',
  (test) => {
    const name = 'afs-rewrite-undef-id-' + Random.id();
    const collection = new AFS.Collection(name, {
      connection: null,
      defineMutationMethods: false,
    });

    // '_id' in selector is true (the key is present) and the value is
    // falsy, so the same replacement branch fires.
    const rewritten = collection._rewriteSelector({ _id: undefined });
    test.isTrue(typeof rewritten._id === 'string');
    test.isTrue(rewritten._id.length > 0);
  }
);
