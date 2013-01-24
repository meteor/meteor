var semver = require('semver');
var execFile = require('child_process').execFile;
var Future = require('fibers/future');

var path = require('path');
var fs = require('fs');
var files = require(path.join(__dirname, 'files.js'));
var _ = require('underscore');

var meteorNpm = module.exports = {
  ensureOnlyExactVersions: function(npmDependencies) {
    _.each(npmDependencies, function(version, name) {
      if (!semver.valid(version))
        throw new Error(
          "Must declare exact version of npm package dependency: " + name + '@' + version);
    });
  },

  // Creates a temporary directory in which the new contents of the package's
  // .npm directory will be assembled. If all is successful, renames that directory
  // back to .npm.
  //
  // @param npmDependencies {Object} dependencies that should be installed,
  //     eg {tar: '0.1.6', gcd: '0.0.0'}
  updateDependencies: function(packageName, packageNpmDir, npmDependencies) {
    var self = this;

    // we make sure to put it beside the original package dir so that
    // we can then atomically rename it. we also make sure to
    // randomize the name, in case we're bundling this package
    // multiple times in parallel.
    var newPackageNpmDir = packageNpmDir + '-new-' + self._randomToken();
    fs.mkdirSync(newPackageNpmDir);
    // create .gitignore -- node_modules shouldn't be in git since we
    // recreate it as needed by using `npm install`. since we use `npm
    // shrinkwrap` we're guaranteed to have the same version installed
    // each time.
    fs.writeFileSync(
      path.join(newPackageNpmDir, '.gitignore'),
      ['node_modules', ''/*git diff complains without trailing newline*/].join('\n'));

    try {
      if (fs.existsSync(packageNpmDir)) {
        // we already nave a .npm directory. update it appropriately with some ceremony involving:
        // `npm install`, `npm install name@version`, `npm prune`, `npm shrinkwrap`
        self._updateExistingNpmDirectory(
          packageName, newPackageNpmDir, packageNpmDir, npmDependencies);
      } else {
        // creta a fresh .npm directory with `npm install name@version` and `npm shrinkwrap`
        self._createFreshNpmDirectory(
          packageName, newPackageNpmDir, packageNpmDir, npmDependencies);
      }
    } finally {
      if (fs.existsSync(newPackageNpmDir))
        files.rm_recursive(newPackageNpmDir);
    }
  },

  _updateExistingNpmDirectory: function(
    packageName, newPackageNpmDir, packageNpmDir, npmDependencies) {
    var self = this;

    // sanity check on contents of .npm directory
    if (!fs.statSync(packageNpmDir).isDirectory())
      throw new Error("Corrupted .npm directory -- should be a directory: " + packageNpmDir);
    if (!fs.existsSync(path.join(packageNpmDir, 'npm-shrinkwrap.json')))
      throw new Error(
        "Corrupted .npm directory -- can't find npm-shrinkwrap.json in " + packageNpmDir);

    var installedDependencies = self._installedDependencies(packageNpmDir);

    // don't do npm work unnecessarily
    if (!_.isEqual(installedDependencies, npmDependencies)) {
      // copy over npm-shrinkwrap.json
      fs.writeFileSync(path.join(newPackageNpmDir, 'npm-shrinkwrap.json'),
                       fs.readFileSync(path.join(packageNpmDir, 'npm-shrinkwrap.json')));

      // construct package.json
      self._constructPackageJson(packageName, newPackageNpmDir, npmDependencies);

      // `npm install`
      self._installFromShrinkwrap(newPackageNpmDir);

      // remove ununsed packages
      self._prune(newPackageNpmDir);

      // delete package.json
      fs.unlinkSync(path.join(newPackageNpmDir, 'package.json'));

      // we've just installed the shrinkwrapped packages. get the new
      // list of installed dependencies
      var newInstalledDependencies = self._installedDependencies(newPackageNpmDir);

      // `npm install name@version` for modules that need updating
      _.each(npmDependencies, function(version, name) {
        if (newInstalledDependencies[name] !== version) {
          self._installNpmModule(name, version, newPackageNpmDir);
        }
      });

      // if we had no installed dependencies to begin with, *DON'T*
      // shrinkwrap. this is important so that we can pin versions of
      // deep dependencies to tarballs, e.g.
      // https://github.com/meteor/js-bson/tarball/master
      if (!_.isEmpty(installedDependencies)) {
        self._shrinkwrap(newPackageNpmDir);
      }

      self._renameAlmostAtomically(newPackageNpmDir, packageNpmDir);
    }
  },

  _createFreshNpmDirectory: function(
    packageName, newPackageNpmDir, packageNpmDir, npmDependencies) {
    var self = this;

    // install dependencies
    _.each(npmDependencies, function(version, name) {
      self._installNpmModule(name, version, newPackageNpmDir);
    });

    self._shrinkwrap(newPackageNpmDir);

    self._renameAlmostAtomically(newPackageNpmDir, packageNpmDir);
  },

  _execFileSync: function(file, args, opts) {
    var self = this;
    if (self._printNpmCalls) // only used by test_bundler.js
      process.stdout.write('cd ' + opts.cwd + ' && ' + file + ' ' + args.join(' ') + ' ... ');

    return Future.wrap(function(cb) {
      execFile(file, args, opts, function (err, stdout, stderr) {
        if (self._printNpmCalls)
          console.log('done');

        var result = {stdout: stdout, stderr: stderr};
        // so that we can inspect stdout/stderr in case there was an error
        if (err) {
          err.stdout = stdout;
          err.stderr = stderr;
        }
        cb(err, result);
      });
    })().wait();
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

  // - rename original .npm dir to another name (require for atomicity in next step)
  // - atomically rename temporary package npm dir to the original package's .npm dir
  // - delete the renamed original .npm directory
  _renameAlmostAtomically: function(newPackageNpmDir, packageNpmDir) {
    var self = this;
    var oldPackageNpmDir = packageNpmDir + '-old-' + self._randomToken();;

    if (fs.existsSync(packageNpmDir)) {
      fs.renameSync(packageNpmDir, oldPackageNpmDir);
      fs.renameSync(newPackageNpmDir, packageNpmDir);
      files.rm_recursive(oldPackageNpmDir);
    } else {
      fs.renameSync(newPackageNpmDir, packageNpmDir);
    }
  },

  // Runs `npm ls --json`.
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
    return JSON.parse(
      this._execFileSync(path.join(files.get_dev_bundle(), "bin", "npm"),
                         ["ls", "--json"],
                         {cwd: dir}).stdout);
  },

  // map the structure returned from `npm ls` into the structure of
  // npmDependencies (e.g. {gcd: '0.0.0'}), so that they can be
  // diffed.
  _installedDependencies: function(dir) {
    var self = this;
    return _.object(
      _.map(
        self._installedDependenciesTree(dir).dependencies, function(properties, name) {
          return [name, properties.version];
        }));
  },

  _installNpmModule: function(name, version, dir) {
    // We don't use npm.commands.install since we couldn't
    // figure out how to silence all output (specifically the
    // installed tree which is printed out with `console.log`)
    this._execFileSync(path.join(files.get_dev_bundle(), "bin", "npm"),
                       ["install", name + "@" + version],
                       {cwd: dir});
  },

  _installFromShrinkwrap: function(dir) {
    if (!fs.existsSync(path.join(dir, "npm-shrinkwrap.json")))
      throw new Error("Can't call `npm install` without a npm-shrinkwrap.json file present");
    // `npm install`, which reads npm-shrinkwrap.json
    this._execFileSync(path.join(files.get_dev_bundle(), "bin", "npm"),
                       ["install"],
                       {cwd: dir});
  },

  // `npm prune`
  _prune: function(dir) {
    this._execFileSync(path.join(files.get_dev_bundle(), "bin", "npm"),
                       ["prune"],
                       {cwd: dir});
  },

  // `npm shrinkwrap`
  _shrinkwrap: function(dir) {
    // We don't use npm.commands.shrinkwrap for two reasons:
    // 1. As far as we could tell there's no way to completely silence the output
    //    (the `silent` flag isn't piped in to the call to npm.commands.ls)
    // 2. In various (non-deterministic?) cases we observed the
    //    npm-shrinkwrap.json file not being updated
    this._execFileSync(path.join(files.get_dev_bundle(), "bin", "npm"),
                       ["shrinkwrap"],
                       {cwd: dir});
  },

  _randomToken: function() {
    return (Math.random() * 0x100000000 + 1).toString(36);
  }
};

