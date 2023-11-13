/// Implements the process of managing a package's .npm directory,
/// in which we call `npm install` to install npm dependencies,
/// and a variety of related commands. Notably, we use `npm shrinkwrap`
/// to ensure we get consistent versions of npm sub-dependencies.

var assert = require('assert');
var cleanup = require('../tool-env/cleanup.js');
var fs = require('fs');
var files = require('../fs/files');
var _ = require('underscore');
var buildmessage = require('../utils/buildmessage.js');
var utils = require('../utils/utils.js');
var runLog = require('../runners/run-log.js');
var Profile = require('../tool-env/profile').Profile;
import { parse } from "semver";
import {
  get as getRebuildArgs
} from "../static-assets/server/npm-rebuild-args.js";
import {
  convert as convertColonsInPath
} from "../utils/colon-converter.js";

import { wrap as wrapOptimistic } from "optimism";
import {
  dirtyNodeModulesDirectory,
  optimisticLStat,
  optimisticStatOrNull,
  optimisticReadJsonOrNull,
  optimisticReaddir,
} from "../fs/optimistic";

var meteorNpm = exports;

// change this will recreate the npm-shrinkwrap.json file
// and install all dependencies from scratch
const LOCK_FILE_VERSION = 4;

// Expose the version of npm in use from the dev bundle.
meteorNpm.npmVersion = "10.1.0";

// if a user exits meteor while we're trying to create a .npm
// directory, we will have temporary directories that we clean up
var tmpDirs = [];
cleanup.onExit(function () {
  _.each(tmpDirs, function (dir) {
    if (files.exists(dir)) {
      files.rm_recursive(dir);
    }
  });
});

// Exception used internally to gracefully bail out of a npm run if
// something goes wrong
var NpmFailure = function () {};

// Creates a temporary directory in which the new contents of the
// package's .npm directory will be assembled. If all is successful,
// renames that directory back to .npm. Returns true if there are NPM
// dependencies and they are installed without error.
//
// @param npmDependencies {Object} dependencies that should be
//     installed, eg {tar: '0.1.6', gcd: '0.0.0'}. If falsey or empty,
//     will remove the .npm directory instead.
meteorNpm.updateDependencies = async function (packageName,
                                         packageNpmDir,
                                         npmDependencies,
                                         quiet) {
  // we make sure to put it beside the original package dir so that
  // we can then atomically rename it. we also make sure to
  // randomize the name, in case we're bundling this package
  // multiple times in parallel.
  var newPackageNpmDir =
    convertColonsInPath(packageNpmDir) + '-new-' + utils.randomToken();

  if (! npmDependencies || _.isEmpty(npmDependencies)) {
    // No NPM dependencies? Delete the .npm directory if it exists (because,
    // eg, we used to have NPM dependencies but don't any more).  We'd like to
    // do this in as atomic a way as possible in case multiple meteor
    // instances are trying to make this update in parallel, so we rename the
    // directory to something before doing the rm -rf.
    try {
      await files.rename(packageNpmDir, newPackageNpmDir);
    } catch (e) {
      if (e.code !== 'ENOENT') {
        throw e;
      }
      // It didn't exist, which is exactly what we wanted.
      return false;
    }
    await files.rm_recursive(newPackageNpmDir);
    return false;
  }

  try {
    // v0.6.0 had a bug that could cause .npm directories to be
    // created without npm-shrinkwrap.json
    // (https://github.com/meteor/meteor/pull/927). Running your app
    // in that state causes consistent "Corrupted .npm directory"
    // errors.
    //
    // If you've reached that state, delete the empty directory and
    // proceed.
    if (files.exists(packageNpmDir) &&
        ! files.exists(files.pathJoin(packageNpmDir, 'npm-shrinkwrap.json'))) {
      await files.rm_recursive(packageNpmDir);
    }

    // with the changes on npm 8, where there were changes to how the packages metadata is given
    // we need to reinstall all packages from scratch
    // and to do that we need to rewrite all the shrinkwrap files
    if (files.exists(packageNpmDir)) {
      try {
        const shrinkwrap = JSON.parse(files.readFile(
          files.pathJoin(packageNpmDir, 'npm-shrinkwrap.json')
        ));
        if (shrinkwrap.lockfileVersion !== LOCK_FILE_VERSION) {
          await files.rm_recursive(packageNpmDir);
        }
      } catch (e) {}
    }

    if (files.exists(packageNpmDir)) {
      // we already nave a .npm directory. update it appropriately with some
      // ceremony involving:
      // `npm install`, `npm install name@version`, `npm shrinkwrap`
      await updateExistingNpmDirectory(
        packageName, newPackageNpmDir, packageNpmDir, npmDependencies, quiet);
    } else {
      // create a fresh .npm directory with `npm install
      // name@version` and `npm shrinkwrap`
      await createFreshNpmDirectory(
        packageName, newPackageNpmDir, packageNpmDir, npmDependencies, quiet);
    }
  } catch (e) {
    if (e instanceof NpmFailure) {
      // Something happened that was out of our control, but wasn't
      // exactly unexpected (eg, no such npm package, no internet
      // connection). Handle it gracefully.
      return false;
    }

    // Some other exception -- let it propagate.
    throw e;
  } finally {
    if (files.exists(newPackageNpmDir)) {
      await files.rm_recursive(newPackageNpmDir);
    }
    tmpDirs = _.without(tmpDirs, newPackageNpmDir);
  }

  return true;
};

