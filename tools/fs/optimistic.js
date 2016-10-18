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
  const wrapper = wrap(function (...args) {
    const packageName = getNpmPackageName(args[0]);
    if (packageName) {
      dependOnNpmPackage(packageName);
    }
    return fn.apply(this, args);
  }, {
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

      // Only start watchers for files not in node_modules directories.
      // This means caching the result until the server is restarted, or
      // until we call dirtyNpmPackageBy{Path,Name} explicitly, but that's
      // better than wasting thousands of watchers on rarely-changing
      // node_modules files.
      if (getNpmPackageName(path)) {
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

// Return the name of the subdirectory just after the last node_modules
// directory in the given path, if possible; else return undefined.
function getNpmPackageName(path) {
  if (typeof path === "string") {
    const parts = path.split(pathSep);

    // In case the path ends with node_modules, look for the previous
    // node_modules directory.
    const lastAcceptableIndex = parts.length - 2;
    const index = parts.lastIndexOf("node_modules", lastAcceptableIndex);

    if (index >= 0) {
      return parts[index + 1] || void 0;
    }
  }
}

// See comment in dependOnNpmPackage.
let npmDepCount = 0;

// Called by any optimistic function that receives a */node_modules/* path
// as its first argument, so that we can later bulk-invalidate the results
// of those calls when/if the package (or, more precisely, any package of
// the same name) changes.
const dependOnNpmPackage = wrap(packageName => {
  // Always return something different to prevent optimism from
  // second-guessing the dirtiness of this function.
  return ++npmDepCount;
});

// Invalidate all optimistic results derived from paths involving npm
// packages with the given packageName. If there are multiple copies of
// the package installed, they all get invalidated, because that's a small
// price to pay for the comfort of not having to keep the copies straight
// as they get copied around, deleted, et cetera.
export function dirtyNpmPackageByName(packageName) {
  dependOnNpmPackage.dirty(packageName);
}

// Invalidate all optimistic results derived from paths involving an npm
// package whose name equals getNpmPackageName(path).
export function dirtyNpmPackageByPath(path) {
  const packageName = getNpmPackageName(path);
  if (packageName) {
    dirtyNpmPackageByName(packageName);
  }
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
    return JSON.parse(optimisticReadFile(...args));
  } catch (e) {
    if (! (e instanceof SyntaxError ||
           e.code === "ENOENT")) {
      throw e;
    }
  }
  return null;
});
