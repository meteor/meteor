/// A simple interface to register functions to be called when the process
/// exits.

var _ = require('underscore');

var cleanup = exports;
_.extend(exports, {
  _exitHandlers: [],

  // register a function that will be called on SIGINT (e.g. Cmd-C on
  // mac)
  onExit: function (func) {
    this._exitHandlers.push(func);
  }
});

var runHandlers = function () {
  var handlers = cleanup._exitHandlers;
  cleanup._exitHandlers = [];
  _.each(handlers, function (f) {
    f();
  });
};

process.on('exit', runHandlers);
_.each(['SIGINT', 'SIGHUP', 'SIGTERM'], function (sig) {
  process.once(sig, function () {
    runHandlers();
    process.kill(process.pid, sig);
  });
});
