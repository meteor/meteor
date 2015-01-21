var assert = require("assert");
var files = require("./files.js");
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

NDp.shouldDiscard = function shouldDiscard(candidatePath, isDirectory) {
  if (typeof isDirectory === "undefined") {
    isDirectory = files.lstat(candidatePath).isDirectory();
  }

  for (var currentPath = candidatePath, parentPath;
       (parentPath = files.pathDirname(currentPath)) !== currentPath;
       currentPath = parentPath) {
    if (files.pathBasename(parentPath) === "node_modules") {
      var packageName = files.pathBasename(currentPath);

      if (_.has(this.discards, packageName)) {
        var relPath = files.pathRelative(currentPath, candidatePath);

        if (isDirectory) {
          relPath = files.pathJoin(relPath, files.pathSep);
        }

        return this.discards[packageName].some(function(pattern) {
          return matches(pattern, relPath);
        });
      }

      // Stop at the first ancestor node_modules directory we find.
      break;
    }
  }

  return false;
};

// TODO Improve this. For example we don't currently support wildcard
// string patterns (just use a RegExp if you need that flexibility).
function matches(pattern, relPath) {
  if (_.isRegExp(pattern)) {
    return relPath.match(pattern);
  }

  assert.ok(_.isString(pattern));

  if (pattern.charAt(0) === files.pathSep) {
    return relPath.indexOf(pattern.slice(1)) === 0;
  }

  return relPath.indexOf(pattern) !== -1;
}

module.exports = NpmDiscards;
