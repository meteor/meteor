// @param endpoint {String} URL to Meteor app
//   "http://subdomain.meteor.com/" or "/" or
//   "ddp+sockjs://foo-**.meteor.com/sockjs"
//
// We do some rewriting of the URL to eventually make it "ws://" or "wss://",
// whatever was passed in.  At the very least, what Meteor.absoluteUrl() returns
// us should work.
//
// We don't do any heartbeating. (The logic that did this in sockjs was removed,
// because it used a built-in sockjs mechanism. We could do it with WebSocket
// ping frames or with DDP-level messages.)
LivedataTest.ClientStream = function (endpoint, options) {
  var self = this;
  self.options = _.extend({
    retry: true
  }, options);

  // WebSocket-Node https://github.com/Worlize/WebSocket-Node
  // Chosen because it can run without native components. It has a
  // somewhat idiosyncratic API. We may want to use 'ws' instead in the
  // future.
  //
  // Since server-to-server DDP is still an experimental feature, we only
  // require the module if we actually create a server-to-server
  // connection. This is a minor efficiency improvement, but moreover: while
  // 'websocket' doesn't require native components, it tries to use some
  // optional native components and prints a warning if it can't load
  // them. Since native components in packages don't work when transferred to
  // other architectures yet, this means that require('websocket') prints a
  // spammy log message when deployed to another architecture. Delaying the
  // require means you only get the log message if you're actually using the
  // feature.
  self.client = new (Npm.require('websocket').client)();
  self.endpoint = endpoint;
  self.currentConnection = null;

  self.client.on('connect', Meteor.bindEnvironment(
    function (connection) {
      return self._onConnect(connection);
    },
    "stream connect callback"
  ));

  self.client.on('connectFailed', function (error) {
    // XXX: Make this do something better than make the tests hang if it does not work.
    return self._lostConnection();
  });

  self._initCommon();

  //// Kickoff!
  self._launchConnection();
};

_.extend(LivedataTest.ClientStream.prototype, {

  // data is a utf8 string. Data sent while not connected is dropped on
  // the floor, and it is up the user of this API to retransmit lost
  // messages on 'reset'
  send: function (data) {
    var self = this;
    if (self.currentStatus.connected) {
      self.currentConnection.send(data);
    }
  },

  // Changes where this connection points
  _changeUrl: function (url) {
    var self = this;
    self.endpoint = url;
  },

  _onConnect: function (connection) {
    var self = this;

    if (self._forcedToDisconnect) {
      // We were asked to disconnect between trying to open the connection and
      // actually opening it. Let's just pretend this never happened.
      connection.close();
      return;
    }

    if (self.currentStatus.connected) {
      // We already have a connection. It must have been the case that
      // we started two parallel connection attempts (because we
      // wanted to 'reconnect now' on a hanging connection and we had
      // no way to cancel the connection attempt.) Just ignore/close
      // the latecomer.
      connection.close();
      return;
    }

    if (self.connectionTimer) {
      clearTimeout(self.connectionTimer);
      self.connectionTimer = null;
    }

    var onError = Meteor.bindEnvironment(
      function (_this, error) {
        if (self.currentConnection !== _this)
          return;

        Meteor._debug("stream error", error.toString(),
                      (new Date()).toDateString());
        self._lostConnection();
      },
      "stream error callback"
    );

    connection.on('error', function (error) {
      // We have to pass in `this` explicitly because bindEnvironment
      // doesn't propagate it for us.
      onError(this, error);
    });

    var onClose = Meteor.bindEnvironment(
      function (_this) {
        if (self.options._testOnClose)
          self.options._testOnClose();

        if (self.currentConnection !== _this)
          return;

        self._lostConnection();
      },
      "stream close callback"
    );

    connection.on('close', function () {
      // We have to pass in `this` explicitly because bindEnvironment
      // doesn't propagate it for us.
      onClose(this);
    });

    connection.on('message', function (message) {
      if (self.currentConnection !== this)
        return; // old connection still emitting messages

      if (message.type === "utf8") // ignore binary frames
        _.each(self.eventCallbacks.message, function (callback) {
          callback(message.utf8Data);
        });
    });

    // update status
    self.currentConnection = connection;
    self.currentStatus.status = "connected";
    self.currentStatus.connected = true;
    self.currentStatus.retryCount = 0;
    self.statusChanged();

    // fire resets. This must come after status change so that clients
    // can call send from within a reset callback.
    _.each(self.eventCallbacks.reset, function (callback) { callback(); });
  },

  _cleanup: function () {
    var self = this;

    self._clearConnectionTimer();
    if (self.currentConnection) {
      var conn = self.currentConnection;
      self.currentConnection = null;
      conn.close();
    }
  },

  _clearConnectionTimer: function () {
    var self = this;

    if (self.connectionTimer) {
      clearTimeout(self.connectionTimer);
      self.connectionTimer = null;
    }
  },

  _launchConnection: function () {
    var self = this;
    self._cleanup(); // cleanup the old socket, if there was one.

    // launch a connect attempt. we have no way to track it. we either
    // get an _onConnect event, or we don't.

    // XXX: set up a timeout on this.

    // we would like to specify 'ddp' as the protocol here, but
    // unfortunately WebSocket-Node fails the handshake if we ask for
    // a protocol and the server doesn't send one back (and sockjs
    // doesn't). also, related: I guess we have to accept that
    // 'stream' is ddp-specific
    self.client.connect(toWebsocketUrl(self.endpoint));

    if (self.connectionTimer)
      clearTimeout(self.connectionTimer);
    self.connectionTimer = setTimeout(
      _.bind(self._lostConnection, self),
      self.CONNECT_TIMEOUT);
  }
});
