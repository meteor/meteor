/**
 * @module thread-context/worker
 * @summary Worker-thread entry point. Reconstructs the Meteor API surface
 * from a transferred MessagePort.
 */

import { BridgeClient } from './bridge-client.js';
import { createCollectionProxy } from './proxies/collection-proxy.js';
import { createMethodProxy } from './proxies/method-proxy.js';
import { MeteorError } from './errors.js';

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
 * @property {string|null} Meteor.userId - The forwarded userId.
 * @property {boolean} Meteor.isServer - Always `true`.
 * @property {boolean} Meteor.isClient - Always `false`.
 * @property {boolean} Meteor.isSimulation - Always `false`.
 * @property {typeof MeteorError} Meteor.Error - Worker-compatible Meteor.Error class.
 */

/**
 * Reconstructs the Meteor API surface from a transferred MessagePort.
 * Call once at the top of a worker script.
 *
 * @param {import('worker_threads').MessagePort} port - The transferred port from `createThreadContext().port`.
 * @param {HydrateOptions} [options]
 * @returns {HydratedContext}
 *
 * @example
 * import { workerData } from 'worker_threads';
 * import { hydrateContext } from 'meteor/thread-context';
 *
 * const { Collections, Meteor } = hydrateContext(workerData.port, {
 *   settings: workerData.settings,
 *   userId: workerData.userId,
 * });
 *
 * const docs = await Collections.MyCol.find({ active: true }).fetchAsync();
 * await Meteor.callAsync('processResults', docs);
 */
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
