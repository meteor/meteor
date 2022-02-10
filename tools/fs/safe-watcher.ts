import { FSWatcher, Stats, BigIntStats } from "fs";
import { Profile } from "../tool-env/profile";
import {
  statOrNull,
  convertToOSPath,
  watchFile,
  unwatchFile,
  toPosixPath,
  pathRelative
} from "./files";
import {
  join as nativeJoin
} from 'path';
import nsfw from 'vscode-nsfw';

const pathwatcher = require('pathwatcher');

// Default to prioritizing changed files, but disable that behavior (and
// thus prioritize all files equally) if METEOR_WATCH_PRIORITIZE_CHANGED
// is explicitly set to a string that parses to a falsy value.
var PRIORITIZE_CHANGED = true;
if (process.env.METEOR_WATCH_PRIORITIZE_CHANGED &&
    ! JSON.parse(process.env.METEOR_WATCH_PRIORITIZE_CHANGED)) {
  PRIORITIZE_CHANGED = false;
}

var DEFAULT_POLLING_INTERVAL =
  +(process.env.METEOR_WATCH_POLLING_INTERVAL_MS || 5000);

var NO_WATCHER_POLLING_INTERVAL =
  +(process.env.METEOR_WATCH_POLLING_INTERVAL_MS || 500);

// This may seems like a long time to wait before actually closing the
// file watchers, but it's to our advantage if they survive restarts.
const WATCHER_CLEANUP_DELAY_MS = 30000;

// Since linux doesn't have recursive file watching, nsfw has to walk the
// watched folder and create a separate watcher for each subfolder. Until it has a
// way for us to filter which folders it walks we will continue to use
// pathwatcher to avoid having too many watchers.
let watcherLibrary = process.env.METEOR_WATCHER_LIBRARY ||
  (process.platform === 'linux' ? 'pathwatcher' : 'nsfw');

// Pathwatcher complains (using console.error, ugh) if you try to watch
// two files with the same stat.ino number but different paths on linux, so we have
// to deduplicate files by ino.
const DEDUPLICATE_BY_INO = watcherLibrary === 'pathwatcher';
// Set METEOR_WATCH_FORCE_POLLING environment variable to a truthy value to
// force the use of files.watchFile instead of watchLibrary.watch.
let watcherEnabled = ! JSON.parse(
  process.env.METEOR_WATCH_FORCE_POLLING || "false"
);

const entriesByIno = new Map;

export type SafeWatcher = {
  close: () => void;
}

type EntryCallback = (event: string) => void;

interface Entry extends SafeWatcher {
  callbacks: Set<EntryCallback>;
  rewatch: () => void;
  release: (callback: EntryCallback) => void;
  _fire: (event: string) => void;
}

const entries: Record<string, Entry | null> = Object.create(null);

// Folders that are watched recursively
let watchRoots = new Set<string>();

// Set of paths for which a change event has been fired, watched with
// watchLibrary.watch if available. This could be an LRU cache, but in
// practice it should never grow large enough for that to matter.
const changedPaths = new Set;

function hasPriority(absPath: string) {
  // If we're not prioritizing changed files, then all files have
  // priority, which means they should be watched with native file
  // watchers if the platform supports them. If we are prioritizing
  // changed files, then only changed files get priority.
  return PRIORITIZE_CHANGED
    ? changedPaths.has(absPath)
    : true;
}

