import { StreamProvider } from './stream-provider';
import { FederatedCollection } from './collection';
import { Registry } from './registry';

// Lightweight client-side stubs for server-only classes.
// Prevents `import { ChangeStream } from 'meteor/afs'` from being undefined.
class ChangeStream {}
class ObserveMultiplexer {}
class AFSCursor {}
class AdaptiveEngine {}
class MockStreamProvider {}

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
AFS = {
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

  _reset() {
    Registry._reset();
  },

  version: '0.1.0',
};

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
