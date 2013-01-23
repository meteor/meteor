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
    var tmpPackageNpmDir = packageNpmDir + '-new-' + self._randomToken();
    fs.mkdirSync(tmpPackageNpmDir);

    try {
      if (fs.existsSync(packageNpmDir)) {
        // we already nave a .npm directory. update it:
        // - create new tmp directory for the new contents of .npm
        // - copy npm-shrinkwrap.json from .npm to the temp directory
        // - in temp directory, construct package.json, which is needed for `npm install`
        // - call `npm install`, which reads from npm-shrinkwrap.json
        // - call `npm install name@version` for any package that needs to be updated
        // - call `npm prune` to remove any unused packages from node_modules
        // - call `npm shrinkwrap` to update npm-shrinkwrap.json
        // - copy the temporary directory back to .npm
        self._updateExistingNpmDirectory(packageName, tmpPackageNpmDir, packageNpmDir, npmDependencies);
      } else {
        // create a temporary directory for the new contents of .npm:
        // - create .gitignore
        // - install npm modules
        // - call `npm shrinkwrap` to create npm-shrinkwrap.json
        // - copy the temporary directory to .npm
        self._createFreshNpmDirectory(packageName, tmpPackageNpmDir, packageNpmDir, npmDependencies);
      }
    } finally {
      if (fs.existsSync(tmpPackageNpmDir))
        files.rm_recursive(tmpPackageNpmDir);
    }
  },

  _updateExistingNpmDirectory: function(packageName, tmpPackageNpmDir, packageNpmDir, npmDependencies) {
    var self = this;

    // sanity check on contents of .npm directory
    if (!fs.statSync(packageNpmDir).isDirectory())
      throw new Error("Corrupted .npm directory -- should be a directory: " + packageNpmDir);
    if (!fs.existsSync(path.join(packageNpmDir, 'npm-shrinkwrap.json')))
      throw new Error(
        "Corrupted .npm directory -- can't find npm-shrinkwrap.json in " + packageNpmDir);

    // map the structure returned from `npm ls` into the structure
    // of npmDependencies, so that they can be diffed.
    var installedDependencies = _.object(
      _.map(
        self._installedModules(packageNpmDir).dependencies, function(properties, name) {
          return [name, properties.version];
        }));

    // don't do npm work unnecessarily
    if (!_.isEqual(installedDependencies, npmDependencies)) {
      // copy over npm-shrinkwrap.json
      fs.writeFileSync(path.join(tmpPackageNpmDir, 'npm-shrinkwrap.json'),
                       fs.readFileSync(path.join(packageNpmDir, 'npm-shrinkwrap.json')));

      // construct package.json
      self._constructPackageJson(packageName, tmpPackageNpmDir, npmDependencies);

      // `npm install`
      self._installFromShrinkwrap(tmpPackageNpmDir);

      // `npm install name@version` for modules that need updating
      _.each(npmDependencies, function(version, name) {
        if (installedDependencies[name] !== version) {
          self._installNpmModule(name, version, tmpPackageNpmDir);
        }
      });

      // remove ununsed packages
      self._prune(tmpPackageNpmDir);

      self._finalizeTmpPackageDirAndRename(tmpPackageNpmDir, packageNpmDir);
    }
  },

  _createFreshNpmDirectory: function(packageName, tmpPackageNpmDir, packageNpmDir, npmDependencies) {
    var self = this;
    // create .gitignore -- node_modules shouldn't be in git since we
    // recreate it as needed by using `npm install`. since we use `npm
    // shrinkwrap` we're guaranteed to have the same version installed
    // each time.
    fs.writeFileSync(path.join(tmpPackageNpmDir, '.gitignore'),
                     ['node_modules'].join('\n'));

    // install dependencies
    _.each(npmDependencies, function(version, name) {
      self._installNpmModule(name, version, tmpPackageNpmDir);
    });

    // construct package.json, which is needed for consistent results of `npm shrinkwrap`
    self._constructPackageJson(packageName, tmpPackageNpmDir, npmDependencies);

    self._finalizeTmpPackageDirAndRename(tmpPackageNpmDir, packageNpmDir);
  },

  _execFileSync: function(file, args, opts) {
    return Future.wrap(function(cb) {
      execFile(file, args, opts, function (err, stdout, stderr) {
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

  _constructPackageJson: function(packageName, tmpPackageNpmDir, npmDependencies) {
    var packageJsonContents = JSON.stringify({
      // name and version are unimportant but required for `npm install`
      name: 'packages-for-meteor-smartpackage-' + packageName,
      version: '0.0.0',
      dependencies: npmDependencies
    });
    var packageJsonPath = path.join(tmpPackageNpmDir, 'package.json');
    fs.writeFileSync(packageJsonPath, packageJsonContents);
  },

  // - call `npm shrinkwrap`
  // - delete package.json
  // - rename original .npm dir to another name (require for atomicity in next step)
  // - atomically rename temporary package npm dir to the original package's .npm dir
  // - delete the renamed original .npm directory
  _finalizeTmpPackageDirAndRename: function(tmpPackageNpmDir, packageNpmDir) {
    var self = this;

    if (fs.existsSync(path.join(tmpPackageNpmDir, 'package.json')))
      fs.unlinkSync(path.join(tmpPackageNpmDir, 'package.json'));
    self._shrinkwrap(tmpPackageNpmDir);

    if (fs.existsSync(packageNpmDir)) {
      var oldPackageNpmDir = packageNpmDir + '-old-' + self._randomToken();;
      fs.renameSync(packageNpmDir, oldPackageNpmDir);
      fs.renameSync(tmpPackageNpmDir, packageNpmDir);
      files.rm_recursive(oldPackageNpmDir);
    } else {
      fs.renameSync(tmpPackageNpmDir, packageNpmDir);
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
  _installedModules: function(dir) {
    return JSON.parse(
      this._execFileSync(path.join(files.get_dev_bundle(), "bin", "npm"),
                         ["ls", "--json"],
                         {cwd: dir}).stdout);
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

