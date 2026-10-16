import { EventEmitter } from 'events';
import { RawWebSocketConnection } from './raw_connection.js';

/**
 * Bun native WebSocket transport.
 *
 * Uses the `ws` npm package in noServer mode with Node's http 'upgrade'
 * event. This works on both Node.js and Bun, but is primarily intended
 * for Bun where SockJS and uWebSockets.js are not available.
 *
 * Bun's http.createServer supports the 'upgrade' event, making this
 * the most straightforward transport for Bun runtime.
 *
 * Select via:
 *   DDP_TRANSPORT=bun
 *   Meteor.settings.packages['ddp-server'].transport = 'bun'
 *   Auto-detected when typeof Bun !== 'undefined'
 */
export function createBunTransport() {
  return {
    name: 'bun',
    setup(httpServer, pathPrefix, options) {
      var emitter = new EventEmitter();
      var WebSocketServer = Npm.require('ws').WebSocketServer;
      var wss = new WebSocketServer({ noServer: true });

      // Reject plain HTTP requests to /websocket
      WebApp.rawConnectHandlers.use(function (req, res, next) {
        var pathname;
        try {
          pathname = new URL(req.url, 'http://localhost').pathname;
        } catch (err) {
          next();
          return;
        }
        if (pathname === pathPrefix + '/websocket' ||
            pathname === pathPrefix + '/websocket/') {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Not a valid websocket request');
        } else {
          next();
        }
      });

      httpServer.on('upgrade', function (req, socket, head) {
        var pathname;
        try {
          pathname = new URL(req.url, 'http://localhost').pathname;
        } catch (err) {
          socket.destroy();
          return;
        }

        if (pathname === pathPrefix + '/websocket' ||
            pathname === pathPrefix + '/websocket/' ||
            // SockJS-style paths from legacy clients
            (pathname.includes('/sockjs/') && pathname.endsWith('/websocket'))) {

          wss.handleUpgrade(req, socket, head, function (ws) {
            var conn = new RawWebSocketConnection(ws, req, socket, function (data) {
              return data.toString();
            });
            emitter.emit('connection', conn);
          });
        }
      });

      return emitter;
    }
  };
}
