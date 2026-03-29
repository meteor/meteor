import { BridgeError } from '../errors.js';
import { MSG_TYPE } from '../protocol.js';

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
      const docs = await bridgeCursorOp('forEachAsync');
      for (const doc of docs) {
        await callback(doc);
      }
    },

    async mapAsync(callback) {
      const docs = await bridgeCursorOp('mapAsync');
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

export function createCollectionProxy(client) {
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
            return (pipeline, options) => client.call({
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
