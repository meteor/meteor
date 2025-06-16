import { Stats } from 'fs';
import ParcelWatcher from "@parcel/watcher";
import { watch as watchLegacy, addWatchRoot as addWatchRootLegacy, closeAllWatchers as closeAllWatchersLegacy } from './safe-watcher-legacy';

import { Profile } from "../tool-env/profile";
import { statOrNull, lstat, toPosixPath, convertToOSPath, pathRelative, watchFile, unwatchFile, pathResolve, pathDirname } from "./files";

// Register process exit handlers to ensure subscriptions are properly cleaned up
const registerExitHandlers = () => {

  // For SIGINT and SIGTERM, we need to handle the async cleanup before the process exits
  const cleanupAndExit = (signal: string) => {
    // Clear the timeout if cleanup completes successfully
    closeAllWatchers().then(() => {
      process.exit(0);
    }).catch(err => {
      console.error(`Error closing watchers on ${signal}:`, err);
      process.exit(1);
    });
  };

  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', () => cleanupAndExit('SIGINT'));

  // Handle SIGTERM
  process.on('SIGTERM', () => cleanupAndExit('SIGTERM'));

  // Handle 'exit' event
  process.on('exit', () => {
    try {
      for (const root of Array.from(watchRoots)) {
        const sub = dirSubscriptions.get(root);
        if (sub) {
          sub.unsubscribe();
          dirSubscriptions.delete(root);
          watchRoots.delete(root);
        }
      }
    } catch (err) {
      console.error('Error during synchronous cleanup on exit:', err);
    }
  });
};

export type SafeWatcher = { close: () => void; };

type ChangeCallback = (event: string) => void;

interface Entry extends SafeWatcher {
  callbacks: Set<ChangeCallback>;
  _fire(event: string): void;
}

// Registry mapping normalized absolute paths to their watcher entry.
const entries = new Map<string, Entry | null>();

// Registry mapping normalized absolute paths to their polling watchers.
// Each path can have multiple callbacks, but only one active watcher.
interface PollingWatcherInfo {
  callbacks: Set<ChangeCallback>;
  pollCallback: (curr: Stats, prev: Stats) => void;
}
const pollingWatchers = new Map<string, PollingWatcherInfo>();

function getEntry(path: string): Entry | null | undefined {
  return entries.get(path);
}

function setEntry(path: string, entry: Entry | null): void {
  entries.set(path, entry);
}

function deleteEntry(path: string): void {
  entries.delete(path);
}

function findNearestEntry(startPath: string): Entry | null {
  let currentPath = pathResolve(startPath);

  while (true) {
    const entry = getEntry(currentPath);
    if (entry) {
      return entry; // Found it!
    }

    const parentPath = pathDirname(currentPath);
    if (parentPath === currentPath) {
      // Reached root
      break;
    }

    currentPath = parentPath;
  }

  return null;
}

// Watch roots are directories for which we have an active ParcelWatcher subscription.
const watchRoots = new Set<string>();
// For each watch root, store its active subscription.
const dirSubscriptions = new Map<string, ParcelWatcher.AsyncSubscription>();
// A set of roots that are known to be unwatchable.
const ignoredWatchRoots = new Set<string>();

// A set of roots that are known to be symbolic links.
const symlinkRoots = new Set<string>();

// Set METEOR_WATCH_FORCE_POLLING environment variable to a truthy value to
// force the use of files.watchFile instead of ParcelWatcher.
let watcherEnabled = !JSON.parse(process.env.METEOR_WATCH_FORCE_POLLING || "false");

/**
 * Polling fallback globals.
 * The legacy Meteor strategy used polling for cases where native watchers failed.
 * We keep track of files that changed, so that we can poll them faster.
 */
var DEFAULT_POLLING_INTERVAL =
    +(process.env.METEOR_WATCH_POLLING_INTERVAL_MS || 5000);

var NO_WATCHER_POLLING_INTERVAL =
    +(process.env.METEOR_WATCH_POLLING_INTERVAL_MS || 500);

var PRIORITIZE_CHANGED = true;
if (process.env.METEOR_WATCH_PRIORITIZE_CHANGED &&
    ! JSON.parse(process.env.METEOR_WATCH_PRIORITIZE_CHANGED)) {
  PRIORITIZE_CHANGED = false;
}

// Set of paths for which a change event has been fired, watched with
// watchLibrary.watch if available.
const changedPaths = new Set;

