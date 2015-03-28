var files = require('./files.js');
var _ = require('underscore');
var pathwatcher = require("./safe-pathwatcher.js");

// Watch for changes to a set of files, and the first time that any of
// the files change, call a user-provided callback. (If you want a
// second callback, you'll need to create a second Watcher.)
//
// You describe the structure you want to watch in a WatchSet; you then create a
// Watcher to watch it. Watcher does not mutate WatchSet, so you can create
// several Watchers from the same WatchSet. WatchSet can be easily converted to
// and from JSON for serialization.
//
// You can set up two kinds of watches, file and directory watches.
//
// In a file watch, you provide an absolute path to a file and a SHA1 (encoded
// as hex) of the contents of that file. If the file ever changes so that its
// contents no longer match that SHA1, the callback triggers. You can also
// provide `null` for the SHA1, which means the file should not exist.
//
// In a directory watch, you provide an absolute path to a directory,
// two lists of regular expressions specifying the entries to
// include and exclude, and an array of which entries to expect.
//
// For directory watches, the regular expressions work as follows. You provide
// two arrays of regular expressions, an include list and an exclude list. An
// entry in the directory matches if it matches at least one regular expression
// in the include list, and doesn't match any regular expressions in the exclude
// list. The string that is matched against the regular expression ends with a
// '/' if the entry is directory. There is NO IMPLICIT RECURSION here: a
// directory watch ONLY watches the immediate children of the directory! If you
// want a recursive watch, you need to do the recursive walk while building the
// WatchSet and add a bunch of separate directory watches.
//
// There can be multiple directory watches on the same directory. There is no
// relationship between the files found in directory watches and the files
// watched by file watches; they are parallel mechanisms.
//
// Regular expressions are checked only against individual path components (the
// actual name of the file or the subdirectory) plus the trailing '/' for
// directories, not against the entire path.
//
// You can call stop() to stop watching and tear down the
// watcher. Calling stop() guarantees that you will not receive a
// callback (if you have not already). Calling stop() is unnecessary
// if you've received a callback.
//
// To do a "one-shot" (to see if any files have been modified, compared to the
// dependencies, at a particular point in time), use the isUpToDate function.
//
// XXX Symlinks are currently treated transparently: we treat them as the thing
// they point to (ie, as a directory if they point to a directory, as
// nonexistent if they point to something nonexist, etc). Not sure if this is
// correct.

var WatchSet = function () {
  var self = this;

  // Set this to true if any Watcher built on this WatchSet must immediately
  // fire (eg, if this WatchSet was given two different sha1 for the same file).
  self.alwaysFire = false;

  // Map from the absolute path to a file, to a sha1 hash, or null if the file
  // should not exist. A Watcher created from this set fires when the file
  // changes from that sha, or is deleted (if non-null) or created (if null).
  //
  // Note that Isopack.getSourceFilesUnderSourceRoot() depends on this field
  // existing (it's not just an internal implementation detail of watch.js).
  self.files = {};

  // Array of object with keys:
  // - 'absPath': absolute path to a directory
  // - 'include': array of RegExps
  // - 'exclude': array of RegExps
  // - 'contents': array of strings, or null if the directory should not exist
  //
  // This represents the assertion that 'absPath' is a directory and that
  // 'contents' is its immediate contents, as filtered by the regular
  // expressions.  Entries in 'contents' are file and subdirectory names;
  // directory names end with '/'. 'contents' is sorted. An entry is in
  // 'contents' if its value (including the slash, for directories) matches at
  // least one regular expression in 'include' and no regular expressions in
  // 'exclude'.
  //
  // There is no recursion here: files contained in subdirectories never appear.
  //
  // A directory may have multiple entries (presumably with different
  // include/exclude filters).
  self.directories = [];
};

