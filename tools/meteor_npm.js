/// Implements the process of managing a package's .npm directory,
/// in which we call `npm install` to install npm dependencies,
/// and a variety of related commands. Notably, we use `npm shrinkwrap`
/// to ensure we get consistent versions of npm sub-dependencies.

var semver = require('semver');
var Future = require('fibers/future');

var path = require('path');
var fs = require('fs');
var cleanup = require(path.join(__dirname, 'cleanup.js'));
var files = require(path.join(__dirname, 'files.js'));
var httpHelpers = require('./http-helpers.js');
var buildmessage = require('./buildmessage.js');
var _ = require('underscore');

// if a user exits meteor while we're trying to create a .npm
// directory, we will have temporary directories that we clean up
cleanup.onExit(function () {
  _.each(meteorNpm._tmpDirs, function (dir) {
    if (fs.existsSync(dir))
      files.rm_recursive(dir);
  });
});

// Exception used internally to gracefully bail out of a npm run if
// something goes wrong
var NpmFailure = function () {};

var meteorNpm = exports;
_.extend(exports, {
  _tmpDirs: [],

  _isGitHubTarball: function (x) {
    return /^https:\/\/github.com\/.*\/tarball\/[0-9a-f]{40}/.test(x);
  },

  // If there is a version that isn't exact, throws an Error with a
  // human-readable message that is suitable for showing to the user.
  // npmDependencies may be falsey or empty.
  ensureOnlyExactVersions: function(npmDependencies) {
    var self = this;
    _.each(npmDependencies, function(version, name) {
      // We want a given version of a smart package (package.js +
      // .npm/npm-shrinkwrap.json) to pin down its dependencies precisely, so we
      // don't want anything too vague. For now, we support semvers and github
      // tarballs pointing at an exact commit.
      if (!semver.valid(version) && !self._isGitHubTarball(version))
        throw new Error(
          "Must declare exact version of npm package dependency: " + name + '@' + version);
    });
  },

  // Creates a temporary directory in which the new contents of the package's
  // .npm directory will be assembled. If all is successful, renames that
  // directory back to .npm. Returns true if there are NPM dependencies and
  // they are installed without error.
  //
  // @param npmDependencies {Object} dependencies that should be installed,
  //     eg {tar: '0.1.6', gcd: '0.0.0'}. If falsey or empty, will remove
  //     the .npm directory instead.
  updateDependencies: function(packageName,
                               packageNpmDir,
                               npmDependencies,
                               quiet) {
    var self = this;

    // we make sure to put it beside the original package dir so that
    // we can then atomically rename it. we also make sure to
    // randomize the name, in case we're bundling this package
    // multiple times in parallel.
    var newPackageNpmDir = packageNpmDir + '-new-' + self._randomToken();

    if (!npmDependencies || _.isEmpty(npmDependencies)) {
      // No NPM dependencies? Delete the .npm directory if it exists (because,
      // eg, we used to have NPM dependencies but don't any more).  We'd like to
      // do this in as atomic a way as possible in case multiple meteor
      // instances are trying to make this update in parallel, so we rename the
      // directory to something before doing the rm -rf.
      try {
        fs.renameSync(packageNpmDir, newPackageNpmDir);
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
      if (fs.existsSync(packageNpmDir) &&
          !fs.existsSync(path.join(packageNpmDir, 'npm-shrinkwrap.json'))) {
        files.rm_recursive(packageNpmDir);
      }

      if (fs.existsSync(packageNpmDir)) {
        // we already nave a .npm directory. update it appropriately with some ceremony involving:
        // `npm install`, `npm install name@version`, `npm shrinkwrap`
        self._updateExistingNpmDirectory(
          packageName, newPackageNpmDir, packageNpmDir, npmDependencies, quiet);
      } else {
        // create a fresh .npm directory with `npm install name@version` and `npm shrinkwrap`
        self._createFreshNpmDirectory(
          packageName, newPackageNpmDir, packageNpmDir, npmDependencies, quiet);
      }
    } catch (e) {
      if (e instanceof NpmFailure) {
        // Something happened that was out of our control, but wasn't
        // exactly unexpected (eg, no such npm package, no internet
        // connection.) Handle it gracefully.
        return false;
      }

      // Some other exception -- let it propagate.
      throw e;
    } finally {
      if (fs.existsSync(newPackageNpmDir))
        files.rm_recursive(newPackageNpmDir);
      self._tmpDirs = _.without(self._tmpDirs, newPackageNpmDir);
    }

    return true;
  },

  // Return true if all of a package's npm dependencies are portable
  // (that is, if the node_modules can be copied anywhere and we'd
  // expect it to work, rather than containing native extensions that
  // were built just for our architecture), else
  // false. updateDependencies should first be used to bring
  // packageNpmDir up to date.
  dependenciesArePortable: function (packageNpmDir) {
    // We use a simple heuristic: we check to see if a package (or any
    // of its transitive depedencies) contains any *.node files. .node
    // is the extension that signals to Node that it should load a
    // file as a shared object rather than as JavaScript, so this
    // should work in the vast majority of cases.

    var search = function (dir) {
      return _.find(fs.readdirSync(dir), function (itemName) {
        if (itemName.match(/\.node$/))
          return true;
        var item = path.join(dir, itemName);
        if (fs.statSync(item).isDirectory())
          return search(item);
      }) || false;
    };

    return ! search(path.join(packageNpmDir, 'node_modules'));
  },

  _makeNewPackageNpmDir: function (newPackageNpmDir) {
    var self = this;
    self._tmpDirs.push(newPackageNpmDir); // keep track so that we can remove them on process exit
    files.mkdir_p(newPackageNpmDir);

    // create node_modules -- prevent npm install from installing
    // to an existing node_modules dir higher up in the filesystem
    fs.mkdirSync(path.join(newPackageNpmDir, 'node_modules'));

    // create .gitignore -- node_modules shouldn't be in git since we
    // recreate it as needed by using `npm install`. since we use `npm
    // shrinkwrap` we're guaranteed to have the same version installed
    // each time.
    fs.writeFileSync(
      path.join(newPackageNpmDir, '.gitignore'),
      ['node_modules', ''/*git diff complains without trailing newline*/].join('\n'));
  },

  _updateExistingNpmDirectory: function(
    packageName, newPackageNpmDir, packageNpmDir, npmDependencies, quiet) {
    var self = this;

    // sanity check on contents of .npm directory
    if (!fs.statSync(packageNpmDir).isDirectory())
      throw new Error("Corrupted .npm directory -- should be a directory: " + packageNpmDir);
    if (!fs.existsSync(path.join(packageNpmDir, 'npm-shrinkwrap.json')))
      throw new Error(
        "Corrupted .npm directory -- can't find npm-shrinkwrap.json in " + packageNpmDir);

    // We need to rebuild all node modules when the Node version changes, in
    // case there are some binary ones. Technically this is racey, but it
    // shouldn't fail very often.
    if (fs.existsSync(path.join(packageNpmDir, 'node_modules'))) {
      var oldNodeVersion;
      try {
        oldNodeVersion = fs.readFileSync(
          path.join(packageNpmDir, 'node_modules', '.node_version'), 'utf8');
      } catch (e) {
        if (e.code !== 'ENOENT')
          throw e;
        // Use the Node version from the last release where we didn't drop this
        // file.
        oldNodeVersion = 'v0.8.24';
      }

      if (oldNodeVersion !== process.version)
        files.rm_recursive(path.join(packageNpmDir, 'node_modules'));
    }

    var installedDependencies = self._installedDependencies(packageNpmDir);

    // If we already have the right things installed, life is good.
    // XXX this check is wrong: what if we just pulled a commit that changes
    //     a sub-module in npm-shrinkwrap.json? See #1648
    //     But while it might be "correct" to just drop this check we should
    //     be careful not to make the common case of no changes too slow.
    if (_.isEqual(installedDependencies, npmDependencies))
      return;

    if (!quiet)
      self._logUpdateDependencies(packageName, npmDependencies);

    var shrinkwrappedDependenciesTree =
          self._shrinkwrappedDependenciesTree(packageNpmDir);
    var shrinkwrappedDependencies = self._treeToDependencies(
      shrinkwrappedDependenciesTree);
    var preservedShrinkwrap = {dependencies: {}};
    _.each(shrinkwrappedDependencies, function (version, name) {
      if (npmDependencies[name] === version) {
        // We're not changing this dependency, so copy over its shrinkwrap.
        preservedShrinkwrap.dependencies[name] =
          shrinkwrappedDependenciesTree.dependencies[name];
      }
    });

    self._makeNewPackageNpmDir(newPackageNpmDir);

    if (!_.isEmpty(preservedShrinkwrap.dependencies)) {
      // There are some unchanged packages here. Install from shrinkwrap.
      fs.writeFileSync(path.join(newPackageNpmDir, 'npm-shrinkwrap.json'),
                       JSON.stringify(preservedShrinkwrap, null, /*legible*/2));

      // construct a matching package.json to make `npm install` happy
      self._constructPackageJson(packageName, newPackageNpmDir,
                                 self._treeToDependencies(preservedShrinkwrap));

      // `npm install`
      self._installFromShrinkwrap(newPackageNpmDir);

      // delete package.json and npm-shrinkwrap.json
      fs.unlinkSync(path.join(newPackageNpmDir, 'package.json'));
      fs.unlinkSync(path.join(newPackageNpmDir, 'npm-shrinkwrap.json'));
    }

    // we may have just installed the shrinkwrapped packages. but let's not
    // trust that it actually worked: let's do the rest based on what we
    // actually have installed now.
    var newInstalledDependencies = self._installedDependencies(newPackageNpmDir);

    // `npm install name@version` for modules that need updating
    _.each(npmDependencies, function(version, name) {
      if (newInstalledDependencies[name] !== version) {
        self._installNpmModule(name, version, newPackageNpmDir);
      }
    });

    self._completeNpmDirectory(
      packageName, newPackageNpmDir, packageNpmDir, npmDependencies);
  },

  _createFreshNpmDirectory: function(
    packageName, newPackageNpmDir, packageNpmDir, npmDependencies, quiet) {
    var self = this;

    if (!quiet)
      self._logUpdateDependencies(packageName, npmDependencies);

    self._makeNewPackageNpmDir(newPackageNpmDir);
    // install dependencies
    _.each(npmDependencies, function(version, name) {
      self._installNpmModule(name, version, newPackageNpmDir);
    });

    self._completeNpmDirectory(
      packageName, newPackageNpmDir, packageNpmDir, npmDependencies);
  },

  // Shared code for _updateExistingNpmDirectory and _createFreshNpmDirectory.
  _completeNpmDirectory: function (
    packageName, newPackageNpmDir, packageNpmDir, npmDependencies) {
    var self = this;

    // temporarily construct a matching package.json to make `npm shrinkwrap`
    // happy
    self._constructPackageJson(packageName, newPackageNpmDir, npmDependencies);

    // Create a shrinkwrap file.
    self._shrinkwrap(newPackageNpmDir);

    // now delete package.json
    fs.unlinkSync(path.join(newPackageNpmDir, 'package.json'));

    self._createReadme(newPackageNpmDir);
    self._createNodeVersion(newPackageNpmDir);
    files.renameDirAlmostAtomically(newPackageNpmDir, packageNpmDir);
  },

  _createReadme: function(newPackageNpmDir) {
    fs.writeFileSync(
      path.join(newPackageNpmDir, 'README'),
      "This directory and the files immediately inside it are automatically generated\n"
        + "when you change this package's NPM dependencies. Commit the files in this\n"
        + "directory (npm-shrinkwrap.json, .gitignore, and this README) to source control\n"
        + "so that others run the same versions of sub-dependencies.\n"
        + "\n"
        + "You should NOT check in the node_modules directory that Meteor automatically\n"
        + "creates; if you are using git, the .gitignore file tells git to ignore it.\n"
    );
  },

  _createNodeVersion: function(newPackageNpmDir) {
    fs.writeFileSync(
      path.join(newPackageNpmDir, 'node_modules', '.node_version'),
      process.version);
  },

  // Returns object with keys 'stdout', 'stderr', and 'success' (true
  // for clean exit with exit code 0, else false)
  _execFileSync: function(file, args, opts) {
    var self = this;
    if (self._printNpmCalls) // only used by test_bundler.js
      process.stdout.write('cd ' + opts.cwd + ' && ' + file + ' ' + args.join(' ') + ' ... ');

    var future = new Future;

    var child_process = require('child_process');
    child_process.execFile(file, args, opts, function (err, stdout, stderr) {
      if (self._printNpmCalls)
        console.log(err ? 'failed' : 'done');

      future.return({
        success: ! err,
        stdout: stdout,
        stderr: stderr
      });
    });

    return future.wait();
  },

  _constructPackageJson: function(packageName, newPackageNpmDir, npmDependencies) {
    var packageJsonContents = JSON.stringify({
      // name and version are unimportant but required for `npm install`
      name: 'packages-for-meteor-smartpackage-' + packageName,
      version: '0.0.0',
      dependencies: npmDependencies
    });
    var packageJsonPath = path.join(newPackageNpmDir, 'package.json');
    fs.writeFileSync(packageJsonPath, packageJsonContents);
  },

  // Gets a JSON object from `npm ls --json` (_installedDependenciesTree) or
  // `npm-shrinkwrap.json` (_shrinkwrappedDependenciesTree).
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
  _installedDependenciesTree: function(dir) {
    var result =
      this._execFileSync(path.join(files.get_dev_bundle(), "bin", "npm"),
                         ["ls", "--json"],
                         {cwd: dir});

    if (result.success)
      return JSON.parse(result.stdout);

    console.log(result.stderr);
    buildmessage.error("couldn't read npm version lock information");
    // Recover by returning false from updateDependencies
    throw new NpmFailure;
  },
  _shrinkwrappedDependenciesTree: function(dir) {
    var shrinkwrapFile = fs.readFileSync(path.join(dir, 'npm-shrinkwrap.json'));
    return JSON.parse(shrinkwrapFile);
  },

  // Maps a "dependency object" (a thing you find in `npm ls --json` or
  // npm-shrinkwrap.json with keys like "version" and "from") to the canonical
  // version that matches what users put in the `Npm.depends` clause.  ie,
  // either the version or the tarball URL.
  // If more logic is added here, it should probably go in minimizeModule too.
  _canonicalVersion: function (depObj) {
    var self = this;
    if (self._isGitHubTarball(depObj.from))
      return depObj.from;
    else
      return depObj.version;
  },

  // map the structure returned from `npm ls` or shrinkwrap.json into the
  // structure of npmDependencies (e.g. {gcd: '0.0.0'}), so that they can be
  // diffed. This only returns top-level dependencies.
  _treeToDependencies: function (tree) {
    var self = this;
    return _.object(
      _.map(
        tree.dependencies, function(properties, name) {
          return [name, self._canonicalVersion(properties)];
        }));
  },

  _installedDependencies: function(dir) {
    var self = this;
    return self._treeToDependencies(self._installedDependenciesTree(dir));
  },

  _shrinkwrappedDependencies: function (dir) {
    var self = this;
    return self._treeToDependencies(self._shrinkwrappedDependenciesTree(dir));
  },

  _installNpmModule: function(name, version, dir) {
    this._ensureConnected();

    var installArg = this._isGitHubTarball(version)
          ? version : (name + "@" + version);

    // We don't use npm.commands.install since we couldn't
    // figure out how to silence all output (specifically the
    // installed tree which is printed out with `console.log`)
    //
    // We use --force, because the NPM cache is broken! See
    // https://github.com/isaacs/npm/issues/3265 Basically, switching back and
    // forth between a tarball fork of version X and the real version X can
    // confuse NPM. But the main reason to use tarball URLs is to get a fork of
    // the latest version with some fix, so it's easy to trigger this! So
    // instead, always use --force. (Even with --force, we still WRITE to the
    // cache, so we can corrupt the cache for other invocations of npm... ah
    // well.)
    var result =
      this._execFileSync(path.join(files.get_dev_bundle(), "bin", "npm"),
                         ["install", "--force", installArg],
                         {cwd: dir});

    if (! result.success) {
      var pkgNotFound = "404 '" + name + "' is not in the npm registry";
      var versionNotFound = "version not found: " + version;
      if (result.stderr.match(new RegExp(pkgNotFound))) {
        buildmessage.error("there is no npm package named '" + name + "'");
      } else if (result.stderr.match(new RegExp(versionNotFound))) {
        buildmessage.error(name + " version " + version + " " +
                           "is not available in the npm registry");
      } else {
        console.log(result.stderr);
        buildmessage.error("couldn't install npm package");
      }

      // Recover by returning false from updateDependencies
      throw new NpmFailure;
    }
  },

  _installFromShrinkwrap: function(dir) {
    if (!fs.existsSync(path.join(dir, "npm-shrinkwrap.json")))
      throw new Error("Can't call `npm install` without a npm-shrinkwrap.json file present");

    this._ensureConnected();

    // `npm install`, which reads npm-shrinkwrap.json.  See above for why
    // --force.
    var result =
      this._execFileSync(path.join(files.get_dev_bundle(), "bin", "npm"),
                         ["install", "--force"], {cwd: dir});


    if (! result.success) {
      console.log(result.stderr);
      buildmessage.error("couldn't install npm packages from npm-shrinkwrap");
      // Recover by returning false from updateDependencies
      throw new NpmFailure;
    }
  },

  // ensure we can reach http://npmjs.org before we try to install
  // dependencies. `npm install` times out after more than a minute.
  _ensureConnected: function () {
    try {
      httpHelpers.getUrl("http://registry.npmjs.org");
    } catch (e) {
      buildmessage.error("Can't install npm dependencies. " +
                         "Are you connected to the internet?");
      // Recover by returning false from updateDependencies
      throw new NpmFailure;
    }
  },

  // `npm shrinkwrap`
  _shrinkwrap: function(dir) {
    var self = this;
    // We don't use npm.commands.shrinkwrap for two reasons:
    // 1. As far as we could tell there's no way to completely silence the output
    //    (the `silent` flag isn't piped in to the call to npm.commands.ls)
    // 2. In various (non-deterministic?) cases we observed the
    //    npm-shrinkwrap.json file not being updated
    var result =
      this._execFileSync(path.join(files.get_dev_bundle(), "bin", "npm"),
                         ["shrinkwrap"], {cwd: dir});

    if (! result.success) {
      console.log(result.stderr);
      buildmessage.error("couldn't run `npm shrinkwrap`");
      // Recover by returning false from updateDependencies
      throw new NpmFailure;
    }

    self._minimizeShrinkwrap(dir);
  },

  // The shrinkwrap file format contains a lot of extra data that can change as
  // you re-run the NPM-update process without actually affecting what is
  // installed. This step trims everything but the most important bits from the
  // file, so that the file doesn't change unnecessary.
  //
  // This is based on an analysis of install.js in the npm module:
  //   https://github.com/isaacs/npm/blob/master/lib/install.js
  // It appears that the only things actually read from a given dependency are
  // its sub-dependencies and a single version, which is read by the readWrap
  // function; and furthermore, we can just put all versions in the "version"
  // field.
  _minimizeShrinkwrap: function (dir) {
    var self = this;
    var topLevel = self._shrinkwrappedDependenciesTree(dir);

    var minimizeModule = function (module) {
      var minimized = {};
      if (self._isGitHubTarball(module.from))
        minimized.from = module.from;
      else
        minimized.version = module.version;

      if (module.dependencies) {
        minimized.dependencies = {};
        _.each(module.dependencies, function (subModule, name) {
          minimized.dependencies[name] = minimizeModule(subModule);
        });
      }
      return minimized;
    };

    var newTopLevelDependencies = {};
    _.each(topLevel.dependencies, function (module, name) {
      newTopLevelDependencies[name] = minimizeModule(module);
    });

    fs.writeFileSync(
      path.join(dir, 'npm-shrinkwrap.json'),
      // Matches the formatting done by 'npm shrinkwrap'.
      JSON.stringify({dependencies: newTopLevelDependencies}, null, 2)
        + '\n');
  },

  _logUpdateDependencies: function(packageName, npmDependencies) {
    console.log('%s: updating npm dependencies -- %s...',
                packageName, _.keys(npmDependencies).join(', '));
  },

  _randomToken: function() {
    return (Math.random() * 0x100000000 + 1).toString(36);
  }
});

