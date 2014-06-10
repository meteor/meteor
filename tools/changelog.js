var fs = require('fs');
var path = require('path');
var _ = require('underscore');
var files = require('./files.js');
var utils = require('./utils.js');

// This file deals with writing and reading the changelog.
//
// The changelog is not a part of an app -- currently only packages have
// changelog support, and project.js is built to support apps as projects (ie:
// it looks for the .meteor directory etc). It is not really part of the package
// source either though, for a lot of packages. So, it is separate... for now.
//
// In the future of unified treatment of app&package projects, this would be
// moved to project.js.

// Given the source directory, get the changelog file.
exports.getChangelogFile = function (sourceDir) {
  return path.join(sourceDir, 'History.md');
}

// Parse the changelog file. Takes in a filename.
//
// Returns an object, mapping the version string to an array of lines,
// represneting its changelog contents.
exports.readChangelog = function (filename) {
  var lines = utils.getLines(filename);

  // Remove leading & trailing whitespace off a line.
  var trimWhitespace = function (line) {
    return line.replace(/^\s+|\s+$/g, '');
  };

  var ret = {};
  var malformed = false;
  var currentVersion = "";
  _.each(lines, function (line) {
    // Lines starting with ## denote a version, usually in the format of ##
    // v<versionN>. So, we should start a new version when we encounter the ##
    // and if we don't get what we want, we should return an error.
    if (line.slice(0, 2) == "##") {
      // We just read a bunch of stuff, let's save it.
      var sl = _.indexOf(line, "v");
      if (sl === -1) {
        malformed = true;
      }
      currentVersion = trimWhitespace(line.slice(sl+2, line.length));
      ret[currentVersion] = [];
    } else if (currentVersion) {
      // Process this line. Not sure how for now.
      ret[currentVersion].push(trimWhitespace(line));
    }
  });

  // If the changelog is malformed, return an empty object.
  if (malformed) {
    return {};
  }

  return ret;
};

// Prepend a version & a brief change to the changelog.
//
// Returns true on success and false on failure.
exports.prependChangelog = function (filename, version, changelogLines) {
  var logLines = utils.getLines(filename);
  if (!logLines) {
    return false;
  }

  var title = "## v." + version;
  _.each(changelogLines, function (logline) {
    logLines.unshift("* " + logline);
  });
  logLines.unshift(title);

  fs.writeFileSync(filename, logLines.join('\n'), 'utf8');
  return true;
};

// Change v.NEXT in the changelog to the current version.
exports.rewriteNextChangelog = function (filename, version) {
  var logLines = utils.getLines(filename);
  if (!logLines) {
    return false;
  }

  logLines.shift();
  var title = "## v." + version;
  logLines.unshift(title);

  fs.writeFileSync(filename, logLines.join('\n'), 'utf8');
  return true;
};

// Remove v.NEXT in the changelog.
exports.eraseNextChangelog = function (filename, version) {
  var logLines = utils.getLines(filename);
  if (!logLines) {
    return false;
  }

  logLines.shift();

  fs.writeFileSync(filename, logLines.join('\n'), 'utf8');
  return true;
};


exports.printLines = function (lines, openning) {
   _.each(lines, function (l) {
      console.log(openning + l);
   });
};