// Returns a flattened dictionary of npm package names used in production,
// or false if there is no package.json file in the parent directory.
export const getProdPackageNames = wrapOptimistic(nodeModulesDir => {
  const names = Object.create(null);
  const dirs = Object.create(null);
  const nodeModulesDirStack = [];

  // Returns true iff dir is a package directory.
  function walk(dir) {
    const packageJsonPath = files.pathJoin(dir, "package.json");
    const packageJsonStat = optimisticStatOrNull(packageJsonPath);

    if (packageJsonStat &&
        packageJsonStat.isFile()) {
      const pkg = optimisticReadJsonOrNull(packageJsonPath);
      const nodeModulesDir = files.pathJoin(dir, "node_modules");
      nodeModulesDirStack.push(nodeModulesDir);

      // Scan all dependencies except pkg.devDependencies.
      scanDeps(pkg.dependencies);
      scanDeps(pkg.peerDependencies);
      scanDeps(pkg.optionalDependencies);
      scanDeps(pkg.bundledDependencies);
      // This typo is also honored.
      scanDeps(pkg.bundleDependencies);

      assert.strictEqual(
        nodeModulesDirStack.pop(),
        nodeModulesDir
      );

      return true;
    }

    return false;
  }

  function scanDeps(deps) {
    if (! deps) {
      return;
    }

    Object.keys(deps).forEach(name => {
      const resDir = resolve(name);
      if (! resDir || _.has(dirs, resDir)) {
        return;
      }

      // Record that we've seen this directory so that we don't try to
      // walk it again.
      dirs[resDir] = name;

      if (walk(resDir)) {
        // If resDir is indeed a package directory, record the package
        // name in the set of production names.
        names[name] = true;
      }
    });
  }

  function resolve(name) {
    for (let i = nodeModulesDirStack.length - 1; i >= 0; --i) {
      const nodeModulesDir = nodeModulesDirStack[i];
      const candidate = files.pathJoin(nodeModulesDir, name);
      const stat = optimisticStatOrNull(candidate);
      if (stat && stat.isDirectory()) {
        return candidate;
      }
    }
  }

  // If the top-level nodeModulesDir is not contained by a package
  // directory with a package.json file, then we return false to indicate
  // that we don't know or care which packages are production-specific.
  // Concretely, this means your app needs to have a package.json file if
  // you want any npm packages to be excluded in production.
  return walk(files.pathDirname(nodeModulesDir)) && names;
});

const lastRebuildJSONFilename = ".meteor-last-rebuild-version.json";

const currentVersions = {
  platform: process.platform,
  arch: process.arch,
  versions: {...process.versions},
};

const currentVersionsJSON =
  JSON.stringify(currentVersions, null, 2) + "\n";

function recordLastRebuildVersions(pkgDir) {
  // Record the current process.{platform,arch,versions} so that we can
  // avoid copying/rebuilding/renaming next time.
  files.writeFile(
    files.pathJoin(pkgDir, lastRebuildJSONFilename),
    currentVersionsJSON,
    "utf8"
  );
}

// Returns true iff isSubtreeOf(currentVersions, versions), allowing
// valid semantic versions to differ in their patch versions.
function versionsAreCompatible(versions) {
  return isSubtreeOf(currentVersions, versions, (a, b) => {
    // Technically already handled by isSubtreeOf, but doesn't hurt.
    if (a === b) {
      return true;
    }

    if (! a || ! b) {
      return false;
    }

    const aType = typeof a;
    const bType = typeof b;

    if (aType !== bType) {
      return false;
    }

    if (aType === "string") {
      const aVer = parse(a);
      const bVer = parse(b);
      return aVer && bVer &&
        aVer.major === bVer.major &&
        aVer.minor === bVer.minor;
    }
  });
}

function rebuildVersionsAreCompatible(pkgPath) {
  const versionFile =
    files.pathJoin(pkgPath, lastRebuildJSONFilename);

  return versionsAreCompatible(
    optimisticReadJsonOrNull(versionFile));
}

function isDirectory(path) {
  const stat = optimisticStatOrNull(path);
  return !! (stat && stat.isDirectory());
}

