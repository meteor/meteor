/**
 * @module thread-context
 * @summary Main entry point for the thread-context package.
 * Exports all public APIs and the `createThreadContext` factory.
 */

import { pathToFileURL } from 'url';
import { EJSON } from 'meteor/ejson';
import { BridgeHost } from './bridge-host.js';
import { deepFreeze } from './deep-freeze.js';

export { BridgeHost };

export {
  BridgeError,
  BridgeTimeoutError,
  BridgeSerializationError,
  BridgeContextError,
  MeteorError,
  serializeError,
  deserializeError,
} from './errors.js';

export { CollectionHandler } from './handlers/collection-handler.js';
export { MethodHandler } from './handlers/method-handler.js';
export { getActiveBridgeCount, destroyAllBridges, installShutdownHandlers } from './shutdown.js';
export { createCollectionProxy } from './proxies/collection-proxy.js';
export { createMethodProxy } from './proxies/method-proxy.js';
export { BridgeClient } from './bridge-client.js';
export { hydrateContext } from './worker.js';
export { createConnectionProxy } from './handlers/connection-proxy.js';
export { createBridgeInvocation } from './handlers/invocation.js';

/**
 * @typedef {Object} ThreadWorkerData
 * @property {import('worker_threads').MessagePort} port - Port to transfer into the worker via `transferList`.
 * @property {Object} settings - Frozen snapshot of `Meteor.settings` (cloned once, shared across contexts).
 * @property {string|null} userId - The forwarded userId.
 * @property {string|null} connectionId - The forwarded DDP connection ID.
 * @property {number} callTimeout - The configured per-call timeout in ms.
 * @property {string} bridgeModuleUrl - `file://` URL of the worker-side entry
 *   module shipped with the package. A worker has no Meteor module system, so
 *   it loads the API with `await import(workerData.bridgeModuleUrl)`.
 */

/**
 * @typedef {ThreadWorkerData & {
 *   workerData: ThreadWorkerData,
 *   destroy: () => void,
 * }} ThreadContext
 * `workerData` is the structured-clone-safe bundle to pass as the Worker's
 * `workerData` (list `port` in `transferList`); `hydrateContext` accepts it
 * as-is, so the worker sees exactly the identity the host enforces.
 * `destroy` closes the bridge and cleans up; the host also destroys itself
 * when the worker's port closes, so calling it on worker exit is optional.
 */

/** @type {Object|null} Cached settings clone, shared across all contexts. */
let _settingsSnapshot = null;

/**
 * Resets the cached settings snapshot, forcing the next
 * `createThreadContext()` to re-clone `Meteor.settings`.
 * Useful for testing and hot-reload scenarios.
 */
export function resetSettingsSnapshot() {
  _settingsSnapshot = null;
}

/**
 * Creates a bridge host on the main thread and returns a context object
 * ready to be transferred into a worker thread.
 *
 * @param {import('./bridge-host.js').BridgeHostOptions} [options]
 * @returns {ThreadContext}
 *
 * @example
 * import { createThreadContext } from 'meteor/thread-context';
 * import { Worker } from 'worker_threads';
 *
 * const ctx = createThreadContext({ userId: this.userId });
 * const worker = new Worker('./job.js', {
 *   workerData: ctx.workerData,
 *   transferList: [ctx.port],
 * });
 */
export function createThreadContext(options = {}) {
  const host = new BridgeHost(options);

  if (!_settingsSnapshot) {
    // Frozen so a caller mutating one context's settings cannot leak the
    // change into every later context (the snapshot is shared by reference).
    _settingsSnapshot = deepFreeze(EJSON.clone(Meteor.settings));
  }

  const workerData = {
    port: host.transferPort,
    settings: _settingsSnapshot,
    userId: host.context.userId,
    connectionId: host.context.connectionId,
    callTimeout: host.callTimeout,
    // Assets here is this package's asset store (see api.addAssets in package.js).
    bridgeModuleUrl: pathToFileURL(Assets.absoluteFilePath('worker.js')).href,
  };

  return {
    ...workerData,
    workerData,
    destroy: () => host.destroy(),
  };
}
