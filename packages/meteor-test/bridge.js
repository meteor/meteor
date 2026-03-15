// Tinytest → node:test bridge
//
// Reads tests registered via Tinytest.add() / Tinytest.addAsync() and
// re-registers them as node:test cases. This allows existing Meteor
// package tests to run under the meteor-test driver without any code
// changes.
//
// The bridge groups tests by their Tinytest group path (the part before
// the last " - " in the test name) into describe() blocks.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// --- Tinytest assertion compatibility layer ---
//
// Tinytest passes a `test` object with methods like test.equal(),
// test.isTrue(), etc. This creates a compatible object that delegates
// to node:assert, so existing tests work unmodified.

function createTestProxy() {
  const proxy = {
    // No-op sleep for compat (returns a promise)
    sleep(ms = 0) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },

    ok() { /* success — no-op in assert style */ },

    fail(doc) {
      const msg = typeof doc === 'string'
        ? doc
        : (doc && doc.message) || JSON.stringify(doc);
      assert.fail(msg);
    },

    exception(err) {
      throw err;
    },

    equal(actual, expected, message) {
      // Tinytest uses EJSON.equals for deep comparison which ignores
      // prototype differences. Use EJSON.equals when available, fall
      // back to assert.deepStrictEqual for primitives/plain objects.
      const EJSON = Package.ejson && Package.ejson.EJSON;
      if (typeof actual === 'string' && typeof expected === 'string') {
        assert.strictEqual(actual, expected, message);
      } else if (EJSON) {
        assert.ok(
          EJSON.equals(actual, expected),
          message || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
        );
      } else {
        assert.deepStrictEqual(actual, expected, message);
      }
    },

    notEqual(actual, expected, message) {
      const EJSON = Package.ejson && Package.ejson.EJSON;
      if (typeof actual === 'string' && typeof expected === 'string') {
        assert.notStrictEqual(actual, expected, message);
      } else if (EJSON) {
        assert.ok(
          !EJSON.equals(actual, expected),
          message || `expected values to differ`,
        );
      } else {
        assert.notDeepStrictEqual(actual, expected, message);
      }
    },

    isTrue(v, msg) {
      assert.ok(v, msg || 'expected truthy value');
    },

    isFalse(v, msg) {
      assert.ok(!v, msg || 'expected falsy value');
    },

    isNull(v, msg) {
      assert.strictEqual(v, null, msg || 'expected null');
    },

    isNotNull(v, msg) {
      assert.notStrictEqual(v, null, msg || 'expected non-null');
    },

    isUndefined(v, msg) {
      assert.strictEqual(v, undefined, msg || 'expected undefined');
    },

    isNotUndefined(v, msg) {
      assert.notStrictEqual(v, undefined, msg || 'expected defined value');
    },

    isNaN(v, msg) {
      assert.ok(Number.isNaN(v), msg || `expected NaN, got ${v}`);
    },

    isNotNaN(v, msg) {
      assert.ok(!Number.isNaN(v), msg || 'expected non-NaN');
    },

    instanceOf(obj, klass, msg) {
      assert.ok(obj instanceof klass, msg || 'expected instanceof to be true');
    },

    notInstanceOf(obj, klass, msg) {
      assert.ok(!(obj instanceof klass), msg || 'expected instanceof to be false');
    },

    matches(actual, regexp, msg) {
      assert.match(actual, regexp, msg);
    },

    notMatches(actual, regexp, msg) {
      assert.doesNotMatch(actual, regexp, msg);
    },

    include(s, v, message) {
      if (Array.isArray(s)) {
        const found = s.some(item => {
          try { assert.deepStrictEqual(item, v); return true; }
          catch { return false; }
        });
        assert.ok(found, message || `expected array to include ${JSON.stringify(v)}`);
      } else if (s && typeof s === 'object') {
        assert.ok(v in s, message || `expected object to have key "${v}"`);
      } else if (typeof s === 'string') {
        assert.ok(s.includes(v), message || `expected "${s}" to include "${v}"`);
      } else {
        assert.fail(message || 'include: first argument must be array, object, or string');
      }
    },

    notInclude(s, v, message) {
      if (Array.isArray(s)) {
        const found = s.some(item => {
          try { assert.deepStrictEqual(item, v); return true; }
          catch { return false; }
        });
        assert.ok(!found, message || `expected array not to include ${JSON.stringify(v)}`);
      } else if (s && typeof s === 'object') {
        assert.ok(!(v in s), message || `expected object not to have key "${v}"`);
      } else if (typeof s === 'string') {
        assert.ok(!s.includes(v), message || `expected "${s}" not to include "${v}"`);
      }
    },

    length(obj, expected, msg) {
      assert.strictEqual(obj.length, expected,
        msg || `expected length ${expected}, got ${obj.length}`);
    },

    throws(f, expected, message) {
      if (expected === undefined) {
        assert.throws(f, message);
      } else if (typeof expected === 'string') {
        assert.throws(f, { message: new RegExp(escapeRegExp(expected)) }, message);
      } else if (expected instanceof RegExp) {
        assert.throws(f, { message: expected }, message);
      } else if (typeof expected === 'function') {
        try {
          f();
          assert.fail(message || 'expected function to throw');
        } catch (e) {
          assert.ok(expected(e), message || `predicate rejected error: ${e.message}`);
        }
      }
    },

    async throwsAsync(f, expected, message) {
      if (expected === undefined) {
        await assert.rejects(f, message);
      } else if (typeof expected === 'string') {
        await assert.rejects(f, { message: new RegExp(escapeRegExp(expected)) }, message);
      } else if (expected instanceof RegExp) {
        await assert.rejects(f, { message: expected }, message);
      } else if (typeof expected === 'function') {
        try {
          await f();
          assert.fail(message || 'expected async function to throw');
        } catch (e) {
          assert.ok(expected(e), message || `predicate rejected error: ${e.message}`);
        }
      }
    },

    // Tinytest-specific: no-op in bridge (expect_fail marks next failure as expected)
    expect_fail() {},

    // Extra details attached to failures — no-op in bridge
    extraDetails: {},

    runId() { return 'bridge-' + Math.random().toString(36).slice(2); },
  };

  return proxy;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- Bridge logic ---
