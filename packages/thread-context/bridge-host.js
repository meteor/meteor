/**
 * @module thread-context/bridge-host
 * @summary Main-thread side of the bridge. Creates a MessageChannel,
 * registers handlers, and dispatches incoming worker requests.
 */

import { MessageChannel } from 'worker_threads';
import { BridgeError, BridgeSerializationError, serializeError } from './errors.js';
import { CollectionHandler } from './handlers/collection-handler.js';
import { MethodHandler } from './handlers/method-handler.js';
import { registerBridge, unregisterBridge } from './shutdown.js';
import { PROTOCOL_VERSION, MSG_TYPE } from './protocol.js';

/**
 * @typedef {Object} BridgeMessage
 * @property {number} v - Protocol version.
 * @property {string} id - Request identifier.
 * @property {string} type - Message type (see {@link MSG_TYPE}).
 * @property {string} [collectionName] - Target collection (collection messages).
 * @property {string} [op] - Collection operation name (collection messages).
 * @property {any[]}  [args] - Operation arguments (collection messages).
 * @property {string} [methodName] - Method name (method messages).
 * @property {any[]}  [methodArgs] - Method arguments (method messages).
 */

/**
 * @typedef {Object} BridgeHostOptions
 * @property {string|null} [userId=null] - User ID forwarded into proxied calls.
 * @property {string|null} [connectionId=null] - DDP connection ID (only `.id` exposed in worker).
 * @property {number} [callTimeout=60000] - Per-call timeout in ms.
 * @property {(msg: BridgeMessage) => any|Promise<any>} [onMessage] -
 *   Hook called before dispatch. Return a value to short-circuit the handler.
 * @property {(msg: BridgeMessage, result: any) => any|Promise<any>} [onResult] -
 *   Hook called after the handler. Return a value to replace the result.
 */

/**
 * Host-side bridge that lives on the main thread. Creates a MessageChannel,
 * listens for requests from the worker, and dispatches them to registered handlers.
 */
export class BridgeHost {
  /**
   * @param {BridgeHostOptions} [options]
   */
  constructor({ userId, connectionId, callTimeout = 60000, onMessage, onResult } = {}) {
    /** @type {MessageChannel} */
    this.channel = new MessageChannel();
    /** @type {import('worker_threads').MessagePort} - Host-side port (listens here). */
    this.port = this.channel.port1;
    /** @type {import('worker_threads').MessagePort} - Port to transfer into the worker. */
    this.transferPort = this.channel.port2;
    /** @type {number} */
    this.callTimeout = callTimeout;
    /** @type {((msg: BridgeMessage) => any|Promise<any>)|null} */
    this.onMessage = onMessage || null;
    /** @type {((msg: BridgeMessage, result: any) => any|Promise<any>)|null} */
    this.onResult = onResult || null;
    /** @type {Map<string, {handle: (msg: BridgeMessage) => Promise<any>}>} */
    this.handlers = new Map();
    /** @type {{ userId: string|null, connectionId: string|null }} */
    this.context = { userId: userId ?? null, connectionId: connectionId ?? null };
    /** @type {boolean} */
    this.destroyed = false;

    this.registerHandler(MSG_TYPE.COLLECTION, new CollectionHandler(this.context));
    this.registerHandler(MSG_TYPE.METHOD, new MethodHandler(this.context));

    this.port.on('message', Meteor.bindEnvironment((msg) => this._dispatch(msg)));

    registerBridge(this);
  }

  /**
   * Registers a handler for a given message type.
   * @param {string} type - Message type key (e.g. `MSG_TYPE.COLLECTION`).
   * @param {{ handle: (msg: BridgeMessage) => Promise<any> }} handler
   */
  registerHandler(type, handler) {
    this.handlers.set(type, handler);
  }

  /**
   * Routes an incoming message to the appropriate handler, applying
   * onMessage/onResult hooks when configured.
   * @param {BridgeMessage} msg
   * @private
   */
  async _dispatch(msg) {
    if (this.destroyed) return;

    try {
      if (this.onMessage) {
        const override = await this.onMessage(msg);
        if (override !== undefined) {
          this._postResult(msg.id, override);
          return;
        }
      }

      const handler = this.handlers.get(msg.type);
      if (!handler) throw new BridgeError(`Unknown message type: ${msg.type}`);

      const result = await handler.handle(msg);

      const finalResult = this.onResult
        ? (await this.onResult(msg, result)) ?? result
        : result;

      this._postResult(msg.id, finalResult);
    } catch (err) {
      this._postError(msg.id, err);
    }
  }

  /**
   * Posts a success response back to the worker.
   * @param {string} id - Request identifier.
   * @param {any} result - Structured-clone-safe result value.
   * @private
   */
  _postResult(id, result) {
    try {
      this.port.postMessage({ v: PROTOCOL_VERSION, id, result });
    } catch (err) {
      this._postError(id, new BridgeSerializationError(
        `Failed to serialize bridge result: ${err.message}`
      ));
    }
  }

  /**
   * Posts an error response back to the worker. Uses a three-layer
   * fallback: serialize error → minimal fallback → swallow if port closed.
   * @param {string} id - Request identifier.
   * @param {Error} err
   * @private
   */
  _postError(id, err) {
    try {
      this.port.postMessage({ v: PROTOCOL_VERSION, id, error: serializeError(err) });
    } catch {
      try {
        this.port.postMessage({ v: PROTOCOL_VERSION, id, error: {
          type: BridgeSerializationError.name,
          message: 'Bridge error could not be serialized',
          stack: '',
        }});
      } catch { /* port closed — client timeout will fire */ }
    }
  }

  /**
   * Closes the host port and unregisters from the shutdown registry.
   * Idempotent — safe to call multiple times.
   */
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.port.close();
    unregisterBridge(this);
  }
}
