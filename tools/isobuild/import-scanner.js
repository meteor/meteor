import assert from "assert";
import {isString, has, keys, each, without} from "underscore";
import {sha1, readAndWatchFileWithHash} from "../fs/watch.js";
import {matches as archMatches} from "../utils/archinfo.js";
import {findImportedModuleIdentifiers} from "./js-analyze.js";
import buildmessage from "../utils/buildmessage.js";
import LRU from "lru-cache";
import {Profile} from "../tool-env/profile.js";
import {
  pathJoin,
  pathRelative,
  pathNormalize,
  pathDirname,
  pathBasename,
  pathExtname,
  statOrNull,
  convertToPosixPath,
} from "../fs/files.js";

// Default handlers for well-known file extensions.
const extensions = {
  ".js"(data) {
    return data;
  },

  ".json"(data) {
    return "module.exports = " +
      JSON.stringify(JSON.parse(data), null, 2) +
      ";\n";
  }
};

// Map from SHA (which is already calculated, so free for us)
// to the results of calling findImportedModuleIdentifiers.
// Each entry is an array of strings, and this is a case where
// the computation is expensive but the output is very small.
// The cache can be global because findImportedModuleIdentifiers
// is a pure function, and that way it applies across instances
// of ImportScanner (which do not persist across builds).
const IMPORT_SCANNER_CACHE = new LRU({
  max: 1024*1024,
  length(value) {
    let total = 40; // size of key
    value.forEach(str => { total += str.length; });
    return total;
  }
});

export default class ImportScanner {
  constructor({
    name,
    bundleArch,
    sourceRoot,
    usedPackageNames = {},
    nodeModulesPath,
    watchSet,
  }) {
    assert.ok(isString(sourceRoot));

    this.name = name;
    this.bundleArch = bundleArch;
    this.sourceRoot = sourceRoot;
    this.usedPackageNames = usedPackageNames;
    this.nodeModulesPath = nodeModulesPath;
    this.watchSet = watchSet;
    this.absPathToOutputIndex = {};
    this.outputFiles = [];
  }

  addInputFiles(files) {
    files.forEach(file => {
      const absPath = pathJoin(this.sourceRoot, file.sourcePath);

      // Files that are not eagerly evaluated (lazy) will only be included
      // in the bundle if they are actually imported. Files that are
      // eagerly evaluated are effectively "imported" as entry points.
      file.imported = ! file.lazy;

      file.installPath = this._getInstallPath(absPath);

      if (has(this.absPathToOutputIndex, absPath)) {
        const index = this.absPathToOutputIndex[absPath];
        this.outputFiles[index] = file;
      } else {
        this.absPathToOutputIndex[absPath] =
          this.outputFiles.push(file) - 1;
      }
    });

    this.outputFiles.forEach(file => {
      if (! file.lazy || file.imported) {
        this._scanFile(file);
      }
    });

    return this;
  }

  addNodeModules(identifiers) {
    if (identifiers) {
      if (typeof identifiers === "object" &&
          ! Array.isArray(identifiers)) {
        identifiers = Object.keys(identifiers);
      }

      if (identifiers.length > 0) {
        this._scanFile({
          sourcePath: "fake.js",
          // By specifying the .deps property of this fake file ahead of
          // time, we can avoid calling findImportedModuleIdentifiers in the
          // _scanFile method.
          deps: identifiers,
        });
      }
    }

    return this;
  }

  getOutputFiles(options) {
    return this.outputFiles;
  }

  _findImportedModuleIdentifiers(file) {
    if (IMPORT_SCANNER_CACHE.has(file.hash)) {
      return IMPORT_SCANNER_CACHE.get(file.hash);
    }

    const result =
          keys(findImportedModuleIdentifiers(file.data.toString("utf8")));

    // there should always be file.hash, but better safe than sorry
    if (file.hash) {
      IMPORT_SCANNER_CACHE.set(file.hash, result);
    }

    return result;
  }

