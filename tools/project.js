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

var getLines = function (file) {
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

var getPackagesLines = function (appDir) {
  return getLines(path.join(appDir, '.meteor', 'packages'));
};

var getVersionsLines = function (appDir) {
  var versionsFile = path.join(appDir, '.meteor', 'versions');
  return fs.existsSync(versionsFile) ? getLines(versionsFile) : [];
};


var trimLine = function (line) {
  var match = line.match(/^([^#]*)#/);
  if (match)
    line = match[1];
  line = line.replace(/^\s+|\s+$/g, ''); // leading/trailing whitespace
  return line;
};

var writePackages = function (appDir, lines) {
  fs.writeFileSync(path.join(appDir, '.meteor', 'packages'),
                   lines.join('\n') + '\n', 'utf8');
};

// Package names used by this project.
project.getPackages = function (appDir) {
  var ret = [];

  // read from .meteor/packages
  _.each(getPackagesLines(appDir), function (line) {
    line = trimLine(line);
    if (line !== '')
      ret.push(line);
  });

  return ret;
};

// Return an array of form [{packageName: foo, versionConstraint: 1.0}]
project.processPerConstraintLines = function(lines) {
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

project.getProgramsDirectory = function (appDir) {
  return path.join(appDir, "programs");
};

// Return the list of subdirectories containing programs in the
// app. Options can include:
//  - watchSet: if provided, the app's programs directory will be added to it
project.getProgramsSubdirs = function (appDir, options) {
  options = options || {};
  var programsDir = project.getProgramsDirectory(appDir);
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
};

// Read direct dependencies from the .meteor/packages file and from
// programs in this app.
//
// Returns an object with keys:
//  - appDeps: object mapping package names to version constraints
//  - programsDeps: an object mapping program name to program deps,
//    where program deps is an object mapping package names to version
//    constraints.
project.getDirectDependencies = function(appDir) {
  var appDeps = project.processPerConstraintLines(getPackagesLines(appDir));

  var programsDeps = {};
  var programsSubdirs = project.getProgramsSubdirs(appDir);

  var PackageSource;
  _.each(programsSubdirs, function (item) {
    if (! PackageSource) {
      PackageSource = require('./package-source.js');
    }

    var programName = item.substr(0, item.length - 1);
    programsDeps[programName] = {};

    var programSubdir = path.join(project.getProgramsDirectory(appDir), item);
    var programSource = new PackageSource(programSubdir);
    programSource.initFromPackageDir(programName, programSubdir);
    _.each(programSource.architectures, function (sourceBuild) {
      _.each(sourceBuild.uses, function (use) {
        programsDeps[programName][use["package"]] = use.constraint || "none";
      });
    });
  });

  return {
    appDeps: appDeps,
    programsDeps: programsDeps
  };
};

// Get a list of constraints from the .meteor/versions file.
project.getIndirectDependencies = function(appDir) {
  return project.processPerConstraintLines(getVersionsLines(appDir));
};

// Write the .meteor/versions file after running the constraint solver.
var rewriteDependencies = function (appDir, deps, versions) {

  // Rewrite the packages file. Do this first, since the versions file is
  // derived from the packages file.
  // XXX: Do not remove comments from packages file.
  var lines = [];
  _.each(deps, function (versionConstraint, name) {
    if (versionConstraint && versionConstraint[0] === "=") { /* exact version required */
      lines.push(name + "@" + versionConstraint + "\n");
    } else {
      lines.push(name + "\n");
    }
  });
  lines.sort();

  fs.writeFileSync(path.join(appDir, '.meteor', 'packages'),
                   lines.join(''), 'utf8');

  // Rewrite the versions file.
  lines = [];
  _.each(versions, function (version, name) {
    lines.push(name + "@" + version + "\n");
  });
  lines.sort();
  fs.writeFileSync(path.join(appDir, '.meteor', 'versions'),
                   lines.join(''), 'utf8');
};


// Call this after running the constraint solver. Downloads the
// necessary package builds and writes the .meteor/versions and
// .meteor/packages files with the results of the constraint solver.
//
// Only writes to .meteor/versions if all the requested versions were
// available from the package server.
//
// Returns an object whose keys are package names and values are
// versions that were successfully downloaded.
project.setDependencies = function (appDir, deps, versions) {
  var downloadedPackages = {};
  _.each(versions, function (version, name) {
    var packageVersionInfo = { packageName: name, version: version };
    // XXX error handling
    var available = tropohouse.maybeDownloadPackageForArchitectures(
      packageVersionInfo,
      ['browser', archinfo.host()]
    );
    if (available) {
      downloadedPackages[name] = version;
    }
  });

  if (_.keys(downloadedPackages).length === _.keys(versions).length) {
    rewriteDependencies(appDir, deps, versions);
  }
  return downloadedPackages;
};

var meteorReleaseFilePath = function (appDir) {
  return path.join(appDir, '.meteor', 'release');
};

// Helper function. Given an object `deps` as returned from
// `getDirectDependencies`, combine all the direct constraints (for the app, its
// programs and the release (if one is set) and ctl) into a single array of
// dependency objects. A dependency object has a packageName field, a version
// field with the version constriant, and boolean values for exact and weak. (We
// use this format because we treat release packages as exact weak
// dependencies.) The result of this gets passed into the constraint solver.
project.combinedConstraints = function (deps) {
  var allDeps = [];

  _.each(deps.appDeps, function (constraint, packageName) {
    allDeps.push(_.extend({packageName: packageName},
                          utils.parseVersionConstraint(constraint)));
  });
  _.each(deps.programsDeps, function (deps, programName) {
    _.each(deps, function (constraint, packageName) {
      allDeps.push(_.extend({packageName: packageName},
                          utils.parseVersionConstraint(constraint)));
  });
  });
  var releasePackages = release.current.manifest ? release.current.manifest.packages : {};
  _.each(releasePackages, function(version, name) {
    allDeps.push({packageName: name, version: version, weak: true, exact: true});
  });
  allDeps.push({packageName: "ctl", version:  null });


  return allDeps;
};

// Run the constraint solver to determine the package versions to use.
//
// We let the user manually edit the .meteor/packages and .meteor/versions
// files, and we use local packages that can change dependencies in
// development, so we need to rerun the constraint solver before running and
// deploying the app.
project.generatePackageLoader = function (appDir) {
  var versions = project.getIndirectDependencies(appDir);
  var packages = project.getDirectDependencies(appDir);

  // package name -> list of version constraints
  var allPackages = project.combinedConstraints(packages);
  // Call the constraint solver.
  var newVersions = catalog.catalog.resolveConstraints(allPackages,
                                              { previousSolution: versions });
  if ( ! newVersions) {
    console.log("Cannot compute versions for: ", allPackages);
    process.exit(1);
  }

  // Download any necessary package builds and write out the new versions file.
  delete packages["ctl"];
  project.setDependencies(appDir, packages.appDeps, newVersions);

  var PackageLoader = require('./package-loader.js');
  var loader = new PackageLoader({
    versions: newVersions
  });

  return loader;
};


// This will return "none" if the project is not pinned to a release
// (it was created by a checkout), or null for a pre-0.6.0 app with no
// .meteor/release file.  It returns the empty string if the file exists
// but is empty.
project.getMeteorReleaseVersion = function (appDir) {
  var releasePath = meteorReleaseFilePath(appDir);
  try {
    var lines = getLines(releasePath);
  } catch (e) {
    return null;
  }
  // This should really never happen, and the caller will print a special error.
  if (!lines.length)
    return '';
  return trimLine(lines[0]);
};

// Pass "none" if you don't want the project to be pinned to a Meteor
// release (typically used when the app was created by a checkout).
project.writeMeteorReleaseVersion = function (appDir, release) {
  var releasePath = meteorReleaseFilePath(appDir);
  fs.writeFileSync(releasePath, release + '\n');
};

project.addPackage = function (appDir, name) {
  var lines = getPackagesLines(appDir);

  // detail: if the file starts with a comment, try to keep a single
  // blank line after the comment (unless the user removes it)
  var current = project.getPackages(appDir);
  if (_.contains(current, name))
    return;
  if (!current.length && lines.length)
    lines.push('');
  lines.push(name);
  writePackages(appDir, lines);
};

project.removePackage = function (appDir, name) {
  // XXX assume no special regexp characters
  var lines = _.reject(getPackagesLines(appDir), function (line) {
    return trimLine(line) === name;
  });
  writePackages(appDir, lines);
};
