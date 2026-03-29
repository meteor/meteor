import { randomUUID } from 'crypto';
import {
  BridgeError,
  BridgeTimeoutError,
  BridgeSerializationError,
  deserializeError,
} from './errors.js';
import { PROTOCOL_VERSION } from './protocol.js';

export class BridgeClient {
  constructor(port, { callTimeout = 60000 } = {}) {
    this.port = port;
    this.callTimeout = callTimeout;
    this.pending = new Map();

    this.port.on('message', (msg) => this._onResponse(msg));
    this.port.on('close', () => this._onPortClose());

    this.port.unref();
  }

  call(msg) {
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new BridgeTimeoutError(
          `Bridge call timed out after ${this.callTimeout}ms: ${msg.type}.${msg.op || msg.methodName}`
        ));
      }, this.callTimeout);
      if (timer.unref) timer.unref();

      this.pending.set(id, { resolve, reject, timer });

      try {
        this.port.postMessage({ v: PROTOCOL_VERSION, id, ...msg });
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new BridgeSerializationError(
          `Failed to serialize bridge message: ${err.message}`
        ));
      }
    });
  }

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

  _onPortClose() {
    for (const [id, { reject, timer }] of this.pending) {
      clearTimeout(timer);
      reject(new BridgeError('Bridge context destroyed'));
    }
    this.pending.clear();
  }
}