  _scanFile(file) {
    const absPath = pathJoin(this.sourceRoot, file.sourcePath);
    file.deps = file.deps || this._findImportedModuleIdentifiers(file);

    each(file.deps, id => {
      const absImportedPath = this._tryToResolveImportedPath(file, id);
      if (! absImportedPath) {
        return;
      }

      if (has(this.absPathToOutputIndex, absImportedPath)) {
        // Avoid scanning files that we've scanned before, but mark them
        // as imported so we know to include them in the bundle if they
        // are lazy.
        const index = this.absPathToOutputIndex[absImportedPath];
        const file = this.outputFiles[index];

        // Eager files and files that we have imported before do not need
        // to be scanned again. Lazy files that we have not imported
        // before still need to be scanned, however.
        const alreadyScanned = ! file.lazy || file.imported;

        // Whether the file is eager or lazy, mark it as imported. For
        // lazy files, this makes the difference between being included in
        // or omitted from the bundle. For eager files, this just ensures
        // we won't scan them again.
        file.imported = true;

        if (! alreadyScanned) {
          this._scanFile(file);
        }

        return;
      }

      if (! this._hasKnownExtension(absImportedPath)) {
        // The _readModule method provides hardcoded support for files
        // with known extensions, but any other type of file must be
        // ignored at this point, because it was not in the set of input
        // files and therefore must not have been processed by a compiler
        // plugin for the current architecture (this.bundleArch).
        return;
      }

      const installPath = this._getInstallPath(absImportedPath);
      if (! installPath) {
        // The given path cannot be installed on this architecture.
        return;
      }

      // The result of _readModule will have .data and .hash properties.
      const depFile = this._readModule(absImportedPath);
      depFile.type = "js"; // TODO Is this correct?
      depFile.sourcePath = pathRelative(this.sourceRoot, absImportedPath);
      depFile.installPath = installPath;
      depFile.servePath = installPath;
      depFile.lazy = true;
      depFile.imported = true;

      // Append this file to the output array and record its index.
      this.absPathToOutputIndex[absImportedPath] =
        this.outputFiles.push(depFile) - 1;

      this._scanFile(depFile);
    });
  }

  _readFile(absPath) {
    let { contents, hash } =
      readAndWatchFileWithHash(this.watchSet, absPath);

    return {
      data: contents.toString("utf8"),
      hash,
    };
  }

  _readModule(absPath) {
    const info = this._readFile(absPath);

    // Same logic/comment as stripBOM in node/lib/module.js:
    // Remove byte order marker. This catches EF BB BF (the UTF-8 BOM)
    // because the buffer-to-string conversion in `fs.readFileSync()`
    // translates it to FEFF, the UTF-16 BOM.
    if (info.data.charCodeAt(0) === 0xfeff) {
      info.data = info.data.slice(1);
    }

    const ext = pathExtname(absPath).toLowerCase();
    info.data = extensions[ext](info.data);

    return info;
  }

  // Returns a relative path indicating where to install the given file
  // via meteorInstall. May return undefined if the file should not be
  // installed on the current architecture.
  _getInstallPath(absPath) {
    let path =
      this._getNodeModulesInstallPath(absPath) ||
      this._getSourceRootInstallPath(absPath);

    if (! path) {
      return;
    }

    if (this.name) {
      // If we're bundling a package, prefix path with
      // node_modules/<package name>/.
      path = pathJoin("node_modules", "meteor", this.name, path);
    }

    return path;
  }

  _getNodeModulesInstallPath(absPath) {
    if (this.nodeModulesPath) {
      const relPathWithinNodeModules =
        pathRelative(this.nodeModulesPath, absPath);

      if (relPathWithinNodeModules.startsWith("..")) {
        // absPath is not a subdirectory of this.nodeModulesPath.
        return;
      }

      if (! this._hasKnownExtension(relPathWithinNodeModules)) {
        // Only accept files within node_modules directories if they
        // have one of the known extensions.
        return;
      }

      // Install the module into the local node_modules directory within
      // this app or package.
      return pathJoin("node_modules", relPathWithinNodeModules);
    }
  }

  _getSourceRootInstallPath(absPath) {
    const installPath = pathRelative(this.sourceRoot, absPath);

    if (installPath.startsWith("..")) {
      // absPath is not a subdirectory of this.sourceRoot.
      return;
    }

    const dirs = this._splitPath(pathDirname(installPath));
    const bundlingClientApp =
      ! this.name && // Indicates we are bundling an app.
      archMatches(this.bundleArch, "web");

    for (let dir of dirs) {
      if (dir.charAt(0) === "." ||
          dir === "packages" ||
          dir === "programs" ||
          dir === "cordova-build-override") {
        // These directories are never loaded as part of an app.
        return;
      }

      if (bundlingClientApp && (dir === "server" ||
                                dir === "private")) {
        // If we're bundling an app for a client architecture, any files
        // contained by a server-only directory that is not contained by
        // a node_modules directory must be ignored.
        return;
      }

      if (dir === "node_modules") {
        if (! this._hasKnownExtension(installPath)) {
          // Reject any files within node_modules directories that do
          // not have one of the known extensions.
          return;
        }

        // Accept any file within a node_modules directory if it has a
        // known file extension.
        return installPath;
      }
    }

    return installPath;
  }

  _hasKnownExtension(path) {
    return has(extensions, pathExtname(path).toLowerCase());
  }

