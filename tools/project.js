var fs = require('fs');
var path = require('path');
var _ = require('underscore');
var files = require('./files.js');

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


// Convert foo@1.0 into an object.
project.processPackageConstraint = function(constraint) {
  var constArray = constraint.split("@");
  var constObj  = {};
  constObj.packageName = constArray[0];
  if (constArray.length > 1) {
   constObj.versionConstraint = constArray[1];
 }
 return constObj;
};

// Return an array of form [{packageName: foo, versionConstraint: 1.0}]
project.processPerConstraintLines = function(lines) {
  var ret = [];

  // read from .meteor/packages
  _.each(lines, function (line) {
    line = trimLine(line);
    if (line !== '') {
      ret.push(project.processPackageConstraint(line));
     }
  });
  return ret;

};

// Read in the .meteor/packages file.
project.getDirectDependencies = function(appDir) {
  return project.processPerConstraintLines(getPackagesLines(appDir));
};

// Given a list of dep constraints:
//  foo@1.0 or just foo
// return an object.
project.getDepsAsObj = function(deps) {
  var using = {};

  _.each(deps, function (constraint) {
    if (!_.has(constraint, "versionConstraint")) {
      using[constraint.packageName] = "none";
    } else {
      using[constraint.packageName] = constraint.versionConstraint;
    }
  });
  return using;
};


// Get a list of constraints from the .meteor/versions file.
project.getIndirectDependencies = function(appDir) {
  return project.processPerConstraintLines(getVersionsLines(appDir));
};

project.getAllDependencies = function(appDir) {
  // Aha! Actually, it turns out that indirect dependenceis include all dependencies.
  // Maybe I should clean up this code later.
  return project.getIndirectDependencies(appDir);
};

// Write the .meteor/versions file after running the constraint solver.
project.rewriteIndirectDependencies = function (appDir, deps) {

  var lines = [];

  _.each(deps, function (version, name) {
    lines.push(name + "@" + version + "\n");
  });
  lines.sort();

  fs.writeFileSync(path.join(appDir, '.meteor', 'versions'),
                   lines.join(''), 'utf8');
};

project.rewriteDirectDependencies = function (appDir, deps) {

  var lines = [];

  //XXX: constraints, old stuff.
  _.each(deps, function (version, name) {
    lines.push(name + "@" + version + "\n");
  });
  lines.sort();

  fs.writeFileSync(path.join(appDir, '.meteor', 'packages'),
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
  var versions = project.getDepsAsObj(
    project.getIndirectDependencies(appDir));
  var packages = project.getDepsAsObj(
    project.getDirectDependencies(appDir));

  // XXX: We are manually adding ctl here, but we should do this in a more
  // principled manner.
  packages['ctl'] = "none";
  var constraintSolver = require('./constraint-solver.js');
  var resolver = new constraintSolver.Resolver;
  // XXX: constraint solver currently ignores versions, but it should not.
  var newVersions = resolver.resolve(packages);
  if ( ! newVersions) {
    return { outcome: 'conflicting-versions' };
  }

  // Write out the new versions file.
  project.rewriteIndirectDependencies(appDir, newVersions);

  var PackageLoader = require('./package-loader.js');
  var loader = new PackageLoader({
    versions: newVersions
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
