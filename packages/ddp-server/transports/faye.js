import { EventEmitter } from 'events';
import { RawWebSocketConnection } from './raw_connection.js';

/**
 * faye-websocket transport — raw WebSocket via faye-websocket library.
 * No SockJS, no polling transports, no /sockjs/info endpoint.
 */
export function createFayeTransport() {
  return {
    name: 'faye',
    setup(httpServer, pathPrefix, options) {
      var emitter = new EventEmitter();
      var FayeWebSocket = Npm.require('faye-websocket');

      RoutePolicy.declare(pathPrefix + '/websocket/', 'network');

      // Reject plain HTTP requests to /websocket with a clear error message
      // (same behavior as SockJS). Without this, they'd fall through to the
      // app and return the main HTML page.
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

      // We must take over existing 'upgrade' listeners (similar to what SockJS
      // does via overshadowListeners) so that our handler runs first for the
      // /websocket path, and other handlers (HMR, etc.) get the rest.
      var oldUpgradeListeners = httpServer.listeners('upgrade').slice(0);
      httpServer.removeAllListeners('upgrade');

      httpServer.on('upgrade', function (req, rawSocket, head) {
        var pathname = new URL(req.url, 'http://localhost').pathname;

        if (FayeWebSocket.isWebSocket(req) &&
            (pathname === pathPrefix + '/websocket' ||
             pathname === pathPrefix + '/websocket/')) {

          var wsOptions = { extensions: options.websocketExtensions() };
          var ws = new FayeWebSocket(req, rawSocket, head, null, wsOptions);
          var meteorSocket = new RawWebSocketConnection(ws, req, rawSocket,
            // faye-websocket wraps message data in an event object
            (event) => event.data
          );
          emitter.emit('connection', meteorSocket);
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
