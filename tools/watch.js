var fs = require("fs");
var path = require("path");
var _ = require('underscore');
var Future = require('fibers/future');
var fiberHelpers = require('./fiber-helpers.js');

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
      // are never mutated
      self.directories.push(dir);
    });
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
  var set = new WatchSet;

  if (!json)
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

var readDirectory = function (options) {
  var yielding = !!options._yielding;
  // Read the directory.
  try {
    var contents = readdirSyncOrYield(options.absPath, yielding);
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
      var stats = statSyncOrYield(path.join(options.absPath, entry), yielding);
    } catch (e) {
      if (e && (e.code === 'ENOENT')) {
        // Disappeared after the readdirSync (or a dangling symlink)? Eh,
        // pretend it was never there in the first place.
        return;
      }
      throw e;
    }
    // XXX if we're on windows, I guess it's possible for files to end with '/'.
    if (stats.isDirectory())
      entry += '/';
    contentsWithSlashes.push(entry);
  });

  // Filter based on regexps.
  var filtered = _.filter(contentsWithSlashes, function (entry) {
    return _.any(options.include, function (re) {
      return re.test(entry);
    }) && !_.any(options.exclude, function (re) {
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
  self.justCheckOnce = !!options._justCheckOnce;

  self.fileWatches = []; // array of paths

  // We track all of the currently active timers so that we can cancel
  // them at stop() time. This stops the process from hanging at
  // shutdown until all of the timers have fired. An alternate
  // approach would be to use the unref() timer handle method present
  // in modern node.
  var nextTimerId = 1;
  self.timers = {}; // map from arbitrary number (nextTimerId) to timer handle

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

  _fireIfDirectoryChanged: function (info, yielding) {
    var self = this;

    if (self.stopped)
      return true;

    var newContents = exports.readDirectory({
      absPath: info.absPath,
      include: info.include,
      exclude: info.exclude,
      _yielding: yielding
    });

    // If the directory has changed (including being deleted or created).
    if (!_.isEqual(info.contents, newContents)) {
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

      // Check for the case where by the time we created the watch,
      // the file had already changed from the sha we were provided.
      if (self._fireIfFileChanged(absPath))
        return;

      if (self.justCheckOnce)
        return;

      // Intentionally not using fs.watch since it doesn't play well with
      // vim (https://github.com/joyent/node/issues/3172)
      // Note that we poll very frequently (500 ms)
      fs.watchFile(absPath, {interval: 500}, function () {
        // Fire only if the contents of the file actually changed (eg,
        // maybe just its atime changed)
        self._fireIfFileChanged(absPath);
      });
      self.fileWatches.push(absPath);
    });

    if (self.stopped || self.justCheckOnce)
      return;

    // One second later, check the files again, because fs.watchFile
    // is actually implemented by polling the file's mtime, and some
    // filesystems (OSX HFS+) only keep mtimes to a resolution of one
    // second. This handles the case where we check the hash and set
    // up the watch, but then the file change before the clock rolls
    // over to the next second, and fs.watchFile doesn't notice and
    // doesn't call us back. #WorkAroundLowPrecisionMtimes
    var timerId = self.nextTimerId++;
    self.timers[timerId] = setTimeout(function () {
      delete self.timers[timerId];
      _.each(self.watchSet.files, function (hash, absPath) {
        self._fireIfFileChanged(absPath);
      });
    }, 1000);
  },

  _checkDirectories: function (yielding) {
    var self = this;

    // fs.watchFile doesn't work for directories (as tested on ubuntu)
    // and fs.watch has serious issues on MacOS (at least in node 0.10)
    // https://github.com/meteor/meteor/issues/1483
    // https://groups.google.com/forum/#!topic/meteor-talk/Zy1XxEcxe8o
    // https://github.com/joyent/node/issues/5463
    // https://github.com/joyent/libuv/commit/38df93cf
    //
    // Instead, just check periodically with setTimeout.  (We use setTimeout to
    // ensure that there is a 500 ms pause between the *end* of one poll cycle
    // and the *beginning* of another instead of using setInterval which still
    // can lead to permanent 100% CPU usage.) When node has a stable directory
    // watching API that is more efficient than just polling, look at the
    // history for this file around release 0.6.5 for a version that uses
    // fs.watch.

    if (self.stopped)
      return;

    _.each(self.watchSet.directories, function (info) {
      if (self.stopped)
        return;

      // Check for the case where by the time we created the watch, the
      // directory has already changed.
      if (self._fireIfDirectoryChanged(info, yielding))
        return;
    });

    if (!self.stopped && !self.justCheckOnce) {
      setTimeout(fiberHelpers.inFiber(function () {
        self._checkDirectories(true);
      }), 500);
    }
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

    // Clean up timers
    _.each(self.timers, function (timer, id) {
      clearTimeout(timer);
    });
    self.timers = {};

    // Clean up file watches
    _.each(self.fileWatches, function (absPath) {
      fs.unwatchFile(absPath);
    });
    self.fileWatches = [];
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

var readFile = function (absPath) {
  try {
    return fs.readFileSync(absPath);
  } catch (e) {
    // Rethrow most errors.
    if (!e || (e.code !== 'ENOENT' && e.code !== 'EISDIR'))
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

// XXX We should eventually rewrite the whole meteor tools to use yielding fs
// calls instead of sync (so that meteor is responsive to C-c during bundling,
// so that the proxy accepts connections, etc) but we don't want to do this in
// the point release in which we are adding these functions.
var readdirSyncOrYield = function (path, yielding) {
  if (yielding) {
    return Future.wrap(fs.readdir)(path).wait();
  } else {
    return fs.readdirSync(path);
  }
};
var statSyncOrYield = function (path, yielding) {
  if (yielding) {
    return Future.wrap(fs.stat)(path).wait();
  } else {
    return fs.statSync(path);
  }
};

_.extend(exports, {
  WatchSet: WatchSet,
  Watcher: Watcher,
  readDirectory: readDirectory,
  isUpToDate: isUpToDate,
  readAndWatchDirectory: readAndWatchDirectory,
  readAndWatchFile: readAndWatchFile,
  readAndWatchFileWithHash: readAndWatchFileWithHash
});