// Rebuilds any binary dependencies in the given node_modules directory,
// and returns true iff anything was rebuilt.
meteorNpm.rebuildIfNonPortable =
Profile("meteorNpm.rebuildIfNonPortable", async function (nodeModulesDir) {
  const dirsToRebuild = [];

  function scan(dir, scoped) {
    if (! isDirectory(dir)) {
      return;
    }

    files.readdir(dir).forEach(item => {
      if (item.startsWith(".")) {
        // Ignore "hidden" files, such as node_modules/.bin directories.
        return;
      }

      const path = files.pathJoin(dir, item);

      if (! scoped &&
          item.startsWith("@")) {
        return scan(path, true);
      }

      if (! isDirectory(path)) {
        return;
      }

      if (isPortable(path)) {
        return;
      }

      if (rebuildVersionsAreCompatible(path)) {
        return;
      }

      dirsToRebuild.push(path);
    });
  }

  scan(nodeModulesDir);

  if (dirsToRebuild.length === 0) {
    return false;
  }

  const tempDir = files.pathJoin(
    nodeModulesDir,
    ".temp-" + utils.randomToken()
  );

  // There's a chance the basename of the original nodeModulesDir isn't
  // actually "node_modules", which will confuse the `npm rebuild`
  // command, but fortunately we can ensure this temporary directory has
  // exactly that basename.
  const tempNodeModules = files.pathJoin(tempDir, "node_modules");
  files.mkdir_p(tempNodeModules);

  // Map from original package directory paths to temporary package
  // directory paths.
  const tempPkgDirs = {};

  for (const pkgPath of dirsToRebuild.splice(0)) {
    const tempPkgDir = tempPkgDirs[pkgPath] = files.pathJoin(
        tempNodeModules,
        files.pathRelative(nodeModulesDir, pkgPath)
    );

    // It's possible the pkgPath directory may have been deleted since we
    // did the scan above: https://circleci.com/gh/meteor/meteor/31330
    if (isDirectory(pkgPath)) {
      // Copy the package directory instead of renaming it, so that the
      // original package will be left untouched if the rebuild fails. We
      // could just run files.cp_r(pkgPath, tempPkgDir) here, except that we
      // want to handle nested node_modules directories specially.
      await copyNpmPackageWithSymlinkedNodeModules(pkgPath, tempPkgDir);

      // Record the current process.versions so that we can avoid
      // copying/rebuilding/renaming next time.
      recordLastRebuildVersions(tempPkgDir);

      dirsToRebuild.push(pkgPath);
    }
  }

  // The `npm rebuild` command must be run in the parent directory of the
  // relevant node_modules directory, which in this case is tempDir.
  const rebuildResult = await runNpmCommand(getRebuildArgs(), tempDir);
  if (! rebuildResult.success) {
    buildmessage.error(rebuildResult.error);
    await files.rm_recursive(tempDir);
    return false;
  }

  dirtyNodeModulesDirectory(nodeModulesDir);

  // If the `npm rebuild` command succeeded, overwrite the original
  // package directories with the rebuilt package directories.
  for (const pkgPath of dirsToRebuild) {
    const actualNodeModulesDir =
        files.pathJoin(pkgPath, "node_modules");

    const actualNodeModulesStat =
        files.statOrNull(actualNodeModulesDir);

    if (actualNodeModulesStat &&
        actualNodeModulesStat.isDirectory()) {
      // If the original package had a node_modules directory, move it
      // into the temporary package directory, overwriting the one created
      // by copyNpmPackageWithSymlinkedNodeModules (which contains only
      // symlinks), so that when we rename the temporary directory back to
      // the original directory below, we'll end up with a node_modules
      // directory that contains real packages rather than symlinks.

      const symlinkNodeModulesDir =
          files.pathJoin(tempPkgDirs[pkgPath], "node_modules");

      await files.renameDirAlmostAtomically(
          actualNodeModulesDir,
          symlinkNodeModulesDir
      );
    }

    await files.renameDirAlmostAtomically(tempPkgDirs[pkgPath], pkgPath);
  }

  await files.rm_recursive(tempDir);

  return true;
});

// Copy an npm package directory to another location, but attempt to
// symlink all of its node_modules rather than recursively copying them,
// which potentially saves a lot of time.
async function copyNpmPackageWithSymlinkedNodeModules(fromPkgDir, toPkgDir) {
  files.mkdir_p(toPkgDir);

  let needToHandleNodeModules = false;

  for (const item of files.readdir(fromPkgDir)) {
    if (item === "node_modules") {
      // We'll link or copy node_modules in a follow-up step.
      needToHandleNodeModules = true;
      continue;
    }

    await files.cp_r(
        files.pathJoin(fromPkgDir, item),
        files.pathJoin(toPkgDir, item)
    );
  }

  if (! needToHandleNodeModules) {
    return;
  }

  const nodeModulesFromPath = files.pathJoin(fromPkgDir, "node_modules");
  const nodeModulesToPath = files.pathJoin(toPkgDir, "node_modules");

  files.mkdir(nodeModulesToPath);

  for (const depPath of files.readdir(nodeModulesFromPath)) {
    if (depPath === ".bin") {
      // Avoid copying node_modules/.bin because commands like
      // .bin/node-gyp and .bin/node-pre-gyp tend to cause problems.
      continue;
    }

    const absDepFromPath = files.pathJoin(nodeModulesFromPath, depPath);

    if (! files.stat(absDepFromPath).isDirectory()) {
      // Only copy package directories, even though there might be other
      // kinds of files in node_modules.
      continue;
    }

    const absDepToPath = files.pathJoin(nodeModulesToPath, depPath);

    // Try to symlink node_modules dependencies if possible (faster),
    // and fall back to a recursive copy otherwise.
    try {
      files.symlink(absDepFromPath, absDepToPath, "junction");
    } catch (e) {
      await files.cp_r(absDepFromPath, absDepToPath);
    }
  }
}

const portableCache = Object.create(null);

// Increment this version to trigger the full portability check again.
const portableVersion = 2;

