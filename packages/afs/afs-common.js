/**
 * Shared AFS namespace surface. Both afs-server.js and afs-client.js build
 * their AFS object by spreading `buildCommonAFS()` and layering
 * environment-specific pieces (server adds provider management, engine, and
 * reactive internals; client adds server-only stubs).
 *
 * Anything that is pure Registry delegation — or a class / value that is
 * safe to expose in both runtimes — belongs here so a future change to, say,
 * `listCollections()` only needs to be made once.
 */

import { StreamProvider, ProviderClosedError, NotImplementedError } from './provider/stream-provider';
import { FederatedCollection } from './collection/collection';
import { Registry } from './registry';
import * as Query from './query/index';

export const AFS_VERSION = '0.1.0';

export function buildCommonAFS() {
  return {
    // Classes always safe to expose
    StreamProvider,
    ProviderClosedError,
    NotImplementedError,
    Collection: FederatedCollection,
    ObjectID: MongoID.ObjectID,

    // Query AST + helpers (parseSelector, parseModifier, match, applyModifier,
    // walkSelector, walkModifier, AST/PRED/MOD constants, etc.) — see query/index.js
    Query,

    // Singleton
    _registry: Registry,

    // Collection management — pure Registry delegation
    registerCollection(name, collection) { Registry.registerCollection(name, collection); },
    getCollection(name) { return Registry.getCollection(name); },
    listCollections() { return Registry.listCollections(); },
    removeCollection(name) { Registry.removeCollection(name); },

    // Core collection management — pure Registry delegation
    registerCoreCollection(name, collection) { Registry.registerCoreCollection(name, collection); },
    getCoreCollection(name) { return Registry.getCoreCollection(name); },
    hasCoreCollection(name) { return Registry.hasCoreCollection(name); },
    listCoreCollections() { return Registry.listCoreCollections(); },
    registerCoreResolver(resolver) { return Registry.registerCoreResolver(resolver); },
    unregisterCoreResolver(resolver) { return Registry.unregisterCoreResolver(resolver); },

    // Registry event delegation
    on(event, listener) { return Registry.on(event, listener); },
    once(event, listener) { return Registry.once(event, listener); },
    off(event, listener) { return Registry.off(event, listener); },

    version: AFS_VERSION,
  };
}
