var fs = require("fs");
var path = require("path");
var crypto = require('crypto');
var _ = require('underscore');

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
// Options may include
// - files: see self.files comment below
// - directories: see self.directories comment below
// - onChange: the function to call when the first change is detected
//
var Watcher = function (options) {
  var self = this;

  // Map from the absolute path to a file, to a sha1 hash. Fire when
  // the file changes from that sha.
  self.files = options.files || {};

  // Map from an absolute path to a directory, to an object with keys
  // 'include' and 'exclude', both lists of regular expressions. Fire
  // when a file is added to that directory whose name matches at
  // least one regular expression in 'include' and no regular
  // expressions in 'exclude'. Subdirectories are included
  // recursively, but not subdirectories that match 'exclude'. The
  // most specific rule wins, so you can change the parameters in
  // effect in subdirectories simply by specifying additional rules.
  self.directories = options.directories || {};

  // Function to call when a change is detected according to one of
  // the above.
  self.onChange = options.onChange;
  if (! self.onChange)
    throw new Error("onChange option is required");

  // self.directories in a different form. It's an array of objects,
  // each with keys 'dir', 'include', 'options', where path is
  // guaranteed to not contain a trailing slash (unless it is the root
  // directory) and the objects are sorted from longest path to
  // shortest (that is, most specific rule to least specific.)
  self.rules = _.map(self.directories, function (options, dir) {
    return {
      dir: path.resolve(dir),
      include: options.include || [],
      exclude: options.exclude || []
    };
  });
  self.rules = self.rules.sort(function (a, b) {
    return a.dir.length < b.dir.length ? 1 : -1;
  });

  self.stopped = false;
  self.fileWatches = []; // array of paths
  self.directoryWatches = {}; // map from path to watch object

  self._startFileWatches();
  _.each(self.rules, function (rule) {
    self._watchDirectory(rule.dir);
  });
};

_.extend(Watcher.prototype, {
  _checkFileChanged: function (absPath) {
    var self = this;

    if (! fs.existsSync(absPath))
      return true;

    var hasher = crypto.createHash('sha1');
    hasher.update(fs.readFileSync(absPath));
    var hash = hasher.digest('hex');

    return (self.files[absPath] !== hash);
  },

  _startFileWatches: function () {
    var self = this;

    // Set up a watch for each file
    _.each(self.files, function (hash, absPath) {
      // Intentionally not using fs.watch since it doesn't play well with
      // vim (https://github.com/joyent/node/issues/3172)
      // Note that we poll very frequently (500 ms)
      fs.watchFile(absPath, {interval: 500}, function () {
        // Fire only if the contents of the file actually changed (eg,
        // maybe just its atime changed)
        if (self._checkFileChanged(absPath))
          self._fire();
      });
      self.fileWatches.push(absPath);

      // Check for the case where by the time we created the watch,
      // the file had already changed from the sha we were provided.
      if (self._checkFileChanged(absPath))
        self._fire();
    });

    // One second later, check the files again, because fs.watchFile
    // is actually implemented by polling the file's mtime, and some
    // filesystems (OSX HFS+) only keep mtimes to a resolution of one
    // second. This handles the case where we check the hash and set
    // up the watch, but then the file change before the clock rolls
    // over to the next second, and fs.watchFile doesn't notice and
    // doesn't call us back. #WorkAroundLowPrecisionMtimes
    setTimeout(function () {
      _.each(self.files, function (hash, absPath) {
        if (self._checkFileChanged(absPath))
          self._fire();
      });
    }, 1000);
  },

  // Pass true for `include` to include everything (and process only
  // excludes)
  _matches: function (filename, include, exclude) {
    var self = this;

    if (include === true)
      include = [/.?/];
    for (var i = 0; i < include.length; i++)
      if (include[i].test(filename))
        break;
    if (i === include.length) {
      return false; // didn't match any includes
    }

    for (var i = 0; i < exclude.length; i++) {
      if (exclude[i].test(filename)) {
        return false; // matched an exclude
      }
    }

    // Matched an include and didn't match any excludes
    return true;
  },

  _watchDirectory: function (absPath) {
    var self = this;

    if (absPath in self.directoryWatches)
      // Already being taken care of
      return;

    // Determine the options that apply to this directory by finding
    // the most specific rule.
    absPath = path.resolve(absPath); // ensure no trailing slash
    for (var i = 0; i < self.rules.length; i++) {
      var rule = self.rules[i];
      if (absPath.length >= rule.dir.length &&
          absPath.substr(0, rule.dir.length) === rule.dir)
        break; // found a match
      rule = null;
    }
    if (! rule)
      // Huh, doesn't appear that we're supposed to be watching this
      // directory.
      return;

    var contents = [];
    var scanDirectory = function (isDoubleCheck) {
      if (self.stopped)
        return;

      if (! fs.existsSync(absPath)) {
        // Directory was removed. Stop watching.
        var watch = self.directoryWatches[absPath];
        watch && watch.close();
        delete self.directoryWatches[absPath];
        return;
      }

      // Find previously unknown files and subdirectories. (We don't
      // care about removed subdirectories because the logic
      // immediately above handles them, and we don't care about
      // removed files because the ones we care about will already
      // have file watches on them.)
      var newContents = fs.readdirSync(absPath);
      var added = _.difference(newContents, contents);
      contents = newContents;

      // Look at each newly added item
      _.each(added, function (addedItem) {
        var addedPath = path.join(absPath, addedItem);

        // Is it a directory?
        try {
          var stats = fs.lstatSync(addedPath);
        } catch (e) {
          // Can't be found? That's weird. Ignore.
          return;
        }
        var isDirectory = stats.isDirectory();

        // Does it match the rule?
        if (! self._matches(addedItem,
                            isDirectory ? true : rule.include,
                            rule.exclude))
          return; // No

        if (! isDirectory) {
          if (! (addedPath in self.files))
            // Found a newly added file that we care about.
            self._fire();
        } else {
          // Found a subdirectory that we care to monitor.
          self._watchDirectory(addedPath);
        }
      });

      if (! isDoubleCheck) {
        // Whenever a directory changes, scan it soon as we notice,
        // but then scan it again one secord later just to make sure
        // that we haven't missed any changes. See commentary at
        // #WorkAroundLowPrecisionMtimes
        setTimeout(function () {
          scanDirectory(true);
        }, 1000);
      }
    };

    // fs.watchFile doesn't work for directories (as tested on ubuntu)
    // Notice that we poll very frequently (500 ms)
    try {
      self.directoryWatches[absPath] =
        fs.watch(absPath, {interval: 500}, scanDirectory);
      scanDirectory();
    } catch (e) {
      // Can happen if the directory doesn't exist, say because a
      // nonexistent path was included in self.directories
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

    // Clean up file watches
    _.each(self.fileWatches, function (absPath) {
      fs.unwatchFile(absPath);
    });
    self.fileWatches = [];

    // Clean up directory watches
    _.each(self.directoryWatches, function (watch) {
      watch.close();
    });
    self.directoryWatches = {};
  }
});

exports.Watcher = Watcher;
