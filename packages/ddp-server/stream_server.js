import once from 'lodash.once';
import { EventEmitter } from 'events';

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
var websocketExtensions = once(function () {
  var extensions = [];

  var websocketCompressionConfig = process.env.SERVER_WEBSOCKET_COMPRESSION
        ? JSON.parse(process.env.SERVER_WEBSOCKET_COMPRESSION) : {};
  if (websocketCompressionConfig) {
    extensions.push(Npm.require('permessage-deflate').configure(
      websocketCompressionConfig
    ));
  }

  return extensions;
});

var pathPrefix = __meteor_runtime_config__.ROOT_URL_PATH_PREFIX ||  "";
var disableSockJS = !!process.env.DISABLE_SOCKJS;

// Wrapper around a raw faye-websocket connection that provides the same
// interface as a SockJS connection (as expected by _onConnection and
// livedata_server.js).
class RawWebSocketConnection extends EventEmitter {
  constructor(ws, req, rawSocket) {
    super();
    this._ws = ws;
    this._rawSocket = rawSocket;
    this.protocol = 'websocket-raw';
    this.id = Random.id();

    // Copy relevant headers (same set as SockJS transport.js)
    this.headers = {};
    const headerKeys = [
      'referer', 'x-client-ip', 'x-forwarded-for',
      'x-forwarded-host', 'x-forwarded-port', 'x-cluster-client-ip',
      'via', 'x-real-ip', 'x-forwarded-proto', 'x-ssl', 'dnt',
      'host', 'user-agent', 'accept-language'
    ];
    for (const key of headerKeys) {
      if (req.headers[key]) this.headers[key] = req.headers[key];
    }

    this.remoteAddress = rawSocket.remoteAddress;
    this.remotePort = rawSocket.remotePort;
    this.url = req.url;

    // Compatibility with SockJS internals that stream_server accesses
    this._session = {
      recv: {
        connection: rawSocket,
        protocol: 'websocket-raw'
      }
    };

    ws.on('message', (event) => {
      this.emit('data', event.data);
    });

    ws.on('close', () => {
      this.emit('close');
      this._ws = null;
    });

    ws.on('error', () => {
      this.emit('close');
      this._ws = null;
    });
  }

  write(data) {
    if (this._ws) this._ws.send(data);
  }

  send(data) {
    this.write(data);
  }

  close() {
    if (this._ws) this._ws.close();
  }

  setWebsocketTimeout(timeout) {
    if (this._rawSocket) {
      this._rawSocket.setTimeout(timeout);
    }
  }
}

StreamServer = function () {
  var self = this;
  self.registration_callbacks = [];
  self.open_sockets = [];

  if (disableSockJS) {
    self._setupRawWebSocket();
  } else {
    self._setupSockJS();
  }
};