const isPortable = Profile("meteorNpm.isPortable", dir => {
  const lstat = optimisticLStat(dir);
  if (! lstat.isDirectory()) {
    // Non-directory files are portable unless they end with .node.
    return ! dir.endsWith(".node");
  }

  const pkgJsonPath = files.pathJoin(dir, "package.json");
  const pkgJsonStat = optimisticStatOrNull(pkgJsonPath);
  const canCache = pkgJsonStat && pkgJsonStat.isFile();
  const portableFile = files.convertToOSPath(
    files.pathJoin(dir, ".meteor-portable-" + portableVersion + ".json")
  );

  if (canCache) {
    // Cache previous results by writing a boolean value to a hidden file
    // called .meteor-portable. Although it's tempting to write this file
    // once for the whole node_modules directory, it's important that we
    // put .meteor-portable files only in the individual top-level package
    // directories, so that they will get cleared away the next time those
    // packages are (re)installed.
    const result = _.has(portableCache, portableFile)
      ? portableCache[portableFile]
      : optimisticReadJsonOrNull(portableFile, {
          // Make optimisticReadJsonOrNull return null if there's a
          // SyntaxError when parsing the .meteor-portable file.
          allowSyntaxError: true
        });

    if (typeof result === "boolean") {
      return result;
    }

  } else {
    // Clean up any .meteor-portable files we mistakenly wrote in
    // directories that do not contain package.json files. #7296
    fs.unlink(portableFile, error => {});
  }

  const pkgJson = canCache && optimisticReadJsonOrNull(pkgJsonPath, {
    // A syntactically incorrect `package.json` isn't likely to have other
    // effects since the npm itself likely won't install but the developer has
    // no control over that happening so we should allow this.
    allowSyntaxError: true
  });

  const hasBuildScript =
    pkgJson &&
    pkgJson.scripts &&
    (pkgJson.scripts.preinstall ||
     pkgJson.scripts.install ||
     pkgJson.scripts.postinstall);

  const result = hasBuildScript
    ? false // Build scripts may not be portable.
    : optimisticReaddir(dir).every(
      // Ignore files that start with a ".", such as .bin directories.
      itemName => itemName.startsWith(".") ||
        isPortable(files.pathJoin(dir, itemName)));

  if (canCache) {
    // Write the .meteor-portable file asynchronously, and don't worry
    // if it fails, e.g. because the file system is read-only (#6591).
    // Failing to write the file only means more work next time.
    fs.writeFile(
      portableFile,
      JSON.stringify(result) + "\n",
      error => {
        // Once the asynchronous write finishes (successful or not), we no
        // longer need to cache the written value in memory.
        delete portableCache[portableFile];
      },
    );

    // Cache the result immediately in memory so we don't have to wait for
    // file change notifications to invalidate optimisticReadJsonOrNull.
    portableCache[portableFile] = result;
  }

  return result;
});

// Return true if all of a package's npm dependencies are portable
// (that is, if the node_modules can be copied anywhere and we'd
// expect it to work, rather than containing native extensions that
// were built just for our architecture), else
// false. updateDependencies should first be used to bring
// nodeModulesDir up to date.
meteorNpm.dependenciesArePortable = function (nodeModulesDir) {
  // We use a simple heuristic: we check to see if a package (or any
  // of its transitive dependencies) contains any *.node files. .node
  // is the extension that signals to Node that it should load a file
  // as a shared object rather than as JavaScript, so this should work
  // in the vast majority of cases.

  assert.ok(
    files.pathBasename(nodeModulesDir).startsWith("node_modules"),
    "Bad node_modules directory: " + nodeModulesDir,
  );

  // Only check/write .meteor-portable files in each of the top-level
  // package directories.
  return isPortable(nodeModulesDir);
};

var makeNewPackageNpmDir = function (newPackageNpmDir) {
  // keep track so that we can remove them on process exit
  tmpDirs.push(newPackageNpmDir);
  files.mkdir_p(newPackageNpmDir);

  // create node_modules -- prevent npm install from installing
  // to an existing node_modules dir higher up in the filesystem
  files.mkdir(files.pathJoin(newPackageNpmDir, 'node_modules'));

  // create .gitignore -- node_modules shouldn't be in git since we
  // recreate it as needed by using `npm install`. since we use `npm
  // shrinkwrap` we're guaranteed to have the same version installed
  // each time.
  files.writeFile(
    files.pathJoin(newPackageNpmDir, '.gitignore'),
    ['node_modules',
     ''/*git diff complains without trailing newline*/].join('\n'));
};

