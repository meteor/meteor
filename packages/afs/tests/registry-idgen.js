import { Tinytest } from 'meteor/tinytest';

// ===========================================================================
// AFS Registry, ID generation, and miscellaneous coverage-gap tests.
//
// These tests fill gaps identified in a coverage review:
//   - registry default-rebinding semantics in removeProvider (registry.js:109)
//   - getCoreCollection third-tier fallback to Mongo.getCollection (registry.js:203)
//   - registry event payloads (provider:registered/removed/default-changed,
//     collection:registered, core-collection:registered)
//   - listener cleanup behavior of AFS._resetForTests() (registry.js:234)
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
// (server-only — uses AFS.MockStreamProvider which throws in client unibuild)
// ===========================================================================

if (Meteor.isServer) {

Tinytest.add(
  'afs - registry - removeProvider rebinds default to remaining provider',
  (test) => {
    AFS._resetForTests();

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

    AFS._resetForTests();
  }
);

Tinytest.add(
  'afs - registry - removeProvider picks first remaining provider (insertion order)',
  (test) => {
    AFS._resetForTests();

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

    AFS._resetForTests();
  }
);

Tinytest.add(
  'afs - registry - removing last provider leaves default null',
  (test) => {
    AFS._resetForTests();

    const provider = new AFS.MockStreamProvider();
    AFS.registerProvider('only', provider);

    test.equal(AFS.getDefaultProviderName(), 'only');

    AFS.removeProvider('only');

    test.equal(AFS.getProvider('only'), undefined);
    test.equal(AFS.listProviders().length, 0);
    // getDefaultProvider() returns null when no default name is set.
    test.equal(AFS.getDefaultProvider(), null);
    test.equal(AFS.getDefaultProviderName(), null);

    AFS._resetForTests();
  }
);

Tinytest.add(
  'afs - registry - removing a non-default provider leaves default untouched',
  (test) => {
    AFS._resetForTests();

    const providerA = new AFS.MockStreamProvider();
    const providerB = new AFS.MockStreamProvider();

    AFS.registerProvider('A', providerA);
    AFS.registerProvider('B', providerB);

    test.equal(AFS.getDefaultProviderName(), 'A');

    // Remove the non-default provider; the default must not move.
    AFS.removeProvider('B');

    test.equal(AFS.getDefaultProviderName(), 'A');
    test.equal(AFS.getDefaultProvider(), providerA);

    AFS._resetForTests();
  }
);

// ===========================================================================
// Registry — getCoreCollection third-tier fallback (registry.js:193-208)
// ===========================================================================

Tinytest.add(
  'afs - registry - getCoreCollection falls back via registered core resolver',
  (test) => {
    AFS._resetForTests();

    // AFS no longer hard-codes Mongo into the registry. A resolver must be
    // registered (in production, the mongo package does this on its own).
    // We register one here and assert the fallback chain walks through it.
    if (typeof Mongo === 'undefined' || typeof Mongo.getCollection !== 'function') {
      return;
    }

    AFS.registerCoreResolver((n) => Mongo.getCollection(n));

    const name = 'afs-core-fallback-' + Random.id();
    const mongoColl = new Mongo.Collection(name, { connection: null });

    const resolved = AFS.getCoreCollection(name);
    test.isTrue(!!resolved, 'expected a truthy collection from resolver fallback');
    test.equal(resolved, mongoColl);

    AFS._resetForTests();
  }
);

Tinytest.add(
  'afs - registry - registerCoreResolver chain: first truthy wins, later resolvers skipped',
  (test) => {
    AFS._resetForTests();

    const calls = [];
    const sentinel = { tag: 'from-second' };
    AFS.registerCoreResolver((n) => { calls.push(['first', n]); return undefined; });
    AFS.registerCoreResolver((n) => { calls.push(['second', n]); return sentinel; });
    AFS.registerCoreResolver((n) => { calls.push(['third', n]); return { tag: 'should-not-win' }; });

    const resolved = AFS.getCoreCollection('anything');
    test.equal(resolved, sentinel);
    test.equal(calls.length, 2, 'third resolver must not be called once second returned truthy');
    test.equal(calls[0][0], 'first');
    test.equal(calls[1][0], 'second');

    AFS._resetForTests();
  }
);

Tinytest.add(
  'afs - registry - registerCoreResolver: throwing resolver does not break chain',
  (test) => {
    AFS._resetForTests();

    const sentinel = { tag: 'ok' };
    AFS.registerCoreResolver(() => { throw new Error('boom'); });
    AFS.registerCoreResolver(() => sentinel);

    const resolved = AFS.getCoreCollection('anything');
    test.equal(resolved, sentinel);

    AFS._resetForTests();
  }
);

Tinytest.add(
  'afs - registry - getCoreCollection returns undefined for unknown name',
  (test) => {
    AFS._resetForTests();

    // With no registered resolvers and no registered collection, the chain
    // exits at the tail and returns undefined.
    const unknown = 'afs-nonexistent-core-' + Random.id();
    const resolved = AFS.getCoreCollection(unknown);
    test.equal(resolved, undefined);

    AFS._resetForTests();
  }
);

// ===========================================================================
// Registry — event payloads and listener cleanup on _resetForTests
// ===========================================================================

Tinytest.add(
  'afs - registry - provider:registered event payload is (name, provider)',
  (test) => {
    AFS._resetForTests();

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

    AFS._resetForTests();
  }
);

Tinytest.add(
  'afs - registry - provider:removed event carries only the name',
  (test) => {
    AFS._resetForTests();

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

    AFS._resetForTests();
  }
);

Tinytest.add(
  'afs - registry - provider:default-changed fires on setDefaultProvider and removeProvider rebind',
  (test) => {
    AFS._resetForTests();

    // Payload is (name, provider) — only the new one. registerProvider sets
    // the very first provider as default silently, without emitting this
    // event. setDefaultProvider and removeProvider (when rebinding the
    // default) both emit it.
    const providerA = new AFS.MockStreamProvider();
    const providerB = new AFS.MockStreamProvider();
    const providerC = new AFS.MockStreamProvider();

    AFS.registerProvider('A', providerA);
    AFS.registerProvider('B', providerB);
    AFS.registerProvider('C', providerC);

    const events = [];
    AFS.on('provider:default-changed', (name, provider) => {
      events.push({ name, provider });
    });

    // Explicit setDefaultProvider emits.
    AFS.setDefaultProvider('B');
    test.equal(events.length, 1);
    test.equal(events[0].name, 'B');
    test.equal(events[0].provider, providerB);

    // Removing the non-default C does not rebind default, must NOT emit.
    AFS.removeProvider('C');
    test.equal(events.length, 1);

    // Removing the current default B rebinds to A — MUST emit with new name.
    AFS.removeProvider('B');
    test.equal(events.length, 2);
    test.equal(events[1].name, 'A');
    test.equal(events[1].provider, providerA);

    // Removing the last provider leaves default null — MUST emit with null.
    AFS.removeProvider('A');
    test.equal(events.length, 3);
    test.equal(events[2].name, null);
    test.equal(events[2].provider, null);

    AFS._resetForTests();
  }
);

Tinytest.add(
  'afs - registry - _resetForTests drops listeners so pre-reset callbacks do not fire',
  (test) => {
    AFS._resetForTests();

    // _resetForTests calls _registryEmitter.removeAllListeners(). A listener
    // registered before the reset should therefore NOT fire for registrations
    // that occur after the reset.
    let firedForPreReset = 0;
    AFS.on('provider:registered', () => { firedForPreReset += 1; });

    AFS._resetForTests();

    const provider = new AFS.MockStreamProvider();
    AFS.registerProvider('post-reset', provider);

    test.equal(firedForPreReset, 0);

    // A listener registered *after* reset still works normally.
    let firedForPostReset = 0;
    AFS.on('provider:registered', () => { firedForPostReset += 1; });

    AFS.registerProvider('post-reset-2', new AFS.MockStreamProvider());
    test.equal(firedForPostReset, 1);

    AFS._resetForTests();
  }
);

Tinytest.add(
  'afs - registry - _resetForTests throws outside a test environment',
  (test) => {
    // Sanity: verify the guard rejects non-test callers. We flip the env flags
    // that the guard reads, call through the raw Registry (not AFS facade),
    // and expect a throw.
    const Registry = AFS._registry;
    const origIsTest = Meteor.isTest;
    const origIsAppTest = Meteor.isAppTest;
    const origIsPackageTest = Meteor.isPackageTest;
    const origNodeEnv = process.env.NODE_ENV;

    try {
      Meteor.isTest = false;
      Meteor.isAppTest = false;
      Meteor.isPackageTest = false;
      process.env.NODE_ENV = 'production';

      test.throws(() => {
        Registry._resetForTests();
      }, /only be called from tests/);
    } finally {
      Meteor.isTest = origIsTest;
      Meteor.isAppTest = origIsAppTest;
      Meteor.isPackageTest = origIsPackageTest;
      process.env.NODE_ENV = origNodeEnv;
    }

    // And the happy path still works.
    AFS._resetForTests();
  }
);

} // end if (Meteor.isServer) — Registry tests

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
      test.equal(
        err.message,
        `createIndexAsync is not available on collection "${name}"`
      );
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
      test.equal(
        err.message,
        `dropIndexAsync is not available on collection "${name}"`
      );
    }
  );
}

