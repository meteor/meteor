// @param url {String} URL to Meteor app
//   "http://subdomain.meteor.com/" or "/" or
//   "ddp+sockjs://foo-**.meteor.com/sockjs"
Meteor._Stream = function (url) {
  var self = this;

  self.rawUrl = url;
  self.socket = null;
  self.event_callbacks = {}; // name -> [callback]
  self.sent_update_available = false;
  self._forcedToDisconnect = false;

  //// Constants

  // how long to wait until we declare the connection attempt
  // failed.
  self.CONNECT_TIMEOUT = 10000;
  // how long between hearing heartbeat from the server until we declare
  // the connection dead. heartbeats come every 25s (stream_server.js)
  //
  // NOTE: this is a workaround until sockjs detects heartbeats on the
  // client automatically.
  // https://github.com/sockjs/sockjs-client/issues/67
  // https://github.com/sockjs/sockjs-node/issues/68
  self.HEARTBEAT_TIMEOUT = 60000;

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
  self.current_status = {
    status: "connecting", connected: false, retryCount: 0,
    // XXX Backwards compatibility only. Remove this before 1.0.
    retry_count: 0
  };

  self.status_listeners = window.Deps && new Deps.Dependency;
  self.status_changed = function () {
    if (self.status_listeners)
      self.status_listeners.changed();
  };

  //// Retry logic
  self.retry_timer = null;
  self.connection_timer = null;
  self.heartbeat_timer = null;

  //// Kickoff!
  self._launch_connection();
};

