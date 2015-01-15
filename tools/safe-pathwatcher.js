var files = require("./files.js");

// Set METEOR_WATCH_FORCE_POLLING environment variable to a truthy value to
// force the use of files.watchFile instead of pathwatcher.watch.
// Enabled on Mac and Linux and disabled on Windows by default.
var PATHWATCHER_ENABLED = false;

var DEFAULT_POLLING_INTERVAL =
      ~~process.env.METEOR_WATCH_POLLING_INTERVAL_MS || 5000;


var NO_PATHWATCHER_POLLING_INTERVAL =
      ~~process.env.METEOR_WATCH_POLLING_INTERVAL_MS || 500;

var suggestedRaisingWatchLimit = false;

exports.watch = function watch(absPath, callback) {
  var lastPathwatcherEventTime = 0;

  function pathwatcherWrapper() {
    // It's tempting to call files.unwatchFile(absPath, watchFileWrapper)
    // here, but previous pathwatcher success is no guarantee of future
    // pathwatcher reliability. For example, pathwatcher works just fine
    // when file changes originate from within a Vagrant VM, but changes
    // to shared files made outside the VM are invisible to pathwatcher,
    // so our only hope of catching them is to continue polling.
    lastPathwatcherEventTime = +new Date;
    callback.apply(this, arguments);
  }

  var watcher = null;
  if (PATHWATCHER_ENABLED) {
    try {
      watcher = files.pathwatcherWatch(absPath, pathwatcherWrapper);
    } catch (e) {
      // If it isn't an actual pathwatcher failure, rethrow.
      if (e.message !== 'Unable to watch path')
        throw e;
      var constants = require('constants');
      var archinfo = require('./archinfo.js');
      if (! suggestedRaisingWatchLimit &&
          // Note: the not-super-documented require('constants') maps from
          // strings to SYSTEM errno values. System errno values aren't the same
          // as the numbers used internally by libuv! It would be nice to just
          // make pathwatcher process the system errno into a string for us, but
          // this is a pain, because posix doesn't give us a function to give us
          // 'ENOSPC'-style strings (just the longer strings that strerror gives
          // you). While libuv does give us uv_err_name, it takes in a *UV*
          // errno value, which is different from the system errno value, and
          // the translation function is not exposed:
          // https://github.com/libuv/libuv/issues/79
          e.code === constants.ENOSPC &&
          // The only suggestion we currently have is for Linux.
          archinfo.matches(archinfo.host(), 'os.linux')) {
        suggestedRaisingWatchLimit = true;
        var Console = require('./console.js').Console;
        Console.arrowWarn(
          "It looks like a simple tweak to your system's configuration will " +
            "make many tools (including this Meteor command) more efficient. " +
            "To learn more, see " +
            Console.url("https://github.com/meteor/meteor/wiki/File-Change-Watcher-Efficiency"));
      }
      // ... ignore the error.  We'll still have watchFile, which is good
      // enough.
    }
  };

  var fallBack = function () {
    // Disallow future uses of pathwatcher.watch.
    canUsePathwatcher = false;

    // Convert any pathwatcher watchers we previously created to
    // files.watchFile watchers.
    _.each(switchFunctions.splice(0), function (switchToPolling) {
      switchToPolling();
    });

    require("./console.js").Console.warn(
      "Falling back to files.watchFile instead of pathwatcher.watch..."
    );
  };

  try {
    // Watch the candidate directory using pathwatcher.watch.
    var watcher = files.pathwatcherWatch(dir, cleanUp);
  } catch (err) {
    // If the directory did not exist, do not treat this failure as
    // evidence against pathwatcher.watch, but simply return and leave
    // canUsePathwatcher set to true.
    if (err instanceof TypeError && err.message === "Unable to watch path") {
      return;
    }

    throw err;
  }

  var pollingInterval = watcher
        ? DEFAULT_POLLING_INTERVAL : NO_PATHWATCHER_POLLING_INTERVAL;

  function watchFileWrapper() {
    // If a pathwatcher event fired in the last polling interval, ignore
    // this event.
    if (new Date - lastPathwatcherEventTime > pollingInterval) {
      callback.apply(this, arguments);
    }
  }

  // We use files.watchFile in addition to pathwatcher.watch as a fail-safe to
  // detect file changes even on network file systems.  However (unless the user
  // disabled pathwatcher or this pathwatcher call failed), we use a relatively
  // long default polling interval of 5000ms to save CPU cycles.
  files.watchFile(absPath, {
    persistent: false,
    interval: pollingInterval
  }, watchFileWrapper);

  var polling = true;

  return {
    close: function close() {
      if (watcher) {
        watcher.close();
        watcher = null;
      }

      if (polling) {
        polling = false;
        files.unwatchFile(absPath, watchFileWrapper);
      }
    }
  };
};
