import assert from "assert";
import {inspect} from "util";
import {Script} from "vm";
import {
  isString, isObject, isEmpty, has, keys, each, map, omit,
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
  pathBasename,
  pathExtname,
  pathDirname,
  pathIsAbsolute,
  convertToOSPath,
  convertToPosixPath,
  realpathOrNull,
} from "../fs/files.js";

const {
  relative: posixRelative,
  dirname: posixDirname,
  sep: posixSep,
} = require("path").posix;

import {
  optimisticReadFile,
  optimisticStatOrNull,
  optimisticLStatOrNull,
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

// Symbol used by scanMissingModules to mark certain files as temporary,
// to prevent them from being added to scanner.outputFiles.
const fakeSymbol = Symbol("fake");

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
    return jsonDataToCommonJS(file.jsonData);
  },

  ".css"(dataString, hash) {
    return cssToCommonJS(dataString, hash);
  }
};

function jsonDataToCommonJS(data) {
  return "module.exports = " +
    JSON.stringify(data, null, 2) + ";\n";
}

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

function stripLeadingSlash(path) {
  if (typeof path === "string" &&
      path.charAt(0) === "/") {
    return path.slice(1);
  }

  return path;
}

function ensureLeadingSlash(path) {
  if (typeof path !== "string") {
    return path;
  }

  const posix = convertToPosixPath(path);

  if (posix.charAt(0) !== "/") {
    return "/" + posix;
  }

  return posix;
}

// Files start with file.imported === false. As we scan the dependency
// graph, a file can get promoted to "dynamic" or "static" to indicate
// that it has been imported by other modules. The "dynamic" status trumps
// false, and "static" trumps both "dynamic" and false. A file can never
// be demoted to a lower status after it has been promoted.
const importedStatusOrder = [false, "dynamic", "static"];

// Set each file.imported status to the maximum status of provided files.
function alignImportedStatuses(...files) {
  const maxIndex = Math.max(...files.map(
    file => importedStatusOrder.indexOf(file.imported)));
  const maxStatus = importedStatusOrder[maxIndex];
  files.forEach(file => file.imported = maxStatus);
}

