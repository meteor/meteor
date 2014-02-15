var _ = require('underscore');
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

    if (self.timer)
      throw new Error("already running?");

    // Check twice a day.
    self.timer = setInterval(inFiber(function () {
      self._check();
    }), 12*60*60*1000);

    // Also start a check now, but don't block on it.
    new Fiber(function () {
      self._check();
    }).run();
  },

  _check: function () {
    var self = this;
    var updater = require('./updater.js');
    try {
      updater.tryToDownloadUpdate({showBanner: true});
    } catch (e) {
      // oh well, this was the background. no need to show any errors.
      return;
    }
  },

  // Returns immediately. However if an update check is currently
  // running it will complete in the background. Idempotent.
  stop: function () {
    var self = this;

    if (self.timer)
      return;
    clearInterval(self.timer);
    self.timer = null;
  }
});


exports.Updater = Updater;
