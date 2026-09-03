/**
 * @module thread-context/proxies/collection-proxy
 * @summary Worker-side ES6 Proxy that transparently bridges collection
 * operations to the host thread. No manifest required — any collection
 * name is proxied on demand.
 */

import { BridgeError } from '../errors.js';
import { MSG_TYPE } from '../protocol.js';

/**
 * @typedef {Object} CursorProxy
 * @property {() => Promise<Array<Object>>} fetchAsync - Fetches all matching documents.
 * @property {() => Promise<number>} countAsync - Returns the count of matching documents.
 * @property {(callback: (doc: Object) => void|Promise<void>) => Promise<void>} forEachAsync -
 *   Fetches all docs and runs `callback` on each sequentially.
 * @property {(callback: (doc: Object) => any|Promise<any>) => Promise<Array<any>>} mapAsync -
 *   Fetches all docs and maps each through `callback` sequentially.
 * @property {() => never} observe - Throws (not supported in workers).
 * @property {() => never} observeChanges - Throws (not supported in workers).
 */

/**
 * Creates a cursor proxy that bridges cursor operations to the host.
 * `forEachAsync` and `mapAsync` fetch all documents via the bridge,
 * then run the callback locally in the worker.
 *
 * @param {import('../bridge-client.js').BridgeClient} client
 * @param {string} collectionName
 * @param {Object} selector
 * @param {Object} options
 * @returns {CursorProxy}
 */
function createCursorProxy(client, collectionName, selector, options) {
  function bridgeCursorOp(op) {
    return client.call({
      type: MSG_TYPE.COLLECTION, collectionName, op: `find.${op}`, args: [selector, options]
    });
  }

  return {
    async fetchAsync() {
      return await bridgeCursorOp('fetchAsync');
    },

    async countAsync() {
      return await bridgeCursorOp('countAsync');
    },

    async forEachAsync(callback) {
      const docs = await bridgeCursorOp('fetchAsync');
      for (const doc of docs) {
        await callback(doc);
      }
    },

    async mapAsync(callback) {
      const docs = await bridgeCursorOp('fetchAsync');
      const results = [];
      for (const doc of docs) {
        results.push(await callback(doc));
      }
      return results;
    },

    observe() {
      throw new BridgeError(
        'observe() is not supported in worker threads (v0.1). Use fetchAsync() for discrete queries.'
      );
    },

    observeChanges() {
      throw new BridgeError(
        'observeChanges() is not supported in worker threads (v0.1). Use fetchAsync() for discrete queries.'
      );
    },
  };
}

/**
 * Creates a two-layer ES6 Proxy that intercepts `Collections.<name>.<op>()`.
 *
 * The outer proxy intercepts collection names and caches inner proxies.
 * The inner proxy intercepts operation names and returns bridge-calling functions:
 * - `find(selector, options)` → returns a {@link CursorProxy}
 * - `aggregate(pipeline, options)` → bridges directly
 * - Any `*Async` method → bridges directly
 *
 * @param {import('../bridge-client.js').BridgeClient} client
 * @returns {Proxy} Universal collection proxy.
 */
export function createCollectionProxy(client) {
  /** @type {Map<string, Proxy>} */
  const cache = new Map();
  return new Proxy({}, {
    get(_, collectionName) {
      if (typeof collectionName !== 'string') return undefined;
      if (cache.has(collectionName)) return cache.get(collectionName);

      const proxy = new Proxy({}, {
        get(_, op) {
          if (op === 'find') {
            return (selector = {}, options = {}) =>
              createCursorProxy(client, collectionName, selector, options);
          }

          if (op === 'aggregate') {
            return (pipeline, options = {}) => client.call({
              type: MSG_TYPE.COLLECTION, collectionName, op: 'aggregate', args: [pipeline, options]
            });
          }

          if (typeof op === 'string' && op.endsWith('Async')) {
            return (...args) => client.call({
              type: MSG_TYPE.COLLECTION, collectionName, op, args
            });
          }

          return undefined;
        }
      });
      cache.set(collectionName, proxy);
      return proxy;
    }
  });
}
