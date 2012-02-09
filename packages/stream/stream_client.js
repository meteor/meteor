if (typeof Meteor === "undefined") Meteor = {};

// socket.io reconnect is broken and doesn't tell us when it gives up:
// https://github.com/LearnBoost/socket.io/issues/652
// also, seems to have some issues with re-handshaking
// https://github.com/LearnBoost/socket.io/issues/438
//
// we wanted our own logic on top of socket.io anyway, since their
// reconnect is a little broken. So this just means we have to do it all
// ourselves instead of allowing socket.io to handle the short-term
// transient reconnects.
//
// We may be able to drop a lot of this code when socket.io gets its act
// together with regards to reconnect. Some people are working on it
// already:
// https://github.com/3rd-Eden/Socket.IO/tree/bugs/reconnect

Meteor._Stream = function (url) {
  var self = this;

  self.url = url;
  self.socket = null;
  self.event_callbacks = {}; // name -> [callback]
  self.reset_callbacks = [];
  self.message_queue = {}; // id -> message
  self.next_message_id = 0;
  self.server_id = null;

  //// Constants

  // how long to wait until we declare the connection attempt
  // failed. socket.io doesn't tell us sometimes.
  // https://github.com/LearnBoost/socket.io-client/issues/214
  // https://github.com/LearnBoost/socket.io-client/issues/311
  self.CONNECT_TIMEOUT = 10000;
  // extra time to make sure our timer and socket.ios timer don't
  // collide.
  self.CONNECT_TIMEOUT_SLOP = 1000;
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
  // fuzz factor to randomize reconnect times by. avoid reconnect
  // storms.
  self.RETRY_FUZZ = 0.5; // +- 25%

  //// Reactive status
  self.status = {
    status: "waiting", connected: false, retry_count: 0
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

  //// Saving and restoring state
  Meteor._reload.on_migrate('stream', function () {
    return { message_list: _.toArray(self.message_queue) };
  });

  var migration_data = Meteor._reload.migration_data('stream');
  if (migration_data && migration_data.message_list) {
    _.each(migration_data.message_list, function (msg) {
      self.message_queue[self.next_message_id++] = msg;
    });
  }

  //// Kickoff!
  self._launch_connection();
};

_.extend(Meteor._Stream.prototype, {
  on: function (name, callback) {
    var self = this;

    if (!self.event_callbacks[name])
      self.event_callbacks[name] = [];
    self.event_callbacks[name].push(callback);
    if (self.socket)
      self.socket.on(name, callback);
  },

  emit: function (/* arguments */) {
    var self = this;

    var args = _.toArray(arguments);
    var id = self.next_message_id++;
    self.message_queue[id] = args;

    if (self.status.connected) {
      self.socket.json.send(args, function () {
        delete self.message_queue[id];
      });
    }
  },

  // provide a hook for modules to re-initialize state upon new
  // connection. callback is a function that takes a message list and
  // returns a message list. modules use this to strip out unneeded
  // messages and/or insert new messages. NOTE: this API is weird! We
  // probably want to revisit this, potentially adding some sort of
  // namespacing so multiple modules can share the stream more
  // gracefully.
  reset: function (callback) {
    var self = this;
    self.reset_callbacks.push(callback);
  },

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
    self.retry_timer = undefined;
    self.status.retry_count -= 1; // don't count manual retries
    self._retry_now();
  },

  _connected: function (welcome_data) {
    var self = this;

    if (self.connection_timer) {
      clearTimeout(self.connection_timer);
      self.connection_timer = undefined;
    }

    if (self.status.connected) {
      // already connected. do nothing. this probably shouldn't happen.
      return;
    }

    // inspect the welcome data and decide if we have to reload
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

    // give everyone a chance to munge the message queue.
    var msg_list = _.toArray(self.message_queue);
    _.each(self.reset_callbacks, function (callback) {
      msg_list = callback(msg_list);
    });
    self.message_queue = {};
    _.each(msg_list, function (msg) {
      self.message_queue[self.next_message_id++] = msg;
    });

    // send the pending message queue. this should always be in
    // order, since the keys are ordered numerically and they are added
    // in order.
    _.each(self.message_queue, function (msg, id) {
      self.socket.json.send(msg, function () {
        delete self.message_queue[id];
      });
    });

    self.status.status = "connected";
    self.status.connected = true;
    self.status.retry_count = 0;
    self.status_changed();
  },

  _cleanup_socket: function () {
    var self = this;

    if (self.socket) {

      if (self.socket.$events) {
        _.each(self.socket.$events, function (v, k) {
          self.socket.removeAllListeners(k);
        });
      }
      self.socket.disconnect();

      var old_socket = self.socket;
      self.socket = null;

      old_socket.on('connect', function () {
        Meteor._debug("DEBUG: OLD SOCKET RECONNECTED", old_socket);
        old_socket.disconnect();
      });
    }
  },

  _disconnected: function () {
    var self = this;

    if (self.connection_timer) {
      clearTimeout(self.connection_timer);
      self.connection_timer = undefined;
    }
    self._cleanup_socket();
    self._retry_later(); // sets status. no need to do it here.
  },

  _fake_connect_failed: function () {
    var self = this;
    // sometimes socket.io just doesn't tell us when it failed. we
    // detect this with a timer and force failure.
    self._cleanup_socket();
    self._disconnected();
  },

  _retry_timeout: function (count) {
    var self = this;

    if (count < 2)
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

    var timeout = self._retry_timeout(self.status.retry_count)
    if (self.retry_timer)
      clearTimeout(self.retry_timer);
    self.retry_timer = setTimeout(_.bind(self._retry_now, self), timeout);

    self.status.status = "waiting"
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

    self.socket = io.connect(self.url, {
      reconnect: false,
      'connect timeout': self.CONNECT_TIMEOUT,
      'force new connection': true
    });
    self.socket.once('welcome', _.bind(self._connected, self));
    self.socket.on('disconnect', _.bind(self._disconnected, self));
    self.socket.on('connect_failed', _.bind(self._disconnected, self));

    _.each(self.event_callbacks, function (callbacks, name) {
      _.each(callbacks, function (callback) {
        self.socket.on(name, callback);
      });
    });

    if (self.connection_timer)
      clearTimeout(self.connection_timer);
    var timeout = self.CONNECT_TIMEOUT + self.CONNECT_TIMEOUT_SLOP;
    self.connection_timer = setTimeout(_.bind(self._fake_connect_failed, self),
                                       timeout);
  }
});
