import assert from "assert";
import {inspect} from "util";
import {Script} from "vm";
import {
  isString, isEmpty, has, keys, each, map, omit,
} from "underscore";
import {sha1} from "../fs/watch.js";
import {matches as archMatches} from "../utils/archinfo.js";
import {findImportedModuleIdentifiers} from "./js-analyze.js";
import {cssToCommonJS} from "./css-modules.js";
import buildmessage from "../utils/buildmessage.js";
import LRU from "lru-cache";
import {Profile} from "../tool-env/profile.js";
import {SourceNode, SourceMapConsumer} from "source-map";
import {
  pathJoin,
  pathRelative,
  pathNormalize,
  pathDirname,
  pathBasename,
  pathExtname,
  pathIsAbsolute,
  convertToOSPath,
  convertToPosixPath,
} from "../fs/files.js";

import {
  optimisticReadFile,
  optimisticStatOrNull,
  optimisticHashOrNull,
  shouldWatch,
} from "../fs/optimistic.js";

import Resolver from "./resolver.js";

const fakeFileStat = {
  isFile() {
    return true;
  },

  isDirectory() {
    return false;
  }
};

// Default handlers for well-known file extensions.
// Note that these function expect strings, not Buffer objects.
const defaultExtensionHandlers = {
  ".js"(dataString) {
    // Strip any #! line from the beginning of the file.
    return dataString.replace(/^#![^\n]*/, "");
  },

  ".json"(dataString) {
    const file = this;
    file.jsonData = JSON.parse(dataString);
    return "module.exports = " +
      JSON.stringify(file.jsonData, null, 2) +
      ";\n";
  },

  ".css"(dataString, hash) {
    return cssToCommonJS(dataString, hash);
  }
};

// This is just a map from hashes to booleans, so it doesn't need full LRU
// eviction logic.
const scriptParseCache = Object.create(null);

function canBeParsedAsPlainJS(dataString, hash) {
  if (hash && has(scriptParseCache, hash)) {
    return scriptParseCache[hash];
  }

  try {
    var result = !! new Script(dataString);
  } catch (e) {
    result = false;
  }

  if (hash) {
    scriptParseCache[hash] = result;
  }

  return result;
}

// Map from SHA (which is already calculated, so free for us)
// to the results of calling findImportedModuleIdentifiers.
// Each entry is an array of strings, and this is a case where
// the computation is expensive but the output is very small.
// The cache can be global because findImportedModuleIdentifiers
// is a pure function, and that way it applies across instances
// of ImportScanner (which do not persist across builds).
const IMPORT_SCANNER_CACHE = new LRU({
  max: 1024*1024,
  length(ids) {
    let total = 40; // size of key
    each(ids, (info, id) => { total += id.length; });
    return total;
  }
});

export default class ImportScanner {
  constructor({
    name,
    bundleArch,
    extensions,
    sourceRoot,
    nodeModulesPaths = [],
    watchSet,
  }) {
    assert.ok(isString(sourceRoot));

    this.name = name;
    this.bundleArch = bundleArch;
    this.sourceRoot = sourceRoot;
    this.nodeModulesPaths = nodeModulesPaths;
    this.watchSet = watchSet;
    this.absPathToOutputIndex = Object.create(null);
    this.allMissingNodeModules = Object.create(null);
    this.outputFiles = [];

    this.resolver = Resolver.getOrCreate({
      caller: "ImportScanner#constructor",
      sourceRoot,
      targetArch: bundleArch,
      extensions,
      nodeModulesPaths,
    });

    // Since Resolver.getOrCreate may have returned a cached Resolver
    // instance, it's important to update its statOrNull method so that it
    // is bound to this ImportScanner object rather than the previous one.
    this.resolver.statOrNull = (absPath) => {
      const stat = optimisticStatOrNull(absPath);
      if (stat) {
        return stat;
      }

      const file = this._getFile(absPath);
      if (file) {
        return fakeFileStat;
      }

      return null;
    };
  }

  _getFile(absPath) {
    absPath = absPath.toLowerCase();
    if (has(this.absPathToOutputIndex, absPath)) {
      return this.outputFiles[this.absPathToOutputIndex[absPath]];
    }
  }

  _addFile(absPath, file) {
    absPath = absPath.toLowerCase();
    const old = this.absPathToOutputIndex[absPath];

    if (old) {
      // If the old file is just an empty stub, let the new file take
      // precedence over it.
      if (old.implicit === true) {
        return this.absPathToOutputIndex[absPath] = file;
      }

      // If the new file is just an empty stub, pretend the _addFile
      // succeeded by returning the old file, so that we won't try to call
      // _combineFiles needlessly.
      if (file.implicit === true) {
        return old;
      }

    } else {
      this.absPathToOutputIndex[absPath] =
        this.outputFiles.push(file) - 1;

      return file;
    }
  }

  addInputFiles(files) {
    files.forEach(file => {
      this._checkSourceAndTargetPaths(file);

      // Note: this absolute path may not necessarily exist on the file
      // system, but any import statements or require calls in file.data
      // will be interpreted relative to this path, so it needs to be
      // something plausible. #6411 #6383
      const absPath = pathJoin(this.sourceRoot, file.sourcePath);

      const dotExt = "." + file.type;
      const dataString = file.data.toString("utf8");
      file.dataString = defaultExtensionHandlers[dotExt].call(
        file,
        dataString,
        file.hash,
      );

      if (! (file.data instanceof Buffer) ||
          file.dataString !== dataString) {
        file.data = new Buffer(file.dataString, "utf8");
      }

      // Files that are not eagerly evaluated (lazy) will only be included
      // in the bundle if they are actually imported. Files that are
      // eagerly evaluated are effectively "imported" as entry points.
      file.imported = ! file.lazy;

      file.installPath = file.installPath || this._getInstallPath(absPath);

      if (! this._addFile(absPath, file)) {
        // Collisions can happen if a compiler plugin calls addJavaScript
        // multiple times with the same sourcePath. #6422
        this._combineFiles(this._getFile(absPath), file);
      }
    });

    return this;
  }

  // Make sure file.sourcePath is defined, and handle the possibility that
  // file.targetPath differs from file.sourcePath.
  _checkSourceAndTargetPaths(file) {
    file.sourcePath = this._getSourcePath(file);

    if (! isString(file.targetPath)) {
      return;
    }

    file.targetPath = pathNormalize(pathJoin(".", file.targetPath));

    if (file.targetPath !== file.sourcePath) {
      const absSourcePath = pathJoin(this.sourceRoot, file.sourcePath);
      const absTargetPath = pathJoin(this.sourceRoot, file.targetPath);

      // If file.targetPath differs from file.sourcePath, generate a new
      // file object with that .sourcePath that imports the original file.
      // This allows either the .sourcePath or the .targetPath to be used
      // when importing the original file, and also allows multiple files
      // to have the same .sourcePath but different .targetPaths.
      let sourceFile = this._getFile(absSourcePath);
      if (! sourceFile) {
        const installPath = this._getInstallPath(absSourcePath);
        sourceFile = this._addFile(absSourcePath, {
          type: file.type,
          sourcePath: file.sourcePath,
          servePath: installPath,
          installPath,
          dataString: "",
          deps: {},
          lazy: true,
        });
      }

      // Make sure the original file gets installed at the target path
      // instead of the source path.
      file.installPath = this._getInstallPath(absTargetPath);
      file.sourcePath = file.targetPath;

      const relativeId = this._getRelativeImportId(
        absSourcePath,
        absTargetPath,
      );

      // Set the contents of the source module to import the target
      // module(s). Note that module.exports will be set to the exports of
      // the last target module. This is not perfect, but (1) it's better
      // than trying to merge exports, (2) it does the right thing when
      // there's only one target module, (3) the plugin author can easily
      // control which file comes last, and (4) it's always possible to
      // import the target modules individually.
      sourceFile.dataString += "module.exports = require(" +
        JSON.stringify(relativeId) + ");\n";
      sourceFile.data = new Buffer(sourceFile.dataString, "utf8");
      sourceFile.hash = sha1(sourceFile.data);
      sourceFile.deps[relativeId] = {};
    }
  }

  // Concatenate the contents of oldFile and newFile, combining source
  // maps and updating all other properties appropriately. Once this
  // combination is done, oldFile should be kept and newFile discarded.
  _combineFiles(oldFile, newFile) {
    function checkProperty(name) {
      if (has(oldFile, name)) {
        if (! has(newFile, name)) {
          newFile[name] = oldFile[name];
        }
      } else if (has(newFile, name)) {
        oldFile[name] = newFile[name];
      }

      if (oldFile[name] !== newFile[name]) {
        const fuzzyCase =
          oldFile.sourcePath.toLowerCase() === newFile.sourcePath.toLowerCase();

        throw new Error(
          "Attempting to combine different files" +
            ( fuzzyCase ? " (is the filename case slightly different?)" : "") +
            ":\n" +
            inspect(omit(oldFile, "dataString")) + "\n" +
            inspect(omit(newFile, "dataString")) + "\n"
        );
      }
    }

    // Since we're concatenating the files together, they must be either
    // both lazy or both eager. Same for bareness.
    checkProperty("lazy");
    checkProperty("bare");

    function getChunk(file) {
      const consumer = file.sourceMap &&
        new SourceMapConsumer(file.sourceMap);
      const node = consumer &&
        SourceNode.fromStringWithSourceMap(file.dataString, consumer);
      return node || file.dataString;
    }

    const {
      code: combinedDataString,
      map: combinedSourceMap,
    } = new SourceNode(null, null, null, [
      getChunk(oldFile),
      "\n\n",
      getChunk(newFile)
    ]).toStringWithSourceMap({
      file: oldFile.servePath || newFile.servePath
    });

    oldFile.dataString = combinedDataString;
    oldFile.data = new Buffer(oldFile.dataString, "utf8");
    oldFile.hash = sha1(oldFile.data);

    // If either oldFile or newFile has been imported non-dynamically,
    // then oldFile.imported needs to be === true. Otherwise we simply set
    // oldFile.imported = oldFile.imported || newFile.imported, which
    // could be either false, "dynamic", or "fake" (see addNodeModules).
    oldFile.imported =
      oldFile.imported === true ||
      newFile.imported === true ||
      oldFile.imported ||
      newFile.imported;

    oldFile.sourceMap = combinedSourceMap.toJSON();
    if (! oldFile.sourceMap.mappings) {
      oldFile.sourceMap = null;
    }
  }

  scanImports() {
    this.outputFiles.forEach(file => {
      if (! file.lazy || file.imported) {
        this._scanFile(file, file.imported === "dynamic");
      }
    });

    return this;
  }

  addNodeModules(identifiers) {
    assert.ok(identifiers);
    assert.ok(typeof identifiers === "object");
    assert.ok(! Array.isArray(identifiers));

    const newlyMissing = Object.create(null);
    const newlyAdded = Object.create(null);

    if (! isEmpty(identifiers)) {
      const previousAllMissingNodeModules = this.allMissingNodeModules;
      this.allMissingNodeModules = newlyMissing;

      try {
        this._scanFile({
          sourcePath: "fake.js",
          // It's important that the fake.js file itself never gets
          // scanned or bundled. See the _scanFile and getOutputFiles
          // methods for logic that deals with file.imported values.
          imported: "fake",
          lazy: true,
          // By specifying the .deps property of this fake file ahead of
          // time, we can avoid calling findImportedModuleIdentifiers in the
          // _scanFile method.
          deps: identifiers,
        });

      } finally {
        this.allMissingNodeModules = previousAllMissingNodeModules;

        each(identifiers, (info, id) => {
          if (! has(newlyMissing, id)) {
            newlyAdded[id] = info;
          }
        });

        // Remove previously seen missing module identifiers from
        // newlyMissing and merge the new identifiers back into
        // this.allMissingNodeModules.
        each(keys(newlyMissing), key => {
          if (has(previousAllMissingNodeModules, key)) {
            delete newlyMissing[key];
          } else {
            previousAllMissingNodeModules[key] =
              newlyMissing[key];
          }
        });
      }
    }

    return {
      newlyAdded,
      newlyMissing,
    };
  }

  getOutputFiles() {
    // Return all installable output files that are either eager or
    // imported (statically or dynamically).
    return this.outputFiles.filter(file => {
      return file.installPath &&
        (! file.lazy ||
         file.imported === true ||
         file.imported === "dynamic");
    });
  }

  _getSourcePath(file) {
    let sourcePath = file.sourcePath;
    if (sourcePath) {
      if (pathIsAbsolute(sourcePath)) {
        try {
          var relPath = pathRelative(this.sourceRoot, sourcePath);

        } finally {
          if (! relPath || relPath.startsWith("..")) {
            if (this.resolver._joinAndStat(this.sourceRoot, sourcePath)) {
              // If sourcePath exists as a path relative to this.sourceRoot,
              // strip away the leading / that made it look absolute.
              return pathNormalize(pathJoin(".", sourcePath));
            }

            if (relPath) {
              throw new Error("sourcePath outside sourceRoot: " + sourcePath);
            }

            // If pathRelative threw an exception above, and we were not
            // able to handle the problem, it will continue propagating
            // from this finally block.
          }
        }

        sourcePath = relPath;
      }

    } else if (file.servePath) {
      sourcePath = convertToOSPath(file.servePath.replace(/^\//, ""));

    } else if (file.path) {
      sourcePath = file.path;
    }

    return pathNormalize(pathJoin(".", sourcePath));
  }

  _findImportedModuleIdentifiers(file) {
    if (IMPORT_SCANNER_CACHE.has(file.hash)) {
      return IMPORT_SCANNER_CACHE.get(file.hash);
    }

    const result = findImportedModuleIdentifiers(
      file.dataString,
      file.hash,
    );

    // there should always be file.hash, but better safe than sorry
    if (file.hash) {
      IMPORT_SCANNER_CACHE.set(file.hash, result);
    }

    return result;
  }

  _resolve(parentFile, id, forDynamicImport = false) {
    const absPath = pathJoin(this.sourceRoot, parentFile.sourcePath);
    const resolved = this.resolver.resolve(id, absPath);

    if (resolved === "missing") {
      return this._onMissing(parentFile, id, forDynamicImport);
    }

    if (resolved && resolved.packageJsonMap) {
      const info = parentFile.deps[id];
      info.helpers = info.helpers || {};

      each(resolved.packageJsonMap, (pkg, path) => {
        const packageJsonFile =
          this._addPkgJsonToOutput(path, pkg, forDynamicImport);

        if (! parentFile.installPath) {
          // If parentFile is not installable, then we won't return it
          // from getOutputFiles, so we don't need to worry about
          // recording any parentFile.deps[id].helpers.
          return;
        }

        const relativeId = this._getRelativeImportId(
          parentFile.installPath,
          packageJsonFile.installPath
        );

        // Although not explicitly imported, any package.json modules
        // involved in resolving this import should be recorded as
        // implicit "helpers."
        info.helpers[relativeId] = forDynamicImport;
      });
    }

    return resolved;
  }

  _getRelativeImportId(parentPath, childPath) {
    const relativeId = convertToPosixPath(pathRelative(
      pathDirname(parentPath),
      childPath
    ), true);

    // If the result of pathRelative does not already start with a "." or
    // a "/", prepend a "./" to make it a valid relative identifier
    // according to CommonJS syntax.
    if ("./".indexOf(relativeId.charAt(0)) < 0) {
      return "./" + relativeId;
    }

    return relativeId;
  }

  _scanFile(file, forDynamicImport = false) {
    const absPath = pathJoin(this.sourceRoot, file.sourcePath);

    try {
      file.deps = file.deps || this._findImportedModuleIdentifiers(file);
    } catch (e) {
      if (e.$ParseError) {
        buildmessage.error(e.message, {
          file: file.sourcePath,
          line: e.loc.line,
          column: e.loc.column,
        });
        return;
      }
      throw e;
    }

    each(file.deps, (info, id) => {
      // Asynchronous module fetching only really makes sense in the
      // browser (even though it works equally well on the server), so
      // it's better if forDynamicImport never becomes true on the server.
      const dynamic = this.isWebBrowser() &&
        (forDynamicImport || info.dynamic);

      const resolved = this._resolve(file, id, dynamic);
      if (! resolved) {
        return;
      }

      const absImportedPath = resolved.path;

      let depFile = this._getFile(absImportedPath);
      if (depFile) {
        // If the module is an implicit package.json stub, update to the
        // explicit version now.
        if (depFile.jsonData &&
            depFile.installPath.endsWith("/package.json") &&
            depFile.implicit === true) {
          const file = this._readModule(absImportedPath);
          if (file) {
            depFile.implicit = false;
            Object.assign(depFile, file);
          }
        }

        // Avoid scanning files that we've scanned before, but mark them
        // as imported so we know to include them in the bundle if they
        // are lazy. Eager files and files that we have imported before do
        // not need to be scanned again. Lazy files that we have not
        // imported before still need to be scanned, however. Note that
        // alreadyScanned will be "dynamic" (which is truthy) if the file
        // has only been scanned because of a dynamic import(...).
        const alreadyScanned = ! depFile.lazy || depFile.imported;

        // Whether the file is eager or lazy, mark it as imported. For
        // lazy files, this makes the difference between being included in
        // or omitted from the bundle. For eager files, this just ensures
        // we won't scan them again. If this scan began from a dynamic
        // import(...), we set depFile.imported = "dynamic" unless it's
        // already been set true.
        depFile.imported = dynamic
          ? depFile.imported || "dynamic"
          : true;

        const needsToBeScanned = ! alreadyScanned ||
          // If the file has already been scanned, but only because of a
          // dynamic import(...), then it needs to be scanned again, so that
          // we mark it and its dependencies as non-dynamic. This will be
          // cheaper than before because we've already computed depFile.deps.
          (alreadyScanned === "dynamic" &&
           depFile.imported === true);

        if (needsToBeScanned) {
          if (depFile.error) {
            // Since this file is lazy, it might never have been imported,
            // so any errors reported to InputFile#error were saved but
            // not reported at compilation time. Now that we know the file
            // has been imported, it's time to report those errors.
            buildmessage.error(depFile.error.message,
                               depFile.error.info);
          } else {
            this._scanFile(depFile, dynamic);
          }
        }

        return;
      }

      const installPath = this._getInstallPath(absImportedPath);
      if (! installPath) {
        // The given path cannot be installed on this architecture.
        return;
      }

      info.installPath = installPath;

      // If the module is not readable, _readModule may return
      // null. Otherwise it will return an object with .data, .dataString,
      // and .hash properties.
      depFile = this._readModule(absImportedPath);
      if (! depFile) {
        return;
      }

      depFile.type = "js"; // TODO Is this correct?
      depFile.sourcePath = pathRelative(this.sourceRoot, absImportedPath);
      depFile.installPath = installPath;
      depFile.servePath = installPath;
      depFile.lazy = true;
      depFile.imported = dynamic ? "dynamic" : true;

      // Append this file to the output array and record its index.
      this._addFile(absImportedPath, depFile);

      // On the server, modules in node_modules directories will be
      // handled natively by Node, so we don't need to build a
      // meteorInstall-style bundle beyond the entry-point module.
      if (! this.isWeb() &&
          depFile.installPath.startsWith("node_modules/") &&
          // If optimistic functions care about this file, e.g. because it
          // resides in a linked npm package, then we should allow it to
          // be watched by including it in the server bundle by not
          // returning here. Note that inclusion in the server bundle is
          // an unnecessary consequence of this logic, since Node will
          // still evaluate this module natively on the server. What we
          // really care about is watching the file for changes.
          ! shouldWatch(absImportedPath)) {
        return;
      }

      this._scanFile(depFile, dynamic);
    });
  }

  isWeb() {
    // Returns true for web.cordova as well as web.browser.
    return ! archMatches(this.bundleArch, "os");
  }

  isWebBrowser() {
    return archMatches(this.bundleArch, "web.browser");
  }

  _readFile(absPath) {
    const contents = optimisticReadFile(absPath);
    const hash = optimisticHashOrNull(absPath);

    this.watchSet.addFile(absPath, hash);

    return {
      data: contents,
      dataString: contents.toString("utf8"),
      hash
    };
  }

  _readModule(absPath) {
    let ext = pathExtname(absPath).toLowerCase();

    if (ext === ".node") {
      const dataString = "throw new Error(" + JSON.stringify(
        this.isWeb()
          ? "cannot load native .node modules on the client"
          : "module.useNode() must succeed for native .node modules"
      ) + ");\n";

      const data = new Buffer(dataString, "utf8");
      const hash = sha1(data);

      return { data, dataString, hash };
    }

    try {
      var info = this._readFile(absPath);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      return null;
    }

    const dataString = info.dataString;

    // Same logic/comment as stripBOM in node/lib/module.js:
    // Remove byte order marker. This catches EF BB BF (the UTF-8 BOM)
    // because the buffer-to-string conversion in `fs.readFileSync()`
    // translates it to FEFF, the UTF-16 BOM.
    if (info.dataString.charCodeAt(0) === 0xfeff) {
      info.dataString = info.dataString.slice(1);
    }

    if (! has(defaultExtensionHandlers, ext)) {
      if (canBeParsedAsPlainJS(dataString)) {
        ext = ".js";
      } else {
        return null;
      }
    }

    info.dataString = defaultExtensionHandlers[ext].call(
      info,
      info.dataString,
      info.hash,
    );

    if (info.dataString !== dataString) {
      info.data = new Buffer(info.dataString, "utf8");
    }

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
      path = pathJoin(
        "node_modules",
        "meteor",
        this.name.replace(/^local-test[:_]/, ""),
        path,
      );
    }

    // Install paths should always be delimited by /.
    return convertToPosixPath(path);
  }

  _getNodeModulesInstallPath(absPath) {
    let installPath;

    this.nodeModulesPaths.some(path => {
      const relPathWithinNodeModules = pathRelative(path, absPath);

      if (relPathWithinNodeModules.startsWith("..")) {
        // absPath is not a subdirectory of path.
        return;
      }

      // Install the module into the local node_modules directory within
      // this app or package.
      return installPath = pathJoin(
        "node_modules",
        relPathWithinNodeModules
      );
    });

    return installPath;
  }

  _getSourceRootInstallPath(absPath) {
    const installPath = pathRelative(this.sourceRoot, absPath);

    if (installPath.startsWith("..")) {
      // absPath is not a subdirectory of this.sourceRoot.
      return;
    }

    const dirs = this._splitPath(pathDirname(installPath));
    const isApp = ! this.name;
    const bundlingForWeb = this.isWeb();

    const topLevelDir = dirs[0];
    if (topLevelDir === "private" ||
        topLevelDir === "packages" ||
        topLevelDir === "programs" ||
        topLevelDir === "cordova-build-override") {
      // Don't load anything from these special top-level directories
      return;
    }

    for (let dir of dirs) {
      if (dir.charAt(0) === ".") {
        // Files/directories whose names start with a dot are never loaded
        return;
      }

      if (isApp) {
        if (bundlingForWeb) {
          if (dir === "server") {
            // If we're bundling an app for a client architecture, any files
            // contained by a server-only directory that is not contained by
            // a node_modules directory must be ignored.
            return;
          }
        } else if (dir === "client") {
          // If we're bundling an app for a server architecture, any files
          // contained by a client-only directory that is not contained by
          // a node_modules directory must be ignored.
          return;
        }
      }

      if (dir === "node_modules") {
        // Accept any file within a node_modules directory.
        return installPath;
      }
    }

    return installPath;
  }

  _splitPath(path) {
    const partsInReverse = [];
    for (let dir; (dir = pathDirname(path)) !== path; path = dir) {
      partsInReverse.push(pathBasename(path));
    }
    return partsInReverse.reverse();
  }

  // Called by this.resolver when a module identifier cannot be resolved.
  _onMissing(parentFile, id, forDynamicImport = false) {
    const isApp = ! this.name;
    const absParentPath = pathJoin(
      this.sourceRoot,
      parentFile.sourcePath,
    );

    if (isApp &&
        Resolver.isNative(id) &&
        this.isWeb()) {
      // To ensure the native module can be evaluated at runtime, register
      // a dependency on meteor-node-stubs/deps/<id>.js.
      const stubId = Resolver.getNativeStubId(id);
      if (isString(stubId) && stubId !== id) {
        const info = parentFile.deps[id];

        // Although not explicitly imported, any stubs associated with
        // this native import should be recorded as implicit "helpers."
        info.helpers = info.helpers || {};
        info.helpers[stubId] = forDynamicImport;

        return this._resolve(parentFile, stubId, forDynamicImport);
      }
    }

    const info = {
      packageName: this.name,
      parentPath: absParentPath,
      bundleArch: this.bundleArch,
      possiblySpurious: false,
      dynamic: false,
    };

    if (parentFile &&
        parentFile.deps &&
        has(parentFile.deps, id)) {
      const importInfo = parentFile.deps[id];
      info.possiblySpurious = importInfo.possiblySpurious;
      info.dynamic = importInfo.dynamic;
    }

    // If the imported identifier is neither absolute nor relative, but
    // top-level, then it might be satisfied by a package installed in
    // the top-level node_modules directory, and we should record the
    // missing dependency so that we can include it in the app bundle.
    if (parentFile) {
      const missing =
        parentFile.missingNodeModules ||
        Object.create(null);
      missing[id] = info;
      parentFile.missingNodeModules = missing;
    }

    if (! has(this.allMissingNodeModules, id) ||
        ! info.possiblySpurious) {
      // Allow any non-spurious identifier to replace an existing
      // possibly spurious identifier.
      this.allMissingNodeModules[id] = info;
    }
  }

  _addPkgJsonToOutput(pkgJsonPath, pkg, forDynamicImport = false) {
    const file = this._getFile(pkgJsonPath);

    if (file) {
      // If the file already exists, just update file.imported according
      // to the forDynamicImport parameter.
      file.imported = forDynamicImport
        ? file.imported || "dynamic"
        : true;

      return file;
    }

    const data = new Buffer(map(pkg, (value, key) => {
      const isIdentifier = /^[_$a-zA-Z]\w*$/.test(key);
      const prop = isIdentifier
        ? "." + key
        : "[" + JSON.stringify(key) + "]";
      return `exports${prop} = ${JSON.stringify(value)};\n`;
    }).join(""));

    const relPkgJsonPath = pathRelative(this.sourceRoot, pkgJsonPath);

    const pkgFile = {
      type: "js", // We represent the JSON module with JS.
      data,
      jsonData: pkg,
      deps: {}, // Avoid accidentally re-scanning this file.
      sourcePath: relPkgJsonPath,
      installPath: this._getInstallPath(pkgJsonPath),
      servePath: relPkgJsonPath,
      hash: sha1(data),
      lazy: true,
      imported: forDynamicImport ? "dynamic" : true,
      // Since _addPkgJsonToOutput is only ever called for package.json
      // files that are involved in resolving package directories, and pkg
      // is only a subset of the information in the actual package.json
      // module, we mark it as imported implicitly, so that the subset can
      // be overridden by the actual module if this package.json file is
      // imported explicitly elsewhere.
      implicit: true,
    };

    this._addFile(pkgJsonPath, pkgFile);

    const hash = optimisticHashOrNull(pkgJsonPath);
    if (hash) {
      this.watchSet.addFile(pkgJsonPath, hash);
    }

    return pkgFile;
  }
}

each(["_readFile", "_findImportedModuleIdentifiers",
      "_getInstallPath"], funcName => {
  ImportScanner.prototype[funcName] = Profile(
    `ImportScanner#${funcName}`, ImportScanner.prototype[funcName]);
});
