import { BridgeError } from '../errors.js';
import { createBridgeInvocation } from './invocation.js';

const DIRECT_OPS = new Set(['findOneAsync', 'insertAsync', 'updateAsync', 'removeAsync', 'upsertAsync']);

export class CollectionHandler {
  constructor(context) {
    this.invocation = createBridgeInvocation(context);
  }

  async handle(msg) {
    const collection = Mongo.getCollection(msg.collectionName);
    if (!collection) {
      throw new BridgeError(`Collection '${msg.collectionName}' not found`);
    }

    return await DDP._CurrentMethodInvocation.withValue(this.invocation, () => this._execute(msg, collection));
  }

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
