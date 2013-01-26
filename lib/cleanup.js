var _ = require('underscore');

var cleanup = module.exports = {
  _exitHandlers: [],

  // register a function that will be called on SIGINT (e.g. Cmd-C on
  // mac)
  onExit: function(func) {
    this._exitHandlers.push(func);
  }
};

process.on('SIGINT', function () {
  _.each(cleanup._exitHandlers, function(func) {
    func();
  });
  process.exit();
});