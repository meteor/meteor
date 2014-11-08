var fs = require('fs');
var path = require('path');
var _ = require('underscore');
var files = require('./files.js');
var utils = require('./utils.js');
var tropohouse = require('./tropohouse.js');
var archinfo = require('./archinfo.js');
var release = require('./release.js');
var watch = require('./watch.js');
var catalog = require('./catalog.js');
var buildmessage = require('./buildmessage.js');
var packageLoader = require('./package-loader.js');
var PackageSource = require('./package-source.js');
var packageVersionParser = require('./package-version-parser.js');
var Console = require('./console.js').Console;

var project = exports;

// XXX #3006: Most of this file is being refactored into
// project-context.js. Finish the job.

// Given a set of lines, each of the form "foo@bar", return an object of form
// {foo: "bar", bar: null}. If there is "bar", value of the corresponding key is
// null.
// Trims whitespace & other filler characters of a line in a project file.
var trimLine = function (line) {
  var match = line.match(/^([^#]*)#/);
  if (match)
    line = match[1];
  line = line.replace(/^\s+|\s+$/g, ''); // leading/trailing whitespace
  return line;
};

// Given a set of lines, each of the form "foo@bar", return an array of form
// [{packageName: foo, versionConstraint: bar}]. If there is bar,
// versionConstraint is null.
var processPerConstraintLines = function(lines) {
  var ret = {};

  // read from .meteor/packages
  _.each(lines, function (line) {
    line = files.trimLine(line);
    if (line !== '') {
      var constraint = utils.splitConstraint(line);
      ret[constraint.package] = constraint.constraint;
     }
  });
  return ret;
};

// Use this class to query & record data about a specific project, such as the
// current app.
//
// Does not store the name of the release.
var Project = function () {
  var self = this;

  // Root of the directory containing the project. All project-specific
  // configuration files (etc) are relative to this URL. String.
  self.rootDir = null;

  // Packages that this project explicitly requires, as represented by its
  // .meteor/packages file. Object mapping the package name a string version
  // contraint, or null, if no such constraint was specified.
  self.constraints = null;

  // All the package constraints that this project has, including constraints
  // derived from the programs in its programs directory and constraints that
  // come from the current release version. Derived from self.constraints.
  self.combinedConstraints = null;

  // Packages & versions of all dependencies, including transitive dependencies,
  // program dependencies and so on, that this project uses. An object mapping a
  // package name to its string version. Derived from self.combinedConstraints
  // and recorded in the .meteor/versions file.
  self.dependencies = null;

  // Plugins & versions of all Cordova plugins dependencies.
  // A mapping from the Cordova plugin identifier to a semver string or a
  // tarball url with sha.
  // XXX Ignores the transitive dependencies.
  self.cordovaPlugins = null;

  // Platforms for this project.
  self.platforms = null;

  // The package loader for this project, with the project's dependencies as its
  // version file. (See package-loader.js for more information about package
  // loaders). Derived from self.dependencies.
  self.packageLoader = null;

  // The app identifier is used for stats and to prevent accidental deploys to
  // the wrong domain. It is read from a file and not invalidated by any
  // constraint-related operations.
  self.appId = null;

  // Should we use this project as a source for dependencies? Certainly not
  // until it has a root directory.
  self.viableDepSource = false;

  // Whenever we change the constraints, we invalidate many constraint-related
  // fields. Rather than recomputing immediately, let's wait until we are done
  // and then recompute when needed.
  self._depsUpToDate = false;

  // In verbose mode (default) we print stuff out when we modify the
  // project. When the project is something automatic, like test-packages or
  // get-ready, we should mute the (expected) output. For example, we don't need
  // to tell the user that we are adding packages to an app during
  // test-packages.  (We still print other messages like packages downloading.)
  self.muted = false;

  // If we are building this app in debug mode -- either because we are bundling
  // for debug, or because we are running in terminal without the production
  // flag, then we should include debug packages and build everything that we
  // build as part of the app with debug build. Otherwise, don't.
  self.includeDebug = true;
};

_.extend(Project.prototype, {
  setDebug: function (debug) {
    var self = this;
    self.includeDebug = debug;
  },

  // Sets the mute flag on the project. Muted projects don't print out non-error
  // output.
  setMuted : function (muted) {
    var self = this;
    self.muted = muted;
  },

  // Set a given root directory as the project's root directory. Figure out all
  // relevant file paths and read in data that is independent of the constraint
  // solver.
  //
  // rootDir: project's root directory.
  setRootDir : function (rootDir, opts) {
    var self = this;
    opts = opts || {};

    // Set the root directory and its immediately derived filenames.
    self.rootDir = rootDir;

    // Read in the contents of the .meteor/packages file.
    var appConstraintFile = self._getConstraintFile();
    self.constraints = processPerConstraintLines(
      files.getLinesOrEmpty(appConstraintFile));

    // These will be fixed by _ensureDepsUpToDate.
    self.combinedConstraints = null;
    self.packageLoader = null;

    // Read in the contents of the .meteor/versions file, so we can give them to
    // the constraint solver as the previous solution.
    self.dependencies = processPerConstraintLines(
      files.getLinesOrEmpty(self._getVersionsFile()));
    // Also, make sure we have an app identifier for this app.
    self.ensureAppIdentifier();

    self.cordovaPlugins = processPerConstraintLines(
      files.getLinesOrEmpty(self._getCordovaPluginsFile()));

    self.ensurePlatforms();

    // Lastly, invalidate everything that we have computed -- obviously the
    // dependencies that we counted with the previous rootPath are wrong and we
    // need to recompute them.
    self._depsUpToDate = false;

    // The good news, is that if the catalog is initialized, we can now use this
    // project's version lock file as a source for our dependencies.
    self.viableDepSource = true;
  },

  // Rereads all the on-disk files by reinitalizing the project with the same
  // directory.  Caches the old versions, in case we were running with --release
  // (and they don't match the ones on disk).
  //
  // We don't automatically reinitialize this singleton when an app is
  // restarted, but an app restart is very likely caused by changes to our
  // package configuration files. So, make sure to reload the constraints &
  // dependencies here.
  reload : function () {
    var self = this;
    var oldDependencies = self.dependencies;
    self.setRootDir(self.rootDir);
    self.dependencies = oldDependencies;
  },

  // Several fields in project are derived from constraints. Whenever we change
  // the constraints, we invalidate those fields, when we call on
  // dependency-related operations, we recompute them as needed.
  //
  // If the project's dependencies are up to date, this does nothing. Otherwise,
  // it recomputes the combined constraints, the versions to use and initializes
  // the package loader for this project. This WILL REWRITE THE VERSIONS FILE.
  _ensureDepsUpToDate : function (options) {
    var self = this;
    options = options || {};
    buildmessage.assertInCapture();

    // To calculate project dependencies, we need to know what release we are
    // on, but to do that, we need to have a rootDirectory. So, we initialize
    // the path first, and call 'ensureDepsUpToDate' lazily.
    if (!release.current) {
      throw new Error(
        "need to compute release before computing project dependencies.");
    }

    if (!self._depsUpToDate) {

      // We are calculating this project's dependencies, so we obviously should
      // not use it as a source of version locks (unless specified explicitly
      // through previousVersions).
      self.viableDepSource = false;

      // Use current release to calculate packages & combined constraints.
      var releasePackages = release.current.isProperRelease() ?
            release.current.getPackages() : {};
      self.combinedConstraints =
        self.calculateCombinedConstraints(releasePackages);

      // Call the constraint solver, using the previous dependencies as the last
      // solution. It is useful to set ignoreProjectDeps, but not nessessary,
      // since self.viableDepSource is false.
      try {
        var newVersions = catalog.complete.resolveConstraints(
          self.combinedConstraints,
          { previousSolution: self.dependencies },
          { ignoreProjectDeps: true }
        );
      } catch (err) {
        // XXX This error handling is bogus. Use buildmessage instead, or
        // something. See also compiler.determineBuildTimeDependencies
        Console.warn(
          "Could not resolve the specified constraints for this project:\n"
           + (err.constraintSolverError ? err : err.stack));
        process.exit(1);
      }

      // Download packages to disk, and rewrite .meteor/versions if it has
      // changed.
      var oldVersions = self.dependencies;
      var setV = self.setVersions(newVersions,
                                  {alwaysRecord: options.alwaysRecord});
      self.showPackageChanges(oldVersions, newVersions, {
        onDiskPackages: setV.downloaded
      });

      if (!setV.success) {
        Console.warn(
          "Could not install all the requested packages.");
        process.exit(1);
      }

      // Finally, initialize the package loader.
      self.packageLoader = new packageLoader.PackageLoader({
        versions: newVersions,
        catalog: catalog.complete
      });

      // We are done!
      self._depsUpToDate = true;
      self.viableDepSource = true;
    }
  },

  // Given a set of packages from a release, recalculates all the constraints on
  // a given project: combines the constraints from all the programs, the
  // packages file and the release packages.
  //
  // Returns an array of {packageName, version} objects.
  //
  // This has no side effects: it does not alter the result of
  // getCurrentCombinedConstraints.
  calculateCombinedConstraints : function (releasePackages) {
    var self = this;
    buildmessage.assertInCapture();

    var allDeps = [];
    // First, we process the contents of the .meteor/packages file. The
    // self.constraints variable is always up to date.
    // Note that two parts of the "add" command run code that matches this.
    _.each(self.constraints, function (constraint, packageName) {
      var oldConstraint = "";
      if (constraint) {
        oldConstraint = "@" + constraint;
      }
      allDeps.push(
        _.extend({name: packageName},
                 utils.parseConstraint(packageName + oldConstraint)));
    });

    // Now we have to go through the programs directory, go through each of the
    // programs, get their dependencies and use them. (We could have memorized
    // this value, but this is called very rarely outside the first
    // initialization).
    var programsSubdirs = self.getProgramsSubdirs();
    _.each(programsSubdirs, function (item) {
      var programName = item.substr(0, item.length - 1);

      var programSubdir = path.join(self.getProgramsDirectory(), item);
      buildmessage.enterJob({
        title: "Initializing program `" + programName + "`",
        rootPath: self.rootDir
      }, function () {
        var packageSource;
        // For now, if it turns into a isopack, it should have a version.
        var programSource = new PackageSource(catalog.complete);
        programSource.initFromPackageDir(programSubdir);
        _.each(programSource.architectures, function (sourceUnibuild) {
          _.each(sourceUnibuild.uses, function (use) {
            var oldConstraint = "";
            if (use.constraint) {
              oldConstraint = "@" + use.constraint;
            }
            allDeps.push(utils.parseConstraint(use.package + oldConstraint));

          });
        });
      });
    });
    // Finally, each release package is a weak exact constraint. So, let's add
    // those.
    _.each(releasePackages, function(version, name) {
     allDeps.push(_.extend(utils.parseConstraint(name + "@=" + version),
                           { weak: true }));
    });

    // This is an UGLY HACK that has to do with our requirement to have a
    // control package on everything (and preferably that package is ctl), even
    // apps that don't actually need it because they don't go to galaxy. Maybe
    // someday, this will make sense.  (The conditional here allows us to work
    // in tests with releases that have no packages.)
    if (catalog.complete.getPackage("ctl")) {
      allDeps.push(utils.parseConstraint("ctl"));
    }

    return allDeps;
  },

  // Print out the changest hat we have made in the versions files.
  //
  // return 0 if everything went well, or 1 if we failed in some way.
  showPackageChanges : function (versions, newVersions, options) {
    var self = this;
    // options.onDiskPackages

    // Don't tell the user what all the operations were until we finish -- we
    // don't want to give a false sense of completeness until everything is
    // written to disk.
    var messageLog = [];
    var failed = false;
    var stdSpace = "   ";
    // Remove the versions that don't exist
    var removed = _.difference(_.keys(versions), _.keys(newVersions));
    _.each(removed, function(packageName) {
      messageLog.push(stdSpace + "removed " + packageName + " from project");
    });

    _.each(newVersions, function(version, packageName) {
      if (failed)
        return;

      if (_.has(versions, packageName) &&
          versions[packageName] === version) {
        // Nothing changed. Skip this.
        return;
      }

      if (options.onDiskPackages &&
          (! options.onDiskPackages[packageName] ||
           options.onDiskPackages[packageName] !== version)) {
        // XXX maybe we shouldn't be letting the constraint solver choose
        // things that don't have the right arches?
        Console.warn("Package " + packageName +
                             " has no compatible build for version " +
                             version);
        failed = true;
        return;
      }

      // If the previous versions file had this, then we are upgrading, if it did
      // not, then we must be adding this package anew.
      if (_.has(versions, packageName)) {
        if (packageVersionParser.lessThan(
          newVersions[packageName], versions[packageName])) {
          messageLog.push(stdSpace + "downgraded " + packageName + " from version " +
                          versions[packageName] +
                          " to version " + newVersions[packageName]);
        } else {
          messageLog.push(stdSpace + "upgraded " + packageName + " from version " +
                          versions[packageName] +
                          " to version " + newVersions[packageName]);
        }
      } else {
        messageLog.push(stdSpace + "added " + packageName +
                        " at version " + newVersions[packageName]);
      };
    });

    if (failed)
      return 1;

    // Show the user the messageLog of packages we added.
    if ((!self.muted && !_.isEmpty(versions))
        || options.alwaysShow) {
      _.each(messageLog, function (msg) {
        Console.info(msg);
      });

      // Pay special attention to non-backwards-compatible changes.
      var incompatibleUpdates = [];
      _.each(self.constraints, function (constraint, package) {
        var oldV = versions[package];
        var newV = newVersions[package];
        // Did we not actually have a version before? We don't care.
        if (!oldV) {
          return;
        }
        // If this is a local package, then we are aware that this happened and it
        // is not news.
        if (catalog.complete.isLocalPackage(package)) {
          return;
        }
        // If we can't find the old version, then maybe that was a local package and
        // now is not, and that is also not news.
        var oldVersion = catalog.complete.getVersion(package, oldV);
        var newRec = catalog.complete.getVersion(package, newV);

        // The new version has to exist, or we wouldn't have chosen it.
        if (!oldVersion) {
          return;
        }
        var oldMajorVersion = packageVersionParser.majorVersion(oldV);
        var newMajorVersion = packageVersionParser.majorVersion(newV);
        if (oldMajorVersion !== newMajorVersion) {
          incompatibleUpdates.push({
            name: package,
            description: "(" + oldV + "->" + newV + ") " + newRec.description
          });
        }
      });

      if (!_.isEmpty(incompatibleUpdates)) {
        Console.warn(
          "\nThe following packages have been updated to new versions that are not " +
            "backwards compatible:");
        utils.printPackageList(incompatibleUpdates, { level: Console.LEVEL_WARN });
        Console.warn("\n");
      };
    }
    return 0;
  },

  // Accessor methods dealing with programs.

  // Gets the program directory for this project, as derived from the root
  // directory. We watch the programs directory for new folders added (since
  // programs are added automatically unlike packages), and traverse through it
  // to deal with programs (and handle git checkout leftovers gracefully) in the
  // bundler.
  getProgramsDirectory : function () {
    var self = this;
    return path.join(self.rootDir, "programs");
  },

  // Return the list of subdirectories containing programs in the project, mostly
  // as subdirectories of the ProgramsDirectory. Used at bundling, and
  // miscellaneous.
  //
  // Options are:
  //
  // - watchSet: a watchSet. If provided, this function will add the app's program
  //   directly to the provided watchset.
  //
  getProgramsSubdirs : function (options) {
    var self = this;
    options = options || {};
    var programsDir = self.getProgramsDirectory();
    var readOptions = {
      absPath: programsDir,
      include: [/\/$/],
      exclude: [/^\./]
    };
    if (options.watchSet) {
      return watch.readAndWatchDirectory(options.watchSet, readOptions);
    } else {
      return watch.readDirectory(readOptions);
    }
  },

  // Accessor methods dealing with dependencies.

  // Give the contents of the project's .meteor/packages file to the caller.
  //
  // Returns an object mapping package name to an optional string constraint, or
  // null if the package is unconstrained.
  getConstraints : function () {
    var self = this;
    return self.constraints;
  },

  // Return all the constraints on this project, including release & program
  // constraints.
  //
  // THIS USES CURRENT RELEASE TO FIGURE OUT RELEASE CONSTRAINTS. If, for some
  // reason, you want to do something else (for example, update), call
  // 'calculateCombinedConstraints' instead.
  //
  // Returns an object mapping package name to an optional string constraint, or
  // null if the package is unconstrained.
  getCurrentCombinedConstraints : function () {
    var self = this;
    buildmessage.assertInCapture();
    self._ensureDepsUpToDate();
    return self.combinedConstraints;
  },

  // Returns the file path to the .meteor/packages file, containing the
  // constraints for this specific project.
  _getConstraintFile : function () {
    var self = this;
    return path.join(self.rootDir, '.meteor', 'packages');
  },

  // Give the contents of the project's .meteor/versions file to the
  // caller, possibly after recalculating dependencies and rewriting the
  // versions file.
  //
  // Returns an object mapping package name to its string version.
  getVersions : function (options) {
    var self = this;
    options = options || {};
    if (options.dontRunConstraintSolver)
      return self.dependencies;
    buildmessage.assertInCapture();
    self._ensureDepsUpToDate();
    return self.dependencies;
  },

  // Returns the file path to the .meteor/versions file, containing the
  // dependencies for this specific project.
  _getVersionsFile : function () {
    var self = this;
    return path.join(self.rootDir, '.meteor', 'versions');
  },

  getCordovaPlugins: function () {
    var self = this;
    return _.clone(self.cordovaPlugins);
  },

  getPlatforms: function () {
    var self = this;
    return _.clone(self.platforms);
  },

  getDefaultPlatforms: function () {
    // these platforms are always present and can be neither added or removed
    var defaultPlatforms = ["server", "browser"];

    return defaultPlatforms;
  },

  getCordovaPlatforms: function () {
    var self = this;
    return _.difference(self.getPlatforms(), self.getDefaultPlatforms());
  },

  // Returns the set of web archs that are targeted by the project
  getWebArchs: function () {
    var self = this;
    var archs = [ "web.browser" ];
    if (! _.isEmpty(self.getCordovaPlatforms())) {
      archs.push("web.cordova");
    }
    return archs;
  },

  // Returns the file path to the .meteor/cordova-plugins file, containing the
  // Cordova plugins dependencies for this specific project.
  _getCordovaPluginsFile: function () {
    var self = this;
    return path.join(self.rootDir, '.meteor', 'cordova-plugins');
  },

  // Returns the file path to the .meteor/platforms file, containing the
  // platforms for this specific project.
  _getPlatformsFile: function () {
    var self = this;
    return path.join(self.rootDir, '.meteor', 'platforms');
  },

  ensurePlatforms: function () {
    var self = this;

    var lines = files.getLinesOrEmpty(self._getPlatformsFile());
    self.platforms = _.compact(_.map(lines, files.trimLine));

    if (! self.platforms) {
      self.platforms = self.getDefaultPlatforms();
      self.writePlatformsFile();
    }
  },

  writePlatformsFile: function () {
    var self = this;
    fs.writeFileSync(self._getPlatformsFile(),
      self.platforms.join("\n") + "\n", 'utf8');
  },

  // Give the package loader attached to this project to the caller.
  //
  // Returns a packageLoader that has been pre-loaded with this project's
  // transitive dependencies.
  getPackageLoader : function () {
    var self = this;
    buildmessage.assertInCapture();
    self._ensureDepsUpToDate();
    return self.packageLoader;
  },

  // Accessor methods dealing with releases.

  // This will return "none" if the project is not pinned to a release
  // (it was created by a checkout), or null for a pre-0.6.0 app with no
  // .meteor/release file.  It returns the empty string if the file exists
  // but is empty.
  //
  // This is NOT the same as release.current. If you want to refer to the
  // release currently running DO NOT use this function.  We don't even bother
  // to memorize the result of this, just to disincentivize accidentally using
  // this value.
  //
  // This refers to the release that the project is pinned to, rather than
  // the release that we are actually running or anything like that, so it
  // lives in the project.
  getMeteorReleaseVersion : function (appDirOverride) {
    var self = this;
    var releasePath = self._meteorReleaseFilePath(appDirOverride);
    try {
      var lines = files.getLines(releasePath);
    } catch (e) {
      return null;
    }
    // This should really never happen, and the caller will print a special error.
    if (!lines.length)
      return '';
    return files.trimLine(lines[0]);
  },

  // Like getMeteorReleaseVersion, but adds METEOR@ to the beginning if it's
  // missing.
  getNormalizedMeteorReleaseVersion: function () {
    var self = this;
    var raw = self.getMeteorReleaseVersion();
    if (raw === null)
      return null;
    var parts = utils.splitReleaseName(raw);
    return parts[0] + '@' + parts[1];
  },

  // Returns the full filepath of the projects .meteor/release file.
  _meteorReleaseFilePath : function (appDirOverride) {
    var self = this;
    return path.join(appDirOverride || self.rootDir, '.meteor', 'release');
  },

  // Modifications

  // Shortcut to add a package to a project's packages file.
  //
  // Takes in an array of package names and an operation (either 'add' or
  // 'remove') Writes the new information into the .meteor/packages file, adds
  // it to the set of constraints, and invalidates the pre-computed
  // packageLoader & versions files. They will be recomputed next time we ask
  // for them.
  //
  // THIS AVOIDS THE NORMAL SAFETY CHECKS OF METEOR ADD.
  //
  // In fact, we use this specifically in circumstances when we may want to
  // circumvent those checks -- either we are using a temporary app where
  // failure to deal with all packages will have no long-lasting reprecussions
  // (testing) or we are running an upgrader that intends to break the build.
  //
  // XXX: I don't like that this exists, but I like being explicit about what
  // upgraders do: they force a remove or add of a package, perhaps without
  // asking permission or running constraint solvers. If we are willing to kill
  // those upgraders, I would love to remove it.
  forceEditPackages : function (names, operation) {
    var self = this;

    var appConstraintFile = self._getConstraintFile();
    var lines = files.getLinesOrEmpty(appConstraintFile);
    if (operation === "add") {
      _.each(names, function (name) {
        // XXX This assumes that the file hasn't been edited since we lasted
        // loaded it into self.
        if (_.contains(self.constraints, name))
          return;
        if (!self.constraints.length && lines.length)
          lines.push('');
        lines.push(name);
        self.constraints[name] = null;
      });
      fs.writeFileSync(appConstraintFile,
                       lines.join('\n') + '\n', 'utf8');
    } else if (operation == "remove") {
      self._removePackageRecords(names);
    }

    // Any derived values need to be invalidated.
    self._depsUpToDate = false;
  },

  // Edits the internal and external package records: .meteor/packages and
  // self.constraints to remove the packages in a given list of package
  // names. Does not rewrite the versions file.
  _removePackageRecords : function (names) {
    var self = this;

    // Compute the new set of packages by removing all the names from the list
    // of constraints.
    _.each(names, function (name) {
      delete self.constraints[name];
    });

    // Record the packages results to disk. This is a slightly annoying
    // operation because we want to keep all the comments intact.
    var packages = self._getConstraintFile();
    var lines = files.getLinesOrEmpty(packages);
    lines = _.reject(lines, function (line) {
      var cur = files.trimLine(line).split('@')[0];
      return _.indexOf(names, cur) !== -1;
    });
    fs.writeFileSync(packages,
                     lines.join('\n') + '\n', 'utf8');
  },

  // Remove packages from the app -- remove packages from the constraints, then
  // recalculate versions and record the result to disk. We feel safe doing this
  // here because this really shouldn't fail (we are just removing things).
  removePackages : function (names) {
    var self = this;
    buildmessage.assertInCapture();
    self._removePackageRecords(names);

    // Force a recalculation of all the dependencies, and record them to disk.
    self._depsUpToDate = false;
    self._ensureDepsUpToDate();
    self._recordVersions();
  },

  // Given a set of versions, makes sure that they exist on disk, and then
  // writes out the new versions file.
  //
  // options:
  //   alwaysRecord: record the versions file, even when we aren't supposed to.
  //
  // returns:
  //   success: true/false
  //   downloaded: package:version of packages that we have downloaded
  setVersions: function (newVersions, options) {
    var self = this;
    options = options || {};

    var downloaded = tropohouse.default.downloadMissingPackages(newVersions);
    var ret = {
      success: true,
      downloaded: downloaded
    };

    // We have failed to download the packages successfully! That's bad.
    if (_.keys(downloaded).length !== _.keys(newVersions).length) {
      ret.success = false;
      return ret;
    }

    // Skip the disk IO if the versions haven't changed, unless we have asked to
    // always record. (For example, update will always record versions)
    if (options.alwaysRecord || !_.isEqual(newVersions, self.dependencies)) {
      self.dependencies = newVersions;
      self._recordVersions(options);
    }

    return ret;
  },

  // Recalculates the project dependencies if needed and records them to disk.
  //
  // options:
  //   alwaysRecord: record the versions file, even when we aren't supposed to.
  _recordVersions : function (options) {
    var self = this;
    options = options || {};

    // If the user forced us to an explicit release, then maybe we shouldn't
    // record versions, unless we are updating or creating, in which case, we
    // should.
    if (release.explicit && !options.alwaysRecord) {
      return;
    }

    var lines = [];
    _.each(self.dependencies, function (version, name) {
      lines.push(name + "@" + version + "\n");
    });
    lines.sort();
    fs.writeFileSync(self._getVersionsFile(),
                     lines.join(''), 'utf8');
  },

  // Tries to download all the packages that changed between the old
  // self.dependencies and newVersions, and, if successful, adds 'moreDeps' to
  // the package constraints to this project and replaces the project's
  // dependencies with newVersions. Rewrites the data on disk to match. This
  // does NOT run the constraint solver, it assumes that newVersions is valid to
  // the full set of project constraints.
  //
  // - moreDeps: an object of package constraints to add to the project.
  //   This object can be empty.
  // - newVersions: a new set of dependencies for this project.
  //
  // returns an object mapping packageName to version of packages that we have
  // available on disk. If this object does not contain all the keys of
  // newVersions, then we haven't written the new versions&packages files to
  // disk and the operation has failed.
  addPackages : function (moreDeps, newVersions) {
    var self = this;

    // First, we need to make sure that we have downloaded all the packages that
    // we are going to use. So, go through the versions and call tropohouse to
    // make sure that we have them.
    var downloadedPackages = tropohouse.default.downloadMissingPackages(newVersions);

    // Return the packages that we have downloaded successfully and let the
    // client deal with reporting the error to the user.
    if (_.keys(downloadedPackages).length !== _.keys(newVersions).length) {
      return downloadedPackages;
    }

    // We can continue normally, so set our own internal variables.
    _.each(moreDeps, function (constraint) {
      self.constraints[constraint.name] = constraint.constraintString;
    });
    self.dependencies = newVersions;

    // Remove the old constraints on the same constraints, since we are going to
    // overwrite them.
    self._removePackageRecords(_.pluck(moreDeps, 'name'));

    // Add to the packages file. Do this first, since the versions file is
    // derived from this one and can always be reconstructed later. We read the
    // file from disk, because we don't store the comments.
    var packages = self._getConstraintFile();
    var lines = files.getLinesOrEmpty(packages);
    _.each(moreDeps, function (constraint) {
      if (constraint.constraintString) {
        lines.push(constraint.name + '@' + constraint.constraintString);
      } else {
        lines.push(constraint.name);
      }
    });
    lines.push('\n');
    fs.writeFileSync(packages, lines.join('\n'), 'utf8');

    // Rewrite the versions file.
    self._recordVersions();

    return downloadedPackages;
  },


  // Modifies the project's release version. Takes in a release and writes it in
  // the project's release file.
  //
  // Pass "none" if you don't want the project to be pinned to a Meteor
  // release (typically used when the app was created by a checkout).
  writeMeteorReleaseVersion : function (release) {
    var self = this;
    var releasePath = self._meteorReleaseFilePath();
    fs.writeFileSync(releasePath, release + '\n');
  },

  // The file for the app identifier.
  appIdentifierFile : function () {
    var self = this;
    return path.join(self.rootDir, '.meteor', '.id');
  },

  // Get the app identifier.
  getAppIdentifier : function () {
    var self = this;
    return self.appId;
  },

  // Write out the app identifier file, if none exists. Save the app identifier
  // into the project.
  //
  // We do this in a slightly complicated manner, because, when this function is
  // called, the appID file has not been added to the watchset of the app yet,
  // so we want to minimize the chance of collision.
  ensureAppIdentifier : function () {
    var self = this;
    var identifierFile = self.appIdentifierFile();

    // Find the first non-empty line, ignoring comments.
    var lines = files.getLinesOrEmpty(identifierFile);
    var appId = _.find(_.map(lines, files.trimLine), _.identity);

    // If the file doesn't exist or has no non-empty lines, regenerate the
    // token.
    if (!appId) {
      appId = utils.randomToken() + utils.randomToken() + utils.randomToken();

      var comment = (
"# This file contains a token that is unique to your project.\n" +
"# Check it into your repository along with the rest of this directory.\n" +
"# It can be used for purposes such as:\n" +
"#   - ensuring you don't accidentally deploy one app on top of another\n" +
"#   - providing package authors with aggregated statistics\n" +
"\n");
      fs.writeFileSync(identifierFile, comment + appId + '\n');
    }

    self.appId = appId;
  },

  _finishedUpgradersFile: function () {
    var self = this;
    return path.join(self.rootDir, '.meteor', '.finished-upgraders');
  },

  getFinishedUpgraders: function () {
    var self = this;
    var lines = files.getLinesOrEmpty(self._finishedUpgradersFile());
    return _.filter(_.map(lines, files.trimLine), _.identity);
  },

  appendFinishedUpgrader: function (upgrader) {
    var self = this;

    var current = null;
    try {
      current = fs.readFileSync(self._finishedUpgradersFile(), 'utf8');
    } catch (e) {
      if (e.code !== 'ENOENT')
        throw e;
    }

    var appendText = '';
    if (current === null) {
      // We're creating this file for the first time. Include a helpful comment.
      appendText =
"# This file contains information which helps Meteor properly upgrade your\n" +
"# app when you run 'meteor update'. You should check it into version control\n" +
"# with your project.\n" +
"\n";
    } else if (current.length && current[current.length - 1] !== '\n') {
      // File has an unterminated last line. Let's terminate it.
      appendText = '\n';
    }

    appendText += upgrader + '\n';

    fs.appendFileSync(self._finishedUpgradersFile(), appendText);
  },

  // Adds the passed plugins to the cordovaPlugins list. If the plugin was
  // already in the list, just updates it in-place.
  // newPlugins is an object with a mapping from the Cordova plugin identifier
  // to an semver string or a tarball url with a sha.
  addCordovaPlugins: function (newPlugins) {
    var self = this;
    self.cordovaPlugins = _.extend(self.cordovaPlugins, newPlugins);

    var plugins = self._getCordovaPluginsFile();
    var lines = [];
    _.each(self.cordovaPlugins, function (versionString, plugin) {
      if (versionString)
        lines.push(plugin + '@' + versionString);
      else
        lines.push(plugin);
    });
    lines.push('\n');
    fs.writeFileSync(plugins, lines.join('\n'), 'utf8');
  },

  // Removes the plugins from the cordova-plugins file if they existed.
  // pluginsToRemove - array of Cordova plugin identifiers
  //
  // Returns an array of plugin identifiers that were actually removed.
  removeCordovaPlugins: function (pluginsToRemove) {
    var self = this;

    var removed = _.intersection(_.keys(self.cordovaPlugins), pluginsToRemove);
    self.cordovaPlugins =
      _.omit.apply(null, [self.cordovaPlugins].concat(pluginsToRemove));

    var plugins = self._getCordovaPluginsFile();
    var lines = [];

    _.each(self.cordovaPlugins, function (versionString, plugin) {
      if (versionString)
        lines.push(plugin + '@' + versionString);
      else
        lines.push(plugin);
    });
    lines.push('\n');
    fs.writeFileSync(plugins, lines.join('\n'), 'utf8');

    return removed;
  },

  // platforms - a list of strings
  addCordovaPlatforms: function (platforms) {
    var self = this;
    self.platforms = _.union(self.platforms, platforms);
    self.writePlatformsFile();
  },

  // platforms - a list of strings
  removeCordovaPlatforms: function (platforms) {
    var self = this;
    self.platforms = _.difference(self.platforms, platforms);
    self.writePlatformsFile();
  }
});

// The project is currently a singleton, but there is no universal reason for
// this to be the case. In any case, the project.project thing is kind of
// cumbersome, that is our general design pattern for singletons.
project.project = new Project();
project.Project = Project;