// Set file.imported to status if status has a higher index than the
// current value of file.imported.
function setImportedStatus(file, status) {
  if (importedStatusOrder.indexOf(status) >
      importedStatusOrder.indexOf(file.imported)) {
    file.imported = status;
  }
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

// Stub used for entry point modules within node_modules directories on
// the server. These stub modules delegate to native Node evaluation by
// calling module.useNode() immediately, but it's important that we have
// something to include in the bundle so that parent modules have
// something to resolve.
const useNodeStub = {
  dataString: "module.useNode();",
  deps: Object.create(null),
};
useNodeStub.data = Buffer.from(useNodeStub.dataString, "utf8");
useNodeStub.hash = sha1(useNodeStub.data);

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
    this.realPathToFiles = Object.create(null);
    this.realPathCache = Object.create(null);
    this.allMissingModules = Object.create(null);
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
    if (! file || file[fakeSymbol]) {
      // Return file without adding it to this.outputFiles.
      return file;
    }

    const absLowerPath = absPath.toLowerCase();

    if (has(this.absPathToOutputIndex, absLowerPath)) {
      const old = this.outputFiles[
        this.absPathToOutputIndex[absLowerPath]];

      // If the old file is just an empty stub, let the new file take
      // precedence over it.
      if (old.implicit === true) {
        return Object.assign(old, {
          implicit: file.implicit || false
        }, file);
      }

      // If the new file is just an empty stub, pretend the _addFile
      // succeeded by returning the old file, so that we won't try to call
      // _combineFiles needlessly.
      if (file.implicit === true) {
        return old;
      }

    } else {
      this.absPathToOutputIndex[absLowerPath] =
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

      // This property can have values false, true, "dynamic" (which
      // indicates that the file has been imported, but only dynamically).
      file.imported = false;

      file.absModuleId = file.absModuleId || this._getAbsModuleId(absPath);

      if (! this._addFile(absPath, file)) {
        // Collisions can happen if a compiler plugin calls addJavaScript
        // multiple times with the same sourcePath. #6422
        this._combineFiles(this._getFile(absPath), file);
      }

      this._addFileByRealPath(file, this._realPath(absPath));
    });

    return this;
  }

  _addFileByRealPath(file, realPath) {
    assert.ok(isObject(file));
    assert.strictEqual(typeof realPath, "string");

    if (! has(this.realPathToFiles, realPath)) {
      this.realPathToFiles[realPath] = [];
    }

    const files = this.realPathToFiles[realPath];

    if (files.indexOf(file) < 0) {
      files.push(file);
    }

    return file;
  }

  _getInfoByRealPath(realPath) {
    assert.strictEqual(typeof realPath, "string");
    const files = this.realPathToFiles[realPath];
    if (files && files.length > 0) {
      const firstFile = files[0];
      const dataString = this._getDataString(firstFile);
      return {
        data: firstFile.data,
        dataString: dataString,
        hash: firstFile.hash,
      };
    }
    return null;
  }

  _realPath(absPath) {
    if (has(this.realPathCache, absPath)) {
      return this.realPathCache[absPath];
    }

    let relativePath = pathRelative(this.sourceRoot, absPath);
    if (relativePath.startsWith("..")) {
      // If the absPath is outside this.sourceRoot, assume it's real.
      return this.realPathCache[absPath] = absPath;
    }

    let foundSymbolicLink = false;

    while (! foundSymbolicLink) {
      const testPath = pathJoin(this.sourceRoot, relativePath);
      if (testPath === this.sourceRoot) {
        // Don't test the sourceRoot itself.
        break;
      }

      const lstat = optimisticLStatOrNull(testPath);
      if (lstat && lstat.isSymbolicLink()) {
        foundSymbolicLink = true;
        break
      }

      relativePath = pathDirname(relativePath);
    }

    if (foundSymbolicLink) {
      // Call the actual realpathOrNull function only if there were any
      // symlinks involved in the relative path within this.sourceRoot.
      const realPath = realpathOrNull(absPath);
      if (! realPath) {
        // If we couldn't resolve the real path, fall back to the given
        // absPath, and avoid caching.
        return absPath;
      }
      return this.realPathCache[absPath] = realPath;
    }

    return this.realPathCache[absPath] = absPath;
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

      const absSourceId = this._getAbsModuleId(absSourcePath);
      const absTargetId = this._getAbsModuleId(absTargetPath);

      // If file.targetPath differs from file.sourcePath, generate a new
      // file object with that .sourcePath that imports the original file.
      // This allows either the .sourcePath or the .targetPath to be used
      // when importing the original file, and also allows multiple files
      // to have the same .sourcePath but different .targetPaths.
      let sourceFile = this._getFile(absSourcePath);
      if (! sourceFile) {
        sourceFile = this._addFile(absSourcePath, {
          type: file.type,
          sourcePath: file.sourcePath,
          servePath: stripLeadingSlash(absSourceId),
          absModuleId: absSourceId,
          dataString: "",
          deps: {},
          lazy: true,
          imported: false,
          implicit: true,
        });
      }

      // Make sure the original file gets installed at the target path
      // instead of the source path.
      file.absModuleId = absTargetId;
      file.sourcePath = file.targetPath;

      // If the sourceFile was not generated implicitly above, then it
      // must have been explicitly added as a source module, so we should
      // not override or modify its contents. #10233
      if (sourceFile.implicit !== true) {
        return;
      }

      const relativeId = this._getRelativeImportId(
        absSourceId,
        absTargetId,
      );

      // Set the contents of the source module to import the target
      // module(s), combining their exports on the source module's exports
      // object using the module.link live binding system. This is better
      // than `Object.assign(exports, require(relativeId))` because it
      // allows the exports to change in the future, and better than
      // `module.exports = require(relativeId)` because it preserves the
      // original module.exports object, avoiding problems with circular
      // dependencies (#9176, #9190).
      //
      // If there could be only one target module, we could do something
      // less clever here (like using an identifier string alias), but
      // unfortunately we have to tolerate the possibility of a compiler
      // plugin calling inputFile.addJavaScript multiple times for the
      // same source file (see discussion in #9176), with different target
      // paths, code, laziness, etc.
      sourceFile.dataString = this._getDataString(sourceFile) +
        // The + in "*+" indicates that the "default" property should be
        // included as well as any other re-exported properties.
        "module.link(" + JSON.stringify(relativeId) + ', { "*": "*+" });\n';

      sourceFile.data = Buffer.from(sourceFile.dataString, "utf8");
      sourceFile.hash = sha1(sourceFile.data);
      sourceFile.deps[relativeId] = {
        absModuleId: file.absModuleId,
        possiblySpurious: false,
        dynamic: false
      };
    }
  }

  // Concatenate the contents of oldFile and newFile, combining source
  // maps and updating all other properties appropriately. Once this
  // combination is done, oldFile should be kept and newFile discarded.
  _combineFiles(oldFile, newFile) {
    const scanner = this;

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
        SourceNode.fromStringWithSourceMap(
          scanner._getDataString(file),
          consumer
        );
      return node || scanner._getDataString(file);
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
    oldFile.data = Buffer.from(oldFile.dataString, "utf8");
    oldFile.hash = sha1(oldFile.data);

    alignImportedStatuses(oldFile, newFile);

    oldFile.sourceMap = combinedSourceMap.toJSON();
    if (! oldFile.sourceMap.mappings) {
      oldFile.sourceMap = null;
    }
  }

  scanImports() {
    this.outputFiles.forEach(file => {
      if (! file.lazy) {
        this._scanFile(file);
      }
    });

    return this;
  }

  scanMissingModules(missingModules) {
    assert.ok(missingModules);
    assert.ok(typeof missingModules === "object");
    assert.ok(! Array.isArray(missingModules));

    const newlyMissing = Object.create(null);
    const newlyAdded = Object.create(null);

    if (! isEmpty(missingModules)) {
      const previousAllMissingModules = this.allMissingModules;
      this.allMissingModules = newlyMissing;

      Object.keys(missingModules).forEach(id => {
        let staticImportInfo = null;
        let dynamicImportInfo = null;

        // Although it would be logically valid to call this._scanFile for
        // each and every importInfo object, there can be a lot of them
        // (hundreds, maybe thousands). The only relevant difference is
        // whether the file is being scanned as a dynamic import or not,
        // so we can get away with calling this._scanFile at most twice,
        // with a representative importInfo object of each kind.
        missingModules[id].some(importInfo => {
          if (importInfo.parentWasDynamic ||
              importInfo.dynamic) {
            dynamicImportInfo = dynamicImportInfo || importInfo;
          } else {
            staticImportInfo = staticImportInfo || importInfo;
          }

          // Stop when/if both variables have been initialized.
          return staticImportInfo && dynamicImportInfo;
        });

        if (staticImportInfo) {
          this._scanFile({
            sourcePath: "fake.js",
            [fakeSymbol]: true,
            // By specifying the .deps property of this fake file ahead of
            // time, we can avoid calling findImportedModuleIdentifiers in
            // the _scanFile method, which is important because this file
            // doesn't have a .data or .dataString property.
            deps: { [id]: staticImportInfo }
          }, false); // !forDynamicImport
        }

        if (dynamicImportInfo) {
          this._scanFile({
            sourcePath: "fake.js",
            [fakeSymbol]: true,
            deps: { [id]: dynamicImportInfo }
          }, true); // forDynamicImport
        }
      });

      this.allMissingModules = previousAllMissingModules;

      Object.keys(missingModules).forEach(id => {
        if (! has(newlyMissing, id)) {
          // We don't need to use ImportScanner.mergeMissing here because
          // this is the first time newlyAdded[id] has been assigned.
          newlyAdded[id] = missingModules[id];
        }
      });

      // Remove previously seen missing module identifiers from
      // newlyMissing and merge the new identifiers back into
      // this.allMissingModules.
      Object.keys(newlyMissing).forEach(id => {
        if (has(previousAllMissingModules, id)) {
          delete newlyMissing[id];
        } else {
          ImportScanner.mergeMissing(
            previousAllMissingModules,
            { [id]: newlyMissing[id] }
          );
        }
      });
    }

    return {
      newlyAdded,
      newlyMissing,
    };
  }

  // Helper for copying the properties of source into target,
  // concatenating values (which must be arrays) if a property already
  // exists. The array elements should be importInfo objects, and will be
  // deduplicated according to their .parentPath properties.
  static mergeMissing(target, source) {
    keys(source).forEach(id => {
      const importInfoList = source[id];
      const pathToIndex = Object.create(null);

      if (! has(target, id)) {
        target[id] = [];
      } else {
        target[id].forEach((importInfo, index) => {
          pathToIndex[importInfo.parentPath] = index;
        });
      }

      importInfoList.forEach(importInfo => {
        const { parentPath } = importInfo;
        if (typeof parentPath === "string") {
          const index = pathToIndex[parentPath];
          if (typeof index === "number") {
            // If an importInfo object with this .parentPath is already
            // present in the target[id] array, replace it.
            target[id][index] = importInfo;
            return;
          }
        }

        target[id].push(importInfo);
      });
    });
  }

  _mergeFilesWithSameRealPath() {
    Object.keys(this.realPathToFiles).forEach(realPath => {
      const files = this.realPathToFiles[realPath];
      if (! files || files.length < 2) {
        return;
      }

      // We have multiple files that share the same realPath, so we need
      // to figure out which one should actually contain the data, and
      // which one(s) should merely be aliases to the data container.

      let container = files[0];

      // Make sure all the files share the same file.imported value, so
      // that a statically bundled alias doesn't point to a dynamically
      // bundled container, or vice-versa.
      alignImportedStatuses(...files);

      // Take the first file inside node_modules as the container. If none
      // found, default to the first file in the list. It's important to
      // let node_modules files be the containers if possible, since some
      // npm packages rely on having module IDs that appear to be within a
      // node_modules directory.
      files.some(file => {
        if (file.absModuleId &&
            file.absModuleId.startsWith("/node_modules/")) {
          container = file;
          return true;
        }
      });

      // Alias every non-container file to container.absModuleId.
      files.forEach(file => {
        if (file !== container) {
          file.alias = file.alias || {};
          file.alias.absModuleId = container.absModuleId;
        }
      });
    });
  }

  getOutputFiles() {
    this._mergeFilesWithSameRealPath();

    // Return all installable output files that are either eager or
    // imported (statically or dynamically).
    return this.outputFiles.filter(file => {
      return file.absModuleId &&
        ! file[fakeSymbol] &&
        ! file.hasErrors &&
        (! file.lazy || file.imported);
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
      this._getDataString(file),
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

        if (! parentFile.absModuleId) {
          // If parentFile is not installable, then we won't return it
          // from getOutputFiles, so we don't need to worry about
          // recording any parentFile.deps[id].helpers.
          return;
        }

        const relativeId = this._getRelativeImportId(
          parentFile.absModuleId,
          packageJsonFile.absModuleId
        );

        // Although not explicitly imported, any package.json modules
        // involved in resolving this import should be recorded as
        // implicit "helpers."
        info.helpers[relativeId] = forDynamicImport;
      });

      // Any relevant package.json files must have already been added via
      // this._addPkgJsonToOutput before we check whether this file has an
      // .alias. In other words, the Resolver is responsible for including
      // relevant package.json files in resolved.packageJsonMap so that
      // they can be handled by the loop above.
      const file = this._getFile(resolved.path);
      if (file && file.alias) {
        setImportedStatus(file, forDynamicImport ? "dynamic" : "static");
        return file.alias;
      }
    }

    return resolved;
  }

  _getRelativeImportId(absParentId, absChildId) {
    const relativeId = posixRelative(
      posixDirname(absParentId),
      absChildId
    );

    // If the result of pathRelative does not already start with a "." or
    // a "/", prepend a "./" to make it a valid relative identifier
    // according to CommonJS syntax.
    if ("./".indexOf(relativeId.charAt(0)) < 0) {
      return "./" + relativeId;
    }

    return relativeId;
  }

  _scanFile(file, forDynamicImport = false) {
    if (file.imported === "static") {
      // If we've already scanned this file non-dynamically, then we don't
      // need to scan it again.
      return;
    }

    if (forDynamicImport &&
        file.imported === "dynamic") {
      // If we've already scanned this file dynamically, then we don't
      // need to scan it dynamically again.
      return;
    }

    // Set file.imported to a truthy value (either "dynamic" or true).
    setImportedStatus(file, forDynamicImport ? "dynamic" : "static");

    if (file.reportPendingErrors &&
        file.reportPendingErrors() > 0) {
      file.hasErrors = true;
      // Any errors reported to InputFile#error were saved but not
      // reported at compilation time. Now that we know the file has been
      // imported, it's time to report those errors.
      return;
    }

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
        (forDynamicImport ||
         info.parentWasDynamic ||
         info.dynamic);

      const resolved = this._resolve(file, id, dynamic);
      const absImportedPath = resolved && resolved.path;
      if (! absImportedPath) {
        return;
      }

      let depFile = this._getFile(absImportedPath);
      if (depFile) {
        // We should never have stored a fake file in this.outputFiles, so
        // it's surprising if depFile[fakeSymbol] is true.
        assert.notStrictEqual(depFile[fakeSymbol], true);

        // If the module is an implicit package.json stub, update to the
        // explicit version now.
        if (depFile.jsonData &&
            depFile.absModuleId.endsWith("/package.json") &&
            depFile.implicit === true) {
          const file = this._readPackageJson(absImportedPath);
          if (file) {
            depFile.implicit = false;
            Object.assign(depFile, file);
          }
        }

        // If depFile has already been scanned, this._scanFile will return
        // immediately thanks to the depFile.imported-checking logic at
        // the top of the method.
        this._scanFile(depFile, dynamic);

        return;
      }

      depFile = this._readDepFile(absImportedPath);
      if (! depFile) {
        return;
      }

      // Append this file to the output array and record its index.
      this._addFile(absImportedPath, depFile);

      // Recursively scan the module's imported dependencies.
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

  _getDataString(file) {
    if (typeof file.dataString === "string") {
      return file.dataString;
    }

    const dotExt = "." + file.type;
    const dataString = file.data.toString("utf8");
    file.dataString = defaultExtensionHandlers[dotExt].call(
      file,
      dataString,
      file.hash,
    );

    if (! (file.data instanceof Buffer) ||
        file.dataString !== dataString) {
      file.data = Buffer.from(file.dataString, "utf8");
    }

    return file.dataString;
  }

  _readFile(absPath) {
    const info = {
      data: optimisticReadFile(absPath),
      hash: optimisticHashOrNull(absPath),
    };

    this.watchSet.addFile(absPath, info.hash);

    info.dataString = info.data.toString("utf8");

    // Same logic/comment as stripBOM in node/lib/module.js:
    // Remove byte order marker. This catches EF BB BF (the UTF-8 BOM)
    // because the buffer-to-string conversion in `fs.readFileSync()`
    // translates it to FEFF, the UTF-16 BOM.
    if (info.dataString.charCodeAt(0) === 0xfeff) {
      info.dataString = info.dataString.slice(1);
      info.data = Buffer.from(info.dataString, "utf8");
      info.hash = sha1(info.data);
    }

    return info;
  }

  _readPackageJson(absPath) {
    try {
      var info = this._readFile(absPath);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      return null;
    }

    const jsonData = JSON.parse(info.dataString);

    Object.keys(jsonData).forEach(key => {
      // Strip root properties that start with an underscore, since these
      // are "private" npm-specific properties, not added by other package
      // managers like yarn, and they may introduce nondeterminism into
      // the Meteor build. #9878 #9903
      if (key.startsWith("_")) {
        delete jsonData[key];
      }
    });

    info.dataString = jsonDataToCommonJS(jsonData);
    info.data = Buffer.from(info.dataString, "utf8");
    info.hash = sha1(info.data);
    info.jsonData = jsonData;

    return info;
  }

  _readModule(absPath) {
    let ext = pathExtname(absPath).toLowerCase();

    if (ext === ".node") {
      const dataString = "throw new Error(" + JSON.stringify(
        this.isWeb()
          ? "cannot load native .node modules on the client"
          : "module.useNode() must succeed for native .node modules"
      ) + ");\n";

      const data = Buffer.from(dataString, "utf8");
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
      info.data = Buffer.from(info.dataString, "utf8");
    }

    return info;
  }

  _readDepFile(absPath) {
    const absModuleId = this._getAbsModuleId(absPath);
    if (! absModuleId) {
      // The given path cannot be installed on this architecture.
      return null;
    }

    const realPath = this._realPath(absPath);

    let depFile = this._getInfoByRealPath(realPath);
    if (depFile) {
      // If we already have a file with the same real path, use its data
      // rather than reading the file again, or generating a stub. This
      // logic enables selective compilation of node_modules in an elegant
      // way: just expose the package directory within the application
      // (outside of node_modules) using a symlink, so that it will be
      // compiled as application code. When the package is imported from
      // node_modules, the compiled version will be used instead of the
      // raw version found in node_modules. See also:
      // https://github.com/meteor/meteor-feature-requests/issues/6

    } else if (this._shouldUseNode(absModuleId)) {
      // On the server, modules in node_modules directories will be
      // handled natively by Node, so we just need to generate a stub
      // module that calls module.useNode(), rather than calling
      // this._readModule to read the actual module file. Note that
      // useNodeStub includes an empty .deps property, which will make
      // this._scanFile(depFile, dynamic) return immediately.
      depFile = { ...useNodeStub };

      // If optimistic functions care about this file, e.g. because it
      // resides in a linked npm package, then we should allow it to
      // be watched even though we are replacing it with a stub that
      // merely calls module.useNode().
      if (shouldWatch(absPath)) {
        this.watchSet.addFile(
          absPath,
          optimisticHashOrNull(absPath),
        );
      }

    } else {
      depFile = absModuleId.endsWith("/package.json")
        ? this._readPackageJson(absPath)
        : this._readModule(absPath);

      // If the module is not readable, _readModule may return null.
      // Otherwise it will return { data, dataString, hash }.
      if (! depFile) {
        return null;
      }
    }

    depFile.type = "js"; // TODO Is this correct?
    depFile.sourcePath = pathRelative(this.sourceRoot, absPath);
    depFile.absModuleId = absModuleId;
    depFile.servePath = stripLeadingSlash(absModuleId);
    depFile.lazy = true;
    // Setting depFile.imported = false is necessary so that
    // this._scanFile(depFile, dynamic) doesn't think the file has been
    // scanned already and return immediately.
    depFile.imported = false;

    this._addFileByRealPath(depFile, realPath);

    return depFile;
  }

  // Similar to logic in Module.prototype.useNode as defined in
  // packages/modules-runtime/server.js. Introduced to fix issue #10122.
  _shouldUseNode(absModuleId) {
    if (this.isWeb()) {
      // Node should never be used in a browser, obviously.
      return false;
    }

    const parts = absModuleId.split("/");
    let start = 0;

    // Tolerate leading / character.
    if (parts[start] === "") ++start;

    // Meteor package modules include a node_modules component in their
    // absolute module identifiers, but that doesn't mean those modules
    // should be evaluated by module.useNode().
    if (parts[start] === "node_modules" &&
        parts[start + 1] === "meteor") {
      start += 2;
    }

    // If the remaining parts include node_modules, then this is a module
    // that was installed by npm, and it should be evaluated by Node on
    // the server.
    return parts.indexOf("node_modules", start) >= 0;
  }

  // Returns an absolute module identifier indicating where to install the
  // given file via meteorInstall. May return undefined if the file should
  // not be installed on the current architecture.
  _getAbsModuleId(absPath) {
    let path =
      this._getNodeModulesAbsModuleId(absPath) ||
      this._getSourceRootAbsModuleId(absPath);

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
    return ensureLeadingSlash(path);
  }

  _getNodeModulesAbsModuleId(absPath) {
    let absModuleId;

    this.nodeModulesPaths.some(path => {
      const relPathWithinNodeModules = pathRelative(path, absPath);

      if (relPathWithinNodeModules.startsWith("..")) {
        // absPath is not a subdirectory of path.
        return;
      }

      // Install the module into the local node_modules directory within
      // this app or package.
      return absModuleId = pathJoin(
        "node_modules",
        relPathWithinNodeModules
      );
    });

    return ensureLeadingSlash(absModuleId);
  }

  _getSourceRootAbsModuleId(absPath) {
    const relPath = pathRelative(this.sourceRoot, absPath);

    if (relPath.startsWith("..")) {
      // absPath is not a subdirectory of this.sourceRoot.
      return;
    }

    const dirs = relPath.split("/");
    dirs.pop(); // Discard the module's filename.
    while (dirs[0] === "") {
      dirs.shift();
    }

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
        return ensureLeadingSlash(relPath);
      }
    }

    return ensureLeadingSlash(relPath);
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
      // When we later attempt to resolve this id in the application's
      // node_modules directory or in other packages, we need to remember
      // if the parent module was imported dynamically, since that makes
      // this import effectively dynamic, even if the parent module
      // imported the given id with a static import or require.
      parentWasDynamic: forDynamicImport,
    };

    if (parentFile &&
        parentFile.deps &&
        has(parentFile.deps, id)) {
      const importInfo = parentFile.deps[id];
      info.possiblySpurious = importInfo.possiblySpurious;
      // Remember that this property only indicates whether or not the
      // parent module used a dynamic import(...) to import this module.
      // Even if info.dynamic is false (because the parent module used a
      // static import or require for this import), this module may still
      // be effectively dynamic if the parent was imported dynamically, as
      // indicated by info.parentWasDynamic.
      info.dynamic = importInfo.dynamic;
    }

    // If the imported identifier is neither absolute nor relative, but
    // top-level, then it might be satisfied by a package installed in
    // the top-level node_modules directory, and we should record the
    // missing dependency so that we can include it in the app bundle.
    if (parentFile) {
      const missing =
        parentFile.missingModules ||
        Object.create(null);
      missing[id] = info;
      parentFile.missingModules = missing;
    }

    ImportScanner.mergeMissing(
      this.allMissingModules,
      { [id]: [info] }
    );
  }

  _addPkgJsonToOutput(pkgJsonPath, pkg, forDynamicImport = false) {
    const file = this._getFile(pkgJsonPath);

    if (file) {
      // If the file already exists, just update file.imported according
      // to the forDynamicImport parameter.
      setImportedStatus(file, forDynamicImport ? "dynamic" : "static");
      return file;
    }

    const data = Buffer.from(jsonDataToCommonJS(pkg), "utf8");
    const relPkgJsonPath = pathRelative(this.sourceRoot, pkgJsonPath);
    const absModuleId = this._getAbsModuleId(pkgJsonPath);

    const pkgFile = {
      type: "js", // We represent the JSON module with JS.
      data,
      jsonData: pkg,
      deps: {}, // Avoid accidentally re-scanning this file.
      sourcePath: relPkgJsonPath,
      absModuleId,
      servePath: stripLeadingSlash(absModuleId),
      hash: sha1(data),
      lazy: true,
      imported: forDynamicImport ? "dynamic" : "static",
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

    this._resolvePkgJsonBrowserAliases(pkgFile, forDynamicImport);

    return pkgFile;
  }

  _resolvePkgJsonBrowserAliases(pkgFile, forDynamicImport = false) {
    if (! this.isWeb()) {
      return;
    }

    const browser = pkgFile.jsonData.browser;
    if (! isObject(browser)) {
      return;
    }

    const deps = pkgFile.deps;
    const absPkgJsonPath = pathJoin(this.sourceRoot, pkgFile.sourcePath);

    Object.keys(browser).forEach(sourceId => {
      deps[sourceId] = deps[sourceId] || {};

      // TODO What if sourceId is a top-level node_modules identifier?
      const source = this.resolver.resolve(sourceId, absPkgJsonPath);
      if (! source || source === "missing") {
        return;
      }

      const file = this._getFile(source.path);
      if (file && file.alias) {
        // If we previously set an .alias for this file, assume it is
        // complete and return early.
        return;
      }

      const sourceAbsModuleId = this._getAbsModuleId(source.path);
      const hasAuthorityToCreateAlias =
        this._areAbsModuleIdsInSamePackage(
          pkgFile.absModuleId,
          sourceAbsModuleId
        );

      // A package.json file's "browser" field can only establish aliases
      // for modules contained by the same package.
      if (! hasAuthorityToCreateAlias) {
        return;
      }

      const targetId = browser[sourceId];
      const alias = {};

      if (typeof targetId === "string") {
        deps[targetId] = deps[targetId] || {};

        const target = this.resolver.resolve(targetId, absPkgJsonPath);
        if (! target || target === "missing") {
          return;
        }

        // Ignore useless self-referential browser aliases, to fix
        // https://github.com/meteor/meteor/issues/10409.
        if (target.id === source.id) {
          return;
        }

        Object.assign(alias, target);
        alias.absModuleId = this._getAbsModuleId(target.path);

      } else if (targetId === false) {
        // This is supposed to indicate the alias refers to an empty stub.
        alias.absModuleId = false;

      } else {
        return;
      }

      if (file) {
        file.alias = alias;
      } else {
        const relSourcePath = pathRelative(this.sourceRoot, source.path);

        this._addFile(source.path, {
          alias,
          data: Buffer.from("", "utf8"),
          dataString: "",
          sourcePath: relSourcePath,
          absModuleId: sourceAbsModuleId,
          servePath: stripLeadingSlash(sourceAbsModuleId),
          lazy: true,
          imported: false,
          implicit: true,
        });
      }
    });
  }

  _areAbsModuleIdsInSamePackage(path1, path2) {
    if (! (isString(path1) && isString(path2))) {
      return false;
    }

    // Enforce that the input paths look like absolute module identifiers.
    assert.strictEqual(path1.charAt(0), "/");
    assert.strictEqual(path2.charAt(0), "/");

    function getPackageRoot(path) {
      const parts = path.split("/");
      assert.strictEqual(parts[0], "");
      const nmi = parts.lastIndexOf("node_modules");
      return parts.slice(0, nmi + 2).join("/");
    }

    return getPackageRoot(path1) === getPackageRoot(path2);
  }
}

const ISp = ImportScanner.prototype;

[ "_addPkgJsonToOutput",
  "_findImportedModuleIdentifiers",
  "_getAbsModuleId",
  "_readFile",
  "_realPath",
  "_resolve",
  "_resolvePkgJsonBrowserAliases",
  // We avoid profiling _scanFile here because it doesn't typically have
  // much "own time," and it gets called recursively, resulting in deeply
  // nested METEOR_PROFILE output, which often obscures actual problems.
  // "_scanFile",
].forEach(name => {
  ISp[name] = Profile(`ImportScanner#${name}`, ISp[name]);
});

[ // Include the package name in METEOR_PROFILE output for the following
  // public methods:
  "scanImports",
  "scanMissingModules",
].forEach(name => {
  ISp[name] = Profile(function (...args) {
    return `ImportScanner#${name} for ${this.name || "the app"}`;
  }, ISp[name]);
});
