import {
  isString,
  isFunction,
  has,
} from "underscore";

import { readAndWatchFileWithHash } from "../fs/watch.js";
import { matches as archMatches } from "../utils/archinfo.js";
import {
  pathJoin,
  pathRelative,
  pathNormalize,
  pathDirname,
  statOrNull as realStatOrNull,
} from "../fs/files.js";

const nativeModulesMap = Object.create(null);
const nativeNames = Object.keys(process.binding("natives"));

// Node 0.10 does not include process as a built-in module, but later
// versions of Node do, and we provide a stub for it on the client.
nativeNames.push("process");

nativeNames.forEach(id => {
  if (id === "freelist" ||
      id.startsWith("internal/")) {
    return;
  }

  // When a native Node module is imported, we register a dependency on a
  // meteor-node-stubs/deps/* module of the same name, so that the
  // necessary stub modules will be included in the bundle. This alternate
  // identifier will not be imported at runtime, but the modules it
  // depends on are necessary for the original import to succeed.
  nativeModulesMap[id] =  "meteor-node-stubs/deps/" + id;
});

export default class Resolver {
  constructor({
    sourceRoot,
    targetArch,
    extensions = [".js", ".json"],
    nodeModulesPaths = [],
    watchSet = null,
    onPackageJson,
    onMissing,
    statOrNull = realStatOrNull,
  }) {
    this.sourceRoot = sourceRoot;
    this.extensions = extensions;
    this.targetArch = targetArch;
    this.nodeModulesPaths = nodeModulesPaths;
    this.watchSet = watchSet;
    this.onPackageJson = onPackageJson;
    this.onMissing = onMissing;
    this.statOrNull = statOrNull;

    this.statCache = new Map;
    this.pkgJsonCache = new Map;
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
  resolve(id, absParentPath, _seenDirPaths) {
    let resolved =
      this._resolveAbsolute(id, absParentPath) ||
      this._resolveRelative(id, absParentPath) ||
      this._resolveNodeModule(id, absParentPath);

    while (resolved && resolved.stat.isDirectory()) {
      let dirPath = resolved.path;
      _seenDirPaths = _seenDirPaths || new Set;

      // If the "main" field of a package.json file resolves to a
      // directory we've already considered, then we should not attempt to
      // read the same package.json file again.
      if (! _seenDirPaths.has(dirPath)) {
        _seenDirPaths.add(dirPath);
        resolved = this._resolvePkgJsonMain(dirPath, _seenDirPaths);
        if (resolved) {
          // The _resolvePkgJsonMain call above may have returned a
          // directory, so continue the loop to make sure we fully resolve
          // it to a non-directory.
          continue;
        }
      }

      // If we didn't find a `package.json` file, or it didn't have a
      // resolvable `.main` property, the only possibility left to
      // consider is that this directory contains an `index.js` module.
      // This assignment almost always terminates the while loop, because
      // there's very little chance an `index.js` file will be a
      // directory. However, in principle it is remotely possible that a
      // file called `index.js` could be a directory instead of a file.
      resolved = this._joinAndStat(dirPath, "index.js");
    }

    return resolved;
  }

  _joinAndStat(...joinArgs) {
    const joined = pathJoin(...joinArgs);
    if (this.statCache.has(joined)) {
      return this.statCache.get(joined);
    }

    const path = pathNormalize(joined);
    const exactStat = this.statOrNull(path);
    const exactResult = exactStat && { path, stat: exactStat };
    let result = null;
    if (exactResult && exactStat.isFile()) {
      result = exactResult;
    }

    if (! result) {
      this.extensions.some(ext => {
        const pathWithExt = path + ext;
        const stat = this.statOrNull(pathWithExt);
        if (stat) {
          return result = { path: pathWithExt, stat };
        }
      });
    }

    if (! result && exactResult && exactStat.isDirectory()) {
      // After trying all available file extensions, fall back to the
      // original result if it was a directory.
      result = exactResult;
    }

    this.statCache.set(joined, result);
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
    let resolved = null;

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

    if (sourceRoot) {
      let dir = absParentPath; // It's ok for absParentPath to be a directory!
      let info = this._joinAndStat(dir);
      if (! info || ! info.stat.isDirectory()) {
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

    if (! resolved && isFunction(this.onMissing)) {
      return this.onMissing(id, absParentPath);
    }

    // If the dependency is still not resolved, it might be handled by the
    // fallback function defined in meteor/packages/modules/modules.js, or
    // it might be imported in code that will never run on this platform,
    // so there is always the possibility that its absence is not actually
    // a problem. As much as we might like to issue warnings about missing
    // dependencies here, we just don't have enough information to make
    // that determination until the code actually runs.

    return resolved;
  }

  _readPkgJson(path) {
    if (this.pkgJsonCache.has(path)) {
      return this.pkgJsonCache.get(path);
    }

    let result = null;
    try {
      result = JSON.parse(
        readAndWatchFileWithHash(this.watchSet, path).contents);
    } catch (e) {
      if (! (e instanceof SyntaxError ||
             e.code === "ENOENT")) {
        throw e;
      }
    }

    this.pkgJsonCache.set(path, result);
    return result;
  }

  _resolvePkgJsonMain(dirPath, _seenDirPaths) {
    const pkgJsonPath = pathJoin(dirPath, "package.json");
    const pkg = this._readPkgJson(pkgJsonPath);
    if (! pkg) {
      return null;
    }

    let main = pkg.main;

    if (archMatches(this.targetArch, "web") &&
        isString(pkg.browser)) {
      main = pkg.browser;
    }

    // Output a JS module that exports just the "name", "version", and
    // "main" properties defined in the package.json file.
    const pkgSubset = {
      name: pkg.name,
    };

    if (has(pkg, "version")) {
      pkgSubset.version = pkg.version;
    }

    if (isString(main)) {
      pkgSubset.main = main;
    }

    if (isFunction(this.onPackageJson)) {
      this.onPackageJson(pkgJsonPath, pkgSubset);
    }

    if (isString(main)) {
      // The "main" field of package.json does not have to begin with ./
      // to be considered relative, so first we try simply appending it to
      // the directory path before falling back to a full resolve, which
      // might return a package from a node_modules directory.
      return this._joinAndStat(dirPath, main) ||
        // The _tryToResolveImportedPath method takes a file object as its
        // first parameter, but only the .sourcePath and .deps properties
        // are ever used, so we can get away with passing a fake file
        // object with only those properties.
        this.resolve(
          main,
          pkgJsonPath,
          _seenDirPaths
        );
    }

    return null;
  }
};