function shouldIgnorePath(absPath: string): boolean {
  const posixPath = toPosixPath(absPath);
  const parts = posixPath.split('/');

  const cwd = toPosixPath(process.cwd());
  const isWithinCwd = absPath.startsWith(cwd);

  if (isWithinCwd && absPath.includes(`${cwd}/.meteor/local`)) {
    return true;
  }

  // Check for .meteor: allow the .meteor directory itself,
  // but ignore its "local" subdirectory (or any immediate child folder that indicates cache).
  const meteorIndex = parts.indexOf(".meteor");
  if (meteorIndex !== -1) {
    const nextPart = parts[meteorIndex + 1];
    if (nextPart && nextPart === "local") {
      // Ignore anything inside .meteor/local
      return true;
    }
    // Otherwise, do not automatically ignore .meteor (which includes .meteor/packages, etc).
  }

  // For project node_modules: check if it's a direct node_modules/<package>
  if (isWithinCwd) {
    // Check if it's the project node_modules
    if (absPath.includes(`${cwd}/node_modules`)) {
      // Check if it's a direct node_modules/<package> path
      const relPath = absPath.substring(cwd.length + 1); // +1 for the slash
      const relParts = relPath.split('/');
      if (relParts.length >= 2 && relParts[0] === 'node_modules') {
        // If it's a direct node_modules/<package>, check if it's a symlink
        // We'll return false here (don't ignore) so that the code can later decide to use polling
        // based on isSymbolicLink check in the watch function
        if (relParts.length === 2 && isSymbolicLink(absPath)) {
          return false;
        }
        // Check if it's within a symlink root to not ignore
        if (isWithinSymlinkRoot(absPath)) {
          return false;
        }
      }
      return true;
    } else {
      // Otherwise, don't ignore non-npm node_modules
      return false;
    }
  }

  // For external node_modules: check if it's a direct node_modules/<package>
  const nmIndex = parts.indexOf("node_modules");
  if (nmIndex !== -1) {
    // Don't ignore node_modules within .npm/package/ paths
    const npmPackageIndex = parts.indexOf(".npm");
    if (npmPackageIndex !== -1 && parts[npmPackageIndex + 1] === "package" && 
        nmIndex > npmPackageIndex && parts[nmIndex - 1] === "package") {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Check if a path is a symbolic link.
 * 
 * Symbolic links are not supported natively in some operating systems,
 * so we need to use polling for them to ensure they are properly watched.
 * This function is used to determine if a path is a symbolic link,
 * so we can use polling instead of native watching for it.
 * 
 * If a path is a symbolic link, its root is added to the symlinkRoots set.
 */
function isSymbolicLink(absPath: string, addToRoots = true): boolean {
  try {
    const osPath = convertToOSPath(absPath);
    const stat = lstat(osPath);
    if (stat?.isSymbolicLink()) {
      if (addToRoots) {
        // Add the directory containing the symlink to the symlinkRoots set
        const symlinkRoot = toPosixPath(absPath);
        symlinkRoots.add(symlinkRoot);
        // Rewatch using polling any existing watchers under this symlink root
        rewatchPolling(symlinkRoot);
      }
      return true;
    }
    return false;
  } catch (e) {
    // If we can't stat the file, assume it's not a symlink
    return false;
  }
}

/**
 * Check if a path is within any symlink root.
 * 
 * This is used to determine if a path should use polling instead of native watching,
 * even if it's not a symlink itself.
 */
function isWithinSymlinkRoot(absPath: string): boolean {
  for (const root of symlinkRoots) {
    // Check if absPath starts with root + '/'
    if (absPath === root || (absPath.startsWith(root) && absPath.charAt(root.length) === '/')) {
      return true;
    }
  }
  return false;
}

/**
 * Ensure that the given directory is being watched by @parcel/watcher.
 * If it is not a directory or is unwatchable, it is immediately added to an ignore set.
 */
async function ensureWatchRoot(dirPath: string): Promise<void> {
  if (!watcherEnabled || watchRoots.has(dirPath) || ignoredWatchRoots.has(dirPath)) {
    return;
  }

  // If an ancestor is already watched, skip this one.
  for (const root of watchRoots) {
    const rel = pathRelative(root, dirPath);
    if (root !== dirPath && !rel.startsWith("..") && !rel.startsWith("/")) {
      return;
    }
  }

  // Remove any existing roots that are now encompassed by the new one.
  for (const root of Array.from(watchRoots)) {
    const rel = pathRelative(dirPath, root);
    if (root !== dirPath && !rel.startsWith("..") && !rel.startsWith("/")) {
      const sub = dirSubscriptions.get(root);
      if (sub) {
        try {
          await sub.unsubscribe();
        } catch (_) {
          /* ignore errors */
        }
      }
      dirSubscriptions.delete(root);
      watchRoots.delete(root);
    }
  }

  const osDirPath = convertToOSPath(dirPath);
  // Check that osDirPath is indeed a directory.
  try {
    const stats = statOrNull(osDirPath);
    if (!stats?.isDirectory()) {
      console.warn(`Skipping watcher for ${osDirPath}: not a directory`);
      ignoredWatchRoots.add(dirPath);
      return;
    }
  } catch (e) {
    console.error(`Failed to stat ${osDirPath}:`, e);
    ignoredWatchRoots.add(dirPath);
    return;
  }

  // Set up ignore patterns to skip node_modules and .meteor/local cache
  const cwd = toPosixPath(process.cwd());
  const isWithinCwd = dirPath.startsWith(cwd);
  const ignPrefix = isWithinCwd ? "" : "**/";
  const ignorePatterns = [`${ignPrefix}node_modules/**`, `${ignPrefix}.meteor/local/**`];
  try {
    watchRoots.add(dirPath);
    const subscription = await ParcelWatcher.subscribe(
        osDirPath,
        (err, events) => {
          if (err) {
            if (/Events were dropped/.test(err.message)) {
              return;
            }
            console.error(`Parcel watcher error on ${osDirPath}:`, err);
            // Only disable native watching for critical errors (like ENOSPC).
            // @ts-ignore
            if (err.code === "ENOSPC" || err.errno === require("constants").ENOSPC) {
              fallbackToPolling();
            }
            watchRoots.delete(dirPath);
            return;
          }
          // Dispatch each event to any registered entries.
          for (const event of events) {
            const changedPath = toPosixPath(event.path);
            const entry = findNearestEntry(changedPath);
            if (!entry) continue;
            // In Meteor's safe-watcher API, both create/update trigger "change" events.
            const evtType = event.type === "delete" ? "delete" : "change";
            entry._fire(evtType);
          }
        },
        { ignore: ignorePatterns }
    );
    dirSubscriptions.set(dirPath, subscription);
  } catch (e: any) {
    if (
        e &&
        (e.code === "ENOTDIR" ||
            /Not a directory/.test(e.message) ||
            e.code === "EBADF" ||
            /Bad file descriptor/.test(e.message))
    ) {
      console.warn(`Skipping watcher for ${osDirPath}: not a directory`);
      ignoredWatchRoots.add(dirPath);
    } else {
      console.error(`Failed to start watcher for ${osDirPath}:`, e);
      if (e.code === "ENOSPC" || e.errno === require("constants").ENOSPC) {
        fallbackToPolling();
      }
    }
    watchRoots.delete(dirPath);
  }
}

/**
 * Creates a new watch entry for a specific file (or directory) and
 * holds its registered callbacks.
 */
function startNewEntry(absPath: string): Entry {
  const callbacks = new Set<ChangeCallback>();
  let closed = false;
  const entry: Entry = {
    callbacks,
    close() {
      if (closed) return;
      closed = true;
      deleteEntry(absPath);
    },
    _fire(event: string) {
      callbacks.forEach(cb => {
        try {
          cb(event);
        } catch (e) {
          // Ignore callback errors.
        }
      });
    }
  };
  return entry;
}

/**
 * The primary API function to watch a file or directory.
 * This registers the callback on the internally managed entry and
 * ensures that a Parcel watcher is subscribed to a covering directory.
 */
export function watch (absPath: string, callback: ChangeCallback): SafeWatcher {
  // @ts-ignore
  if (!global.modernWatcher) {
    // @ts-ignore
    return watchLegacy(absPath, callback);
  }
  // @ts-ignore
  return watchModern(absPath, callback);
};

const watchModern =
    Profile(
    "safeWatcher.watchModern",
    (
    absPath: string,
    callback: ChangeCallback
    ): SafeWatcher => {
      absPath = toPosixPath(absPath);

      // If the path should be ignored, immediately return a noop SafeWatcher.
      if (shouldIgnorePath(absPath)) {
        return { close() {} };
      }
      // If native watching is disabled, the path is a symbolic link, or the path is within a symlink root,
      // use the polling strategy. Symbolic links are not supported natively in some operating systems,
      // and paths within symlink roots should also use polling for consistency.
      if (!watcherEnabled || isWithinSymlinkRoot(absPath) || isSymbolicLink(absPath)) {
        return startPolling(absPath, callback);
      }
      // Try to reuse an existing entry if one was created before.
      let entry = getEntry(absPath);
      if (!entry) {
        entry = startNewEntry(absPath);
        setEntry(absPath, entry);
        // Determine the directory that should be watched.
        let watchTarget: string;
        try {
          const st = statOrNull(convertToOSPath(absPath));
          watchTarget = st?.isDirectory() ? absPath : toPosixPath(pathDirname(convertToOSPath(absPath)));
        } catch (e) {
          watchTarget = toPosixPath(pathDirname(convertToOSPath(absPath)));
        }
        // Set up a watcher on the parent directory (or the directory itself) if not already active.
        ensureWatchRoot(watchTarget);
      }
      // Register the callback for this file.
      entry.callbacks.add(callback);
      return {
        close() {
          const entry = getEntry(absPath);
          if (entry) {
            entry.callbacks.delete(callback);
            if (entry.callbacks.size === 0) {
              entry.close();
            }
          }
        }
      };
});

/**
 * Externally force a directory to be watched.
 * If the provided path is a file, its parent directory is used.
 */
export function addWatchRoot(absPath: string) {
  // @ts-ignore
  if (!global.modernWatcher) {
    // @ts-ignore
    return addWatchRootLegacy(absPath);
  }

  absPath = toPosixPath(absPath);
  let watchTarget = absPath;
  try {
    const st = statOrNull(convertToOSPath(absPath));
    if (!st?.isDirectory()) {
      watchTarget = toPosixPath(pathDirname(convertToOSPath(absPath)));
    }
  } catch (e) {
    watchTarget = toPosixPath(pathDirname(convertToOSPath(absPath)));
  }
  ensureWatchRoot(watchTarget);
}

async function safeUnsubscribeSub(root: string) {
  const sub = dirSubscriptions.get(root);
  if (!sub) return;  // Already unsubscribed.
  // Remove from our maps immediately to prevent further unsubscribe calls.
  dirSubscriptions.delete(root);
  watchRoots.delete(root);
  try {
    await sub.unsubscribe();
  } catch (e) {
    console.error(`Error during unsubscribe for ${root}:`, e);
  }
}

export async function closeAllWatchers() {
  // @ts-ignore
  if (!global.modernWatcher) {
    // @ts-ignore
    return closeAllWatchersLegacy();
  }
  for (const root of Array.from(watchRoots)) {
    await safeUnsubscribeSub(root);
  }
}

function hasPriority(absPath: string) {
  // If we're not prioritizing changed files, then all files have
  // priority, which means they should be watched with native file
  // watchers if the platform supports them. If we are prioritizing
  // changed files, then only changed files get priority.
  return PRIORITIZE_CHANGED
      ? changedPaths.has(absPath)
      : true;
}

// Determines the polling interval to be used for the fs.watchFile-based
// safety net that works on all platforms and file systems.
function getPollingInterval(absPath: string): number {
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

function startPolling(absPath: string, callback: ChangeCallback): SafeWatcher {
  const osPath = convertToOSPath(absPath);
  // Initial polling interval.
  let interval = getPollingInterval(absPath);

  // Check if we already have a polling watcher for this path
  let watcherInfo = pollingWatchers.get(absPath);

  if (watcherInfo) {
    // Add this callback to the existing watcher
    watcherInfo.callbacks.add(callback);
  } else {
    // Create a new polling watcher
    const pollCallback = (curr: Stats, prev: Stats) => {
      // Compare modification times to detect a change.
      if (+curr.mtime !== +prev.mtime) {
        changedPaths.add(absPath);
        // Notify all callbacks registered for this path
        const info = pollingWatchers.get(absPath);
        if (info) {
          for (const cb of info.callbacks) {
            cb("change");
          }
        }
      }
    };

    watchFile(osPath, { interval }, pollCallback);

    // Store the new watcher info
    watcherInfo = {
      callbacks: new Set([callback]),
      pollCallback
    };
    pollingWatchers.set(absPath, watcherInfo);
  }

  return {
    close() {
      const info = pollingWatchers.get(absPath);
      if (info) {
        // Remove this callback
        info.callbacks.delete(callback);

        // If no callbacks remain, remove the watcher
        if (info.callbacks.size === 0) {
          unwatchFile(osPath, info.pollCallback);
          pollingWatchers.delete(absPath);
          changedPaths.delete(absPath);
        }
      }
    }
  };
}

/**
 * Rewatch entries under a symlink root from native watchers to polling watchers.
 * This is called when a new symlink root is discovered.
 */
function rewatchPolling(root: string) {
  for (const [watchedPath, entry] of entries) {
    // if it lives under the new symlink root...
    if (watchedPath === root ||
        (watchedPath.startsWith(root) && watchedPath.charAt(root.length) === '/')) {
      // Skip if entry is null or already closed
      if (!entry) continue;

      // Store the callbacks before closing the entry
      const callbacks = Array.from(entry.callbacks);

      // Tear down the old native watcher
      entry.close();

      // Remove it from the map
      entries.delete(watchedPath);

      // Re-watch via polling for each callback
      for (const cb of callbacks) {
        startPolling(watchedPath, cb);
      }
    }
  }
}

/**
 * Fall back to polling. If a critical error occurs,
 * we disable native watching and close all existing native watchers.
 */
function fallbackToPolling() {
  if (watcherEnabled) {
    console.error("Critical native watcher error encountered. Falling back to polling for all entries.");
    watcherEnabled = false;
    closeAllWatchers();
  }
}

// Register exit handlers to ensure proper cleanup of subscriptions
registerExitHandlers();