_.extend(Meteor._Stream, {
  // @param url {String} URL to Meteor app, eg:
  //   "/" or "madewith.meteor.com" or "https://foo.meteor.com"
  //   or "ddp+sockjs://ddp--****-foo.meteor.com/sockjs"
  // @returns {String} URL to the sockjs endpoint, e.g.
  //   "http://subdomain.meteor.com/sockjs" or "/sockjs"
  //   or "https://ddp--1234-foo.meteor.com/sockjs"
  _toSockjsUrl: function(url) {
    // XXX from Underscore.String (http://epeli.github.com/underscore.string/)
    var startsWith = function(str, starts) {
      return str.length >= starts.length &&
        str.substring(0, starts.length) === starts;
    };
    var endsWith = function(str, ends) {
      return str.length >= ends.length &&
        str.substring(str.length - ends.length) === ends;
    };

    var ddpUrlMatch = url.match(/^ddp(i?)\+sockjs:\/\//);
    if (ddpUrlMatch) {
      // Remove scheme and split off the host.
      var urlAfterDDP = url.substr(ddpUrlMatch[0].length);
      var newScheme = ddpUrlMatch[1] === 'i' ? 'http' : 'https';
      var slashPos = urlAfterDDP.indexOf('/');
      var host =
            slashPos === -1 ? urlAfterDDP : urlAfterDDP.substr(0, slashPos);
      var rest = slashPos === -1 ? '' : urlAfterDDP.substr(slashPos);

      // In the host (ONLY!), change '*' characters into random digits. This
      // allows different stream connections to connect to different hostnames
      // and avoid browser per-hostname connection limits.
      host = host.replace(/\*/g, function () {
        return Math.floor(Random.fraction()*10);
      });

      return newScheme + '://' + host + rest;
    }

    // Prefix FQDNs but not relative URLs
    if (url.indexOf("://") === -1 && !startsWith(url, "/")) {
      url = "http://" + url;
    }

    if (endsWith(url, "/"))
      return url + "sockjs";
    else
      return url + "/sockjs";
  }
});

_.extend(Meteor._Stream.prototype, {
  // Register for callbacks.
  on: function (name, callback) {
    var self = this;

    if (name !== 'message' && name !== 'reset' && name !== 'update_available')
      throw new Error("unknown event type: " + name);

    if (!self.event_callbacks[name])
      self.event_callbacks[name] = [];
    self.event_callbacks[name].push(callback);
  },

  // data is a utf8 string. Data sent while not connected is dropped on
  // the floor, and it is up the user of this API to retransmit lost
  // messages on 'reset'
  send: function (data) {
    var self = this;
    if (self.current_status.connected) {
      self.socket.send(data);
    }
  },

  // Get current status. Reactive.
  status: function () {
    var self = this;
    if (self.status_listeners)
      Deps.depend(self.status_listeners);
    return self.current_status;
  },

  // Trigger a reconnect.
  reconnect: function (options) {
    var self = this;

    if (self.current_status.connected) {
      if (options && options._force) {
        // force reconnect.
        self._lostConnection();
      } // else, noop.
      return;
    }

    // if we're mid-connection, stop it.
    if (self.current_status.status === "connecting") {
      self._lostConnection();
    }

    if (self.retry_timer)
      clearTimeout(self.retry_timer);
    self.retry_timer = null;
    self.current_status.retryCount -= 1; // don't count manual retries
    // XXX Backwards compatibility only. Remove this before 1.0.
    self.current_status.retry_count = self.current_status.retryCount;
    self._retry_now();
  },

  _connected: function (welcome_message) {
    var self = this;

    if (self.connection_timer) {
      clearTimeout(self.connection_timer);
      self.connection_timer = null;
    }

    if (self.current_status.connected) {
      // already connected. do nothing. this probably shouldn't happen.
      return;
    }

    // inspect the welcome data and decide if we have to reload
    try {
      var welcome_data = JSON.parse(welcome_message);
    } catch (err) {
      Meteor._debug("DEBUG: malformed welcome packet", welcome_message);
    }

    if (welcome_data && welcome_data.server_id) {
      if (__meteor_runtime_config__.serverId &&
          __meteor_runtime_config__.serverId !== welcome_data.server_id &&
          !self.sent_update_available) {
        self.sent_update_available = true;
        _.each(self.event_callbacks.update_available,
               function (callback) { callback(); });
      }
    } else
      Meteor._debug("DEBUG: invalid welcome packet", welcome_data);

    // update status
    self.current_status.status = "connected";
    self.current_status.connected = true;
    self.current_status.retryCount = 0;
    // XXX Backwards compatibility only. Remove before 1.0.
    self.current_status.retry_count = self.current_status.retryCount;
    self.status_changed();

    // fire resets. This must come after status change so that clients
    // can call send from within a reset callback.
    _.each(self.event_callbacks.reset, function (callback) { callback(); });

  },

  _cleanupSocket: function () {
    var self = this;

    self._clearConnectionAndHeartbeatTimers();
    if (self.socket) {
      self.socket.onmessage = self.socket.onclose
        = self.socket.onerror = function () {};
      self.socket.close();
      self.socket = null;
    }
  },

  _clearConnectionAndHeartbeatTimers: function () {
    var self = this;
    if (self.connection_timer) {
      clearTimeout(self.connection_timer);
      self.connection_timer = null;
    }
    if (self.heartbeat_timer) {
      clearTimeout(self.heartbeat_timer);
      self.heartbeat_timer = null;
    }
  },

  // Permanently disconnect a stream.
  forceDisconnect: function (optionalErrorMessage) {
    var self = this;
    self._forcedToDisconnect = true;
    self._cleanupSocket();
    if (self.retry_timer) {
      clearTimeout(self.retry_timer);
      self.retry_timer = null;
    }
    self.current_status = {
      status: "failed",
      connected: false,
      retryCount: 0,
      // XXX Backwards compatibility only. Remove this before 1.0.
      retry_count: 0
    };
    if (optionalErrorMessage)
      self.current_status.reason = optionalErrorMessage;
    self.status_changed();
  },

  _lostConnection: function () {
    var self = this;

    self._cleanupSocket();
    self._retry_later(); // sets status. no need to do it here.
  },

  _heartbeat_timeout: function () {
    var self = this;
    Meteor._debug("Connection timeout. No heartbeat received.");
    self._lostConnection();
  },

  _heartbeat_received: function () {
    var self = this;
    // If we've already permanently shut down this stream, the timeout is
    // already cleared, and we don't need to set it again.
    if (self._forcedToDisconnect)
      return;
    if (self.heartbeat_timer)
      clearTimeout(self.heartbeat_timer);
    self.heartbeat_timer = setTimeout(
      _.bind(self._heartbeat_timeout, self),
      self.HEARTBEAT_TIMEOUT);
  },

  _retry_timeout: function (count) {
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

  _retry_later: function () {
    var self = this;

    var timeout = self._retry_timeout(self.current_status.retryCount);
    if (self.retry_timer)
      clearTimeout(self.retry_timer);
    self.retry_timer = setTimeout(_.bind(self._retry_now, self), timeout);

    self.current_status.status = "waiting";
    self.current_status.connected = false;
    self.current_status.retryTime = (new Date()).getTime() + timeout;
    // XXX Backwards compatibility only. Remove this before 1.0.
    self.current_status.retry_time = self.current_status.retryTime;
    self.status_changed();
  },

  _retry_now: function () {
    var self = this;

    if (self._forcedToDisconnect)
      return;

    self.current_status.retryCount += 1;
    // XXX Backwards compatibility only. Remove this before 1.0.
    self.current_status.retry_count = self.current_status.retryCount;
    self.current_status.status = "connecting";
    self.current_status.connected = false;
    delete self.current_status.retryTime;
    // XXX Backwards compatibility only. Remove this before 1.0.
    delete self.current_status.retry_time;
    self.status_changed();

    self._launch_connection();
  },

  _launch_connection: function () {
    var self = this;
    self._cleanupSocket(); // cleanup the old socket, if there was one.

    // Convert raw URL to SockJS URL each time we open a connection, so that we
    // can connect to random hostnames and get around browser per-host
    // connection limits.
    self.socket = new SockJS(
      Meteor._Stream._toSockjsUrl(self.rawUrl),
      undefined, {
        debug: false, protocols_whitelist: [
          // only allow polling protocols. no websockets or streaming.
          // streaming makes safari spin, and websockets hurt chrome.
          'xdr-polling', 'xhr-polling', 'iframe-xhr-polling', 'jsonp-polling'
        ]});
    self.socket.onmessage = function (data) {
      self._heartbeat_received();

      // first message we get when we're connecting goes to _connected,
      // which connects us. All subsequent messages (while connected) go to
      // the callback.
      if (self.current_status.status === "connecting")
        self._connected(data.data);
      else if (self.current_status.connected)
        _.each(self.event_callbacks.message, function (callback) {
          callback(data.data);
        });
    };
    self.socket.onclose = function () {
      // Meteor._debug("stream disconnect", _.toArray(arguments), (new Date()).toDateString());
      self._lostConnection();
    };
    self.socket.onerror = function () {
      // XXX is this ever called?
      Meteor._debug("stream error", _.toArray(arguments), (new Date()).toDateString());
    };

    self.socket.onheartbeat =  function () {
      self._heartbeat_received();
    };

    if (self.connection_timer)
      clearTimeout(self.connection_timer);
    self.connection_timer = setTimeout(
      _.bind(self._lostConnection, self),
      self.CONNECT_TIMEOUT);
  }
});
