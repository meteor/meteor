import assert from "assert";
import { wrap, OptimisticWrapperFunction, dep } from "optimism";
import ignore from "ignore";
import { Profile } from "../tool-env/profile";
import { watch, SafeWatcher } from "./safe-watcher";
import { sha1 } from "./watch";
import {
  pathSep,
  pathBasename,
  pathDirname,
  pathIsAbsolute,
  pathJoin,
  statOrNull,
  lstat,
  readFile,
  readdir,
  dependOnPath,
  findAppDir,
} from "./files";

// When in doubt, the optimistic caching system can be completely disabled
// by setting this environment variable.
const ENABLED = ! process.env.METEOR_DISABLE_OPTIMISTIC_CACHING;

function makeOptimistic<
  TArgs extends any[],
  TResult,
>(
  name: string,
  fn: (...args: TArgs) => TResult,
): OptimisticWrapperFunction<TArgs, TResult> {
  fn = Profile("optimistic " + name, fn);

  const wrapper = wrap(ENABLED ? function (this: any) {
    maybeDependOnPath(arguments[0]);
    return fn.apply(this, arguments as any);
  } as typeof fn : fn, {
    makeCacheKey(...args: TArgs) {
      if (! ENABLED) {
        // Cache nothing when the optimistic caching system is disabled.
        return;
      }

      const path = args[0];
      if (! pathIsAbsolute(path)) {
        return;
      }

      if (! args.every(arg => typeof arg === "string")) {
        // If any of the arguments is not a string, then we won't cache the
        // result of the corresponding file.* method invocation.
        return;
      }

      return args.join("\0");
    },

    subscribe(...args: TArgs) {
      const path = args[0];

      if (! shouldWatch(path)) {
        return;
      }

      assert.ok(pathIsAbsolute(path));

      let watcher: SafeWatcher | null = watch(path, () => {
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

  return wrapper;
}

// The Meteor application directory should never change during the lifetime
// of the build process, so it should be safe to cache findAppDir without
// subscribing to file changes.
const optimisticFindAppDir = wrap(findAppDir);

const shouldWatch = wrap(Profile("shouldWatch", (path: string) => {
  const parts = path.split(pathSep);
  const nmi = parts.indexOf("node_modules");

  if (nmi < 0) {
    // Watch everything not in a node_modules directory.
    return true;
  }

  const dotMeteorIndex = parts.lastIndexOf(".meteor", nmi);
  if (dotMeteorIndex >= 0) {
    // Watch nothing inside of .meteor, at least for the purposes of the
    // optimistic caching system. Meteor watches files inside .meteor/local
    // via the WatchSet abstraction, unrelatedly.
    return false;
  }

  if (nmi < parts.length - 1) {
    const nmi2 = parts.indexOf("node_modules", nmi + 1);
    if (nmi2 > nmi) {
      // If this path is nested inside more than one node_modules
      // directory, then it isn't part of a linked npm package, so we
      // should not watch it.
      return false;
    }

    const parentDirParts = parts.slice(0, nmi);
    const parentDir = parentDirParts.join(pathSep);
    const appDir = optimisticFindAppDir(parentDir);
    if (
      appDir &&
      parentDir.startsWith(appDir) &&
      appDir.split(pathSep).length < parentDirParts.length
    ) {
      // If the given path is contained by the Meteor application directory,
      // but the node_modules directory we're considering is not directly
      // contained by the root application directory, watch the file. See
      // discussion in issue https://github.com/meteor/meteor/issues/10664
      return true;
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
}));

function maybeDependOnPath(path: string) {
  if (typeof path === "string") {
    dependOnPath(path);
    maybeDependOnNodeModules(path);
  }
}

function maybeDependOnNodeModules(path: string) {
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

const dependOnDirectory = dep({
  subscribe(dir: string) {
    let watcher: SafeWatcher | null = watch(
      dir,
      () => dependOnDirectory.dirty(dir),
    );

    return function () {
      if (watcher) {
        watcher.close();
        watcher = null;
      }
    };
  },
});

// Called when an optimistic function detects the given file does not
// exist, but needs to return null or false rather than throwing an
// exception. When/if the file is eventually created, we might only get a
// file change notification for the parent directory, so it's important to
// depend on the parent directory using this function, so that we don't
// cache the unsuccessful result forever.
function dependOnParentDirectory(path: string) {
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
function dependOnNodeModules(nodeModulesDir: string) {
  assert(pathIsAbsolute(nodeModulesDir));
  assert(nodeModulesDir.endsWith(pathSep + "node_modules"));
  dependOnDirectory(nodeModulesDir);
}

// Invalidate all optimistic results derived from paths involving the
// given node_modules directory.
export function dirtyNodeModulesDirectory(nodeModulesDir: string) {
  dependOnDirectory.dirty(nodeModulesDir);
}

export const optimisticStatOrNull = makeOptimistic("statOrNull", (path: string) => {
  const result = statOrNull(path);
  if (result === null) {
    dependOnParentDirectory(path);
  }
  return result;
});

export const optimisticLStat = makeOptimistic("lstat", lstat);
export const optimisticLStatOrNull = makeOptimistic("lstatOrNull", (path: string) => {
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
export const optimisticHashOrNull = makeOptimistic("hashOrNull", (
  path: string,
  options?: Parameters<typeof optimisticReadFile>[1],
) => {
  try {
    return sha1(optimisticReadFile(path, options)) as string;

  } catch (e) {
    if (e.code !== "EISDIR" &&
        e.code !== "ENOENT") {
      throw e;
    }
  }

  dependOnParentDirectory(path);

  return null;
});

// A more tolerant implementation of JSON.parse.
const { parse: jsonParse } = require("json5");

export const optimisticReadJsonOrNull =
makeOptimistic("readJsonOrNull", (
  path: string,
  options?: Parameters<typeof optimisticReadFile>[1] & {
    allowSyntaxError?: boolean;
  },
) => {
  try {
    return jsonParse(
      optimisticReadFile(path, options)
    ) as Record<string, any>;

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

export const optimisticReadMeteorIgnore = wrap((dir: string) => {
  const meteorIgnorePath = pathJoin(dir, ".meteorignore");
  const meteorIgnoreStat = optimisticStatOrNull(meteorIgnorePath);

  if (meteorIgnoreStat &&
      meteorIgnoreStat.isFile()) {
    return ignore().add(
      optimisticReadFile(meteorIgnorePath).toString("utf8")
    );
  }

  return null;
});

type LookupPkgJsonType = OptimisticWrapperFunction<
  [string, string],
  ReturnType<typeof optimisticReadJsonOrNull>
>;

export const optimisticLookupPackageJson: LookupPkgJsonType =
wrap((absRootDir: string, relDir: string) => {
  const absPkgJsonPath = pathJoin(absRootDir, relDir, "package.json");
  const pkgJson = optimisticReadJsonOrNull(absPkgJsonPath);
  if (pkgJson && typeof pkgJson.name === "string") {
    return pkgJson;
  }

  const relParentDir = pathDirname(relDir);
  if (relParentDir === relDir) {
    return null;
  }

  // Stop searching if an ancestor node_modules directory is encountered.
  if (pathBasename(relParentDir) === "node_modules") {
    return null;
  }

  return optimisticLookupPackageJson(absRootDir, relParentDir);
});

const optimisticIsSymbolicLink = wrap((path: string) => {
  try {
    return lstat(path).isSymbolicLink();
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    dependOnParentDirectory(path);
    return false;
  }
}, {
  subscribe(path) {
    let watcher: SafeWatcher | null = watch(path, () => {
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