var updateExistingNpmDirectory = async function (packageName, newPackageNpmDir,
                                           packageNpmDir, npmDependencies,
                                           quiet) {
  // sanity check on contents of .npm directory
  if (!files.stat(packageNpmDir).isDirectory()) {
    throw new Error("Corrupted .npm directory -- should be a directory: " +
                    packageNpmDir);
  }
  if (!files.exists(files.pathJoin(packageNpmDir, 'npm-shrinkwrap.json'))) {
    throw new Error(
      "Corrupted .npm directory -- can't find npm-shrinkwrap.json in " +
        packageNpmDir);
  }

  // We need to rebuild all node modules when the Node version
  // changes, in case there are some binary ones. Technically this is
  // racey, but it shouldn't fail very often.
  var nodeModulesDir = files.pathJoin(packageNpmDir, 'node_modules');
  if (files.exists(nodeModulesDir)) {
    var oldNodeVersion;
    try {
      oldNodeVersion = files.readFile(
        files.pathJoin(packageNpmDir, 'node_modules', '.node_version'), 'utf8');
    } catch (e) {
      if (e.code !== 'ENOENT') {
        throw e;
      }
      // Use the Node version from the last release where we didn't
      // drop this file.
      oldNodeVersion = 'v0.8.24';
    }

    if (oldNodeVersion !== currentNodeCompatibilityVersion()) {
      await files.rm_recursive(nodeModulesDir);
    }
  }

  // Make sure node_modules is present (fix for #1761). Prevents npm install
  // from installing to an existing node_modules dir higher up in the
  // filesystem.  node_modules may be absent due to a change in Node version or
  // when `meteor add`ing a cloned package for the first time (node_modules is
  // excluded by .gitignore)
  if (! files.exists(nodeModulesDir)) {
    files.mkdir(nodeModulesDir);
  }

  var installedDependenciesTree = getInstalledDependenciesTree(packageNpmDir);
  var shrinkwrappedDependenciesTree =
    getShrinkwrappedDependenciesTree(packageNpmDir);

  const npmTree = { dependencies: {} };
  _.each(npmDependencies, (version, name) => {
    npmTree.dependencies[name] = { version };
  });

  let minInstalledTree;
  try {
    minInstalledTree = minimizeDependencyTree(installedDependenciesTree);
  } catch (e) {
    console.error(
      "Failed to minimize installed dependencies tree for ",
      packageNpmDir
    );
    throw e;
  }
  const minShrinkwrapTree =
    minimizeDependencyTree(shrinkwrappedDependenciesTree);

  if (isSubtreeOf(npmTree, minInstalledTree) &&
      isSubtreeOf(minShrinkwrapTree, minInstalledTree)) {
    return;
  }

  if (! quiet) {
    logUpdateDependencies(packageName, npmDependencies);
  }

  makeNewPackageNpmDir(newPackageNpmDir);

  let preservedShrinkwrap;

  if (_.isEmpty(npmDependencies)) {
    // If there are no npmDependencies, make sure nothing is installed.
    preservedShrinkwrap = { dependencies: {} };

  } else if (isSubtreeOf(npmTree, minShrinkwrapTree)) {
    // If the top-level npm dependencies are already encompassed by the
    // npm-shrinkwrap.json file, then reuse that file.
    preservedShrinkwrap = shrinkwrappedDependenciesTree;

  } else {
    // Otherwise install npmTree.dependencies as if we were creating a new
    // .npm/package directory, and leave preservedShrinkwrap empty.
    await installNpmDependencies(npmDependencies, newPackageNpmDir);

    // Note: as of npm@4.0.0, npm-shrinkwrap.json files are regarded as
    // "canonical," meaning `npm install` (without a package argument)
    // will only install dependencies mentioned in npm-shrinkwrap.json.
    // That's why we can't just update installedDependenciesTree to
    // include npmTree.dependencies and hope for the best, because if the
    // new versions of the required top-level packages have any additional
    // transitive dependencies, those dependencies will not be installed
    // unless previously mentioned in npm-shrinkwrap.json. Reference:
    // https://github.com/npm/npm/blob/latest/CHANGELOG.md#no-more-partial-shrinkwraps-breaking
  }

  if (! _.isEmpty(preservedShrinkwrap &&
                  preservedShrinkwrap.dependencies)) {
    const newShrinkwrapFile = files.pathJoin(
      newPackageNpmDir,
      'npm-shrinkwrap.json'
    );

    // Starting from Npm 8, it's expected to have
    // node_modules/<package> for the package name
    const mappedDependencies = Object.entries(
      preservedShrinkwrap.dependencies
    ).reduce((acc, [name, info]) => {
      return {
        ...acc,
        [`node_modules/${name}`]: info,
      };
    }, {});

    // There are some unchanged packages here. Install from shrinkwrap.
    files.writeFile(
      newShrinkwrapFile,
      JSON.stringify(
        {
          ...preservedShrinkwrap,
          dependencies: mappedDependencies,
        },
        null,
        2
      )
    );

    const newPackageJsonFile = files.pathJoin(
      newPackageNpmDir,
      "package.json"
    );

    // We have to write out a minimal package.json file, else the results
    // of installFromShrinkwrap may be incomplete in npm@5.
    files.writeFile(
      newPackageJsonFile,
      JSON.stringify({
        dependencies: npmDependencies
      }, null, 2)
    );

    // `npm install`
    await installFromShrinkwrap(newPackageNpmDir);

    files.unlink(newShrinkwrapFile);
    files.unlink(newPackageJsonFile);
  }

  await completeNpmDirectory(packageName, newPackageNpmDir, packageNpmDir,
                       npmDependencies);
};

function isSubtreeOf(subsetTree, supersetTree, predicate) {
  if (subsetTree === supersetTree) {
    return true;
  }

  if (_.isObject(subsetTree)) {
    return _.isObject(supersetTree) &&
      _.every(subsetTree, (value, key) => {
        return isSubtreeOf(value, supersetTree[key], predicate);
      });
  }

  if (_.isFunction(predicate)) {
    const result = predicate(subsetTree, supersetTree);
    if (typeof result === "boolean") {
      return result;
    }
  }

  return false;
}

