/**
 * @module thread-context/handlers/method-handler
 * @summary Host-side handler for Meteor method invocations bridged from a worker.
 */

import { createBridgeInvocation } from './invocation.js';

/**
 * Handles method invocation messages from the worker by looking up the
 * method handler on `Meteor.server` and executing it under a
 * `DDP._CurrentMethodInvocation` context with the forwarded userId.
 */
export class MethodHandler {
  /**
   * @param {{ userId: string|null, connectionId: string|null }} context
   */
  constructor(context) {
    this.context = context;
  }

  /**
   * Dispatches a method invocation message.
   * @param {import('../bridge-host.js').BridgeMessage} msg
   * @returns {Promise<any>}
   * @throws {Meteor.Error} If the method is not found (404).
   */
  async handle(msg) {
    const { methodName, methodArgs } = msg;

    const handler = Meteor.server.method_handlers[methodName];
    if (!handler) {
      throw new Meteor.Error(404, `Method '${methodName}' not found`);
    }

    const invocation = createBridgeInvocation(this.context);
    return await DDP._CurrentMethodInvocation.withValue(invocation, async () => {
      return await handler.apply(invocation, methodArgs);
    });
  }
}
