if (typeof Meteor === "undefined") Meteor = {};

Meteor._StreamServer = function () {
  var self = this;
  self.registration_callbacks = [];

  // unique id for this instantiation of the server. If this changes
  // between client reconnects, the client will reload. In production,
  // we might want to make this the bundle id, so that if runner restarts
  // we don't force clients to reload unneccesarily. Or we could integrate
  // with the bundler and have this be a hash of all the code.
  self.server_id = Meteor.uuid();

  // set up socket.io
  var socketio = __meteor_bootstrap__.require('socket.io');

  self.io = socketio.listen(__meteor_bootstrap__.app);
  self.io.configure(function() {
    // Don't serve static files from socket.io. We serve them separately
    // to get gzip and other fun things.
    self.io.set('browser client', false);

    self.io.set('log level', 1);
    // XXX disable websockets! they break chrome both debugging
    // and node-http-proxy (used in outer app)
    self.io.set('transports', _.without(self.io.transports(), 'websocket'));
  });

  self.io.sockets.on('connection', function (socket) {
    // Send a welcome message with the server_id. Client uses this to
    // reload if needed.
    socket.emit('welcome', {server_id: self.server_id});

    // call all our callbacks when we get a new socket. they will do the
    // work of setting up handlers and such for specific messages.
    _.each(self.registration_callbacks, function (callback) {
      callback(socket);
    });

    // unwrap messages from the client and dispatch them as if they were
    // sent with 'emit'.
    socket.on('message', function (msg) {
      socket.$emit.apply(socket, msg);
    });
  });
};

_.extend(Meteor._StreamServer.prototype, {
  // call my callback when a new socket connects.
  // also call it for all current connections.
  register: function (callback) {
    var self = this;
    self.registration_callbacks.push(callback);
    _.each(self.io.sockets.sockets, function (socket) {
      callback(socket);
    });
  },

  // get a list of all sockets
  all_sockets: function () {
    var self = this;
    return self.io.sockets.sockets;
  }
});
