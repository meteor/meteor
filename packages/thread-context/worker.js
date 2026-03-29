import { BridgeClient } from './bridge-client.js';
import { createCollectionProxy } from './proxies/collection-proxy.js';
import { createMethodProxy } from './proxies/method-proxy.js';
import { MeteorError } from './errors.js';

export function hydrateContext(port, options = {}) {
  const client = new BridgeClient(port, {
    callTimeout: options.callTimeout ?? 60000,
  });

  const Collections = createCollectionProxy(client);
  const methodProxy = createMethodProxy(client);

  const Meteor = {
    callAsync: methodProxy.callAsync,
    settings: Object.freeze(options.settings || {}),
    userId: options.userId ?? null,
    isServer: true,
    isSimulation: false,
    isClient: false,
    Error: MeteorError,
  };

  return { Collections, Meteor };
}