function acquireWatcher(absPath: string, callback: EntryCallback) {
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

function startNewWatcher(absPath: string): Entry {
  let stat: Stats | BigIntStats | null | undefined = null;

  if (DEDUPLICATE_BY_INO) {
    stat = statOrNull(absPath);
    if (stat && stat.ino > 0 && entriesByIno.has(stat.ino)) {
      const entry = entriesByIno.get(stat.ino);
      if (entries[absPath] === entry) {
        return entry;
      }
    }
  } else {
    let entry = entries[absPath];
    if (entry) {
      return entry;
    }
  }

  function safeUnwatch() {
    if (watcher) {
      watcher.close();
      watcher = null;
      if (stat && stat.ino > 0) {
        entriesByIno.delete(stat.ino);
      }
    }
  }

  let lastWatcherEventTime = Date.now();
  const callbacks = new Set<EntryCallback>();
  let watcherCleanupTimer: ReturnType<typeof setTimeout> | null = null;
  let watcher: FSWatcher | null = null;

  // Determines the polling interval to be used for the fs.watchFile-based
  // safety net that works on all platforms and file systems.
  function getPollingInterval() {
    if (hasPriority(absPath)) {
      // Regardless of whether we have a native file watcher and it works
      // correctly on this file system, poll prioritized files (that is,
      // files that have been changed at least once) at a higher frequency
      // (every 500ms by default).
      return NO_WATCHER_POLLING_INTERVAL;
    }

    if (watcherEnabled || PRIORITIZE_CHANGED) {
      // As long as native file watching is enabled (even if it doesn't
      // work correctly) and the developer hasn't explicitly opted out of
      // the file watching priority system, poll unchanged files at a
      // lower frequency (every 5000ms by default).
      return DEFAULT_POLLING_INTERVAL;
    }

    // If native file watching is disabled and the developer has
    // explicitly opted out of the priority system, poll everything at the
    // higher frequency (every 500ms by default). Note that this leads to
    // higher idle CPU usage, so the developer may want to adjust the
    // METEOR_WATCH_POLLING_INTERVAL_MS environment variable.
    return NO_WATCHER_POLLING_INTERVAL;
  }

  function fire(event: string) {
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

    callbacks.forEach(cb => cb(event));
  }

  function watchWrapper(event: string) {
    lastWatcherEventTime = Date.now();
    fire(event);

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

  function watchFileWrapper(newStat: Stats, oldStat: Stats) {
    if (newStat.ino === 0 &&
        oldStat.ino === 0 &&
        +newStat.mtime === +oldStat.mtime) {
      // Node calls the watchFile listener once with bogus identical stat
      // objects, which should not trigger a file change event.
      return;
    }

    // If a watcher event fired in the last polling interval, ignore
    // this event.
    if (Date.now() - lastWatcherEventTime > getPollingInterval()) {
      fire("change");
    }
  }

  const entry = {
    callbacks,
    rewatch,

    release(callback: EntryCallback) {
      if (! entries[absPath]) {
        return;
      }

      callbacks.delete(callback);
      if (callbacks.size > 0) {
        return;
      }

      // Once there are no more callbacks in the Set, close both watchers
      // and nullify the shared data.
      if (watcherCleanupTimer) {
        clearTimeout(watcherCleanupTimer);
      }

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
    },
    _fire: fire
  };

  if (stat && stat.ino > 0) {
    entriesByIno.set(stat.ino, entry);
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

function statWatch(
  absPath: string,
  interval: number,
  callback: (current: Stats, previous: Stats) => void,
) {
  let statWatcher = statWatchers[absPath];

  if (!statWatcher) {
    statWatcher = {
      interval,
      changeListeners: [],
      stat: null
    };
    statWatchers[absPath] = statWatcher;
  }

  // If the interval needs to be changed, replace the watcher.
  // Node will only recreate the watcher with the new interval if all old
  // watchers are stopped (which unwatchFile does when not passed a
  // specific listener)
  if (statWatcher.interval !== interval && statWatcher.stat) {
    // This stops all stat watchers for the file, not just those created by
    // statWatch
    unwatchFile(absPath);
    statWatcher.stat = null;
    statWatcher.interval = interval;
  }

  if (!statWatcher.changeListeners.includes(callback)) {
    statWatcher.changeListeners.push(callback);
  }

  if (!statWatcher.stat) {
    const newStat = watchFile(absPath, {
      persistent: false, // never persistent
      interval,
    }, (newStat, oldStat) => {
      statWatcher.changeListeners.forEach((
        listener: (newStat: Stats, oldStat: Stats) => void
      ) => {
          listener(newStat, oldStat);
      });
    });

    newStat.on("stop", () => {
      if (statWatchers[absPath] === statWatch) {
        delete statWatchers[absPath];
      }
    });

    statWatcher.stat = newStat;
  }

  return statWatcher;
}

function watchLibraryWatch(absPath: string, callback: EntryCallback) {
  if (watcherEnabled && watcherLibrary === 'pathwatcher') {
    try {
      return pathwatcher.watch(convertToOSPath(absPath), callback);
    } catch (e: any) {
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
async function maybeSuggestRaisingWatchLimit(error: Error & { errno: number }) {
  var constants = require('constants');
  var archinfo = require('../utils/archinfo');
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

    // Check suggestedRaisingWatchLimit again because archinfo.host() may
    // have yielded.
    if (suggestedRaisingWatchLimit) return;
    suggestedRaisingWatchLimit = true;

    var Console = require('../console/console.js').Console;
    if (! Console.isHeadless()) {
      Console.arrowWarn(
        "It looks like a simple tweak to your system's configuration will " +
          "make many tools (including this Meteor command) more efficient. " +
          "To learn more, see " +
          Console.url("https://github.com/meteor/docs/blob/master/long-form/file-change-watcher-efficiency.md"));
    }
  }
}

export const watch = Profile(
  "safeWatcher.watch",
  (absPath: string, callback: EntryCallback) => {
    const entry = acquireWatcher(absPath, callback);
    return {
      close() {
        entry.release(callback);
      }
    } as SafeWatcher;
  }
);

const fireNames = {
  [nsfw.actions.CREATED]: 'change',
  [nsfw.actions.MODIFIED]: 'change',
  [nsfw.actions.DELETED]: 'delete'
}

export function addWatchRoot(absPath: string) {
  if (watchRoots.has(absPath) || watcherLibrary !== 'nsfw' || !watcherEnabled) {
    return;
  }

  watchRoots.add(absPath);

  // If there already is a watcher for a parent directory, there is no need
  // to create this watcher.
  for (const path of watchRoots) {
    let relativePath = pathRelative(path, absPath);
    if (
      path !== absPath &&
      !relativePath.startsWith('..') &&
      !relativePath.startsWith('/')
    ) {
      return;
    }
  }

  // TODO: check if there are any existing watchers that are children of this
  // watcher and stop them

  nsfw(
    convertToOSPath(absPath),
    (events) => {
      events.forEach(event => {
        if(event.action === nsfw.actions.RENAMED) {
          let oldPath = nativeJoin(event.directory, event.oldFile);
          let oldEntry = entries[toPosixPath(oldPath)];
          if (oldEntry) {
            oldEntry._fire('rename');
          }

          let path = nativeJoin(event.newDirectory, event.newFile);
          let newEntry = entries[toPosixPath(path)];
          if (newEntry) {
            newEntry._fire('change');
          }
        } else {
            let path = nativeJoin(event.directory, event.file);
            let entry = entries[toPosixPath(path)];
            if (entry) {
              entry._fire(fireNames[event.action]);
            }
        }
      })
    }
  ).then(watcher => {
    watcher.start()
  });
}
