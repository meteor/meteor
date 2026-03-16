import { EventEmitter } from 'events';
import zlib from 'node:zlib';
import { RawWebSocketConnection } from './raw_connection.js';

/**
 * ws transport — raw WebSocket via the `ws` npm package.
 * No SockJS, no polling transports, no /sockjs/info endpoint.
 */
export function createWsTransport() {
  return {
    name: 'ws',
    setup(httpServer, pathPrefix, options) {
      var emitter = new EventEmitter();
      var WebSocket = Npm.require('ws');

      // Determine compression config from websocketExtensions().
      // If extensions are configured, enable perMessageDeflate.
      var extensions = options.websocketExtensions();
      var perMessageDeflate = extensions.length > 0
        ? {
            zlibDeflateOptions: {
              level: zlib.constants.Z_BEST_SPEED,
              memLevel: zlib.constants.Z_MIN_MEMLEVEL,
              windowBits: zlib.constants.Z_MIN_WINDOWBITS
            },
            threshold: 1024
          }
        : false;

      // Create a ws server in noServer mode — we handle upgrade manually so
      // that non-/websocket upgrades (HMR, etc.) reach their own handlers.
      var wss = new WebSocket.Server({
        noServer: true,
        perMessageDeflate: perMessageDeflate
      });

      RoutePolicy.declare(pathPrefix + '/websocket/', 'network');

      // Reject plain HTTP requests to /websocket with a clear error message
      WebApp.rawConnectHandlers.use(function (req, res, next) {
        var pathname = new URL(req.url, 'http://localhost').pathname;
        if (pathname === pathPrefix + '/websocket' ||
            pathname === pathPrefix + '/websocket/') {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Not a valid websocket request');
        } else {
          next();
        }
      });

      // Take over existing 'upgrade' listeners so our handler runs first
      // for the /websocket path, and other handlers (HMR, etc.) get the rest.
      var oldUpgradeListeners = httpServer.listeners('upgrade').slice(0);
      httpServer.removeAllListeners('upgrade');

      httpServer.on('upgrade', function (req, rawSocket, head) {
        var pathname = new URL(req.url, 'http://localhost').pathname;

        if (req.headers.upgrade &&
            req.headers.upgrade.toLowerCase() === 'websocket' &&
            (pathname === pathPrefix + '/websocket' ||
             pathname === pathPrefix + '/websocket/')) {

          wss.handleUpgrade(req, rawSocket, head, function (ws) {
            var meteorSocket = new RawWebSocketConnection(ws, req, rawSocket,
              // ws passes data directly (no event wrapper like faye)
              (data, isBinary) => {
                if (isBinary) return null;
                return typeof data === 'string' ? data : data.toString();
              }
            );
            emitter.emit('connection', meteorSocket);
          });
        } else {
          // Pass to other upgrade handlers (HMR, etc.)
          for (var i = 0; i < oldUpgradeListeners.length; i++) {
            oldUpgradeListeners[i].call(httpServer, req, rawSocket, head);
          }
        }
      });

      return emitter;
    }
  };
}
