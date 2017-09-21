import assert from "assert";
import { wrap } from "optimism";
import { Profile } from "../tool-env/profile.js";
import { watch } from "./safe-watcher.js";
import { sha1 } from "./watch.js";
import {
  pathSep,
  pathDirname,
  pathIsAbsolute,
  pathJoin,
  statOrNull,
  lstat,
  readFile,
  readdir,
  dependOnPath,
} from "./files.js";

// When in doubt, the optimistic caching system can be completely disabled
// by setting this environment variable.
const ENABLED = ! process.env.METEOR_DISABLE_OPTIMISTIC_CACHING;

function makeOptimistic(name, fn) {
  const wrapper = wrap(ENABLED ? function (...args) {
    maybeDependOnPath(args[0]);
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

      if (! shouldWatch(path)) {
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

export const shouldWatch = wrap(path => {
  const parts = path.split(pathSep);
  const nmi = parts.indexOf("node_modules");

  if (nmi < 0) {
    // Watch everything not in a node_modules directory.
    return true;
  }

  if (nmi < parts.length - 1) {
    const nmi2 = parts.indexOf("node_modules", nmi + 1);
    if (nmi2 > nmi) {
      // If this path is nested inside more than one node_modules
      // directory, then it isn't part of a linked npm package, so we
      // should not watch it.
      return false;
    }

    const packageDirParts = parts.slice(0, nmi + 2);

    if (parts[nmi + 1].startsWith("@")) {
      // For linked @scoped npm packages, the symlink is nested inside the
      // @scoped directory (which is a child of node_modules).
      packageDirParts.push(parts[nmi + 2]);
    }

    const packageDir = packageDirParts.join(pathSep);
    if (optimisticIsSymbolicLink(packageDir)) {
      // If this path is in a linked npm package, then it might be under
      // active development, so we should watch it.
      return true;
    }
  }

  // Starting a watcher for every single file contained within a
  // node_modules directory would be prohibitively expensive, so
  // instead we rely on dependOnNodeModules to tell us when files in
  // node_modules directories might have changed.
  return false;
});

function maybeDependOnPath(path) {
  if (typeof path === "string") {
    dependOnPath(path);
    maybeDependOnNodeModules(path);
  }
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

let dependOnDirectorySalt = 0;

const dependOnDirectory = wrap(dir => {
  // Always return something different to prevent optimism from
  // second-guessing the dirtiness of this function.
  return ++dependOnDirectorySalt;
}, {
  subscribe(dir) {
    let watcher = watch(
      dir,
      () => dependOnDirectory.dirty(dir),
    );

    return function () {
      if (watcher) {
        watcher.close();
        watcher = null;
      }
    };
  }
});

// Called when an optimistic function detects the given file does not
// exist, but needs to return null or false rather than throwing an
// exception. When/if the file is eventually created, we might only get a
// file change notification for the parent directory, so it's important to
// depend on the parent directory using this function, so that we don't
// cache the unsuccessful result forever.
function dependOnParentDirectory(path) {
  const parentDir = pathDirname(path);
  if (parentDir !== path) {
    dependOnDirectory(parentDir);
  }
}

// Called by any optimistic function that receives a */node_modules/* path
// as its first argument, so that we can later bulk-invalidate the results
// of those calls if the contents of the node_modules directory change.
// Note that this strategy will not detect changes within subdirectories
// of this node_modules directory, but that's ok because the use case we
// care about is adding or removing npm packages.
const dependOnNodeModules = wrap(nodeModulesDir => {
  assert(pathIsAbsolute(nodeModulesDir));
  assert(nodeModulesDir.endsWith(pathSep + "node_modules"));
  return dependOnDirectory(nodeModulesDir);
});

// Invalidate all optimistic results derived from paths involving the
// given node_modules directory.
export function dirtyNodeModulesDirectory(nodeModulesDir) {
  dependOnNodeModules.dirty(nodeModulesDir);
}

export const optimisticStatOrNull = makeOptimistic("statOrNull", path => {
  const result = statOrNull(path);
  if (result === null) {
    dependOnParentDirectory(path);
  }
  return result;
});

export const optimisticLStat = makeOptimistic("lstat", lstat);
export const optimisticLStatOrNull = makeOptimistic("lstatOrNull", path => {
  try {
    return optimisticLStat(path);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    dependOnParentDirectory(path);
    return null;
  }
});
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

  dependOnParentDirectory(args[0]);

  return null;
});

export const optimisticReadJsonOrNull =
makeOptimistic("readJsonOrNull", (path, options) => {
  try {
    return JSON.parse(optimisticReadFile(path, options));

  } catch (e) {
    if (e.code === "ENOENT") {
      dependOnParentDirectory(path);
      return null;
    }

    if (e instanceof SyntaxError &&
        options && options.allowSyntaxError) {
      return null;
    }

    throw e;
  }
});

export const optimisticReadMeteorIgnore = wrap(dir => {
  const meteorIgnorePath = pathJoin(dir, ".meteorignore");
  const meteorIgnoreStat = optimisticStatOrNull(meteorIgnorePath);

  if (meteorIgnoreStat &&
      meteorIgnoreStat.isFile()) {
    return require("ignore")().add(
      optimisticReadFile(meteorIgnorePath, "utf8")
    );
  }

  return null;
});

const optimisticIsSymbolicLink = wrap(path => {
  try {
    return lstat(path).isSymbolicLink();
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    dependOnParentDirectory(path);
    return false;
  }
}, {
  subscribe(path) {
    let watcher = watch(path, () => {
      optimisticIsSymbolicLink.dirty(path);
    });

    return function () {
      if (watcher) {
        watcher.close();
        watcher = null;
      }
    };
  }
});
