import {
  isString,
  isObject,
  isFunction,
  each,
  has,
} from "underscore";

import { sha1 } from "../fs/watch.js";
import { matches as archMatches } from "../utils/archinfo.js";
import {
  pathJoin,
  pathRelative,
  pathNormalize,
  pathDirname,
  pathBasename,
  convertToOSPath,
  convertToPosixPath,
} from "../fs/files.js";

import LRU from "lru-cache";

import { wrap } from "optimism";
import {
  optimisticStatOrNull,
  optimisticReadJsonOrNull,
} from "../fs/optimistic.js";

const nativeModulesMap = Object.create(null);
const nativeNames = Object.keys(process.binding("natives"));

// Node 0.10 does not include process as a built-in module, but later
// versions of Node do, and we provide a stub for it on the client.
nativeNames.push("process");

nativeNames.forEach(id => {
  if (id.startsWith("internal/")) {
    return;
  }

  // When a native Node module is imported, we register a dependency on a
  // meteor-node-stubs/deps/* module of the same name, so that the
  // necessary stub modules will be included in the bundle. This alternate
  // identifier will not be imported at runtime, but the modules it
  // depends on are necessary for the original import to succeed.
  nativeModulesMap[id] =  "meteor-node-stubs/deps/" + id;
});

const resolverCache = new LRU({
  max: Math.pow(2, 12)
});

export default class Resolver {
  static getOrCreate(options) {
    const key = JSON.stringify(options);
    let resolver = resolverCache.get(key);
    if (! resolver) {
      resolverCache.set(key, resolver = new Resolver(options));
    }
    return resolver;
  }

  constructor({
    sourceRoot,
    targetArch,
    extensions = [".js", ".json"],
    nodeModulesPaths = [],
  }) {
    this.sourceRoot = sourceRoot;
    this.extensions = extensions;
    this.targetArch = targetArch;
    this.nodeModulesPaths = nodeModulesPaths;
    this.statOrNull = optimisticStatOrNull;

    this.resolve = wrap((id, absParentPath) => {
      return this._resolve(id, absParentPath);
    }, {
      makeCacheKey(id, absParentPath) {
        // Only the directory of the absParentPath matters for caching.
        return JSON.stringify([id, pathDirname(absParentPath)]);
      }
    });

    this._cacheMethod("_findPkgJsonSubsetForPath");
    this._cacheMethod("_getPkgJsonSubsetForDir");
  }

  _cacheMethod(name) {
    const original = this[name];
    this[name] = wrap(
      (...args) => original.apply(this, args)
    );
  }

  static isTopLevel(id) {
    return "./".indexOf(id.charAt(0)) < 0;
  }

  static isNative(id) {
    return has(nativeModulesMap, id);
  }

  static getNativeStubId(id) {
    return nativeModulesMap[id] || null;
  }

