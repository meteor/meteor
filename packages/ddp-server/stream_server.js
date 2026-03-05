import once from 'lodash.once';
import net from 'node:net';
import zlib from 'node:zlib';
import { parse as parseUrl, format as formatUrl } from 'node:url';

// By default, we use the permessage-deflate extension with default
// configuration. If $SERVER_WEBSOCKET_COMPRESSION is set, then it must be valid
// JSON. If it represents a falsey value, then we do not use permessage-deflate
// at all; otherwise, the JSON value is used as an argument to deflate's
// configure method; see
// https://github.com/faye/permessage-deflate-node/blob/master/README.md
//
// (We do this in an _.once instead of at startup, because we don't want to
// crash the tool during isopacket load if your JSON doesn't parse. This is only
// a problem because the tool has to load the DDP server code just in order to
// be a DDP client; see https://github.com/meteor/meteor/issues/3452 .)
const websocketExtensions = once(function () {
  const extensions = [];

  const websocketCompressionConfig = process.env.SERVER_WEBSOCKET_COMPRESSION ?
    JSON.parse(process.env.SERVER_WEBSOCKET_COMPRESSION) : {};

  if (websocketCompressionConfig) {
    extensions.push(Npm.require('permessage-deflate2').configure({
      threshold: 1024,
      level: zlib.constants.Z_BEST_SPEED,
      memLevel: zlib.constants.Z_MIN_MEMLEVEL,
      noContextTakeover: true,
      maxWindowBits: zlib.constants.Z_MIN_WINDOWBITS,
      ...(websocketCompressionConfig || {})
    }));
  }

  return extensions;
});

const pathPrefix = __meteor_runtime_config__.ROOT_URL_PATH_PREFIX ||  '';

const uwsSettings = Meteor.settings?.packages?.['ddp-server']?.uws;
const uwsSettingsConfig = uwsSettings || {};
const isWebsocketPath = (pathname) => pathname === `${pathPrefix}/websocket` || pathname === `${pathPrefix}/websocket/`;

// Keep SockJS as default transport for compatibility with existing tests and
// tooling. uWebSockets.js can be enabled explicitly via env or settings.
const useUWebSockets = !!process.env.DISABLE_SOCKJS || !!uwsSettings;

StreamServer = function () {
  const self = this;
  self.registration_callbacks = [];
  self.open_sockets = [];

  if (useUWebSockets) {
    self._setupUWebSockets();
  } else {
    // Because we are installing directly onto WebApp.httpServer instead of using
    // WebApp.app, we have to process the path prefix ourselves.
    self.prefix = `${pathPrefix}/sockjs`;
    self._setupSockJS();
  }
};

