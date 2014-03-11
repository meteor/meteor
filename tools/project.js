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

var meteorReleaseFilePath = function (appDir) {
  return path.join(appDir, '.meteor', 'release');
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
