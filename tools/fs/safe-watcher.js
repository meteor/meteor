import chokidar from "chokidar";
import { Profile } from "../tool-env/profile.js";
import {
  pathDirname,
  convertToOSPath,
} from "./files.js";

// This may seems like a long time to wait before actually closing the
// file watchers, but it's to our advantage if they survive restarts.
const WATCHER_CLEANUP_DELAY_MS = 30000;

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
  const callbacks = new Set;
  let watcherCleanupTimer = null;

  let watcher = chokidar.watch(convertToOSPath(absPath), {
    // Ignore initial "add" events.
    ignoreInitial: true,
    // Avoid recursively watching subdirectories.
    ignored(path) {
      return path !== absPath &&
        // If absPath is a directory and an event fires for a file that it
        // contains, fire callbacks for the directory.
        pathDirname(path) !== absPath;
    }
  }).on("all", Profile("chokidar callback", function (event, path) {
    callbacks.forEach(cb => cb.call(this, event, path));
  }));

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
      }, WATCHER_CLEANUP_DELAY_MS);
    }
  };
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
