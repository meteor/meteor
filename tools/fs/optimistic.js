import assert from "assert";
import LRU from "lru-cache";
import { Profile } from "../tool-env/profile.js";
import { watch } from "./safe-pathwatcher.js";
import { sha1 } from "./watch.js";
import {
  pathSep,
  pathIsAbsolute,
  statOrNull,
  readFile,
  readdir,
} from "./files.js";

function makeOptimistic(name, fn) {
  assert.strictEqual(typeof fn, "function");

  const cache = new LRU({
    max: Math.pow(2, 14),
    dispose(path, entry) {
      if (entry.watcher) {
        entry.watcher.close();
        entry.watcher = null;
      }
    }
  });

  return Profile("optimistic " + name, (...args) => {
    const path = args[0];
    if (! pathIsAbsolute(path)) {
      return fn(...args);
    }

    const key = makeCacheKey(args);
    if (! key) {
      return fn(...args);
    }

    let entry = cache.get(path);

    if (! entry) {
      entry = maybeStartWatcher(path, key);

      if (! entry) {
        return fn(...args);
      }

      entry.results = Object.create(null);

      // Equivalent to a cache miss, because there is no "value" key.
      entry.results[key] = { error: false };

      cache.set(path, entry);
    }

    const result = entry.results[key];

    if ("value" in result) {
      if (result.error) {
        throw result.value;
      }
      return result.value;
    }

    return tryApply(result, fn, args);
  });
}

function maybeStartWatcher(path, key) {
  const entry = Object.create(null);

  if (path.split(pathSep).indexOf("node_modules") >= 0) {
    // Avoid starting a watcher for files in node_modules directories.
    // This effectively results in caching the result until the server is
    // fully restarted, which isn't ideal, but it's better than wasting
    // thousands of watchers on rarely-changing node_modules files.
    return entry;
  }

  try {
    entry.watcher = watch(path, (...args) => {
      const result = entry.results[key];
      // Trigger a cache miss the next time anyone asks.
      delete result.value;
      result.error = false;
    });

  } catch (e) {
    // If we can't watch the file, we must not cache the result.
    return null;
  }

  return entry;
}

function tryApply(result, fn, args) {
  try {
    result.value = fn(...args)
    result.error = false;
  } catch (e) {
    result.error = true;
    throw result.value = e;
  }

  return result.value;
}

function makeCacheKey(args) {
  var parts = [];

  for (var i = 0; i < args.length; ++i) {
    var arg = args[i];

    if (typeof arg !== "string") {
      // If any of the arguments is not a string, then we won't cache the
      // result of the corresponding file.* method invocation.
      return null;
    }

    parts.push(arg);
  }

  return parts.join("\0");
}

export const optimisticStatOrNull = makeOptimistic("statOrNull", statOrNull);
export const optimisticReadFile = makeOptimistic("readFile", readFile);
export const optimisticReaddir = makeOptimistic("readdir", readdir);
export const optimisticHashOrNull = makeOptimistic("hashOrNull", path => {
  try {
    return sha1(optimisticReadFile(path));

  } catch (e) {
    if (e.code !== "EISDIR" &&
        e.code !== "ENOENT") {
      throw e;
    }
  }

  return null;
});
