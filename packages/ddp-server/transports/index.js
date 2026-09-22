import { createSockJSTransport } from './sockjs.js';
import { createUwsTransport } from './uws.js';

/**
 * Socket contract
 *
 * A transport emits 'connection' with a socket object, and the rest of
 * ddp-server drives that socket through this interface only:
 *
 *   on('data', cb)     receive one decoded text frame per call
 *   on('close', cb)    called once when the socket is gone
 *   send(string)       queue one text frame
 *   close()            close the socket AFTER flushing what send() queued
 *   isClosed           truthy once closed
 *   protocol           'websocket' or 'websocket-raw'
 *   headers            the upgrade request headers
 *   setWebsocketTimeout(ms)
 *
 * The flushing guarantee in close() is load-bearing: livedata_server ends
 * DDP version negotiation by sending 'failed' and closing in the same tick,
 * so a close that discards queued frames silently breaks negotiation. A
 * transport whose native close does not flush must adapt it, as uws.js does.
 */

const TRANSPORTS = {
  sockjs: createSockJSTransport,
  uws: createUwsTransport,
};

const VALID_NAMES = Object.keys(TRANSPORTS);

/**
 * Resolve which transport to use. Priority:
 *   1. Meteor.settings.packages['ddp-server'].transport
 *   2. DDP_TRANSPORT env var
 *   3. DISABLE_SOCKJS=1 → 'uws' (backward compat)
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
  var settings = Meteor.settings?.packages?.['ddp-server'];
  if (settings && settings.transport) {
    return settings.transport;
  }

  // 2. DDP_TRANSPORT env var
  if (process.env.DDP_TRANSPORT) {
    return process.env.DDP_TRANSPORT;
  }

  // 3. Backward compat: DISABLE_SOCKJS=1 → uws
  if (process.env.DISABLE_SOCKJS) {
    return 'uws';
  }

  // 4. Default
  return 'sockjs';
}
