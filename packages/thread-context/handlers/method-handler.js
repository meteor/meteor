/**
 * @module thread-context/handlers/method-handler
 * @summary Host-side handler for Meteor method invocations bridged from a worker.
 */

import { BridgeContextError } from '../errors.js';
import { createBridgeInvocation } from './invocation.js';

/**
 * Methods that manage the DDP session itself. They act on the real
 * connection (through `connection.id`) before calling `setUserId`, which
 * the bridge forbids, so they can never complete from a worker and would
 * leave the caller's session half-updated. Refused up front.
 * @type {Set<string>}
 */
const SESSION_METHODS = new Set([
  'login',
  'logout',
  'logoutOtherClients',
  'getNewToken',
  'removeOtherTokens',
  'configureLoginService',
]);

/**
 * Handles method invocation messages from the worker by running the method
 * through `Meteor.server.applyAsync` under a `DDP._CurrentMethodInvocation`
 * context that carries the forwarded userId and a restricted connection.
 */
export class MethodHandler {
  /**
   * @param {{ userId: string|null, connectionId: string|null }} context
   */
  constructor(context) {
    this.context = context;
  }

  /**
   * Dispatches a method invocation message. Going through `applyAsync`
   * gives bridged calls the same treatment as any server-initiated call:
   * argument-check auditing, a per-call random seed, instrumentation events,
   * and result cloning.
   *
   * @param {import('../bridge-host.js').BridgeMessage} msg
   * @returns {Promise<any>}
   * @throws {BridgeContextError} If the method manages the DDP session.
   * @throws {Meteor.Error} If the method is not found (404).
   */
  async handle(msg) {
    const { methodName, methodArgs = [] } = msg;

    if (SESSION_METHODS.has(methodName)) {
      throw new BridgeContextError(
        `Method '${methodName}' manages the DDP session and cannot be called from a worker thread`
      );
    }

    // Own-property check so names inherited from Object.prototype
    // (e.g. 'constructor') are not treated as methods.
    if (!Object.hasOwn(Meteor.server.method_handlers, methodName)) {
      throw new Meteor.Error(404, `Method '${methodName}' not found`);
    }

    const invocation = createBridgeInvocation(this.context, methodName);
    return await DDP._CurrentMethodInvocation.withValue(invocation, () =>
      Meteor.server.applyAsync(methodName, methodArgs)
    );
  }
}
