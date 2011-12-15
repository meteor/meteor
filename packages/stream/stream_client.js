if (typeof Sky === "undefined") Sky = {};

// socket.io reconnect is broken and doesn't tell us when it gives up:
// https://github.com/LearnBoost/socket.io/issues/652
// also, seems to have some issues with re-handshaking
// https://github.com/LearnBoost/socket.io/issues/438
// also, it doesn't always tell us when connections fail
// https://github.com/LearnBoost/socket.io-client/issues/214
// https://github.com/LearnBoost/socket.io-client/issues/311
//
// we wanted our own logic on top of socket.io anyway, since their
// reconnect is a little gimpy. So this just means we have to do it all
// ourselves instead of allowing socket.io to handle the short-term
// transient reconnects.
//
// We may be able to drop a lot of this code when socket.io gets its act
// together with regards to reconnect. Some people are working on it
// already:
// https://github.com/3rd-Eden/Socket.IO/tree/bugs/reconnect


(function () {

  ////////// Constants //////////
  var CONNECT_TIMEOUT = 10000;
  var CONNECT_TIMEOUT_SLOP = 1000;
  var RETRY_BASE_TIMEOUT = 3000;
  var RETRY_EXPONENT = 2.2;
  var RETRY_MAX_TIMEOUT = 1800000; // 30min
  var RETRY_FUZZ = 0.5; // +- 25%

  ////////// Internals //////////

  var socket;
  var event_callbacks = {}; // name -> [callback]
  // XXX var message_queue = [];

  //// reactive status stuff
  var status = {
    status: "startup", connected: false, retry_count: 0
  };
  var status_listeners = [];
  var status_changed = function () {
    // XXX does _.each do the right thing if the list is modified out
    // from under it? The list will be modified out from under it until
    // Geoff's flush changes land (and even then, may still be modified
    // out from under us?).
    _.each(status_listeners, function (x) { x(); });
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
    status.status = "connected";
    status.connected = true;
    status.retry_count = 0;

    status_changed();

    // XXX send message queue
  };
  var disconnected = function () {
    if (connection_timer) {
      clearTimeout(connection_timer);
      connection_timer = undefined;
    }

    status.status = "waiting"
    status.connected = false;
    status_changed();

    retry_later();
  };
  var fake_connect_failed = function () {
    // sometimes socket.io just doesn't tell us when it failed. we
    // detect this with a timer and force failure.
    socket.removeAllListeners('connect');
    socket.removeAllListeners('disconnect');
    socket.removeAllListeners('connect_failed');
    socket.disconnect();
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
    retry_timer = setTimeout(retry_now, retry_timeout(status.retry_count));
  };
  var retry_now = function () {
    status.retry_count += 1;
    status.status = "connecting";
    status.connected = false;
    status_changed();

    launch_connection();
  };

  var launch_connection = function () {
    // XXX if existing socket, any cleanup we have to do?

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

  Sky.status = function () {
    if (Sky.deps.monitoring) {
      var invalidate = Sky.deps.getInvalidate();
      status_listeners.push(invalidate);
      Sky.deps.cleanup(function () {
        status_listeners = _.without(status_listeners, invalidate);
      });
    }
    return status;
  };

  Sky.reconnect = function () {
    // XXX implement
  };


  ////////// API for other packages //////////

  Sky._stream = {
    on: function (name, callback) {
      if (!event_callbacks[name]) event_callbacks[name] = []
      event_callbacks[name].push(callback);
      socket.on(name, callback)
    },

    emit: function (XXX) {
      // XXX add to message queue
      socket.emit.apply(socket, arguments);
    }
  };


  ////////// Kickoff! //////////
  launch_connection();

})();
