import once from 'lodash.once';
import { EventEmitter } from 'events';

var pathPrefix = __meteor_runtime_config__.ROOT_URL_PATH_PREFIX || "";

StreamServer = function () {
  var self = this;
  self.registration_callbacks = [];
  self.open_sockets = [];

  self.prefix = pathPrefix + '/sockjs';
  RoutePolicy.declare(self.prefix + '/', 'network');

  // Native WebSocket via http 'upgrade' event — no SockJS
  WebApp.httpServer.on('upgrade', function (req, socket, head) {
    var url = Npm.require('url');
    var parsedUrl = url.parse(req.url);
    var pathname = parsedUrl.pathname;

    if (pathname === pathPrefix + '/websocket' ||
        pathname === pathPrefix + '/websocket/' ||
        pathname === self.prefix + '/websocket' ||
        (pathname.includes('/sockjs/') && pathname.endsWith('/websocket'))) {

      if (!self._wss) {
        var WebSocketServer = Npm.require('ws').WebSocketServer;
        self._wss = new WebSocketServer({ noServer: true });
      }

      self._wss.handleUpgrade(req, socket, head, function (ws) {
        var meteorSocket = new EventEmitter();
        meteorSocket.send = function (data) { try { ws.send(data); } catch(e) {} };
        meteorSocket.write = meteorSocket.send;
        meteorSocket.close = function () { ws.close(); };
        meteorSocket.setWebsocketTimeout = function () {};
        meteorSocket.headers = req.headers || {};
        meteorSocket.remoteAddress = req.socket?.remoteAddress || '127.0.0.1';
        meteorSocket.url = req.url;
        meteorSocket.protocol = 'websocket-raw';
        meteorSocket._meteorSession = null;

        ws.on('message', function (data) {
          meteorSocket.emit('data', data.toString());
        });

        ws.on('close', function () {
          meteorSocket.emit('close');
        });

        ws.on('error', function () {
          meteorSocket.emit('close');
        });

        // Reuse the same connection handler as SockJS did
        self._onConnection(meteorSocket);
      });
    }
  });
};

Object.assign(StreamServer.prototype, {
  _onConnection(socket) {
    var self = this;
    if (!socket) return;

    if (!socket.setWebsocketTimeout) {
      socket.setWebsocketTimeout = function () {};
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

    if (process.env.TEST_METADATA && process.env.TEST_METADATA !== "{}") {
      socket.send(JSON.stringify({ testMessageOnConnect: true }));
    }

    self.registration_callbacks.forEach(function (callback) {
      callback(socket);
    });
  },

  register: function (callback) {
    var self = this;
    self.registration_callbacks.push(callback);
    self.all_sockets().forEach(function (socket) {
      callback(socket);
    });
  },

  all_sockets: function () {
    var self = this;
    return Object.values(self.open_sockets);
  },
});
