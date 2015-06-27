var _ = require('underscore');
var Fiber = require('fibers');
var fiberHelpers = require('./fiber-helpers.js');
var Console = require("./console.js").Console;

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

    // Check every 3 hours. (Should not share buildmessage state with
    // the main fiber.)
    self.timer = setInterval(fiberHelpers.inBareFiber(function () {
      self._check();
    }), 3 * 60 * 60 * 1000);

    // Also start a check now, but don't block on it. (This should
    // not share buildmessage state with the main fiber.)
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
      // oh well, this was the background. Only show errors if we are in debug
      // mode.
      Console.debug("Error inside updater.");
      Console.debug(e.stack);
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
