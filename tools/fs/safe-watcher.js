import * as watchLibrary from "pathwatcher";
import { Profile } from "../tool-env/profile.js";
import {
  statOrNull,
  pathDirname,
  pathResolve,
  convertToOSPath,
  convertToStandardPath,
  watchFile,
  unwatchFile,
} from "./files.js";

// Set METEOR_WATCH_FORCE_POLLING environment variable to a truthy value to
// force the use of files.watchFile instead of watchLibrary.watch.
// Enabled on Mac and Linux and disabled on Windows by default.
var WATCHER_ENABLED = ! process.env.METEOR_WATCH_FORCE_POLLING;
if (process.platform === "win32") {
  WATCHER_ENABLED = false;
}

// Default to prioritizing changed files, but disable that behavior (and
// thus prioritize all files equally) if METEOR_WATCH_PRIORITIZE_CHANGED
// is explicitly set to a string that parses to a falsy value.
var PRIORITIZE_CHANGED = true;
if (process.env.METEOR_WATCH_PRIORITIZE_CHANGED &&
    ! JSON.parse(process.env.METEOR_WATCH_PRIORITIZE_CHANGED)) {
  PRIORITIZE_CHANGED = false;
}

var DEFAULT_POLLING_INTERVAL =
  ~~process.env.METEOR_WATCH_POLLING_INTERVAL_MS || 5000;

var NO_WATCHER_POLLING_INTERVAL =
  ~~process.env.METEOR_WATCH_POLLING_INTERVAL_MS || 500;

// This may seems like a long time to wait before actually closing the
// file watchers, but it's to our advantage if they survive restarts.
const WATCHER_CLEANUP_DELAY_MS = 30000;

const entries = Object.create(null);

// Pathwatcher complains (using console.error, ugh) if you try to watch
// two files with the same stat.ino number but different paths, so we have
// to deduplicate files by ino.
const entriesByIno = new Map;

// Set of paths for which a change event has been fired, watched with
// watchLibrary.watch if available. This could be an LRU cache, but in
// practice it should never grow large enough for that to matter.
const changedPaths = new Set;

function hasPriority(absPath) {
  // If we're not prioritizing changed files, then all files have
  // priority, which means they should be watched with native file
  // watchers if the platform supports them. If we are prioritizing
  // changed files, then only changed files get priority.
  return PRIORITIZE_CHANGED
    ? changedPaths.has(absPath)
    : true;
}

function acquireWatcher(absPath, callback) {
  const entry = entries[absPath] || (
    entries[absPath] = startNewWatcher(absPath));

  // Watches successfully established in the past may have become invalid
  // because the watched file was deleted or renamed, so we need to make
  // sure we're still watching every time we call safeWatcher.watch.
  entry.rewatch();

  // The size of the entry.callbacks Set also serves as a reference count
  // for this watcher.
  entry.callbacks.add(callback);

  return entry;
}

function startNewWatcher(absPath) {
  const stat = statOrNull(absPath);
  const ino = stat && stat.ino;
  if (ino > 0 && entriesByIno.has(ino)) {
    const entry = entriesByIno.get(ino);
    if (entries[absPath] === entry) {
      return entry;
    }
  }

  function safeUnwatch() {
    if (watcher) {
      watcher.close();
      watcher = null;
      if (ino > 0) {
        entriesByIno.delete(ino);
      }
    }
  }

  let lastWatcherEventTime = +new Date;
  const callbacks = new Set;
  let watcherCleanupTimer = null;
  let watcher;

  function getPollingInterval() {
    if (watcher) {
      return DEFAULT_POLLING_INTERVAL;
    }

    if (hasPriority(absPath)) {
      return NO_WATCHER_POLLING_INTERVAL;
    }

    if (WATCHER_ENABLED) {
      return DEFAULT_POLLING_INTERVAL;
    }

    return NO_WATCHER_POLLING_INTERVAL;
  }

  function fire(event) {
    if (event !== "change") {
      // When we receive a "delete" or "rename" event, the watcher is
      // probably not going to generate any more notifications for this
      // file, so we close and nullify the watcher to ensure that
      // entry.rewatch() will attempt to reestablish the watcher the next
      // time we call safeWatcher.watch.
      safeUnwatch();

      // Make sure we don't throttle the watchFile callback after a
      // "delete" or "rename" event, since it is now our only reliable
      // source of file change notifications.
      lastWatcherEventTime = 0;

    } else {
      changedPaths.add(absPath);
      rewatch();
    }

    callbacks.forEach(cb => cb.call(this, event));
  }

  function watchWrapper(event) {
    lastWatcherEventTime = +new Date;
    fire.call(this, event);

    // It's tempting to call unwatchFile(absPath, watchFileWrapper) here,
    // but previous watcher success is no guarantee of future watcher
    // reliability. For example, watchLibrary.watch works just fine when file
    // changes originate from within a Vagrant VM, but changes to shared
    // files made outside the VM are invisible to watcher, so our only
    // hope of catching them is to continue polling.
  }

  function rewatch() {
    if (hasPriority(absPath)) {
      if (watcher) {
        // Already watching; nothing to do.
        return;
      }
      watcher = watchLibraryWatch(absPath, watchWrapper);
    } else if (watcher) {
      safeUnwatch();
    }

    // Since we're about to restart the stat-based file watcher, we don't
    // want to miss any of its events because of the lastWatcherEventTime
    // throttling that it attempts to do.
    lastWatcherEventTime = 0;

    // We use files.watchFile in addition to watcher.watch as a fail-safe
    // to detect file changes even on network file systems.  However
    // (unless the user disabled watcher or this watcher call failed), we
    // use a relatively long default polling interval of 5000ms to save
    // CPU cycles.
    statWatch(absPath, getPollingInterval(), watchFileWrapper);
  }

  function watchFileWrapper(...args) {
    const [newStat, oldStat] = args;

    if (newStat.ino === 0 &&
        oldStat.ino === 0 &&
        +newStat.mtime === +oldStat.mtime) {
      // Node calls the watchFile listener once with bogus identical stat
      // objects, which should not trigger a file change event.
      return;
    }

    // If a watcher event fired in the last polling interval, ignore
    // this event.
    if (new Date - lastWatcherEventTime > getPollingInterval()) {
      fire.call(this, "change");
    }
  }

  const entry = {
    callbacks,
    rewatch,

    release(callback) {
      if (! entries[absPath]) {
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
        entry.close();
      }, WATCHER_CLEANUP_DELAY_MS);
    },

    close() {
      if (entries[absPath] !== entry) return;
      entries[absPath] = null;

      if (watcherCleanupTimer) {
        clearTimeout(watcherCleanupTimer);
        watcherCleanupTimer = null;
      }

      safeUnwatch();

      unwatchFile(absPath, watchFileWrapper);
    }
  };

  if (ino > 0) {
    entriesByIno.set(ino, entry);
  }

  return entry;
}

