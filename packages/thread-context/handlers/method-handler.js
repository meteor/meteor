import { createBridgeInvocation } from './invocation.js';

export class MethodHandler {
  constructor(context) {
    this.invocation = createBridgeInvocation(context);
  }

  async handle(msg) {
    const { methodName, methodArgs } = msg;

    const handler = Meteor.server.method_handlers[methodName];
    if (!handler) {
      throw new Meteor.Error(404, `Method '${methodName}' not found`);
    }

    return await DDP._CurrentMethodInvocation.withValue(this.invocation, async () => {
      return await handler.apply(this.invocation, methodArgs);
    });
  }
}
