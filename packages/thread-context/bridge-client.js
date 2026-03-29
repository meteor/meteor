/**
 * @module thread-context/bridge-client
 * @summary Worker-thread side of the bridge. Sends requests over the
 * MessagePort and resolves Promises when responses arrive.
 */

import {
  BridgeError,
  BridgeTimeoutError,
  BridgeSerializationError,
  deserializeError,
} from './errors.js';
import { PROTOCOL_VERSION } from './protocol.js';

/** Monotonic counter for request IDs (unique per process, not per client). */
let _seq = 0;

/**
 * Client-side bridge that lives inside a worker thread. Wraps a
 * MessagePort with a Promise-based request/response API.
 */
export class BridgeClient {
  /**
   * @param {import('worker_threads').MessagePort} port - The transferred port from the host.
   * @param {Object} [options]
   * @param {number} [options.callTimeout=60000] - Timeout per bridge call in ms.
   */
  constructor(port, { callTimeout = 60000 } = {}) {
    /** @type {import('worker_threads').MessagePort} */
    this.port = port;
    /** @type {number} */
    this.callTimeout = callTimeout;
    /** @type {Map<string, { resolve: Function, reject: Function, timer: ReturnType<typeof setTimeout> }>} */
    this.pending = new Map();

    this.port.on('message', (msg) => this._onResponse(msg));
    this.port.on('close', () => this._onPortClose());

    // Prevent the port from keeping the worker event loop alive
    this.port.unref();
  }

  /**
   * Sends a bridge message to the host and returns a Promise that
   * resolves with the handler's result or rejects with a deserialized error.
   *
   * The `msg` object is mutated in place (adds `v` and `id` fields)
   * to avoid allocating a wrapper object on every call.
   *
   * @param {{ type: string, [key: string]: any }} msg - The bridge message payload.
   * @returns {Promise<any>}
   * @throws {BridgeTimeoutError} If the call exceeds `callTimeout`.
   * @throws {BridgeSerializationError} If `msg` cannot be structured-cloned.
   */
  call(msg) {
    return new Promise((resolve, reject) => {
      const id = String(++_seq);
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new BridgeTimeoutError(
          `Bridge call timed out after ${this.callTimeout}ms: ${msg.type}.${msg.op || msg.methodName}`
        ));
      }, this.callTimeout);
      if (timer.unref) timer.unref();

      this.pending.set(id, { resolve, reject, timer });

      try {
        msg.v = PROTOCOL_VERSION;
        msg.id = id;
        this.port.postMessage(msg);
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new BridgeSerializationError(
          `Failed to serialize bridge message: ${err.message}`
        ));
      }
    });
  }

  /**
   * Handles an incoming response from the host.
   * @param {{ id: string, result?: any, error?: Object }} msg
   * @private
   */
  _onResponse(msg) {
    const entry = this.pending.get(msg.id);
    if (!entry) return;

    clearTimeout(entry.timer);
    this.pending.delete(msg.id);

    if (msg.error) {
      entry.reject(deserializeError(msg.error));
    } else {
      entry.resolve(msg.result);
    }
  }

  /**
   * Called when the port closes. Rejects all in-flight calls.
   * @private
   */
  _onPortClose() {
    for (const [id, { reject, timer }] of this.pending) {
      clearTimeout(timer);
      reject(new BridgeError('Bridge context destroyed'));
    }
    this.pending.clear();
  }
}
