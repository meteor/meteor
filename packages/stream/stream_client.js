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


(function () {

  ////////// Constants //////////

  // how long to wait until we declare the connection attempt
  // failed. socket.io doesn't tell us sometimes.
  // https://github.com/LearnBoost/socket.io-client/issues/214
  // https://github.com/LearnBoost/socket.io-client/issues/311
  var CONNECT_TIMEOUT = 10000;
  // extra time to make sure our timer and socket.ios timer don't
  // collide.
  var CONNECT_TIMEOUT_SLOP = 1000;
  // time for initial reconnect attempt.
  var RETRY_BASE_TIMEOUT = 3000;
  // exponential factor to increase timeout each attempt.
  var RETRY_EXPONENT = 2.2;
  // maximum time between reconnects.
  var RETRY_MAX_TIMEOUT = 1800000; // 30min.
  // fuzz factor to randomize reconnect times by. avoid reconnect
  // storms.
  var RETRY_FUZZ = 0.5; // +- 25%

  ////////// Internals //////////

  var socket;
  var event_callbacks = {}; // name -> [callback]
  var reset_callbacks = [];
  var message_queue = {}; // id -> message
  var next_message_id = 0;

  //// reactive status stuff
  var status = {
    status: "waiting", connected: false, retry_count: 0,
    first: true
  };
  var status_listeners = {}; // context.id -> context
  var status_changed = function () {
    _.each(status_listeners, function (context) {
      context.invalidate();
    });
  };

  //// retry logic
  var retry_timer;
  var connection_timer;

  var connected = function () {
    if (connection_timer) {
      clearTimeout(connection_timer);
      connection_timer = undefined;
    }

    if (status.connected) {
      // already connected. do nothing. this probably shouldn't happen.
      return;
    }

    // give everyone a chance to munge the message queue.
    if (!status.first) {
      var msg_list = _.toArray(message_queue);
      _.each(reset_callbacks, function (callback) {
        msg_list = callback(msg_list);
      });
      message_queue = {};
      _.each(msg_list, function (msg) {
        message_queue[next_message_id++] = msg;
      });
    } else {
      status.first = false;
    }

    // send the pending message queue. this should always be in
    // order, since the keys are ordered numerically and they are added
    // in order.
    _.each(message_queue, function (msg, id) {
      socket.json.send(msg, function () {
        delete message_queue[id];
      });
    });

    status.status = "connected";
    status.connected = true;
    status.retry_count = 0;
    status_changed();


  };
  var cleanup_socket = function () {
    if (socket) {

      if (socket.$events) {
        _.each(socket.$events, function (v, k) {
          socket.removeAllListeners(k);
        });
      }
      socket.disconnect();

      var old_socket = socket;
      socket = undefined;

      old_socket.on('connect', function () {
        Meteor._debug("DEBUG: OLD SOCKET RECONNECTED", old_socket);
        old_socket.disconnect();
      });
    }
  };

  var disconnected = function () {
    if (connection_timer) {
      clearTimeout(connection_timer);
      connection_timer = undefined;
    }
    cleanup_socket();
    retry_later(); // sets status. no need to do it here.
  };
  var fake_connect_failed = function () {
    // sometimes socket.io just doesn't tell us when it failed. we
    // detect this with a timer and force failure.
    cleanup_socket();
    disconnected();
  };

  var retry_timeout = function (count) {
    var timeout = Math.min(
      RETRY_MAX_TIMEOUT,
      RETRY_BASE_TIMEOUT * Math.pow(RETRY_EXPONENT, count));
    // fuzz the timeout randomly, to avoid reconnect storms when a
    // server goes down.
    timeout = timeout * ((Math.random() * RETRY_FUZZ) + (1 - RETRY_FUZZ/2));

    return timeout;
  };
  var retry_later = function () {
    var timeout = retry_timeout(status.retry_count)
    if (retry_timer) { clearTimeout(retry_timer); }
    retry_timer = setTimeout(retry_now, timeout);

    status.status = "waiting"
    status.connected = false;
    status.retry_time = (new Date()).getTime() + timeout;
    status_changed();
  };
  var retry_now = function () {
    status.retry_count += 1;
    status.status = "connecting";
    status.connected = false;
    delete status.retry_time;
    status_changed();

    launch_connection();
  };

  var launch_connection = function () {
    cleanup_socket(); // cleanup the old socket, if there was one.

    socket = io.connect('/', { reconnect: false,
                               'connect timeout': CONNECT_TIMEOUT,
                               'force new connection': true } );
    socket.on('connect', connected);
    socket.on('disconnect', disconnected);
    socket.on('connect_failed', disconnected);

    _.each(event_callbacks, function (callbacks, name) {
      _.each(callbacks, function (callback) {
        socket.on(name, callback);
      });
    });

    if (connection_timer) clearTimeout(connection_timer);
    connection_timer = setTimeout(fake_connect_failed,
                                  CONNECT_TIMEOUT + CONNECT_TIMEOUT_SLOP);

    // XXX for debugging
    // XXXsocket = socket;
  }

  ////////// User facing API //////////

  Meteor.status = function () {
    var context = Meteor.deps.Context.current;
    if (context && !(context.id in status_listeners)) {
      status_listeners[context.id] = context;
      context.on_invalidate(function () {
        delete status_listeners[context.id];
      });
    }
    return status;
  };

  Meteor.reconnect = function () {
    if (status.connected) return; // already connected. noop.

    // if we're mid-connection, stop it.
    if (status.status === "connecting") {
      fake_connect_failed();
    }

    if (retry_timer) clearTimeout(retry_timer);
    retry_timer = undefined;
    status.retry_count -= 1; // don't count manual retries
    retry_now();
  };


  ////////// API for other packages //////////

  Meteor._stream = {
    on: function (name, callback) {
      if (!event_callbacks[name]) event_callbacks[name] = []
      event_callbacks[name].push(callback);
      if (socket) socket.on(name, callback)
    },

    emit: function (/* var args */) {
      var args = _.toArray(arguments);
      var id = next_message_id++;
      message_queue[id] = args;

      if (status.connected) {
        socket.json.send(args, function () {
          delete message_queue[id];
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
      reset_callbacks.push(callback);
    }
  };


  ////////// Kickoff! //////////
  launch_connection();

})();
