// WebSocket-Node https://github.com/Worlize/WebSocket-Node
// Chosen because it can run without native components. It has a
// somewhat idiosyncratic API. We may want to use 'ws' instead in the
// future.
var WebSocketClient = Npm.require('websocket').client;

// @param endpoint {String} URL to Meteor app
//   "http://subdomain.meteor.com/" or "/" or
//   "ddp+sockjs://foo-**.meteor.com/sockjs"
//
// -> Unlike the client, we require something of the form 'mysite.com',
// which we will map to 'ws(s)://mysite.com/websocket'
//
// We don't do any heartbeating. (The logic that did this in sockjs
// was removed, because it used a built-in sockjs mechanism. We could
// do it with WebSocket ping frames or with DDP-level messages.)
Meteor._DdpClientStream = function (endpoint) {
  var self = this;

  self.client = new WebSocketClient;
  self.endpoint = endpoint;
  self.currentConnection = null;

  self.client.on('connect', function (connection) {
    return self._onConnect(connection);
  });

  self.client.on('connectFailed', function (error) {
    // XXX: Make this do something better than make the tests hang if it does not work.
    return self._lostConnection();
  });

  self._initCommon();

  self.expectingWelcome = false;
  //// Kickoff!
  self._launchConnection();
};

_.extend(Meteor._DdpClientStream.prototype, {
  // Register for callbacks.
  on: function (name, callback) {
    var self = this;

    if (name !== 'message' && name !== 'reset' && name !== 'update_available')
      throw new Error("unknown event type: " + name);

    if (!self.eventCallbacks[name])
      self.eventCallbacks[name] = [];
    self.eventCallbacks[name].push(callback);
  },

  // data is a utf8 string. Data sent while not connected is dropped on
  // the floor, and it is up the user of this API to retransmit lost
  // messages on 'reset'
  send: function (data) {
    var self = this;
    if (self.currentStatus.connected) {
      self.currentConnection.send(data);
    }
  },

  _onConnect: function (connection) {
    var self = this;

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

    connection.on('error', function (error) {
      if (self.currentConnection !== this)
        return;

      Meteor._debug("stream error", error.toString(),
                    (new Date()).toDateString());
      self._lostConnection();
    });

    connection.on('close', function () {
      if (self.currentConnection !== this)
        return;

      self._lostConnection();
    });

    self.expectingWelcome = true;
    connection.on('message', function (message) {
      if (self.currentConnection !== this)
        return; // old connection still emitting messages

      if (self.expectingWelcome) {
        // Discard the first message that comes across the
        // connection. It is the hot code push version identifier and
        // is not actually part of DDP.
        self.expectingWelcome = false;
        return;
      }

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
      self.currentConnection.close();
      self.currentConnection = null;
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
    self.client.connect(Meteor._DdpClientStream._toWebsocketUrl(self.endpoint));

    if (self.connectionTimer)
      clearTimeout(self.connectionTimer);
    self.connectionTimer = setTimeout(
      _.bind(self._lostConnection, self),
      self.CONNECT_TIMEOUT);
  }
});
