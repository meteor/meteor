var fs = require('fs');
var path = require('path');
var _ = require('underscore');
var files = require('./files.js');
var utils = require('./utils.js');

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
      ret[constraint.name] = constraint.versionConstraint;
     }
  });
  return ret;

};

// Read in the .meteor/packages file.
project.getDirectDependencies = function(appDir) {
  return project.processPerConstraintLines(getPackagesLines(appDir));
};

// Get a list of constraints from the .meteor/versions file.
project.getIndirectDependencies = function(appDir) {
  return project.processPerConstraintLines(getVersionsLines(appDir));
};

// Write the .meteor/versions file after running the constraint solver.
project.rewriteDependencies = function (appDir, deps, versions) {

  // Rewrite the packages file. Do this first, since the versions file is
  // derived from the packages file.
  var lines = [];
  _.each(deps, function (versionConstraint, name) {
    if (versionConstraint[0] === "=") { /* exact version required */
      lines.push(name + "@" + versionConstraint + "\n");
    } else {
      lines.push(name + "@" + versions[name] + "\n");
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

var meteorReleaseFilePath = function (appDir) {
  return path.join(appDir, '.meteor', 'release');
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

  // XXX: We are manually adding ctl here, but we should do this in a more
  // principled manner.
  var constraintSolver = require('./constraint-solver.js');
  var resolver = new constraintSolver.Resolver;
  // XXX: constraint solver currently ignores versions, but it should not.
  var newVersions = resolver.resolve(
    _.extend(packages, { "ctl" : "none" }));
  if ( ! newVersions) {
    return { outcome: 'conflicting-versions' };
  }

  // Write out the new versions file.
  delete packages["ctl"];
  project.rewriteDependencies(appDir, packages, newVersions);

  var newVersionsReform = {};
  _.each(newVersions, function (version, name) {
    newVersionsReform[name] = {
      version: version
    };
  });

  var PackageLoader = require('./package-loader.js');
  var loader = new PackageLoader({
    versions: newVersionsReform
  });
  return loader;
};


// This will return "none" if the project is not pinned to a release
// (it was created by a checkout), or null for a legacy app with no
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