  // Resolve the given module identifier to an object { path, stat } or
  // null, relative to an absolute parent path. The _seenDirPaths
  // parameter is for internal use only and should be ommitted.
  _resolve(id, absParentPath, _seenDirPaths) {
    let resolved =
      this._resolveAbsolute(id, absParentPath) ||
      this._resolveRelative(id, absParentPath) ||
      this._resolveNodeModule(id, absParentPath);

    if (typeof resolved === "string") {
      // The _resolveNodeModule method can return "missing" to indicate
      // that the ImportScanner should look elsewhere for this module,
      // such as in the app node_modules directory.
      return resolved;
    }

    let packageJsonMap = null;

    while (resolved && resolved.stat.isDirectory()) {
      let dirPath = resolved.path;
      _seenDirPaths = _seenDirPaths || new Set;

      // If the "main" field of a package.json file resolves to a
      // directory we've already considered, then we should not attempt to
      // read the same package.json file again.
      if (! _seenDirPaths.has(dirPath)) {
        _seenDirPaths.add(dirPath);

        const found = this._getPkgJsonSubsetForDir(dirPath);

        // The "main" field of package.json does not have to begin with ./
        // to be considered relative, so first we try simply appending it
        // to the directory path before falling back to a full resolve,
        // which might return a package from a node_modules directory.
        resolved = found &&
          isString(found.main) &&
          (this._joinAndStat(dirPath, found.main) ||
           this._resolve(found.main, found.path, _seenDirPaths));

        if (resolved && typeof resolved === "object") {
          if (! resolved.packageJsonMap) {
            resolved.packageJsonMap = Object.create(null);
          }

          resolved.packageJsonMap[found.path] = found.pkg;

          // The resolution above may have returned a directory, so we
          // merge resolved.packageJsonMap into packageJsonMap so that we
          // don't forget the package.json we just resolved, then continue
          // the loop to make sure we fully resolve the "main" module
          // identifier to a non-directory.  Technically this could
          // involve even more package.json files, but in practice the
          // "main" property will almost always name a directory
          // containing an index.js file.
          Object.assign(
            packageJsonMap || (packageJsonMap = Object.create(null)),
            resolved.packageJsonMap,
          );

          continue;
        }

        // Include the package.json stub in the bundle even if it was not
        // used to resolve the "main" entry point, per this comment:
        // https://github.com/meteor/meteor/issues/9235#issuecomment-340562285
        if (found) {
          packageJsonMap = packageJsonMap || Object.create(null);
          packageJsonMap[found.path] = found.pkg;
        }
      }

      // If we didn't find a `package.json` file, or it didn't have a
      // resolvable `.main` property, the only possibility left to
      // consider is that this directory contains an `index.js` module.
      // This assignment almost always terminates the while loop, because
      // there's very little chance an `index.js` file will be a
      // directory. However, in principle it is remotely possible that a
      // file called `index.js` could be a directory instead of a file.
      resolved = this._joinAndStat(dirPath, "index");
    }

    if (resolved) {
      if (packageJsonMap) {
        resolved.packageJsonMap = packageJsonMap;
      }

      // If the package.json file that governs resolved.path has a
      // "browser" field, include it in resolved.packageJsonMap so that
      // the ImportScanner can register the appropriate browser aliases.
      const pkgJsonInfo = this._findPkgJsonSubsetForPath(resolved.path);
      if (pkgJsonInfo &&
          isObject(pkgJsonInfo.pkg.browser)) {
        if (! resolved.packageJsonMap) {
          resolved.packageJsonMap = Object.create(null);
        }
        resolved.packageJsonMap[pkgJsonInfo.path] = pkgJsonInfo.pkg;
      }

      resolved.id = convertToPosixPath(
        convertToOSPath(resolved.path),
        true
      );
    }

    return resolved;
  }

  _joinAndStat(...joinArgs) {
    const joined = pathJoin(...joinArgs);
    const path = pathNormalize(joined);
    const exactStat = this.statOrNull(path);
    const exactResult = exactStat && { path, stat: exactStat };

    let result = null;

    if (exactResult && exactStat.isFile()) {
      result = exactResult;
    } else {
      // No point in trying alternate file extensions if the parent
      // directory does not exist.
      const parentDirStat = this.statOrNull(pathDirname(path));
      if (parentDirStat &&
          parentDirStat.isDirectory()) {
        this.extensions.some(ext => {
          const pathWithExt = path + ext;
          const stat = this.statOrNull(pathWithExt);
          if (stat && ! stat.isDirectory()) {
            return result = { path: pathWithExt, stat };
          }
        });
      }
    }

    if (! result && exactResult && exactStat.isDirectory()) {
      // After trying all available file extensions, fall back to the
      // original result if it was a directory.
      result = exactResult;
    }

    return result;
  }

  _resolveAbsolute(id, absParentPath) {
    return id.charAt(0) === "/" &&
      this._joinAndStat(this.sourceRoot, id.slice(1));
  }

  _resolveRelative(id, absParentPath) {
    if (id.charAt(0) === ".") {
      return this._joinAndStat(absParentPath, "..", id);
    }
  }

