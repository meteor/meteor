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
  options = options || {};

  self.options = _.extend({
    retry: true
  }, options);

  self.client = null;  // created in _launchConnection
  self.endpoint = endpoint;

  self.headers = self.options.headers || {};

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
      self.client.send(data);
    }
  },

  // Changes where this connection points
  _changeUrl: function (url) {
    var self = this;
    self.endpoint = url;
  },

  _onConnect: function (client) {
    var self = this;

    if (client !== self.client) {
      // This connection is not from the last call to _launchConnection.
      // But _launchConnection calls _cleanup which closes previous connections.
      // It's our belief that this stifles future 'open' events, but maybe
      // we are wrong?
      throw new Error("Got open from inactive client");
    }

    if (self._forcedToDisconnect) {
      // We were asked to disconnect between trying to open the connection and
      // actually opening it. Let's just pretend this never happened.
      self.client.close();
      self.client = null;
      return;
    }

    if (self.currentStatus.connected) {
      // We already have a connection. It must have been the case that we
      // started two parallel connection attempts (because we wanted to
      // 'reconnect now' on a hanging connection and we had no way to cancel the
      // connection attempt.) But this shouldn't happen (similarly to the client
      // !== self.client check above).
      throw new Error("Two parallel connections?");
    }

    self._clearConnectionTimer();

    // update status
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
    if (self.client) {
      var client = self.client;
      self.client = null;
      client.close();
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

    // Since server-to-server DDP is still an experimental feature, we only
    // require the module if we actually create a server-to-server
    // connection.
    var FayeWebSocket = Npm.require('faye-websocket');

    // We would like to specify 'ddp' as the subprotocol here. The npm module we
    // used to use as a client would fail the handshake if we ask for a
    // subprotocol and the server doesn't send one back (and sockjs doesn't).
    // Faye doesn't have that behavior; it's unclear from reading RFC 6455 if
    // Faye is erroneous or not.  So for now, we don't specify protocols.
    var client = self.client = new FayeWebSocket.Client(
      toWebsocketUrl(self.endpoint),
      [/*no subprotocols*/],
      {headers: self.headers}
    );

    self._clearConnectionTimer();
    self.connectionTimer = Meteor.setTimeout(
      _.bind(self._lostConnection, self),
      self.CONNECT_TIMEOUT);

    self.client.on('open', Meteor.bindEnvironment(function () {
      return self._onConnect(client);
    }, "stream connect callback"));

    var clientOnIfCurrent = function (event, description, f) {
      self.client.on(event, Meteor.bindEnvironment(function () {
        // Ignore events from any connection we've already cleaned up.
        if (client !== self.client)
          return;
        f.apply(this, arguments);
      }, description));
    };

    clientOnIfCurrent('error', 'stream error callback', function (error) {
      if (!self.options._dontPrintErrors)
        Meteor._debug("stream error", error.message);

      // XXX: Make this do something better than make the tests hang if it does
      // not work.
      self._lostConnection();
    });


    clientOnIfCurrent('close', 'stream close callback', function () {
      self._lostConnection();
    });


    clientOnIfCurrent('message', 'stream message callback', function (message) {
      // Ignore binary frames, where message.data is a Buffer
      if (typeof message.data !== "string")
        return;

      _.each(self.eventCallbacks.message, function (callback) {
        callback(message.data);
      });
    });
  }
});
