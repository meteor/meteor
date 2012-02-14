if (typeof Meteor === "undefined") Meteor = {};

Meteor._Stream = function (url) {
  var self = this;

  self.url = url;
  self.socket = null;
  self.event_callbacks = {}; // name -> [callback]
  self.server_id = null;

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
  self.status = {
    status: "connecting", connected: false, retry_count: 0
  };

  self.status_listeners = {}; // context.id -> context
  self.status_changed = function () {
    _.each(self.status_listeners, function (context) {
      context.invalidate();
    });
  };

  //// Retry logic
  self.retry_timer = null;
  self.connection_timer = null;

  //// Kickoff!
  self._launch_connection();
};

_.extend(Meteor._Stream.prototype, {
  // Register for callbacks.
  on: function (name, callback) {
    var self = this;

    // only allow message and reset for now.
    if (name !== 'message' && name !== 'reset')
      throw new Error("unknown event type: " + name);

    if (!self.event_callbacks[name])
      self.event_callbacks[name] = [];
    self.event_callbacks[name].push(callback);
    if (self.status.connected)
      self.socket.on(name, callback);
  },

  // data is a utf8 string. Data sent while not connected is dropped on
  // the floor, and it is up the user of this API to retransmit lost
  // messages on 'reset'
  send: function (data) {
    var self = this;
    if (self.status.connected) {
      self.socket.send(data);
    }
  },

  // Get current status. Reactive.
  status: function () {
    var self = this;
    var context = Meteor.deps && Meteor.deps.Context.current;
    if (context && !(context.id in self.status_listeners)) {
      self.status_listeners[context.id] = context;
      context.on_invalidate(function () {
        delete self.status_listeners[context.id];
      });
    }
    return self.status;
  },

  // Trigger a reconnect.
  reconnect: function () {
    var self = this;
    if (self.status.connected)
      return; // already connected. noop.

    // if we're mid-connection, stop it.
    if (self.status.status === "connecting") {
      self._fake_connect_failed();
    }

    if (self.retry_timer)
      clearTimeout(self.retry_timer);
    self.retry_timer = null;
    self.status.retry_count -= 1; // don't count manual retries
    self._retry_now();
  },

  _connected: function (welcome_message) {
    var self = this;

    if (self.connection_timer) {
      clearTimeout(self.connection_timer);
      self.connection_timer = null;
    }

    if (self.status.connected) {
      // already connected. do nothing. this probably shouldn't happen.
      return;
    }

    // inspect the welcome data and decide if we have to reload
    try {
      var welcome_data = JSON.parse(welcome_message);
      if (welcome_data && welcome_data.server_id) {
        if (self.server_id && self.server_id !== welcome_data.server_id) {
          Meteor._reload.reload();
          // world's about to end, just leave the connection 'connecting'
          // until it does.
          return;
        }
        self.server_id = welcome_data.server_id;
      } else {
        Meteor._debug("DEBUG: invalid welcome packet", welcome_data);
      }
    } catch (err) {
      Meteor._debug("DEBUG: malformed welcome packet", welcome_message);
    }

    // update status
    self.status.status = "connected";
    self.status.connected = true;
    self.status.retry_count = 0;
    self.status_changed();

    // fire resets. This must come after status change so that clients
    // can call send from within a reset callback.
    _.each(self.event_callbacks.reset, function (callback) { callback(); });

  },

  _cleanup_socket: function () {
    var self = this;

    if (self.socket) {

      // XXX XXX how do we remove listeners on engine socket
      if (self.socket.$events) {
        _.each(self.socket.$events, function (v, k) {
          self.socket.removeAllListeners(k);
        });
      }
      self.socket.close();

      var old_socket = self.socket;
      self.socket = null;

    }
  },

  _disconnected: function () {
    var self = this;

    if (self.connection_timer) {
      clearTimeout(self.connection_timer);
      self.connection_timer = null;
    }
    self._cleanup_socket();
    self._retry_later(); // sets status. no need to do it here.
  },

  _fake_connect_failed: function () {
    var self = this;
    self._cleanup_socket();
    self._disconnected();
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
    timeout = timeout * ((Math.random() * self.RETRY_FUZZ) +
                         (1 - self.RETRY_FUZZ/2));
    return timeout;
  },

  _retry_later: function () {
    var self = this;

    var timeout = self._retry_timeout(self.status.retry_count);
    if (self.retry_timer)
      clearTimeout(self.retry_timer);
    self.retry_timer = setTimeout(_.bind(self._retry_now, self), timeout);

    self.status.status = "waiting";
    self.status.connected = false;
    self.status.retry_time = (new Date()).getTime() + timeout;
    self.status_changed();
  },

  _retry_now: function () {
    var self = this;

    self.status.retry_count += 1;
    self.status.status = "connecting";
    self.status.connected = false;
    delete self.status.retry_time;
    self.status_changed();

    self._launch_connection();
  },

  _launch_connection: function () {
    var self = this;
    self._cleanup_socket(); // cleanup the old socket, if there was one.

    // XXX URL!
    self.socket = new SockJS('http://localhost:3000/sockjs', undefined, {debug: false});
    self.socket.onmessage = function (data) {
      // first message we get when we're connecting goes to _connected,
      // which connects us. All subsequent messages (while connected) go to
      // the callback.
      if (self.status.status === "connecting")
        self._connected(data.data);
      else if (self.status.connected)
        _.each(self.event_callbacks.message, function (callback) {
          callback(data.data);
        });
    };
    self.socket.onclose = function () {
      // Meteor._debug("stream disconnect", _.toArray(arguments), (new Date()).toDateString());
      self._disconnected();
    };
    self.socket.onerror = function () {
      // XXX is this ever called?
      Meteor._debug("stream error", _.toArray(arguments), (new Date()).toDateString());
    };

    if (self.connection_timer)
      clearTimeout(self.connection_timer);
    self.connection_timer = setTimeout(
      _.bind(self._fake_connect_failed, self),
      self.CONNECT_TIMEOUT);
  }
});
