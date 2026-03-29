/**
 * @module thread-context
 * @summary Main entry point for the thread-context package.
 * Exports all public APIs and the `createThreadContext` factory.
 */

import { EJSON } from 'meteor/ejson';
import { BridgeHost } from './bridge-host.js';

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
export { getActiveBridgeCount, destroyAllBridges } from './shutdown.js';
export { createCollectionProxy } from './proxies/collection-proxy.js';
export { createMethodProxy } from './proxies/method-proxy.js';
export { BridgeClient } from './bridge-client.js';
export { hydrateContext } from './worker.js';
export { createConnectionProxy } from './handlers/connection-proxy.js';
export { createBridgeInvocation } from './handlers/invocation.js';

/**
 * @typedef {Object} ThreadContext
 * @property {import('worker_threads').MessagePort} port - Port to transfer into the worker via `transferList`.
 * @property {Object} settings - Snapshot of `Meteor.settings` (cloned once, shared across contexts).
 * @property {string|null} userId - The forwarded userId.
 * @property {string|null} connectionId - The forwarded DDP connection ID.
 * @property {number} callTimeout - The configured per-call timeout in ms.
 * @property {() => void} destroy - Closes the bridge and cleans up. Call on worker exit.
 */

/** @type {Object|null} Cached settings clone, shared across all contexts. */
let _settingsSnapshot = null;

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
 *   workerData: { port: ctx.port, settings: ctx.settings, userId: ctx.userId },
 *   transferList: [ctx.port],
 * });
 * worker.on('exit', () => ctx.destroy());
 */
/**
 * Resets the cached settings snapshot, forcing the next
 * `createThreadContext()` to re-clone `Meteor.settings`.
 * Useful for testing and hot-reload scenarios.
 */
export function resetSettingsSnapshot() {
  _settingsSnapshot = null;
}

export function createThreadContext(options = {}) {
  const host = new BridgeHost(options);

  if (!_settingsSnapshot) {
    _settingsSnapshot = EJSON.clone(Meteor.settings);
  }

  return {
    port: host.transferPort,
    settings: _settingsSnapshot,
    userId: host.context.userId,
    connectionId: host.context.connectionId,
    callTimeout: host.callTimeout,
    destroy: () => host.destroy(),
  };
}
