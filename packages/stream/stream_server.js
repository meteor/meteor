Meteor._StreamServer = function () {
  var self = this;
  self.registration_callbacks = [];
  self.open_sockets = [];

  // unique id for this instantiation of the server. If this changes
  // between client reconnects, the client will reload. In production,
  // we might want to make this the bundle id, so that if runner restarts
  // we don't force clients to reload unneccesarily. Or we could integrate
  // with the bundler and have this be a hash of all the code.
  self.server_id = Meteor.uuid();

  // set up socket.io
  var sockjs = __meteor_bootstrap__.require('sockjs');
  self.server = sockjs.createServer({
    prefix: '/sockjs', websocket: false, log: function(){},
    jsessionid: false});
  self.server.installHandlers(__meteor_bootstrap__.app);

  self.server.on('connection', function (socket) {
    socket.send = function (data) {
      socket.write(data);
    };
    socket.on('close', function () {
      self.open_sockets = _.without(self.open_sockets, socket);
    });
    self.open_sockets.push(socket);


    // Send a welcome message with the server_id. Client uses this to
    // reload if needed.
    socket.send(JSON.stringify({server_id: self.server_id}));

    // call all our callbacks when we get a new socket. they will do the
    // work of setting up handlers and such for specific messages.
    _.each(self.registration_callbacks, function (callback) {
      callback(socket);
    });
  });

};

_.extend(Meteor._StreamServer.prototype, {
  // call my callback when a new socket connects.
  // also call it for all current connections.
  register: function (callback) {
    var self = this;
    self.registration_callbacks.push(callback);
    _.each(self.all_sockets(), function (socket) {
      callback(socket);
    });
  },

  // get a list of all sockets
  all_sockets: function () {
    var self = this;
    return _.values(self.open_sockets);
  }
});
