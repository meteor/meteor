import { EventEmitter } from 'events';
import net from 'node:net';

/**
 * uWebSockets.js transport — high-performance WebSocket via uWebSockets.js.
 *
 * Unlike other transports, uWebSockets.js runs its own internal server on a
 * separate port. HTTP upgrade requests on /websocket are proxied from the
 * main Meteor HTTP server to the uWS server via a raw TCP connection.
 *
 * Configuration via Meteor.settings:
 *   { "packages": { "ddp-server": { "transport": "uws", "uws": { "port": 5001, "host": "127.0.0.1", "payloadLength": 48, "timeout": 45 } } } }
 */
export function createUwsTransport() {
  return {
    name: 'uws',
    setup(httpServer, pathPrefix, options) {
      const emitter = new EventEmitter();
      const uws = Npm.require('uWebSockets.js');

      const settings = __meteor_runtime_config__?.meteorSettings?.packages?.['ddp-server']?.uws || {};
      const uwsPort = Number(settings.port) || 5001;
      const uwsPayloadLength = Number(settings.payloadLength) || 48;
      const uwsSocketTimeout = Number(settings.timeout) || 45;
      const uwsHost = settings.host || '127.0.0.1';
      const uwsProxyHost = uwsHost === '0.0.0.0'
        ? '127.0.0.1'
        : uwsHost === '::'
          ? '::1'
          : uwsHost;

      // WeakMaps for event listeners (uWS sockets don't have EventEmitter).
      // WeakMap allows automatic GC if uWS drops a socket without firing close.
      const closeListeners = new WeakMap();
      const messageListeners = new WeakMap();

      const uwsApp = uws.App();

      uwsApp.get('/*', function (res) {
        res.end('OK');
      });

      uwsApp.ws('/*', {
        maxBackpressure: 16 * 1024 * 1024,
        maxPayloadLength: uwsPayloadLength * 1024,
        idleTimeout: uwsSocketTimeout,

        open(socket) {
          // Adapt uWS socket to the interface expected by _onConnection.
          // uWS sockets don't have EventEmitter methods, so we provide them.
          socket.on = function (event, callback) {
            if (event === 'close') {
              closeListeners.set(socket, callback);
            } else if (event === 'data') {
              messageListeners.set(socket, callback);
            }
          };

          socket.setWebsocketTimeout = function () {
            // uWS manages its own timeouts internally
          };

          socket.protocol = 'websocket-raw';
          socket.headers = socket.headers || {};

          emitter.emit('connection', socket);
        },

        upgrade(res, req, context) {
          const headers = {};
          req.forEach((key, value) => {
            headers[key] = value;
          });

          res.upgrade(
            { headers },
            req.getHeader('sec-websocket-key'),
            req.getHeader('sec-websocket-protocol'),
            req.getHeader('sec-websocket-extensions'),
            context,
          );
        },

        close(socket) {
          socket.isClosed = true;
          const closeListener = closeListeners.get(socket);
          closeListeners.delete(socket);
          messageListeners.delete(socket);
          if (closeListener) closeListener();
        },

        message(socket, message, isBinary) {
          if (isBinary) return;
          const str = Buffer.from(message).toString('utf-8');
          const messageListener = messageListeners.get(socket);
          if (messageListener) messageListener(str);
        }
      });

      uwsApp.listen(uwsHost, uwsPort, (token) => {
        if (!token) {
          throw new Error(
            'uWebSockets.js: failed to listen on ' + uwsHost + ':' + uwsPort
          );
        }
      });

      // Reject plain HTTP requests to /websocket
      WebApp.rawConnectHandlers.use(function (req, res, next) {
        const pathname = new URL(req.url, 'http://localhost').pathname;
        if (pathname === pathPrefix + '/websocket' ||
            pathname === pathPrefix + '/websocket/') {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Not a valid websocket request');
        } else {
          next();
        }
      });

      // Proxy WebSocket upgrade requests from the main HTTP server to uWS.
      // This is necessary because uWS runs on its own port.
      proxyWebsocketToUws(httpServer, pathPrefix, uwsProxyHost, uwsPort);

      return emitter;
    }
  };
}

/**
 * Proxy HTTP upgrade requests on /websocket from the main Meteor HTTP server
 * to the uWebSockets.js server via a raw TCP connection.
 */
function proxyWebsocketToUws(httpServer, pathPrefix, uwsHost, uwsPort) {
  const oldUpgradeListeners = httpServer.listeners('upgrade').slice(0);
  httpServer.removeAllListeners('upgrade');

  httpServer.on('upgrade', function (req, rawSocket, head) {
    const pathname = new URL(req.url, 'http://localhost').pathname;

    if (pathname === pathPrefix + '/websocket' ||
        pathname === pathPrefix + '/websocket/') {

      // Build the raw HTTP upgrade request to forward to uWS
      const uwsSocket = net.createConnection(uwsPort, uwsHost, function () {
        let headers = '';
        for (let i = 0; i < req.rawHeaders.length; i += 2) {
          headers += req.rawHeaders[i] + ': ' + req.rawHeaders[i + 1] + '\r\n';
        }

        const httpRequest =
          req.method + ' ' + req.url + ' HTTP/' + req.httpVersion + '\r\n' +
          headers + '\r\n';

        uwsSocket.write(httpRequest);
        if (head && head.length) uwsSocket.write(head);

        rawSocket.pipe(uwsSocket);
        uwsSocket.pipe(rawSocket);
      });

      uwsSocket.on('error', function () {
        if (rawSocket.writable) {
          rawSocket.write(
            'HTTP/1.1 502 Bad Gateway\r\n' +
            'Connection: close\r\n' +
            'Content-Type: text/plain\r\n' +
            '\r\n' +
            '502 Bad Gateway: Upstream WebSocket server unreachable.'
          );
        }
        rawSocket.destroy();
      });

      rawSocket.on('error', function () {
        if (uwsSocket.writable) uwsSocket.destroy();
      });
    } else {
      // Pass to other upgrade handlers (HMR, etc.)
      for (let i = 0; i < oldUpgradeListeners.length; i++) {
        oldUpgradeListeners[i].call(httpServer, req, rawSocket, head);
      }
    }
  });
}