_.extend(WatchSet.prototype, {
  addFile: function (filePath, hash) {
    var self = this;
    // No need to update if this is in always-fire mode already.
    if (self.alwaysFire)
      return;
    if (_.has(self.files, filePath)) {
      // Redundant?
      if (self.files[filePath] === hash)
        return;
      // Nope, inconsistent.
      self.alwaysFire = true;
      return;
    }
    self.files[filePath] = hash;
  },

  // Takes options absPath, include, exclude, and contents, as described
  // above. contents does not need to be pre-sorted.
  addDirectory: function (options) {
    var self = this;
    if (self.alwaysFire)
      return;
    if (_.isEmpty(options.include))
      return;
    var contents = _.clone(options.contents);
    if (contents)
      contents.sort();

    self.directories.push({
      absPath: options.absPath,
      include: options.include,
      exclude: options.exclude,
      contents: contents
    });
  },

  // Merges another WatchSet into this one. This one will now fire if either
  // WatchSet would have fired.
  merge: function (other) {
    var self = this;
    if (self.alwaysFire)
      return;
    if (other.alwaysFire) {
      self.alwaysFire = true;
      return;
    }
   _.each(other.files, function (hash, name) {
     self.addFile(name, hash);
   });
    _.each(other.directories, function (dir) {
      // XXX this doesn't deep-clone the directory, but I think these objects
      // are never mutated #WatchSetShallowClone
      self.directories.push(dir);
    });
  },

  clone: function () {
    var self = this;
    var ret = new WatchSet();

    // XXX doesn't bother to deep-clone the directory info
    // #WatchSetShallowClone
    ret.alwaysFire = self.alwaysFire;
    ret.files = _.clone(self.files);
    ret.directories = _.clone(self.directories);
    return ret;
  },

  toJSON: function () {
    var self = this;
    if (self.alwaysFire)
      return {alwaysFire: true};
    var ret = {files: self.files};

    var reToJSON = function (r) {
      var options = '';
      if (r.ignoreCase)
        options += 'i';
      if (r.multiline)
        options += 'm';
      if (r.global)
        options += 'g';
      if (options)
        return {$regex: r.source, $options: options};
      return r.source;
    };

    ret.directories = _.map(self.directories, function (d) {
      return {
        absPath: d.absPath,
        include: _.map(d.include, reToJSON),
        exclude: _.map(d.exclude, reToJSON),
        contents: d.contents
      };
    });

    return ret;
  }
});

WatchSet.fromJSON = function (json) {
  var set = new WatchSet();

  if (! json)
    return set;

  if (json.alwaysFire) {
    set.alwaysFire = true;
    return set;
  }

  set.files = _.clone(json.files);

  var reFromJSON = function (j) {
    if (_.has(j, '$regex'))
      return new RegExp(j.$regex, j.$options);
    return new RegExp(j);
  };

  set.directories = _.map(json.directories, function (d) {
    return {
      absPath: d.absPath,
      include: _.map(d.include, reFromJSON),
      exclude: _.map(d.exclude, reFromJSON),
      contents: d.contents
    };
  });

  return set;
};

var readFile = function (absPath) {
  try {
    return files.readFile(absPath);
  } catch (e) {
    // Rethrow most errors.
    if (! e || (e.code !== 'ENOENT' && e.code !== 'EISDIR'))
      throw e;
    // File does not exist (or is a directory).
    return null;
  }
};

var sha1 = function (contents) {
  var crypto = require('crypto');
  var hash = crypto.createHash('sha1');
  hash.update(contents);
  return hash.digest('hex');
};

