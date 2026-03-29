import { BridgeContextError } from '../errors.js';
import { createConnectionProxy } from './connection-proxy.js';

export class MethodHandler {
  constructor(context) {
    this.userId = context.userId;
    this.connectionId = context.connectionId;
  }

  async handle(msg) {
    const { methodName, methodArgs } = msg;

    const handler = Meteor.server.method_handlers[methodName];
    if (!handler) {
      throw new Meteor.Error(404, `Method '${methodName}' not found`);
    }

    const invocation = new DDPCommon.MethodInvocation({
      name: methodName,
      isSimulation: false,
      userId: this.userId,
      setUserId: () => {
        throw new BridgeContextError('setUserId cannot be called from worker thread');
      },
      connection: this.connectionId
        ? createConnectionProxy(this.connectionId)
        : null,
      unblock: () => {},
    });

    return await DDP._CurrentMethodInvocation.withValue(invocation, async () => {
      return await handler.apply(invocation, methodArgs);
    });
  }
}
