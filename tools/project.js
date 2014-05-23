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

var project = exports;

// Trims whitespace & other filler characters of a line in a project file.
var trimLine = function (line) {
  var match = line.match(/^([^#]*)#/);
  if (match)
    line = match[1];
  line = line.replace(/^\s+|\s+$/g, ''); // leading/trailing whitespace
  return line;
};

// Reads in a file, stripping blanck lines in the end. Returns an array of lines
// in the file, to be processed individually.
var getLines = function (file) {
  if (!fs.existsSync(file)) {
    return [];
  }

  var raw = fs.readFileSync(file, 'utf8');
  var lines = raw.split(/\r*\n\r*/);

  // strip blank lines at the end
  while (lines.length) {
    var line = lines[lines.length - 1];
    if (line.match(/\S/))
      break;
    lines.pop();
  }

  return lines;
};

// Given a set of lines, each of the form "foo@bar", return an array of form
// [{packageName: foo, versionConstraint: bar}]. If there is bar,
// versionConstraint is null.
var processPerConstraintLines = function(lines) {
  var ret = {};

  // read from .meteor/packages
  _.each(lines, function (line) {
    line = trimLine(line);
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
  // package name to its string version. Derived from self.combinedConstraints.
  self.dependencies = null;

  // The package loader for this project, with the project's dependencies as its
  // version file. (See package-loader.js for more information about package
  // loaders). Derived from self.dependencies.
  self.packageLoader = null;

  // The app identifier is used for stats, read from a file and not invalidated
  // by any constraint-related operations.
  self.appId = null;

  // True if the project has been initialized with a root directory and
  // dependency information and false otherwise.
  self.initialized = false;

  // Packages used by the sub-programs using of this project. Should not change
  // without restart, we memoize this because we would otherwise need to reread
  // it from disk every time we recalculate versions.
  self._programConstraints = null;

  // Whenever we change the constraints, we invalidate many constraint-related
  // fields. Rather than recomputing immediately, let's wait until we are done
  // and then recompute when needed.
  self._depsUpToDate = false;

  // It is kind of pointless to make a path.join to get these every time, so we
  // might as well remember what they are.
  self._constraintFile = null;
  self._versionsFile = null;
};

_.extend(Project.prototype, {
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
    self._constraintFile = self._genConstraintFile();
    self._versionsFile = self._genVersionsFile();

    // Read in the contents of the .meteor/packages file.
    var appConstraintFile = self._constraintFile;
    self.constraints = processPerConstraintLines(
      getLines(appConstraintFile));

    // Read in the contents of the .meteor/versions file, so we can give them to
    // the constraint solver as the previous solution.
    self.dependencies = processPerConstraintLines(
      getLines(self._versionsFile));

    // Now we have to go through the programs directory, go through each of the
    // programs and get their dependencies.
    self._programConstraints = {};
    var programsSubdirs = self.getProgramsSubdirs();
    var PackageSource;
    _.each(programsSubdirs, function (item) {
      if (! PackageSource) {
        PackageSource = require('./package-source.js');
      }

      var programName = item.substr(0, item.length - 1);
       self._programConstraints[programName] = {};

      var programSubdir = path.join(self.getProgramsDirectory(), item);
      var programSource = new PackageSource(programSubdir);
      programSource.initFromPackageDir(programName, programSubdir);
      _.each(programSource.architectures, function (sourceBuild) {
        _.each(sourceBuild.uses, function (use) {
           self._programConstraints[programName][use["package"]] =
             use.constraint || null;
        });
      });
    });

    // Also, make sure we have an app identifier for this app.
    self.ensureAppIdentifier();

    // Lastly, invalidate everything that we have computed -- obviously the
    // dependencies that we counted with the previous rootPath are wrong and we
    // need to recompute them.
    self.depsUpToDate = false;
  },

  // Several fields in project are derived from constraints. Whenever we change
  // the constraints, we invalidate those fields, when we call on
  // dependency-related operations, we recompute them as needed.
  //
  // If the project's dependencies are up to date, this does nothing. Otherwise,
  // it recomputes the combined constraints, the versions to use and initializes
  // the package loader for this project.
  _ensureDepsUpToDate : function () {
    var self = this;

    // Aha, now we can initialize the project singleton. There is a dependency
    // chain here -- to calculate project dependencies, we need to know what
    // release we are on. So, we need to initialize it after the release. To
    // figure out our release, we need to initialize the catalog. But we can't use
    // the catalog's constraint solver until we initialize the release.
    //
    // Because this call is lazy, we don't need to worry about this, as long as we
    // call things in the right order in main.js
    if (!release.current) {
      throw new Error(
        "need to compute release before computing project dependencies.");
    }

    if (!self.depsUpToDate) {
      // Use current release to calculate packages & combined constraints.
      var releasePackages = release.current.isProperRelease() ?
            release.current.getPackages() : {};
      self.combinedConstraints =
        self.calculateCombinedConstraints(releasePackages);

      // Call the constraint solver, using the previous dependencies as the last
      // solution. Remember to check 'ignoreProjectDeps', otherwise it will just
      // try to look up the solution in our own dependencies and it will be a
      // disaster.
      var newVersions = catalog.catalog.resolveConstraints(
        self.combinedConstraints,
        { previousSolution: self.dependencies },
        { ignoreProjectDeps: true }
      );

      // If the result is now what it used to be, rewrite the files on
      // disk. Otherwise, don't bother with I/O operations.
      if (newVersions !== self.dependencies) {
        // This will set self.dependencies as a side effect.
        self.setDependencies(self.constraints, newVersions);
      };

      // Finally, initialize the package loader.
      var PackageLoader = require('./package-loader.js');
      self.packageLoader = new PackageLoader({
        versions: newVersions
      });

      // We are done!
      self.depsUpToDate = true;
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
    var allDeps = [];
    // First, we process the contents of the .meteor/packages file. The
    // self.constraints variable is always up to date.
    _.each(self.constraints, function (constraint, packageName) {
      allDeps.push(_.extend({packageName: packageName},
                            utils.parseVersionConstraint(constraint)));
    });

    // Next, we process the program constraints. These don't change since the
    // project was initialized.
    _.each(self._programConstraints, function (deps, programName) {
      _.each(deps, function (constraint, packageName) {
        allDeps.push(_.extend({packageName: packageName},
                              utils.parseVersionConstraint(constraint)));
      });
    });

    // Finally, each release package is a weak exact constraint. So, let's add
    // those.
    _.each(releasePackages, function(version, name) {
      allDeps.push({packageName: name, version: version, weak: true,
                    type: 'exactly'});
    });

    // This is an UGLY HACK that has to do with our requirement to have a
    // control package on everything (and preferably that package is ctl), even
    // apps that don't actually need it because they don't go to galaxy. Maybe
    // someday, this will make sense.
    allDeps.push({packageName: "ctl", version:  null });

    return allDeps;
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
    self._ensureDepsUpToDate();
    return self.combinedConstraints;
  },

  // Returns the file path to the .meteor/packages file, containing the
  // constraints for this specific project.
  _genConstraintFile : function () {
    var self = this;
    return path.join(self.rootDir, '.meteor', 'packages');
  },



  // Give the contents of the project's .meteor/versions file to the caller.
  //
  // Returns an object mapping package name to its string version.
  getVersions : function () {
    var self = this;
    self._ensureDepsUpToDate();
    return self.dependencies;
  },

  // Returns the file path to the .meteor/versions file, containing the
  // dependencies for this specific project.
  _genVersionsFile : function () {
    var self = this;
    return path.join(self.rootDir, '.meteor', 'versions');
  },

  // Give the package loader attached to this project to the caller.
  //
  // Returns a packageLoader that has been pre-loaded with this project's
  // transitive dependencies.
  getPackageLoader : function () {
    var self = this;
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
  // (XXX: we should move this to release.js, and move the getLines
  // function into utils)
  getMeteorReleaseVersion : function () {
    var self = this;
    var releasePath = self._meteorReleaseFilePath();
    try {
      var lines = getLines(releasePath);
    } catch (e) {
      return null;
    }
    // This should really never happen, and the caller will print a special error.
    if (!lines.length)
      return '';
    return trimLine(lines[0]);
  },

  // Returns the full filepath of the projects .meteor/release file.
  _meteorReleaseFilePath : function () {
    var self = this;
    return path.join(self.rootDir, '.meteor', 'release');
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
  // XXX: get rid of this function.
  forceEditPackages : function (names, operation) {
    var self = this;

    var appConstraintFile = self._constraintFile;
    var lines = getLines(appConstraintFile);
    if (operation === "add") {
      _.each(names, function (name) {
        if (_.contains(self.constraints, name))
          return;
        if (!self.constraints.length && lines.length)
          lines.push('');
        lines.push(name);
        self.constraints[name] = null;
      });
    } else if (operation == "remove") {
      lines = _.reject(lines, function (line) {
        return _.indexOf(trimLine(line), names) !== -1;
      });
      _.each(names, function (name) {
        delete self.constraints[name];
      });
    }

    fs.writeFileSync(appConstraintFile,
                     lines.join('\n') + '\n', 'utf8');

    // Any derived values need to be invalidated.
    self._depsUpToDate = false;
  },


  removePackages : function (names) {
    var self = this;

    var newPaks = self.constraints;
    _.each(names, function (name) {
      delete newPaks[name];
    });


  },

  // Call this after running the constraint solver. Downloads the
  // necessary package builds and writes the .meteor/versions and
  // .meteor/packages files with the results of the constraint solver.
  //
  // Only writes to .meteor/versions if all the requested versions were
  // available from the package server.
  //
  // Returns an object whose keys are package names and values are
  // versions that were successfully downloaded.
  //
  // XXX: This shouldn't really take deps as an argument, or at least it should
  // allow the situation where constraints don't change at all.
  setDependencies : function (deps, versions) {
    var self = this;

    // Set our own internal variables first.
    self.constraints = deps;
    self.dependencies = versions;

    // First, we need to make sure that we have downloaded all the packages that
    // we are going to use. So, go through the versions and call tropohouse to
    // make sure that we have them.
    var downloadedPackages = {};
    _.each(versions, function (version, name) {
      var packageVersionInfo = { packageName: name, version: version };
      // XXX error handling
      var available = tropohouse.default.maybeDownloadPackageForArchitectures(
        packageVersionInfo,
        ['browser', archinfo.host()]
      );
      if (available) {
        downloadedPackages[name] = version;
      }
    });

    // If we have successfully downloaded everything, then we can rewrite the
    // relevant project files.
    //
    // XXX: But ... shouldn't we tell the user if we failed?!
    if (_.keys(downloadedPackages).length === _.keys(versions).length) {
      // Rewrite the packages file. Do this first, since the versions file is
      // derived from the packages file.
      // XXX: Do not remove comments from packages file.
      var lines = [];

      // This rewrites the .meteor/packages file.
      // XXX: make this optional.
      // XXX: make this not remove comments.
      var lines = [];
      _.each(deps, function (versionConstraint, name) {
        if (versionConstraint) {
          lines.push(name + "@" + versionConstraint + "\n");
        } else {
          lines.push(name + "\n");
        }
      });
      lines.sort();
      fs.writeFileSync(path.join(self.rootDir, '.meteor', 'packages'),
                       lines.join(''), 'utf8');

      // Rewrite the versions file. This is a system file that doesn't allow
      // comments (XXX: Why not?), so this is pretty straightforward.
      lines = [];
      _.each(versions, function (version, name) {
        lines.push(name + "@" + version + "\n");
      });
      lines.sort();
      fs.writeFileSync(path.join(self.rootDir, '.meteor', 'versions'),
                       lines.join(''), 'utf8');

    }
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
    return path.join(self.rootDir, '.meteor', 'identifier');
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
    if (!fs.existsSync(identifierFile)) {
      var id =  utils.randomToken() + utils.randomToken() + utils.randomToken();
      fs.writeFileSync(identifierFile, id);
    }
    if (fs.existsSync(identifierFile)) {
      self.appId = fs.readFileSync(identifierFile, 'utf8');
    } else {
      throw new Error("Expected a file at " + identifierFile);
    }
  }
});

// The project is currently a singleton, but there is no universal reason for
// this to be the case. Let's use this design pattern to begin with, so that if
// we want to expose Project() and allow multiple projects, we could do so easily.
project.project = new Project();
