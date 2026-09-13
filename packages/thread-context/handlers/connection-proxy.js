/**
 * @module thread-context/handlers/connection-proxy
 * @summary Creates a restricted ES6 Proxy that stands in for the DDP
 * `connection` object inside bridge MethodInvocations, exposing only `.id`.
 */

import { BridgeContextError } from '../errors.js';

/**
 * Creates an ES6 Proxy that exposes only `connection.id` and throws
 * `BridgeContextError` for any other meaningful property access.
 *
 * JS runtime introspection properties (Symbols, `then`, `toJSON`, etc.)
 * return `undefined` to avoid breaking `JSON.stringify`, `util.inspect`,
 * Promise coercion, and similar built-in patterns.
 *
 * @param {string} connectionId - The DDP connection ID to expose.
 * @returns {Proxy} A proxy with only `.id` readable.
 */
export function createConnectionProxy(connectionId) {
  return new Proxy({ id: connectionId }, {
    get(target, prop) {
      if (prop === 'id') return target.id;
      // Allow JS runtime introspection properties to pass through safely
      if (typeof prop === 'symbol') return undefined;
      if (prop === 'then' || prop === 'toJSON' || prop === 'inspect' ||
          prop === 'constructor' || prop === 'valueOf' || prop === 'toString' ||
          prop === 'nodeType') {
        return undefined;
      }
      throw new BridgeContextError(
        `connection.${String(prop)} is not available in worker threads — only connection.id is forwarded`
      );
    }
  });
}
