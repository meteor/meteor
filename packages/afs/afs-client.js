import { StreamProvider } from './stream-provider';
import { FederatedCollection } from './collection';
import { Registry } from './registry';

// Client-side stubs for server-only classes. The exported identifier exists
// so `import { ChangeStream } from 'meteor/afs'` does not fail at module load,
// but constructing one on the client is a programmer error and throws.
class ChangeStream {
  constructor() {
    throw new Error('ChangeStream is server-only');
  }
}
class ObserveMultiplexer {
  constructor() {
    throw new Error('ObserveMultiplexer is server-only');
  }
}
class AFSCursor {
  constructor() {
    throw new Error('AFSCursor is server-only');
  }
}
class AdaptiveEngine {
  constructor() {
    throw new Error('AdaptiveEngine is server-only');
  }
}
class MockStreamProvider {
  constructor() {
    throw new Error('MockStreamProvider is server-only');
  }
}

/**
 * AFS Client - Adaptive Federated Streams (Client-side)
 *
 * On the client, AFS provides:
 * - FederatedCollection for creating data-source agnostic collections
 * - Registry for looking up collections by name
 *
 * Client-side collections always use Minimongo for local state and DDP
 * for server synchronization, regardless of the server-side data source.
 */
// Declare once, then publish on the global so legacy callers that look up
// `AFS` without an import still find it. (The server file does the same.)
const AFS = {
  // Classes (subset available on client)
  StreamProvider, // Available for type checking / instanceof
  Collection: FederatedCollection,
  ChangeStream,
  ObserveMultiplexer,
  Cursor: AFSCursor,
  MockStreamProvider,
  ObjectID: MongoID.ObjectID,

  // Singleton
  _registry: Registry,

  // ---------------------------------------------------------------------------
  // Collection management
  // ---------------------------------------------------------------------------

  registerCollection(name, collection) {
    Registry.registerCollection(name, collection);
  },

  getCollection(name) {
    return Registry.getCollection(name);
  },

  listCollections() {
    return Registry.listCollections();
  },

  // ---------------------------------------------------------------------------
  // Core collection management
  // ---------------------------------------------------------------------------

  registerCoreCollection(name, collection) {
    Registry.registerCoreCollection(name, collection);
  },

  getCoreCollection(name) {
    return Registry.getCoreCollection(name);
  },

  hasCoreCollection(name) {
    return Registry.hasCoreCollection(name);
  },

  registerCoreResolver(resolver) {
    return Registry.registerCoreResolver(resolver);
  },

  unregisterCoreResolver(resolver) {
    return Registry.unregisterCoreResolver(resolver);
  },

  // ---------------------------------------------------------------------------
  // Server-only method stubs (no-ops on client)
  // ---------------------------------------------------------------------------

  getEngine() { return null; },
  getMetrics() { return {}; },
  resetMetrics() {},
  registerProvider() {},
  getProvider() { return undefined; },
  setDefaultProvider() {},
  getDefaultProvider() { return null; },
  getDefaultProviderName() { return null; },
  listProviders() { return []; },
  removeProvider() {},
  removeCollection(name) { Registry.removeCollection(name); },
  listCoreCollections() { return Registry.listCoreCollections ? Registry.listCoreCollections() : []; },

  // ---------------------------------------------------------------------------
  // EventEmitter delegation (Registry events)
  // ---------------------------------------------------------------------------

  on(event, listener) { return Registry.on(event, listener); },
  once(event, listener) { return Registry.once(event, listener); },
  off(event, listener) { return Registry.off(event, listener); },

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  _resetForTests() {
    Registry._resetForTests();
  },

  // Deprecated alias for _resetForTests.
  _reset() {
    Registry._resetForTests();
  },

  version: '0.1.0',
};

// Publish on the global for legacy lookups.
global.AFS = AFS;

export {
  AFS,
  StreamProvider,
  FederatedCollection,
  Registry,
  ChangeStream,
  ObserveMultiplexer,
  AFSCursor,
  AdaptiveEngine,
  MockStreamProvider,
};
