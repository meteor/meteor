import { BridgeContextError } from '../errors.js';
import { createConnectionProxy } from './connection-proxy.js';

function throwSetUserId() {
  throw new BridgeContextError('setUserId cannot be called from worker thread');
}

function noop() {}

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
