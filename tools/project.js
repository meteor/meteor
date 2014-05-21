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
  // come from the current release version.
  self.combinedConstraints = null;

  // Packages & versions of all dependencies, including transitive dependencies,
  // program dependencies and so on, that this project uses. An object mapping a
  // package name to its string version.
  self.dependencies = null;

  // The package loader for this project, with the project's dependencies as its
  // version file. (See package-loader.js for more information about package
  // loaders).
  self.packageLoader = null;

  // True if the project has been initialized with a root directory and
  // dependency information and false otherwise.
  self.initialized = false;

  // It is kind of pointless to make a path.join to get these every time, so we
  // might as well remember what they are.
  self._constraintFile = null;
  self._versionsFile = null;
};

_.extend(Project.prototype, {
  // XXX: documentation
  initialize : function (rootDir) {
    var self = this;
    // Initialize the root directory.
    self.rootDir = rootDir;
    self._constraintFile = self._genConstraintFile();
    self._versionsFile = self._genVersionsFile();

    // Process the constraints.
    // First, read in our own packages file.
    var appConstraintFile = self._constraintFile;
    self.constraints = processPerConstraintLines(
      getLines(appConstraintFile));
/*
    var releasePackages = release.current.isProperRelease() ?
          release.current.getPackages() : {}; */
    var releasePackages = {};

/*    self.combinedConstraints =
      self.calculateCombinedConstraints(releasePackages); */

    self.dependencies = processPerConstraintLines(
      getLines(self._versionsFile));

    self.ensureAppIdentifier();

    self.initialized = true;

  },

  _ensurePackageLoader : function () {
    var self = this;

    if (!self.packageLoader) {

      var newVersions = catalog.catalog.resolveConstraints(
        self.getCombinedConstraints(),
        {  previousSolution: self.dependencies }
      );

      if (newVersions !== self.dependencies) {
        self.setDependencies(self.constraints, newVersions);
      };

      var PackageLoader = require('./package-loader.js');
      self.packageLoader = new PackageLoader({
        versions: newVersions
      });
    }
  },

  // XXX: document
  calculateCombinedConstraints : function (releasePackages) {
    var self = this;

    var allDeps = [];
    _.each(self.constraints, function (constraint, packageName) {
      allDeps.push(_.extend({packageName: packageName},
                            utils.parseVersionConstraint(constraint)));
    });
    _.each(self._getProgramsDeps, function (deps, programName) {
      _.each(deps, function (constraint, packageName) {
        allDeps.push(_.extend({packageName: packageName},
                              utils.parseVersionConstraint(constraint)));
      });
    });
    _.each(releasePackages, function(version, name) {
      allDeps.push({packageName: name, version: version, weak: true,
                    type: 'exactly'});
    });
    // XXX grr
    allDeps.push({packageName: "ctl", version:  null });

    return allDeps;
  },

  _getProgramDeps: function () {
    var self = this;

    // Now we have to go through the programs directory, go through each of the
    // programs and get their dependencies.
    var programsDeps = {};
    var programsSubdirs = self.getProgramsSubdirs();
    var PackageSource;
    _.each(programsSubdirs, function (item) {
      if (! PackageSource) {
        PackageSource = require('./package-source.js');
      }

      var programName = item.substr(0, item.length - 1);
      programsDeps[programName] = {};

      var programSubdir = path.join(self.getProgramsDirectory(), item);
      var programSource = new PackageSource(programSubdir);
      programSource.initFromPackageDir(programName, programSubdir);
      _.each(programSource.architectures, function (sourceBuild) {
        _.each(sourceBuild.uses, function (use) {
          programsDeps[programName][use["package"]] = use.constraint || "none";
        });
      });
    });

    return programsDeps;
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
  // Returns an object mapping package name to an optional string constraint, or
  // null if the package is unconstrained.
  getCombinedConstraints : function () {
    var self = this;
    if (!self.combinedConstraints) {
      var releasePackages = release.current.isProperRelease() ?
            release.current.getPackages() : {};
      self.combinedConstraints =
        self.calculateCombinedConstraints(releasePackages);
    }

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
    self._ensurePackageLoader();
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
    self._ensurePackageLoader();
    return self.packageLoader;
  },

  // Accessor methods dealing with releases.

  // This will return "none" if the project is not pinned to a release
  // (it was created by a checkout), or null for a pre-0.6.0 app with no
  // .meteor/release file.  It returns the empty string if the file exists
  // but is empty.
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
      });
    } else if (operation == "remove") {
      lines = _.reject(lines, function (line) {
        return _.indexOf(trimLine(line), names) !== -1;
      });
    }

    fs.writeFileSync(appConstraintFile,
                     lines.join('\n') + '\n', 'utf8');

    // Our package loader is based on the wrong information, so we should
    // invalidate it.
    self.packageLoader = null;

    // Also, let's reread our packages file. This is not super efficient.
    // XXX: eficienize.
    self.constraints = processPerConstraintLines(
      getLines(appConstraintFile));
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
  // XXX: Clean up this function in various ways.
  setDependencies : function (deps, versions) {
    var self = this;

    // Set our own internal variables first.
    self.constraints = deps;
    self.dependencies = versions;

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

    if (_.keys(downloadedPackages).length === _.keys(versions).length) {
      // Rewrite the packages file. Do this first, since the versions file is
      // derived from the packages file.
      // XXX: Do not remove comments from packages file.
      var lines = [];
      _.each(deps, function (versionConstraint, name) {
        if (versionConstraint) {
          console.log(versionConstraint);
          lines.push(name + "@" + versionConstraint + "\n");
        } else {
          lines.push(name + "\n");
        }
      });
      lines.sort();

      fs.writeFileSync(path.join(self.rootDir, '.meteor', 'packages'),
                       lines.join(''), 'utf8');

      // Rewrite the versions file.
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

  // Each project contains an identifier that is sent to the stat server.
  //
  // XXX: memoize this like everything else and also document.
  appIdentifierFile : function () {
    var self = this;
    return path.join(self.rootDir, '.meteor', 'identifier');
  },

  getAppIdentifier : function () {
    var self = this;
    var identifierFile = self.appIdentifierFile();
    if (fs.existsSync(identifierFile)) {
      return fs.readFileSync(identifierFile, 'utf8');
    } else {
      throw new Error("Expected a file at " + identifierFile);
    }
  },

  ensureAppIdentifier : function () {
    var self = this;
    var identifierFile = self.appIdentifierFile();
    if (!fs.existsSync(identifierFile))
      fs.writeFileSync(
        identifierFile,
        utils.randomToken() + utils.randomToken() + utils.randomToken());
  }
});


// XXX: We want to experiment with project being a singleton, but we also want
// to be careful about it.
project.project = new Project();

project.b = new Project();
project.u = new Project();
project.s = new Project();
