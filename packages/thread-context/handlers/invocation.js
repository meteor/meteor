/**
 * @module thread-context/handlers/invocation
 * @summary Shared factory for creating a `DDPCommon.MethodInvocation`
 * suitable for bridge handler execution contexts.
 */

import { BridgeContextError } from '../errors.js';
import { createConnectionProxy } from './connection-proxy.js';

/** @throws {BridgeContextError} Always — setUserId is not allowed from workers. */
function throwSetUserId() {
  throw new BridgeContextError('setUserId cannot be called from worker thread');
}

function noop() {}

/**
 * Creates a `DDPCommon.MethodInvocation` for a bridge context.
 * Called once per `handle()` dispatch to ensure fresh per-call state.
 *
 * @param {{ userId: string|null, connectionId: string|null }} context
 * @param {string} name - The method or operation name for the invocation.
 * @returns {DDPCommon.MethodInvocation}
 */
export function createBridgeInvocation(context, name) {
  const connection = context.connectionId
    ? createConnectionProxy(context.connectionId)
    : null;

  return new DDPCommon.MethodInvocation({
    name,
    isSimulation: false,
    userId: context.userId,
    setUserId: throwSetUserId,
    connection,
    unblock: noop,
  });
}