var createFreshNpmDirectory = async function (packageName, newPackageNpmDir,
                                        packageNpmDir, npmDependencies, quiet) {
  if (! quiet) {
    logUpdateDependencies(packageName, npmDependencies);
  }

  makeNewPackageNpmDir(newPackageNpmDir);

  await installNpmDependencies(npmDependencies, newPackageNpmDir);

  await completeNpmDirectory(packageName, newPackageNpmDir, packageNpmDir,
                       npmDependencies);
};

async function installNpmDependencies(dependencies, dir) {
  const packageJsonPath = files.pathJoin(dir, "package.json");
  const packageJsonExisted = files.exists(packageJsonPath);

  files.writeFile(
    packageJsonPath,
    JSON.stringify({ dependencies }, null, 2)
  );

  try {
    for (const name of Object.keys(dependencies)) {
      const version = dependencies[name];
      await installNpmModule(name, version, dir);
    }
  } finally {
    if (! packageJsonExisted) {
      files.unlink(packageJsonPath);
    }
  }
}

// Shared code for updateExistingNpmDirectory and createFreshNpmDirectory.
async function completeNpmDirectory(
  packageName,
  newPackageNpmDir,
  packageNpmDir,
  npmDependencies,
) {
  // Create a shrinkwrap file.
  shrinkwrap(newPackageNpmDir);

  // And stow a copy of npm-shrinkwrap too.
  files.copyFile(
    files.pathJoin(newPackageNpmDir, 'npm-shrinkwrap.json'),
    files.pathJoin(newPackageNpmDir, 'node_modules', '.npm-shrinkwrap.json')
  );

  createReadme(newPackageNpmDir);
  createNodeVersion(newPackageNpmDir);
  await files.renameDirAlmostAtomically(newPackageNpmDir, packageNpmDir);

  dirtyNodeModulesDirectory(files.pathJoin(packageNpmDir, "node_modules"));
}

var createReadme = function (newPackageNpmDir) {
  // This file gets checked in to version control by users, so resist the
  // temptation to make unnecessary tweaks to it.
  files.writeFile(
    files.pathJoin(newPackageNpmDir, 'README'),
"This directory and the files immediately inside it are automatically generated\n" +
"when you change this package's NPM dependencies. Commit the files in this\n" +
"directory (npm-shrinkwrap.json, .gitignore, and this README) to source control\n" +
"so that others run the same versions of sub-dependencies.\n" +
"\n" +
"You should NOT check in the node_modules directory that Meteor automatically\n" +
"creates; if you are using git, the .gitignore file tells git to ignore it.\n"
  );
};

var createNodeVersion = function (newPackageNpmDir) {
  files.writeFile(
    files.pathJoin(newPackageNpmDir, 'node_modules', '.node_version'),
    currentNodeCompatibilityVersion());
};

// This value should change whenever we think that the Node C ABI has changed
// (ie, when we need to be sure to reinstall npm packages because they might
// have native components that need to be rebuilt). It does not need to change
// for every patch release of Node! Notably, it needed to change between 0.8.*
// and 0.10.*.  If Node does make a patch release of 0.10 that breaks
// compatibility, you can just change this from "0.10.*" to "0.10.35" or
// whatever.
var currentNodeCompatibilityVersion = function () {
  var version = process.version;
  version = version.replace(/\.(\d+)$/, '.*');
  return version + '\n';
};

const npmUserConfigFile = files.pathJoin(
  __dirname,
  "meteor-npm-userconfig"
);

var runNpmCommand = meteorNpm.runNpmCommand =
Profile("meteorNpm.runNpmCommand", async function (args, cwd) {
  import { getEnv } from "../cli/dev-bundle-bin-helpers.js";

  const devBundleDir = files.getDevBundle();
  const isWindows = process.platform === "win32";
  const npmPath = files.convertToOSPath(files.pathJoin(
    devBundleDir, "bin",
    isWindows ? "npm.cmd" : "npm"
  ));

  // On Windows, `.cmd` and `.bat` files must be launched in a shell per:
  // http://nodejs.org/api/child_process.html#child_process_spawning_bat_and_cmd_files_on_windows
  //
  // Additionally, the COMSPEC environment variable is meant to have the path to
  // cmd.exe, but we'll use 'cmd.exe' if it's not set, in the same spirit as
  // http://nodejs.org/api/child_process.html#child_process_shell_requirements.

  let commandToRun = npmPath;
  if (isWindows) {
    args = ['/c', npmPath, ...args];
    commandToRun = process.env.ComSpec || "cmd.exe";
  }

  if (meteorNpm._printNpmCalls) {
    // only used by test-bundler.js
    process.stdout.write('cd ' + cwd + ' && ' + commandToRun + ' ' +
                         args.join(' ') + ' ...\n');
  }

  const env = await getEnv({devBundle: devBundleDir});

  const opts = {
    env: env,
    maxBuffer: 10 * 1024 * 1024
  };

  if (cwd) {
    opts.cwd = files.convertToOSPath(cwd);
  }

  // Make sure we don't honor any user-provided configuration files.
  env.npm_config_userconfig = npmUserConfigFile;

  return new Promise(function (resolve) {
    require('child_process').execFile(
        commandToRun, args, opts, function (err, stdout, stderr) {
          if (meteorNpm._printNpmCalls) {
            process.stdout.write(err ? 'failed\n' : 'done\n');
          }

          resolve({
            success: ! err,
            error: (err ? `${err.message}${stderr}` : stderr),
            stdout: stdout,
            stderr: stderr
          });
        }
    );
  });
});