Object.assign(StreamServer.prototype, {
  _setupSockJS: function () {
    const self = this;

    RoutePolicy.declare(`${self.prefix}/`, 'network');

    const sockjs = Npm.require('sockjs');
    const serverOptions = {
      prefix: self.prefix,
      log: function() {},
      // this is the default, but we code it explicitly because we depend
      // on it in stream_client:HEARTBEAT_TIMEOUT
      heartbeat_delay: 45000,
      // The default disconnect_delay is 5 seconds, but if the server ends up CPU
      // bound for that much time, SockJS might not notice that the user has
      // reconnected because the timer (of disconnect_delay ms) can fire before
      // SockJS processes the new connection. Eventually we'll fix this by not
      // combining CPU-heavy processing with SockJS termination (eg a proxy which
      // converts to Unix sockets) but for now, raise the delay.
      disconnect_delay: 60 * 1000,
      // Allow disabling of CORS requests to address
      // https://github.com/meteor/meteor/issues/8317.
      disable_cors: !!process.env.DISABLE_SOCKJS_CORS,
      // Set the USE_JSESSIONID environment variable to enable setting the
      // JSESSIONID cookie. This is useful for setting up proxies with
      // session affinity.
      jsessionid: !!process.env.USE_JSESSIONID
    };

    // If you know your server environment (eg, proxies) will prevent websockets
    // from ever working, set $DISABLE_WEBSOCKETS and SockJS clients (ie,
    // browsers) will not waste time attempting to use them.
    // (Your server will still have a /websocket endpoint.)
    if (process.env.DISABLE_WEBSOCKETS) {
      serverOptions.websocket = false;
    } else {
      serverOptions.faye_server_options = {
        extensions: websocketExtensions()
      };
    }

    self.server = sockjs.createServer(serverOptions);

    // Install the sockjs handlers, but we want to keep around our own particular
    // request handler that adjusts idle timeouts while we have an outstanding
    // request. This compensates for the fact that sockjs removes all listeners
    // for "request" to add its own.
    WebApp.httpServer.removeListener(
      'request', WebApp._timeoutAdjustmentRequestCallback);
    self.server.installHandlers(WebApp.httpServer);
    WebApp.httpServer.addListener(
      'request', WebApp._timeoutAdjustmentRequestCallback);

    // Support the /websocket endpoint
    self._redirectWebsocketEndpoint();

    self.server.on('connection', function (socket) {
      // sockjs sometimes passes us null instead of a socket object
      // so we need to guard against that. see:
      // https://github.com/sockjs/sockjs-node/issues/121
      // https://github.com/meteor/meteor/issues/10468
      if (!socket) return;

      // We want to make sure that if a client connects to us and does the initial
      // Websocket handshake but never gets to the DDP handshake, that we
      // eventually kill the socket. Once the DDP handshake happens, DDP
      // heartbeating will work. And before the Websocket handshake, the timeouts
      // we set at the server level in webapp_server.js will work. But
      // faye-websocket calls setTimeout(0) on any socket it takes over, so there
      // is an "in between" state where this doesn't happen. We work around this
      // by explicitly setting the socket timeout to a relatively large time here,
      // and setting it back to zero when we set up the heartbeat in
      // livedata_server.js.
      socket.setWebsocketTimeout = function (timeout) {
        if ((socket.protocol === 'websocket' || socket.protocol === 'websocket-raw') && socket._session.recv) {
          socket._session.recv.connection.setTimeout(timeout);
        }
      };
      socket.setWebsocketTimeout(45 * 1000);

      socket.send = function (data) {
        socket.write(data);
      };
      socket.on('close', function () {
        self.open_sockets = self.open_sockets.filter((s) => s !== socket);
      });
      self.open_sockets.push(socket);

      // only to send a message after connection on tests, useful for
      // socket-stream-client/server-tests.js
      if (process.env.TEST_METADATA && process.env.TEST_METADATA !== "{}") {
        socket.send(JSON.stringify({ testMessageOnConnect: true }));
      }

      // call all our callbacks when we get a new socket. they will do the
      // work of setting up handlers and such for specific messages.
      self.registration_callbacks.forEach((callback) => {
        callback(socket);
      });
    });
  },

  _setupUWebSockets: function () {
    const self = this;
    self._close_listeners = new Map();
    self._message_listeners = new Map();

    const uws = Npm.require('uWebSockets.js');
    self.uwsApp = uws.App();

    const uwsPort = Number(uwsSettingsConfig.port) || 5001;
    const uwsPayloadLength = Number(uwsSettingsConfig.payloadLength) || 48;
    const uwsSocketTimeout = Number(uwsSettingsConfig.timeout) || 45;
    const uwsHost = uwsSettingsConfig.host || '127.0.0.1';
    const uwsProxyHost = uwsHost === '0.0.0.0'
      ? '127.0.0.1'
      : uwsHost === '::'
        ? '::1'
        : uwsHost;

    self._proxyWebsocketEndpointToUWS(uwsProxyHost, uwsPort);

    self.uwsApp.get('/*', function (res) {
      res.end('OK');
    });

    self.uwsApp.ws('/*', {
      maxBackpressure: 16 * 1024 * 1024,
      maxPayloadLength: uwsPayloadLength * 1024,

      open(socket) {
        socket.on = function (event, callback) {
          if (event === 'close') {
            self._close_listeners.set(socket, callback);
          } else if (event === 'data') {
            self._message_listeners.set(socket, callback);
          }
        };

        self.open_sockets.push(socket);

        socket.setWebsocketTimeout = function (timeout) {
          if ((socket.protocol === 'websocket' || socket.protocol === 'websocket-raw') && socket._session && socket._session.recv) {
            socket._session.recv.connection.setTimeout(timeout);
          }
        };

        socket.setWebsocketTimeout(uwsSocketTimeout * 1000);

        self.registration_callbacks.forEach((callback) => {
          callback(socket);
        });
      },

      upgrade(res, req, context) {
        const headers = {};

        req.forEach((key, value) => {
          headers[key] = value;
        });

        res.upgrade(
          {
            headers
          },
          req.getHeader('sec-websocket-key'),
          req.getHeader('sec-websocket-protocol'),
          req.getHeader('sec-websocket-extensions'),
          context,
        );
      },

      close(socket) {
        socket.isClosed = true;
        self.open_sockets = self.open_sockets.filter((s) => s !== socket);

        const closeListener = self._close_listeners.get(socket);
        self._close_listeners.delete(socket);
        self._message_listeners.delete(socket);
        if (closeListener) {
          closeListener();
        }
      },

      message(socket, data) {
        const messageListener = self._message_listeners.get(socket);
        if (!messageListener) {
          return;
        }

        const message = Buffer.from(data).toString();
        messageListener(message);
      }
    });

    WebApp.onListening(function () {
      const onListen = function (listenSocket) {
        if (!listenSocket) {
          throw new Error(`uWebSockets.js could not listen to port ${uwsPort}!`);
        }
      };

      self.uwsApp.listen(uwsHost, uwsPort, onListen);
    });
  },

  // call my callback when a new socket connects.
  // also call it for all current connections.
  register: function (callback) {
    const self = this;
    self.registration_callbacks.push(callback);
    self.all_sockets().forEach((socket) => {
      callback(socket);
    });
  },

  // get a list of all sockets
  all_sockets: function () {
    const self = this;
    return Object.values(self.open_sockets);
  },

  // Redirect /websocket to /sockjs/websocket in order to not expose
  // sockjs to clients that want to use raw websockets
  _redirectWebsocketEndpoint: function() {
    const self = this;
    // Unfortunately we can't use a connect middleware here since
    // sockjs installs itself prior to all existing listeners
    // (meaning prior to any connect middlewares) so we need to take
    // an approach similar to overshadowListeners in
    // https://github.com/sockjs/sockjs-node/blob/cf820c55af6a9953e16558555a31decea554f70e/src/utils.coffee
    ['request', 'upgrade'].forEach((event) => {
      const httpServer = WebApp.httpServer;
      const oldHttpServerListeners = httpServer.listeners(event).slice(0);
      httpServer.removeAllListeners(event);

      // request and upgrade have different arguments passed but
      // we only care about the first one which is always request
      const newListener = function (request /*, moreArguments */) {
        // Store arguments for use within the closure below
        const args = arguments;

        // Rewrite /websocket and /websocket/ urls to /sockjs/websocket while
        // preserving query string.
        const parsedUrl = parseUrl(request.url);
        if (isWebsocketPath(parsedUrl.pathname)) {
          parsedUrl.pathname = `${self.prefix}/websocket`;
          request.url = formatUrl(parsedUrl);
        }
        oldHttpServerListeners.forEach((oldListener) => {
          oldListener.apply(httpServer, args);
        });
      };
      httpServer.addListener(event, newListener);
    });
  },

  // Keep /websocket on WebApp.httpServer usable in uWS mode by proxying
  // websocket upgrades to the internal uWS listener port.
  _proxyWebsocketEndpointToUWS: function (proxyHost, uwsPort) {
    ['request', 'upgrade'].forEach((event) => {
      const httpServer = WebApp.httpServer;
      const oldHttpServerListeners = httpServer.listeners(event).slice(0);
      httpServer.removeAllListeners(event);

      const newListener = function (request /*, moreArguments */) {
        const args = arguments;
        const parsedUrl = parseUrl(request.url);
        if (!isWebsocketPath(parsedUrl.pathname)) {
          oldHttpServerListeners.forEach((oldListener) => {
            oldListener.apply(httpServer, args);
          });
          return;
        }

        if (event === 'request') {
          const response = args[1];
          response.writeHead(400, {
            'Content-Type': 'text/plain; charset=UTF-8',
          });
          response.end('Not a valid websocket request');
          return;
        }

        const socket = args[1];
        const head = args[2];
        const upstream = net.connect({
          host: proxyHost,
          port: uwsPort,
        });

        upstream.on('connect', () => {
          const requestLine = `${request.method} ${request.url} HTTP/${request.httpVersion}\r\n`;
          let headers = '';
          for (let i = 0; i < request.rawHeaders.length; i += 2) {
            headers += `${request.rawHeaders[i]}: ${request.rawHeaders[i + 1]}\r\n`;
          }
          upstream.write(`${requestLine}${headers}\r\n`);
          if (head && head.length) {
            upstream.write(head);
          }
          socket.pipe(upstream).pipe(socket);
        });

        const cleanup = () => {
          if (!upstream.destroyed) {
            upstream.destroy();
          }
          if (!socket.destroyed) {
            socket.destroy();
          }
        };

        upstream.on('error', cleanup);
        upstream.on('close', cleanup);
        socket.on('error', cleanup);
        socket.on('close', cleanup);
      };

      httpServer.addListener(event, newListener);
    });
  }
});
