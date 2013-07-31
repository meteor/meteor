var fs = require("fs");
var path = require("path");
var _ = require('underscore');

// XXX XXX redo this doc


// Watch for changes to a set of files, and the first time that any of
// the files change, call a user-provided callback. (If you want a
// second callback, you'll need to create a second Watcher.)
//
// You can set up two kinds of watches, file and directory watches.
//
// In a file watch, you provide an absolute path to a file and a SHA1
// (encoded as hex) of the contents of that file. If the file ever
// changes so that its contents no longer match that SHA1, the
// callback triggers.
//
// In a directory watch, you provide an absolute path to a directory
// and two lists of regular expressions specifying the files to
// include or exclude. If there is ever a file in the directory or its
// children that matches the criteria set up by the regular
// expressions, but that IS NOT present as a file watch, then the
// callback triggers.
//
// For directory watches, the regular expressions work as follows. You
// provide two arrays of regular expressions, an include list and an
// exclude list. A file in the directory matches if it matches at
// least one regular expression in the include list, and doesn't match
// any regular expressions in the exclude list. Subdirectories are
// included recursively, as long as their names do not match any
// regular expression in the exclude list.
//
// When multiple directory watches are set up, say on a directory A
// and its subdirectory B, the most specific watch takes precedence in
// each directory. So only B's include/exclude lists will be checked
// in B.
//
// Regular expressions are checked only against individual path
// components (the actual name of the file or the subdirectory), not
// against the entire path.
//
// You can call stop() to stop watching and tear down the
// watcher. Calling stop() guarantees that you will not receive a
// callback (if you have not already.) Calling stop() is unnecessary
// if you've received a callback.
//
// A limitation of the current implementation is that if you set up a
// directory watch on a directory A, and A does not exist at the time
// the Watcher is created but is then created later, then A will not
// be monitored. (Of course, this limitation only applies to the roots
// of the directory watches. If A exists at the time the watch is
// created, and a subdirectory B is later created, it will be properly
// detected. Likewise if A exists and is then deleted it will be
// detected.)
//
// To do a "one-shot" (to see if any files have been modified,
// compared to the dependencies, at a particular point in time, just
// create a Watcher and see if your onChange function was called
// before the Watcher constructor changed. (Then call stop() as
// usual.)
//
// XXX This should be reengineered so that dependency information from
// multiple sources can be easily merged in a generic way. Possibly in
// this new model subdirectories would be allowed in include/exclude
// patterns, and multiple directory rules would be OR'd rather than
// taking the most specific rule.
//
// Options may include
// - files: see self.files comment below
// - directories: see self.directories comment below
// - onChange: the function to call when the first change is detected.
//   received one argument, the absolute path to a changed or removed
//   file (potentially not the only one that changed or was removed)
//

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
  // - 'contents': array of strings
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
    var contents = _.clone(options.contents || []);
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
  if (json.alwaysFire) {
    set.alwaysFire = true;
    return set;
  }

  set.files = _.clone(json.files);

  var reFromJSON = function (j) {
    if (j.$regex)
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
  // Read the directory.
  try {
    var contents = fs.readdirSync(options.absPath);
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
      var stats = fs.statSync(path.join(options.absPath, entry));
    } catch (e) {
      // Disappeared after the readdirSync (or a dangling symlink)? Eh, pretend
      // it was never there in the first place.
      return;
    }
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

  self.fileWatches = []; // array of paths
  self.directoryWatches = []; // array of watch object

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
  self._startDirectoryWatches();
};

_.extend(Watcher.prototype, {
  _fireIfFileChanged: function (absPath) {
    var self = this;

    if (self.stopped)
      return true;

    var oldHash = self.watchSet.files[absPath];

    if (oldHash === undefined)
      throw new Error("Checking unknown file " + absPath);

    try {
      var contents = fs.readFileSync(absPath);
    } catch (e) {
      // Rethrow most errors.
      if (!e || (e.code !== 'ENOENT' && e.code !== 'EISDIR'))
        throw e;
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

    var crypto = require('crypto');
    var hasher = crypto.createHash('sha1');
    hasher.update(contents);
    var newHash = hasher.digest('hex');

    // Unchanged?
    if (newHash === oldHash)
      return false;

    self._fire();
    return true;
  },

  _fireIfDirectoryChanged: function (info, isDoubleCheck) {
    var self = this;

    if (self.stopped)
      return true;

    var newContents = exports.readDirectory({
      absPath: info.absPath,
      include: info.include,
      exclude: info.exclude
    });

    // If newContents is null (no directory) or the directory has changed, fire.
    if (!_.isEqual(info.contents, newContents)) {
      self._fire();
      return true;
    }

    if (!isDoubleCheck) {
      // Whenever a directory changes, scan it soon as we notice,
      // but then scan it again one secord later just to make sure
      // that we haven't missed any changes. See commentary at
      // #WorkAroundLowPrecisionMtimes
      // XXX not sure why this uses a different strategy than files
      var timerId = self.nextTimerId++;
      self.timers[timerId] = setTimeout(function () {
        delete self.timers[timerId];
        if (! self.stopped)
          self._fireIfDirectoryChanged(info, true);
      }, 1000);
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

    if (self.stopped)
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

  _startDirectoryWatches: function () {
    var self = this;

    // Set up a watch for each directory
    _.each(self.watchSet.directories, function (info) {
      if (self.stopped)
        return;

      // Check for the case where by the time we created the watch, the
      // directory has already changed.
      if (self._fireIfDirectoryChanged(info))
        return;

      // fs.watchFile doesn't work for directories (as tested on ubuntu)
      // Notice that we poll very frequently (500 ms)
      try {
        self.directoryWatches.push(
          fs.watch(info.absPath, {interval: 500}, function () {
            self._fireIfDirectoryChanged(info);
          })
        );
      } catch (e) {
        // Can happen if the directory doesn't exist, in which case we should
        // fire.
        if (e && e.code === "ENOENT") {
          self._fire();
          return;
        }
        throw e;
      }
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

    // Clean up directory watches
    _.each(self.directoryWatches, function (watch) {
      watch.close();
    });
    self.directoryWatches = [];
  }
});

_.extend(exports, {
  WatchSet: WatchSet,
  Watcher: Watcher,
  readDirectory: readDirectory
});