// ===========================================================================
// StreamProvider default countAsync (stream-provider.js:154-157)
// ===========================================================================
//
// A provider that only overrides fetchResults (not countAsync) must still
// be able to report counts — the base class fetches and returns .length.

Tinytest.addAsync(
  'afs - misc - StreamProvider default countAsync returns length of fetchResults',
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
      async fetchResults(collectionName, selector, options) {
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
  'afs - misc - _rewriteSelector throws on { _id: null } (no silent rewrite)',
  (test) => {
    const name = 'afs-rewrite-null-id-' + Random.id();
    const collection = new AFS.Collection(name, {
      connection: null,
      defineMutationMethods: false,
    });

    // A present-but-falsy _id used to be silently replaced with a random
    // string, which turned valid queries into "match nothing" and
    // destroyed update/remove targeting. The fixed implementation throws
    // so the caller sees the bug immediately.
    test.throws(() => {
      collection._rewriteSelector({ _id: null });
    }, /Invalid selector on collection "[^"]+": _id is null/);

    // fallbackId does NOT rescue a bogus _id; the throw still happens so
    // silent data loss cannot reappear through that path.
    test.throws(() => {
      collection._rewriteSelector({ _id: null }, { fallbackId: 'fb-id' });
    }, /Invalid selector on collection "[^"]+": _id is null/);
  }
);

Tinytest.add(
  'afs - misc - _rewriteSelector throws on { _id: undefined } (no silent rewrite)',
  (test) => {
    const name = 'afs-rewrite-undef-id-' + Random.id();
    const collection = new AFS.Collection(name, {
      connection: null,
      defineMutationMethods: false,
    });

    // Same reasoning as the { _id: null } case — the key is present and
    // the value is falsy, so throw rather than forge a random id.
    test.throws(() => {
      collection._rewriteSelector({ _id: undefined });
    });
  }
);

Tinytest.add(
  'afs - misc - _rewriteSelector throws on falsy numeric/boolean _id instead of forging',
  (test) => {
    const name = 'afs-rewrite-falsy-id-' + Random.id();
    const collection = new AFS.Collection(name, {
      connection: null,
      defineMutationMethods: false,
    });

    // The old behavior silently rewrote { _id: 0 } and { _id: false } to
    // { _id: Random.id() }, which broke Postgres serial ids and legitimate
    // boolean-keyed lookups. The new contract: surface the bad input
    // instead of making it unmatchable.
    test.throws(() => {
      collection._rewriteSelector({ _id: 0 });
    }, /Invalid selector on collection "[^"]+": _id is 0/);

    test.throws(() => {
      collection._rewriteSelector({ _id: false });
    }, /Invalid selector on collection "[^"]+": _id is false/);

    // Sanity: a truthy _id (including strings, numbers > 0, and objects
    // such as UUID wrappers) passes through unchanged.
    const str = collection._rewriteSelector({ _id: 'abc' });
    test.equal(str._id, 'abc');

    const num = collection._rewriteSelector({ _id: 42 });
    test.equal(num._id, 42);

    const uuidLike = { toString: () => 'uuid' };
    const objId = collection._rewriteSelector({ _id: uuidLike });
    test.equal(objId._id, uuidLike);
  }
);