export function closeAllWatchers() {
  Object.keys(entries).forEach(absPath => {
    const entry = entries[absPath];
    if (entry) {
      entry.close();
    }
  });
}

const statWatchers = Object.create(null);

function statWatch(absPath, interval, callback) {
  const oldWatcher = statWatchers[absPath];

  while (oldWatcher) {
    // Make sure this callback no longer appears among the listeners for
    // this StatWatcher.
    const countBefore = oldWatcher.stat.listenerCount("change");

    // This removes at most one occurrence of the callback from the
    // listeners list...
    oldWatcher.stat.removeListener("change", callback);

    // ... so we have to keep calling it until the first time
    // it removes nothing.
    if (oldWatcher.stat.listenerCount("change") === countBefore) {
      break;
    }
  }

  // This doesn't actually call newStat.start again if there's already a
  // watcher for this file, so it won't change any interval previously
  // specified. In the rare event that the interval needs to change, we
  // manually stop and restart the StatWatcher below.
  const newStat = watchFile(absPath, {
    persistent: false, // never persistent
    interval,
  }, callback);

  if (! oldWatcher) {
    const newWatcher = {
      stat: newStat,
      interval,
    };

    newStat.on("stop", () => {
      if (statWatchers[absPath] === newWatcher) {
        delete statWatchers[absPath];
      }
    });

    return statWatchers[absPath] = newWatcher;
  }

  // These should be identical at this point, but just in case.
  oldWatcher.stat = newStat;

  // If the interval needs to be changed, manually stop and restart the
  // StatWatcher using lower-level methods than unwatchFile and watchFile.
  if (oldWatcher.interval !== interval) {
    oldWatcher.stat.stop();
    oldWatcher.stat.start(
      convertToOSPath(pathResolve(absPath)),
      false, // never persistent
      oldWatcher.interval = interval,
    );
  }

  return oldWatcher;
}

function watchLibraryWatch(absPath, callback) {
  if (WATCHER_ENABLED) {
    try {
      return watchLibrary.watch(convertToOSPath(absPath), callback);
    } catch (e) {
      maybeSuggestRaisingWatchLimit(e);
      // ... ignore the error.  We'll still have watchFile, which is good
      // enough.
    }
  }

  return null;
}

let suggestedRaisingWatchLimit = false;

// This function is async so that archinfo.host() (which may call
// utils.execFileSync) will run in a Fiber.
async function maybeSuggestRaisingWatchLimit(error) {
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
      error.errno === constants.ENOSPC &&
      // The only suggestion we currently have is for Linux.
      archinfo.matches(archinfo.host(), 'os.linux')) {
    suggestedRaisingWatchLimit = true;
    var Console = require('../console/console.js').Console;
    if (! Console.isHeadless()) {
      Console.arrowWarn(
        "It looks like a simple tweak to your system's configuration will " +
          "make many tools (including this Meteor command) more efficient. " +
          "To learn more, see " +
          Console.url("https://github.com/meteor/meteor/wiki/File-Change-Watcher-Efficiency"));
    }
  }
}

export const watch = Profile(
  "safeWatcher.watch",
  (absPath, callback) => {
    const entry = acquireWatcher(absPath, callback);
    return {
      close() {
        entry.release(callback);
      }
    };
  }
);
