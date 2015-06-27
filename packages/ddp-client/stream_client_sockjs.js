// @param url {String} URL to Meteor app
//   "http://subdomain.meteor.com/" or "/" or
//   "ddp+sockjs://foo-**.meteor.com/sockjs"
LivedataTest.ClientStream = function (url, options) {
  var self = this;
  self.options = _.extend({
    retry: true
  }, options);
  self._initCommon(self.options);

  //// Constants


  // how long between hearing heartbeat from the server until we declare
  // the connection dead. heartbeats come every 45s (stream_server.js)
  //
  // NOTE: this is a older timeout mechanism. We now send heartbeats at
  // the DDP level (https://github.com/meteor/meteor/pull/1865), and
  // expect those timeouts to kill a non-responsive connection before
  // this timeout fires. This is kept around for compatibility (when
  // talking to a server that doesn't support DDP heartbeats) and can be
  // removed later.
  self.HEARTBEAT_TIMEOUT = 100*1000;

  self.rawUrl = url;
  self.socket = null;

  self.heartbeatTimer = null;

  // Listen to global 'online' event if we are running in a browser.
  // (IE8 does not support addEventListener)
  if (typeof window !== 'undefined' && window.addEventListener)
    window.addEventListener("online", _.bind(self._online, self),
                            false /* useCapture. make FF3.6 happy. */);

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
      self.socket.send(data);
    }
  },

  // Changes where this connection points
  _changeUrl: function (url) {
    var self = this;
    self.rawUrl = url;
  },

  _connected: function () {
    var self = this;

    if (self.connectionTimer) {
      clearTimeout(self.connectionTimer);
      self.connectionTimer = null;
    }

    if (self.currentStatus.connected) {
      // already connected. do nothing. this probably shouldn't happen.
      return;
    }

    // update status
    self.currentStatus.status = "connected";
    self.currentStatus.connected = true;
    self.currentStatus.retryCount = 0;
    self.statusChanged();

    // fire resets. This must come after status change so that clients
    // can call send from within a reset callback.
    _.each(self.eventCallbacks.reset, function (callback) { callback(); });

  },

  _cleanup: function (maybeError) {
    var self = this;

    self._clearConnectionAndHeartbeatTimers();
    if (self.socket) {
      self.socket.onmessage = self.socket.onclose
        = self.socket.onerror = self.socket.onheartbeat = function () {};
      self.socket.close();
      self.socket = null;
    }

    _.each(self.eventCallbacks.disconnect, function (callback) {
      callback(maybeError);
    });
  },

  _clearConnectionAndHeartbeatTimers: function () {
    var self = this;
    if (self.connectionTimer) {
      clearTimeout(self.connectionTimer);
      self.connectionTimer = null;
    }
    if (self.heartbeatTimer) {
      clearTimeout(self.heartbeatTimer);
      self.heartbeatTimer = null;
    }
  },

  _heartbeat_timeout: function () {
    var self = this;
    Meteor._debug("Connection timeout. No sockjs heartbeat received.");
    self._lostConnection(new DDP.ConnectionError("Heartbeat timed out"));
  },

  _heartbeat_received: function () {
    var self = this;
    // If we've already permanently shut down this stream, the timeout is
    // already cleared, and we don't need to set it again.
    if (self._forcedToDisconnect)
      return;
    if (self.heartbeatTimer)
      clearTimeout(self.heartbeatTimer);
    self.heartbeatTimer = setTimeout(
      _.bind(self._heartbeat_timeout, self),
      self.HEARTBEAT_TIMEOUT);
  },

  _sockjsProtocolsWhitelist: function () {
    // only allow polling protocols. no streaming.  streaming
    // makes safari spin.
    var protocolsWhitelist = [
      'xdr-polling', 'xhr-polling', 'iframe-xhr-polling', 'jsonp-polling'];

    // iOS 4 and 5 and below crash when using websockets over certain
    // proxies. this seems to be resolved with iOS 6. eg
    // https://github.com/LearnBoost/socket.io/issues/193#issuecomment-7308865.
    //
    // iOS <4 doesn't support websockets at all so sockjs will just
    // immediately fall back to http
    var noWebsockets = navigator &&
          /iPhone|iPad|iPod/.test(navigator.userAgent) &&
          /OS 4_|OS 5_/.test(navigator.userAgent);

    if (!noWebsockets)
      protocolsWhitelist = ['websocket'].concat(protocolsWhitelist);

    return protocolsWhitelist;
  },

  _launchConnection: function () {
    var self = this;
    self._cleanup(); // cleanup the old socket, if there was one.

    var options = _.extend({
      protocols_whitelist:self._sockjsProtocolsWhitelist()
    }, self.options._sockjsOptions);

    // Convert raw URL to SockJS URL each time we open a connection, so that we
    // can connect to random hostnames and get around browser per-host
    // connection limits.
    self.socket = new SockJS(toSockjsUrl(self.rawUrl), undefined, options);
    self.socket.onopen = function (data) {
      self._connected();
    };
    self.socket.onmessage = function (data) {
      self._heartbeat_received();

      if (self.currentStatus.connected)
        _.each(self.eventCallbacks.message, function (callback) {
          callback(data.data);
        });
    };
    self.socket.onclose = function () {
      self._lostConnection();
    };
    self.socket.onerror = function () {
      // XXX is this ever called?
      Meteor._debug("stream error", _.toArray(arguments), (new Date()).toDateString());
    };

    self.socket.onheartbeat =  function () {
      self._heartbeat_received();
    };

    if (self.connectionTimer)
      clearTimeout(self.connectionTimer);
    self.connectionTimer = setTimeout(function () {
      self._lostConnection(
        new DDP.ConnectionError("DDP connection timed out"));
    }, self.CONNECT_TIMEOUT);
  }
});
