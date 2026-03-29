import { BridgeError, BridgeContextError } from '../errors.js';
import { createConnectionProxy } from './connection-proxy.js';

const DIRECT_OPS = ['findOneAsync', 'insertAsync', 'updateAsync', 'removeAsync', 'upsertAsync'];

export class CollectionHandler {
  constructor(context) {
    this.context = context;
  }

  async handle(msg) {
    const collection = Mongo._collections.get(msg.collectionName);
    if (!collection) {
      throw new BridgeError(`Collection '${msg.collectionName}' not found`);
    }

    const invocation = new DDPCommon.MethodInvocation({
      name: `bridge:collection:${msg.collectionName}.${msg.op}`,
      isSimulation: false,
      userId: this.context.userId,
      setUserId: () => {
        throw new BridgeContextError('setUserId cannot be called from worker thread');
      },
      connection: this.context.connectionId
        ? createConnectionProxy(this.context.connectionId)
        : null,
      unblock: () => {},
    });

    return await DDP._CurrentMethodInvocation.withValue(invocation, () => this._execute(msg, collection));
  }

  async _execute(msg, collection) {
    const { op, args } = msg;

    if (DIRECT_OPS.includes(op)) {
      return await collection[op](...args);
    }

    if (op === 'find.fetchAsync') {
      return await collection.find(args[0], args[1]).fetchAsync();
    }
    if (op === 'find.countAsync') {
      return await collection.find(args[0], args[1]).countAsync();
    }
    if (op === 'find.forEachAsync' || op === 'find.mapAsync') {
      return await collection.find(args[0], args[1]).fetchAsync();
    }

    if (op === 'aggregate') {
      const raw = collection.rawCollection();
      const cursor = raw.aggregate(args[0], args[1]);
      return await cursor.toArray();
    }

    throw new BridgeError(`Unknown collection operation: '${op}'`);
  }
}
