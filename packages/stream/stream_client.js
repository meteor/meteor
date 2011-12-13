if (typeof Sky === "undefined") Sky = {};

(function () {

  ////////// Internals //////////

  var socket = io.connect();



  socket.on('connect', function () {
    // XXX
  });
  socket.on('disconnect', function () {
    // XXX reconnect
  });


  ////////// User facing API //////////

  Sky.status = function () {
    // XXX implement
    return {connected: true, its_all_a_lie: true};
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
