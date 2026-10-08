/**
 * @module thread-context/worker
 * @description Worker-thread entry point. Reconstructs the Meteor API surface
 * from a transferred MessagePort.
 */

import { BridgeClient } from './bridge-client.js';
import { createCollectionProxy } from './proxies/collection-proxy.js';
import { createMethodProxy } from './proxies/method-proxy.js';
import { MeteorError } from './errors.js';
import { deepFreeze } from './deep-freeze.js';

// A worker cannot import 'meteor/thread-context', so this entry module also
// exposes the error classes for instanceof checks inside the worker.
export {
  BridgeError,
  BridgeTimeoutError,
  BridgeSerializationError,
  BridgeContextError,
  MeteorError,
} from './errors.js';

/**
 * @typedef {Object} HydrateOptions
 * @property {Object} [settings={}] - Settings snapshot from `createThreadContext().settings`.
 * @property {string|null} [userId=null] - Forwarded user ID.
 * @property {number} [callTimeout=60000] - Per-call timeout in ms.
 */

/**
 * @typedef {Object} HydratedContext
 * @property {Proxy} Collections - Universal collection proxy (see {@link module:thread-context/proxies/collection-proxy}).
 * @property {Object} Meteor - Meteor API stub with `callAsync`, `settings`, `userId`, etc.
 * @property {(name: string, ...args: any[]) => Promise<any>} Meteor.callAsync - Calls a method on the host.
 * @property {Object} Meteor.settings - Frozen settings snapshot.
 * @property {() => string|null} Meteor.userId - Returns the forwarded userId (same call shape as on the host).
 * @property {boolean} Meteor.isServer - Always `true`.
 * @property {boolean} Meteor.isClient - Always `false`.
 * @property {boolean} Meteor.isSimulation - Always `false`.
 * @property {typeof MeteorError} Meteor.Error - Worker-compatible Meteor.Error class.
 */

/**
 * @param {any} value
 * @returns {boolean} Whether `value` looks like a `MessagePort`.
 */
function isMessagePort(value) {
  return Boolean(value)
    && typeof value.postMessage === 'function'
    && typeof value.on === 'function';
}

/**
 * Reconstructs the Meteor API surface from a transferred MessagePort.
 * Call once at the top of a worker script.
 *
 * Accepts either the bare port plus options, or the `workerData` object
 * produced by `createThreadContext().workerData`, which carries the port
 * together with the host-side identity so the two cannot be assembled
 * inconsistently. Explicit `options` override fields from that object.
 *
 * @param {import('worker_threads').MessagePort|import('./thread-context.js').ThreadWorkerData} portOrWorkerData
 * @param {HydrateOptions} [options]
 * @returns {HydratedContext}
 *
 * @example
 * import { workerData } from 'worker_threads';
 * import { hydrateContext } from 'meteor/thread-context';
 *
 * const { Collections, Meteor } = hydrateContext(workerData);
 *
 * const docs = await Collections.MyCol.find({ active: true }).fetchAsync();
 * await Meteor.callAsync('processResults', docs);
 */
export function hydrateContext(portOrWorkerData, options = {}) {
  let port = portOrWorkerData;
  if (!isMessagePort(portOrWorkerData) && portOrWorkerData && isMessagePort(portOrWorkerData.port)) {
    const { port: bundledPort, ...bundledOptions } = portOrWorkerData;
    port = bundledPort;
    options = { ...bundledOptions, ...options };
  }

  const client = new BridgeClient(port, {
    callTimeout: options.callTimeout ?? 60000,
  });

  const Collections = createCollectionProxy(client);
  const methodProxy = createMethodProxy(client);
  const userId = options.userId ?? null;

  const Meteor = {
    callAsync: methodProxy.callAsync,
    settings: deepFreeze(options.settings || {}),
    userId: () => userId,
    isServer: true,
    isSimulation: false,
    isClient: false,
    Error: MeteorError,
  };

  return { Collections, Meteor };
}
