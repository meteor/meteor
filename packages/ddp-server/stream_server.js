const Primus = require('primus');

var pathPrefix = __meteor_runtime_config__.ROOT_URL_PATH_PREFIX ||  "";

StreamServer = function () {
  var self = this;
  self.registration_callbacks = [];
  self.open_sockets = [];

  // Because we are installing directly onto WebApp.httpServer instead of using
  // WebApp.app, we have to process the path prefix ourselves.
  self.prefix = pathPrefix + '/sockjs';
  RoutePolicy.declare(self.prefix + '/', 'network');

  var primusOptions = {
    transformer: 'sockjs',
    pathname: self.prefix,
    // this is the default, but we code it explicitly because we depend
    // on it in stream_client:HEARTBEAT_TIMEOUT
    // If you were to pass heartbeat_delay directly to SockJS, instead of Primus pingInterval
    // you would need to modify the transport object in the primusOptions.
    // However, doing so would make the code more specific to SockJS and less flexible
    // if you decide to switch to a different transport library in the future.
    pingInterval: 45000,
    transport: {
    log: function() {},
    // The default disconnect_delay is 5 seconds, but if the server ends up CPU
    // bound for that much time, SockJS might not notice that the user has
    // reconnected because the timer (of disconnect_delay ms) can fire before
    // SockJS processes the new connection. Eventually we'll fix this by not
    // combining CPU-heavy processing with SockJS termination (eg a proxy which
    // converts to Unix sockets) but for now, raise the delay.
    disconnect_delay: 60 * 1000,
    // Set the USE_JSESSIONID environment variable to enable setting the
    // JSESSIONID cookie. This is useful for setting up proxies with
    // session affinity.
    jsessionid: !!process.env.USE_JSESSIONID,
    // If you know your server environment (eg, proxies) will prevent websockets
    // from ever working, set $DISABLE_WEBSOCKETS and SockJS clients (ie,
    // browsers) will not waste time attempting to use them.
    // (Your server will still have a /websocket endpoint.)
    websocket: !!process.env.DISABLE_WEBSOCKETS
    },
    compression: !!process.env.SERVER_WEBSOCKET_COMPRESSION
  };

  self.server = new Primus(WebApp.httpServer, primusOptions);
  
  }


  // Install the sockjs handlers, but we want to keep around our own particular
  // request handler that adjusts idle timeouts while we have an outstanding
  // request.  This compensates for the fact that sockjs removes all listeners
  // for "request" to add its own.
  WebApp.httpServer.removeListener(
    'request', WebApp._timeoutAdjustmentRequestCallback);
  self.server.installHandlers(WebApp.httpServer);
  WebApp.httpServer.addListener(
    'request', WebApp._timeoutAdjustmentRequestCallback);

  self.server.on('connection', function (socket) {
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
    socket.setWebsocketTimeout = function (timeout) {
      if ((socket.protocol === 'websocket' ||
           socket.protocol === 'websocket-raw')
          && socket._session.recv) {
        socket._session.recv.connection.setTimeout(timeout);
      }
    };
    socket.setWebsocketTimeout(45 * 1000);

    socket.send = function (data) {
      socket.write(data);
    };
    socket.on('close', function () {
      self.open_sockets = _.without(self.open_sockets, socket);
    });
    self.open_sockets.push(socket);

    // only to send a message after connection on tests, useful for
    // socket-stream-client/server-tests.js
    if (process.env.TEST_METADATA && process.env.TEST_METADATA !== "{}") {
      socket.send(JSON.stringify({ testMessageOnConnect: true }));
    }

    // call all our callbacks when we get a new socket. they will do the
    // work of setting up handlers and such for specific messages.
    _.each(self.registration_callbacks, function (callback) {
      callback(socket);
    });
  });

};

Object.assign(StreamServer.prototype, {
  // call my callback when a new socket connects.
  // also call it for all current connections.
  register: function (callback) {
    var self = this;
    self.registration_callbacks.push(callback);
    self.server.forEach(function (socket) {
      callback(socket);
    });
  }
});