//
// Called at startup to convert registered Tinytest cases into node:test.

// Clear all Mongo collections before running tests.
// This replicates what tinytest_server.js does in the 'tinytest/run' method.
async function clearCollections() {
  try {
    const MongoInternals = Package.mongo && Package.mongo.MongoInternals;
    if (!MongoInternals) return;
    const collections = await MongoInternals.defaultRemoteCollectionDriver()
      .mongo.db.collections();
    for (const collection of collections) {
      await collection.deleteMany({});
    }
  } catch (e) {
    // Ignore errors (e.g. no Mongo connection in some test configs)
  }
}

export function bridgeTinytestToNodeTest() {
  const Tinytest = Package.tinytest && Package.tinytest.Tinytest;
  if (!Tinytest) return 0;

  // Access internals
  const manager = Tinytest._TestManager;
  if (!manager || !manager.ordered_tests || manager.ordered_tests.length === 0) {
    return 0;
  }

  const tests = manager.ordered_tests;

  // Group tests by their group path (everything before the last " - ")
  const groups = new Map();
  for (const tc of tests) {
    // tc.name format: "group - subgroup - test name"
    // tc.groupPath = ["tinytest", "group", "subgroup"], tc.shortName = "test name"
    const groupKey = tc.groupPath.slice(1).join(' - ') || 'tests';
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(tc);
  }

  let count = 0;
  let dbCleared = false;

  for (const [groupName, testCases] of groups) {
    describe(`[tinytest] ${groupName}`, () => {
      for (const tc of testCases) {
        it(tc.shortName, async () => {
          // Clear DB once before the first test (like Tinytest does)
          if (!dbCleared) {
            await clearCollections();
            dbCleared = true;
          }

          const proxy = createTestProxy();
          // Tinytest tests are func(test, onComplete) for async,
          // or func(test) for sync (wrapped as async internally).
          // We promisify the callback pattern.
          await new Promise((resolve, reject) => {
            try {
              const result = tc.func(proxy, resolve);
              // If the test function returns a promise, wait for it
              if (result && typeof result.then === 'function') {
                result.then(resolve, reject);
              }
              // Sync tests (wrapped by Tinytest.add) call onComplete immediately
            } catch (err) {
              reject(err);
            }
          });
        });
        count++;
      }
    });
  }

  return count;
}
