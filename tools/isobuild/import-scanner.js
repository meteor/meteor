import assert from "assert";
import {isString, has, keys, each, without} from "underscore";
import {sha1} from "../fs/watch.js";
import {matches as archMatches} from "../utils/archinfo.js";
import {findImportedModuleIdentifiers} from "./js-analyze.js";
import {
  pathJoin,
  pathRelative,
  pathNormalize,
  pathDirname,
  pathBasename,
  pathExtname,
  statOrNull,
  readFile,
  convertToPosixPath,
} from "../fs/files.js";

export default class ImportScanner {
  constructor({
    name,
    bundleArch,
    sourceRoot,
    extensions = [".js", ".json"],
    usedPackageNames = {},
    nodeModulesPath,
  }) {
    assert.ok(isString(sourceRoot));

    this.name = name;
    this.bundleArch = bundleArch;
    this.sourceRoot = sourceRoot;
    this.usedPackageNames = usedPackageNames;
    this.nodeModulesPath = nodeModulesPath;
    this.absPathToOutputIndex = {};
    this.outputFiles = [];
    this.extensions = extensions;
  }

  addInputFiles(files) {
    files.forEach(file => {
      const absPath = pathJoin(this.sourceRoot, file.sourcePath);

      // Files that are not eagerly evaluated (lazy) will only be included
      // in the bundle if they are actually imported.
      file.lazy = this._isFileLazy(file);

      // Files that are eagerly evaluated are effectively "imported" as
      // entry points.
      file.imported = ! file.lazy;

      file.installPath = this._getInstallInfo(absPath).path;

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
    this.outputFiles.forEach(file => {
      const absPath = pathJoin(this.sourceRoot, file.sourcePath);
      file.deps = this._scanDeps(absPath, file.data)
    });

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

  _scanDeps(absPath, data) {
    const deps = keys(findImportedModuleIdentifiers(data.toString("utf8")));

    each(deps, id => {
      const absImportedPath = this._tryToResolveImportedPath(id, absPath);
      if (! absImportedPath) {
        return;
      }

      if (has(this.absPathToOutputIndex, absImportedPath)) {
        // Avoid scanning files that we've scanned before, but mark them
        // as imported so we know to include them in the bundle if they
        // are lazy.
        const index = this.absPathToOutputIndex[absImportedPath];
        this.outputFiles[index].imported = true;
        return;
      }

      const installInfo = this._getInstallInfo(absImportedPath);
      if (! installInfo) {
        // The given path cannot be installed on this architecture.
        return;
      }

      if (! installInfo.inNodeModules) {
        // At this point, if the file is not in a node_modules directory,
        // and it was not part of the set of input files, then we can
        // conclude there was no JS output for it on this architecture, so
        // we should not try to add it to the bundle.
        return;
      }

      var relImportedPath = pathRelative(this.sourceRoot, absImportedPath);

      const depData = readFile(absImportedPath);
      const depFile = {
        type: "js", // TODO Is this correct?
        data: depData,
        sourcePath: relImportedPath,
        installPath: installInfo.path,
        servePath: installInfo.path,
        hash: sha1(depData),
        lazy: true,
        imported: true,
      };

      // Append this file to the output array and record its index.
      this.absPathToOutputIndex[absImportedPath] =
        this.outputFiles.push(depFile) - 1;

      depFile.deps = this._scanDeps(absImportedPath, depFile.data);
    });

    return deps;
  }

  // Returns a { installPath, inNodeModules } record indicating where to
  // install the given file via meteorInstall, and whether it resides in a
  // node_modules directory. May return undefined if the file should not
  // be installed on the current architecture.
  _getInstallInfo(absPath) {
    const info =
      this._getNodeModulesInstallInfo(absPath) ||
      this._getSourceRootInstallInfo(absPath);

    if (! info) {
      return;
    }

    if (this.name) {
      // If we're bundling a package, prefix info.path with
      // node_modules/<package name>/.
      info.path = pathJoin("node_modules", this.name, info.path);
    } else {
      // If we're bundling an app, prefix info.path with app/.
      info.path = pathJoin("app", info.path);
    }

    // Note that info.inNodeModules may be false even if info.path now
    // contains a node_modules directory.
    return info;
  }

  _getNodeModulesInstallInfo(absPath) {
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

      return {
        // Install the module into the local node_modules directory within
        // this app or package.
        path: pathJoin("node_modules", relPathWithinNodeModules),
        // The original path was contained by a node_modules directory.
        inNodeModules: true,
      };
    }
  }

  _getSourceRootInstallInfo(absPath) {
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
        return {
          path: installPath,
          inNodeModules: true,
        };
      }
    }

    return {
      path: installPath,
      inNodeModules: false,
    };
  }

  _hasKnownExtension(path) {
    return this.extensions.indexOf(pathExtname(path)) >= 0;
  }

  _splitPath(path) {
    const partsInReverse = [];
    for (let dir; (dir = pathDirname(path)) !== path; path = dir) {
      partsInReverse.push(pathBasename(path));
    }
    return partsInReverse.reverse();
  }

  _tryToResolveImportedPath(id, path) {
    let resolved =
      this._resolveAbsolute(id) ||
      this._resolveRelative(id, path) ||
      this._resolveNodeModule(id, path);

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

    for (let ext of this.extensions) {
      const pathWithExt = path + ext;
      const stat = statOrNull(pathWithExt);
      if (stat) {
        return { path: pathWithExt, stat };
      }
    }

    if (exactResult && exactStat.isDirectory()) {
      // After trying all available file extensions, fall back to the
      // original result if it was a directory.
      return exactResult;
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

      if (! resolved && this.nodeModulesPath) {
        // After checking any local node_modules directories, fall back to
        // the package NPM directory, if one was specified.
        resolved = this._joinAndStat(this.nodeModulesPath, id);
      }
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
        installPath: this._getInstallInfo(pkgJsonPath).path,
        servePath: relPkgJsonPath,
        hash: sha1(data),
        lazy: true,
        imported: true,
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
        imported: true,
      };

      this.absPathToOutputIndex[absPkgPath] =
        this.outputFiles.push(stubFile) - 1;
    }
  }
}
