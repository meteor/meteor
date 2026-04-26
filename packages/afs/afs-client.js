import { StreamProvider, ProviderClosedError } from './provider/stream-provider';
import { FederatedCollection } from './collection/collection';
import { Registry } from './registry';
import { buildCommonAFS } from './afs-common';

/**
 * AFS - Adaptive Federated Streams (client entry point)
 *
 * On the client, AFS provides:
 *   - FederatedCollection (identical surface; uses Minimongo + DDP internally)
 *   - Registry delegation (via afs-common)
 *   - No-op stubs for server-only methods so code that runs in both runtimes
 *     does not need `Meteor.isServer` guards around provider / engine calls
 *
 * Client-side collections always use Minimongo for local state and DDP for
 * server synchronization, regardless of the server's backing data source.
 */

// Client-side stubs for server-only classes. The exported identifier exists
// so `import { ChangeStream } from 'meteor/afs'` does not fail at module load,
// but constructing one on the client is a programmer error and throws.
class ChangeStream {
  constructor() { throw new Error('ChangeStream is server-only'); }
}
class ObserveMultiplexer {
  constructor() { throw new Error('ObserveMultiplexer is server-only'); }
}
class AFSCursor {
  constructor() { throw new Error('AFSCursor is server-only'); }
}
class AdaptiveEngine {
  constructor() { throw new Error('AdaptiveEngine is server-only'); }
}
class MockStreamProvider {
  constructor() { throw new Error('MockStreamProvider is server-only'); }
}

const AFS = {
  ...buildCommonAFS(),

  // Server-only class stubs (throw on construction). Exposed so imports
  // resolve and instanceof checks work uniformly.
  ChangeStream,
  ObserveMultiplexer,
  Cursor: AFSCursor,
  MockStreamProvider,

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

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  _resetForTests() {
    Registry._resetForTests();
  },

  /** @deprecated Use _resetForTests. */
  _reset() {
    this._resetForTests();
  },
};

// Publish on the global for legacy lookups.
global.AFS = AFS;

export {
  AFS,
  StreamProvider,
  ProviderClosedError,
  FederatedCollection,
  Registry,
  ChangeStream,
  ObserveMultiplexer,
  AFSCursor,
  AdaptiveEngine,
  MockStreamProvider,
};

export {
  parseSelector,
  parseModifier,
  parseSort,
  parseProjection,
  match,
  applyModifier,
  walkSelector,
  walkModifier,
  AST,
  PRED,
  MOD,
  isAST,
  pathFromDotted,
  pathToDotted,
  isNumericSegment,
  ParseError,
  UnsupportedOperatorError,
} from './query/index';
