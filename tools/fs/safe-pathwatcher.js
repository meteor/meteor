var files = require('./files.js');
import { Profile } from "../tool-env/profile.js";

// Set METEOR_WATCH_FORCE_POLLING environment variable to a truthy value to
// force the use of files.watchFile instead of pathwatcher.watch.
// Enabled on Mac and Linux and disabled on Windows by default.
var PATHWATCHER_ENABLED = !process.env.METEOR_WATCH_FORCE_POLLING;
if (process.platform === "win32") {
  PATHWATCHER_ENABLED = false;
}

var DEFAULT_POLLING_INTERVAL =
      ~~process.env.METEOR_WATCH_POLLING_INTERVAL_MS || 5000;


var NO_PATHWATCHER_POLLING_INTERVAL =
      ~~process.env.METEOR_WATCH_POLLING_INTERVAL_MS || 500;

// This may seems like a long time to wait before actually closing the
// file watchers, but it's to our advantage if they survive restarts.
const WATCHER_CLEANUP_DELAY_MS = 30000;

var suggestedRaisingWatchLimit = false;

const watchers = Object.create(null);

function acquireWatcher(absPath, callback) {
  const entry = watchers[absPath] || (
    watchers[absPath] = startNewWatcher(absPath));

  // The size of the entry.callbacks Set also serves as a reference count
  // for this watcher.
  entry.callbacks.add(callback);

  return entry;
}

function startNewWatcher(absPath) {
  let lastPathwatcherEventTime = +new Date;
  const callbacks = new Set;
  let watcherCleanupTimer = null;

  function fire(self, args) {
    callbacks.forEach(cb => cb.apply(self, args));
  }

  function pathwatcherWrapper(...args) {
    lastPathwatcherEventTime = +new Date;
    fire(this, args);

    // It's tempting to call files.unwatchFile(absPath, watchFileWrapper)
    // here, but previous pathwatcher success is no guarantee of future
    // pathwatcher reliability. For example, pathwatcher works just fine
    // when file changes originate from within a Vagrant VM, but changes
    // to shared files made outside the VM are invisible to pathwatcher,
    // so our only hope of catching them is to continue polling.
  }

  let watcher = pathwatcherWatch(absPath, pathwatcherWrapper);

  const pollingInterval = watcher
    ? DEFAULT_POLLING_INTERVAL
    : NO_PATHWATCHER_POLLING_INTERVAL;

  function watchFileWrapper(...args) {
    const [newStat, oldStat] = args;

    if (newStat.ino === 0 &&
        oldStat.ino === 0 &&
        +newStat.mtime === +oldStat.mtime) {
      // Node calls the watchFile listener once with bogus identical stat
      // objects, which should not trigger a file change event.
      return;
    }

    // If a pathwatcher event fired in the last polling interval, ignore
    // this event.
    if (new Date - lastPathwatcherEventTime > pollingInterval) {
      fire(this, args);
    }
  }

  // We use files.watchFile in addition to pathwatcher.watch as a
  // fail-safe to detect file changes even on network file systems.
  // However (unless the user disabled pathwatcher or this pathwatcher
  // call failed), we use a relatively long default polling interval of
  // 5000ms to save CPU cycles.
  files.watchFile(absPath, {
    persistent: false,
    interval: pollingInterval
  }, watchFileWrapper);

  return {
    callbacks,

    release(callback) {
      if (! watchers[absPath]) {
        return;
      }

      callbacks.delete(callback);
      if (callbacks.size > 0) {
        return;
      }

      // Once there are no more callbacks in the Set, close both watchers
      // and nullify the shared data.
      clearTimeout(watcherCleanupTimer);
      watcherCleanupTimer = setTimeout(() => {
        if (callbacks.size > 0) {
          // If another callback was added while the timer was pending, we
          // can avoid tearing anything down.
          return;
        }

        watchers[absPath] = null;

        if (watcher) {
          watcher.close();
          watcher = null;
        }

        files.unwatchFile(absPath, watchFileWrapper);
      }, WATCHER_CLEANUP_DELAY_MS);
    }
  };
}


function pathwatcherWatch(absPath, callback) {
  if (PATHWATCHER_ENABLED) {
    try {
      return files.pathwatcherWatch(absPath, callback);
    } catch (e) {
      // If it isn't an actual pathwatcher failure, rethrow.
      if (e.message !== 'Unable to watch path') {
        throw e;
      }
      var constants = require('constants');
      var archinfo = require('../utils/archinfo.js');
      if (! suggestedRaisingWatchLimit &&
          // Note: the not-super-documented require('constants') maps from
          // strings to SYSTEM errno values. System errno values aren't the same
          // as the numbers used internally by libuv! Once we're upgraded
          // to Node 0.12, we'll have the system errno as a string (on 'code'),
          // but the support for that wasn't in Node 0.10's uv.
          // See our PR https://github.com/atom/node-pathwatcher/pull/53
          // (and make sure to read the final commit message, not the original
          // proposed PR, which had a slightly different interface).
          e.errno === constants.ENOSPC &&
          // The only suggestion we currently have is for Linux.
          archinfo.matches(archinfo.host(), 'os.linux')) {
        suggestedRaisingWatchLimit = true;
        var Console = require('../console/console.js').Console;
        Console.arrowWarn(
          "It looks like a simple tweak to your system's configuration will " +
            "make many tools (including this Meteor command) more efficient. " +
            "To learn more, see " +
            Console.url("https://github.com/meteor/meteor/wiki/File-Change-Watcher-Efficiency"));
      }
      // ... ignore the error.  We'll still have watchFile, which is good
      // enough.
    }
  }

  return null;
}

export const watch = Profile(
  "pathwatcher.watch",
  (absPath, callback) => {
    const entry = acquireWatcher(absPath, callback);
    return {
      close() {
        entry.release(callback);
      }
    };
  }
);
