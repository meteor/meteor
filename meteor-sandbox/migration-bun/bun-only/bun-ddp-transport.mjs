// BunSocket — Bun-native WebSocket adapter for Meteor's StreamServer
//
// ⚠️ TRANSITIONAL COMPATIBILITY SEAM (Phase 1)
// This adapter wraps Bun's ServerWebSocket to satisfy the socket contract
// expected by StreamServer and livedata_server's Session.
//
// Target architecture: a proper DDP transport registered via the pluggable
// transport interface (PR #14231), not a socket-level shim.
//
// Contract source:
//   packages/ddp-server/stream_server.js:98-145
//   packages/ddp-server/livedata_server.js:80-160

import { EventEmitter } from 'node:events';

export class BunSocket extends EventEmitter {
  /**
   * @param {ServerWebSocket} bunWs — Bun's native WebSocket object
   * @param {Request} req — the HTTP upgrade request
   */
  constructor(bunWs, req) {
    super();
    this._ws = bunWs;

    // Properties read by Session (livedata_server.js:126, 149, 812-814)
    // and StreamServer._onConnection (stream_server.js:75-83)
    this.headers = Object.fromEntries(req.headers.entries());
    this.remoteAddress = bunWs.remoteAddress;
    this.url = new URL(req.url, 'http://localhost').pathname;
    this.protocol = 'websocket-raw';
    this._meteorSession = null;
  }

  // Called by Session.send() (livedata_server.js:335)
  send(data) {
    try { this._ws.send(data); } catch (e) { /* socket may be closing */ }
  }

  // Alias expected by StreamServer (stream_server.js:124-126)
  write(data) { this.send(data); }

  // Called by Session.close() (livedata_server.js:304)
  close() { this._ws.close(); }

  // Called by StreamServer (stream_server.js:115-122)
  // No-op — Bun manages its own WebSocket timeouts natively
  setWebsocketTimeout() {}
}
