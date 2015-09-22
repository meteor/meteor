/// Implements the process of managing a package's .npm directory,
/// in which we call `npm install` to install npm dependencies,
/// and a variety of related commands. Notably, we use `npm shrinkwrap`
/// to ensure we get consistent versions of npm sub-dependencies.
var Future = require('fibers/future');

var cleanup = require('../tool-env/cleanup.js');
var files = require('../fs/files.js');
var os = require('os');
var _ = require('underscore');
var httpHelpers = require('../utils/http-helpers.js');
var buildmessage = require('../utils/buildmessage.js');
var utils = require('../utils/utils.js');
var runLog = require('../runners/run-log.js');

var meteorNpm = exports;

// if a user exits meteor while we're trying to create a .npm
// directory, we will have temporary directories that we clean up
var tmpDirs = [];
cleanup.onExit(function () {
  _.each(tmpDirs, function (dir) {
    if (files.exists(dir))
      files.rm_recursive(dir);
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
meteorNpm.updateDependencies = function (packageName,
                                         packageNpmDir,
                                         npmDependencies,
                                         quiet) {
  // we make sure to put it beside the original package dir so that
  // we can then atomically rename it. we also make sure to
  // randomize the name, in case we're bundling this package
  // multiple times in parallel.
  var newPackageNpmDir = packageNpmDir + '-new-' + utils.randomToken();

  if (! npmDependencies || _.isEmpty(npmDependencies)) {
    // No NPM dependencies? Delete the .npm directory if it exists (because,
    // eg, we used to have NPM dependencies but don't any more).  We'd like to
    // do this in as atomic a way as possible in case multiple meteor
    // instances are trying to make this update in parallel, so we rename the
    // directory to something before doing the rm -rf.
    try {
      files.rename(packageNpmDir, newPackageNpmDir);
    } catch (e) {
      if (e.code !== 'ENOENT')
        throw e;
      // It didn't exist, which is exactly what we wanted.
      return false;
    }
    files.rm_recursive(newPackageNpmDir);
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
      files.rm_recursive(packageNpmDir);
    }

    if (files.exists(packageNpmDir)) {
      // we already nave a .npm directory. update it appropriately with some
      // ceremony involving:
      // `npm install`, `npm install name@version`, `npm shrinkwrap`
      updateExistingNpmDirectory(
        packageName, newPackageNpmDir, packageNpmDir, npmDependencies, quiet);
    } else {
      // create a fresh .npm directory with `npm install
      // name@version` and `npm shrinkwrap`
      createFreshNpmDirectory(
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
    if (files.exists(newPackageNpmDir))
      files.rm_recursive(newPackageNpmDir);
    tmpDirs = _.without(tmpDirs, newPackageNpmDir);
  }

  return true;
};

// Return true if all of a package's npm dependencies are portable
// (that is, if the node_modules can be copied anywhere and we'd
// expect it to work, rather than containing native extensions that
// were built just for our architecture), else
// false. updateDependencies should first be used to bring
// packageNpmDir up to date.
meteorNpm.dependenciesArePortable = function (packageNpmDir) {
  // We use a simple heuristic: we check to see if a package (or any
  // of its transitive depedencies) contains any *.node files. .node
  // is the extension that signals to Node that it should load a file
  // as a shared object rather than as JavaScript, so this should work
  // in the vast majority of cases.

  var search = function (dir) {
    return _.find(files.readdir(dir), function (itemName) {
      if (itemName.match(/\.node$/))
        return true;
      var item = files.pathJoin(dir, itemName);
      if (files.lstat(item).isDirectory())
        return search(item);
    }) || false;
  };

  return ! search(files.pathJoin(packageNpmDir, 'node_modules'));
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

var updateExistingNpmDirectory = function (packageName, newPackageNpmDir,
                                           packageNpmDir, npmDependencies,
                                           quiet) {
  // sanity check on contents of .npm directory
  if (!files.stat(packageNpmDir).isDirectory())
    throw new Error("Corrupted .npm directory -- should be a directory: " +
                    packageNpmDir);
  if (!files.exists(files.pathJoin(packageNpmDir, 'npm-shrinkwrap.json')))
    throw new Error(
      "Corrupted .npm directory -- can't find npm-shrinkwrap.json in " +
        packageNpmDir);

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
      if (e.code !== 'ENOENT')
        throw e;
      // Use the Node version from the last release where we didn't
      // drop this file.
      oldNodeVersion = 'v0.8.24';
    }

    if (oldNodeVersion !== currentNodeCompatibilityVersion())
      files.rm_recursive(nodeModulesDir);
  }

  // If the node modules directory exists but doesn't have .package.json and
  // .npm-shrinkwrap.json, recreate.  This is to ensure that
  // providePackageJSONForUnavailableBinaryDeps works.
  if (files.exists(nodeModulesDir) &&
      (!files.exists(files.pathJoin(nodeModulesDir, '.package.json')) ||
       !files.exists(files.pathJoin(nodeModulesDir, '.npm-shrinkwrap.json')))) {
    files.rm_recursive(nodeModulesDir);
  }

  // Make sure node_modules is present (fix for #1761). Prevents npm install
  // from installing to an existing node_modules dir higher up in the
  // filesystem.  node_modules may be absent due to a change in Node version or
  // when `meteor add`ing a cloned package for the first time (node_modules is
  // excluded by .gitignore)
  if (! files.exists(nodeModulesDir))
    files.mkdir(nodeModulesDir);

  var installedDependenciesTree = getInstalledDependenciesTree(packageNpmDir);
  var installedDependencies = treeToDependencies(installedDependenciesTree);
  var shrinkwrappedDependenciesTree =
    getShrinkwrappedDependenciesTree(packageNpmDir);
  var shrinkwrappedDependencies = treeToDependencies(
    shrinkwrappedDependenciesTree);

  // If we already have the right things installed, life is good.
  // XXX this check is wrong: what if we just pulled a commit that
  //     changes a sub-module in npm-shrinkwrap.json? See #1648 But
  //     while it might be "correct" to just drop this check we should
  //     be careful not to make the common case of no changes too
  //     slow.
  if (_.isEqual(installedDependencies, npmDependencies)) {
    // OK, so what we have installed matches the top-level dependencies
    // specified in `Npm.depends`. But what if we just pulled a change in
    // npm-shrinkwrap.json to an indirectly used module version? We'll have to
    // compare more carefully.  First, normalize the tree (strip irrelevant
    // fields and normalize to 'version').
    var minimizedInstalled = minimizeDependencyTree(installedDependenciesTree);
    // If what we have installed is the same as what we have shrinkwrapped, then
    // we're done.
    if (_.isEqual(minimizedInstalled, shrinkwrappedDependenciesTree)) {
      return;
    }
  }

  if (! quiet)
    logUpdateDependencies(packageName, npmDependencies);

  var preservedShrinkwrap = {dependencies: {}};
  _.each(shrinkwrappedDependencies, function (version, name) {
    if (npmDependencies[name] === version) {
      // We're not changing this dependency, so copy over its shrinkwrap.
      preservedShrinkwrap.dependencies[name] =
        shrinkwrappedDependenciesTree.dependencies[name];
    }
  });

  makeNewPackageNpmDir(newPackageNpmDir);

  if (!_.isEmpty(preservedShrinkwrap.dependencies)) {
    // There are some unchanged packages here. Install from shrinkwrap.
    files.writeFile(files.pathJoin(newPackageNpmDir, 'npm-shrinkwrap.json'),
                     JSON.stringify(preservedShrinkwrap, null, /*legible*/2));

    // construct a matching package.json to make `npm install` happy
    constructPackageJson(packageName, newPackageNpmDir,
                         treeToDependencies(preservedShrinkwrap));

    // `npm install`
    installFromShrinkwrap(newPackageNpmDir);

    // delete package.json and npm-shrinkwrap.json
    files.unlink(files.pathJoin(newPackageNpmDir, 'package.json'));
    files.unlink(files.pathJoin(newPackageNpmDir, 'npm-shrinkwrap.json'));
  }

  // we may have just installed the shrinkwrapped packages. but let's not
  // trust that it actually worked: let's do the rest based on what we
  // actually have installed now.
  var newInstalledDependencies = getInstalledDependencies(newPackageNpmDir);

  // `npm install name@version` for modules that need updating
  _.each(npmDependencies, function (version, name) {
    if (newInstalledDependencies[name] !== version) {
      installNpmModule(name, version, newPackageNpmDir);
    }
  });

  completeNpmDirectory(packageName, newPackageNpmDir, packageNpmDir,
                       npmDependencies);
};

var createFreshNpmDirectory = function (packageName, newPackageNpmDir,
                                        packageNpmDir, npmDependencies, quiet) {
  if (! quiet)
    logUpdateDependencies(packageName, npmDependencies);

  makeNewPackageNpmDir(newPackageNpmDir);
  // install dependencies
  _.each(npmDependencies, function (version, name) {
    installNpmModule(name, version, newPackageNpmDir);
  });

  completeNpmDirectory(packageName, newPackageNpmDir, packageNpmDir,
                       npmDependencies);
};

// Shared code for updateExistingNpmDirectory and createFreshNpmDirectory.
var completeNpmDirectory = function (packageName, newPackageNpmDir,
                                     packageNpmDir, npmDependencies) {
  // temporarily construct a matching package.json to make `npm
  // shrinkwrap` happy
  constructPackageJson(packageName, newPackageNpmDir, npmDependencies);

  // Create a shrinkwrap file.
  shrinkwrap(newPackageNpmDir);

  // now get package.json out of the way, but put it somewhere where the
  // providePackageJSONForUnavailableBinaryDeps code can find it
  files.rename(
    files.pathJoin(newPackageNpmDir, 'package.json'),
    files.pathJoin(newPackageNpmDir, 'node_modules', '.package.json'));
  // And stow a copy of npm-shrinkwrap too.
  files.copyFile(
    files.pathJoin(newPackageNpmDir, 'npm-shrinkwrap.json'),
    files.pathJoin(newPackageNpmDir, 'node_modules', '.npm-shrinkwrap.json'));

  createReadme(newPackageNpmDir);
  createNodeVersion(newPackageNpmDir);
  files.renameDirAlmostAtomically(newPackageNpmDir, packageNpmDir);
};

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

var runNpmCommand = function (args, cwd) {
  const nodeBinDir = files.getCurrentNodeBinDir();
  var npmPath;

  if (os.platform() === "win32") {
    npmPath = files.convertToOSPath(
      files.pathJoin(nodeBinDir, "npm.cmd"));
  } else {
    npmPath = files.pathJoin(nodeBinDir, "npm");
  }

  if (meteorNpm._printNpmCalls) // only used by test-bundler.js
    process.stdout.write('cd ' + cwd + ' && ' + npmPath + ' ' +
                         args.join(' ') + ' ...\n');

  if (cwd)
    cwd = files.convertToOSPath(cwd);

  // It looks like some npm commands (such as build commands, specifically on
  // Windows) rely on having a global node binary present.
  // Sometimes users have a global node installed, so it is not
  // a problem, but a) it can be outdated and b) it can not be installed.
  // To solve this problem, we set the PATH env variable to have the path
  // containing the node binary we are running in right now as the highest
  // priority.
  // This hack is confusing as npm is supposed to do it already.
  const env = files.currentEnvWithPathsAdded(nodeBinDir);

  var opts = { cwd: cwd, env: env, maxBuffer: 10 * 1024 * 1024 };

  var future = new Future;
  var child_process = require('child_process');
  child_process.execFile(
    npmPath, args, opts, function (err, stdout, stderr) {
    if (meteorNpm._printNpmCalls)
      process.stdout.write(err ? 'failed\n' : 'done\n');

    future.return({
      success: ! err,
      error: (err ? `${err.message}${stderr}` : stderr),
      stdout: stdout,
      stderr: stderr
    });
  });

  return future.wait();
}

var constructPackageJson = function (packageName, newPackageNpmDir,
                                     npmDependencies) {
  var packageJsonContents = JSON.stringify({
    // name and version are unimportant but required for `npm install`.
    // we used to put packageName in here, but it doesn't work when that
    // has colons.
    name: 'packages-for-meteor-smartpackage-' + utils.randomToken(),
    version: '0.0.0',
    dependencies: npmDependencies
  });
  var packageJsonPath = files.pathJoin(newPackageNpmDir, 'package.json');
  files.writeFile(packageJsonPath, packageJsonContents);
};

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
var getInstalledDependenciesTree = function (dir) {
  var result = runNpmCommand(["ls", "--json"], dir);

  if (result.success)
    return JSON.parse(result.stdout);

  buildmessage.error(`couldn't read npm version lock information: ${result.error}`);
  // Recover by returning false from updateDependencies
  throw new NpmFailure;
};

var getShrinkwrappedDependenciesTree = function (dir) {
  var shrinkwrapFile = files.readFile(files.pathJoin(dir, 'npm-shrinkwrap.json'));
  return JSON.parse(shrinkwrapFile);
};

// Maps a "dependency object" (a thing you find in `npm ls --json` or
// npm-shrinkwrap.json with keys like "version" and "from") to the
// canonical version that matches what users put in the `Npm.depends`
// clause.  ie, either the version or the tarball URL.
//
// If more logic is added here, it should probably go in minimizeModule too.
var canonicalVersion = function (depObj) {
  if (utils.isUrlWithSha(depObj.from))
    return depObj.from;
  else
    return depObj.version;
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

var installNpmModule = function (name, version, dir) {
  ensureConnected();

  var installArg = utils.isUrlWithSha(version)
    ? version : (name + "@" + version);

  // We don't use npm.commands.install since we couldn't figure out
  // how to silence all output (specifically the installed tree which
  // is printed out with `console.log`)
  //
  // We used to use --force here, because the NPM cache is broken! See
  // https://github.com/npm/npm/issues/3265 Basically, switching
  // back and forth between a tarball fork of version X and the real
  // version X could confuse NPM. But the main reason to use tarball
  // URLs is to get a fork of the latest version with some fix, so
  // it was easy to trigger this!
  //
  // We now use a forked version of npm with our PR
  // https://github.com/npm/npm/pull/5137 to work around this.
  var result = runNpmCommand(["install", installArg], dir);

  if (! result.success) {
    var pkgNotFound = "404 '" + utils.quotemeta(name) +
          "' is not in the npm registry";
    var versionNotFound = "version not found: " + utils.quotemeta(name) +
          '@' + utils.quotemeta(version);
    if (result.stderr.match(new RegExp(pkgNotFound))) {
      buildmessage.error("there is no npm package named '" + name + "'");
    } else if (result.stderr.match(new RegExp(versionNotFound))) {
      buildmessage.error(name + " version " + version + " " +
                         "is not available in the npm registry");
    } else {
      buildmessage.error(`couldn't install npm package ${name}@${version}: ${result.error}`);
    }

    // Recover by returning false from updateDependencies
    throw new NpmFailure;
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

      throw new NpmFailure;
    }
  }
};

var installFromShrinkwrap = function (dir) {
  if (! files.exists(files.pathJoin(dir, "npm-shrinkwrap.json")))
    throw new Error(
      "Can't call `npm install` without a npm-shrinkwrap.json file present");

  ensureConnected();

  // `npm install`, which reads npm-shrinkwrap.json.
  var result = runNpmCommand(["install"], dir);

  if (! result.success) {
    buildmessage.error(`couldn't install npm packages from npm-shrinkwrap: ${result.error}`);
    // Recover by returning false from updateDependencies
    throw new NpmFailure;
  }
};

// ensure we can reach http://npmjs.org before we try to install
// dependencies. `npm install` times out after more than a minute.
var ensureConnected = function () {
  try {
    httpHelpers.getUrl("http://registry.npmjs.org");
  } catch (e) {
    buildmessage.error("Can't install npm dependencies. " +
                       "Are you connected to the internet?");
    // Recover by returning false from updateDependencies
    throw new NpmFailure;
  }
};

// `npm shrinkwrap`
var shrinkwrap = function (dir) {
  // We don't use npm.commands.shrinkwrap for two reasons:
  // 1. As far as we could tell there's no way to completely silence the output
  //    (the `silent` flag isn't piped in to the call to npm.commands.ls)
  // 2. In various (non-deterministic?) cases we observed the
  //    npm-shrinkwrap.json file not being updated
  var result = runNpmCommand(["shrinkwrap"], dir);

  if (! result.success) {
    buildmessage.error(`couldn't run \`npm shrinkwrap\`: ${result.error}`);
    // Recover by returning false from updateDependencies
    throw new NpmFailure;
  }

  minimizeShrinkwrap(dir);
};

// The shrinkwrap file format contains a lot of extra data that can
// change as you re-run the NPM-update process without actually
// affecting what is installed. This step trims everything but the
// most important bits from the file, so that the file doesn't change
// unnecessary.
//
// This is based on an analysis of install.js in the npm module:
//   https://github.com/isaacs/npm/blob/master/lib/install.js
// It appears that the only things actually read from a given
// dependency are its sub-dependencies and a single version, which is
// read by the readWrap function; and furthermore, we can just put all
// versions in the "version" field.
var minimizeShrinkwrap = function (dir) {
  var topLevel = getShrinkwrappedDependenciesTree(dir);
  var minimized = minimizeDependencyTree(topLevel);

  files.writeFile(
    files.pathJoin(dir, 'npm-shrinkwrap.json'),
    // Matches the formatting done by 'npm shrinkwrap'.
    JSON.stringify(minimized, null, 2) + '\n');
};

// Reduces a dependency tree (as read from a just-made npm-shrinkwrap.json or
// from npm ls --json) to just the versions we want. Returns an object that does
// not share state with its input
var minimizeDependencyTree = function (tree) {
  var minimizeModule = function (module) {
    var version;
    if (module.resolved &&
        !module.resolved.match(/^https:\/\/registry.npmjs.org\//)) {
      version = module.resolved;
    } else if (utils.isUrlWithSha(module.from)) {
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
  };

  var newTopLevelDependencies = {};
  _.each(tree.dependencies, function (module, name) {
    newTopLevelDependencies[name] = minimizeModule(module);
  });
  return {dependencies: newTopLevelDependencies};
};

var logUpdateDependencies = function (packageName, npmDependencies) {
  runLog.log(packageName + ': updating npm dependencies -- ' +
             _.keys(npmDependencies).join(', ') + '...');
};

exports.runNpmCommand = runNpmCommand;