function pathMatches(path, test) {
  // Normalize path and test to avoid trailing slash discrepancies
  path = path.replace(/\/+$/, "");
  test = test.replace(/\/+$/, "");

  // pathMatches('node_modules/', 'node_modules/@babel/core/'); // Expected: true
  // pathMatches('node_modules/', 'node_modules/@babel/core/node_modules/json5'); // Expected: false
  // pathMatches('node_modules/@babel/core', 'node_modules/@babel/core/node_modules/json5'); // Expected: true
  // pathMatches('node_modules/@babel/core', 'node_modules/@babel/core/'); // Expected: false
  const regex = new RegExp(`^${path}(\/[^/]+)+$`);

  if (!regex.test(test)) return false;

  // Check if the path occurs again after the initial match
  return test.indexOf(path, path.length) === -1;
}

const getPackageName = (pkgPath) => {
  const split = pkgPath.split("node_modules/");
  return split[split.length - 1];
};

function getInstalledDependenciesTreeFromPackageLock({
  packages,
  dependencies,
  prefix,
  mappedDependencies = {},
}) {
  const result = {};

  Object.keys(dependencies || packages).forEach((pkgName) => {
    if (prefix && !pathMatches(prefix, pkgName)) {
      return;
    }
    const pkg = packages[pkgName];

    const name = getPackageName(pkgName);

    if (!pkg || mappedDependencies[name]) return;

    const deps =
      pkg.dependencies &&
      getInstalledDependenciesTreeFromPackageLock({
        packages,
        prefix: pkgName,
        mappedDependencies,
      });

    const hasDependencies = deps && Object.keys(deps).length > 0;

    result[name] = {
      version: pkg.version,
      resolved: pkg.resolved,
      integrity: pkg.integrity,
      ...(hasDependencies ? { dependencies: deps } : {}),
    };
  });
  return result;
}

// Gets a JSON object from `npm ls --json` (getInstalledDependenciesTree) or
// `npm-shrinkwrap.json` (getShrinkwrappedDependenciesTree).
//
// @returns {Object} eg {
//   "name": "packages",
//   "version": "0.0.0",
//   "dependencies": {
//     "sockjs": {
//       "version": "0.3.4",
//       "dependencies": {
//         "node-uuid": {
//           "version": "1.3.3"
//         }
//       }
//     }
//   }
// }

function getPackageLockFromPath(dir, path) {
  // As per Npm 8, now the metadata is no longer inside .npm/package/node_modules/PACKAGE_NAME/package.json
  // now you have every metadata of every package inside .npm/package/node_modules/ at .npm/package/node_modules/.package-lock.json
  let packageLock = {};
  try {
    const nodeModulesPath = files.pathJoin(dir, "node_modules");
    const packageLockPath = files.pathJoin(nodeModulesPath, path);
    packageLock = JSON.parse(files.readFile(packageLockPath));
  } catch (e) {}
  return packageLock;
}

function getInstalledDependenciesTree(dir) {
  const defaultReturn = {
    lockfileVersion: LOCK_FILE_VERSION,
  };
  const pkgs = getPackageLockFromPath(dir, ".package-lock.json").packages;

  if (!pkgs) return defaultReturn;

  let dependencies =
    getInstalledDependenciesTreeFromPackageLock({
      packages: pkgs,
      prefix: "node_modules",
    }) || {};

  Object.keys(dependencies).forEach((packageName) => {
    if (!packageName.startsWith("@")) return;
    const deps = getPackageLockFromPath(
      dir,
      `${packageName}/package.json`
    ).dependencies;
    const packages = getPackageLockFromPath(
      dir,
      `${packageName}/package-lock.json`
    ).dependencies;
    if (!deps || !packages) return;

    dependencies = {
      ...dependencies,
      ...getInstalledDependenciesTreeFromPackageLock({
        packages,
        dependencies: deps,
        mappedDependencies: dependencies,
      }),
    };
  });

  return {
    ...defaultReturn,
    dependencies,
  };
}

function getShrinkwrappedDependenciesTree(dir) {
  const shrinkwrap = JSON.parse(files.readFile(
    files.pathJoin(dir, 'npm-shrinkwrap.json')
  ));
  shrinkwrap.lockfileVersion = LOCK_FILE_VERSION;
  return shrinkwrap;
};

// Maps a "dependency object" (a thing you find in `npm ls --json` or
// npm-shrinkwrap.json with keys like "version" and "from") to the
// canonical version that matches what users put in the `Npm.depends`
// clause.  ie, either the version or the tarball URL.
//
// If more logic is added here, it should probably go in minimizeModule too.
var canonicalVersion = function (depObj) {
  if (utils.isNpmUrl(depObj.from)) {
    return depObj.from;
  } else {
    return depObj.version;
  }
};

// map the structure returned from `npm ls` or shrinkwrap.json into
// the structure of npmDependencies (e.g. {gcd: '0.0.0'}), so that
// they can be diffed. This only returns top-level dependencies.
var treeToDependencies = function (tree) {
  return _.object(
    _.map(
      tree.dependencies, function (properties, name) {
        return [name, canonicalVersion(properties)];
      }));
};

var getInstalledDependencies = function (dir) {
  return treeToDependencies(getInstalledDependenciesTree(dir));
};