Object.assign(StreamServer.prototype, {
  // Shared connection handler used by both SockJS and raw WebSocket paths.
  _onConnection(socket) {
    var self = this;

    // sockjs sometimes passes us null instead of a socket object
    // so we need to guard against that. see:
    // https://github.com/sockjs/sockjs-node/issues/121
    // https://github.com/meteor/meteor/issues/10468
    if (!socket) return;

    // We want to make sure that if a client connects to us and does the initial
    // Websocket handshake but never gets to the DDP handshake, that we
    // eventually kill the socket.  Once the DDP handshake happens, DDP
    // heartbeating will work. And before the Websocket handshake, the timeouts
    // we set at the server level in webapp_server.js will work. But
    // faye-websocket calls setTimeout(0) on any socket it takes over, so there
    // is an "in between" state where this doesn't happen.  We work around this
    // by explicitly setting the socket timeout to a relatively large time here,
    // and setting it back to zero when we set up the heartbeat in
    // livedata_server.js.
    if (!socket.setWebsocketTimeout) {
      socket.setWebsocketTimeout = function (timeout) {
        if ((socket.protocol === 'websocket' ||
             socket.protocol === 'websocket-raw')
            && socket._session.recv) {
          socket._session.recv.connection.setTimeout(timeout);
        }
      };
    }
    socket.setWebsocketTimeout(45 * 1000);

    if (!socket.send) {
      socket.send = function (data) {
        socket.write(data);
      };
    }

    socket.on('close', function () {
      self.open_sockets = self.open_sockets.filter(function(value) {
        return value !== socket;
      });
    });
    self.open_sockets.push(socket);

    // only to send a message after connection on tests, useful for
    // socket-stream-client/server-tests.js
    if (process.env.TEST_METADATA && process.env.TEST_METADATA !== "{}") {
      socket.send(JSON.stringify({ testMessageOnConnect: true }));
    }

    // call all our callbacks when we get a new socket. they will do the
    // work of setting up handlers and such for specific messages.
    self.registration_callbacks.forEach(function (callback) {
      callback(socket);
    });
  },

  // Set up the traditional SockJS transport (default when DISABLE_SOCKJS is
  // not set). This is the original code path, moved here verbatim.
  _setupSockJS() {
    var self = this;

    // Because we are installing directly onto WebApp.httpServer instead of using
    // WebApp.app, we have to process the path prefix ourselves.
    self.prefix = pathPrefix + '/sockjs';
    RoutePolicy.declare(self.prefix + '/', 'network');

    // set up sockjs
    var sockjs = Npm.require('sockjs');
    var serverOptions = {
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
    // request.  This compensates for the fact that sockjs removes all listeners
    // for "request" to add its own.
    WebApp.httpServer.removeListener(
      'request', WebApp._timeoutAdjustmentRequestCallback);
    self.server.installHandlers(WebApp.httpServer);
    WebApp.httpServer.addListener(
      'request', WebApp._timeoutAdjustmentRequestCallback);

    // Support the /websocket endpoint
    self._redirectWebsocketEndpoint();

    self.server.on('connection', function (socket) {
      self._onConnection(socket);
    });
  },

  // Set up raw WebSocket transport (when DISABLE_SOCKJS=1). No SockJS server,
  // no polling transports, no /sockjs/info endpoint. Direct WebSocket only.
  _setupRawWebSocket() {
    var self = this;
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
    var httpServer = WebApp.httpServer;
    var oldUpgradeListeners = httpServer.listeners('upgrade').slice(0);
    httpServer.removeAllListeners('upgrade');

    httpServer.on('upgrade', function (req, rawSocket, head) {
      // req.url is a relative path — new URL() requires a base to parse it.
      var pathname = new URL(req.url, 'http://localhost').pathname;

      if (FayeWebSocket.isWebSocket(req) &&
          (pathname === pathPrefix + '/websocket' ||
           pathname === pathPrefix + '/websocket/')) {

        var wsOptions = { extensions: websocketExtensions() };
        var ws = new FayeWebSocket(req, rawSocket, head, null, wsOptions);
        var meteorSocket = new RawWebSocketConnection(ws, req, rawSocket);
        self._onConnection(meteorSocket);
      } else {
        // Pass to other upgrade handlers (HMR, etc.)
        for (var i = 0; i < oldUpgradeListeners.length; i++) {
          oldUpgradeListeners[i].call(httpServer, req, rawSocket, head);
        }
      }
    });
  },

  // call my callback when a new socket connects.
  // also call it for all current connections.
  register: function (callback) {
    var self = this;
    self.registration_callbacks.push(callback);
    self.all_sockets().forEach(function (socket) {
      callback(socket);
    });
  },

  // get a list of all sockets
  all_sockets: function () {
    var self = this;
    return Object.values(self.open_sockets);
  },

  // Redirect /websocket to /sockjs/websocket in order to not expose
  // sockjs to clients that want to use raw websockets
  _redirectWebsocketEndpoint: function() {
    var self = this;
    // Unfortunately we can't use a connect middleware here since
    // sockjs installs itself prior to all existing listeners
    // (meaning prior to any connect middlewares) so we need to take
    // an approach similar to overshadowListeners in
    // https://github.com/sockjs/sockjs-node/blob/cf820c55af6a9953e16558555a31decea554f70e/src/utils.coffee
    ['request', 'upgrade'].forEach((event) => {
      var httpServer = WebApp.httpServer;
      var oldHttpServerListeners = httpServer.listeners(event).slice(0);
      httpServer.removeAllListeners(event);

      // request and upgrade have different arguments passed but
      // we only care about the first one which is always request
      var newListener = function(request /*, moreArguments */) {
        // Store arguments for use within the closure below
        var args = arguments;

        // TODO replace with url package
        var url = Npm.require('url');

        // Rewrite /websocket and /websocket/ urls to /sockjs/websocket while
        // preserving query string.
        var parsedUrl = url.parse(request.url);
        if (parsedUrl.pathname === pathPrefix + '/websocket' ||
            parsedUrl.pathname === pathPrefix + '/websocket/') {
          parsedUrl.pathname = self.prefix + '/websocket';
          request.url = url.format(parsedUrl);
        }
        oldHttpServerListeners.forEach(function(oldListener) {
          oldListener.apply(httpServer, args);
        });
      };
      httpServer.addListener(event, newListener);
    });
  }
});
