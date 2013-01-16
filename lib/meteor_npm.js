var semver = require('semver');
var exec = require('child_process').exec;
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

  // Ensure a package has a well-structured .npm subdirectory.
  //
  // @returns {String} path to said .npm subdirectory
  ensurePackageNpmDir: function(packageDir) {
    var packageNpmDir = path.join(packageDir, '.npm');

    if (fs.existsSync(packageNpmDir)) {
      // upgrade npm dependencies
      if (!fs.statSync(packageNpmDir).isDirectory()) {
        throw new Error("Should be a directory: " + packageNpmDir);
      }
    } else {
      console.log('npm: creating ' + packageNpmDir);
      files.mkdir_p(packageNpmDir);

      // we recreate package.json each time we bundle, based on the
      // arguments to useNpm. similarly, we recreate
      // npm-shrinkwrap.json from meteor-npm-shrinkwrap.json, with
      // some modifications. at the end of the bundling process we
      // remove thes files but in case we crashed mid-way we make
      // sure they're gitignored.
      //
      // node_modules shouldn't be in git since we recreate it as
      // needed by using `npm install`. since we use `npm
      // shrinkwrap` we're guarenteed to have the same version
      // installed each time.
      fs.writeFileSync(path.join(packageNpmDir, '.gitignore'),
                       ['package.json', 'npm-shrinkwrap.json', 'node_modules'].join('\n'));
    }

    return packageNpmDir;
  },

  // @param npmDependencies {Object} dependencies that should be installed,
  //     eg {tar: '0.1.6', gcd: '0.0.0'}
  updateDependencies: function(packageNpmDir, npmDependencies) {
    var self = this;

    // prepare .npm dir from which we'll be calling out to npm, and
    // compute dependencies that need to be updated
    var dependenciesToUpdate = this._prepareForUpdate(packageNpmDir, npmDependencies);

    // if we have a shrinkwrap file, call `npm install`.
    if (fs.existsSync(path.join(packageNpmDir, 'npm-shrinkwrap.json'))) {
      if (!fs.existsSync(path.join(packageNpmDir, 'node_modules'))) {
        console.log('installing shrinkwrapped npm dependencies into ' + packageNpmDir);
      } else {
        // just calling `npm install` to make sure we have all of the
        // node_modules we should.  eg if you ran this package before
        // new dependencies were added and then you took a new
        // version.
      }
      self._installFromShrinkwrap(packageNpmDir);
    }

    // install modified dependencies
    if (!_.isEmpty(dependenciesToUpdate)) {
      process.stdout.write(
        'installing npm dependencies ' + this._depsToString(dependenciesToUpdate) +
          ' into ' + packageNpmDir + '... ');

      _.each(dependenciesToUpdate, function(version, name) {
        self._installNpmModule(name, version, packageNpmDir);
      });

      // before shrinkwrapping we need to delete unused `node_modules` directories
      _.each(fs.readdirSync(path.join(packageNpmDir, 'node_modules')), function(installedModule) {
        if (!npmDependencies[installedModule]) {
          files.rm_recursive(path.join(packageNpmDir, 'node_modules', installedModule));
        }
      });

      // shrinkwrap
      self._shrinkwrap(packageNpmDir);
      process.stdout.write("DONE\n");
    }

    this._updateComplete(packageNpmDir);
  },

  // Prepare a package .npm directory for installing new packages and/or
  // new versions of packages:
  //
  // - Copies meteor-npm-shrinkwrap.json into npm-shrinkwrap.json
  // while removing the parts related to packages being upgraded.
  //
  // - Creates a package.json file corresponding to the packages that
  // - are to be installed (needed for both `npm install` and `npm shrinkwrap`)
  //
  // XXX doesn't support uninstalling packages
  //
  // @param npmDependencies {Object} dependencies that should be installed,
  //     eg {tar: '0.1.6', gcd: '0.0.0'}
  // @returns {Object} dependencies to update, eg {tar: '0.1.6'}
  _prepareForUpdate: function(packageNpmDir, npmDependencies) {
    //
    // construct package.json
    //
    var packageJsonContents = JSON.stringify({
      // name and version are unimportant but required for `npm install`
      name: 'packages',
      version: '0.0.0',
      dependencies: npmDependencies
    });
    var packageJsonPath = path.join(packageNpmDir, 'package.json');
    // this file will be removed in `_updateComplete`, but it's also .gitignored
    fs.writeFileSync(packageJsonPath, packageJsonContents);


    //
    // meteor-npm-shrinkwrap.json -> npm-shrinkwrap.json, compute dependenciesToUpdate
    //
    var meteorShrinkwrapJsonPath = path.join(packageNpmDir, 'meteor-npm-shrinkwrap.json');
    if (fs.existsSync(meteorShrinkwrapJsonPath)) {
      var shrinkwrap = JSON.parse(fs.readFileSync(meteorShrinkwrapJsonPath));
      dependenciesToUpdate = {};
      _.each(npmDependencies, function(version, name) {
        if (!shrinkwrap.dependencies[name] || shrinkwrap.dependencies[name].version !== version) {
          dependenciesToUpdate[name] = version;
          delete shrinkwrap.dependencies[name];
        }
      });

      // this file will be removed in `_shrinkwrap` or `_updateComplete`, but it's also .gitignored
      fs.writeFileSync(path.join(packageNpmDir, 'npm-shrinkwrap.json'),
                       JSON.stringify(shrinkwrap));
    } else {
      dependenciesToUpdate = npmDependencies;
    }

    return dependenciesToUpdate;
  },

  _updateComplete: function(packageNpmDir) {
    var npmShrinkwrapJsonPath = path.join(packageNpmDir, 'npm-shrinkwrap.json');
    if (fs.existsSync(npmShrinkwrapJsonPath)) // if we didn't update any dependencies
      fs.unlinkSync(npmShrinkwrapJsonPath);

    var packageJsonPath = path.join(packageNpmDir, 'package.json');
    fs.unlinkSync(packageJsonPath);
  },

  _execSync: function(cmd, opts) {
    return Future.wrap(function(cb) {
      exec(cmd, opts, function (err, stdout, stderr) {
        var result = {stdout: stdout, stderr: stderr};
        if (err)
          _.extend(err, result);
        cb(err, result);
      });
    })().wait();
  },

  _installNpmModule: function(name, version, dir) {
    // We don't use npm.commands.install since we couldn't
    // figure out how to silence all output (specifically the
    // installed tree which is printed out with `console.log`)
    this._execSync(path.join(files.get_dev_bundle(), "bin", "npm") + " install "
                   + name + "@" + version,
                   {cwd: dir});
  },

  _installFromShrinkwrap: function(dir) {
    if (!fs.existsSync(path.join(dir, "npm-shrinkwrap.json")))
      throw new Error("Can't call `npm install` without a npm-shrinkwrap.json file present");
    // `npm install`, which reads npm-shrinkwrap.json
    this._execSync(path.join(files.get_dev_bundle(), "bin", "npm") + " install",
                   {cwd: dir});
  },

  // shrinkwraps into meteor-npm-shrinkwrap.json
  _shrinkwrap: function(dir) {
    // We don't use npm.commands.shrinkwrap for two reasons:
    // 1. As far as we could tell there's no way to completely silence the output
    //    (the `silent` flag isn't piped in to the call to npm.commands.ls)
    // 2. In various (non-deterministic?) cases we observed the
    //    npm-shrinkwrap.json file not being updated
    this._execSync(path.join(files.get_dev_bundle(), "bin", "npm") + " shrinkwrap",
                   {cwd: dir});

    var meteorShrinkwrapJsonPath = path.join(dir, 'meteor-npm-shrinkwrap.json');
    var npmShrinkwrapJsonPath = path.join(dir, 'npm-shrinkwrap.json');
    fs.renameSync(npmShrinkwrapJsonPath, meteorShrinkwrapJsonPath);
  },

  _depsToString: function(dependenciesToUpdate) {
    return _.map(dependenciesToUpdate, function(version, name) {
      return name + '@' + version;
    }).join(', ');
  }
};