  _splitPath(path) {
    const partsInReverse = [];
    for (let dir; (dir = pathDirname(path)) !== path; path = dir) {
      partsInReverse.push(pathBasename(path));
    }
    return partsInReverse.reverse();
  }

  // TODO This method can probably be consolidated with _getInstallPath.
  _tryToResolveImportedPath(file, id) {
    let resolved =
      this._resolveAbsolute(file, id) ||
      this._resolveRelative(file, id) ||
      this._resolveNodeModule(file, id);

    while (resolved && resolved.stat.isDirectory()) {
      resolved = this._resolvePkgJsonMain(resolved.path) ||
        this._joinAndStat(resolved.path, "index.js");
    }

    return resolved && resolved.path;
  }

  _joinAndStat(...joinArgs) {
    const path = pathNormalize(pathJoin(...joinArgs));
    const exactStat = statOrNull(path);
    const exactResult = exactStat && { path, stat: exactStat };
    if (exactResult && exactStat.isFile()) {
      return exactResult;
    }

    for (let ext in extensions) {
      if (has(extensions, ext)) {
        const pathWithExt = path + ext;
        const stat = statOrNull(pathWithExt);
        if (stat) {
          return { path: pathWithExt, stat };
        }
      }
    }

    if (exactResult && exactStat.isDirectory()) {
      // After trying all available file extensions, fall back to the
      // original result if it was a directory.
      return exactResult;
    }

    return null;
  }

  _resolveAbsolute(file, id) {
    return id.charAt(0) === "/" &&
      this._joinAndStat(this.sourceRoot, id.slice(1));
  }

  _resolveRelative(file, id) {
    if (id.charAt(0) === ".") {
      return this._joinAndStat(
        this.sourceRoot, file.sourcePath, "..", id
      );
    }
  }

  _resolveNodeModule(file, id) {
    let resolved = null;
    let dir = pathJoin(this.sourceRoot, file.sourcePath);

    do {
      dir = pathDirname(dir);
      resolved = this._joinAndStat(dir, "node_modules", id);
    } while (! resolved && dir !== this.sourceRoot);

    if (! resolved && this.nodeModulesPath) {
      // After checking any local node_modules directories, fall back to
      // the package NPM directory, if one was specified.
      resolved = this._joinAndStat(this.nodeModulesPath, id);
    }

    if (! resolved) {
      const parts = id.split("/");
      if (parts[0] !== "meteor") { // Exclude meteor/... packages.
        // If the imported identifier is neither absolute nor relative,
        // but top-level, then it might be satisfied by a package
        // installed in the top-level node_modules directory, and we
        // should record the missing dependency so that we can include it
        // in the app bundle.
        const missing = file.missingNodeModules || Object.create(null);
        missing[id] = true;
        file.missingNodeModules = missing;
      }
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

  _resolvePkgJsonMain(dirPath) {
    const pkgJsonPath = pathJoin(dirPath, "package.json");

    let pkg;
    try {
      pkg = JSON.parse(this._readFile(pkgJsonPath).data);
    } catch (e) {
      return null;
    }

    if (pkg && isString(pkg.main)) {
      const resolved = this._joinAndStat(dirPath, pkg.main);
      if (resolved) {
        this._addPkgJsonToOutput(pkgJsonPath, pkg);
        return resolved;
      }
    }

    return null;
  }

  _addPkgJsonToOutput(pkgJsonPath, pkg) {
    if (! has(this.absPathToOutputIndex, pkgJsonPath)) {
      const data = new Buffer(
        // Output a JS module that exports just the "name", "version", and
        // "main" properties defined in the package.json file.
        "exports.name = " + JSON.stringify(pkg.name) + ";\n" +
        "exports.version = " + JSON.stringify(pkg.version) + ";\n" +
        "exports.main = " + JSON.stringify(pkg.main) + ";\n"
      );

      const relPkgJsonPath = pathRelative(this.sourceRoot, pkgJsonPath);

      const pkgFile = {
        type: "js", // We represent the JSON module with JS.
        data,
        deps: [], // Avoid accidentally re-scanning this file.
        sourcePath: relPkgJsonPath,
        installPath: this._getInstallPath(pkgJsonPath),
        servePath: relPkgJsonPath,
        hash: sha1(data),
        lazy: true,
        imported: true,
      };

      this.absPathToOutputIndex[pkgJsonPath] =
        this.outputFiles.push(pkgFile) - 1;
    }
  }
}

each(["_readFile", "_findImportedModuleIdentifiers",
      "_getInstallPath", "_tryToResolveImportedPath"], funcName => {
  ImportScanner.prototype[funcName] = Profile(
    `ImportScanner#${funcName}`, ImportScanner.prototype[funcName]);
});
