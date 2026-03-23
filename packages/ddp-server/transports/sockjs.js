import { EventEmitter } from 'events';

/**
 * SockJS transport — the traditional Meteor transport.
 * Provides WebSocket with automatic fallback to HTTP polling.
 */
export function createSockJSTransport() {
  return {
    name: 'sockjs',
    setup(httpServer, pathPrefix, options) {
      var emitter = new EventEmitter();
      var sockjs = Npm.require('sockjs');
      var prefix = pathPrefix + '/sockjs';

      RoutePolicy.declare(prefix + '/', 'network');

      var serverOptions = {
        prefix: prefix,
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
          extensions: options.websocketExtensions()
        };
      }

      var server = sockjs.createServer(serverOptions);

      // Install the sockjs handlers, but we want to keep around our own particular
      // request handler that adjusts idle timeouts while we have an outstanding
      // request.  This compensates for the fact that sockjs removes all listeners
      // for "request" to add its own.
      httpServer.removeListener(
        'request', WebApp._timeoutAdjustmentRequestCallback);
      server.installHandlers(httpServer);
      httpServer.addListener(
        'request', WebApp._timeoutAdjustmentRequestCallback);

      // Support the /websocket endpoint by redirecting to /sockjs/websocket
      redirectWebsocketEndpoint(httpServer, pathPrefix, prefix);

      server.on('connection', function (socket) {
        emitter.emit('connection', socket);
      });

      return emitter;
    }
  };
}

/**
 * Redirect /websocket to /sockjs/websocket in order to not expose
 * sockjs to clients that want to use raw websockets.
 */
function redirectWebsocketEndpoint(httpServer, pathPrefix, sockjsPrefix) {
  // Unfortunately we can't use a connect middleware here since
  // sockjs installs itself prior to all existing listeners
  // (meaning prior to any connect middlewares) so we need to take
  // an approach similar to overshadowListeners in
  // https://github.com/sockjs/sockjs-node/blob/cf820c55af6a9953e16558555a31decea554f70e/src/utils.coffee
  ['request', 'upgrade'].forEach((event) => {
    var oldHttpServerListeners = httpServer.listeners(event).slice(0);
    httpServer.removeAllListeners(event);

    // request and upgrade have different arguments passed but
    // we only care about the first one which is always request
    var newListener = function(request /*, moreArguments */) {
      // Store arguments for use within the closure below
      var args = arguments;

      // Rewrite /websocket and /websocket/ urls to /sockjs/websocket while
      // preserving query string.
      var parsedUrl = new URL(request.url, 'http://localhost');
      if (parsedUrl.pathname === pathPrefix + '/websocket' ||
          parsedUrl.pathname === pathPrefix + '/websocket/') {
        parsedUrl.pathname = sockjsPrefix + '/websocket';
        request.url = parsedUrl.pathname + parsedUrl.search;
      }
      oldHttpServerListeners.forEach(function(oldListener) {
        oldListener.apply(httpServer, args);
      });
    };
    httpServer.addListener(event, newListener);
  });
}
