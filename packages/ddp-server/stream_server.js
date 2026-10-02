import once from 'lodash.once';
import zlib from 'node:zlib';
import { getTransport } from './transports/index.js';

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

  var websocketCompressionConfig = process.env.SERVER_WEBSOCKET_COMPRESSION ?
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

var pathPrefix = __meteor_runtime_config__.ROOT_URL_PATH_PREFIX ||  "";

StreamServer = function () {
  var self = this;
  self.registration_callbacks = [];
  self.open_sockets = [];

  // Resolve and set up the configured transport.
  var transport = getTransport();
  var emitter = transport.setup(WebApp.httpServer, pathPrefix, {
    websocketExtensions: websocketExtensions,
  });

  emitter.on('connection', function (socket) {
    self._onConnection(socket);
  });
};

Object.assign(StreamServer.prototype, {
  // Shared connection handler used by all transports.
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
    // WebSocket libraries call setTimeout(0) on any socket they take over,
    // so there is an "in between" state where this doesn't happen.  We work
    // around this by explicitly setting the socket timeout to a relatively
    // large time here, and setting it back to zero when we set up the
    // heartbeat in livedata_server.js.
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
});
