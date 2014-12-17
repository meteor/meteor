var files = require("./files.js");
var _ = require("underscore");
var switchFunctions = [];
var pollingInterval = 500;

// Set this environment variable to a truthy value to force the use of
// files.watchFile instead of pathwatcher.watch.
var canUsePathwatcher = !process.env.METEOR_WATCH_FORCE_POLLING;

// The pathwatcher library does not work on all platforms and file systems
// (notably, network file systems), so we have to do a little feature
// detection to see if we can use it.

// We optimistically watch files using pathwatcher.watch until one of the
// directories tested fails to support file system events. When that
// happens, we switch all previously created pathwatcher watches to use
// files.watchFile, and set canUsePathwatcher to false so that all future
// watches will use files.watchFile as well.

// There is some theoretical risk of missing file system events from
// pathwatcher watches created before we discover that we can't use
// pathwatcher.watch, but the window of time where that can happen is
// small enough (200ms) that developers are highly unlikely to care.

exports.testDirectory = function (dir) {
  if (! canUsePathwatcher) {
    // No need to test this directory if we've already decided we can't
    // use pathwatcher.watch.
    return;
  }

  var canaryFile = files.pathJoin(
    dir, ".pathwatcher-canary-" + Math.random().toString(36).slice(2)
  );

  files.mkdir_p(dir);

  var cleanUp = function () {
    if (watcher) {
      watcher.close();
      watcher = null;
      try {
        files.unlink(canaryFile);
      } catch (err) {
        // ignore the error
      }
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

    require("./console.js").Console.debug(
      "Falling back to files.watchFile instead of pathwatcher.watch..."
    );
  };

  try {
    // Watch the candidate directory using pathwatcher.watch.
    var watcher = files.pathwatcherWatch(dir, function () {
      cleanUp();
      switchFunctions = null;
    });

  } catch (err) {
    // If the directory did not exist, do not treat this failure as
    // evidence against pathwatcher.watch, but simply return and leave
    // canUsePathwatcher set to true.
    if (err instanceof TypeError &&
        err.message === "Unable to watch path") {
      return;
    }

    throw err;
  }

  // Create a new file to trigger a change event (hopefully). It's fine
  // if other events sneak in while we're waiting, since all we care
  // about is whether pathwatcher.watch works.
  try {
    files.writeFile(canaryFile, "ok\n");
  } catch (err) {
    cleanUp();
    throw err;
  }

  // Set a time limit of 200ms, starting from the time the file was
  // written, in which the change event must fire, else we fall back to
  // using files.watchFile.
  setTimeout(function() {
    if (watcher) {
      cleanUp();
      fallBack();
    }
  }, 200);
};

exports.watch = function (absPath, callback) {
  if (canUsePathwatcher) {
    // In principle, all this logic for watching files should continue to
    // work perfectly if we substitute files.watch for pathwatcher.watch, but
    // that will probably have to wait until we upgrade Node to v0.11.x,
    // so that files.watch is more reliable.
    var watcher = files.pathwatcherWatch(absPath, callback);

    var closed = false;
    var switched = false;

    if (switchFunctions) {
      switchFunctions.push(function switchToPolling() {
        if (! switched && ! closed) {
          switched = true;
          watcher.close();

          // Re-watch the file using files.watchFile instead.
          files.watchFile(absPath, {
            interval: pollingInterval
          }, callback);
        }
      });
    }

    return {
      close: function close() {
        if (! closed) {
          closed = true;
          if (switched) {
            files.unwatchFile(absPath, callback);
          } else {
            watcher.close();
          }
        }
      }
    };
  }

  files.watchFile(absPath, {
    interval: pollingInterval
  }, callback);

  return {
    close: function close () {
      files.unwatchFile(absPath, callback);
    }
  };
};