var readDirectory = function (options) {
  // Read the directory.
  try {
    var contents = files.readdir(options.absPath);
  } catch (e) {
    // If the path is not a directory, return null; let other errors through.
    if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR'))
      return null;
    throw e;
  }

  // Add slashes to the end of directories.
  var contentsWithSlashes = [];
  _.each(contents, function (entry) {
    try {
      // We do stat instead of lstat here, so that we treat symlinks to
      // directories just like directories themselves.
      // XXX Does the treatment of symlinks make sense?
      var stats = files.stat(files.pathJoin(options.absPath, entry));
    } catch (e) {
      if (e && (e.code === 'ENOENT')) {
        // Disappeared after the readdir (or a dangling symlink)? Eh,
        // pretend it was never there in the first place.
        return;
      }
      throw e;
    }
    if (stats.isDirectory())
      entry += '/';
    contentsWithSlashes.push(entry);
  });

  // Filter based on regexps.
  var filtered = _.filter(contentsWithSlashes, function (entry) {
    return _.any(options.include, function (re) {
      return re.test(entry);
    }) && ! _.any(options.exclude, function (re) {
      return re.test(entry);
    });
  });

  // Sort it!
  filtered.sort();
  return filtered;
};

// All fields are private.
var Watcher = function (options) {
  var self = this;

  // The set to watch.
  self.watchSet = options.watchSet;
  if (! self.watchSet)
    throw new Error("watchSet option is required");

  // Function to call when a change is detected according to one of
  // the above.
  self.onChange = options.onChange;
  if (! self.onChange)
    throw new Error("onChange option is required");

  self.stopped = false;
  self.justCheckOnce = !! options._justCheckOnce;

  self.watches = {
    // <absolute path of watched file or directory>: {
    //   // Null until pathwatcher.watch succeeds in watching the file.
    //   watcher: <object returned by pathwatcher.watch> | null,
    //   // Undefined until we stat the file for the first time, then null
    //   // if the file is observed to be missing.
    //   lastStat: <object returned by files.stat> | null | undefined
    // }
  };

  // Were we given an inconsistent WatchSet? Fire now and be done with it.
  if (self.watchSet.alwaysFire) {
    self._fire();
    return;
  }

  self._startFileWatches();
  self._checkDirectories();
};

