import assert from "assert";
import {isString, has, keys, each, without} from "underscore";
import {sha1} from "../fs/watch.js";
import {findImportedModuleIdentifiers} from "./js-analyze.js";
import {
  pathJoin,
  pathRelative,
  pathNormalize,
  pathDirname,
  statOrNull,
  readFile,
} from "../fs/files.js";

export default class ImportScanner {
  constructor({
    name,
    sourceRoot,
    extensions,
    usedPackageNames = {},
  }) {
    assert.ok(isString(sourceRoot));

    this.name = name;
    this.sourceRoot = sourceRoot;
    this.usedPackageNames = usedPackageNames;
    this.absPathToOutputIndex = {};
    this.outputFiles = [];

    if (extensions) {
      this.extensions = without(extensions, "");
      this.extensions.unshift("");
    } else {
      this.extensions = ["", ".js", ".json"];
    }
  }

  addInputFiles(files) {
    files.forEach(file => {
      const absPath = pathJoin(this.sourceRoot, file.sourcePath);

      // Files that are not eagerly evaluated (lazy) will only be included
      // in the bundle if they are actually imported.
      file.lazy = this._isFileLazy(file);

      if (has(this.absPathToOutputIndex, absPath)) {
        const index = this.absPathToOutputIndex[absPath];
        this.outputFiles[index] = file;
      } else {
        this.absPathToOutputIndex[absPath] =
          this.outputFiles.push(file) - 1;
      }
    });

    return this;
  }

  getOutputFiles() {
    this.outputFiles.forEach(this._scanFile, this);
    return this.outputFiles;
  }

  _isFileLazy(file) {
    if (has(file, "lazy")) {
      return !! file.lazy;
    }

    // If file.lazy was not previously defined, mark the file lazy if it
    // is contained by an imports directory. Note that any files contained
    // by a node_modules directory will already have been marked lazy in
    // PackageSource#_inferFileOptions. The reason we can't do all our
    // lazy marking in the _inferFileOptions method is that we don't know
    // then whether the current app or package is using the modules
    // package. At this point, we know the modules package must be in use,
    // because the ImportScanner is only ever used when modules are used.
    return this._splitPath(
      pathDirname(file.sourcePath)
    ).indexOf("imports") >= 0;
  }

  _scanFile(file) {
    if (file.deps) {
      return;
    }

    const data = file.data.toString("utf8");
    const absFilePath = pathJoin(this.sourceRoot, file.sourcePath);

    file.deps = keys(findImportedModuleIdentifiers(data));

    each(file.deps, id => {
      const absImportedPath = this._tryToResolveImportedPath(id, absFilePath);
      if (! absImportedPath ||
          // Avoid scanning files that we've scanned before.
          has(this.absPathToOutputIndex, absImportedPath)) {
        return;
      }

      var relImportedPath = pathRelative(this.sourceRoot, absImportedPath);

      // TODO Disallow files outside this.sourceRoot in a way that works
      // between isopacket directories and package source directories.

      // TODO If the dependency is eagerly evaluated on a different
      // architecture, but not on this architecture, then ignore it and
      // warn the developer.

      const depFile = Object.create(Object.getPrototypeOf(file));
      depFile.type = "js"; // TODO Is this correct?
      depFile.data = readFile(absImportedPath);
      depFile.sourcePath = relImportedPath;
      depFile.servePath = relImportedPath;
      depFile.hash = sha1(depFile.data);
      depFile.lazy = true;

      // Append this file to the output array and record its index.
      this.absPathToOutputIndex[absImportedPath] =
        this.outputFiles.push(depFile) - 1;

      this._scanFile(depFile);
    });
  }

  _tryToResolveImportedPath(id, path) {
    let resolved =
      this._resolveAbsolute(id) ||
      this._resolveRelative(id, path) ||
      this._resolveNodeModule(id, path);

    while (resolved && resolved.stat.isDirectory()) {
      resolved = this._resolvePkgJsonMain(resolved.path) ||
        this._joinAndStat(dirPath, "index.js");
    }

    return resolved && resolved.path;
  }

  _joinAndStat(...joinArgs) {
    const path = pathNormalize(pathJoin(...joinArgs));
    for (let ext of this.extensions) {
      const pathWithExt = path + ext;
      const stat = statOrNull(pathWithExt);
      if (stat) {
        return { path: pathWithExt, stat };
      }
    }
    return null;
  }

  _resolveAbsolute(id) {
    return id.charAt(0) === "/" &&
      this._joinAndStat(this.sourceRoot, id.slice(1));
  }

  _resolveRelative(id, path) {
    return id.charAt(0) === "." &&
      this._joinAndStat(path, "..", id);
  }

  _resolveNodeModule(id, path) {
    let resolved = null;

    const packageName = this._getMeteorPackageNameFromId(id);
    if (packageName) {
      this._addMeteorPackageStubToOutput(packageName);
    } else {
      let dir = path;
      do {
        dir = pathDirname(dir);
        resolved = this._joinAndStat(dir, "node_modules", id);
      } while (! resolved && dir !== this.sourceRoot);
    }

    return resolved;
  }

  _getMeteorPackageNameFromId(id) {
    const possiblePackageName = id.split("/", 1)[0];
    if (has(this.usedPackageNames, possiblePackageName)) {
      return possiblePackageName;
    }
  }

  _resolvePkgJsonMain(dirPath) {
    const pkgJsonPath = pathJoin(dirPath, "package.json");

    let pkg;
    try {
      pkg = JSON.parse(readFile(pkgJsonPath, "utf8"));
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
        // Output a JS module that exports just the "name" and "main"
        // properties defined in the package.json file.
        "exports.name = " + JSON.stringify(pkg.name) + ";\n" +
        "exports.main = " + JSON.stringify(pkg.main) + ";\n"
      );

      const relPkgJsonPath = pathRelative(this.sourceRoot, pkgJsonPath);

      const pkgFile = {
        type: "js", // We represent the JSON module with JS.
        data,
        deps: [], // Avoid accidentally re-scanning this file.
        sourcePath: relPkgJsonPath,
        servePath: relPkgJsonPath,
        hash: sha1(data),
        lazy: true,
      };

      this.absPathToOutputIndex[pkgJsonPath] =
        this.outputFiles.push(pkgFile) - 1;
    }
  }

  // Adds a <packageName>.js module file to the top-level node_modules
  // directory. This module just exports the Package[packageName] object.
  // If the package installs any modules when we link it, those modules
  // will end up in a directory called node_modules/<packageName>/, which
  // is importantly distinct from node_modules/<packageName>.js. Though
  // Node allows .js module files as direct children of node_modules
  // directories, npm never takes advantage of this possibility, which
  // conveniently allows Meteor to install files there without conflict.
  _addMeteorPackageStubToOutput(packageName) {
    const relPkgPath = pathJoin("node_modules", packageName + ".js");
    const absPkgPath = pathJoin(this.sourceRoot, relPkgPath);

    // Note that this absPkgPath need not actually exist on disk!
    if (! has(this.absPathToOutputIndex, absPkgPath)) {
      const data = new Buffer(
        "module.exports = Package[" +
          JSON.stringify(packageName) +
        "];\n"
      );

      const stubFile = {
        type: "js",
        data,
        deps: [], // Avoid accidentally re-scanning this file.
        sourcePath: relPkgPath,
        installPath: relPkgPath,
        servePath: relPkgPath,
        lazy: true,
      };

      this.absPathToOutputIndex[absPkgPath] =
        this.outputFiles.push(stubFile) - 1;
    }
  }
}
