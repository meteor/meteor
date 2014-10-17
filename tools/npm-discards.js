var assert = require("assert");
var path = require("path");
var fs = require("fs");
var _ = require("underscore");
var hasOwn = Object.prototype.hasOwnProperty;

// This class encapsulates a structured specification of files and
// directories that should be stripped from the node_modules directories
// of Meteor packages during `meteor build`, as requested by calling
// `Npm.discard` in package.js files.
function NpmDiscards() {
  assert.ok(this instanceof NpmDiscards);
  this.discards = {};
}

var NDp = NpmDiscards.prototype;

// Update the current specification of discarded files with additional
// patterns that should be discarded. See the comment in package-source.js
// about `Npm.strip` for an explanation of what should be passed for the
// `discards` parameter.
NDp.merge = function(discards) {
  merge(this.discards, discards);
};

function merge(into, from) {
  _.each(from, function(fromValue, packageName) {
    var intoValue = _.has(into, packageName) && into[packageName];
    if (_.isString(fromValue) ||
        _.isRegExp(fromValue)) {
      if (intoValue) {
        intoValue.push(fromValue);
      } else {
        into[packageName] = [fromValue];
      }
    } else if (_.isArray(fromValue)) {
      if (intoValue) {
        intoValue.push.apply(intoValue, fromValue);
      } else {
        // Make a defensive copy of any arrays passed to `Npm.strip`.
        into[packageName] = fromValue.slice(0);
      }
    }
  });
}

// Given an actual filesystem directory, build a mapping from absolute
// package directories to lists of patterns to be discarded.
NDp.buildDiscardChecker = function(rootDir) {
  return new NpmDiscardChecker(rootDir, this.buildDiscardMap(rootDir));
};

NDp.buildDiscardMap = function(rootDir) {
  var self = this;
  var discardMap = Object.create(null);

  if (path.basename(rootDir) === "node_modules") {
    rootDir = path.dirname(rootDir);
  }

  function populateDiscardMap(discards, relDir) {
    var isArray = _.isArray(discards);
    if (isArray ||
        _.isString(discards) ||
        _.isRegExp(discards)) {

      if (! isArray) {
        discards = [discards];
      }

      var dir = path.join(rootDir, relDir);
      var intoArray = _.has(discardMap, dir)
        ? discardMap[dir]
        : discardMap[dir] = [];

      intoArray.push.apply(intoArray, discards);
    }
  }

  // For convenience, the packages passed as top-level keys to Npm.strip
  // do not actually have to be installed in the top level of the NPM
  // package tree. This function finds any/all copies of top-level
  // packages and populates the discard map starting from each copy.
  function findTopLevelPackages(relDir) {
    var files = readDir(path.join(rootDir, relDir, "node_modules"));
    if (files) {
      _.each(files, function(childPkgName) {
        if (childPkgName.charAt(0) === ".") {
          return;
        }

        var relChildPkgPath = path.join(relDir, "node_modules", childPkgName);

        if (_.has(self.discards, childPkgName)) {
          populateDiscardMap(self.discards[childPkgName], relChildPkgPath);
        }

        findTopLevelPackages(relChildPkgPath);
      });
    }
  }

  findTopLevelPackages(".");

  return discardMap;
};

function NpmDiscardChecker(rootDir, discardMap) {
  assert.ok(this instanceof NpmDiscardChecker);
  assert.ok(_.isString(rootDir));
  this.rootDir = rootDir;
  this.discardMap = discardMap;
}

var NDCp = NpmDiscardChecker.prototype;

NDCp.shouldDiscard = function(fullPath) {
  var prefix = fullPath;
  while (prefix !== this.rootDir) {
    if (_.has(this.discardMap, prefix)) {
      return this.discardMap[prefix].some(function(pattern) {
        return matches(pattern, prefix, fullPath);
      });
    }
    prefix = path.dirname(prefix);
  }
};

// TODO Cache this.
function readDir(dirPath) {
  try {
    return fs.readdirSync(dirPath);
  } catch (err) {
    return null;
  }
}

// TODO Improve this. For example we don't currently support wildcard
// string patterns (just use a RegExp if you need that flexibility).
function matches(pattern, prefix, fullPath) {
  var relPath = path.relative(prefix, fullPath);

  if (_.isRegExp(pattern)) {
    return relPath.match(pattern);
  }

  assert.ok(_.isString(pattern));

  if (pattern.charAt(pattern.length - 1) === path.sep &&
      fs.lstatSync(fullPath).isDirectory()) {
    relPath += path.sep;
  }

  if (pattern.charAt(0) === path.sep) {
    return relPath.indexOf(pattern.slice(1), relPath) === 0;
  }

  return relPath.indexOf(pattern) !== -1;
}

module.exports = NpmDiscards;