_.extend(Watcher.prototype, {
  _fireIfFileChanged: function (absPath) {
    var self = this;

    if (self.stopped)
      return true;

    var oldHash = self.watchSet.files[absPath];

    if (oldHash === undefined)
      throw new Error("Checking unknown file " + absPath);

    var contents = readFile(absPath);

    if (contents === null) {
      // File does not exist (or is a directory).
      // Is this what we expected?
      if (oldHash === null)
        return false;
      // Nope, not what we expected.
      self._fire();
      return true;
    }

    // File exists! Is that what we expected?
    if (oldHash === null) {
      self._fire();
      return true;
    }

    var newHash = sha1(contents);

    // Unchanged?
    if (newHash === oldHash)
      return false;

    self._fire();
    return true;
  },

  _fireIfDirectoryChanged: function (info) {
    var self = this;

    if (self.stopped)
      return true;

    var newContents = readDirectory({
      absPath: info.absPath,
      include: info.include,
      exclude: info.exclude
    });

    // If the directory has changed (including being deleted or created).
    if (! _.isEqual(info.contents, newContents)) {
      self._fire();
      return true;
    }

    return false;
  },

  _startFileWatches: function () {
    var self = this;

    // Set up a watch for each file
    _.each(self.watchSet.files, function (hash, absPath) {
      if (self.stopped)
        return;

      if (! self.justCheckOnce)
        self._watchFileOrDirectory(absPath);

      // Check for the case where by the time we created the watch,
      // the file had already changed from the sha we were provided.
      self._fireIfFileChanged(absPath);
    });
  },

  _watchFileOrDirectory: function (absPath) {
    var self = this;

    if (! _.has(self.watches, absPath)) {
      self.watches[absPath] = {
        watcher: null,
        // Initially undefined (instead of null) to indicate we have never
        // called files.stat on this file before.
        lastStat: undefined
      };
    }

    var entry = self.watches[absPath];
    if (entry.watcher) {
      // Already watching this path.
      return;
    }

    if (files.exists(absPath)) {
      if (self._mustNotExist(absPath)) {
        self._fire();
        return;
      }

      var onWatchEvent = self._makeWatchEventCallback(absPath);
      entry.watcher = pathwatcher.watch(absPath, onWatchEvent);

      // If we successfully created the watcher, invoke the callback
      // immediately, so that we examine this file at least once.
      onWatchEvent();

    } else {
      if (self._mustBeAFile(absPath)) {
        self._fire();
        return;
      }

      var parentDir = files.pathDirname(absPath);
      if (parentDir === absPath) {
        throw new Error("Unable to watch parent directory of " + absPath);
      }

      self._watchFileOrDirectory(parentDir);
    }
  },

  _makeWatchEventCallback: function (absPath) {
    var self = this;

    // Sometimes we receive a rapid succession of change events, perhaps
    // because several files were modified at once (e.g. by git reset
    // --hard), or a file was deleted and then recreated by an editor like
    // Vim. Because detecting changes can be costly, and because we care
    // most about the settled state of the file system, we use the
    // funcUtils.coalesce helper to delay calls to the callback by 100ms,
    // canceling any additional calls if they happen within that window of
    // time, so that a rapid succession of calls will tend to trigger only
    // one inspection of the file system.
    return require('./func-utils.js').coalesce(100, function onWatchEvent() {
      if (self.stopped) {
        return;
      }

      // This helper method will call self._fire() if the old and new stat
      // objects have different types (missing, file, or directory), so we
      // can assume they have the same type for the rest of this method.
      var stat = self._updateStatForWatch(absPath);
      if (self.stopped) {
        return;
      }

      if (stat === null || stat.isFile()) {
        if (_.has(self.watchSet.files, absPath)) {
          self._fireIfFileChanged(absPath);
          // XXX #3335 We probably should check again in a second, due to low
          // filesystem modtime resolution.
        }

      } else if (stat.isDirectory()) {
        try {
          var dirFiles = files.readdir(absPath);
        } catch (err) {
          if (err.code === "ENOENT" ||
              err.code === "ENOTDIR") {
            // The directory was removed or changed type since we called
            // self._updateStatForWatch, so we fire unconditionally.
            self._fire();
            return;
          }
          throw err;
        }

        _.each(dirFiles, function(file) {
          var fullPath = files.pathJoin(absPath, file);

          // Recursively watch new files, if we ever previously tried to
          // watch them. Recall that when we attempt to watch a
          // non-existent file, we actually watch the closest enclosing
          // directory that exists, so once the file (and/or any
          // intermediate directories) are created, we begin watching
          // those directories in response to change events fired for
          // directories we're already watching.
          if (_.has(self.watches, fullPath)) {
            self._watchFileOrDirectory(fullPath);
          }
        });

        // If self.watchSet.directories contains any entries for the
        // directory we are examining, call self._fireIfDirectoryChanged.
        _.some(self.watchSet.directories, function(info) {
          return self.stopped ||
            (absPath === info.absPath &&
             self._fireIfDirectoryChanged(info, true));
          // XXX #3335 We probably should check again in a second, due to low
          // filesystem modtime resolution.
        });
      }
    });
  },

  _mustNotExist: function(absPath) {
    var wsFiles = this.watchSet.files;
    if (_.has(wsFiles, absPath))
      return wsFiles[absPath] === null;
    return false;
  },

  _mustBeAFile: function(absPath) {
    var wsFiles = this.watchSet.files;
    if (_.has(wsFiles, absPath))
      return _.isString(wsFiles[absPath]);
    return false;
  },

  _updateStatForWatch: function(absPath) {
    var self = this;
    var entry = self.watches[absPath];
    var lastStat = entry.lastStat;

    try {
      var stat = files.stat(absPath);
    } catch (err) {
      stat = null;
      if (err.code !== "ENOENT") {
        throw err;
      }
    }

    var mustNotExist = self._mustNotExist(absPath);
    var mustBeAFile = self._mustBeAFile(absPath);

    if (stat && lastStat === undefined) {
      // We have not checked for this file before, so our expectations are
      // somewhat relaxed (namely, we don't care about lastStat), but
      // self._fire() might still need to be called if self.watchSet.files
      // has conflicting expectations.
      if (stat.isFile()) {
        if (mustNotExist) {
          self._fire();
        }
      } else if (stat.isDirectory()) {
        if (mustNotExist || mustBeAFile) {
          self._fire();
        }
      } else {
        // Neither a file nor a directory, so treat as non-existent.
        stat = null;
        if (mustBeAFile) {
          self._fire();
        }
      }

      // We have not checked for this file before, so just record the new
      // stat object.
      entry.lastStat = stat;

    } else if (stat && stat.isFile()) {
      entry.lastStat = stat;
      if (! lastStat || ! lastStat.isFile()) {
        self._fire();
      }

    } else if (stat && stat.isDirectory()) {
      entry.lastStat = stat;
      if (! lastStat || ! lastStat.isDirectory()) {
        self._fire();
      }

    } else {
      entry.lastStat = stat = null;
      if (lastStat) {
        self._fire();
      }
    }

    return stat;
  },

  _checkDirectories: function () {
    var self = this;

    if (self.stopped)
      return;

    _.each(self.watchSet.directories, function (info) {
      if (self.stopped)
        return;

      if (! self.justCheckOnce)
        self._watchFileOrDirectory(info.absPath);

      // Check for the case where by the time we created the watch, the
      // directory has already changed.
      self._fireIfDirectoryChanged(info);
    });
  },

  _fire: function () {
    var self = this;

    if (self.stopped)
      return;

    self.stop();
    self.onChange();
  },

  stop: function () {
    var self = this;
    self.stopped = true;

    // Clean up file watches
    _.each(self.watches, function (entry) {
      if (entry.watcher) {
        entry.watcher.close();
        entry.watcher = null;
      }
    });
    self.watches = {};
  }
});

