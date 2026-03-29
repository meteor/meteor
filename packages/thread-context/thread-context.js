import { EJSON } from 'meteor/ejson';
import { BridgeHost } from './bridge-host.js';

export {
  BridgeError,
  BridgeTimeoutError,
  BridgeAccessError,
  BridgeSerializationError,
  BridgeContextError,
  MeteorError,
  serializeError,
  deserializeError,
} from './errors.js';

export { CollectionHandler } from './handlers/collection-handler.js';
export { MethodHandler } from './handlers/method-handler.js';
export { getActiveBridgeCount, destroyAllBridges } from './shutdown.js';
export { createCollectionProxy } from './proxies/collection-proxy.js';
export { createMethodProxy } from './proxies/method-proxy.js';
export { BridgeClient } from './bridge-client.js';
export { hydrateContext } from './worker.js';

export function createThreadContext(options = {}) {
  const host = new BridgeHost(options);

  return {
    port: host.transferPort,
    settings: EJSON.clone(Meteor.settings),
    userId: options.userId ?? null,
    connectionId: options.connectionId ?? null,
    callTimeout: options.callTimeout ?? 60000,
    destroy: () => host.destroy(),
  };
}
