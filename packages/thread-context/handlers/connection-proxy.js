import { BridgeContextError } from '../errors.js';

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