// Given a WatchSet, returns true if it currently describes the state of the
// disk.
var isUpToDate = function (watchSet) {
  var upToDate = true;
  var watcher = new Watcher({
    watchSet: watchSet,
    onChange: function () {
      upToDate = false;
    },
    // internal flag which prevents us from starting watches and timers that
    // we're about to cancel anyway
    _justCheckOnce: true
  });
  watcher.stop();
  return upToDate;
};

// Options should have absPath/include/exclude.
var readAndWatchDirectory = function (watchSet, options) {
  var contents = readDirectory(options);
  watchSet.addDirectory(_.extend({contents: contents}, options));
  return contents;
};

// Calculating the sha hash can be expensive for large files.  By
// returning the calculated hash along with the file contents, the
// hash doesn't need to be calculated again for static files.
//
// We only calculate the hash if needed here, so callers must not
// *rely* on the hash being returned; merely that if the hash is
// present, it is the correct hash of the contents.
var readAndWatchFileWithHash = function (watchSet, absPath) {
  var contents = readFile(absPath);
  var hash = null;
  // Allow null watchSet, if we want to use readFile-style error handling in a
  // context where we might not always have a WatchSet (eg, reading
  // settings.json where we watch for "meteor run" but not for "meteor deploy").
  if (watchSet) {
    hash = contents === null ? null : sha1(contents);
    watchSet.addFile(absPath, hash);
  }
  return {contents: contents, hash: hash};
};

var readAndWatchFile = function (watchSet, absPath) {
  return readAndWatchFileWithHash(watchSet, absPath).contents;
};

_.extend(exports, {
  WatchSet: WatchSet,
  Watcher: Watcher,
  readDirectory: readDirectory,
  isUpToDate: isUpToDate,
  readAndWatchDirectory: readAndWatchDirectory,
  readAndWatchFile: readAndWatchFile,
  readAndWatchFileWithHash: readAndWatchFileWithHash,
  sha1: sha1
});
