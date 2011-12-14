if (typeof Sky === "undefined") Sky = {};

(function () {

  ////////// Internals //////////

  // socket.io reconnect is broken and doesn't tell us when it gives up:
  // https://github.com/LearnBoost/socket.io/issues/652
  //
  // we wanted our own logic on top of socket.io anyway, since their
  // reconnect is a little gimpy. So this just means we have to do it
  // all ourselves instead of allowing socket.io to handle the
  // short-term transient reconnects.

  var socket = io.connect('/', { reconnect: false} );


  //// reactive status stuff
  var status = {its_all_a_lie: true};
  var status_listeners = [];
  var status_changed = function () {
    // XXX does _.each do the right thing if the list is modified out
    // from under it? The list will be modified out from under it until
    // Geoff's flush changes land (and even then, may still be modified
    // out from under us?).
    _.each(status_listeners, function (x) { x(); });
  };


  //// callbacks from socket.io

  socket.on('connect', function () {
    var old_connected = status.connected;
    status.connected = true;
    if (old_connected !== status.connected)
      status_changed();

    // XXX implement
  });
  socket.on('disconnect', function () {
    var old_connected = status.connected;
    status.connected = false;
    if (old_connected !== status.connected)
      status_changed();

    // XXX implement
  });

  socket.on('connect_failed', function () {
    var old_connected = status.connected;
    status.connected = false;
    if (old_connected !== status.connected)
      status_changed();

    // XXX implement
  });


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
      socket.on(name, callback)
    },

    emit: function (XXX) {
      socket.emit.apply(socket, arguments);
    }
  };


})();
