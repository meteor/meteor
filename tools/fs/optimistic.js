import assert from "assert";
import { wrap } from "optimism";
import { Profile } from "../tool-env/profile.js";
import { watch } from "./safe-watcher.js";
import { sha1 } from "./watch.js";
import {
  pathSep,
  pathIsAbsolute,
  statOrNull,
  lstat,
  readFile,
  readdir,
} from "./files.js";

function makeOptimistic(name, fn) {
  const wrapper = wrap(fn, {
    makeCacheKey(...args) {
      const path = args[0];
      if (! pathIsAbsolute(path)) {
        return;
      }

      var parts = [];

      for (var i = 0; i < args.length; ++i) {
        var arg = args[i];

        if (typeof arg !== "string") {
          // If any of the arguments is not a string, then we won't cache the
          // result of the corresponding file.* method invocation.
          return;
        }

        parts.push(arg);
      }

      return parts.join("\0");
    },

    subscribe(...args) {
      const path = args[0];
      assert.ok(pathIsAbsolute(path));

      // Only start a watcher for files not in node_modules directories.
      // This results in caching the result until the server is fully
      // restarted, which isn't ideal, but it's better than wasting
      // thousands of watchers on rarely-changing node_modules files.
      if (path.split(pathSep).indexOf("node_modules") >= 0) {
        return;
      }

      var watcher = watch(path, () => wrapper.dirty(...args));

      return () => {
        if (watcher) {
          watcher.close();
          watcher = null;
        }
      };
    }
  });

  return Profile("optimistic " + name, wrapper);
}

export const optimisticStatOrNull = makeOptimistic("statOrNull", statOrNull);
export const optimisticLStat = makeOptimistic("lstat", lstat);
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
