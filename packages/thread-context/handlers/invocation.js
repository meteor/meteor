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
 * Creates a reusable `DDPCommon.MethodInvocation` for a bridge context.
 * Both `CollectionHandler` and `MethodHandler` cache this on their instance
 * so it is allocated once per bridge, not per call.
 *
 * @param {{ userId: string|null, connectionId: string|null }} context
 * @returns {DDPCommon.MethodInvocation}
 */
export function createBridgeInvocation(context) {
  const connection = context.connectionId
    ? createConnectionProxy(context.connectionId)
    : null;

  return new DDPCommon.MethodInvocation({
    name: 'bridge',
    isSimulation: false,
    userId: context.userId,
    setUserId: throwSetUserId,
    connection,
    unblock: noop,
  });
}
