StreamServer = function () {
  var self = this;
  self.registrationCallbacks = [];
  self.openSockets = new Set();
  self.closeListeners = new Map()
  self.messageListeners = new Map()

  // set up uWebSockets
  const uws = Npm.require('uWebSockets.js');
  self.uwsApp = uws.App();
  const uwsPort = +process.env.WEBSOCKETS_PORT || 5001;

  self.uwsApp.get('/*', function(res) {
    res.end('OK');
  })

  self.uwsApp.ws('/*', {
    maxBackpressure: 16 * 1024 * 1024,
    maxPayloadLength: (+process.env.WEBSOCKETS_PAYLOAD_LENGTH || 48) * 1024,

    open(socket) {
      socket.on = function(event, callback) {
        if (event === 'close') {
          self.closeListeners.set(socket, callback)
        } else if (event === 'data') {
          self.messageListeners.set(socket, callback)
        }
      }

      for (const callback of self.registrationCallbacks) {
        callback(socket);
      }

      self.openSockets.add(socket);

      socket.setWebsocketTimeout = function (timeout) {
        if ((socket.protocol === 'websocket' || socket.protocol === 'websocket-raw') && socket._session.recv) {
          socket._session.recv.connection.setTimeout(timeout);
        }
      };

      socket.setWebsocketTimeout(45 * 1000);
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
      socket.isClosed = true
      self.openSockets.delete(socket);
      self.closeListeners.get(socket)();
    },

    message(socket, data) {
      const message = Buffer.from(data).toString();
      self.messageListeners.get(socket)(message);
    }
  })

  WebApp.onListening(() => {
    self.uwsApp.listen(uwsPort, (listenSocket) => {
      if (listenSocket) {
        console.log(`uWebSockets.js listening to port ${uwsPort} (maxPayloadLength=${process.env.WEBSOCKETS_PAYLOAD_LENGTH || 48})`);
      } else {
        throw new Error(`uWebSockets.js could not listen to port ${uwsPort}!`);
      }
    });
  })
};

Object.assign(StreamServer.prototype, {
  // call my callback when a new socket connects.
  // also call it for all current connections.
  register: function (callback) {
    this.registrationCallbacks.push(callback);

    for (const socket of this.openSockets) {
      callback(socket);
    }
  }
});
