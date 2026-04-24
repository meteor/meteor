import { StreamProvider, ProviderClosedError } from './provider/stream-provider';
import { MockStreamProvider } from './provider/mock-stream-provider';
import { AFSCursor } from './collection/cursor';
import { FederatedCollection } from './collection/collection';
import { ChangeStream } from './reactive/change-stream';
import { ObserveMultiplexer } from './reactive/observe-multiplexer';
import { AdaptiveEngine } from './reactive/adaptive-engine';
import { Registry } from './registry';
import { buildCommonAFS } from './afs-common';

/**
 * AFS - Adaptive Federated Streams (server entry point)
 *
 * Extends the shared surface from afs-common.js with server-only capabilities:
 *   - Reactive internals (ChangeStream, ObserveMultiplexer, AFSCursor)
 *   - Provider registration / lookup (mongo, postgres, etc.)
 *   - AdaptiveEngine singleton for metrics and prefetching
 *
 * `AFS` is declared as a package global in package.js. We assign explicitly
 * through `global.AFS` instead of relying on an undeclared bare-identifier
 * assignment, which strict-mode and linters flag as an accidental global leak.
 */

const _engine = new AdaptiveEngine();

const AFS = {
  ...buildCommonAFS(),

  // Server-side classes not exposed via afs-common
  Cursor: AFSCursor,
  MockStreamProvider,
  ChangeStream,
  ObserveMultiplexer,

  // Singleton
  _engine,

  // ---------------------------------------------------------------------------
  // Provider management (server-only) — delegates to Registry
  // ---------------------------------------------------------------------------

  registerProvider(name, provider) { Registry.registerProvider(name, provider); },
  getProvider(name) { return Registry.getProvider(name); },
  setDefaultProvider(name) { Registry.setDefaultProvider(name); },
  getDefaultProvider() { return Registry.getDefaultProvider(); },
  getDefaultProviderName() { return Registry.getDefaultProviderName(); },
  listProviders() { return Registry.listProviders(); },
  removeProvider(name) { Registry.removeProvider(name); },

  // ---------------------------------------------------------------------------
  // Adaptive engine access
  // ---------------------------------------------------------------------------

  getEngine() { return _engine; },
  getMetrics() { return _engine.getMetrics(); },
  resetMetrics() { _engine.reset(); },

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  /**
   * Reset all AFS state. Test-only.
   * Registry._resetForTests enforces the environment guard.
   */
  _resetForTests() {
    Registry._resetForTests();
    _engine.reset();
  },

  /** @deprecated Use _resetForTests. */
  _reset() {
    this._resetForTests();
  },
};

// Bind to the Meteor package-global slot declared in package.js.
global.AFS = AFS;

export {
  AFS,
  StreamProvider,
  ProviderClosedError,
  AFSCursor,
  FederatedCollection,
  AdaptiveEngine,
  MockStreamProvider,
  Registry,
  ChangeStream,
  ObserveMultiplexer,
};
