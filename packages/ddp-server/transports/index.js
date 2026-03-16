import { createSockJSTransport } from './sockjs.js';
import { createFayeTransport } from './faye.js';
import { createWsTransport } from './ws.js';
import { createUwsTransport } from './uws.js';

const TRANSPORTS = {
  sockjs: createSockJSTransport,
  faye: createFayeTransport,
  ws: createWsTransport,
  uws: createUwsTransport,
};

const VALID_NAMES = Object.keys(TRANSPORTS);

/**
 * Resolve which transport to use. Priority:
 *   1. Meteor.settings.packages['ddp-server'].transport
 *   2. DDP_TRANSPORT env var
 *   3. DISABLE_SOCKJS=1 → 'faye' (backward compat)
 *   4. default: 'sockjs'
 *
 * Also sets __meteor_runtime_config__.DDP_TRANSPORT so the client
 * knows whether to load SockJS or use native WebSocket.
 */
export function getTransport() {
  var name = resolveTransportName();

  if (!TRANSPORTS[name]) {
    throw new Error(
      'Unknown DDP transport: "' + name + '". ' +
      'Valid transports: ' + VALID_NAMES.join(', ')
    );
  }

  // Propagate to client runtime config so browser.js can decide
  // whether to load SockJS or use native WebSocket.
  __meteor_runtime_config__.DDP_TRANSPORT = name;

  return TRANSPORTS[name]();
}

function resolveTransportName() {
  // 1. Meteor settings
  var settings = __meteor_runtime_config__?.meteorSettings?.packages?.['ddp-server'];
  if (settings && settings.transport) {
    return settings.transport;
  }

  // 2. DDP_TRANSPORT env var
  if (process.env.DDP_TRANSPORT) {
    return process.env.DDP_TRANSPORT;
  }

  // 3. Backward compat: DISABLE_SOCKJS=1 → faye
  if (process.env.DISABLE_SOCKJS) {
    return 'faye';
  }

  // 4. Default
  return 'sockjs';
}
