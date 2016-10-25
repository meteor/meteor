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

// When in doubt, the optimistic caching system can be completely disabled
// by setting this environment variable.
const ENABLED = ! process.env.METEOR_DISABLE_OPTIMISTIC_CACHING;

function makeOptimistic(name, fn) {
  const wrapper = wrap(ENABLED ? function (...args) {
    maybeDependOnNodeModules(args[0]);
    return fn.apply(this, args);
  } : fn, {
    makeCacheKey(...args) {
      if (! ENABLED) {
        // Cache nothing when the optimistic caching system is disabled.
        return;
      }

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

      // Starting a watcher for every single file contained within a
      // node_modules directory would be prohibitively expensive, so
      // instead we rely on dependOnNodeModules to tell us when files in
      // node_modules directories might have changed.
      if (path.split(pathSep).indexOf("node_modules") >= 0) {
        return;
      }

      assert.ok(pathIsAbsolute(path));

      let watcher = watch(path, () => {
        wrapper.dirty(...args);
      });

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

function maybeDependOnNodeModules(path) {
  if (typeof path !== "string") {
    return;
  }

  const parts = path.split(pathSep);

  while (true) {
    const index = parts.lastIndexOf("node_modules");
    if (index < 0) {
      return;
    }

    parts.length = index + 1;
    dependOnNodeModules(parts.join(pathSep));
    assert.strictEqual(parts.pop(), "node_modules");
  }
}

let npmDepCount = 0;

// Called by any optimistic function that receives a */node_modules/* path
// as its first argument, so that we can later bulk-invalidate the results
// of those calls if the contents of the node_modules directory change.
// Note that this strategy will not detect changes within subdirectories
// of this node_modules directory, but that's ok because the use case we
// care about is adding or removing npm packages.
const dependOnNodeModules = wrap(nodeModulesDir => {
  assert(pathIsAbsolute(nodeModulesDir));
  assert(nodeModulesDir.endsWith(pathSep + "node_modules"));

  // Always return something different to prevent optimism from
  // second-guessing the dirtiness of this function.
  return ++npmDepCount;

}, {
  subscribe(nodeModulesDir) {
    let watcher = watch(
      nodeModulesDir,
      () => dependOnNodeModules.dirty(nodeModulesDir),
    );

    return function () {
      if (watcher) {
        watcher.close();
        watcher = null;
      }
    };
  }
});

// Invalidate all optimistic results derived from paths involving the
// given node_modules directory.
export function dirtyNodeModulesDirectory(nodeModulesDir) {
  dependOnNodeModules.dirty(nodeModulesDir);
}

export const optimisticStatOrNull = makeOptimistic("statOrNull", statOrNull);
export const optimisticLStat = makeOptimistic("lstat", lstat);
export const optimisticReadFile = makeOptimistic("readFile", readFile);
export const optimisticReaddir = makeOptimistic("readdir", readdir);
export const optimisticHashOrNull = makeOptimistic("hashOrNull", (...args) => {
  try {
    return sha1(optimisticReadFile(...args));

  } catch (e) {
    if (e.code !== "EISDIR" &&
        e.code !== "ENOENT") {
      throw e;
    }
  }

  return null;
});

export const optimisticReadJsonOrNull =
makeOptimistic("readJsonOrNull", (...args) => {
  try {
    var buffer = optimisticReadFile(...args);
  } catch (e) {
    if (e.code !== "ENOENT") {
      throw e;
    }
    return null;
  }
  return JSON.parse(buffer);
});
