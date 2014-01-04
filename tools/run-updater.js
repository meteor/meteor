var Fiber = require('fibers');
var inFiber = require('./fiber-helpers.js').inFiber;

var Updater = function () {
  var self = this;
  self.timer = null;
};

// XXX make it take a runLog?
// XXX need to deal with updater writing messages (bypassing old
// stdout interception.. maybe it should be global after all..)
_.extend(Updater.prototype, {
  start: function () {
    var self = this;
    var updater = require('./updater.js');

    if (self.timer)
      throw new Error("already running?");

    // Check twice a day.
    self.timer = setInterval(inFiber(function () {
      updater.tryToDownloadUpdate(/* silent */ false);
    }), 12*60*60*1000);

    // Also start a check now, but don't block on it.
    new Fiber(function () {
      updater.tryToDownloadUpdate(/* silent */ false);
    }).run();
  },

  // Returns immediately. However if an update check is currently
  // running it will complete.
  stop: function () {
    var self = this;

    if (self.timer)
      throw new Error("not running?");
    clearInterval(self.timer);
    self.timer = null;
  }
});


exports.Updater = Updater;
