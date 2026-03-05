import { StreamProvider } from './stream-provider';
import { AFSCursor } from './cursor';
import { FederatedCollection } from './collection';
import { AdaptiveEngine } from './adaptive-engine';
import { MockStreamProvider } from './mock-stream-provider';
import { Registry } from './registry';

/**
 * AFS - Adaptive Federated Streams
 *
 * The global entry point for Meteor's data-source agnostic reactivity engine.
 * This namespace is exported globally and provides access to all AFS
 * functionality.
 */
AFS = {
  // Classes
  StreamProvider,
  Cursor: AFSCursor,
  Collection: FederatedCollection,
  MockStreamProvider,

  // Singleton instances
  _engine: new AdaptiveEngine(),
  _registry: Registry,

  // ---------------------------------------------------------------------------
  // Provider management (delegates to Registry)
  // ---------------------------------------------------------------------------

  registerProvider(name, provider) {
    Registry.registerProvider(name, provider);
  },

  getProvider(name) {
    return Registry.getProvider(name);
  },

  setDefaultProvider(name) {
    Registry.setDefaultProvider(name);
  },

  getDefaultProvider() {
    return Registry.getDefaultProvider();
  },

  listProviders() {
    return Registry.listProviders();
  },

  removeProvider(name) {
    Registry.removeProvider(name);
  },

  // ---------------------------------------------------------------------------
  // Collection management (delegates to Registry)
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
  // Core collection management (delegates to Registry)
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

  listCoreCollections() {
    return Registry.listCoreCollections();
  },

  // ---------------------------------------------------------------------------
  // Adaptive engine access
  // ---------------------------------------------------------------------------

  getEngine() {
    return this._engine;
  },

  getMetrics() {
    return this._engine.getMetrics();
  },

  resetMetrics() {
    this._engine.reset();
  },

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  /**
   * Reset all AFS state. For testing only.
   */
  _reset() {
    Registry._reset();
    this._engine.reset();
  },

  /**
   * Get the AFS version info.
   */
  version: '0.1.0',
};

// Export for ES module imports
export { AFS, StreamProvider, AFSCursor, FederatedCollection, AdaptiveEngine, MockStreamProvider, Registry };
