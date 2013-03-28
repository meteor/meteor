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
  self.eventCallbacks = {}; // name -> [callback]
  self._forcedToDisconnect = false;

  self.client.on('connect', function (connection) {
    return self._onConnect(connection);
  });

  //// Constants

  // how long to wait until we declare the connection attempt
  // failed.
  self.CONNECT_TIMEOUT = 10000;

  // time for initial reconnect attempt.
  self.RETRY_BASE_TIMEOUT = 1000;
  // exponential factor to increase timeout each attempt.
  self.RETRY_EXPONENT = 2.2;
  // maximum time between reconnects.
  self.RETRY_MAX_TIMEOUT = 1800000; // 30min.
  // time to wait for the first 2 retries.  this helps page reload
  // speed during dev mode restarts, but doesn't hurt prod too
  // much (due to CONNECT_TIMEOUT)
  self.RETRY_MIN_TIMEOUT = 10;
  // how many times to try to reconnect 'instantly'
  self.RETRY_MIN_COUNT = 2;
  // fuzz factor to randomize reconnect times by. avoid reconnect
  // storms.
  self.RETRY_FUZZ = 0.5; // +- 25%

  //// Reactive status
  self.currentStatus = {
    status: "connecting", connected: false, retryCount: 0
  };

  self.statusListeners = typeof Deps !== 'undefined' && new Deps.Dependency;
  self.statusChanged = function () {
    if (self.statusListeners)
      self.statusListeners.changed();
  };
  self.expectingWelcome = false;

  //// Retry logic
  self.retryTimer = null;
  self.connectionTimer = null;

  //// Kickoff!
  self._launchConnection();
};

_.extend(Meteor._DdpClientStream, {
  _endpointToUrl: function (endpoint) {
    // XXX should be secure!
    // among other problems
    endpoint = endpoint.replace(/^http(s)?:\/\//, "");
    endpoint = endpoint.replace(/\/$/, "");
    return 'ws://' + endpoint + '/websocket';
  }
});

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

  // Get current status. Reactive.
  status: function () {
    var self = this;
    if (self.statusListeners)
      self.statusListeners.depend();
    return self.currentStatus;
  },

  // Trigger a reconnect.
  reconnect: function (options) {
    var self = this;

    if (self.currentStatus.connected) {
      if (options && options._force) {
        // force reconnect.
        self._lostConnection();
      } // else, noop.
      return;
    }

    // if we're mid-connection, stop it.
    if (self.currentStatus.status === "connecting") {
      self._lostConnection();
    }

    if (self.retryTimer)
      clearTimeout(self.retryTimer);
    self.retryTimer = null;
    self.currentStatus.retryCount -= 1; // don't count manual retries
    self._retryNow();
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

  _cleanupConnection: function () {
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

  forceDisconnect: function (optionalErrorMessage) {
    var self = this;
    self._forcedToDisconnect = true;
    self._cleanupConnection();
    if (self.retryTimer) {
      clearTimeout(self.retryTimer);
      self.retryTimer = null;
    }
    self.currentStatus = {
      status: "failed",
      connected: false,
      retryCount: 0,
      // XXX Backwards compatibility only. Remove this before 1.0.
      retry_count: 0
    };
    if (optionalErrorMessage)
      self.currentStatus.reason = optionalErrorMessage;
    self.statusChanged();
  },

  _lostConnection: function () {
    var self = this;
    self._cleanupConnection();
    self._retryLater();
  },

  _retryTimeout: function (count) {
    var self = this;

    if (count < self.RETRY_MIN_COUNT)
      return self.RETRY_MIN_TIMEOUT;

    var timeout = Math.min(
      self.RETRY_MAX_TIMEOUT,
      self.RETRY_BASE_TIMEOUT * Math.pow(self.RETRY_EXPONENT, count));
    // fuzz the timeout randomly, to avoid reconnect storms when a
    // server goes down.
    timeout = timeout * ((Random.fraction() * self.RETRY_FUZZ) +
                         (1 - self.RETRY_FUZZ/2));
    return timeout;
  },

  _retryLater: function () {
    var self = this;

    var timeout = self._retryTimeout(self.currentStatus.retryCount);
    if (self.retryTimer)
      clearTimeout(self.retryTimer);
    self.retryTimer = setTimeout(_.bind(self._retryNow, self), timeout);

    self.currentStatus.status = "waiting";
    self.currentStatus.connected = false;
    self.currentStatus.retryTime = (new Date()).getTime() + timeout;
    self.statusChanged();
  },

  _retryNow: function () {
    var self = this;

    if (self._forcedToDisconnect)
      return;

    self.currentStatus.retryCount += 1;
    self.currentStatus.status = "connecting";
    self.currentStatus.connected = false;
    delete self.currentStatus.retryTime;
    self.statusChanged();

    self._launchConnection();
  },

  _launchConnection: function () {
    var self = this;
    self._cleanupConnection(); // cleanup the old socket, if there was one.

    // launch a connect attempt. we have no way to track it. we either
    // get an _onConnect event, or we don't.

    // XXX: set up a timeout on this.

    // we would like to specify 'ddp' as the protocol here, but
    // unfortunately WebSocket-Node fails the handshake if we ask for
    // a protocol and the server doesn't send one back (and sockjs
    // doesn't). also, related: I guess we have to accept that
    // 'stream' is ddp-specific
    self.client.connect(Meteor._DdpClientStream._endpointToUrl(self.endpoint));

    if (self.connectionTimer)
      clearTimeout(self.connectionTimer);
    self.connectionTimer = setTimeout(
      _.bind(self._lostConnection, self),
      self.CONNECT_TIMEOUT);
  }
});
