/**
 * @module thread-context/handlers/collection-handler
 * @summary Host-side handler for collection operations bridged from a worker.
 */

import { BridgeError } from '../errors.js';
import { createBridgeInvocation } from './invocation.js';

/** @type {Set<string>} Operations dispatched directly as `collection[op](...args)`. */
const DIRECT_OPS = new Set(['findOneAsync', 'insertAsync', 'updateAsync', 'removeAsync', 'upsertAsync']);

/**
 * Handles collection operation messages from the worker by resolving
 * the real Mongo collection and executing the requested operation
 * under a `DDP._CurrentMethodInvocation` context.
 */
export class CollectionHandler {
  /**
   * @param {{ userId: string|null, connectionId: string|null }} context
   */
  constructor(context) {
    this.context = context;
  }

  /**
   * Dispatches a collection operation message.
   * @param {import('../bridge-host.js').BridgeMessage} msg
   * @returns {Promise<any>}
   * @throws {BridgeError} If the collection is not found or the operation is unknown.
   */
  async handle(msg) {
    const collection = Mongo.getCollection(msg.collectionName);
    if (!collection) {
      throw new BridgeError(`Collection '${msg.collectionName}' not found`);
    }

    const invocation = createBridgeInvocation(this.context);
    return await DDP._CurrentMethodInvocation.withValue(invocation, () => this._execute(msg, collection));
  }

  /**
   * Executes the actual collection operation.
   * @param {import('../bridge-host.js').BridgeMessage} msg
   * @param {Mongo.Collection} collection
   * @returns {Promise<any>}
   * @private
   */
  async _execute(msg, collection) {
    const { op, args } = msg;

    if (DIRECT_OPS.has(op)) {
      return await collection[op](...args);
    }

    if (op === 'find.fetchAsync') {
      return await collection.find(args[0], args[1]).fetchAsync();
    }
    if (op === 'find.countAsync') {
      return await collection.find(args[0], args[1]).countAsync();
    }

    if (op === 'aggregate') {
      const raw = collection.rawCollection();
      const cursor = raw.aggregate(args[0], args[1]);
      return await cursor.toArray();
    }

    throw new BridgeError(`Unknown collection operation: '${op}'`);
  }
}
