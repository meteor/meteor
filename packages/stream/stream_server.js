Meteor._StreamServer = function () {
  var self = this;
  self.registration_callbacks = [];
  self.open_sockets = [];

  // unique id for this instantiation of the server. If this changes
  // between client reconnects, the client will reload. You can set the
  // environment variable "SERVER_ID" to control this. For example, if
  // you want to only force a reload on major changes, you can use a
  // custom server_id which you only change when something worth pushing
  // to clients immediately happens.
  if (process.env.SERVER_ID)
    self.server_id = process.env.SERVER_ID;
  else
    self.server_id = Meteor.uuid();

  // set up sockjs
  var sockjs = __meteor_bootstrap__.require('sockjs');
  self.server = sockjs.createServer({
    prefix: '/sockjs', log: function(){},
    // this is the default, but we code it explicitly because we depend
    // on it in stream_client:HEARTBEAT_TIMEOUT
    heartbeat_delay: 25000,
    // The default disconnect_delay is 5 seconds, but if the server ends up CPU
    // bound for that much time, SockJS might not notice that the user has
    // reconnected because the timer (of disconnect_delay ms) can fire before
    // SockJS processes the new connection. Eventually we'll fix this by not
    // combining CPU-heavy processing with SockJS termination (eg a proxy which
    // converts to Unix sockets) but for now, raise the delay.
    disconnect_delay: 60 * 1000,
    jsessionid: false});
  self.server.installHandlers(__meteor_bootstrap__.app);

  // Support the /websocket endpoint
  self._redirectWebsocketEndpoint();

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
  },

  // Redirect /websocket to /sockjs/websocket in order to not expose
  // sockjs to clients that want to use raw websockets
  _redirectWebsocketEndpoint: function() {
    // Unfortunately we can't use a connect middleware here since
    // sockjs installs itself prior to all existing listeners
    // (meaning prior to any connect middlewares) so we need to take
    // an approach similar to overshadowListeners in
    // https://github.com/sockjs/sockjs-node/blob/cf820c55af6a9953e16558555a31decea554f70e/src/utils.coffee
    _.each(['request', 'upgrade'], function(event) {
      var app = __meteor_bootstrap__.app;
      var oldAppListeners = app.listeners(event).slice(0);
      app.removeAllListeners(event);

      // request and upgrade have different arguments passed but
      // we only care about the first one which is always request
      var newListener = function(request /*, moreArguments */) {
        // Store arguments for use within the closure below
        var args = arguments;

        if (request.url === '/websocket' ||
            request.url === '/websocket/')
          request.url = '/sockjs/websocket';

        _.each(oldAppListeners, function(oldListener) {
          oldListener.apply(app, args);
        });
      };
      app.addListener(event, newListener);
    });
  }
});
