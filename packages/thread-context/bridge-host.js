import { MessageChannel } from 'worker_threads';
import { BridgeError, BridgeSerializationError, serializeError } from './errors.js';
import { CollectionHandler } from './handlers/collection-handler.js';
import { MethodHandler } from './handlers/method-handler.js';
import { registerBridge, unregisterBridge } from './shutdown.js';
import { PROTOCOL_VERSION, MSG_TYPE } from './protocol.js';

export class BridgeHost {
  constructor({ userId, connectionId, callTimeout = 60000, onMessage, onResult } = {}) {
    this.channel = new MessageChannel();
    this.port = this.channel.port1;
    this.transferPort = this.channel.port2;
    this.callTimeout = callTimeout;
    this.onMessage = onMessage || null;
    this.onResult = onResult || null;
    this.handlers = new Map();
    this.context = { userId: userId ?? null, connectionId: connectionId ?? null };
    this.destroyed = false;

    this.registerHandler(MSG_TYPE.COLLECTION, new CollectionHandler(this.context));
    this.registerHandler(MSG_TYPE.METHOD, new MethodHandler(this.context));

    this.port.on('message', Meteor.bindEnvironment((msg) => this._dispatch(msg)));

    registerBridge(this);
  }

  registerHandler(type, handler) {
    this.handlers.set(type, handler);
  }

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

  _postResult(id, result) {
    try {
      this.port.postMessage({ v: PROTOCOL_VERSION, id, result });
    } catch (err) {
      this._postError(id, new BridgeSerializationError(
        `Failed to serialize bridge result: ${err.message}`
      ));
    }
  }

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

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.port.close();
    unregisterBridge(this);
  }
}
