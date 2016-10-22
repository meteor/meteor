import * as watchLibrary from "pathwatcher";
import { Profile } from "../tool-env/profile.js";
import {
  statOrNull,
  pathDirname,
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

var DEFAULT_POLLING_INTERVAL =
  ~~process.env.METEOR_WATCH_POLLING_INTERVAL_MS || 5000;

var NO_WATCHER_POLLING_INTERVAL =
  ~~process.env.METEOR_WATCH_POLLING_INTERVAL_MS || 500;

// This may seems like a long time to wait before actually closing the
// file watchers, but it's to our advantage if they survive restarts.
const WATCHER_CLEANUP_DELAY_MS = 30000;

const watchers = Object.create(null);

// Pathwatcher complains (using console.error, ugh) if you try to watch
// two files with the same stat.ino number but different paths, so we have
// to deduplicate files by ino.
const watchersByIno = new Map;

function acquireWatcher(absPath, callback) {
  const entry = watchers[absPath] || (
    watchers[absPath] = startNewWatcher(absPath));

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
  if (ino > 0 && watchersByIno.has(ino)) {
    return watchersByIno.get(ino);
  }

  function safeUnwatch() {
    if (watcher) {
      watcher.close();
      watcher = null;
      if (ino > 0) {
        watchersByIno.delete(ino);
      }
    }
  }

  let lastWatcherEventTime = +new Date;
  const callbacks = new Set;
  let watcherCleanupTimer = null;
  let watcher;
  let pollingInterval;

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
    if (watcher) {
      // Already watching; nothing to do.
      return;
    }

    watcher = watchLibraryWatch(absPath, watchWrapper);

    pollingInterval = watcher
      ? DEFAULT_POLLING_INTERVAL
      : NO_WATCHER_POLLING_INTERVAL;

    // This is a no-op if we're not watching the file.
    unwatchFile(absPath, watchFileWrapper);

    // We use files.watchFile in addition to watcher.watch as a fail-safe
    // to detect file changes even on network file systems.  However
    // (unless the user disabled watcher or this watcher call failed), we
    // use a relatively long default polling interval of 5000ms to save
    // CPU cycles.
    watchFile(absPath, {
      persistent: false,
      interval: pollingInterval,
    }, watchFileWrapper);
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
    if (new Date - lastWatcherEventTime > pollingInterval) {
      fire.call(this, "change");
    }
  }

  rewatch();

  const entry = {
    callbacks,
    rewatch,

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
        entry.close();
      }, WATCHER_CLEANUP_DELAY_MS);
    },

    close() {
      if (watchers[absPath] !== entry) return;
      watchers[absPath] = null;

      if (watcherCleanupTimer) {
        clearTimeout(watcherCleanupTimer);
        watcherCleanupTimer = null;
      }

      safeUnwatch();

      unwatchFile(absPath, watchFileWrapper);
    }
  };

  if (ino > 0) {
    watchersByIno.set(ino, entry);
  }

  return entry;
}

export function closeAllWatchers() {
  Object.keys(watchers).forEach(absPath => {
    const entry = watchers[absPath];
    if (entry) {
      entry.close();
    }
  });
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

function maybeSuggestRaisingWatchLimit(error) {
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