  _resolveNodeModule(id, absParentPath) {
    if (! Resolver.isTopLevel(id)) {
      return null;
    }

    if (Resolver.isNative(id) &&
        archMatches(this.targetArch, "os")) {
      // Forbid installing any server module with the same name as a
      // native Node module.
      return null;
    }

    let sourceRoot;
    const relParentPath = pathRelative(this.sourceRoot, absParentPath);
    if (! relParentPath.startsWith("..")) {
      // If the file is contained by this.sourceRoot, then it's safe to
      // use this.sourceRoot as the limiting ancestor directory in the
      // while loop below, but we're still going to check whether the file
      // resides in an external node_modules directory, since "external"
      // .npm/package/node_modules directories are technically contained
      // within the root directory of their packages.
      sourceRoot = this.sourceRoot;
    }

    this.nodeModulesPaths.some(path => {
      if (! pathRelative(path, absParentPath).startsWith("..")) {
        // If the file is inside an external node_modules directory,
        // consider the rootDir to be the parent directory of that
        // node_modules directory, rather than this.sourceRoot.
        return sourceRoot = pathDirname(path);
      }
    });

    let resolved = null;

    if (sourceRoot) {
      let dir = absParentPath; // It's ok for absParentPath to be a directory!
      let dirStat = this.statOrNull(dir);
      if (! (dirStat && dirStat.isDirectory())) {
        dir = pathDirname(dir);
      }

      while (! (resolved = this._joinAndStat(dir, "node_modules", id))) {
        if (dir === sourceRoot) {
          break;
        }

        const parentDir = pathDirname(dir);
        if (dir === parentDir) {
          // We've reached the root of the file system??
          break;
        }

        dir = parentDir;
      }
    }

    if (! resolved) {
      // After checking any local node_modules directories, fall back to
      // the package NPM directory, if one was specified.
      this.nodeModulesPaths.some(path => {
        return resolved = this._joinAndStat(path, id);
      });
    }

    // If the dependency is still not resolved, it might be handled by the
    // fallback function defined in meteor/packages/modules/modules.js, or
    // it might be imported in code that will never run on this platform,
    // so there is always the possibility that its absence is not actually
    // a problem. As much as we might like to issue warnings about missing
    // dependencies here, we just don't have enough information to make
    // that determination until the code actually runs.

    return resolved || "missing";
  }

  _getPkgJsonSubsetForDir(dirPath) {
    const pkgJsonPath = pathJoin(dirPath, "package.json");
    const pkg = optimisticReadJsonOrNull(pkgJsonPath);
    if (! pkg) {
      return null;
    }

    // Output a JS module that exports just the "name", "version", "main",
    // and "browser" properties (if defined) from the package.json file.
    const pkgSubset = {};

    if (has(pkg, "name")) {
      pkgSubset.name = pkg.name;
    }

    if (has(pkg, "version")) {
      pkgSubset.version = pkg.version;
    }

    let main;
    function tryMain(name) {
      const value = pkg[name];

      if (isString(value)) {
        main = main || value;
      }

      if (isString(value) ||
          isObject(value)) {
        pkgSubset[name] = value;
      }
    }

    if (archMatches(this.targetArch, "web")) {
      tryMain("browser");
    }

    tryMain("main");

    return {
      path: pkgJsonPath,
      pkg: pkgSubset,
      main,
    };
  }

  _findPkgJsonSubsetForPath(path) {
    const stat = this.statOrNull(path);

    if (stat && stat.isDirectory()) {
      const found = this._getPkgJsonSubsetForDir(path);
      if (found) {
        return found;
      }

      if (path === this.sourceRoot) {
        return null;
      }
    }

    const parentDir = pathDirname(path);

    if (parentDir === path) {
      return null;
    }

    if (pathBasename(parentDir) === "node_modules") {
      return null;
    }

    return this._findPkgJsonSubsetForPath(parentDir);
  }
};

import { Profile } from "../tool-env/profile.js";
each(Resolver.prototype, (value, key) => {
  if (key === "constructor") return;
  Resolver.prototype[key] = Profile(
    `Resolver#${key}`,
    Resolver.prototype[key]
  );
});
