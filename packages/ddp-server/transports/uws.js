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
      var emitter = new EventEmitter();
      var uws = Npm.require('uWebSockets.js');

      var settings = __meteor_runtime_config__?.meteorSettings?.packages?.['ddp-server']?.uws || {};
      var uwsPort = Number(settings.port) || 5001;
      var uwsPayloadLength = Number(settings.payloadLength) || 48;
      var uwsSocketTimeout = Number(settings.timeout) || 45;
      var uwsHost = settings.host || '127.0.0.1';
      var uwsProxyHost = uwsHost === '0.0.0.0'
        ? '127.0.0.1'
        : uwsHost === '::'
          ? '::1'
          : uwsHost;

      // Internal Maps for event listeners (uWS sockets don't have EventEmitter)
      var closeListeners = new Map();
      var messageListeners = new Map();

      var uwsApp = uws.App();

      uwsApp.get('/*', function (res) {
        res.end('OK');
      });

      uwsApp.ws('/*', {
        maxBackpressure: 16 * 1024 * 1024,
        maxPayloadLength: uwsPayloadLength * 1024,

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
          var headers = {};
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
          var closeListener = closeListeners.get(socket);
          closeListeners.delete(socket);
          messageListeners.delete(socket);
          if (closeListener) closeListener();
        },

        message(socket, message, isBinary) {
          if (isBinary) return;
          var str = Buffer.from(message).toString('utf-8');
          var messageListener = messageListeners.get(socket);
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
        var pathname = new URL(req.url, 'http://localhost').pathname;
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
  var oldUpgradeListeners = httpServer.listeners('upgrade').slice(0);
  httpServer.removeAllListeners('upgrade');

  httpServer.on('upgrade', function (req, rawSocket, head) {
    var pathname = new URL(req.url, 'http://localhost').pathname;

    if (pathname === pathPrefix + '/websocket' ||
        pathname === pathPrefix + '/websocket/') {

      // Build the raw HTTP upgrade request to forward to uWS
      var uwsSocket = net.createConnection(uwsPort, uwsHost, function () {
        var headers = '';
        for (var i = 0; i < req.rawHeaders.length; i += 2) {
          headers += req.rawHeaders[i] + ': ' + req.rawHeaders[i + 1] + '\r\n';
        }

        var httpRequest =
          req.method + ' ' + req.url + ' HTTP/' + req.httpVersion + '\r\n' +
          headers + '\r\n';

        uwsSocket.write(httpRequest);
        if (head && head.length) uwsSocket.write(head);

        rawSocket.pipe(uwsSocket);
        uwsSocket.pipe(rawSocket);
      });

      uwsSocket.on('error', function () {
        rawSocket.destroy();
      });

      rawSocket.on('error', function () {
        uwsSocket.destroy();
      });
    } else {
      // Pass to other upgrade handlers (HMR, etc.)
      for (var i = 0; i < oldUpgradeListeners.length; i++) {
        oldUpgradeListeners[i].call(httpServer, req, rawSocket, head);
      }
    }
  });
}