// (appears to not be called)
var getShrinkwrappedDependencies = function (dir) {
  return treeToDependencies(getShrinkwrappedDependenciesTree(dir));
};

const installNpmModule = meteorNpm.installNpmModule = async (name, version, dir) => {
  const installArg = utils.isNpmUrl(version)
    ? version
    : `${name}@${version}`;

  // We don't use npm.commands.install since we couldn't figure out
  // how to silence all output (specifically the installed tree which
  // is printed out with `console.log`)
  const result = await runNpmCommand(["install", installArg], dir);

  if (! result.success) {
    const pkgNotFound =
      `404 Not Found - GET ${utils.quotemeta("https://registry.npmjs.org/"+name)}`;

    const versionNotFound =
      "No matching version found for " +
      `${utils.quotemeta(name)}@${utils.quotemeta(version)}`;

    if (result.stderr.match(new RegExp(pkgNotFound))) {
      buildmessage.error(
        `there is no npm package named '${name}' in the npm registry`);
    } else if (result.stderr.match(new RegExp(versionNotFound))) {
      buildmessage.error(
        `${name} version ${version} is not available in the npm registry`);
    } else {
      buildmessage.error(
        `couldn\'t install npm package ${name}@${version}: ${result.error}`);
    }

    // Recover by returning false from updateDependencies
    throw new NpmFailure();
  }

  const pkgDir = files.pathJoin(dir, "node_modules", name);
  if (! isPortable(pkgDir)) {
    recordLastRebuildVersions(pkgDir);
  }

  if (process.platform !== "win32") {
    // If we are on a unixy file system, we should not build a package that
    // can't be used on Windows.

    var pathsWithColons = files.findPathsWithRegex(".", new RegExp(":"),
      { cwd: files.pathJoin(dir, "node_modules") });

    if (pathsWithColons.length) {
      var firstTen = pathsWithColons.slice(0, 10);
      if (pathsWithColons.length > 10) {
        firstTen.push("... " + (pathsWithColons.length - 10) +
          " paths omitted.");
      }

      buildmessage.error(
"Some filenames in your package have invalid characters.\n" +
"The following file paths in the NPM module '" + name + "' have colons, ':', which won't work on Windows:\n" +
firstTen.join("\n"));

      throw new NpmFailure();
    }
  }
};

var installFromShrinkwrap = async function (dir) {
  if (! files.exists(files.pathJoin(dir, "npm-shrinkwrap.json"))) {
    throw new Error(
      "Can't call `npm install` without a npm-shrinkwrap.json file present");
  }

  // `npm install`, which reads npm-shrinkwrap.json.
  var result = await runNpmCommand(["install"], dir);

  if (! result.success) {
    buildmessage.error(
      "couldn't install npm packages from npm-shrinkwrap: " +
        result.error
    );

    // Recover by returning false from updateDependencies
    throw new NpmFailure();
  }

  const nodeModulesDir = files.pathJoin(dir, "node_modules");
  files.readdir(nodeModulesDir).forEach(function (name) {
    const pkgDir = files.pathJoin(nodeModulesDir, name);
    if (! isPortable(pkgDir, true)) {
      recordLastRebuildVersions(pkgDir);
    }
  });
};

// `npm shrinkwrap`
function shrinkwrap(dir) {
  const tree = getInstalledDependenciesTree(dir);

  files.writeFile(
    files.pathJoin(dir, "npm-shrinkwrap.json"),
    JSON.stringify(tree, null, 2) + "\n"
  );

  const packageLockJsonPath =
    files.pathJoin(dir, "package-lock.json");

  // The normal `npm shrinkwrap` commands renames any package-lock.json
  // file to npm-shrinkwrap.json, so this function should have the same
  // side effect (i.e., removing package-lock.json if it exists).
  if (files.exists(packageLockJsonPath)) {
    files.unlink(packageLockJsonPath);
  }
}

// Reduces a dependency tree (as read from a just-made npm-shrinkwrap.json or
// from npm ls --json) to just the versions we want. Returns an object that does
// not share state with its input
function minimizeDependencyTree(tree) {
  function minimizeModule(module) {
    var version;
    if (module.resolved && ! isUrlFromRegistry(module.resolved)) {
      version = module.resolved;
    } else if (utils.isNpmUrl(module.from)) {
      version = module.from;
    } else {
      version = module.version;
    }
    var minimized = {version: version};

    if (module.dependencies) {
      minimized.dependencies = {};
      _.each(module.dependencies, function (subModule, name) {
        minimized.dependencies[name] = minimizeModule(subModule);
      });
    }
    return minimized;
  }

  var newTopLevelDependencies = {};
  _.each(tree.dependencies, function (module, name) {
    newTopLevelDependencies[name] = minimizeModule(module);
  });
  return {dependencies: newTopLevelDependencies};
}

function isUrlFromRegistry(url) {
  if (url.match(/^https?:\/\/registry.npmjs.org\//)) {
    return true;
  }
  const NCR = process.env.NPM_CONFIG_REGISTRY;
  return NCR && url.startsWith(NCR);
}

var logUpdateDependencies = function (packageName, npmDependencies) {
  runLog.log(packageName + ': updating npm dependencies -- ' +
             Object.keys(npmDependencies).join(', ') + '...');
};
