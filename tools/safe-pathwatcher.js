var fs = require("fs");
var path = require("path");
var Future = require("fibers/future");
var _ = require("underscore");
var switchFunctions = [];
var pollingInterval = 500;

// Set this environment variable to a truthy value to force the use of
// fs.watchFile instead of pathwatcher.watch.
var canUsePathwatcher = !process.env.METEOR_WATCH_FORCE_POLLING;

// The pathwatcher library does not work on all platforms and file systems
// (notably, network file systems), so we have to do a little feature
// detection to see if we can use it.

// We optimistically watch files using pathwatcher.watch until one of the
// directories tested fails to support file system events. When that
// happens, we switch all previously created pathwatcher watches to use
// fs.watchFile, and set canUsePathwatcher to false so that all future
// watches will use fs.watchFile as well.

// There is some theoretical risk of missing file system events from
// pathwatcher watches created before we discover that we can't use
// pathwatcher.watch, but the window of time where that can happen is
// small enough (500ms) that developers are highly unlikely to care.

exports.testDirectory = function(dir) {
  if (! canUsePathwatcher) {
    // No need to test this directory if we've already decided we can't
    // use pathwatcher.watch.
    return;
  }

  var canaryFile = path.join(
    dir, "canary$" + Math.random().toString(36).slice(2)
  );

  // Make sure the test directory exists.
  require("./files.js").mkdir_p(dir);

  fs.unlink(canaryFile, function(ignoredError) {
    function cleanUp(arg) {
      if (watcher) {
        watcher.close();
        watcher = null;
        fs.unlink(canaryFile, function(ignoredError) {});
      }
    }

    function fallBack() {
      // Disallow future uses of pathwatcher.watch.
      canUsePathwatcher = false;

      // Convert any pathwatcher watchers we previously created to
      // fs.watchFile watchers.
      _.each(switchFunctions.splice(0), function(switchToPolling) {
        switchToPolling();
      });

      require("./console.js").Console.debug(
        "Falling back to fs.watchFile instead of pathwatcher.watch..."
      );
    }

    // Watch the candidate directory using pathwatcher.watch.
    var pathwatcher = require("pathwatcher");
    try {
      var watcher = pathwatcher.watch(dir, cleanUp);
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
    fs.writeFile(canaryFile, "ok", function(err) {
      if (err) {
        cleanUp();
        throw err;
      }
    });

    // Set a time limit of 500ms for the change event.
    setTimeout(function() {
      if (watcher) {
        cleanUp();
        fallBack();
      }
    }, 500);
  });
};

exports.watch = function(absPath, callback) {
  if (canUsePathwatcher) {
    // In principle, all this logic for watching files should continue to
    // work perfectly if we substitute fs.watch for pathwatcher.watch, but
    // that will probably have to wait until we upgrade Node to v0.11.x,
    // so that fs.watch is more reliable.
    var watcher = require("pathwatcher").watch(absPath, callback);

    var closed = false;
    var switched = false;

    switchFunctions.push(function switchToPolling() {
      if (! switched && ! closed) {
        switched = true;
        watcher.close();

        // Re-watch the file using fs.watchFile instead.
        fs.watchFile(absPath, {
          interval: pollingInterval
        }, callback);
      }
    });

    return {
      close: function close() {
        if (! closed) {
          closed = true;
          if (switched) {
            fs.unwatchFile(absPath, callback);
          } else {
            watcher.close();
          }
        }
      }
    };
  }

  fs.watchFile(absPath, {
    interval: pollingInterval
  }, callback);

  return {
    close: function close() {
      fs.unwatchFile(absPath, callback);
    }
  };
};
